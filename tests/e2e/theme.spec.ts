import { test, expect, type Page } from "@playwright/test";
import { USER_AUTH_FILE } from "../../playwright.config";
import { chooseOption } from "./helpers";

test.use({ storageState: USER_AUTH_FILE });

const bodyFont = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).fontFamily);

const bodyBackground = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test.describe("theming", () => {
  test("switching theme changes palette and typeface", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "default");

    const before = {
      font: await bodyFont(page),
      background: await bodyBackground(page),
    };

    await chooseOption(page, "theme-select", "kitten");

    await expect(page.locator("html")).toHaveAttribute("data-theme", "kitten");
    // Typeface is the assertion that proves the font indirection works —
    // a theme that only recoloured would still pass the background check.
    expect(await bodyFont(page)).not.toBe(before.font);
    expect(await bodyBackground(page)).not.toBe(before.background);
  });

  test("the choice survives a reload", async ({ page }) => {
    await page.goto("/dashboard");
    await chooseOption(page, "theme-select", "kitten");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "kitten");

    await page.reload();

    // Served correct rather than corrected on load: the cookie is read during
    // render, so there is no window in which the wrong theme is on screen.
    await expect(page.locator("html")).toHaveAttribute("data-theme", "kitten");
  });

  test("dark mode toggles and persists", async ({ page }) => {
    await page.goto("/dashboard");
    const light = await bodyBackground(page);

    await page.click('[data-testid="mode-toggle"]');
    await expect(page.locator("html")).toHaveClass(/dark/);
    expect(await bodyBackground(page)).not.toBe(light);

    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("theme and mode are independent axes", async ({ page }) => {
    await page.goto("/dashboard");
    await chooseOption(page, "theme-select", "kitten");
    await page.click('[data-testid="mode-toggle"]');

    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", "kitten");
    await expect(html).toHaveClass(/dark/);

    // Changing one must not reset the other.
    await chooseOption(page, "theme-select", "default");
    await expect(html).toHaveAttribute("data-theme", "default");
    await expect(html).toHaveClass(/dark/);
  });

  test("an unrecognised cookie falls back instead of being trusted", async ({
    page,
    context,
  }) => {
    await context.addCookies([
      {
        name: "kb-theme",
        value: "not-a-real-theme",
        url: "http://localhost:3001",
      },
    ]);

    await page.goto("/dashboard");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "default");
  });
});
