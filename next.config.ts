import type { NextConfig } from "next";

const isTauri = process.env.TAURI === "true";
// Separate dev output when running `next dev` in parallel (e.g. `npm run dev:all`):
// default `.next` for browser dev, `.next-tauri` for the Tauri shell on :3001.
const isTauriDevShell = process.env.TAURI_DEV_SHELL === "1";

const nextConfig: NextConfig = {
  distDir: isTauriDevShell ? ".next-tauri" : undefined,

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
              "frame-ancestors 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },

  async redirects() {
    // Redirect URL lama ke URL Indonesia. Bookmark dan link luar yang masih
    // memakai path English tetap bekerja (akan kena 301 permanent ke path baru).
    return [
      { source: "/customers", destination: "/pelanggan", permanent: true },
      { source: "/materials", destination: "/barang", permanent: true },
      { source: "/dashboard", destination: "/beranda", permanent: true },
      { source: "/settings", destination: "/pengaturan", permanent: true },
      { source: "/finance", destination: "/keuangan", permanent: true },
      { source: "/reports", destination: "/laporan", permanent: true },
      { source: "/inventory/:path*", destination: "/inventori/:path*", permanent: true },
      { source: "/users", destination: "/pengguna", permanent: true },
      { source: "/production/:path*", destination: "/produksi/:path*", permanent: true },
      { source: "/purchases", destination: "/pembelian", permanent: true },
      { source: "/purchase-orders", destination: "/pesanan-pembelian", permanent: true },
      { source: "/purchase-returns", destination: "/retur-pembelian", permanent: true },
      { source: "/sales-returns", destination: "/retur-penjualan", permanent: true },
    ];
  },

  // For Tauri, use standalone to bundle Next.js server
  output: isTauri ? "standalone" : undefined,

  // Keep better-sqlite3 (native module) out of the Next bundle so Vercel's
  // serverless runtime can require it from node_modules at runtime.
  serverExternalPackages: ["better-sqlite3"],

  images: {
    unoptimized: true,
  },

  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
    optimizePackageImports: [
      "@/components/icons/PageIcons",
      "@/components/icons/ContentIcons",
    ],
  },

  // Performance optimizations
  compiler: {
    // Remove console.log in production
    removeConsole:
      process.env.NODE_ENV === "production"
        ? {
            exclude: ["error", "warn"],
          }
        : false,
  },

  // Production optimizations
  productionBrowserSourceMaps: false,

  // Enable React strict mode for better debugging
  reactStrictMode: true,

  // Turbopack configuration (Next.js 16+)
  // Empty config to silence the warning - Turbopack works fine with defaults
  turbopack: {},
};

export default nextConfig;
