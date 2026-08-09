import "~/styles/globals.css";

import { type Metadata } from "next";
import { IBM_Plex_Sans, Nunito } from "next/font/google";
import { cookies } from "next/headers";

import { TRPCReactProvider } from "~/trpc/react";
import { ThemeProvider } from "~/components/ThemeProvider";
import { Toaster } from "~/components/ui/sonner";
import { MODE_COOKIE, THEME_COOKIE, parseMode, parseTheme } from "~/lib/theme";

/*
 * The tab icon follows the theme, resolved from the same cookie as everything
 * else. A favicon is fetched by the browser outside the page, so it cannot
 * read CSS variables — each theme ships its own file with colours baked in.
 *
 * The .ico stays as a fallback for anything that will not take an SVG icon.
 */
export async function generateMetadata(): Promise<Metadata> {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return {
    title: "Kitty Bank",
    description: "Track your savings and manage your money",
    icons: [
      { rel: "icon", url: `/favicon-${theme}.svg`, type: "image/svg+xml" },
      { rel: "alternate icon", url: "/favicon.ico" },
    ],
  };
}

/*
 * Every theme's font is loaded here, because next/font runs at module scope and
 * cannot be called conditionally. Each font contributes a CSS variable; the
 * theme blocks in globals.css decide which one --theme-font-sans points at, so
 * switching theme changes typeface without fetching anything new.
 */
const nunito = Nunito({ subsets: ["latin"], variable: "--font-nunito" });

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
});

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Read on the server so the first paint is already the right theme. This is
  // why there is no de-flash script: there is nothing to correct after load.
  const cookieStore = await cookies();
  const theme = parseTheme(cookieStore.get(THEME_COOKIE)?.value);
  const mode = parseMode(cookieStore.get(MODE_COOKIE)?.value);

  const fontVariables = `${plexSans.variable} ${nunito.variable}`;

  return (
    <html
      lang="en"
      data-theme={theme}
      className={mode === "dark" ? `${fontVariables} dark` : fontVariables}
    >
      <body>
        <ThemeProvider initialTheme={theme} initialMode={mode}>
          <TRPCReactProvider>{children}</TRPCReactProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
