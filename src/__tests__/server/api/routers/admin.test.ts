import { describe, it, expect, beforeAll } from "vitest";
import { TRPCError } from "@trpc/server";
import { createTestDb } from "../../../helpers/db";
import {
  insertAdminUser,
  insertUser,
  makeSession,
  createTestCaller,
} from "../../../helpers/context";


describe("admin.accounts.create", () => {
  const { db, migrate } = createTestDb();

  beforeAll(async () => {
    await migrate();
  });

  it("creates a checking account and returns the correct shape", async () => {
    const admin = await insertAdminUser(db);
    const targetUser = await insertUser(db);

    const caller = createTestCaller(db, makeSession(admin));

    const result = await caller.admin.accounts.create({
      userId: targetUser.id,
      accountType: "cash",
      accountName: "My Checking",
      cashAccountType: "checking",
    });

    expect(result.type).toBe("cash");
    expect(result.account.accountName).toBe("My Checking");
    expect(result.account.accountType).toBe("checking");
    expect(result.account.userId).toBe(targetUser.id);
    expect(result.account.balance).toBe(0);
    expect(result.account.status).toBe("active");
    expect(result.account.accountNumber).toMatch(/^\d{11}$/);
  });
});
