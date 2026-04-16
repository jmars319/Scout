import type { Metadata } from "next";

import { getAppName } from "@scout/config";

import "./globals.css";

const themeBootstrapScript = `
  (() => {
    const storageKey = "scout-theme";
    const fallbackTheme = "dark";
    try {
      const savedTheme = window.localStorage.getItem(storageKey);
      const theme = savedTheme === "light" ? "light" : fallbackTheme;
      document.documentElement.dataset.theme = theme;
    } catch {
      document.documentElement.dataset.theme = fallbackTheme;
    }
  })();
`;

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
    <html data-theme="dark" lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
