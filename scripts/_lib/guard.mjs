/**
 * Guard bersama untuk script ops destruktif (wipe, seed, apply schema/migrasi).
 *
 * Tujuan (O-C3, O-I4): cegah "satu salah ketik = data produksi hilang" dengan
 *   - --dry-run  : cetak target lalu keluar tanpa menulis
 *   - deteksi host produksi : tolak kecuali --allow-prod (untuk script yang
 *                              boleh menyentuh prod) + flag eksplisit
 *   - prompt y/N : konfirmasi interaktif kalau bukan --confirm
 *
 * `target` boleh berupa Postgres connection string ATAU URL Supabase
 * (NEXT_PUBLIC_SUPABASE_URL) — keduanya cukup untuk mengekstrak host.
 */
import readline from "node:readline";

/** Ekstrak host dari connection string Postgres atau URL Supabase. */
export function getHost(target) {
  if (!target) return "(tidak diketahui)";
  try {
    return new URL(target).host;
  } catch {
    return "(tidak diketahui)";
  }
}

/**
 * Project ref produksi yang dilindungi. Sesuaikan bila project ref berubah.
 * Cocok dengan host Postgres (db.<ref>.supabase.co) maupun URL REST
 * (<ref>.supabase.co).
 */
const PROD_PROJECT_REFS = ["fufrztzerditoctgzbcn"];

export function isProdHost(target) {
  const host = getHost(target);
  return PROD_PROJECT_REFS.some((ref) => host.includes(ref));
}

/**
 * Konfirmasi sebelum operasi destruktif. Memproses flag CLI:
 *   --dry-run     : keluar tanpa menulis
 *   --confirm     : lewati prompt interaktif (untuk CI/otomasi terkendali)
 *   --allow-prod  : izinkan host produksi (hanya berlaku bila allowProd=true)
 *
 * @param {object} opts
 * @param {string} opts.target connection string / URL Supabase
 * @param {string} opts.action deskripsi singkat aksi (untuk pesan)
 * @param {boolean} [opts.allowProd] apakah script ini BOLEH menyentuh prod
 */
export async function confirmOrExit({ target, action, allowProd = false }) {
  const host = getHost(target);
  const dryRun = process.argv.includes("--dry-run");
  const confirm = process.argv.includes("--confirm");
  const allowProdFlag = process.argv.includes("--allow-prod");

  console.log(`About to ${action} on host: ${host}`);

  if (dryRun) {
    console.log("[DRY RUN] Tidak ada perubahan yang ditulis.");
    process.exit(0);
  }

  if (isProdHost(target) && !(allowProd && allowProdFlag)) {
    console.error(
      `REFUSE: host terdeteksi sebagai PRODUKSI (${host}). ` +
        (allowProd
          ? "Pakai --allow-prod untuk override (berbahaya)."
          : "Script ini tidak boleh dijalankan terhadap produksi.")
    );
    process.exit(1);
  }

  if (!confirm) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const answer = await new Promise((res) =>
      rl.question(`Lanjutkan ${action} pada ${host}? [y/N] `, res)
    );
    rl.close();
    if (answer.trim().toLowerCase() !== "y") {
      console.log("Dibatalkan.");
      process.exit(0);
    }
  }
}
