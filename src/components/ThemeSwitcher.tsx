"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { THEMES } from "~/lib/theme";
import { useTheme } from "~/components/ThemeProvider";
import { Button } from "~/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

/*
 * Base UI's <SelectValue> renders the label of the selected item only when the
 * Root is told what the items are; without this it falls back to the raw value
 * and the trigger reads "kitten" rather than "Kitten".
 */
const THEME_ITEMS = THEMES.map(({ id, label }) => ({ value: id, label }));

export function ThemeSwitcher() {
  const { theme, mode, setTheme, setMode } = useTheme();

  return (
    <div className="flex items-center gap-2">
      <Select
        items={THEME_ITEMS}
        value={theme}
        onValueChange={(value) => setTheme(value ?? theme)}
      >
        <SelectTrigger
          size="sm"
          data-testid="theme-select"
          className="w-[9.5rem]"
          aria-label="Theme"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {THEMES.map((option) => (
            <SelectItem
              key={option.id}
              value={option.id}
              data-testid={`option-${option.id}`}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        type="button"
        variant="outline"
        size="sm"
        data-testid="mode-toggle"
        // The label names the destination, not the current state — it is a
        // control, and a screen reader reads it before anything happens.
        aria-label={
          mode === "dark" ? "Switch to light mode" : "Switch to dark mode"
        }
        onClick={() => setMode(mode === "dark" ? "light" : "dark")}
      >
        {mode === "dark" ? (
          <SunIcon className="size-4" />
        ) : (
          <MoonIcon className="size-4" />
        )}
      </Button>
    </div>
  );
}
