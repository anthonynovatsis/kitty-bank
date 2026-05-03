import { test } from "@playwright/test";
import { ADMIN_AUTH_FILE, USER_AUTH_FILE } from "../../playwright.config";
import { ADMIN, USER } from "./credentials";

async function signUp(
  page: Parameters<Parameters<typeof test>[1]>[0],
  credentials: { name: string; email: string; password: string },
) {
  await page.goto("/signup");
  // Wait past the "Loading..." auth check
  await page.waitForSelector("#name");
  await page.fill("#name", credentials.name);
  await page.fill("#email", credentials.email);
  await page.fill("#password", credentials.password);
  await page.fill("#confirm-password", credentials.password);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard");
}

// The first user to sign up becomes admin via the databaseHook in better-auth config
test("sign up admin user and save session", async ({ page, context }) => {
  await signUp(page, ADMIN);
  await context.storageState({ path: ADMIN_AUTH_FILE });
});

test("sign up regular user and save session", async ({ page, context }) => {
  await signUp(page, USER);
  await context.storageState({ path: USER_AUTH_FILE });
});
