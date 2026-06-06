// Tipe & helper bersama untuk pemecahan roll di FormulirPembelian (Fase 6 B4).

export interface SplitBatch {
  count: number;
  targets_text: string;
}

/** Pisah teks lebar potongan ("1.5, 1") jadi array angka positif. */
export function parseSplitTargets(text: string | undefined | null): number[] {
  if (!text) return [];
  return text
    .split(/[,+\s]+/)
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/** Jumlah roll di batch yang valid (non-kosong). */
export function sumBatchRolls(batches: SplitBatch[] | undefined): number {
  if (!batches) return 0;
  return batches.reduce(
    (sum, b) => sum + Math.max(0, Math.round(Number(b.count) || 0)),
    0
  );
}
