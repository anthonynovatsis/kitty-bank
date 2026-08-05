import { describe, it, expect, beforeAll } from "vitest";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { cashAccounts, cashTransactions } from "~/server/db/schema";
import { isCashError, type CashErrorKind } from "~/server/services/cash";
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

/**
 * Assert the specific cash rule that refused the operation. Several kinds share
 * one tRPC code, so the code alone doesn't pin down which rule fired.
 */
async function expectCashError(promise: Promise<unknown>, kind: CashErrorKind) {
  const error = await promise.catch((e: unknown) => e);
  expect(isCashError(error, kind)).toBe(true);
}

/** Create a cash account for a user with a known starting balance. */
async function makeCashAccount(
  db: TestDb,
  admin: FakeUser,
  userId: string,
  opts: { name: string; balance?: number; status?: "active" | "closed" },
) {
  const adminCaller = createTestCaller(db, makeSession(admin));
  const { account } = await adminCaller.admin.accounts.create({
    userId,
    accountType: "cash",
    accountName: opts.name,
    cashAccountType: "checking",
  });

  if (opts.balance !== undefined || opts.status !== undefined) {
    await db
      .update(cashAccounts)
      .set({
        ...(opts.balance !== undefined && { balance: opts.balance }),
        ...(opts.status !== undefined && { status: opts.status }),
      })
      .where(eq(cashAccounts.id, account!.id));
  }

  return account!.id;
}

