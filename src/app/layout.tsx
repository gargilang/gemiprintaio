import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GemiPrintaIO - Sistem Manajemen Percetakan",
  description: "Aplikasi manajemen untuk bisnis percetakan dengan POS, inventori, dan laporan keuangan",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
