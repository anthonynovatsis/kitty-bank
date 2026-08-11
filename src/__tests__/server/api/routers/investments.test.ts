import { describe, it, expect, beforeAll } from "vitest";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";

import { holdings, investmentAccounts } from "~/server/db/schema";
import {
  isInvestmentError,
  type InvestmentErrorKind,
} from "~/server/services/investments";
import { createTestDb, type TestDb } from "../../../helpers/db";
import {
  insertAdminUser,
  insertUser,
  makeSession,
  createTestCaller,
  type FakeUser,
} from "../../../helpers/context";

async function expectTRPCError(
  promise: Promise<unknown>,
  code: TRPCError["code"],
) {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(TRPCError);
  expect((error as TRPCError).code).toBe(code);
}

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

function holdingIn(db: TestDb, accountId: string, symbol: string) {
  return db.query.holdings.findFirst({
    where: and(
      eq(holdings.investmentAccountId, accountId),
      eq(holdings.symbol, symbol),
    ),
  });
}

// ---------------------------------------------------------------------------
// Trusted users — trades settle on submission
// ---------------------------------------------------------------------------

describe("user.investments — trusted user", () => {
  const { db, migrate } = createTestDb();
  let admin: FakeUser;
  let trusted: FakeUser;
  let accountId: string;

  beforeAll(async () => {
    await migrate();
    admin = await insertAdminUser(db);
    trusted = await insertUser(db, { requiresTransactionApproval: false });
    accountId = await makeInvestmentAccount(db, admin, trusted.id, {
      name: "Portfolio",
    });
  });

  it("executes a buy and opens the position", async () => {
    const caller = createTestCaller(db, makeSession(trusted));

    const result = await caller.user.investments.buy({
      accountId,
      symbol: "aapl",
      companyName: "Apple",
      quantity: 10,
      price: 100,
      brokerage: 9.99,
    });

    // Straight to executed — no admin ever saw it.
    expect(result.status).toBe("executed");
    expect(result.requiresApproval).toBe(false);
    expect(result.transaction.approvedByAdminId).toBeNull();
    // $1,000 of shares plus the fee to acquire them.
    expect(result.transaction.amount).toBe(1009_99);
    expect(result.transaction.symbol).toBe("AAPL");

    const holding = await holdingIn(db, accountId, "AAPL");
    expect(holding?.quantity).toBe(10);
    expect(holding?.totalCostBasis).toBe(1009_99);
  });

  it("executes a sell and reports the realised gain", async () => {
    const caller = createTestCaller(db, makeSession(trusted));

    await caller.user.investments.buy({
      accountId,
      symbol: "MSFT",
      quantity: 10,
      price: 100,
    });

    const result = await caller.user.investments.sell({
      accountId,
      symbol: "MSFT",
      quantity: 4,
      price: 120,
      brokerage: 10,
    });

    expect(result.status).toBe("executed");
    // $480 gross, less the $10 fee, less the $400 those 4 shares cost.
    expect(result.realisedGain).toBe(70_00);

    const holding = await holdingIn(db, accountId, "MSFT");
    expect(holding?.quantity).toBe(6);
    expect(holding?.totalCostBasis).toBe(600_00);
  });

  it("derives the amount rather than trusting one", async () => {
    const caller = createTestCaller(db, makeSession(trusted));

    const result = await caller.user.investments.buy({
      accountId,
      symbol: "NVDA",
      quantity: 3,
      price: 12.34,
      brokerage: 1.5,
    });

    // 3 × 1234c + 150c, computed on the server from the decimals as typed.
    expect(result.transaction.amount).toBe(3852);
    expect(result.transaction.price).toBe(1234);
    expect(result.transaction.brokerage).toBe(150);
  });

  it("refuses to sell shares that are not held", async () => {
    const caller = createTestCaller(db, makeSession(trusted));

    await expectInvestmentError(
      caller.user.investments.sell({
        accountId,
        symbol: "AAPL",
        quantity: 99,
        price: 100,
      }),
      "insufficient_shares",
    );

    await expectInvestmentError(
      caller.user.investments.sell({
        accountId,
        symbol: "NOTHELD",
        quantity: 1,
        price: 100,
      }),
      "holding_not_found",
    );
  });

  it("refuses a fractional quantity at the input boundary", async () => {
    const caller = createTestCaller(db, makeSession(trusted));

    await expectTRPCError(
      caller.user.investments.buy({
        accountId,
        symbol: "FRAC",
        quantity: 7.5,
        price: 100,
      }),
      "BAD_REQUEST",
    );
  });

  it("refuses to trade in a closed account", async () => {
    const closed = await makeInvestmentAccount(db, admin, trusted.id, {
      name: "Closed",
      status: "closed",
    });
    const caller = createTestCaller(db, makeSession(trusted));

    await expectInvestmentError(
      caller.user.investments.buy({
        accountId: closed,
        symbol: "AAPL",
        quantity: 1,
        price: 100,
      }),
      "account_closed",
    );
  });
});

