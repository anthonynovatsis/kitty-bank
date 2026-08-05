import { test, expect } from "@playwright/test";
import { ADMIN_AUTH_FILE, USER_AUTH_FILE } from "../../playwright.config";
import { ADMIN, USER } from "./credentials";
import {
  ensureAccount,
  openAccount,
  readBalance,
  setApprovalRequirement,
  submitTransaction,
} from "./helpers";

const SOURCE = "E2E Txn Source";
const TARGET = "E2E Txn Target";
const SUPERVISED = "E2E Txn Supervised";

// The admin is seeded with requires_transaction_approval = false, so anything
// they submit settles on the spot.
test.describe("cash transactions — auto-approved user", () => {
  test.use({ storageState: ADMIN_AUTH_FILE });

  test.beforeAll(async ({ browser }) => {
    await setApprovalRequirement(browser, ADMIN.email, false);
    for (const accountName of [SOURCE, TARGET]) {
      await ensureAccount(browser, {
        ownerAuthFile: ADMIN_AUTH_FILE,
        userName: ADMIN.name,
        accountName,
        accountType: "cash",
        cashAccountType: "checking",
      });
    }
  });

  test("the transaction form is shown on a cash account", async ({ page }) => {
    await openAccount(page, SOURCE);
    await expect(
      page.locator('[data-testid="cash-transaction-forms"]'),
    ).toBeVisible();
    await expect(page.locator('[data-testid="mode-deposit"]')).toBeVisible();
    await expect(page.locator('[data-testid="mode-withdraw"]')).toBeVisible();
    await expect(page.locator('[data-testid="mode-transfer"]')).toBeVisible();
  });

  test("a deposit settles immediately and credits the balance", async ({
    page,
  }) => {
    await openAccount(page, SOURCE);
    const before = await readBalance(page);

    await submitTransaction(page, {
      mode: "deposit",
      amount: 500,
      description: "E2E deposit",
    });

    await expect(page.locator('[data-testid="transaction-result"]')).toHaveText(
      "Transaction completed.",
    );
    await expect
      .poll(() => readBalance(page))
      .toBe(Number((before + 500).toFixed(2)));
  });

  test("the deposit shows in history as completed", async ({ page }) => {
    await openAccount(page, SOURCE);

    const row = page
      .locator('[data-testid="transaction-row"]', { hasText: "E2E deposit" })
      .first();
    await expect(row).toBeVisible();
    await expect(row.locator('[data-testid="transaction-status"]')).toHaveText(
      "completed",
    );
    await expect(row.locator('[data-testid="transaction-type"]')).toContainText(
      "deposit",
    );
  });

  test("a withdrawal debits the balance", async ({ page }) => {
    await openAccount(page, SOURCE);
    const before = await readBalance(page);

    await submitTransaction(page, {
      mode: "withdraw",
      amount: 120.5,
      description: "E2E withdrawal",
    });

    await expect(page.locator('[data-testid="transaction-result"]')).toHaveText(
      "Transaction completed.",
    );
    await expect
      .poll(() => readBalance(page))
      .toBe(Number((before - 120.5).toFixed(2)));
  });

  test("a withdrawal beyond the balance is rejected with an error", async ({
    page,
  }) => {
    await openAccount(page, SOURCE);
    const before = await readBalance(page);

    await submitTransaction(page, {
      mode: "withdraw",
      amount: before + 10_000,
    });

    await expect(
      page.locator('[data-testid="transaction-error"]'),
    ).toContainText("Insufficient funds");
    expect(await readBalance(page)).toBe(before);
  });

  test("a transfer moves money to the other account", async ({ page }) => {
    await openAccount(page, SOURCE);
    const sourceBefore = await readBalance(page);

    await submitTransaction(page, {
      mode: "transfer",
      amount: 75,
      description: "E2E transfer",
      targetAccountName: TARGET,
    });

    await expect(page.locator('[data-testid="transaction-result"]')).toHaveText(
      "Transaction completed.",
    );
    await expect
      .poll(() => readBalance(page))
      .toBe(Number((sourceBefore - 75).toFixed(2)));

    // The same transaction shows on the receiving account as a credit.
    await openAccount(page, TARGET);
    const row = page
      .locator('[data-testid="transaction-row"]', { hasText: "E2E transfer" })
      .first();
    await expect(row).toBeVisible();
    await expect(
      row.locator('[data-testid="transaction-amount"]'),
    ).toContainText("+");
  });
});

