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
 * Force a user's `requires_transaction_approval` setting to a known value.
 *
 * Other specs toggle this flag, so anything depending on the approval workflow
 * has to set it explicitly rather than assume the seeded default.
 */
export async function setApprovalRequirement(
  browser: Browser,
  email: string,
  required: boolean,
) {
  const context = await browser.newContext({ storageState: ADMIN_AUTH_FILE });
  try {
    const page = await context.newPage();
    await page.goto("/admin");
    await page.click('[data-testid="tab-users"]');

    const row = page.locator("tr", { hasText: email });
    await expect(row).toBeVisible();

    const label = row.locator('[data-testid="approval-label"]');
    const want = required ? "Yes" : "No";
    if ((await label.textContent())?.trim() !== want) {
      await row.locator('[data-testid="approval-toggle"]').click();
      await expect(label).toHaveText(want);
    }
  } finally {
    await context.close();
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

/** Open an account's detail page from the dashboard. */
export async function openAccount(page: Page, accountName: string) {
  await page.goto("/dashboard");
  const card = page
    .locator('a[href*="/dashboard/accounts/"]', { hasText: accountName })
    .first();
  await expect(card).toBeVisible();
  await card.click();
  await expect(page).toHaveURL(/\/dashboard\/accounts\//);
}

/** Read the numeric value out of the balance card on an account detail page. */
export async function readBalance(page: Page): Promise<number> {
  const locator = page.locator('[data-testid="account-balance"]');
  await expect(locator).toBeVisible();
  const text = (await locator.textContent()) ?? "";
  return Number(text.replace(/[^0-9.-]/g, ""));
}

/** Fill in and submit the cash transaction form on an account detail page. */
export async function submitTransaction(
  page: Page,
  opts: {
    mode: "deposit" | "withdraw" | "transfer";
    amount: number;
    description?: string;
    targetAccountName?: string;
  },
) {
  await page.click(`[data-testid="mode-${opts.mode}"]`);
  await page.fill('[data-testid="amount-input"]', String(opts.amount));

  if (opts.description) {
    await page.fill('[data-testid="description-input"]', opts.description);
  }

  if (opts.mode === "transfer") {
    // Option labels carry the account number too, so match on text and read
    // back the id rather than trying for an exact label match.
    const select = page.locator('[data-testid="transfer-target"]');
    const option = select.locator("option", {
      hasText: opts.targetAccountName ?? "",
    });
    await expect(option.first()).toBeAttached();
    await select.selectOption((await option.first().getAttribute("value"))!);
  }

  await page.click('[data-testid="submit-transaction"]');
}
