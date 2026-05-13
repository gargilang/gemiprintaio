"use client";

import type { Metadata } from "next";
import "./globals.css";
import MainShell from "@/components/MainShell";
import IndonesianNativeValidity from "@/components/IndonesianNativeValidity";
import { usePathname } from "next/navigation";
import { useAutoSync } from "@/hooks/use-auto-sync";
import { useAppUpdater } from "@/hooks/use-app-updater";
import { SwrProvider } from "@/lib/swr-provider";

// export const metadata: Metadata = {
//   title: "app gemiprint",
//   description:
//     "Aplikasi manajemen untuk bisnis percetakan dengan POS, inventori, dan laporan keuangan",
//   icons: {
//     icon: "/assets/images/logo-gemiprint-default.svg",
//   },
// };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();

  useAutoSync();
  useAppUpdater();

  // Don't wrap login/auth pages with MainShell
  const isAuthPage = pathname?.startsWith("/auth/");

  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <title>app gemiprint</title>
        <meta
          name="description"
          content="Aplikasi manajemen untuk bisnis percetakan dengan POS, inventori, dan laporan keuangan"
        />
        <link rel="icon" href="/assets/images/logo-gemiprint-default.svg" />
      </head>
      <body suppressHydrationWarning>
        <IndonesianNativeValidity />
        <SwrProvider>
          {isAuthPage ? children : <MainShell>{children}</MainShell>}
        </SwrProvider>
      </body>
    </html>
  );
}
