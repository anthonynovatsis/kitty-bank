import type { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";

import { cents, type Cents } from "~/lib/money";
import type { Transaction } from "~/server/db";
import { holdings, investmentAccounts } from "~/server/db/schema";
import { defineRuleErrors } from "./errors";

/**
 * Trade rules shared by both halves of the approval workflow:
 * `user.investments.*` settles immediately for trusted users, and
 * `admin.transactions.approve` settles a row that was queued earlier. Keeping
 * the position maths here means both paths validate and round identically.
 *
 * Everything takes an open `Transaction` — a settled trade must never update a
 * holding without its transaction row reaching a terminal status — so callers
 * wrap these in `db.transaction()`.
 *
 * Trades do not move cash. `investment_accounts` has no settlement account, so
 * a buy debits nothing and a sell credits nothing; realised gain is reported on
 * the transaction rather than banked anywhere. See `plans/bank_accounts_plan.md`.
 */

/** Why a trade was refused. */
export type InvestmentErrorKind =
  | "account_not_found"
  | "account_closed"
  | "holding_not_found"
  | "insufficient_shares"
  | "invalid_quantity"
  | "invalid_ratio"
  | "fractional_split"
  | "unsettleable_type"
  | "already_decided"
  | "holding_changed";

/** tRPC code per kind. Malformed input is 400; state that forbids the operation is 409. */
const CODE_FOR_KIND: Record<InvestmentErrorKind, TRPCError["code"]> = {
  account_not_found: "NOT_FOUND",
  account_closed: "CONFLICT",
  holding_not_found: "NOT_FOUND",
  insufficient_shares: "CONFLICT",
  invalid_quantity: "BAD_REQUEST",
  invalid_ratio: "BAD_REQUEST",
  fractional_split: "BAD_REQUEST",
  unsettleable_type: "CONFLICT",
  already_decided: "CONFLICT",
  holding_changed: "CONFLICT",
};

const errors = defineRuleErrors("investments", CODE_FOR_KIND);

/** Build the TRPCError the routers throw, with the domain error as its cause. */
export function investmentError(kind: InvestmentErrorKind, message: string) {
  return errors.error(kind, message);
}

/**
 * Narrow an unknown error to an investment refusal, optionally of one kind.
 * Does not match a cash refusal that happens to share a kind name.
 */
export function isInvestmentError(error: unknown, kind?: InvestmentErrorKind) {
  return errors.is(error, kind);
}

/** The trade types this module can settle. */
export type TradeType = "buy" | "sell";

export type Trade = {
  transactionType: TradeType;
  investmentAccountId: string;
  symbol: string;
  companyName: string | null;
  quantity: number;
  price: Cents;
  brokerage: Cents;
  /** Derived by `tradeAmount` — never taken from the caller. */
  amount: Cents;
  transactionDate: Date;
};

/**
 * Fold case and whitespace so one position cannot become two.
 *
 * There is no securities table to validate against, so "aapl" and " AAPL " have
 * to be recognised as the same holding here or the unique index will happily
 * store both.
 */
export function normaliseSymbol(symbol: string) {
  return symbol.trim().toUpperCase();
}

/**
 * What the trade is worth, as a single figure.
 *
 * Derived rather than accepted from the caller: `quantity`, `price`, `amount`
 * and `brokerage` are all stored, so an entered amount is a number free to
 * contradict the other three.
 *
 * Brokerage moves in the direction that costs the trader — added to what a buy
 * costs, taken off what a sell returns — so this is the cash effect the trade
 * would have, for whenever settlement accounts exist.
 */
export function tradeAmount(
  transactionType: TradeType,
  quantity: number,
  price: Cents,
  brokerage: Cents,
): Cents {
  const gross = quantity * price;
  return cents(
    transactionType === "buy" ? gross + brokerage : gross - brokerage,
  );
}

/**
 * Whole shares, and at least one of them.
 *
 * The database has a CHECK that rejects a fraction, but reaching it produces a
 * raw constraint failure; this is the same rule stated where it can be reported
 * as a refusal callers can branch on.
 */
export function assertWholeQuantity(quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw investmentError(
      "invalid_quantity",
      `Quantity must be a whole number of shares, got ${quantity}`,
    );
  }
}

/** Load an investment account, or fail with NOT_FOUND. */
export async function loadInvestmentAccount(
  tx: Transaction,
  accountId: string,
) {
  const account = await tx.query.investmentAccounts.findFirst({
    where: eq(investmentAccounts.id, accountId),
  });

  if (!account) {
    throw investmentError("account_not_found", "Investment account not found");
  }

  return account;
}

/**
 * Deliberately not shared with `cash.ts`, whose `assertActive` is identical but
 * throws a cash-domain refusal — which would be the wrong `kind` to hand a
 * caller branching on investment errors.
 */
