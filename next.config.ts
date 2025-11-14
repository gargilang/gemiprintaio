import type { NextConfig } from "next";

const isTauri = process.env.TAURI === "true";

const nextConfig: NextConfig = {
  // For Tauri, we need static export
  output: isTauri ? "export" : undefined,

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
