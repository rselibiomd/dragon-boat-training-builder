import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import CoachToolsShell from "./coach-tools-shell";
import "./globals.css";
import "./coach-tools-shell.css";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "KDBC Coach Tools",
  description: "KDBC coaching workspace for stroke review, practice planning, and boat organization.",
  manifest: `${basePath}/manifest.webmanifest`,
  applicationName: "KDBC Coach Tools",
  appleWebApp: {
    capable: true,
    title: "KDBC Coach Tools",
    statusBarStyle: "black-translucent",
  },
  other: {
    "codex-preview": "development",
    "theme-color": "#071827",
  },
  icons: {
    icon: `${basePath}/kdbc-logo-official.svg`,
    shortcut: `${basePath}/kdbc-logo-official.svg`,
    apple: `${basePath}/kdbc-logo-official.svg`,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Script src={`${basePath}/stroke-review-bridge.js`} strategy="beforeInteractive" />
        <Script src={`${basePath}/kdbc-brand-fix.js`} strategy="afterInteractive" />
        {children}
        <CoachToolsShell />
      </body>
    </html>
  );
}
