import { test, expect } from "@playwright/test";
import { ADMIN_AUTH_FILE, USER_AUTH_FILE } from "../../playwright.config";
import { ADMIN, USER } from "./credentials";

test.describe("admin users tab — admin user", () => {
  test.use({ storageState: ADMIN_AUTH_FILE });

  test("Users tab is visible on the admin page", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.locator('button:has-text("Users")')).toBeVisible();
  });

  test("clicking Users tab shows the user management table", async ({
    page,
  }) => {
    await page.goto("/admin");
    await page.click('button:has-text("Users")');
    await expect(
      page.locator("h3", { hasText: "User Management" }),
    ).toBeVisible();
  });

  test("users table lists the admin user", async ({ page }) => {
    await page.goto("/admin");
    await page.click('button:has-text("Users")');
    await expect(page.locator(`td:has-text("${ADMIN.email}")`)).toBeVisible();
  });

  test("users table lists the regular user", async ({ page }) => {
    await page.goto("/admin");
    await page.click('button:has-text("Users")');
    await expect(page.locator(`td:has-text("${USER.email}")`)).toBeVisible();
  });

  test("admin user shows Admin role badge", async ({ page }) => {
    await page.goto("/admin");
    await page.click('button:has-text("Users")');

    // Role badge has inline-block + rounded-full classes; use exact text to
    // avoid matching "Admin User" in the name cell
    const adminRow = page.locator("tr", { hasText: ADMIN.email });
    await expect(
      adminRow.locator("span.inline-block", { hasText: "Admin" }),
    ).toBeVisible();
  });

  test("regular user shows User role badge", async ({ page }) => {
    await page.goto("/admin");
    await page.click('button:has-text("Users")');

    const userRow = page.locator("tr", { hasText: USER.email });
    await expect(
      userRow.locator("span.inline-block", { hasText: "User" }),
    ).toBeVisible();
  });

  test("toggling approval setting updates the toggle state", async ({
    page,
  }) => {
    await page.goto("/admin");
    await page.click('button:has-text("Users")');

    const userRow = page.locator("tr", { hasText: USER.email });
    await expect(userRow).toBeVisible();

    // The Yes/No label is inside the <label> element; the role badge is not
    const toggleLabel = userRow.locator("label span.text-xs");
    const toggleBefore = await toggleLabel.textContent();
    await userRow.locator("div.rounded-full.cursor-pointer").click();

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
