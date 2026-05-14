/**
 * publish-update.mjs
 *
 * Alur rilis versi baru desktop:
 *   1. Bump versi di tauri.conf.json + Cargo.toml
 *   2. npm run tauri:build           (build MSI / NSIS)
 *   3. node scripts/publish-update.mjs  (script ini)
 *
 * Script ini akan:
 *   - Membaca versi dari tauri.conf.json
 *   - Menandatangani (sign) installer dengan private key
 *   - Men-generate updates/latest.json
 *   - Membuat GitHub Release dan meng-upload installer
 *   - Commit + push latest.json agar desktop app tahu ada update
 *
 * Prasyarat:
 *   - gh CLI sudah login: `gh auth status`
 *   - Private key tersedia di: %APPDATA%\.tauri\gemiprint.key
 *   - Env var TAURI_SIGNING_PRIVATE_KEY_PASSWORD (kosong jika tanpa password)
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const conf = JSON.parse(readFileSync(join(ROOT, "src-tauri/tauri.conf.json"), "utf8"));
const version = conf.version;
const tag = `v${version}`;

// ── Locate NSIS installer (preferred for silent updates) ─────────────────────
const bundleDir = join(ROOT, "src-tauri/target/release/bundle");
const nsisDir = join(bundleDir, "nsis");
const msiDir = join(bundleDir, "msi");

function findFile(dir, ext) {
  if (!existsSync(dir)) return null;
  const { readdirSync } = await import("fs").then(m => m); // static import already used
  const files = readdirSync(dir).filter(f => f.endsWith(ext));
  return files.length ? join(dir, files[0]) : null;
}

// Resolve synchronously
import { readdirSync } from "fs";
function findFileSync(dir, ext) {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter(f => f.endsWith(ext));
  return files.length ? join(dir, files[0]) : null;
}

const installer =
  findFileSync(nsisDir, ".nsis.zip") ||
  findFileSync(nsisDir, "-setup.exe") ||
  findFileSync(msiDir, ".msi");

if (!installer) {
  console.error("❌  Installer tidak ditemukan. Jalankan `npm run tauri:build` terlebih dahulu.");
  process.exit(1);
}

console.log(`📦  Installer: ${installer}`);
console.log(`🏷️   Versi    : ${version}`);

// ── Sign the installer ────────────────────────────────────────────────────────
const keyPath =
  process.env.TAURI_SIGNING_PRIVATE_KEY_PATH ||
  `${process.env.APPDATA}\\.tauri\\gemiprint.key`;

if (!existsSync(keyPath)) {
  console.error(`❌  Private key tidak ditemukan: ${keyPath}`);
  console.error("   Generate dengan: npx tauri signer generate -w %APPDATA%\\.tauri\\gemiprint.key --ci");
  process.exit(1);
}

console.log("🔏  Menandatangani installer…");
const signOutput = execSync(
  `npx tauri signer sign -k "${keyPath}" "${installer}"`,
  { cwd: ROOT, env: { ...process.env } }
).toString();

const sigMatch = signOutput.match(/Signature:\s*(.+)/);
if (!sigMatch) {
  console.error("❌  Gagal mendapatkan signature dari output:\n", signOutput);
  process.exit(1);
}
const signature = sigMatch[1].trim();
console.log("✅  Signature OK");

// ── Build latest.json ─────────────────────────────────────────────────────────
const repoUrl = "https://github.com/gargilang/gemiprintaio";
const installerFilename = installer.split(/[\\/]/).pop();
const releaseUrl = `${repoUrl}/releases/download/${tag}/${installerFilename}`;

const manifest = {
  version,
  notes: `Rilis ${tag}`,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature,
      url: releaseUrl,
    },
  },
};

const manifestPath = join(ROOT, "updates/latest.json");
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log("📄  updates/latest.json diperbarui");

// ── Create GitHub Release and upload installer ────────────────────────────────
console.log(`🚀  Membuat GitHub Release ${tag}…`);
try {
  execSync(
    `gh release create ${tag} "${installer}" --title "gemiprint ${tag}" --notes "Rilis ${tag}" --repo gargilang/gemiprintaio`,
    { cwd: ROOT, stdio: "inherit" }
  );
} catch {
  console.warn("⚠️   Release mungkin sudah ada. Upload installer saja…");
  execSync(
    `gh release upload ${tag} "${installer}" --clobber --repo gargilang/gemiprintaio`,
    { cwd: ROOT, stdio: "inherit" }
  );
}

// ── Commit & push latest.json ─────────────────────────────────────────────────
console.log("📤  Commit & push latest.json…");
execSync("git add updates/latest.json", { cwd: ROOT, stdio: "inherit" });
execSync(`git commit -m "chore: release ${tag} — update manifest"`, { cwd: ROOT, stdio: "inherit" });
execSync("git push", { cwd: ROOT, stdio: "inherit" });

console.log(`\n🎉  Rilis ${tag} selesai! Desktop app akan menerima notifikasi update dalam 5 menit.`);
