/**
 * Helper format angka dimensi untuk tampilan inventori.
 * Berbeda dari dokumen-item-display.ts yang khusus PO/penawaran.
 */

/** Format bilangan: buang trailing zeros, hindari ".0". */
function fmt(n: number): string {
  const abs = Math.abs(n);
  if (Number.isInteger(abs)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, "");
}

/**
 * Format qty delta untuk tabel riwayat mutasi.
 * Jika ada data roll: "−45 m · lebar 1.5 m (= −67.5 m²)"
 * Jika tidak ada roll: "−10 kg" atau "5"
 */
export function formatQtyMutasi(row: {
  qty_delta: number;
  roll_width_m?: number | null;
  linear_delta_m?: number | null;
  satuan_dasar?: string | null;
}): string {
  const qty = Number(row.qty_delta) || 0;
  const lebar = Number(row.roll_width_m) || 0;
  const linear = Number(row.linear_delta_m);

  if (lebar > 0 && Number.isFinite(linear) && Math.abs(linear) > 0.000001) {
    const absLinear = Math.abs(linear);
    const absQty = Math.abs(qty);
    const signLinear = linear < 0 ? "−" : "+";
    const signQty = qty < 0 ? "−" : "+";
    return `${signLinear}${fmt(absLinear)} m · lebar ${fmt(lebar)} m (= ${signQty}${fmt(absQty)} m²)`;
  }

  const label = fmt(qty);
  return row.satuan_dasar ? `${label} ${row.satuan_dasar}` : label;
}

/**
 * Format saldo/running balance untuk tabel riwayat mutasi.
 */
export function formatSaldoMutasi(qty: number, isDimensi: boolean): string {
  const val = Number(qty) || 0;
  if (isDimensi) return `${fmt(val)} m²`;
  return fmt(val);
}

/**
 * Format stok barang untuk dropdown dan label kolom sistem.
 * Barang dimensi: "90 m² (1.5m: 60m · 2m: 15m)"
 * Barang non-dimensi: "10 kg"
 */
export function formatStokDimensi(material: {
  jumlah_stok: number;
  butuh_dimensi_status: number | boolean;
  satuan_dasar?: string | null;
  roll_variants?: Array<{ lebar_m: number; panjang_tersedia_m: number }>;
}): string {
  const stok = Number(material.jumlah_stok) || 0;
  const isDimensi = Number(material.butuh_dimensi_status) === 1;

  if (!isDimensi) {
    const label = fmt(stok);
    return material.satuan_dasar ? `${label} ${material.satuan_dasar}` : label;
  }

  const totalFmt = fmt(stok);
  const aktif = (material.roll_variants || []).filter(
    (v) => Number(v.panjang_tersedia_m) > 0.000001
  );

  if (aktif.length === 0) return `${totalFmt} m²`;

  const breakdown = aktif
    .map((v) => `${fmt(Number(v.lebar_m))}m: ${fmt(Number(v.panjang_tersedia_m))}m`)
    .join(" · ");

  return `${totalFmt} m² (${breakdown})`;
}
