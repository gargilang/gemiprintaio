/**
 * Copy the freshly built Next standalone tree into tauri-bundle so it can be
 * packaged with the MSI/NSIS installer (see bundle.resources in tauri.conf.json).
 */
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const src = join(root, ".next", "standalone");
const dest = join(root, "tauri-bundle", "server", "standalone");

if (!existsSync(join(src, "server.js"))) {
  console.error(
    "sync-tauri-bundle-server: missing .next/standalone/server.js — run npm run build:tauri first."
  );
  process.exit(1);
}

mkdirSync(join(root, "tauri-bundle", "server"), { recursive: true });
rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
console.log("Synced .next/standalone → tauri-bundle/server/standalone (for MSI/resources)");
