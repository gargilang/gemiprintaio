/**
 * Next standalone butuh `.next/static` (dan biasanya `public`) di samping server.
 * Jalankan sebelum Tauri membundel aplikasi (lihat beforeBundleCommand di tauri.conf.json).
 */
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const standalone = join(root, ".next", "standalone");
const serverJs = join(standalone, "server.js");

if (!existsSync(serverJs)) {
  console.error(
    "prepare-standalone-for-tauri: missing .next/standalone/server.js — run npm run build:tauri first."
  );
  process.exit(1);
}

const staticSrc = join(root, ".next", "static");
const staticDest = join(standalone, ".next", "static");
if (existsSync(staticSrc)) {
  mkdirSync(join(standalone, ".next"), { recursive: true });
  cpSync(staticSrc, staticDest, { recursive: true });
  console.log("Copied .next/static → .next/standalone/.next/static");
} else {
  console.warn("prepare-standalone-for-tauri: .next/static not found (optional for some builds)");
}

const publicSrc = join(root, "public");
const publicDest = join(standalone, "public");
if (existsSync(publicSrc)) {
  cpSync(publicSrc, publicDest, { recursive: true });
  console.log("Copied public → .next/standalone/public");
}
