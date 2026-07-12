import type { Metadata, Viewport } from "next";
import { Geist, Cormorant_Garamond, Bodoni_Moda } from "next/font/google";
import { THEME, SCENE_PALETTE } from "@/lib/palette";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// Only the weights actually used (italic 300 tagline, 400 fallback) —
// fewer font files, faster first paint.
const cormorant = Cormorant_Garamond({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["300", "400"],
  style: ["normal", "italic"],
});

// Massive bold display type — the fashion-house Didone for viewport-filling
// uppercase statements.
const bodoni = Bodoni_Moda({
  variable: "--font-display-bold",
  subsets: ["latin"],
  weight: ["700", "900"],
});

export const viewport: Viewport = {
  themeColor: SCENE_PALETTE.themeColor,
};

export const metadata: Metadata = {
  title: "Maison Noir — Élixir Noir",
  description:
    "Élixir Noir by Maison Noir — an ode to midnight. A cinematic dark-luxury fragrance showcase.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme={THEME}
      className={`${geistSans.variable} ${cormorant.variable} ${bodoni.variable} h-full antialiased`}
    >
      <body>{children}</body>
    </html>
  );
}