export function assertActiveAccount(account: {
  accountName: string;
  status: string;
}) {
  if (account.status !== "active") {
    throw investmentError(
      "account_closed",
      `Account "${account.accountName}" is closed`,
    );
  }
}

/** Load the position in one symbol, or fail with NOT_FOUND. */
export async function loadHolding(
  tx: Transaction,
  investmentAccountId: string,
  symbol: string,
) {
  const holding = await tx.query.holdings.findFirst({
    where: and(
      eq(holdings.investmentAccountId, investmentAccountId),
      eq(holdings.symbol, normaliseSymbol(symbol)),
    ),
  });

  if (!holding) {
    throw investmentError(
      "holding_not_found",
      `No position in ${normaliseSymbol(symbol)} to sell`,
    );
  }

  return holding;
}

export function assertSufficientShares(
  holding: { symbol: string; quantity: number },
  quantity: number,
) {
  if (holding.quantity < quantity) {
    throw investmentError(
      "insufficient_shares",
      `Insufficient shares of ${holding.symbol}: hold ${holding.quantity}, selling ${quantity}`,
    );
  }
}

/**
 * Narrow a stored transaction type to one this module can settle.
 * `dividend_reinvest` and `split` exist in the schema for Phase 4 and cannot
 * currently be created by any procedure.
 */
export function assertSettleableTrade(
  transactionType: string,
): asserts transactionType is TradeType {
  if (transactionType !== "buy" && transactionType !== "sell") {
    throw investmentError(
      "unsettleable_type",
      `Cannot settle a "${transactionType}" transaction`,
    );
  }
}

/**
 * Add shares to a position, creating it if this is the first buy.
 *
 * A single upsert rather than a read followed by an insert-or-update: the
 * unique index on (account, symbol) makes the conflict target well-defined, and
 * the arithmetic happens in the database — `quantity = quantity + ?` — so two
 * buys settling at once cannot both read the same starting position.
 *
 * `amount` already includes brokerage, which is what puts acquisition costs
 * into the basis rather than losing them.
 */
async function addShares(tx: Transaction, trade: Trade) {
  await tx
    .insert(holdings)
    .values({
      investmentAccountId: trade.investmentAccountId,
      symbol: trade.symbol,
      companyName: trade.companyName,
      quantity: trade.quantity,
      totalCostBasis: trade.amount,
      lastTransactionDate: trade.transactionDate,
    })
    .onConflictDoUpdate({
      target: [holdings.investmentAccountId, holdings.symbol],
      set: {
        quantity: sql`${holdings.quantity} + ${trade.quantity}`,
        totalCostBasis: sql`${holdings.totalCostBasis} + ${trade.amount}`,
        lastTransactionDate: trade.transactionDate,
        // A later buy may name the company where the first left it null.
        companyName: sql`COALESCE(${holdings.companyName}, ${trade.companyName})`,
      },
    });
}

/**
 * Remove shares from a position and report what they cost.
 *
 * The pool loses a *proportion* of its cost, not `quantity * average` — the
 * average is never stored, and recomputing the remainder from a rounded average
 * is what would let error accumulate. Subtracting the rounded share from the
 * stored total instead leaves the remainder in the pool, so a full exit removes
 * exactly the cost that went in.
 *
 * The read is guarded rather than trusted: the UPDATE only matches while the
 * row still holds the quantity and cost this calculation was based on. Under a
 * database with concurrent writers a second sell could otherwise settle in
 * between, and this one would remove a cost computed from a position that no
 * longer exists.
 */
async function removeShares(
  tx: Transaction,
  holding: { id: string; quantity: number; totalCostBasis: Cents },
  trade: Trade,
) {
  const costRemoved = cents(
    Math.round((holding.totalCostBasis * trade.quantity) / holding.quantity),
  );

  const result = await tx
    .update(holdings)
    .set({
      quantity: sql`${holdings.quantity} - ${trade.quantity}`,
      totalCostBasis: sql`${holdings.totalCostBasis} - ${costRemoved}`,
      lastTransactionDate: trade.transactionDate,
    })
    .where(
      and(
        eq(holdings.id, holding.id),
        eq(holdings.quantity, holding.quantity),
        eq(holdings.totalCostBasis, holding.totalCostBasis),
      ),
    );

  if (result.rowsAffected === 0) {
    throw investmentError(
      "holding_changed",
      `The position in ${holding.id} changed while the sale was settling`,
    );
  }

  // A position sold down to nothing is deleted rather than kept at zero, so
  // "held symbols" stays a row count and an empty pool cannot be divided by.
  await tx
    .delete(holdings)
    .where(and(eq(holdings.id, holding.id), eq(holdings.quantity, 0)));

  return costRemoved;
}

