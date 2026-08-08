import { test, expect } from "@playwright/test";
import { ADMIN } from "./credentials";

// No storageState — these tests exercise the auth flows directly.

test("unauthenticated /dashboard redirects to /signin", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/signin/);
});

test("sign in with valid credentials lands on dashboard", async ({ page }) => {
  await page.goto("/signin");
  await page.waitForSelector("#email");
  await page.fill("#email", ADMIN.email);
  await page.fill("#password", ADMIN.password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/dashboard/);
});

test("sign in with wrong password shows an error", async ({ page }) => {
  await page.goto("/signin");
  await page.waitForSelector("#email");
  await page.fill("#email", ADMIN.email);
  await page.fill("#password", "wrong-password");
  await page.click('button[type="submit"]');
  await expect(page.locator('[data-testid="signin-error"]')).toBeVisible();
});

test("sign up with a new email lands on dashboard", async ({ page }) => {
  const unique = `newuser-${Date.now()}@test.com`;
  await page.goto("/signup");
  await page.waitForSelector("#name");
  await page.fill("#name", "New User");
  await page.fill("#email", unique);
  await page.fill("#password", "password123");
  await page.fill("#confirm-password", "password123");
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/dashboard/);
});
