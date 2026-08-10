import { describe, it, expect, beforeAll } from "vitest";
import { and, eq } from "drizzle-orm";

import { holdings, investmentAccounts } from "~/server/db/schema";
import {
  assertSettleableTrade,
  isInvestmentError,
  normaliseSymbol,
  settleTrade,
  tradeAmount,
  type InvestmentErrorKind,
  type Trade,
} from "~/server/services/investments";
import { averageCents, cents, type Cents } from "~/lib/money";
import { createTestDb, type TestDb } from "../../helpers/db";
import {
  insertAdminUser,
  insertUser,
  makeSession,
  createTestCaller,
  type FakeUser,
} from "../../helpers/context";

/**
 * Assert the specific rule that refused the trade. Several kinds share one tRPC
 * code, so the code alone doesn't pin down which rule fired.
 */
async function expectInvestmentError(
  promise: Promise<unknown>,
  kind: InvestmentErrorKind,
) {
  const error = await promise.catch((e: unknown) => e);
  expect(isInvestmentError(error, kind)).toBe(true);
}

async function makeInvestmentAccount(
  db: TestDb,
  admin: FakeUser,
  userId: string,
  opts: { name: string; status?: "active" | "closed" },
) {
  const adminCaller = createTestCaller(db, makeSession(admin));
  const { account } = await adminCaller.admin.accounts.create({
    userId,
    accountType: "investment",
    accountName: opts.name,
  });

  if (opts.status) {
    await db
      .update(investmentAccounts)
      .set({ status: opts.status })
      .where(eq(investmentAccounts.id, account!.id));
  }

  return account!.id;
}

/** Build a trade with its amount derived, the way a router would. */
function trade(overrides: Partial<Trade> & Pick<Trade, "investmentAccountId">) {
  const transactionType = overrides.transactionType ?? "buy";
  const quantity = overrides.quantity ?? 1;
  const price = overrides.price ?? cents(100_00);
  const brokerage = overrides.brokerage ?? cents(0);

  return {
    transactionType,
    investmentAccountId: overrides.investmentAccountId,
    symbol: normaliseSymbol(overrides.symbol ?? "AAPL"),
    companyName: overrides.companyName ?? null,
    quantity,
    price,
    brokerage,
    amount: tradeAmount(transactionType, quantity, price, brokerage),
    transactionDate: overrides.transactionDate ?? new Date(),
  } satisfies Trade;
}

function holdingIn(db: TestDb, accountId: string, symbol: string) {
  return db.query.holdings.findFirst({
    where: and(
      eq(holdings.investmentAccountId, accountId),
      eq(holdings.symbol, symbol),
    ),
  });
}

// ---------------------------------------------------------------------------
// tradeAmount
// ---------------------------------------------------------------------------

describe("tradeAmount", () => {
  it("adds brokerage to a buy and takes it off a sell", () => {
    // 10 shares at $100 is $1,000 gross; a $9.99 fee costs the trader either way.
    expect(tradeAmount("buy", 10, cents(100_00), cents(9_99))).toBe(1009_99);
    expect(tradeAmount("sell", 10, cents(100_00), cents(9_99))).toBe(990_01);
  });
});

// ---------------------------------------------------------------------------
// Buys
// ---------------------------------------------------------------------------

