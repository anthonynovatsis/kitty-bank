import { describe, it, expect, assert, beforeAll } from "vitest";
import { TRPCError } from "@trpc/server";
import { holdings } from "~/server/db/schema";
import { createTestDb } from "../../../helpers/db";
import {
  insertAdminUser,
  insertUser,
  makeSession,
  createTestCaller,
  type FakeUser,
} from "../../../helpers/context";

async function expectTRPCError(promise: Promise<unknown>, code: TRPCError["code"]) {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(TRPCError);
  expect((error as TRPCError).code).toBe(code);
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

describe("user middleware", () => {
  const { db, migrate } = createTestDb();
  beforeAll(() => migrate());

  it("throws UNAUTHORIZED when unauthenticated", async () => {
    const caller = createTestCaller(db, null);
    await expectTRPCError(caller.user.accounts.list(), "UNAUTHORIZED");
  });
});

// ---------------------------------------------------------------------------
// user.accounts.list
// ---------------------------------------------------------------------------

describe("user.accounts.list", () => {
  const { db, migrate } = createTestDb();
  let admin: FakeUser;
  let user1: FakeUser;
  let user2: FakeUser;

  beforeAll(async () => {
    await migrate();
    admin = await insertAdminUser(db);
    user1 = await insertUser(db);
    user2 = await insertUser(db);

    const adminCaller = createTestCaller(db, makeSession(admin));

    // user1: 1 savings account + 1 investment account
    await adminCaller.admin.accounts.create({
      userId: user1.id,
      accountType: "cash",
      accountName: "Savings",
      cashAccountType: "savings",
    });
    await adminCaller.admin.accounts.create({
      userId: user1.id,
      accountType: "investment",
      accountName: "Portfolio",
    });

    // user2: 1 checking account
    await adminCaller.admin.accounts.create({
      userId: user2.id,
      accountType: "cash",
      accountName: "Checking",
      cashAccountType: "checking",
    });
  });

  it("returns only the authenticated user's accounts", async () => {
    const caller = createTestCaller(db, makeSession(user1));
    const result = await caller.user.accounts.list();

    expect(result.cashAccounts).toHaveLength(1);
    expect(result.cashAccounts[0]!.userId).toBe(user1.id);
    expect(result.investmentAccounts).toHaveLength(1);
    expect(result.investmentAccounts[0]!.userId).toBe(user1.id);
  });

  it("does not return another user's accounts", async () => {
    const caller = createTestCaller(db, makeSession(user1));
    const result = await caller.user.accounts.list();

    const allIds = [
      ...result.cashAccounts.map((a) => a.userId),
      ...result.investmentAccounts.map((a) => a.userId),
    ];
    expect(allIds.every((id) => id === user1.id)).toBe(true);
  });

  it("returns an empty result when the user has no accounts", async () => {
    const newUser = await insertUser(db);
    const caller = createTestCaller(db, makeSession(newUser));
    const result = await caller.user.accounts.list();

    expect(result.cashAccounts).toHaveLength(0);
    expect(result.investmentAccounts).toHaveLength(0);
  });

  it("includes type discriminator on each account", async () => {
    const caller = createTestCaller(db, makeSession(user1));
    const result = await caller.user.accounts.list();
    expect(result.cashAccounts[0]!.type).toBe("cash");
    expect(result.investmentAccounts[0]!.type).toBe("investment");
  });

  it("calculates investment account totalValue from holdings", async () => {
    // Grab the investment account id created for user1
    const caller = createTestCaller(db, makeSession(user1));
    const result = await caller.user.accounts.list();
    const portfolio = result.investmentAccounts[0]!;

    // No holdings yet → totalValue should be 0
    expect(portfolio.totalValue).toBe(0);
    expect(portfolio.holdingsCount).toBe(0);

    // Seed two holdings directly and re-fetch
    await db.insert(holdings).values([
      {
        investmentAccountId: portfolio.id,
        symbol: "AAPL",
        quantity: 10,
        averageCostBasis: 150,
      },
      {
        investmentAccountId: portfolio.id,
        symbol: "MSFT",
        quantity: 5,
        averageCostBasis: 300,
      },
    ]);

    const updated = await caller.user.accounts.list();
    const updatedPortfolio = updated.investmentAccounts[0]!;

    // 10 * 150 + 5 * 300 = 1500 + 1500 = 3000
    expect(updatedPortfolio.totalValue).toBe(3000);
    expect(updatedPortfolio.holdingsCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// user.accounts.getDetails
// ---------------------------------------------------------------------------

describe("user.accounts.getDetails", () => {
  const { db, migrate } = createTestDb();
  let admin: FakeUser;
  let user1: FakeUser;
  let user2: FakeUser;
  let cashAccountId: string;
  let investmentAccountId: string;

  beforeAll(async () => {
    await migrate();
    admin = await insertAdminUser(db);
    user1 = await insertUser(db);
    user2 = await insertUser(db);

    const adminCaller = createTestCaller(db, makeSession(admin));

    const cash = await adminCaller.admin.accounts.create({
      userId: user1.id,
      accountType: "cash",
      accountName: "My Checking",
      cashAccountType: "checking",
    });
    cashAccountId = cash.account!.id;

    const investment = await adminCaller.admin.accounts.create({
      userId: user1.id,
      accountType: "investment",
      accountName: "My Portfolio",
    });
    investmentAccountId = investment.account!.id;
  });

  it("throws UNAUTHORIZED when unauthenticated", async () => {
    const caller = createTestCaller(db, null);
    await expectTRPCError(
      caller.user.accounts.getDetails({ accountId: cashAccountId }),
      "UNAUTHORIZED",
    );
  });

  it("returns a cash account with type discriminator", async () => {
    const caller = createTestCaller(db, makeSession(user1));
    const result = await caller.user.accounts.getDetails({
      accountId: cashAccountId,
    });
    expect(result.type).toBe("cash");
    assert(result.type === "cash");
    expect(result.account.id).toBe(cashAccountId);
    expect(result.account.accountName).toBe("My Checking");
    expect(result.account.balance).toBe(0);
  });

  it("returns an investment account with holdings and totalValue", async () => {
    const caller = createTestCaller(db, makeSession(user1));

    // Seed a holding
    await db.insert(holdings).values({
      investmentAccountId,
      symbol: "AAPL",
      quantity: 10,
      averageCostBasis: 200,
    });

    const result = await caller.user.accounts.getDetails({
      accountId: investmentAccountId,
    });
    expect(result.type).toBe("investment");
    assert(result.type === "investment");
    expect(result.account.id).toBe(investmentAccountId);
    // 10 * 200 = 2000
    expect(result.account.totalValue).toBe(2000);
    expect(result.account.holdings).toHaveLength(1);
    expect(result.account.holdings[0]!.symbol).toBe("AAPL");
  });

  it("throws NOT_FOUND for a non-existent account id", async () => {
    const caller = createTestCaller(db, makeSession(user1));
    await expectTRPCError(
      caller.user.accounts.getDetails({ accountId: "does-not-exist" }),
      "NOT_FOUND",
    );
  });

  it("throws FORBIDDEN when accessing another user's cash account", async () => {
    const caller = createTestCaller(db, makeSession(user2));
    await expectTRPCError(
      caller.user.accounts.getDetails({ accountId: cashAccountId }),
      "FORBIDDEN",
    );
  });

  it("throws FORBIDDEN when accessing another user's investment account", async () => {
    const caller = createTestCaller(db, makeSession(user2));
    await expectTRPCError(
      caller.user.accounts.getDetails({ accountId: investmentAccountId }),
      "FORBIDDEN",
    );
  });

  it("totalValue is 0 when investment account has no holdings", async () => {
    const adminCaller = createTestCaller(db, makeSession(admin));
    const { account } = await adminCaller.admin.accounts.create({
      userId: user1.id,
      accountType: "investment",
      accountName: "Empty Portfolio",
    });
    const caller = createTestCaller(db, makeSession(user1));
    const result = await caller.user.accounts.getDetails({
      accountId: account!.id,
    });
    expect(result.type).toBe("investment");
    assert(result.type === "investment");
    expect(result.account.totalValue).toBe(0);
    expect(result.account.holdings).toHaveLength(0);
  });
});
