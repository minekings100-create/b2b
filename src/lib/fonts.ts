import { Inter } from "next/font/google";
import { GeistMono } from "geist/font/mono";

// SPEC §4: Inter (sans) + Geist Mono (numbers / SKUs / kbd).
// Exposed as CSS variables so Tailwind can consume them.
export const fontSans = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

export const fontMono = GeistMono;
