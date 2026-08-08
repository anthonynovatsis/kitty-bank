import Link from "next/link";

import { signOut } from "~/app/actions";
import { AppNavLinks } from "~/components/AppNavLinks";
import { ThemeIllustration } from "~/components/ThemeIllustration";
import { ThemeSwitcher } from "~/components/ThemeSwitcher";
import { Button } from "~/components/ui/button";
import type { Viewer } from "~/server/better-auth/viewer";

/**
 * The header every signed-in page sits under.
 *
 * There was no shared shell before this: the nav lived inside the dashboard
 * page, so account detail pages had no navigation at all beyond a back link,
 * and /admin carried a second header of its own. The theme switcher was
 * duplicated into both.
 *
 * Nothing here is theme-specific. Palette, radius and typeface arrive through
 * tokens, and the brand mark is an illustration slot — so the Kitten shell is
 * this shell, not a second design.
 */
export function AppShell({
  viewer,
  children,
}: {
  viewer: Viewer;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-muted min-h-screen">
      <header className="bg-card border-border border-b">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
          <Link
            href="/dashboard"
            data-testid="app-brand"
            className="flex shrink-0 items-center gap-2"
          >
            <ThemeIllustration name="brand" className="size-8" />
            <span className="text-lg font-semibold tracking-tight">
              Kitty Bank
            </span>
          </Link>

          <AppNavLinks isAdmin={viewer.isAdmin} />

          <div className="ml-auto flex items-center gap-3">
            <ThemeSwitcher />
            <span
              data-testid="viewer-name"
              className="text-muted-foreground hidden text-sm sm:inline"
            >
              Welcome, {viewer.name ?? viewer.email}
            </span>
            <form action={signOut}>
              <Button variant="secondary" size="sm" type="submit">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
