import { describe, it, expect, beforeAll } from "vitest";
import { and, eq } from "drizzle-orm";

import { holdings, investmentTransactions } from "~/server/db/schema";
import {
  foldHistory,
  isInvestmentError,
  rebuildHolding,
} from "~/server/services/investments";
import { cents } from "~/lib/money";
import { createTestDb } from "../../helpers/db";
import {
  insertAdminUser,
  insertUser,
  makeSession,
  createTestCaller,
  type FakeUser,
} from "../../helpers/context";

/** A journal row, with only the fields the fold reads. */
function entry(
  transactionType: string,
  overrides: {
    quantity?: number | null;
    amount?: number;
    companyName?: string | null;
    splitNumerator?: number | null;
    splitDenominator?: number | null;
    residualCarriedForward?: number | null;
    date?: string;
  } = {},
) {
  return {
    id: crypto.randomUUID(),
    transactionType,
    quantity: overrides.quantity ?? null,
    amount: cents(overrides.amount ?? 0),
    companyName: overrides.companyName ?? null,
    splitNumerator: overrides.splitNumerator ?? null,
    splitDenominator: overrides.splitDenominator ?? null,
    residualCarriedForward:
      overrides.residualCarriedForward === undefined ||
      overrides.residualCarriedForward === null
        ? null
        : cents(overrides.residualCarriedForward),
    transactionDate: new Date(overrides.date ?? "2026-01-01"),
  };
}

// ---------------------------------------------------------------------------
// The fold, on its own
// ---------------------------------------------------------------------------