// ---------------------------------------------------------------------------
// Supervised users — trades queue for approval
// ---------------------------------------------------------------------------

describe("user.investments — supervised user", () => {
  const { db, migrate } = createTestDb();
  let admin: FakeUser;
  let supervised: FakeUser;
  let accountId: string;

  beforeAll(async () => {
    await migrate();
    admin = await insertAdminUser(db);
    supervised = await insertUser(db, { requiresTransactionApproval: true });
    accountId = await makeInvestmentAccount(db, admin, supervised.id, {
      name: "Portfolio",
    });
  });

  it("queues a buy without touching the holdings", async () => {
    const caller = createTestCaller(db, makeSession(supervised));

    const result = await caller.user.investments.buy({
      accountId,
      symbol: "AAPL",
      quantity: 5,
      price: 100,
    });

    expect(result.status).toBe("pending");
    expect(result.requiresApproval).toBe(true);
    expect(result.realisedGain).toBeNull();

    // Nothing settles until an admin decides.
    expect(await holdingIn(db, accountId, "AAPL")).toBeUndefined();
  });

  it("still refuses a sale it could never settle", async () => {
    const caller = createTestCaller(db, makeSession(supervised));

    // The queued buy above has not settled, so there is nothing to sell.
    await expectInvestmentError(
      caller.user.investments.sell({
        accountId,
        symbol: "AAPL",
        quantity: 1,
        price: 100,
      }),
      "holding_not_found",
    );
  });
});

// ---------------------------------------------------------------------------
// Reads and access control
// ---------------------------------------------------------------------------

describe("user.investments — reads", () => {
  const { db, migrate } = createTestDb();
  let admin: FakeUser;
  let owner: FakeUser;
  let stranger: FakeUser;
  let accountId: string;

  beforeAll(async () => {
    await migrate();
    admin = await insertAdminUser(db);
    owner = await insertUser(db, { requiresTransactionApproval: false });
    stranger = await insertUser(db, { requiresTransactionApproval: false });
    accountId = await makeInvestmentAccount(db, admin, owner.id, {
      name: "Portfolio",
    });

    const caller = createTestCaller(db, makeSession(owner));
    await caller.user.investments.buy({
      accountId,
      symbol: "ZZZ",
      quantity: 1,
      price: 10,
    });
    await caller.user.investments.buy({
      accountId,
      symbol: "AAA",
      quantity: 2,
      price: 20,
    });
  });

  it("lists holdings alphabetically", async () => {
    const caller = createTestCaller(db, makeSession(owner));
    const result = await caller.user.investments.getHoldings({ accountId });

    expect(result.map((h) => h.symbol)).toEqual(["AAA", "ZZZ"]);
  });

  it("returns trade history, narrowable to one symbol", async () => {
    const caller = createTestCaller(db, makeSession(owner));

    expect(
      await caller.user.investments.getTransactions({ accountId }),
    ).toHaveLength(2);

    const narrowed = await caller.user.investments.getTransactions({
      accountId,
      // Case-folded on the way in, like every other symbol.
      symbol: "aaa",
    });
    expect(narrowed).toHaveLength(1);
    expect(narrowed[0]!.symbol).toBe("AAA");
  });

  it("does not expose another user's account", async () => {
    const caller = createTestCaller(db, makeSession(stranger));

    await expectTRPCError(
      caller.user.investments.getHoldings({ accountId }),
      "FORBIDDEN",
    );
    await expectTRPCError(
      caller.user.investments.getTransactions({ accountId }),
      "FORBIDDEN",
    );
    await expectTRPCError(
      caller.user.investments.buy({
        accountId,
        symbol: "AAPL",
        quantity: 1,
        price: 1,
      }),
      "FORBIDDEN",
    );
  });

  it("requires a session", async () => {
    const caller = createTestCaller(db, null);
    await expectTRPCError(
      caller.user.investments.getHoldings({ accountId }),
      "UNAUTHORIZED",
    );
  });
});
