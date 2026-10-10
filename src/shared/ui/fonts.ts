import { Geist_Mono, Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

/** Class names that expose the font CSS variables theme.css reads. Goes on <html>. */
export const fontVariables = `${inter.variable} ${geistMono.variable}`;
