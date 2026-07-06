import { test, expect, type Page, type Browser } from "@playwright/test";
import { ADMIN_AUTH_FILE } from "../../playwright.config";
import { ADMIN } from "./credentials";

// Helper: create an account via the admin UI (idempotent — skips if already exists)
async function ensureAccount(
  browser: Browser,
  opts: {
    userName: string;
    accountName: string;
    accountType: "cash" | "investment";
    cashAccountType?: "checking" | "savings";
  },
) {
  const context = await browser.newContext({ storageState: ADMIN_AUTH_FILE });
  const page = await context.newPage();
  try {
    await page.goto("/dashboard");
    const existing = page.locator('a[href*="/dashboard/accounts/"]', {
      hasText: opts.accountName,
    });
    if ((await existing.count()) > 0) return;
    await createAccount(page, opts);
  } finally {
    await context.close();
  }
}

async function createAccount(
  page: Page,
  opts: {
    userName: string;
    accountName: string;
    accountType: "cash" | "investment";
    cashAccountType?: "checking" | "savings";
  },
) {
  await page.goto("/admin");
  await page.click('button:has-text("Create Account")');
  await expect(page.locator("text=Create New Account")).toBeVisible();

  await page.click('button:has-text("Search for a user")');
  await page.fill('input[placeholder="Type to search users..."]', opts.userName);
  await page.waitForSelector(`button:has-text("${opts.userName}")`);
  await page.click(`button:has-text("${opts.userName}")`);

  await page.fill("#account-name", opts.accountName);
  await page.selectOption("#account-type", opts.accountType);
  if (opts.cashAccountType) {
    await page.selectOption("#cash-account-type", opts.cashAccountType);
  }

  const dialogPromise = page.waitForEvent("dialog");
  await page.click('button[type="submit"]:has-text("Create Account")');
  await (await dialogPromise).accept();
  await page.waitForLoadState("networkidle");
}

test.describe("account detail — cash account", () => {
  test.use({ storageState: ADMIN_AUTH_FILE });

  test.beforeAll(async ({ browser }) => {
    await ensureAccount(browser, {
      userName: ADMIN.name,
      accountName: "E2E Checking Detail",
      accountType: "cash",
      cashAccountType: "checking",
    });
  });

  test("clicking a cash account card navigates to detail page", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    const card = page.locator('a[href*="/dashboard/accounts/"]', {
      hasText: "E2E Checking Detail",
    }).first();
    await expect(card).toBeVisible();
    await card.click();

    await expect(page).toHaveURL(/\/dashboard\/accounts\//);
  });

  test("cash detail page shows account name and balance", async ({ page }) => {
    await page.goto("/dashboard");
    const card = page.locator('a[href*="/dashboard/accounts/"]', {
      hasText: "E2E Checking Detail",
    }).first();
    await card.click();

    await expect(
      page.locator("h1", { hasText: "E2E Checking Detail" }),
    ).toBeVisible();
    await expect(page.locator("text=Current Balance")).toBeVisible();
    await expect(page.locator("text=$0.00")).toBeVisible();
  });

  test("cash detail page shows account number and type", async ({ page }) => {
    await page.goto("/dashboard");
    const card = page.locator('a[href*="/dashboard/accounts/"]', {
      hasText: "E2E Checking Detail",
    }).first();
    await card.click();
    await expect(page).toHaveURL(/\/dashboard\/accounts\//);

    await expect(page.locator("[data-testid='account-subtitle']")).toContainText("checking");
    await expect(page.locator("[data-testid='status-badge']")).toContainText("active");
  });

  test("back to dashboard link returns to /dashboard", async ({ page }) => {
    await page.goto("/dashboard");
    const card = page.locator('a[href*="/dashboard/accounts/"]', {
      hasText: "E2E Checking Detail",
    }).first();
    await card.click();
    await expect(page).toHaveURL(/\/dashboard\/accounts\//);

    await page.click('[data-testid="back-to-dashboard"]');
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});

test.describe("account detail — investment account", () => {
  test.use({ storageState: ADMIN_AUTH_FILE });

  test.beforeAll(async ({ browser }) => {
    await ensureAccount(browser, {
      userName: ADMIN.name,
      accountName: "E2E Portfolio Detail",
      accountType: "investment",
    });
  });

  test("clicking an investment account card navigates to detail page", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    const card = page.locator('a[href*="/dashboard/accounts/"]', {
      hasText: "E2E Portfolio Detail",
    }).first();
    await expect(card).toBeVisible();
    await card.click();

    await expect(page).toHaveURL(/\/dashboard\/accounts\//);
  });

  test("investment detail page shows portfolio value and holdings section", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    const card = page.locator('a[href*="/dashboard/accounts/"]', {
      hasText: "E2E Portfolio Detail",
    }).first();
    await card.click();

    await expect(
      page.locator("h1", { hasText: "E2E Portfolio Detail" }),
    ).toBeVisible();
    await expect(page.locator("text=Portfolio Value")).toBeVisible();
    await expect(page.locator("text=$0.00")).toBeVisible();
    await expect(page.locator("[data-testid='holdings-section']")).toBeVisible();
    await expect(page.locator("[data-testid='holdings-section']")).toContainText("No holdings yet.");
  });

  test("investment detail page shows active status", async ({ page }) => {
    await page.goto("/dashboard");
    const card = page.locator('a[href*="/dashboard/accounts/"]', {
      hasText: "E2E Portfolio Detail",
    }).first();
    await card.click();

    await expect(page.locator("[data-testid='status-badge']")).toContainText("active");
  });
});

test.describe("account detail — access control", () => {
  test("unauthenticated user is redirected to /signin", async ({ page }) => {
    await page.goto("/dashboard/accounts/any-id");
    await expect(page).toHaveURL(/\/signin/);
  });
});