describe("settleTrade — buys", () => {
  const { db, migrate } = createTestDb();
  let admin: FakeUser;
  let user: FakeUser;
  let accountId: string;

  beforeAll(async () => {
    await migrate();
    admin = await insertAdminUser(db);
    user = await insertUser(db);
    accountId = await makeInvestmentAccount(db, admin, user.id, {
      name: "Portfolio",
    });
  });

  it("creates the position, with brokerage in the basis", async () => {
    const t = trade({
      investmentAccountId: accountId,
      symbol: "MSFT",
      companyName: "Microsoft",
      quantity: 10,
      price: cents(100_00),
      brokerage: cents(10_00),
    });

    const outcome = await db.transaction((tx) => settleTrade(tx, t));

    // A buy realises nothing — there is no cost being disposed of.
    expect(outcome).toEqual({ costRemoved: null, realisedGain: null });

    const holding = await holdingIn(db, accountId, "MSFT");
    expect(holding?.quantity).toBe(10);
    // $1,000 of shares plus the $10 fee it took to acquire them.
    expect(holding?.totalCostBasis).toBe(1010_00);
    expect(holding?.companyName).toBe("Microsoft");
  });

  it("adds to the existing pool rather than opening a second row", async () => {
    await db.transaction((tx) =>
      settleTrade(
        tx,
        trade({
          investmentAccountId: accountId,
          symbol: "TSLA",
          quantity: 3,
          price: cents(100_00),
        }),
      ),
    );
    await db.transaction((tx) =>
      settleTrade(
        tx,
        trade({
          investmentAccountId: accountId,
          symbol: "TSLA",
          quantity: 1,
          price: cents(101_00),
          brokerage: cents(9_99),
        }),
      ),
    );

    const rows = await db.query.holdings.findMany({
      where: and(
        eq(holdings.investmentAccountId, accountId),
        eq(holdings.symbol, "TSLA"),
      ),
    });
    expect(rows).toHaveLength(1);

    /*
     * The reason the pool exists. $300 + $101 + $9.99 is 41,099c across 4
     * shares — 10,274.75c each, which no cents column can hold. Stored as a
     * total it stays exact, and only the derived average rounds.
     */
    expect(rows[0]!.totalCostBasis).toBe(41099);
    expect(averageCents(rows[0]!.totalCostBasis, rows[0]!.quantity)).toBe(
      10275,
    );
  });

  it("treats a lower-case symbol as the same position", async () => {
    await db.transaction((tx) =>
      settleTrade(
        tx,
        trade({
          investmentAccountId: accountId,
          symbol: normaliseSymbol(" nvda "),
          quantity: 2,
          price: cents(50_00),
        }),
      ),
    );
    await db.transaction((tx) =>
      settleTrade(
        tx,
        trade({
          investmentAccountId: accountId,
          symbol: normaliseSymbol("nvda"),
          quantity: 3,
          price: cents(50_00),
        }),
      ),
    );

    const holding = await holdingIn(db, accountId, "NVDA");
    expect(holding?.quantity).toBe(5);
  });

  it("names the company on a later buy when the first left it blank", async () => {
    await db.transaction((tx) =>
      settleTrade(
        tx,
        trade({ investmentAccountId: accountId, symbol: "AMD", quantity: 1 }),
      ),
    );
    await db.transaction((tx) =>
      settleTrade(
        tx,
        trade({
          investmentAccountId: accountId,
          symbol: "AMD",
          companyName: "Advanced Micro Devices",
          quantity: 1,
        }),
      ),
    );

    const holding = await holdingIn(db, accountId, "AMD");
    expect(holding?.companyName).toBe("Advanced Micro Devices");
  });

  it("refuses a fractional or empty quantity", async () => {
    await expectInvestmentError(
      db.transaction((tx) =>
        settleTrade(
          tx,
          trade({ investmentAccountId: accountId, symbol: "F", quantity: 7.5 }),
        ),
      ),
      "invalid_quantity",
    );

    await expectInvestmentError(
      db.transaction((tx) =>
        settleTrade(
          tx,
          trade({ investmentAccountId: accountId, symbol: "F", quantity: 0 }),
        ),
      ),
      "invalid_quantity",
    );
  });

  it("refuses an unknown or closed account", async () => {
    await expectInvestmentError(
      db.transaction((tx) =>
        settleTrade(tx, trade({ investmentAccountId: "nope" })),
      ),
      "account_not_found",
    );

    const closed = await makeInvestmentAccount(db, admin, user.id, {
      name: "Closed",
      status: "closed",
    });
    await expectInvestmentError(
      db.transaction((tx) =>
        settleTrade(tx, trade({ investmentAccountId: closed })),
      ),
      "account_closed",
    );
  });
});

// ---------------------------------------------------------------------------
// Sells
// ---------------------------------------------------------------------------