/**
 * A corporate action that restates the share count: a 2-for-1 split is
 * `{ numerator: 2, denominator: 1 }`, a 1-for-5 consolidation is
 * `{ numerator: 1, denominator: 5 }`.
 */
export type SplitRatio = { numerator: number; denominator: number };

/**
 * Where a split leaves the position.
 *
 * The ratio says what the corporate action was; `resultingQuantity` says what
 * is actually held. Registries round, and the number on the statement is the
 * authority — so an override is offered rather than a fraction being invented.
 *
 * Without one, a ratio that does not divide evenly is refused: that is the case
 * where nobody has checked what the registry actually did.
 */
export function splitQuantity(
  held: number,
  ratio: SplitRatio,
  resultingQuantity?: number,
): number {
  if (
    !Number.isInteger(ratio.numerator) ||
    !Number.isInteger(ratio.denominator) ||
    ratio.numerator < 1 ||
    ratio.denominator < 1
  ) {
    throw investmentError(
      "invalid_ratio",
      "A split ratio must be two whole numbers of one or more",
    );
  }

  if (ratio.numerator === ratio.denominator) {
    throw investmentError(
      "invalid_ratio",
      "A 1-for-1 split would not change the position",
    );
  }

  if (resultingQuantity !== undefined) {
    assertWholeQuantity(resultingQuantity);
    return resultingQuantity;
  }

  const scaled = held * ratio.numerator;
  if (scaled % ratio.denominator !== 0) {
    throw investmentError(
      "fractional_split",
      `${ratio.numerator}-for-${ratio.denominator} on ${held} shares leaves a fraction. ` +
        "Enter the share count from your statement instead.",
    );
  }

  return scaled / ratio.denominator;
}

/**
 * Restate a position's share count after a corporate action.
 *
 * `total_cost_basis` is deliberately untouched. A split changes how many pieces
 * the holding is divided into, not what it cost — so the derived average per
 * share moves and nothing else does. That is also what makes the override safe:
 * matching the registry's share count cannot corrupt the basis, because the
 * basis is not part of the calculation.
 *
 * Returns the delta, which is what the transaction row records: deltas compose,
 * so a rebuild can fold buys, sells and splits in one pass.
 */
export async function settleSplit(
  tx: Transaction,
  input: {
    investmentAccountId: string;
    symbol: string;
    ratio: SplitRatio;
    resultingQuantity?: number;
    transactionDate: Date;
  },
) {
  assertActiveAccount(
    await loadInvestmentAccount(tx, input.investmentAccountId),
  );

  const holding = await loadHolding(
    tx,
    input.investmentAccountId,
    input.symbol,
  );

  const resulting = splitQuantity(
    holding.quantity,
    input.ratio,
    input.resultingQuantity,
  );

  // Guarded on the quantity this was calculated from, for the same reason a
  // sell is: the arithmetic must not be applied to a position that has moved.
  const result = await tx
    .update(holdings)
    .set({
      quantity: resulting,
      lastTransactionDate: input.transactionDate,
    })
    .where(
      and(eq(holdings.id, holding.id), eq(holdings.quantity, holding.quantity)),
    );

  if (result.rowsAffected === 0) {
    throw investmentError(
      "holding_changed",
      `The position in ${holding.symbol} changed while the split was applied`,
    );
  }

  return {
    symbol: holding.symbol,
    previousQuantity: holding.quantity,
    resultingQuantity: resulting,
    delta: resulting - holding.quantity,
    totalCostBasis: holding.totalCostBasis,
  };
}

/** What settling a trade did, for the caller to record on the transaction. */
export type TradeOutcome = {
  /** Cost removed from the pool by a sell; null for a buy. */
  costRemoved: Cents | null;
  /** Proceeds after brokerage, less the cost removed. Null for a buy. */
  realisedGain: Cents | null;
};

/**
 * Apply a trade's effect to the holdings.
 *
 * Safe to call at approval time: a pending sell does *not* reserve shares, so
 * the position may have been sold out from under the request while it sat in
 * the queue. Ownership is re-checked here rather than trusted from submission.
 */
export async function settleTrade(
  tx: Transaction,
  trade: Trade,
): Promise<TradeOutcome> {
  assertWholeQuantity(trade.quantity);
  assertActiveAccount(
    await loadInvestmentAccount(tx, trade.investmentAccountId),
  );

  if (trade.transactionType === "buy") {
    await addShares(tx, trade);
    return { costRemoved: null, realisedGain: null };
  }

  const holding = await loadHolding(
    tx,
    trade.investmentAccountId,
    trade.symbol,
  );
  assertSufficientShares(holding, trade.quantity);

  const costRemoved = await removeShares(tx, holding, trade);

  return {
    costRemoved,
    // `amount` is already net of brokerage, so the fee reduces the gain rather
    // than being counted twice.
    realisedGain: cents(trade.amount - costRemoved),
  };
}
