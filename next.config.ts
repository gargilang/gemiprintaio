import type { NextConfig } from "next";

// Enable static export only for Tauri packaging/builds.
// In development, keep server runtime so API routes work (SQLite, etc.).
const isExportOutput =
  process.env.TAURI === "true" ||
  process.env.NEXT_OUTPUT_EXPORT === "true" ||
  (process.env.NODE_ENV === "production" && process.env.TAURI_BUILD === "true");

const nextConfig: NextConfig = {
  ...(isExportOutput ? { output: "export" as const } : {}),
  images: {
    // Required when output: "export"; harmless in dev but we can keep it always true
    unoptimized: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
