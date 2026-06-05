/**
 * Cek drift version antar 3 sumber: package.json, src-tauri/tauri.conf.json,
 * src-tauri/Cargo.toml. release:desktop dan updater feed bergantung ketiganya
 * sinkron (O-I6). Exit 1 kalau ada yang berbeda. Dipanggil dari CI.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const tauriConf = JSON.parse(
  readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8")
).version;
const cargoToml = readFileSync(join(root, "src-tauri", "Cargo.toml"), "utf8");
const cargoVersion = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1];

const all = { pkg, tauriConf, cargoVersion };
const unique = new Set(Object.values(all));
if (unique.size !== 1) {
  console.error("Version drift terdeteksi:", all);
  process.exit(1);
}
console.log("Version sinkron:", pkg);
