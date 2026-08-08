/**
 * The theme registry.
 *
 * A theme is a palette plus a font plus a radius — every one of them a CSS
 * variable in globals.css. Nothing here knows what any theme looks like, and
 * nothing under src/app does either; adding a theme means adding a block of
 * variables and a row to THEMES.
 *
 * Mode (light/dark) is a separate axis from theme, so every theme gets both.
 */

export const THEMES = [
  { id: "default", label: "Default", hint: "Crisp and businesslike" },
  { id: "kitten", label: "Kitten", hint: "Soft, warm and playful" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];
export type Mode = "light" | "dark";

export const DEFAULT_THEME: ThemeId = "default";
export const DEFAULT_MODE: Mode = "light";

/** Read by the server on every render, so `<html>` is right on first paint. */
export const THEME_COOKIE = "kb-theme";
export const MODE_COOKIE = "kb-mode";

/** A year. The choice is a preference, not a session. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isThemeId(value: string | undefined): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}

export function isMode(value: string | undefined): value is Mode {
  return value === "light" || value === "dark";
}

/** Cookies are user-controlled, so an unknown value falls back rather than trusting it. */
export function parseTheme(value: string | undefined): ThemeId {
  return isThemeId(value) ? value : DEFAULT_THEME;
}

export function parseMode(value: string | undefined): Mode {
  return isMode(value) ? value : DEFAULT_MODE;
}
