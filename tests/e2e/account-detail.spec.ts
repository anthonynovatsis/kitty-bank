import { test, expect } from "@playwright/test";
import { ADMIN_AUTH_FILE } from "../../playwright.config";
import { ADMIN } from "./credentials";
import { ensureAccount } from "./helpers";

test.describe("account detail — cash account", () => {
  test.use({ storageState: ADMIN_AUTH_FILE });

  test.beforeAll(async ({ browser }) => {
    await ensureAccount(browser, {
      ownerAuthFile: ADMIN_AUTH_FILE,
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
    const card = page
      .locator('a[href*="/dashboard/accounts/"]', {
        hasText: "E2E Checking Detail",
      })
      .first();
    await expect(card).toBeVisible();
    await card.click();

    await expect(page).toHaveURL(/\/dashboard\/accounts\//);
  });

  test("cash detail page shows account name and balance", async ({ page }) => {
    await page.goto("/dashboard");
    const card = page
      .locator('a[href*="/dashboard/accounts/"]', {
        hasText: "E2E Checking Detail",
      })
      .first();
    await card.click();

    await expect(
      page.locator("h1", { hasText: "E2E Checking Detail" }),
    ).toBeVisible();
    await expect(page.locator("text=Current Balance")).toBeVisible();
    await expect(page.locator('[data-testid="account-balance"]')).toHaveText(
      "$0.00",
    );
  });

  test("cash detail page shows account number and type", async ({ page }) => {
    await page.goto("/dashboard");
    const card = page
      .locator('a[href*="/dashboard/accounts/"]', {
        hasText: "E2E Checking Detail",
      })
      .first();
    await card.click();
    await expect(page).toHaveURL(/\/dashboard\/accounts\//);

    await expect(
      page.locator("[data-testid='account-subtitle']"),
    ).toContainText("checking");
    await expect(page.locator("[data-testid='status-badge']")).toContainText(
      "Active",
    );
  });

  test("back to dashboard link returns to /dashboard", async ({ page }) => {
    await page.goto("/dashboard");
    const card = page
      .locator('a[href*="/dashboard/accounts/"]', {
        hasText: "E2E Checking Detail",
      })
      .first();
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
      ownerAuthFile: ADMIN_AUTH_FILE,
      userName: ADMIN.name,
      accountName: "E2E Portfolio Detail",
      accountType: "investment",
    });
  });

  test("clicking an investment account card navigates to detail page", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    const card = page
      .locator('a[href*="/dashboard/accounts/"]', {
        hasText: "E2E Portfolio Detail",
      })
      .first();
    await expect(card).toBeVisible();
    await card.click();

    await expect(page).toHaveURL(/\/dashboard\/accounts\//);
  });

  test("investment detail page shows portfolio value and holdings section", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    const card = page
      .locator('a[href*="/dashboard/accounts/"]', {
        hasText: "E2E Portfolio Detail",
      })
      .first();
    await card.click();

    await expect(
      page.locator("h1", { hasText: "E2E Portfolio Detail" }),
    ).toBeVisible();
    await expect(page.locator("text=Portfolio Value")).toBeVisible();
    await expect(page.locator("text=$0.00")).toBeVisible();
    await expect(
      page.locator("[data-testid='holdings-section']"),
    ).toBeVisible();
    await expect(
      page.locator("[data-testid='holdings-section']"),
    ).toContainText("No holdings yet.");
  });

  test("investment detail page shows active status", async ({ page }) => {
    await page.goto("/dashboard");
    const card = page
      .locator('a[href*="/dashboard/accounts/"]', {
        hasText: "E2E Portfolio Detail",
      })
      .first();
    await card.click();

    await expect(page.locator("[data-testid='status-badge']")).toContainText(
      "Active",
    );
  });
});

test.describe("account detail — access control", () => {
  test("unauthenticated user is redirected to /signin", async ({ page }) => {
    await page.goto("/dashboard/accounts/any-id");
    await expect(page).toHaveURL(/\/signin/);
  });
});
