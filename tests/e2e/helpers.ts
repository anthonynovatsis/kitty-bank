import { expect, type Browser, type Page } from "@playwright/test";
import { ADMIN_AUTH_FILE } from "../../playwright.config";

export type AccountSpec = {
  /** Display name of the user, as typed into the admin search combobox. */
  userName: string;
  accountName: string;
  accountType: "cash" | "investment";
  cashAccountType?: "checking" | "savings";
};

/** Create an account through the admin UI. Assumes `page` is an admin session. */
export async function createAccount(page: Page, opts: AccountSpec) {
  await page.goto("/admin");
  await page.click('button:has-text("Create Account")');
  await expect(page.locator("text=Create New Account")).toBeVisible();

  await page.click('button:has-text("Search for a user")');
  await page.fill(
    'input[placeholder="Type to search users..."]',
    opts.userName,
  );
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

/**
 * Ensure an account exists, creating it only if absent.
 *
 * The e2e database persists for the whole run (and across re-runs in UI mode),
 * so every fixture here has to be idempotent.
 *
 * `ownerAuthFile` is the session whose dashboard is checked for the account;
 * creation always happens through an admin session.
 */
export async function ensureAccount(
  browser: Browser,
  opts: AccountSpec & { ownerAuthFile: string },
) {
  const ownerContext = await browser.newContext({
    storageState: opts.ownerAuthFile,
  });
  try {
    const page = await ownerContext.newPage();
    await page.goto("/dashboard");
    const existing = page.locator('a[href*="/dashboard/accounts/"]', {
      hasText: opts.accountName,
    });
    if ((await existing.count()) > 0) return;
  } finally {
    await ownerContext.close();
  }

  const adminContext = await browser.newContext({
    storageState: ADMIN_AUTH_FILE,
  });
  try {
    await createAccount(await adminContext.newPage(), opts);
  } finally {
    await adminContext.close();
  }
}

/**
 * Sign up a brand-new user and return their session.
 *
 * For assertions that need a provably empty account list — the seeded users
 * accumulate accounts as other specs run, so they can't stand in for one.
 * Caller owns the returned context and must close it.
 */
export async function signUpFreshUser(browser: Browser) {
  // The empty storageState is required, not merely tidy: a describe-level
  // `test.use({ storageState })` reaches browser.newContext(), so omitting it
  // hands back a context that is already signed in as the seeded user.
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  const email = `fresh-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@test.com`;

  await page.goto("/signup");
  await page.waitForSelector("#name");
  await page.fill("#name", "Fresh User");
  await page.fill("#email", email);
  await page.fill("#password", "Fresh123!");
  await page.fill("#confirm-password", "Fresh123!");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard");

  return { context, page, email };
}
