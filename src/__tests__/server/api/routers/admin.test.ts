import { describe, it, expect, assert, beforeAll } from "vitest";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { cashAccounts } from "~/server/db/schema";
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

describe("admin middleware", () => {
  const { db, migrate } = createTestDb();
  beforeAll(() => migrate());

  it("throws UNAUTHORIZED when unauthenticated", async () => {
    const caller = createTestCaller(db, null);
    await expectTRPCError(
      caller.admin.accounts.create({
        userId: "x",
        accountType: "cash",
        accountName: "x",
        cashAccountType: "checking",
      }),
      "UNAUTHORIZED",
    );
  });

  it("throws FORBIDDEN when authenticated but not admin", async () => {
    const user = await insertUser(db);
    const caller = createTestCaller(db, makeSession(user));
    await expectTRPCError(
      caller.admin.accounts.create({
        userId: user.id,
        accountType: "cash",
        accountName: "x",
        cashAccountType: "checking",
      }),
      "FORBIDDEN",
    );
  });
});

// ---------------------------------------------------------------------------
// admin.accounts.create
// ---------------------------------------------------------------------------

describe("admin.accounts.create", () => {
  const { db, migrate } = createTestDb();
  let admin: FakeUser;
  let targetUser: FakeUser;

  beforeAll(async () => {
    await migrate();
    admin = await insertAdminUser(db);
    targetUser = await insertUser(db);
  });

  it("creates a cash checking account", async () => {
    const caller = createTestCaller(db, makeSession(admin));
    const result = await caller.admin.accounts.create({
      userId: targetUser.id,
      accountType: "cash",
      accountName: "My Checking",
      cashAccountType: "checking",
    });

    expect(result.type).toBe("cash");
    assert(result.account, "account should be defined");
    expect(result.account).toMatchObject({
      accountName: "My Checking",
      accountType: "checking",
      userId: targetUser.id,
      balance: 0,
      status: "active",
    });
    expect(result.account.accountNumber).toMatch(/^\d{11}$/);
  });

  it("creates an investment account", async () => {
    const caller = createTestCaller(db, makeSession(admin));
    const result = await caller.admin.accounts.create({
      userId: targetUser.id,
      accountType: "investment",
      accountName: "My Portfolio",
    });

    expect(result.type).toBe("investment");
    assert(result.account, "account should be defined");
    expect(result.account).toMatchObject({
      accountName: "My Portfolio",
      userId: targetUser.id,
      status: "active",
    });
  });

  it("throws NOT_FOUND for a non-existent userId", async () => {
    const caller = createTestCaller(db, makeSession(admin));
    await expectTRPCError(
      caller.admin.accounts.create({
        userId: "does-not-exist",
        accountType: "cash",
        accountName: "x",
        cashAccountType: "checking",
      }),
      "NOT_FOUND",
    );
  });

  it("throws BAD_REQUEST when cashAccountType is missing for a cash account", async () => {
    const caller = createTestCaller(db, makeSession(admin));
    await expectTRPCError(
      caller.admin.accounts.create({
        userId: targetUser.id,
        accountType: "cash",
        accountName: "x",
        // cashAccountType intentionally omitted
      }),
      "BAD_REQUEST",
    );
  });
});

// ---------------------------------------------------------------------------
// admin.accounts.list
// ---------------------------------------------------------------------------

describe("admin.accounts.list", () => {
  const { db, migrate } = createTestDb();
  let admin: FakeUser;
  let user1: FakeUser;
  let user2: FakeUser;

  beforeAll(async () => {
    await migrate();
    admin = await insertAdminUser(db);
    user1 = await insertUser(db);
    user2 = await insertUser(db);

    const caller = createTestCaller(db, makeSession(admin));

    // user1: 1 savings account + 1 investment account
    await caller.admin.accounts.create({
      userId: user1.id,
      accountType: "cash",
      accountName: "Savings",
      cashAccountType: "savings",
    });
    await caller.admin.accounts.create({
      userId: user1.id,
      accountType: "investment",
      accountName: "Portfolio",
    });

    // user2: 1 checking account (closed)
    const { account } = await caller.admin.accounts.create({
      userId: user2.id,
      accountType: "cash",
      accountName: "Checking",
      cashAccountType: "checking",
    });
    assert(account, "created account should be defined");
    await db
      .update(cashAccounts)
      .set({ status: "closed" })
      .where(eq(cashAccounts.id, account.id));
  });

  it("returns all accounts when no filter is applied", async () => {
    const caller = createTestCaller(db, makeSession(admin));
    const result = await caller.admin.accounts.list({});
    expect(result.cashAccounts.length).toBe(2);
    expect(result.investmentAccounts.length).toBe(1);
  });

  it("filters by userId", async () => {
    const caller = createTestCaller(db, makeSession(admin));
    const result = await caller.admin.accounts.list({ userId: user1.id });
    expect(result.cashAccounts.length).toBe(1);
    expect(result.cashAccounts[0]!.userId).toBe(user1.id);
    expect(result.investmentAccounts.length).toBe(1);
  });

  it("filters by accountType cash", async () => {
    const caller = createTestCaller(db, makeSession(admin));
    const result = await caller.admin.accounts.list({ accountType: "cash" });
    expect(result.cashAccounts.length).toBe(2);
    expect(result.investmentAccounts.length).toBe(0);
  });

  it("filters by accountType investment", async () => {
    const caller = createTestCaller(db, makeSession(admin));
    const result = await caller.admin.accounts.list({ accountType: "investment" });
    expect(result.cashAccounts.length).toBe(0);
    expect(result.investmentAccounts.length).toBe(1);
  });

  it("filters by status active", async () => {
    const caller = createTestCaller(db, makeSession(admin));
    const result = await caller.admin.accounts.list({ status: "active" });
    expect(result.cashAccounts.every((a) => a.status === "active")).toBe(true);
    expect(result.cashAccounts.length).toBe(1);
  });

  it("filters by status closed", async () => {
    const caller = createTestCaller(db, makeSession(admin));
    const result = await caller.admin.accounts.list({ status: "closed" });
    expect(result.cashAccounts.length).toBe(1);
    expect(result.cashAccounts[0]!.status).toBe("closed");
  });
});

