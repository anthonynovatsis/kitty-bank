import { test, expect } from "@playwright/test";
import { ADMIN_AUTH_FILE, USER_AUTH_FILE } from "../../playwright.config";
import { ADMIN } from "./credentials";
import { chooseOption, openCreateAccountDialog, withNotice } from "./helpers";

test.describe("admin page — admin user", () => {
  test.use({ storageState: ADMIN_AUTH_FILE });

  test("/admin loads for admin user", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin/);
    await expect(
      page.locator("h1", { hasText: "Account Management" }),
    ).toBeVisible();
  });

  test("admin creates a cash checking account", async ({ page }) => {
    await page.goto("/admin");
    await openCreateAccountDialog(page, ADMIN.name);

    await page.fill('[data-testid="account-name-input"]', "My Checking");
    await chooseOption(page, "account-type-select", "cash");
    await chooseOption(page, "cash-account-type-select", "checking");

    await withNotice(page, () =>
      page.click('[data-testid="create-account-submit"]'),
    );

    // Account should appear in the overview list
    await expect(page.locator("text=My Checking")).toBeVisible();
  });

  test("admin creates an investment account", async ({ page }) => {
    await page.goto("/admin");
    await openCreateAccountDialog(page, ADMIN.name);

    await page.fill('[data-testid="account-name-input"]', "My Portfolio");
    await chooseOption(page, "account-type-select", "investment");

    await withNotice(page, () =>
      page.click('[data-testid="create-account-submit"]'),
    );

    await expect(page.locator("text=My Portfolio")).toBeVisible();
  });
});

test.describe("admin page — regular user", () => {
  test.use({ storageState: USER_AUTH_FILE });

  test("regular user accessing /admin is redirected away", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).not.toHaveURL(/\/admin/);
  });
});

test.describe("admin page — unauthenticated", () => {
  test("unauthenticated /admin redirects to /signin", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/signin/);
  });
});
