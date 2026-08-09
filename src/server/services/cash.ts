import { TRPCError } from "@trpc/server";
import { and, eq, gte, sql, type SQL } from "drizzle-orm";

import { formatCents, type Cents } from "~/lib/money";
import type { Transaction } from "~/server/db";
import { cashAccounts, userSettings } from "~/server/db/schema";

/**
 * Cash movement rules shared by both halves of the approval workflow:
 * `user.cash.*` settles immediately for trusted users, and
 * `admin.transactions.approve` settles a row that was queued earlier. Keeping
 * the money movement here means both paths validate and round identically.
 *
 * Everything takes an open `Transaction` — a transfer must never be able to
 * debit without crediting, so callers wrap these in `db.transaction()`.
 */

/**
 * Why a cash operation was refused.
 *
 * A single procedure can fail several ways that share one tRPC code —
 * `user.cash.transfer` alone has four BAD_REQUESTs — so callers that need to
 * tell them apart branch on this rather than parsing message strings.
 */
export type CashErrorKind =
  | "account_not_found"
  | "account_closed"
  | "insufficient_funds"
  | "invalid_transfer"
  | "unsettleable_type"
  | "already_decided";

/** tRPC code per kind. Malformed input is 400; state that forbids the operation is 409. */
const CODE_FOR_KIND = {
  account_not_found: "NOT_FOUND",
  account_closed: "CONFLICT",
  insufficient_funds: "CONFLICT",
  invalid_transfer: "BAD_REQUEST",
  unsettleable_type: "CONFLICT",
  already_decided: "CONFLICT",
} as const;

/**
 * A refusal from the cash rules.
 *
 * This is a plain Error, deliberately: it carries no transport concepts, so the
 * day something outside tRPC calls these helpers it is already the right shape.
 * For now `cashError()` wraps it in a TRPCError for the routers.
 */
export class CashRuleViolation extends Error {
  constructor(
    readonly kind: CashErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "CashRuleViolation";
  }
}

/** Build the TRPCError the routers throw, with the domain error as its cause. */
export function cashError(kind: CashErrorKind, message: string) {
  return new TRPCError({
    code: CODE_FOR_KIND[kind],
    message,
    cause: new CashRuleViolation(kind, message),
  });
}

/**
 * Narrow an unknown error to a cash refusal, optionally of one specific kind.
 * Reads through the TRPCError wrapper, so it works on either form.
 */
export function isCashError(error: unknown, kind?: CashErrorKind): boolean {
  const violation =
    error instanceof CashRuleViolation
      ? error
      : error instanceof TRPCError && error.cause instanceof CashRuleViolation
        ? error.cause
        : null;

  return violation !== null && (kind === undefined || violation.kind === kind);
}

export type SettleableType = "deposit" | "withdrawal" | "transfer";

export type CashMovement = {
  transactionType: SettleableType;
  /** The account the row is anchored to; the source account for transfers. */
  cashAccountId: string;
  fromAccountId: string | null;
  toAccountId: string | null;
  amount: Cents;
};

/** True when this user's transactions have to be approved by an admin. */
export async function requiresApproval(tx: Transaction, userId: string) {
  const settings = await tx.query.userSettings.findFirst({
    where: eq(userSettings.userId, userId),
  });
  // A user with no settings row is untrusted by default.
  return settings?.requiresTransactionApproval ?? true;
}

/** Load a cash account, or fail with NOT_FOUND. */
export async function loadCashAccount(tx: Transaction, accountId: string) {
  const account = await tx.query.cashAccounts.findFirst({
    where: eq(cashAccounts.id, accountId),
  });

  if (!account) {
    throw cashError("account_not_found", "Cash account not found");
  }

  return account;
}

export function assertActive(account: { accountName: string; status: string }) {
  if (account.status !== "active") {
    throw cashError(
      "account_closed",
      `Account "${account.accountName}" is closed`,
    );
  }
}

export function assertSufficientFunds(
  account: { accountName: string; balance: Cents },
  amount: Cents,
) {
  // Exact: both sides are integers, so there is no tolerance to allow for.
  if (account.balance < amount) {
    throw cashError(
      "insufficient_funds",
      `Insufficient funds in "${account.accountName}": balance ${formatCents(
        account.balance,
      )}, required ${formatCents(amount)}`,
    );
  }
}

