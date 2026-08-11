import { test, expect } from "@playwright/test";
import { ADMIN_AUTH_FILE, USER_AUTH_FILE } from "../../playwright.config";
import { ADMIN, USER } from "./credentials";
import {
  ensureAccount,
  openAccount,
  readCostBasis,
  setApprovalRequirement,
  submitTrade,
} from "./helpers";

const PORTFOLIO = "E2E Trade Portfolio";
const SUPERVISED_PORTFOLIO = "E2E Trade Supervised";

// The admin is seeded with requires_transaction_approval = false, so anything
// they submit settles on the spot.
test.describe("trades — auto-approved user", () => {
  test.use({ storageState: ADMIN_AUTH_FILE });

  test.beforeAll(async ({ browser }) => {
    await setApprovalRequirement(browser, ADMIN.email, false);
    await ensureAccount(browser, {
      ownerAuthFile: ADMIN_AUTH_FILE,
      userName: ADMIN.name,
      accountName: PORTFOLIO,
      accountType: "investment",
    });
  });

  test("the trade form is shown on an investment account", async ({ page }) => {
    await openAccount(page, PORTFOLIO);
    await expect(page.locator('[data-testid="trade-forms"]')).toBeVisible();
    await expect(page.locator('[data-testid="trade-mode-buy"]')).toBeVisible();
    await expect(page.locator('[data-testid="trade-mode-sell"]')).toBeVisible();
  });

  test("a buy executes and opens the position", async ({ page }) => {
    await openAccount(page, PORTFOLIO);
    const before = await readCostBasis(page);

    await submitTrade(page, {
      mode: "buy",
      symbol: "aapl",
      companyName: "Apple Inc",
      quantity: 10,
      price: 20,
      brokerage: 5,
    });

    await expect(page.locator('[data-testid="trade-result"]')).toHaveText(
      "Trade executed.",
    );

    /*
     * Polled, not read once. The card refreshes on the mutation's cache
     * invalidation, which is a second round trip — and the dev tRPC middleware
     * delays every call by up to half a second, so a single read lands on the
     * pre-trade figure.
     *
     * $200 of shares plus the $5 fee to acquire them.
     */
    await expect.poll(() => readCostBasis(page)).toBeCloseTo(before + 205, 2);

    // Lower case in, upper case stored — one position, not two.
    const holdings = page.locator('[data-testid="holdings-section"]');
    await expect(holdings).toContainText("AAPL");
    await expect(holdings).toContainText("Apple Inc");
  });

  test("a sell reports the realised gain and reduces the position", async ({
    page,
  }) => {
    await openAccount(page, PORTFOLIO);

    await submitTrade(page, {
      mode: "buy",
      symbol: "GAIN",
      quantity: 10,
      price: 10,
    });
    await expect(page.locator('[data-testid="trade-result"]')).toBeVisible();

    await submitTrade(page, {
      mode: "sell",
      symbol: "GAIN",
      quantity: 4,
      price: 15,
    });

    // $60 of proceeds against the $40 those 4 shares cost.
    await expect(page.locator('[data-testid="trade-result"]')).toHaveText(
      "Trade executed. Realised $20.00.",
    );

    const row = page
      .locator('[data-testid="holdings-section"] tr', { hasText: "GAIN" })
      .first();
    await expect(row).toContainText("6");
  });

  test("selling more than is held is refused", async ({ page }) => {
    await openAccount(page, PORTFOLIO);

    await submitTrade(page, {
      mode: "sell",
      symbol: "AAPL",
      quantity: 9999,
      price: 20,
    });

    await expect(page.locator('[data-testid="trade-error"]')).toContainText(
      "Insufficient shares",
    );
  });

  test("the form shows what is held before a sale", async ({ page }) => {
    await openAccount(page, PORTFOLIO);

    await page.click('[data-testid="trade-mode-sell"]');
    await page.fill('[data-testid="symbol-input"]', "aapl");
    await expect(page.locator('[data-testid="shares-held"]')).toContainText(
      "Holding 10 shares",
    );

    await page.fill('[data-testid="symbol-input"]', "NOSUCH");
    await expect(page.locator('[data-testid="shares-held"]')).toContainText(
      "No position",
    );
  });

  /*
   * The shares field is `type=number step=1`, so a fraction never reaches the
   * submit handler — native constraint validation blocks the form first. The
   * handler's own whole-number check stays as the backstop for anything that
   * gets past the widget, and the service refuses regardless.
   */
  test("a fractional share count cannot be submitted", async ({ page }) => {
    await openAccount(page, PORTFOLIO);

    await page.click('[data-testid="trade-mode-buy"]');
    await page.fill('[data-testid="symbol-input"]', "FRAC");
    await page.fill('[data-testid="quantity-input"]', "7.5");
    await page.fill('[data-testid="price-input"]', "10");

    const quantity = page.locator('[data-testid="quantity-input"]');
    expect(
      await quantity.evaluate((input: HTMLInputElement) =>
        input.checkValidity(),
      ),
    ).toBe(false);

    await page.click('[data-testid="submit-trade"]');

    // Nothing was recorded: no confirmation, and no such position appears.
    await expect(page.locator('[data-testid="trade-result"]')).toBeHidden();
    await expect(
      page.locator('[data-testid="holdings-section"]'),
    ).not.toContainText("FRAC");
  });

  test("executed trades appear in the history", async ({ page }) => {
    await openAccount(page, PORTFOLIO);

    const history = page.locator('[data-testid="trade-history"]');
    await expect(history).toBeVisible();
    await expect(
      history.locator('[data-testid="trade-row"]').first(),
    ).toContainText(/executed/i);
  });
});