describe("foldHistory", () => {
  it("is empty for no history", () => {
    expect(foldHistory([])).toEqual({
      quantity: 0,
      totalCostBasis: 0,
      companyName: null,
      lastTransactionDate: null,
      dividendCashBalance: 0,
      realisedGains: new Map(),
    });
  });

  it("accumulates buys into one pool", () => {
    const position = foldHistory([
      entry("buy", { quantity: 3, amount: 300_00, companyName: "Acme" }),
      entry("buy", { quantity: 1, amount: 110_99 }),
    ]);

    expect(position.quantity).toBe(4);
    expect(position.totalCostBasis).toBe(410_99);
    expect(position.companyName).toBe("Acme");
  });

  it("removes a proportion of the pool on a sale", () => {
    const position = foldHistory([
      entry("buy", { quantity: 10, amount: 1000_00 }),
      entry("sell", { quantity: 4, amount: 470_00 }),
    ]);

    expect(position.quantity).toBe(6);
    expect(position.totalCostBasis).toBe(600_00);
  });

  /*
   * Gains are computed rather than stored, so they are always what the current
   * history implies. Delete an earlier buy and every later sale's gain moves —
   * which is the whole point of replaying rather than remembering.
   */
  it("reports what each sale realised", () => {
    const sale = entry("sell", { quantity: 4, amount: 470_00 });
    const position = foldHistory([
      entry("buy", { quantity: 10, amount: 1000_00 }),
      sale,
    ]);

    // $470 of proceeds against the $400 those 4 shares cost.
    expect(position.realisedGains.get(sale.id)).toBe(70_00);
  });

  it("moves an earlier sale's gain when the history behind it changes", () => {
    const sale = entry("sell", {
      quantity: 4,
      amount: 470_00,
      date: "2026-03-01",
    });

    const dear = foldHistory([
      entry("buy", { quantity: 10, amount: 1000_00, date: "2026-01-01" }),
      sale,
    ]);
    const cheap = foldHistory([
      entry("buy", { quantity: 10, amount: 500_00, date: "2026-01-01" }),
      sale,
    ]);

    expect(dear.realisedGains.get(sale.id)).toBe(70_00);
    // The same sale, against shares that cost half as much.
    expect(cheap.realisedGains.get(sale.id)).toBe(270_00);
  });

  it("restates the count on a split without touching the cost", () => {
    const position = foldHistory([
      entry("buy", { quantity: 10, amount: 1000_00 }),
      entry("split", { splitNumerator: 2, splitDenominator: 1 }),
    ]);

    expect(position.quantity).toBe(20);
    expect(position.totalCostBasis).toBe(1000_00);
  });

  it("takes a split's recorded share count over its ratio", () => {
    const position = foldHistory([
      entry("buy", { quantity: 91, amount: 910_00 }),
      entry("split", {
        quantity: 137,
        splitNumerator: 3,
        splitDenominator: 2,
      }),
    ]);

    expect(position.quantity).toBe(137);
  });

  it("treats a reinvested dividend as the purchase it is", () => {
    const position = foldHistory([
      entry("buy", { quantity: 10, amount: 1000_00 }),
      entry("dividend_reinvest", {
        quantity: 2,
        amount: 62_40,
        residualCarriedForward: 3_05,
      }),
    ]);

    expect(position.quantity).toBe(12);
    expect(position.totalCostBasis).toBe(1062_40);
    // The registry's figure, taken as recorded rather than worked out here.
    expect(position.dividendCashBalance).toBe(3_05);
  });

  /*
   * A dividend taken as cash is income against the symbol that paid it. It
   * moves no shares and no cost — only, possibly, what the plan is holding.
   */
  it("leaves the position alone for a dividend taken as cash", () => {
    const position = foldHistory([
      entry("buy", { quantity: 10, amount: 1000_00 }),
      entry("dividend", { amount: 42_00 }),
    ]);

    expect(position.quantity).toBe(10);
    expect(position.totalCostBasis).toBe(1000_00);
  });

  it("carries the residual from the latest dividend, not the sum of them", () => {
    const position = foldHistory([
      entry("buy", { quantity: 100, amount: 1000_00, date: "2026-01-01" }),
      entry("dividend_reinvest", {
        quantity: 1,
        amount: 31_20,
        residualCarriedForward: 23_45,
        date: "2026-02-01",
      }),
      entry("dividend_reinvest", {
        quantity: 2,
        amount: 62_40,
        residualCarriedForward: 3_05,
        date: "2026-05-01",
      }),
    ]);

    expect(position.dividendCashBalance).toBe(3_05);
  });

  /*
   * The refusal a delete has to produce. Removing a buy can leave a later sale
   * with nothing to sell — the history is then not merely different, it is
   * impossible, and saying so beats writing a negative position.
   */
  it("refuses a sale with nothing behind it", () => {
    const error = (() => {
      try {
        foldHistory([
          entry("buy", { quantity: 2, amount: 200_00 }),
          entry("sell", { quantity: 8, amount: 800_00 }),
        ]);
      } catch (e: unknown) {
        return e;
      }
    })();

    expect(isInvestmentError(error, "history_inconsistent")).toBe(true);
  });

  /*
   * The same problem one step removed: a ratio that divided evenly when it
   * settled need not divide evenly once an earlier buy is gone.
   */
  it("refuses a split that no longer divides evenly", () => {
    const error = (() => {
      try {
        foldHistory([
          entry("buy", { quantity: 5, amount: 500_00 }),
          entry("split", { splitNumerator: 3, splitDenominator: 2 }),
        ]);
      } catch (e: unknown) {
        return e;
      }
    })();

    expect(isInvestmentError(error, "fractional_split")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Against a real database
// ---------------------------------------------------------------------------

describe("rebuildHolding", () => {
  const { db, migrate } = createTestDb();
  let admin: FakeUser;
  let owner: FakeUser;
  let accountId: string;

  beforeAll(async () => {
    await migrate();
    admin = await insertAdminUser(db);
    owner = await insertUser(db, { requiresTransactionApproval: false });

    const created = await createTestCaller(
      db,
      makeSession(admin),
    ).admin.accounts.create({
      userId: owner.id,
      accountType: "investment",
      accountName: "Portfolio",
    });
    accountId = created.account!.id;
  });

  function caller() {
    return createTestCaller(db, makeSession(owner));
  }

  function holdingIn(symbol: string) {
    return db.query.holdings.findFirst({
      where: and(
        eq(holdings.investmentAccountId, accountId),
        eq(holdings.symbol, symbol),
      ),
    });
  }

  /*
   * The property the whole design rests on: `holdings` is a cache, so replaying
   * the journal must land exactly where incremental settlement did. If these
   * two disagreed by a cent, every reconciliation would report drift that is
   * not there — which is the reason the cost is pooled rather than averaged.
   */
  it("reproduces what incremental settlement produced", async () => {
    await caller().user.investments.buy({
      accountId,
      symbol: "SAME",
      companyName: "Same Co",
      quantity: 3,
      price: 100,
    });
    await caller().user.investments.buy({
      accountId,
      symbol: "SAME",
      quantity: 1,
      price: 101,
      brokerage: 9.99,
    });
    await caller().user.investments.sell({
      accountId,
      symbol: "SAME",
      quantity: 1,
      price: 150,
    });
    await caller().user.investments.adjustHolding({
      accountId,
      symbol: "SAME",
      numerator: 2,
      denominator: 1,
    });

    const settled = await holdingIn("SAME");

    const rebuilt = await db.transaction((tx) =>
      rebuildHolding(tx, accountId, "same"),
    );

    expect(rebuilt.quantity).toBe(settled!.quantity);
    expect(rebuilt.totalCostBasis).toBe(settled!.totalCostBasis);

    // And the row itself is left where it was, not merely reported.
    const after = await holdingIn("SAME");
    expect(after!.quantity).toBe(settled!.quantity);
    expect(after!.totalCostBasis).toBe(settled!.totalCostBasis);
  });

  it("rebuilds a position that was deleted from the cache", async () => {
    await caller().user.investments.buy({
      accountId,
      symbol: "GONE",
      quantity: 5,
      price: 20,
    });

    // Whatever removed it, the journal still knows what it was.
    await db.delete(holdings).where(eq(holdings.symbol, "GONE"));
    expect(await holdingIn("GONE")).toBeUndefined();

    await db.transaction((tx) => rebuildHolding(tx, accountId, "GONE"));

    const restored = await holdingIn("GONE");
    expect(restored?.quantity).toBe(5);
    expect(restored?.totalCostBasis).toBe(100_00);
  });

  it("ignores pending and rejected rows", async () => {
    const supervised = await insertUser(db, {
      requiresTransactionApproval: true,
    });
    const supervisedAccount = (
      await createTestCaller(db, makeSession(admin)).admin.accounts.create({
        userId: supervised.id,
        accountType: "investment",
        accountName: "Supervised",
      })
    ).account!.id;
    const userCaller = createTestCaller(db, makeSession(supervised));

    const settled = await userCaller.user.investments.buy({
      accountId: supervisedAccount,
      symbol: "MIXED",
      quantity: 10,
      price: 10,
    });
    await createTestCaller(db, makeSession(admin)).admin.transactions.approve({
      kind: "investment",
      transactionId: settled.transaction.id,
      action: "approve",
    });

    // One left pending, one rejected — neither has happened.
    await userCaller.user.investments.buy({
      accountId: supervisedAccount,
      symbol: "MIXED",
      quantity: 99,
      price: 10,
    });
    const rejected = await userCaller.user.investments.buy({
      accountId: supervisedAccount,
      symbol: "MIXED",
      quantity: 50,
      price: 10,
    });
    await createTestCaller(db, makeSession(admin)).admin.transactions.approve({
      kind: "investment",
      transactionId: rejected.transaction.id,
      action: "reject",
    });

    const rebuilt = await db.transaction((tx) =>
      rebuildHolding(tx, supervisedAccount, "MIXED"),
    );
    expect(rebuilt.quantity).toBe(10);
  });

  /*
   * The reason the fold orders by transaction date rather than by when things
   * were recorded: a back-dated buy belongs before the sale it funded, however
   * late it was entered.
   */
  it("folds in transaction-date order, not entry order", async () => {
    await caller().user.investments.buy({
      accountId,
      symbol: "BACK",
      quantity: 10,
      price: 10,
      transactionDate: new Date("2026-06-01"),
    });
    await caller().user.investments.sell({
      accountId,
      symbol: "BACK",
      quantity: 10,
      price: 20,
      transactionDate: new Date("2026-07-01"),
    });

    // Entered last, but dated first — it funds part of the July sale.
    await db.insert(investmentTransactions).values({
      investmentAccountId: accountId,
      transactionType: "buy",
      symbol: "BACK",
      quantity: 10,
      price: cents(10_00),
      amount: cents(100_00),
      transactionDate: new Date("2026-05-01"),
      status: "executed",
      createdByUserId: owner.id,
    });

    const rebuilt = await db.transaction((tx) =>
      rebuildHolding(tx, accountId, "BACK"),
    );

    // 20 shares held by July, 10 sold, half the $200 pool gone with them.
    expect(rebuilt.quantity).toBe(10);
    expect(rebuilt.totalCostBasis).toBe(100_00);
  });

  it("deletes a position that replays to nothing", async () => {
    await caller().user.investments.buy({
      accountId,
      symbol: "EXIT",
      quantity: 4,
      price: 10,
    });
    await caller().user.investments.sell({
      accountId,
      symbol: "EXIT",
      quantity: 4,
      price: 12,
    });

    await db.transaction((tx) => rebuildHolding(tx, accountId, "EXIT"));
    expect(await holdingIn("EXIT")).toBeUndefined();
  });
});