/**
 * Credit or debit an account's balance, atomically.
 *
 * The arithmetic happens in the database — `balance = balance + ?` — rather
 * than in JavaScript from a value read a moment earlier. A read-modify-write
 * is only safe here because SQLite serialises writers; under a database that
 * allows concurrent writers to read the same row (Postgres at READ COMMITTED,
 * say) two settlements could each read 100, each write 150, and one deposit
 * would silently vanish. No test would catch that, because the suite is
 * single-threaded.
 *
 * `guard` is applied in the same statement as the write, so checking funds and
 * spending them cannot be separated. Returns false when nothing matched.
 */
async function moveBalance(
  tx: Transaction,
  accountId: string,
  direction: "credit" | "debit",
  amount: Cents,
  guard?: SQL,
): Promise<boolean> {
  const result = await tx
    .update(cashAccounts)
    .set({
      balance:
        direction === "credit"
          ? sql`${cashAccounts.balance} + ${amount}`
          : sql`${cashAccounts.balance} - ${amount}`,
    })
    .where(
      and(
        eq(cashAccounts.id, accountId),
        eq(cashAccounts.status, "active"),
        ...(guard ? [guard] : []),
      ),
    );

  return result.rowsAffected > 0;
}

/**
 * Explain why a move matched no rows.
 *
 * Only ever called on the failure path, so the happy path stays a single
 * statement with no read at all. Re-running the assertions here keeps the
 * error `kind`s identical to what callers already branch on.
 */
async function explainFailedMove(
  tx: Transaction,
  accountId: string,
  amount: Cents,
): Promise<never> {
  const account = await loadCashAccount(tx, accountId);
  assertActive(account);
  assertSufficientFunds(account, amount);
  // Active, funded, and still nothing moved: the row changed underneath us.
  throw cashError(
    "insufficient_funds",
    `Could not settle against "${account.accountName}"`,
  );
}

/**
 * Apply a transaction's effect to account balances.
 *
 * Safe to call at approval time: a pending withdrawal does *not* reserve
 * funds, so the account may have been drained or closed while the request sat
 * in the queue. Both conditions are re-checked as part of the write itself.
 */
export async function settleCashMovement(
  tx: Transaction,
  movement: CashMovement,
) {
  const amount = movement.amount;

  switch (movement.transactionType) {
    case "deposit": {
      const moved = await moveBalance(
        tx,
        movement.cashAccountId,
        "credit",
        amount,
      );
      if (!moved) await explainFailedMove(tx, movement.cashAccountId, amount);
      return;
    }

    case "withdrawal": {
      const moved = await moveBalance(
        tx,
        movement.cashAccountId,
        "debit",
        amount,
        gte(cashAccounts.balance, amount),
      );
      if (!moved) await explainFailedMove(tx, movement.cashAccountId, amount);
      return;
    }

    case "transfer": {
      const { fromAccountId, toAccountId } = movement;
      if (!fromAccountId || !toAccountId) {
        throw cashError(
          "invalid_transfer",
          "Transfer is missing its source or destination account",
        );
      }

      /*
       * Debit first, and only credit if it succeeded. Both statements share
       * the caller's transaction, so a failed credit rolls the debit back.
       *
       * Ordering note for a future Postgres migration: two simultaneous
       * transfers in opposite directions can deadlock if they lock rows in
       * different orders. Touching the source first is consistent but not
       * sufficient — sorting by id would be.
       */
      const debited = await moveBalance(
        tx,
        fromAccountId,
        "debit",
        amount,
        gte(cashAccounts.balance, amount),
      );
      if (!debited) await explainFailedMove(tx, fromAccountId, amount);

      const credited = await moveBalance(tx, toAccountId, "credit", amount);
      if (!credited) await explainFailedMove(tx, toAccountId, amount);
      return;
    }
  }
}

/**
 * Narrow a stored transaction type to one this module can settle. `interest`
 * and `fee` exist in the schema for future automated postings and cannot
 * currently be created by any procedure.
 */
export function assertSettleableType(
  transactionType: string,
): asserts transactionType is SettleableType {
  if (
    transactionType !== "deposit" &&
    transactionType !== "withdrawal" &&
    transactionType !== "transfer"
  ) {
    throw cashError(
      "unsettleable_type",
      `Cannot settle a "${transactionType}" transaction`,
    );
  }
}
