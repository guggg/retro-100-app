import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Retro AI Chat | Sprint 回顧引導",
  description: "AI 引導的 Sprint 回顧對話工具",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW" suppressHydrationWarning>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