// ---------------------------------------------------------------------------
// The approval workflow, end to end through the merged queue
// ---------------------------------------------------------------------------

test.describe("trades — approval workflow", () => {
  test.beforeAll(async ({ browser }) => {
    await setApprovalRequirement(browser, USER.email, true);
    await ensureAccount(browser, {
      ownerAuthFile: USER_AUTH_FILE,
      userName: USER.name,
      accountName: SUPERVISED_PORTFOLIO,
      accountType: "investment",
    });
  });

  test("a supervised buy queues, then an admin approves it", async ({
    browser,
  }) => {
    const userContext = await browser.newContext({
      storageState: USER_AUTH_FILE,
    });
    const adminContext = await browser.newContext({
      storageState: ADMIN_AUTH_FILE,
    });

    try {
      const userPage = await userContext.newPage();
      await openAccount(userPage, SUPERVISED_PORTFOLIO);

      await submitTrade(userPage, {
        mode: "buy",
        symbol: "QUEUE",
        companyName: "Queued Co",
        quantity: 3,
        price: 30,
        description: "E2E queued buy",
      });

      await expect(
        userPage.locator('[data-testid="trade-result"]'),
      ).toContainText("Submitted for approval");

      // Nothing settles until an admin decides.
      await expect(
        userPage.locator('[data-testid="holdings-section"]'),
      ).not.toContainText("QUEUE");

      const adminPage = await adminContext.newPage();
      await adminPage.goto("/admin");
      await adminPage.click('[data-testid="tab-transactions"]');

      const row = adminPage
        .locator('[data-testid="pending-transaction-row"]', {
          hasText: "E2E queued buy",
        })
        .first();
      await expect(row).toBeVisible();

      // The merged queue labels which kind each row is, and trades carry their
      // own detail line rather than a balance.
      await expect(
        row.locator('[data-testid="pending-transaction-kind"]'),
      ).toContainText("Investment");
      await expect(
        row.locator('[data-testid="pending-trade-detail"]'),
      ).toContainText("3 × QUEUE @ $30.00");

      await row.locator('[data-testid="approve-button"]').click();
      await expect(row).toBeHidden();

      // The position exists only now.
      await openAccount(userPage, SUPERVISED_PORTFOLIO);
      const holdings = userPage.locator('[data-testid="holdings-section"]');
      await expect(holdings).toContainText("QUEUE");
      await expect(holdings).toContainText("Queued Co");
    } finally {
      await userContext.close();
      await adminContext.close();
    }
  });

  test("a rejected trade never reaches the holdings", async ({ browser }) => {
    const userContext = await browser.newContext({
      storageState: USER_AUTH_FILE,
    });
    const adminContext = await browser.newContext({
      storageState: ADMIN_AUTH_FILE,
    });

    try {
      const userPage = await userContext.newPage();
      await openAccount(userPage, SUPERVISED_PORTFOLIO);

      await submitTrade(userPage, {
        mode: "buy",
        symbol: "NOPE",
        quantity: 2,
        price: 10,
        description: "E2E rejected buy",
      });
      await expect(
        userPage.locator('[data-testid="trade-result"]'),
      ).toBeVisible();

      const adminPage = await adminContext.newPage();
      await adminPage.goto("/admin");
      await adminPage.click('[data-testid="tab-transactions"]');

      const row = adminPage
        .locator('[data-testid="pending-transaction-row"]', {
          hasText: "E2E rejected buy",
        })
        .first();
      await row.locator('[data-testid="reject-button"]').click();
      await expect(row).toBeHidden();

      await openAccount(userPage, SUPERVISED_PORTFOLIO);
      await expect(
        userPage.locator('[data-testid="holdings-section"]'),
      ).not.toContainText("NOPE");

      // The refusal is still on the record, as a rejected trade.
      const historyRow = userPage
        .locator('[data-testid="trade-row"]', { hasText: "NOPE" })
        .first();
      // Badges are sentence-cased for display; the stored status is lower case.
      await expect(historyRow).toContainText(/rejected/i);
    } finally {
      await userContext.close();
      await adminContext.close();
    }
  });
});
