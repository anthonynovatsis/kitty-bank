import { test, expect } from "@playwright/test";
import { ADMIN_AUTH_FILE, USER_AUTH_FILE } from "../../playwright.config";
import { ADMIN, USER } from "./credentials";

test.describe("admin users tab — admin user", () => {
  test.use({ storageState: ADMIN_AUTH_FILE });

  test("Users tab is visible on the admin page", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.locator('[data-testid="tab-users"]')).toBeVisible();
  });

  test("clicking Users tab shows the user management table", async ({
    page,
  }) => {
    await page.goto("/admin");
    await page.click('[data-testid="tab-users"]');
    await expect(
      page.locator("h3", { hasText: "User Management" }),
    ).toBeVisible();
  });

  test("users table lists the admin user", async ({ page }) => {
    await page.goto("/admin");
    await page.click('[data-testid="tab-users"]');
    await expect(page.locator(`td:has-text("${ADMIN.email}")`)).toBeVisible();
  });

  test("users table lists the regular user", async ({ page }) => {
    await page.goto("/admin");
    await page.click('[data-testid="tab-users"]');
    await expect(page.locator(`td:has-text("${USER.email}")`)).toBeVisible();
  });

  test("admin user shows Admin role badge", async ({ page }) => {
    await page.goto("/admin");
    await page.click('[data-testid="tab-users"]');

    const adminRow = page.locator("tr", { hasText: ADMIN.email });
    await expect(
      adminRow.locator('[data-testid="role-badge"]', { hasText: "Admin" }),
    ).toBeVisible();
  });

  test("regular user shows User role badge", async ({ page }) => {
    await page.goto("/admin");
    await page.click('[data-testid="tab-users"]');

    const userRow = page.locator("tr", { hasText: USER.email });
    await expect(
      userRow.locator('[data-testid="role-badge"]', { hasText: "User" }),
    ).toBeVisible();
  });

  test("toggling approval setting updates the toggle state", async ({
    page,
  }) => {
    await page.goto("/admin");
    await page.click('[data-testid="tab-users"]');

    const userRow = page.locator("tr", { hasText: USER.email });
    await expect(userRow).toBeVisible();

    const toggleLabel = userRow.locator('[data-testid="approval-label"]');
    const toggleBefore = await toggleLabel.textContent();
    await userRow.locator('[data-testid="approval-toggle"]').click();

    const expectedAfter = toggleBefore?.trim() === "Yes" ? "No" : "Yes";
    await expect(toggleLabel).toHaveText(expectedAfter);
  });
});

test.describe("admin users tab — regular user", () => {
  test.use({ storageState: USER_AUTH_FILE });

  test("regular user cannot access /admin and see the users tab", async ({
    page,
  }) => {
    await page.goto("/admin");
    await expect(page).not.toHaveURL(/\/admin/);
  });
});
