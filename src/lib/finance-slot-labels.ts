/**
 * Label tampilan untuk kolom buku kas — tanpa nama orang tertentu (white-label).
 * Nama kolom teknis (bagi_hasil_anwar, dll.) tetap untuk kompatibilitas data.
 */

export const FINANCE_SLOT_LABELS: Record<string, string> = {
  saldo: "Saldo kas",
  omzet: "Omzet",
  biaya_operasional: "Biaya operasional",
  biaya_bahan: "Biaya bahan",
  laba_bersih: "Laba bersih",
  bagi_hasil_anwar: "Mitra bagi hasil 1",
  bagi_hasil_suri: "Mitra bagi hasil 2",
  bagi_hasil_gemi: "Mitra bagi hasil 3",
  kasbon_anwar: "Kasbon mitra 1",
  kasbon_suri: "Kasbon mitra 2",
  kasbon_cahaya: "Kasbon karyawan 1",
  kasbon_dinil: "Kasbon karyawan 2",
};

export function lookupFinanceSlotLabel(sourceColumn: string): string {
  const hit = FINANCE_SLOT_LABELS[sourceColumn];
  if (hit) return hit;
  return sourceColumn.replace(/_/g, " ");
}
