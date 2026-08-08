import { describe, it, expect, assert, beforeAll } from "vitest";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { cashAccounts, userSettings } from "~/server/db/schema";
import { createTestDb } from "../../../helpers/db";
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
    const result = await caller.admin.accounts.list({
      accountType: "investment",
    });
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

// ---------------------------------------------------------------------------
// admin.users.list
// ---------------------------------------------------------------------------

describe("admin.users.list", () => {
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

    // user1: 1 active checking + 1 investment account
    await caller.admin.accounts.create({
      userId: user1.id,
      accountType: "cash",
      accountName: "Checking",
      cashAccountType: "checking",
    });
    await caller.admin.accounts.create({
      userId: user1.id,
      accountType: "investment",
      accountName: "Portfolio",
    });

    // user2: 1 savings account (closed)
    const { account } = await caller.admin.accounts.create({
      userId: user2.id,
      accountType: "cash",
      accountName: "Savings",
      cashAccountType: "savings",
    });
    assert(account, "account should be defined");
    await db
      .update(cashAccounts)
      .set({ status: "closed" })
      .where(eq(cashAccounts.id, account.id));
  });

  it("throws UNAUTHORIZED when unauthenticated", async () => {
    const caller = createTestCaller(db, null);
    await expectTRPCError(caller.admin.users.list(), "UNAUTHORIZED");
  });

  it("throws FORBIDDEN when called by a non-admin", async () => {
    const caller = createTestCaller(db, makeSession(user1));
    await expectTRPCError(caller.admin.users.list(), "FORBIDDEN");
  });

  it("returns all users", async () => {
    const caller = createTestCaller(db, makeSession(admin));
    const result = await caller.admin.users.list();
    // admin + user1 + user2
    expect(result.length).toBe(3);
  });

  it("includes account counts and total cash balance", async () => {
    const caller = createTestCaller(db, makeSession(admin));
    const result = await caller.admin.users.list();
    const u1 = result.find((u) => u.id === user1.id)!;

    expect(u1.cashAccountCount).toBe(1);
    expect(u1.activeCashAccountCount).toBe(1);
    expect(u1.investmentAccountCount).toBe(1);
    expect(u1.activeInvestmentAccountCount).toBe(1);
    expect(u1.totalCashBalance).toBe(0);
  });

  it("correctly counts closed accounts separately from active", async () => {
    const caller = createTestCaller(db, makeSession(admin));
    const result = await caller.admin.users.list();
    const u2 = result.find((u) => u.id === user2.id)!;

    expect(u2.cashAccountCount).toBe(1);
    expect(u2.activeCashAccountCount).toBe(0);
  });

  it("reflects isAdmin and requiresTransactionApproval from settings", async () => {
    const caller = createTestCaller(db, makeSession(admin));
    const result = await caller.admin.users.list();

    const adminEntry = result.find((u) => u.id === admin.id)!;
    expect(adminEntry.isAdmin).toBe(true);
    expect(adminEntry.requiresTransactionApproval).toBe(false);

    const u1Entry = result.find((u) => u.id === user1.id)!;
    expect(u1Entry.isAdmin).toBe(false);
    // user1 has no userSettings row → defaults to true
    expect(u1Entry.requiresTransactionApproval).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// admin.users.updateApprovalSettings
// ---------------------------------------------------------------------------

describe("admin.users.updateApprovalSettings", () => {
  const { db, migrate } = createTestDb();
  let admin: FakeUser;
  let user1: FakeUser;

  beforeAll(async () => {
    await migrate();
    admin = await insertAdminUser(db);
    user1 = await insertUser(db);
  });

  it("throws UNAUTHORIZED when unauthenticated", async () => {
    const caller = createTestCaller(db, null);
    await expectTRPCError(
      caller.admin.users.updateApprovalSettings({
        userId: user1.id,
        requiresTransactionApproval: false,
      }),
      "UNAUTHORIZED",
    );
  });

  it("throws FORBIDDEN when called by a non-admin", async () => {
    const caller = createTestCaller(db, makeSession(user1));
    await expectTRPCError(
      caller.admin.users.updateApprovalSettings({
        userId: user1.id,
        requiresTransactionApproval: false,
      }),
      "FORBIDDEN",
    );
  });

  it("throws NOT_FOUND for a non-existent user", async () => {
    const caller = createTestCaller(db, makeSession(admin));
    await expectTRPCError(
      caller.admin.users.updateApprovalSettings({
        userId: "does-not-exist",
        requiresTransactionApproval: false,
      }),
      "NOT_FOUND",
    );
  });

  it("creates settings row when none exists and sets requiresTransactionApproval", async () => {
    const caller = createTestCaller(db, makeSession(admin));
    await caller.admin.users.updateApprovalSettings({
      userId: user1.id,
      requiresTransactionApproval: false,
    });

    const settings = await db.query.userSettings.findFirst({
      where: eq(userSettings.userId, user1.id),
    });
    expect(settings?.requiresTransactionApproval).toBe(false);
  });

  it("updates an existing settings row", async () => {
    const caller = createTestCaller(db, makeSession(admin));

    await caller.admin.users.updateApprovalSettings({
      userId: user1.id,
      requiresTransactionApproval: true,
    });
    const updated = await db.query.userSettings.findFirst({
      where: eq(userSettings.userId, user1.id),
    });
    expect(updated?.requiresTransactionApproval).toBe(true);
  });

  it("does not change isAdmin when updating approval settings", async () => {
    // admin already has isAdmin=true
    const caller = createTestCaller(db, makeSession(admin));
    await caller.admin.users.updateApprovalSettings({
      userId: admin.id,
      requiresTransactionApproval: true,
    });

    const settings = await db.query.userSettings.findFirst({
      where: eq(userSettings.userId, admin.id),
    });
    expect(settings?.isAdmin).toBe(true);
  });
});
