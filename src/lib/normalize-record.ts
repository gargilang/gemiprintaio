/**
 * Normalisasi record agar konsisten antara SQLite (0/1) dan Supabase
 * (true/false). Dipisah dari db-unified (server-only) supaya bisa di-unit-test.
 *
 * Deteksi boolean (SQLite → Supabase) memakai pendekatan whitelist/heuristik
 * yang HATI-HATI: hanya field yang benar-benar boolean yang dikonversi. Field
 * enum yang kebetulan mengandung kata "status" TAPI menyimpan kode/teks
 * (status_pembayaran=LUNAS, void_status_kode=1/2/3, roll_inventory_status,
 * status_transaksi, sync_status) JANGAN dikonversi — itu bug D-I2.
 */

/**
 * Field yang namanya mengandung "status"/"_kode" tetapi BUKAN boolean.
 * Nilainya bisa enum string ("LUNAS") atau kode multi-nilai (0/1/2/3),
 * jadi konversi ke true/false akan merusak data.
 */
const NON_BOOLEAN_STATUS_FIELDS = new Set([
  "status_pembayaran",
  "status_transaksi",
  "roll_inventory_status",
  "void_status_kode",
  "sync_status",
]);

/**
 * Apakah field 0/1 ini sebaiknya diperlakukan sebagai boolean saat dikirim ke
 * Supabase? True hanya untuk pola nama boolean yang dikenal, dan tidak pernah
 * untuk field enum di NON_BOOLEAN_STATUS_FIELDS.
 */
function isBooleanField(key: string): boolean {
  if (NON_BOOLEAN_STATUS_FIELDS.has(key)) return false;
  return (
    key.includes("aktif") ||
    key.includes("is_") ||
    key.includes("has_") ||
    key.includes("status") ||
    key.includes("privat")
  );
}

export function normalizeRecord(
  record: Record<string, any>,
  direction: "toSupabase" | "fromSupabase" | "toSQLite" | "fromSQLite"
): Record<string, any> {
  const normalized: Record<string, any> = { ...record };

  if (direction === "toSupabase" || direction === "fromSQLite") {
    // SQLite → Supabase: 0/1 → false/true, hanya untuk field boolean asli.
    Object.keys(normalized).forEach((key) => {
      if (
        typeof normalized[key] === "number" &&
        (normalized[key] === 0 || normalized[key] === 1) &&
        isBooleanField(key)
      ) {
        normalized[key] = normalized[key] === 1;
      }
    });
  } else if (direction === "toSQLite" || direction === "fromSupabase") {
    // Supabase → SQLite: true/false → 1/0; JSONB/objects → TEXT
    Object.keys(normalized).forEach((key) => {
      const value = normalized[key];
      if (typeof value === "boolean") {
        normalized[key] = value ? 1 : 0;
      } else if (value === undefined) {
        normalized[key] = null;
      } else if (value !== null && typeof value === "object") {
        if (value instanceof Date) {
          normalized[key] = value.toISOString();
        } else if (!Buffer.isBuffer(value)) {
          normalized[key] = JSON.stringify(value);
        }
      }
    });
  }

  return normalized;
}