// A user with requires_transaction_approval = true queues everything for review.
test.describe("cash transactions — approval workflow", () => {
  test.beforeAll(async ({ browser }) => {
    await ensureAccount(browser, {
      ownerAuthFile: USER_AUTH_FILE,
      userName: USER.name,
      accountName: SUPERVISED,
      accountType: "cash",
      cashAccountType: "savings",
    });
    await setApprovalRequirement(browser, USER.email, true);
  });

  test("a supervised user's deposit is queued and leaves the balance alone", async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: USER_AUTH_FILE });
    const page = await context.newPage();
    try {
      await openAccount(page, SUPERVISED);
      const before = await readBalance(page);

      await submitTransaction(page, {
        mode: "deposit",
        amount: 42,
        description: "E2E queued deposit",
      });

      await expect(
        page.locator('[data-testid="transaction-result"]'),
      ).toContainText("Submitted for approval");
      expect(await readBalance(page)).toBe(before);

      const row = page
        .locator('[data-testid="transaction-row"]', {
          hasText: "E2E queued deposit",
        })
        .first();
      await expect(
        row.locator('[data-testid="transaction-status"]'),
      ).toHaveText("pending");
    } finally {
      await context.close();
    }
  });

  test("admin approves a pending deposit and the balance updates", async ({
    browser,
  }) => {
    const description = `E2E approve ${Date.now()}`;

    // 1. The supervised user submits a deposit.
    const userContext = await browser.newContext({
      storageState: USER_AUTH_FILE,
    });
    const userPage = await userContext.newPage();
    let balanceBefore = 0;
    try {
      await openAccount(userPage, SUPERVISED);
      balanceBefore = await readBalance(userPage);
      await submitTransaction(userPage, {
        mode: "deposit",
        amount: 200,
        description,
      });
      await expect(
        userPage.locator('[data-testid="transaction-result"]'),
      ).toContainText("Submitted for approval");
    } finally {
      await userContext.close();
    }

    // 2. The admin finds it in the queue and approves it.
    const adminContext = await browser.newContext({
      storageState: ADMIN_AUTH_FILE,
    });
    const adminPage = await adminContext.newPage();
    try {
      await adminPage.goto("/admin");
      await adminPage.click('[data-testid="tab-transactions"]');
      await expect(
        adminPage.locator('[data-testid="pending-transactions"]'),
      ).toBeVisible();

      const queueRow = adminPage
        .locator('[data-testid="pending-transaction-row"]', {
          hasText: description,
        })
        .first();
      await expect(queueRow).toBeVisible();
      await expect(queueRow).toContainText(USER.email);

      await queueRow.locator('[data-testid="approve-button"]').click();
      await expect(queueRow).toHaveCount(0);
    } finally {
      await adminContext.close();
    }

    // 3. The user sees the money and a completed row.
    const verifyContext = await browser.newContext({
      storageState: USER_AUTH_FILE,
    });
    const verifyPage = await verifyContext.newPage();
    try {
      await openAccount(verifyPage, SUPERVISED);
      await expect
        .poll(() => readBalance(verifyPage))
        .toBe(Number((balanceBefore + 200).toFixed(2)));

      const row = verifyPage
        .locator('[data-testid="transaction-row"]', { hasText: description })
        .first();
      await expect(
        row.locator('[data-testid="transaction-status"]'),
      ).toHaveText("completed");
    } finally {
      await verifyContext.close();
    }
  });

  test("admin rejects a pending deposit and no money moves", async ({
    browser,
  }) => {
    const description = `E2E reject ${Date.now()}`;

    const userContext = await browser.newContext({
      storageState: USER_AUTH_FILE,
    });
    const userPage = await userContext.newPage();
    let balanceBefore = 0;
    try {
      await openAccount(userPage, SUPERVISED);
      balanceBefore = await readBalance(userPage);
      await submitTransaction(userPage, {
        mode: "deposit",
        amount: 999,
        description,
      });
      await expect(
        userPage.locator('[data-testid="transaction-result"]'),
      ).toContainText("Submitted for approval");
    } finally {
      await userContext.close();
    }

    const adminContext = await browser.newContext({
      storageState: ADMIN_AUTH_FILE,
    });
    const adminPage = await adminContext.newPage();
    try {
      await adminPage.goto("/admin");
      await adminPage.click('[data-testid="tab-transactions"]');

      const queueRow = adminPage
        .locator('[data-testid="pending-transaction-row"]', {
          hasText: description,
        })
        .first();
      await expect(queueRow).toBeVisible();
      await queueRow.locator('[data-testid="reject-button"]').click();
      await expect(queueRow).toHaveCount(0);
    } finally {
      await adminContext.close();
    }

    const verifyContext = await browser.newContext({
      storageState: USER_AUTH_FILE,
    });
    const verifyPage = await verifyContext.newPage();
    try {
      await openAccount(verifyPage, SUPERVISED);
      expect(await readBalance(verifyPage)).toBe(balanceBefore);

      const row = verifyPage
        .locator('[data-testid="transaction-row"]', { hasText: description })
        .first();
      await expect(
        row.locator('[data-testid="transaction-status"]'),
      ).toHaveText("rejected");
    } finally {
      await verifyContext.close();
    }
  });
});

test.describe("transaction queue — access control", () => {
  test.use({ storageState: USER_AUTH_FILE });

  test("a regular user cannot reach the admin transaction queue", async ({
    page,
  }) => {
    await page.goto("/admin");
    await expect(page).not.toHaveURL(/\/admin/);
  });
});
