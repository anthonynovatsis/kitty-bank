"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import {
  MODE_COOKIE,
  THEME_COOKIE,
  THEME_COOKIE_MAX_AGE,
  type Mode,
  type ThemeId,
} from "~/lib/theme";

type ThemeState = {
  theme: ThemeId;
  mode: Mode;
  setTheme: (theme: ThemeId) => void;
  setMode: (mode: Mode) => void;
};

const ThemeContext = createContext<ThemeState | null>(null);

function persist(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
}

/**
 * Holds the current theme and mode for anything that needs to *read* them.
 *
 * The DOM is written directly rather than through React. `<html>` is rendered
 * by the server from the cookie, so it is already correct before hydration —
 * re-rendering it from state would be the only thing that could introduce the
 * flash this design exists to avoid. State here exists so the switcher can
 * show which option is active.
 */
export function ThemeProvider({
  initialTheme,
  initialMode,
  children,
}: {
  initialTheme: ThemeId;
  initialMode: Mode;
  children: React.ReactNode;
}) {
  const [theme, setThemeState] = useState<ThemeId>(initialTheme);
  const [mode, setModeState] = useState<Mode>(initialMode);

  const setTheme = useCallback((next: ThemeId) => {
    setThemeState(next);
    document.documentElement.dataset.theme = next;
    persist(THEME_COOKIE, next);
  }, []);

  const setMode = useCallback((next: Mode) => {
    setModeState(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    persist(MODE_COOKIE, next);
  }, []);

  const value = useMemo(
    () => ({ theme, mode, setTheme, setMode }),
    [theme, mode, setTheme, setMode],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
