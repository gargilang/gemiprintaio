import type { NextConfig } from "next";

// Enable static export ONLY for production builds (not dev mode)
// In dev mode, we need API routes to work for database operations
const isExportOutput =
  process.env.NODE_ENV === "production" &&
  (process.env.TAURI === "true" || process.env.NEXT_OUTPUT_EXPORT === "true");

const nextConfig: NextConfig = {
  ...(isExportOutput ? { output: "export" as const } : {}),

  // Base path for assets in Tauri
  ...(isExportOutput ? { assetPrefix: "./" } : {}),

  images: {
    // Required when output: "export"; harmless in dev but we can keep it always true
    unoptimized: true,
  },

  // Disable server actions in static export
  ...(isExportOutput
    ? {}
    : {
        experimental: {
          serverActions: {
            bodySizeLimit: "2mb",
          },
          // Enable optimizations for better tree-shaking
          optimizePackageImports: [
            "@/components/icons/PageIcons",
            "@/components/icons/ContentIcons",
          ],
        },
      }),

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
