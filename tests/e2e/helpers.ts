import { expect, type Browser, type Page } from "@playwright/test";
import { ADMIN_AUTH_FILE } from "../../playwright.config";

/*
 * ---------------------------------------------------------------------------
 * Widget interactions
 *
 * Every spec drives dropdowns, the user combobox and post-mutation
 * confirmations through the four helpers below, and never touches the
 * underlying elements itself.
 *
 * That indirection exists because these three widgets are the ones phase T2 of
 * plans/ui_theming_plan.md swaps for Base UI, and each swap breaks the obvious
 * way of driving it: a Base UI Select renders a button and a portalled popup,
 * so `selectOption()` and `<option>` stop existing, and replacing `alert()`
 * with a toast means there is no native dialog event left to accept. Confining
 * that knowledge here keeps the swap a one-file change.
 * ---------------------------------------------------------------------------
 */

/**
 * Choose a dropdown value.
 *
 * A Base UI Select is a button plus a portalled popup, so this is a click on
 * the trigger and a click on the option — `selectOption()` has nothing to act
 * on. Options carry `option-<value>` testids because Base UI keeps the value
 * in React state and never writes it to the DOM.
 */
export async function chooseOption(page: Page, testId: string, value: string) {
  await page.click(`[data-testid="${testId}"]`);
  // [data-open] is what narrows this to one element. Base UI keeps every
  // select's popup mounted, and [role="listbox"] would also catch the user
  // combobox's cmdk list, which is open at the same time inside the dialog.
  const listbox = page.locator('[data-slot="select-content"][data-open]');
  await expect(listbox).toBeVisible();
  await listbox.locator(`[data-testid="option-${value}"]`).click();
}

/**
 * Choose a dropdown value by what the option reads as on screen.
 *
 * For dropdowns whose values are ids: the label is the only stable handle a
 * spec has, and matching is on substring because labels carry extra detail
 * (account options append the account number).
 */
export async function chooseOptionByLabel(
  page: Page,
  testId: string,
  label: string,
) {
  const trigger = page.locator(`[data-testid="${testId}"]`);
  await trigger.click();
  const listbox = page.locator('[data-slot="select-content"][data-open]');
  await expect(listbox).toBeVisible();
  await listbox.locator('[role="option"]', { hasText: label }).first().click();

  // The trigger must show the label it was picked by. Base UI renders the raw
  // value unless the Select is given `items`, which once left a chosen account
  // displaying its UUID.
  await expect(trigger).toContainText(label);
}

/** Pick a user in the admin search combobox. */
export async function pickUser(page: Page, userName: string) {
  await page.click('[data-testid="user-search-trigger"]');
  await page.fill('[data-testid="user-search-input"]', userName);
  const option = page.locator('[data-testid="user-search-option"]', {
    hasText: userName,
  });
  await expect(option.first()).toBeVisible();
  await option.first().click();
}

/**
 * Run an action that reports its outcome, and wait for that report.
 *
 * Waiting on the toast is what makes this a synchronisation point: it only
 * appears once the mutation has answered, so callers can assert on the
 * resulting page state immediately afterwards.
 */
export async function withNotice(page: Page, action: () => Promise<void>) {
  await action();
  await expect(page.locator("[data-sonner-toast]").first()).toBeVisible();
}

export type AccountSpec = {
  /** Display name of the user, as typed into the admin search combobox. */
  userName: string;
  accountName: string;
  accountType: "cash" | "investment";
  cashAccountType?: "checking" | "savings";
};

/** Open the create-account dialog. Assumes `page` is an admin session on /admin. */
export async function openCreateAccountDialog(page: Page, userName: string) {
  await page.click('[data-testid="create-account-open"]');
  await expect(
    page.locator('[data-testid="create-account-dialog"]'),
  ).toBeVisible();
  await pickUser(page, userName);
}

/** Create an account through the admin UI. Assumes `page` is an admin session. */
export async function createAccount(page: Page, opts: AccountSpec) {
  await page.goto("/admin");
  await openCreateAccountDialog(page, opts.userName);

  await page.fill('[data-testid="account-name-input"]', opts.accountName);
  await chooseOption(page, "account-type-select", opts.accountType);
  if (opts.cashAccountType) {
    await chooseOption(page, "cash-account-type-select", opts.cashAccountType);
  }

  await withNotice(page, () =>
    page.click('[data-testid="create-account-submit"]'),
  );
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

    /*
     * Wait for the list before counting. `count()` does not auto-wait, and the
     * accounts are fetched client-side — reading it on a page still showing the
     * skeleton returns zero, and this helper then creates a duplicate account.
     * A second account with the same name is worse than it sounds: `openAccount`
     * clicks the first card matching the name, so every later test drives a
     * different, empty account.
     */
    await expect(
      page.locator('[data-testid="dashboard-accounts"]'),
    ).toBeVisible();

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

/** Fill in and submit the trade form on an investment account detail page. */
export async function submitTrade(
  page: Page,
  opts: {
    mode: "buy" | "sell";
    symbol: string;
    quantity: number;
    price: number;
    companyName?: string;
    brokerage?: number;
    description?: string;
    /** `YYYY-MM-DD`. Omitted leaves the field on its default of today. */
    date?: string;
  },
) {
  await page.click(`[data-testid="trade-mode-${opts.mode}"]`);
  await page.fill('[data-testid="symbol-input"]', opts.symbol);
  await page.fill('[data-testid="quantity-input"]', String(opts.quantity));
  await page.fill('[data-testid="price-input"]', String(opts.price));

  if (opts.companyName && opts.mode === "buy") {
    await page.fill('[data-testid="company-name-input"]', opts.companyName);
  }
  if (opts.brokerage !== undefined) {
    await page.fill('[data-testid="brokerage-input"]', String(opts.brokerage));
  }
  if (opts.date) {
    await page.fill('[data-testid="trade-date-input"]', opts.date);
  }
  if (opts.description) {
    await page.fill(
      '[data-testid="trade-description-input"]',
      opts.description,
    );
  }

  await page.click('[data-testid="submit-trade"]');
}

/** Read the numeric value out of the cost-basis card on an investment account. */
export async function readCostBasis(page: Page): Promise<number> {
  const locator = page.locator('[data-testid="portfolio-summary"]');
  await expect(locator).toBeVisible();
  const text = (await locator.textContent()) ?? "";
  // The card also carries the holdings count, so match the currency figure.
  const match = /\$([0-9,]+\.[0-9]{2})/.exec(text);
  return Number((match?.[1] ?? "0").replace(/,/g, ""));
}

/** Fill in and submit the cash transaction form on an account detail page. */
export async function submitTransaction(
  page: Page,
  opts: {
    mode: "deposit" | "withdraw" | "transfer";
    amount: number;
    description?: string;
    targetAccountName?: string;
    /** `YYYY-MM-DD`. Omitted leaves the field on its default of today. */
    date?: string;
  },
) {
  await page.click(`[data-testid="mode-${opts.mode}"]`);
  await page.fill('[data-testid="amount-input"]', String(opts.amount));

  if (opts.date) {
    await page.fill('[data-testid="transaction-date-input"]', opts.date);
  }

  if (opts.description) {
    await page.fill('[data-testid="description-input"]', opts.description);
  }

  if (opts.mode === "transfer") {
    await chooseOptionByLabel(
      page,
      "transfer-target",
      opts.targetAccountName ?? "",
    );
  }

  await page.click('[data-testid="submit-transaction"]');
}
