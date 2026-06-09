/**
 * Display labels untuk kolom buku kas — generic, tidak spesifik nama orang.
 * Kolom kasbon_* dan bagi_hasil_* sudah tidak ada di tabel keuangan,
 * tapi label untuk slot generik tetap ada untuk UI baru.
 */

export const FINANCE_SLOT_LABELS: Record<string, string> = {
  saldo: "Saldo kas",
  omzet: "Omzet",
  biaya_operasional: "Biaya operasional",
  biaya_bahan: "HPP",
  laba_bersih: "Laba bersih",
  bagi_hasil_slot_1: "Bagi hasil slot 1",
  bagi_hasil_slot_2: "Bagi hasil slot 2",
  bagi_hasil_slot_3: "Bagi hasil slot 3",
  kasbon_slot_1: "Kasbon slot 1",
  kasbon_slot_2: "Kasbon slot 2",
};

export function lookupFinanceSlotLabel(sourceColumn: string): string {
  const hit = FINANCE_SLOT_LABELS[sourceColumn];
  if (hit) return hit;
  return sourceColumn.replace(/_/g, " ");
}
