import { test, expect } from "@playwright/test";
import { ADMIN_AUTH_FILE, USER_AUTH_FILE } from "../../playwright.config";
import { USER } from "./credentials";

test.describe("dashboard — regular user", () => {
  test.use({ storageState: USER_AUTH_FILE });

  test("dashboard loads and shows welcome message", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator("text=Kitty Bank Dashboard")).toBeVisible();
    await expect(
      page.locator(`text=Welcome, ${USER.name}`),
    ).toBeVisible();
  });

  test("dashboard shows net worth summary", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator("text=Total Net Worth")).toBeVisible();
  });

  test("dashboard shows empty state when user has no accounts", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(
      page.locator("text=No accounts yet. Contact your administrator"),
    ).toBeVisible();
  });

  test("regular user cannot access /admin", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).not.toHaveURL(/\/admin/);
  });

  test("sign out returns to home page", async ({ page }) => {
    await page.goto("/dashboard");
    await page.click('button:has-text("Sign out")');
    await expect(page).not.toHaveURL(/\/dashboard/);
  });
});

test.describe("dashboard — admin user", () => {
  test.use({ storageState: ADMIN_AUTH_FILE });

  test("admin user can also access their dashboard", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator("text=Kitty Bank Dashboard")).toBeVisible();
  });

  test("admin user can navigate to /admin from dashboard", async ({ page }) => {
    // Admin should be able to reach /admin directly
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin/);
  });
});
