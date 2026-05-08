import type { NextConfig } from "next";

const isTauri = process.env.TAURI === "true";
// Separate dev output when running `next dev` in parallel (e.g. `npm run dev:all`):
// default `.next` for browser dev, `.next-tauri` for the Tauri shell on :3001.
const isTauriDevShell = process.env.TAURI_DEV_SHELL === "1";

const nextConfig: NextConfig = {
  distDir: isTauriDevShell ? ".next-tauri" : undefined,

  // For Tauri, use standalone to bundle Next.js server
  output: isTauri ? "standalone" : undefined,

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
