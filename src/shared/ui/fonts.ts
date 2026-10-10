import { Fraunces, Geist, Geist_Mono } from "next/font/google";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  weight: "400",
  display: "swap",
});

/** Class names that expose the font CSS variables theme.css reads. Goes on <html>. */
export const fontVariables = `${geist.variable} ${geistMono.variable} ${fraunces.variable}`;
