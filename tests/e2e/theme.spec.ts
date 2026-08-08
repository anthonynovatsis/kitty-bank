import { test, expect, type Page } from "@playwright/test";
import { USER_AUTH_FILE } from "../../playwright.config";
import { chooseOption, signUpFreshUser } from "./helpers";

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
    // Title-cased label, not the "kitten" cookie value.
    await expect(page.locator('[data-testid="theme-select"]')).toContainText(
      "Kitten",
    );
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

  // Uses a throwaway signup because the seeded user accumulates accounts as
  // other specs create fixtures, and an empty state needs an empty account list.
  test("empty-state art follows the theme", async ({ browser }) => {
    const { context, page } = await signUpFreshUser(browser);
    try {
      const defaultArt = page.locator('[data-theme-art="default"]').first();
      const kittenArt = page.locator('[data-theme-art="kitten"]').first();

      await expect(defaultArt).toBeVisible();
      await expect(kittenArt).toBeHidden();

      await chooseOption(page, "theme-select", "kitten");

      await expect(kittenArt).toBeVisible();
      await expect(defaultArt).toBeHidden();

      // The art takes its colour from the palette rather than a literal, so it
      // must resolve to the theme's primary rather than to some fixed pink.
      const [artFill, themePrimary] = await Promise.all([
        kittenArt
          .locator("circle")
          .first()
          .evaluate((el) => getComputedStyle(el).fill),
        // Resolved through a real property, not read raw: the custom property
        // serialises as "oklch(66% …)" while a computed fill normalises to
        // "oklch(0.66 …)", and the two would never compare equal.
        page.evaluate(() => {
          const probe = document.createElement("span");
          probe.style.color = "var(--primary)";
          document.body.append(probe);
          const resolved = getComputedStyle(probe).color;
          probe.remove();
          return resolved;
        }),
      ]);
      expect(artFill).toBe(themePrimary);
    } finally {
      await context.close();
    }
  });
});
