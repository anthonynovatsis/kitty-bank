import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

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

export type SettleableType = "deposit" | "withdrawal" | "transfer";

export type CashMovement = {
  transactionType: SettleableType;
  /** The account the row is anchored to; the source account for transfers. */
  cashAccountId: string;
  fromAccountId: string | null;
  toAccountId: string | null;
  amount: number;
};

/**
 * Balances are stored as SQLite REAL. Round every write to cents so repeated
 * deposits and withdrawals can't accumulate binary-floating-point drift.
 */
export function roundToCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/** Cent-level tolerance so a float remainder can't block an exact-balance withdrawal. */
const EPSILON = 1e-9;

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
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Cash account not found",
    });
  }

  return account;
}

export function assertActive(account: { accountName: string; status: string }) {
  if (account.status !== "active") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Account "${account.accountName}" is closed`,
    });
  }
}

export function assertSufficientFunds(
  account: { accountName: string; balance: number },
  amount: number,
) {
  if (account.balance + EPSILON < amount) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Insufficient funds in "${account.accountName}": balance ${account.balance.toFixed(
        2,
      )}, required ${amount.toFixed(2)}`,
    });
  }
}

async function setBalance(tx: Transaction, accountId: string, balance: number) {
  await tx
    .update(cashAccounts)
    .set({ balance: roundToCents(balance) })
    .where(eq(cashAccounts.id, accountId));
}

/**
 * Apply a transaction's effect to account balances.
 *
 * Re-reads and re-validates the accounts, so it is safe to call at approval
 * time: a pending withdrawal does *not* reserve funds, and the account may have
 * been drained or closed while the request sat in the queue.
 */
export async function settleCashMovement(
  tx: Transaction,
  movement: CashMovement,
) {
  const amount = roundToCents(movement.amount);

  switch (movement.transactionType) {
    case "deposit": {
      const account = await loadCashAccount(tx, movement.cashAccountId);
      assertActive(account);
      await setBalance(tx, account.id, account.balance + amount);
      return;
    }

    case "withdrawal": {
      const account = await loadCashAccount(tx, movement.cashAccountId);
      assertActive(account);
      assertSufficientFunds(account, amount);
      await setBalance(tx, account.id, account.balance - amount);
      return;
    }

    case "transfer": {
      const { fromAccountId, toAccountId } = movement;
      if (!fromAccountId || !toAccountId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Transfer is missing its source or destination account",
        });
      }

      const from = await loadCashAccount(tx, fromAccountId);
      const to = await loadCashAccount(tx, toAccountId);
      assertActive(from);
      assertActive(to);
      assertSufficientFunds(from, amount);

      await setBalance(tx, from.id, from.balance - amount);
      await setBalance(tx, to.id, to.balance + amount);
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
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Cannot settle a "${transactionType}" transaction`,
    });
  }
}