describe("settleTrade — sells", () => {
  const { db, migrate } = createTestDb();
  let admin: FakeUser;
  let user: FakeUser;
  let accountId: string;

  beforeAll(async () => {
    await migrate();
    admin = await insertAdminUser(db);
    user = await insertUser(db);
    accountId = await makeInvestmentAccount(db, admin, user.id, {
      name: "Portfolio",
    });
  });

  async function buy(symbol: string, quantity: number, price: Cents) {
    await db.transaction((tx) =>
      settleTrade(
        tx,
        trade({ investmentAccountId: accountId, symbol, quantity, price }),
      ),
    );
  }

  it("removes a proportion of the pool and reports the gain", async () => {
    await buy("AAPL", 10, cents(100_00));

    const outcome = await db.transaction((tx) =>
      settleTrade(
        tx,
        trade({
          investmentAccountId: accountId,
          transactionType: "sell",
          symbol: "AAPL",
          quantity: 4,
          price: cents(120_00),
          brokerage: cents(10_00),
        }),
      ),
    );

    // 4 of 10 shares carry 4/10 of the $1,000 pool.
    expect(outcome.costRemoved).toBe(400_00);
    // $480 gross, less the $10 fee, less the $400 those shares cost.
    expect(outcome.realisedGain).toBe(70_00);

    const holding = await holdingIn(db, accountId, "AAPL");
    expect(holding?.quantity).toBe(6);
    expect(holding?.totalCostBasis).toBe(600_00);
  });

  /*
   * The property the pool exists to guarantee: however the sales are sliced,
   * the cost removed adds up to exactly the cost put in. An average recomputed
   * and re-rounded on each sale would leave a residue behind.
   */
  it("removes exactly what went in, across an awkward split", async () => {
    await buy("POOL", 3, cents(100_00));
    await buy("POOL", 1, cents(101_00));

    const before = await holdingIn(db, accountId, "POOL");
    const totalIn = before!.totalCostBasis;
    expect(totalIn).toBe(401_00);

    const first = await db.transaction((tx) =>
      settleTrade(
        tx,
        trade({
          investmentAccountId: accountId,
          transactionType: "sell",
          symbol: "POOL",
          quantity: 1,
          price: cents(150_00),
        }),
      ),
    );

    const second = await db.transaction((tx) =>
      settleTrade(
        tx,
        trade({
          investmentAccountId: accountId,
          transactionType: "sell",
          symbol: "POOL",
          quantity: 3,
          price: cents(150_00),
        }),
      ),
    );

    expect(first.costRemoved! + second.costRemoved!).toBe(totalIn);
  });

  it("deletes the position when the last share goes", async () => {
    await buy("GONE", 5, cents(20_00));

    const outcome = await db.transaction((tx) =>
      settleTrade(
        tx,
        trade({
          investmentAccountId: accountId,
          transactionType: "sell",
          symbol: "GONE",
          quantity: 5,
          price: cents(25_00),
        }),
      ),
    );

    // A full exit disposes of the entire pool, never a rounded share of it.
    expect(outcome.costRemoved).toBe(100_00);
    expect(outcome.realisedGain).toBe(25_00);
    expect(await holdingIn(db, accountId, "GONE")).toBeUndefined();
  });

  it("refuses to sell more than is held", async () => {
    await buy("SMALL", 2, cents(10_00));

    await expectInvestmentError(
      db.transaction((tx) =>
        settleTrade(
          tx,
          trade({
            investmentAccountId: accountId,
            transactionType: "sell",
            symbol: "SMALL",
            quantity: 3,
            price: cents(10_00),
          }),
        ),
      ),
      "insufficient_shares",
    );

    // The failed sale left the position untouched.
    const holding = await holdingIn(db, accountId, "SMALL");
    expect(holding?.quantity).toBe(2);
    expect(holding?.totalCostBasis).toBe(20_00);
  });

  it("refuses to sell a symbol that is not held", async () => {
    await expectInvestmentError(
      db.transaction((tx) =>
        settleTrade(
          tx,
          trade({
            investmentAccountId: accountId,
            transactionType: "sell",
            symbol: "NONE",
            quantity: 1,
            price: cents(10_00),
          }),
        ),
      ),
      "holding_not_found",
    );
  });
});

// ---------------------------------------------------------------------------
// Type narrowing
// ---------------------------------------------------------------------------

describe("assertSettleableTrade", () => {
  it("accepts buys and sells", () => {
    expect(() => assertSettleableTrade("buy")).not.toThrow();
    expect(() => assertSettleableTrade("sell")).not.toThrow();
  });

  it("refuses the types Phase 4 will add", () => {
    for (const type of ["dividend_reinvest", "split"]) {
      const error = (() => {
        try {
          assertSettleableTrade(type);
        } catch (e: unknown) {
          return e;
        }
      })();
      expect(isInvestmentError(error, "unsettleable_type")).toBe(true);
    }
  });
});
