import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "app gemiprint",
  description:
    "Aplikasi manajemen untuk bisnis percetakan dengan POS, inventori, dan laporan keuangan",
  icons: {
    icon: "/assets/images/logo-gemiprint-default.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className="antialiased">{children}</body>
    </html>
  );
}
