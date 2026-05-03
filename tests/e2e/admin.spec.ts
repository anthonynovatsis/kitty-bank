import { test, expect, type Page } from "@playwright/test";
import { ADMIN_AUTH_FILE, USER_AUTH_FILE } from "../../playwright.config";
import { ADMIN } from "./credentials";

// Helper: open the Create Account dialog and select a user via the combobox
async function openCreateDialog(page: Page, userName: string) {
  await page.click('button:has-text("Create Account")');
  await expect(page.locator("text=Create New Account")).toBeVisible();

  // Open the user combobox and search
  await page.click('button:has-text("Search for a user")');
  await page.fill('input[placeholder="Type to search users..."]', userName);
  await page.waitForSelector(`button:has-text("${userName}")`);
  await page.click(`button:has-text("${userName}")`);
}

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
    await page.waitForSelector('button:has-text("Create Account")');

    await openCreateDialog(page, ADMIN.name);

    await page.fill("#account-name", "My Checking");
    await page.selectOption("#account-type", "cash");
    await page.selectOption("#cash-account-type", "checking");

    // Dismiss the success alert automatically
    page.on("dialog", (d) => d.accept());
    await page.click('button[type="submit"]:has-text("Create Account")');

    // Account should appear in the overview list
    await expect(page.locator("text=My Checking")).toBeVisible();
  });

  test("admin creates an investment account", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForSelector('button:has-text("Create Account")');

    await openCreateDialog(page, ADMIN.name);

    await page.fill("#account-name", "My Portfolio");
    await page.selectOption("#account-type", "investment");

    page.on("dialog", (d) => d.accept());
    await page.click('button[type="submit"]:has-text("Create Account")');

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
