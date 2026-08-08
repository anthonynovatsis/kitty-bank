import "~/styles/globals.css";

import { type Metadata } from "next";
import { Geist, IBM_Plex_Sans, Nunito } from "next/font/google";
import { cookies } from "next/headers";

import { TRPCReactProvider } from "~/trpc/react";
import { ThemeProvider } from "~/components/ThemeProvider";
import { Toaster } from "~/components/ui/sonner";
import { MODE_COOKIE, THEME_COOKIE, parseMode, parseTheme } from "~/lib/theme";

export const metadata: Metadata = {
  title: "Kitty Bank",
  description: "Track your savings and manage your money",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

/*
 * Every theme's font is loaded here, because next/font runs at module scope and
 * cannot be called conditionally. Each font contributes a CSS variable; the
 * theme blocks in globals.css decide which one --theme-font-sans points at, so
 * switching theme changes typeface without fetching anything new.
 */
const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });

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

  const fontVariables = `${geist.variable} ${nunito.variable} ${plexSans.variable}`;

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
