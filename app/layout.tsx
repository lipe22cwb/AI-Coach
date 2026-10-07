import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";

import "./globals.css";

// These paths are relative to this file, not the browser URL.
// Both fonts are included in public/fonts so groupmates can build without
// downloading fonts from Google. Keep their licence files with them.
const roboto = localFont({
  src: "../public/fonts/roboto-latin-wght-normal.woff2",
  variable: "--font-roboto",
  weight: "100 900",
  display: "swap",
});

const robotoCondensed = localFont({
  src: "../public/fonts/roboto-condensed-latin-wght-normal.woff2",
  variable: "--font-roboto-condensed",
  weight: "100 900",
  display: "swap",
});

// Next.js uses this for the browser tab, page description and favicon.
export const metadata: Metadata = {
  title: "AI-Coach | Minesweeper",
  description: "Practise Minesweeper with post-game feedback on patterns and decisions.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // The font variables are available to every page through the html element.
    <html lang="en" className={`${roboto.variable} ${robotoCondensed.variable}`}>
      <body>{children}</body>
    </html>
  );
}
