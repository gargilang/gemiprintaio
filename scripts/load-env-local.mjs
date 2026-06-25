/**
 * Baca .env.local — nilai file menang atas variabel shell
 * (Node --env-file tidak menimpa env yang sudah ada di shell).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ENV_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env.local");

export function loadEnvLocal() {
  const out = {};
  try {
    const text = readFileSync(ENV_PATH, "utf8");
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
    }
  } catch {
    // .env.local tidak ada
  }
  return out;
}

/** DATABASE_URL dari .env.local; fallback ke process.env bila kosong. */
export function getDatabaseUrl() {
  const fileEnv = loadEnvLocal();
  return fileEnv.DATABASE_URL || fileEnv.DIRECT_URL || process.env.DATABASE_URL || process.env.DIRECT_URL;
}
