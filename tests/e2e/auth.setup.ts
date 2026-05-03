import { test, type Page } from "@playwright/test";
import { ADMIN_AUTH_FILE, USER_AUTH_FILE } from "../../playwright.config";
import { ADMIN, USER } from "./credentials";

type Credentials = { name: string; email: string; password: string };

// Try to sign in; if that fails (no account yet), sign up instead.
// This makes the setup idempotent so re-runs in UI mode work correctly.
async function ensureSession(page: Page, credentials: Credentials) {
  await page.goto("/signin");
  await page.waitForSelector("#email");
  await page.fill("#email", credentials.email);
  await page.fill("#password", credentials.password);
  await page.click('button[type="submit"]');

  // If sign-in succeeds we land on /dashboard — done.
  let landed = false;
  try {
    await page.waitForURL("**/dashboard", { timeout: 5000 });
    landed = true;
  } catch {
    // Sign-in failed — account doesn't exist yet, fall through to sign up.
  }

  if (!landed) {
    // Account doesn't exist yet — sign up.
    await page.goto("/signup");
    await page.waitForSelector("#name");
    await page.fill("#name", credentials.name);
    await page.fill("#email", credentials.email);
    await page.fill("#password", credentials.password);
    await page.fill("#confirm-password", credentials.password);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard");
  }
}

// The first user to sign up becomes admin via the databaseHook in better-auth config
test("sign up admin user and save session", async ({ page, context }) => {
  await ensureSession(page, ADMIN);
  await context.storageState({ path: ADMIN_AUTH_FILE });
});

test("sign up regular user and save session", async ({ page, context }) => {
  await ensureSession(page, USER);
  await context.storageState({ path: USER_AUTH_FILE });
});
