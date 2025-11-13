import type { Metadata } from "next";
import "./globals.css";
import MainShell from "@/components/MainShell";

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
    <html lang="en">
      <body>
        <MainShell>{children}</MainShell>
      </body>
    </html>
  );
}
