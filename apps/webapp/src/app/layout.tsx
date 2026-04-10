import type { Metadata } from "next";

import { getAppName } from "@scout/config";

import "./globals.css";

export const metadata: Metadata = {
  title: getAppName(),
  description:
    "Scout is a search-seeded market scanner that identifies, audits, and classifies business web presence."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