// ---------------------------------------------------------------------------
// admin.accounts.update
// ---------------------------------------------------------------------------

describe("admin.accounts.update", () => {
  const { db, migrate } = createTestDb();
  let admin: FakeUser;
  let cashAccountId: string;
  let investmentAccountId: string;

  beforeAll(async () => {
    await migrate();
    admin = await insertAdminUser(db);
    const user = await insertUser(db);
    const caller = createTestCaller(db, makeSession(admin));

    const cash = await caller.admin.accounts.create({
      userId: user.id,
      accountType: "cash",
      accountName: "Original Name",
      cashAccountType: "checking",
    });
    assert(cash.account, "cash account should be defined");
    cashAccountId = cash.account.id;

    const investment = await caller.admin.accounts.create({
      userId: user.id,
      accountType: "investment",
      accountName: "Original Portfolio",
    });
    assert(investment.account, "investment account should be defined");
    investmentAccountId = investment.account.id;
  });

  it("renames a cash account", async () => {
    const caller = createTestCaller(db, makeSession(admin));
    const result = await caller.admin.accounts.update({
      accountId: cashAccountId,
      accountType: "cash",
      accountName: "New Name",
    });
    expect(result.account.accountName).toBe("New Name");
  });

  it("closes a cash account", async () => {
    const caller = createTestCaller(db, makeSession(admin));
    const result = await caller.admin.accounts.update({
      accountId: cashAccountId,
      accountType: "cash",
      status: "closed",
    });
    expect(result.account.status).toBe("closed");
  });

  it("renames an investment account", async () => {
    const caller = createTestCaller(db, makeSession(admin));
    const result = await caller.admin.accounts.update({
      accountId: investmentAccountId,
      accountType: "investment",
      accountName: "New Portfolio",
    });
    expect(result.account.accountName).toBe("New Portfolio");
  });

  it("throws NOT_FOUND for a missing cash account", async () => {
    const caller = createTestCaller(db, makeSession(admin));
    await expectTRPCError(
      caller.admin.accounts.update({
        accountId: "does-not-exist",
        accountType: "cash",
        accountName: "x",
      }),
      "NOT_FOUND",
    );
  });

  it("throws NOT_FOUND for a missing investment account", async () => {
    const caller = createTestCaller(db, makeSession(admin));
    await expectTRPCError(
      caller.admin.accounts.update({
        accountId: "does-not-exist",
        accountType: "investment",
        accountName: "x",
      }),
      "NOT_FOUND",
    );
  });
});

// ---------------------------------------------------------------------------
// admin.users.search
// ---------------------------------------------------------------------------

describe("admin.users.search", () => {
  const { db, migrate } = createTestDb();
  let admin: FakeUser;

  beforeAll(async () => {
    await migrate();
    admin = await insertAdminUser(db, { name: "Admin User" });
    await insertUser(db, { name: "Alice Smith" });
    await insertUser(db, { name: "Bob Smith" });
    await insertUser(db, { name: "Charlie Jones" });
  });

  it("returns users matching the query", async () => {
    const caller = createTestCaller(db, makeSession(admin));
    const results = await caller.admin.users.search({ query: "Smith" });
    expect(results.length).toBe(2);
    expect(results.every((u) => u.name?.includes("Smith"))).toBe(true);
  });

  it("returns only id, name, email columns", async () => {
    const caller = createTestCaller(db, makeSession(admin));
    const [result] = await caller.admin.users.search({ query: "Alice" });
    expect(result).toHaveProperty("id");
    expect(result).toHaveProperty("name");
    expect(result).toHaveProperty("email");
    expect(result).not.toHaveProperty("emailVerified");
  });

  it("returns no results for a non-matching query", async () => {
    const caller = createTestCaller(db, makeSession(admin));
    const results = await caller.admin.users.search({ query: "Nonexistent" });
    expect(results).toHaveLength(0);
  });

  it("throws a validation error for an empty query", async () => {
    const caller = createTestCaller(db, makeSession(admin));
    await expectTRPCError(
      caller.admin.users.search({ query: "" }),
      "BAD_REQUEST",
    );
  });
});