async function balanceOf(db: TestDb, accountId: string) {
  const account = await db.query.cashAccounts.findFirst({
    where: eq(cashAccounts.id, accountId),
  });
  return account!.balance;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

describe("user.cash middleware", () => {
  const { db, migrate } = createTestDb();
  beforeAll(() => migrate());

  it("throws UNAUTHORIZED on deposit when unauthenticated", async () => {
    const caller = createTestCaller(db, null);
    await expectTRPCError(
      caller.user.cash.deposit({ accountId: "x", amount: 10 }),
      "UNAUTHORIZED",
    );
  });

  it("throws UNAUTHORIZED on withdraw when unauthenticated", async () => {
    const caller = createTestCaller(db, null);
    await expectTRPCError(
      caller.user.cash.withdraw({ accountId: "x", amount: 10 }),
      "UNAUTHORIZED",
    );
  });

  it("throws UNAUTHORIZED on transfer when unauthenticated", async () => {
    const caller = createTestCaller(db, null);
    await expectTRPCError(
      caller.user.cash.transfer({
        fromAccountId: "x",
        toAccountId: "y",
        amount: 10,
      }),
      "UNAUTHORIZED",
    );
  });

  it("throws UNAUTHORIZED on getTransactions when unauthenticated", async () => {
    const caller = createTestCaller(db, null);
    await expectTRPCError(
      caller.user.cash.getTransactions({ accountId: "x" }),
      "UNAUTHORIZED",
    );
  });
});

// ---------------------------------------------------------------------------
// Cash rule errors
//
// The point of the discriminant: one procedure refuses for several different
// reasons, and a caller has to be able to tell them apart without reading
// message strings.
// ---------------------------------------------------------------------------

describe("cash rule errors", () => {
  const { db, migrate } = createTestDb();
  let admin: FakeUser;
  let trusted: FakeUser;

  beforeAll(async () => {
    await migrate();
    admin = await insertAdminUser(db);
    trusted = await insertUser(db, { requiresTransactionApproval: false });
  });

  it("distinguishes the ways a single procedure can refuse", async () => {
    const open = await makeCashAccount(db, admin, trusted.id, {
      name: "Rule Open",
      balance: 10,
    });
    const otherOpen = await makeCashAccount(db, admin, trusted.id, {
      name: "Rule Other",
    });
    const closed = await makeCashAccount(db, admin, trusted.id, {
      name: "Rule Closed",
      status: "closed",
    });
    const caller = createTestCaller(db, makeSession(trusted));

    // Three different refusals, all from user.cash.transfer. Note the funds
    // case needs an *open* destination — assertActive runs first.
    const sameAccount = await caller.user.cash
      .transfer({ fromAccountId: open, toAccountId: open, amount: 1 })
      .catch((e: unknown) => e);
    const noFunds = await caller.user.cash
      .transfer({ fromAccountId: open, toAccountId: otherOpen, amount: 9999 })
      .catch((e: unknown) => e);
    const shut = await caller.user.cash
      .transfer({ fromAccountId: open, toAccountId: closed, amount: 1 })
      .catch((e: unknown) => e);

    expect(isCashError(sameAccount, "invalid_transfer")).toBe(true);
    expect(isCashError(noFunds, "insufficient_funds")).toBe(true);
    expect(isCashError(shut, "account_closed")).toBe(true);

    // ...and each is only its own kind.
    expect(isCashError(sameAccount, "insufficient_funds")).toBe(false);
    expect(isCashError(noFunds, "account_closed")).toBe(false);
    expect(isCashError(shut, "invalid_transfer")).toBe(false);
  });

  it("maps state refusals to CONFLICT and malformed input to BAD_REQUEST", async () => {
    const account = await makeCashAccount(db, admin, trusted.id, {
      name: "Rule Codes",
      balance: 5,
    });
    const caller = createTestCaller(db, makeSession(trusted));

    await expectTRPCError(
      caller.user.cash.withdraw({ accountId: account, amount: 100 }),
      "CONFLICT",
    );
    await expectTRPCError(
      caller.user.cash.transfer({
        fromAccountId: account,
        toAccountId: account,
        amount: 1,
      }),
      "BAD_REQUEST",
    );
  });

  it("does not classify unrelated errors as cash errors", async () => {
    const caller = createTestCaller(db, makeSession(trusted));
    const notFound = await caller.user.cash
      .deposit({ accountId: "nope", amount: 1 })
      .catch((e: unknown) => e);

    // A genuine cash rule, but not the kind asked about.
    expect(isCashError(notFound, "account_not_found")).toBe(true);
    expect(isCashError(notFound, "insufficient_funds")).toBe(false);
    expect(isCashError(new Error("something else"))).toBe(false);
    expect(isCashError(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// user.cash.deposit
// ---------------------------------------------------------------------------

describe("user.cash.deposit", () => {
  const { db, migrate } = createTestDb();
  let admin: FakeUser;
  let trusted: FakeUser;
  let supervised: FakeUser;
  let stranger: FakeUser;

  beforeAll(async () => {
    await migrate();
    admin = await insertAdminUser(db);
    trusted = await insertUser(db, { requiresTransactionApproval: false });
    supervised = await insertUser(db, { requiresTransactionApproval: true });
    stranger = await insertUser(db, { requiresTransactionApproval: false });
  });

  it("credits the balance immediately for a trusted user", async () => {
    const accountId = await makeCashAccount(db, admin, trusted.id, {
      name: "Trusted Checking",
    });
    const caller = createTestCaller(db, makeSession(trusted));

    const result = await caller.user.cash.deposit({ accountId, amount: 250.5 });

    expect(result.status).toBe("completed");
    expect(result.requiresApproval).toBe(false);
    expect(await balanceOf(db, accountId)).toBe(250.5);
  });

  it("queues the transaction without moving money for a supervised user", async () => {
    const accountId = await makeCashAccount(db, admin, supervised.id, {
      name: "Supervised Checking",
    });
    const caller = createTestCaller(db, makeSession(supervised));

    const result = await caller.user.cash.deposit({ accountId, amount: 100 });

    expect(result.status).toBe("pending");
    expect(result.requiresApproval).toBe(true);
    expect(await balanceOf(db, accountId)).toBe(0);
  });

  it("defaults to requiring approval when the user has no settings row", async () => {
    const noSettings = await insertUser(db);
    const accountId = await makeCashAccount(db, admin, noSettings.id, {
      name: "No Settings",
    });
    const caller = createTestCaller(db, makeSession(noSettings));

    const result = await caller.user.cash.deposit({ accountId, amount: 10 });

    expect(result.status).toBe("pending");
    expect(await balanceOf(db, accountId)).toBe(0);
  });

  it("accumulates across deposits and rounds to cents", async () => {
    const accountId = await makeCashAccount(db, admin, trusted.id, {
      name: "Rounding",
    });
    const caller = createTestCaller(db, makeSession(trusted));

    await caller.user.cash.deposit({ accountId, amount: 0.1 });
    await caller.user.cash.deposit({ accountId, amount: 0.2 });

    // 0.1 + 0.2 is 0.30000000000000004 in binary floating point
    expect(await balanceOf(db, accountId)).toBe(0.3);
  });

  it("rejects a zero amount", async () => {
    const accountId = await makeCashAccount(db, admin, trusted.id, {
      name: "Zero",
    });
    const caller = createTestCaller(db, makeSession(trusted));
    await expectTRPCError(
      caller.user.cash.deposit({ accountId, amount: 0 }),
      "BAD_REQUEST",
    );
  });

  it("rejects a negative amount", async () => {
    const accountId = await makeCashAccount(db, admin, trusted.id, {
      name: "Negative",
    });
    const caller = createTestCaller(db, makeSession(trusted));
    await expectTRPCError(
      caller.user.cash.deposit({ accountId, amount: -50 }),
      "BAD_REQUEST",
    );
  });

  it("throws NOT_FOUND for an unknown account", async () => {
    const caller = createTestCaller(db, makeSession(trusted));
    await expectTRPCError(
      caller.user.cash.deposit({ accountId: "does-not-exist", amount: 10 }),
      "NOT_FOUND",
    );
  });

  it("throws FORBIDDEN when depositing into another user's account", async () => {
    const accountId = await makeCashAccount(db, admin, stranger.id, {
      name: "Stranger's",
    });
    const caller = createTestCaller(db, makeSession(trusted));
    await expectTRPCError(
      caller.user.cash.deposit({ accountId, amount: 10 }),
      "FORBIDDEN",
    );
  });

  it("refuses to deposit into a closed account", async () => {
    const accountId = await makeCashAccount(db, admin, trusted.id, {
      name: "Closed",
      status: "closed",
    });
    const caller = createTestCaller(db, makeSession(trusted));
    await expectCashError(
      caller.user.cash.deposit({ accountId, amount: 10 }),
      "account_closed",

    );
  });

  it("stores the description on the transaction", async () => {
    const accountId = await makeCashAccount(db, admin, trusted.id, {
      name: "Described",
    });
    const caller = createTestCaller(db, makeSession(trusted));

    const { transaction } = await caller.user.cash.deposit({
      accountId,
      amount: 10,
      description: "Paycheck",
    });

    expect(transaction.description).toBe("Paycheck");
    expect(transaction.transactionType).toBe("deposit");
  });
});

// ---------------------------------------------------------------------------
// user.cash.withdraw
// ---------------------------------------------------------------------------

describe("user.cash.withdraw", () => {
  const { db, migrate } = createTestDb();
  let admin: FakeUser;
  let trusted: FakeUser;
  let supervised: FakeUser;

  beforeAll(async () => {
    await migrate();
    admin = await insertAdminUser(db);
    trusted = await insertUser(db, { requiresTransactionApproval: false });
    supervised = await insertUser(db, { requiresTransactionApproval: true });
  });

  it("debits the balance immediately for a trusted user", async () => {
    const accountId = await makeCashAccount(db, admin, trusted.id, {
      name: "Withdrawable",
      balance: 500,
    });
    const caller = createTestCaller(db, makeSession(trusted));

    const result = await caller.user.cash.withdraw({
      accountId,
      amount: 120.25,
    });

    expect(result.status).toBe("completed");
    expect(await balanceOf(db, accountId)).toBe(379.75);
  });

  it("allows withdrawing the exact balance", async () => {
    const accountId = await makeCashAccount(db, admin, trusted.id, {
      name: "Exact",
      balance: 75.5,
    });
    const caller = createTestCaller(db, makeSession(trusted));

    await caller.user.cash.withdraw({ accountId, amount: 75.5 });

    expect(await balanceOf(db, accountId)).toBe(0);
  });

  it("rejects a withdrawal larger than the balance", async () => {
    const accountId = await makeCashAccount(db, admin, trusted.id, {
      name: "Overdraft",
      balance: 40,
    });
    const caller = createTestCaller(db, makeSession(trusted));

    await expectCashError(
      caller.user.cash.withdraw({ accountId, amount: 40.01 }),
      "insufficient_funds",

    );
    expect(await balanceOf(db, accountId)).toBe(40);
  });

  it("does not record a transaction when funds are insufficient", async () => {
    const accountId = await makeCashAccount(db, admin, trusted.id, {
      name: "No Record",
      balance: 10,
    });
    const caller = createTestCaller(db, makeSession(trusted));

    await expectCashError(
      caller.user.cash.withdraw({ accountId, amount: 999 }),
      "insufficient_funds",

    );

    const rows = await db.query.cashTransactions.findMany({
      where: eq(cashTransactions.cashAccountId, accountId),
    });
    expect(rows).toHaveLength(0);
  });

  it("queues without debiting for a supervised user", async () => {
    const accountId = await makeCashAccount(db, admin, supervised.id, {
      name: "Supervised Withdrawal",
      balance: 300,
    });
    const caller = createTestCaller(db, makeSession(supervised));

    const result = await caller.user.cash.withdraw({ accountId, amount: 100 });

    expect(result.status).toBe("pending");
    expect(await balanceOf(db, accountId)).toBe(300);
  });
});

// ---------------------------------------------------------------------------
// user.cash.transfer
// ---------------------------------------------------------------------------

describe("user.cash.transfer", () => {
  const { db, migrate } = createTestDb();
  let admin: FakeUser;
  let trusted: FakeUser;
  let supervised: FakeUser;
  let stranger: FakeUser;

  beforeAll(async () => {
    await migrate();
    admin = await insertAdminUser(db);
    trusted = await insertUser(db, { requiresTransactionApproval: false });
    supervised = await insertUser(db, { requiresTransactionApproval: true });
    stranger = await insertUser(db, { requiresTransactionApproval: false });
  });

  it("moves money between two of the user's own accounts", async () => {
    const from = await makeCashAccount(db, admin, trusted.id, {
      name: "From",
      balance: 1000,
    });
    const to = await makeCashAccount(db, admin, trusted.id, {
      name: "To",
      balance: 25,
    });
    const caller = createTestCaller(db, makeSession(trusted));

    const result = await caller.user.cash.transfer({
      fromAccountId: from,
      toAccountId: to,
      amount: 400,
    });

    expect(result.status).toBe("completed");
    expect(await balanceOf(db, from)).toBe(600);
    expect(await balanceOf(db, to)).toBe(425);
  });

  it("rejects a transfer to the same account", async () => {
    const accountId = await makeCashAccount(db, admin, trusted.id, {
      name: "Self",
      balance: 100,
    });
    const caller = createTestCaller(db, makeSession(trusted));

    await expectCashError(
      caller.user.cash.transfer({
        fromAccountId: accountId,
        toAccountId: accountId,
        amount: 10,
      }),
      "invalid_transfer",
    );
    expect(await balanceOf(db, accountId)).toBe(100);
  });

  it("throws FORBIDDEN when the destination belongs to another user", async () => {
    const from = await makeCashAccount(db, admin, trusted.id, {
      name: "Mine",
      balance: 500,
    });
    const to = await makeCashAccount(db, admin, stranger.id, {
      name: "Theirs",
      balance: 0,
    });
    const caller = createTestCaller(db, makeSession(trusted));

    await expectTRPCError(
      caller.user.cash.transfer({
        fromAccountId: from,
        toAccountId: to,
        amount: 50,
      }),
      "FORBIDDEN",
    );
    expect(await balanceOf(db, from)).toBe(500);
    expect(await balanceOf(db, to)).toBe(0);
  });

  it("rejects a transfer larger than the source balance", async () => {
    const from = await makeCashAccount(db, admin, trusted.id, {
      name: "Small",
      balance: 20,
    });
    const to = await makeCashAccount(db, admin, trusted.id, {
      name: "Target",
      balance: 0,
    });
    const caller = createTestCaller(db, makeSession(trusted));

    await expectCashError(
      caller.user.cash.transfer({
        fromAccountId: from,
        toAccountId: to,
        amount: 100,
      }),
      "insufficient_funds",
    );
    expect(await balanceOf(db, from)).toBe(20);
    expect(await balanceOf(db, to)).toBe(0);
  });

  it("rejects a transfer into a closed account without debiting the source", async () => {
    const from = await makeCashAccount(db, admin, trusted.id, {
      name: "Open Source",
      balance: 200,
    });
    const to = await makeCashAccount(db, admin, trusted.id, {
      name: "Shut Target",
      balance: 0,
      status: "closed",
    });
    const caller = createTestCaller(db, makeSession(trusted));

    await expectCashError(
      caller.user.cash.transfer({
        fromAccountId: from,
        toAccountId: to,
        amount: 50,
      }),
      "account_closed",
    );
    expect(await balanceOf(db, from)).toBe(200);
    expect(await balanceOf(db, to)).toBe(0);
  });

  it("queues without moving money for a supervised user", async () => {
    const from = await makeCashAccount(db, admin, supervised.id, {
      name: "Sup From",
      balance: 800,
    });
    const to = await makeCashAccount(db, admin, supervised.id, {
      name: "Sup To",
      balance: 0,
    });
    const caller = createTestCaller(db, makeSession(supervised));

    const result = await caller.user.cash.transfer({
      fromAccountId: from,
      toAccountId: to,
      amount: 300,
    });

    expect(result.status).toBe("pending");
    expect(await balanceOf(db, from)).toBe(800);
    expect(await balanceOf(db, to)).toBe(0);
  });

  it("records both sides on a single transaction row", async () => {
    const from = await makeCashAccount(db, admin, trusted.id, {
      name: "Row From",
      balance: 100,
    });
    const to = await makeCashAccount(db, admin, trusted.id, {
      name: "Row To",
      balance: 0,
    });
    const caller = createTestCaller(db, makeSession(trusted));

    const { transaction } = await caller.user.cash.transfer({
      fromAccountId: from,
      toAccountId: to,
      amount: 10,
    });

    expect(transaction.transactionType).toBe("transfer");
    expect(transaction.fromAccountId).toBe(from);
    expect(transaction.toAccountId).toBe(to);
    expect(transaction.cashAccountId).toBe(from);
  });
});

// ---------------------------------------------------------------------------
// user.cash.getTransactions
// ---------------------------------------------------------------------------

describe("user.cash.getTransactions", () => {
  const { db, migrate } = createTestDb();
  let admin: FakeUser;
  let trusted: FakeUser;
  let stranger: FakeUser;
  let checking: string;
  let savings: string;

  beforeAll(async () => {
    await migrate();
    admin = await insertAdminUser(db);
    trusted = await insertUser(db, { requiresTransactionApproval: false });
    stranger = await insertUser(db, { requiresTransactionApproval: false });

    checking = await makeCashAccount(db, admin, trusted.id, {
      name: "History Checking",
    });
    savings = await makeCashAccount(db, admin, trusted.id, {
      name: "History Savings",
    });

    const caller = createTestCaller(db, makeSession(trusted));
    await caller.user.cash.deposit({ accountId: checking, amount: 1000 });
    await caller.user.cash.withdraw({ accountId: checking, amount: 200 });
    await caller.user.cash.transfer({
      fromAccountId: checking,
      toAccountId: savings,
      amount: 300,
    });
  });

  it("returns every transaction touching the account", async () => {
    const caller = createTestCaller(db, makeSession(trusted));
    const rows = await caller.user.cash.getTransactions({
      accountId: checking,
    });
    expect(rows).toHaveLength(3);
  });

  it("labels direction from the perspective of the queried account", async () => {
    const caller = createTestCaller(db, makeSession(trusted));
    const rows = await caller.user.cash.getTransactions({
      accountId: checking,
    });

    const byType = Object.fromEntries(rows.map((r) => [r.transactionType, r]));
    expect(byType.deposit!.direction).toBe("credit");
    expect(byType.withdrawal!.direction).toBe("debit");
    expect(byType.transfer!.direction).toBe("debit");
  });

  it("shows the same transfer as a credit on the receiving account", async () => {
    const caller = createTestCaller(db, makeSession(trusted));
    const rows = await caller.user.cash.getTransactions({ accountId: savings });

    expect(rows).toHaveLength(1);
    expect(rows[0]!.transactionType).toBe("transfer");
    expect(rows[0]!.direction).toBe("credit");
  });

  it("resolves the counterparty account on a transfer", async () => {
    const caller = createTestCaller(db, makeSession(trusted));
    const rows = await caller.user.cash.getTransactions({ accountId: savings });

    expect(rows[0]!.counterparty?.accountName).toBe("History Checking");
  });

  it("leaves counterparty null for deposits and withdrawals", async () => {
    const caller = createTestCaller(db, makeSession(trusted));
    const rows = await caller.user.cash.getTransactions({
      accountId: checking,
    });

    const deposit = rows.find((r) => r.transactionType === "deposit");
    expect(deposit!.counterparty).toBeNull();
  });

  it("respects the limit", async () => {
    const caller = createTestCaller(db, makeSession(trusted));
    const rows = await caller.user.cash.getTransactions({
      accountId: checking,
      limit: 2,
    });
    expect(rows).toHaveLength(2);
  });

  it("throws FORBIDDEN for another user's account", async () => {
    const caller = createTestCaller(db, makeSession(stranger));
    await expectTRPCError(
      caller.user.cash.getTransactions({ accountId: checking }),
      "FORBIDDEN",
    );
  });

  it("still returns history for a closed account", async () => {
    await db
      .update(cashAccounts)
      .set({ status: "closed" })
      .where(eq(cashAccounts.id, savings));

    const caller = createTestCaller(db, makeSession(trusted));
    const rows = await caller.user.cash.getTransactions({ accountId: savings });
    expect(rows).toHaveLength(1);

    await db
      .update(cashAccounts)
      .set({ status: "active" })
      .where(eq(cashAccounts.id, savings));
  });
});

// ---------------------------------------------------------------------------
// admin.transactions.pending
// ---------------------------------------------------------------------------

describe("admin.transactions.pending", () => {
  const { db, migrate } = createTestDb();
  let admin: FakeUser;
  let supervised: FakeUser;
  let trusted: FakeUser;
  let supervisedAccount: string;

  beforeAll(async () => {
    await migrate();
    admin = await insertAdminUser(db);
    supervised = await insertUser(db, {
      name: "Supervised Sam",
      requiresTransactionApproval: true,
    });
    trusted = await insertUser(db, { requiresTransactionApproval: false });

    supervisedAccount = await makeCashAccount(db, admin, supervised.id, {
      name: "Queue Account",
      balance: 500,
    });
    const trustedAccount = await makeCashAccount(db, admin, trusted.id, {
      name: "Auto Account",
      balance: 500,
    });

    await createTestCaller(db, makeSession(supervised)).user.cash.deposit({
      accountId: supervisedAccount,
      amount: 150,
    });
    // A trusted user's transaction completes immediately and must not queue.
    await createTestCaller(db, makeSession(trusted)).user.cash.deposit({
      accountId: trustedAccount,
      amount: 150,
    });
  });

  it("throws FORBIDDEN for a non-admin user", async () => {
    const caller = createTestCaller(db, makeSession(supervised));
    await expectTRPCError(caller.admin.transactions.pending(), "FORBIDDEN");
  });

  it("throws UNAUTHORIZED when unauthenticated", async () => {
    const caller = createTestCaller(db, null);
    await expectTRPCError(caller.admin.transactions.pending(), "UNAUTHORIZED");
  });

  it("lists only pending transactions", async () => {
    const caller = createTestCaller(db, makeSession(admin));
    const rows = await caller.admin.transactions.pending();

    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("pending");
    expect(rows[0]!.cashAccountId).toBe(supervisedAccount);
  });

  it("includes the submitting user and the account", async () => {
    const caller = createTestCaller(db, makeSession(admin));
    const rows = await caller.admin.transactions.pending();

    expect(rows[0]!.createdBy.email).toBe(supervised.email);
    expect(rows[0]!.cashAccount.accountName).toBe("Queue Account");
  });
});

// ---------------------------------------------------------------------------
// admin.transactions.approve
// ---------------------------------------------------------------------------

describe("admin.transactions.approve", () => {
  const { db, migrate } = createTestDb();
  let admin: FakeUser;
  let supervised: FakeUser;

  beforeAll(async () => {
    await migrate();
    admin = await insertAdminUser(db);
    supervised = await insertUser(db, { requiresTransactionApproval: true });
  });

  /** Queue a pending transaction and return its id. */
  async function queueDeposit(accountId: string, amount: number) {
    const { transaction } = await createTestCaller(
      db,
      makeSession(supervised),
    ).user.cash.deposit({ accountId, amount });
    return transaction.id;
  }

  it("throws FORBIDDEN for a non-admin user", async () => {
    const accountId = await makeCashAccount(db, admin, supervised.id, {
      name: "Perm Check",
    });
    const id = await queueDeposit(accountId, 10);

    const caller = createTestCaller(db, makeSession(supervised));
    await expectTRPCError(
      caller.admin.transactions.approve({
        transactionId: id,
        action: "approve",
      }),
      "FORBIDDEN",
    );
  });

  it("throws NOT_FOUND for an unknown transaction", async () => {
    const caller = createTestCaller(db, makeSession(admin));
    await expectTRPCError(
      caller.admin.transactions.approve({
        transactionId: "nope",
        action: "approve",
      }),
      "NOT_FOUND",
    );
  });

  it("approving a deposit credits the balance and completes the row", async () => {
    const accountId = await makeCashAccount(db, admin, supervised.id, {
      name: "Approve Deposit",
    });
    const id = await queueDeposit(accountId, 425.5);

    const caller = createTestCaller(db, makeSession(admin));
    const result = await caller.admin.transactions.approve({
      transactionId: id,
      action: "approve",
    });

    expect(result.status).toBe("completed");
    expect(result.transaction.approvedByAdminId).toBe(admin.id);
    expect(result.transaction.approvedAt).toBeInstanceOf(Date);
    expect(await balanceOf(db, accountId)).toBe(425.5);
  });

  it("rejecting leaves the balance untouched", async () => {
    const accountId = await makeCashAccount(db, admin, supervised.id, {
      name: "Reject Deposit",
      balance: 60,
    });
    const id = await queueDeposit(accountId, 1000);

    const caller = createTestCaller(db, makeSession(admin));
    const result = await caller.admin.transactions.approve({
      transactionId: id,
      action: "reject",
    });

    expect(result.status).toBe("rejected");
    expect(result.transaction.approvedByAdminId).toBe(admin.id);
    expect(await balanceOf(db, accountId)).toBe(60);
  });

  it("approving a transfer moves money on both sides", async () => {
    const from = await makeCashAccount(db, admin, supervised.id, {
      name: "Xfer From",
      balance: 900,
    });
    const to = await makeCashAccount(db, admin, supervised.id, {
      name: "Xfer To",
      balance: 100,
    });

    const { transaction } = await createTestCaller(
      db,
      makeSession(supervised),
    ).user.cash.transfer({
      fromAccountId: from,
      toAccountId: to,
      amount: 250,
    });

    await createTestCaller(db, makeSession(admin)).admin.transactions.approve({
      transactionId: transaction.id,
      action: "approve",
    });

    expect(await balanceOf(db, from)).toBe(650);
    expect(await balanceOf(db, to)).toBe(350);
  });

  it("refuses to act on a transaction that is no longer pending", async () => {
    const accountId = await makeCashAccount(db, admin, supervised.id, {
      name: "Double Approve",
    });
    const id = await queueDeposit(accountId, 50);

    const caller = createTestCaller(db, makeSession(admin));
    await caller.admin.transactions.approve({
      transactionId: id,
      action: "approve",
    });

    await expectCashError(
      caller.admin.transactions.approve({
        transactionId: id,
        action: "approve",
      }),
      "already_decided",
    );
    // Balance credited exactly once.
    expect(await balanceOf(db, accountId)).toBe(50);
  });

  it("fails and rolls back when funds were spent while the request sat pending", async () => {
    const accountId = await makeCashAccount(db, admin, supervised.id, {
      name: "Drained",
      balance: 100,
    });

    const { transaction } = await createTestCaller(
      db,
      makeSession(supervised),
    ).user.cash.withdraw({ accountId, amount: 80 });

    // Pending withdrawals do not reserve funds — drain the account first.
    await db
      .update(cashAccounts)
      .set({ balance: 50 })
      .where(eq(cashAccounts.id, accountId));

    const caller = createTestCaller(db, makeSession(admin));
    await expectCashError(
      caller.admin.transactions.approve({
        transactionId: transaction.id,
        action: "approve",
      }),
      "insufficient_funds",
    );

    // Neither the balance nor the status moved.
    expect(await balanceOf(db, accountId)).toBe(50);
    const row = await db.query.cashTransactions.findFirst({
      where: eq(cashTransactions.id, transaction.id),
    });
    expect(row!.status).toBe("pending");
  });

  it("fails and rolls back when the account was closed while pending", async () => {
    const accountId = await makeCashAccount(db, admin, supervised.id, {
      name: "Closed While Pending",
      balance: 500,
    });

    const { transaction } = await createTestCaller(
      db,
      makeSession(supervised),
    ).user.cash.deposit({ accountId, amount: 25 });

    await db
      .update(cashAccounts)
      .set({ status: "closed" })
      .where(eq(cashAccounts.id, accountId));

    const caller = createTestCaller(db, makeSession(admin));
    await expectCashError(
      caller.admin.transactions.approve({
        transactionId: transaction.id,
        action: "approve",
      }),
      "account_closed",
    );

    expect(await balanceOf(db, accountId)).toBe(500);
    const row = await db.query.cashTransactions.findFirst({
      where: eq(cashTransactions.id, transaction.id),
    });
    expect(row!.status).toBe("pending");
  });

  it("a rejected transaction can still be rejected only once", async () => {
    const accountId = await makeCashAccount(db, admin, supervised.id, {
      name: "Reject Twice",
    });
    const id = await queueDeposit(accountId, 15);

    const caller = createTestCaller(db, makeSession(admin));
    await caller.admin.transactions.approve({
      transactionId: id,
      action: "reject",
    });
    await expectCashError(
      caller.admin.transactions.approve({
        transactionId: id,
        action: "approve",
      }),
      "already_decided",
    );
  });
});
