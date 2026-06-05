/**
 * Retry untuk mutasi yang bisa gagal karena tabrakan nomor (faktur/PO) saat
 * dua proses bersamaan menghasilkan nomor sama (D-I5).
 *
 * Aman dipakai HANYA bila percobaan yang gagal tidak meninggalkan data parsial
 * — yaitu composite mutation sudah punya rollback (atomik) atau compensating
 * cleanup (non-atomik). Setiap percobaan harus me-regenerate nomor sendiri.
 */
export async function withDuplicateNumberRetry<T>(
  attempt: () => Promise<T>,
  options?: { maxAttempts?: number; label?: string }
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const label = options?.label ?? "mutation";
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await attempt();
    } catch (e: any) {
      const msg = String(e?.message || "");
      const isDuplicateNumber =
        e?.code === "23505" ||
        /unique|duplicate|nomor_faktur|nomor_pembelian/i.test(msg);
      if (isDuplicateNumber && i < maxAttempts - 1) {
        console.warn(
          `[${label}] nomor bentrok (percobaan ${i + 1}), regenerate & ulang.`
        );
        continue;
      }
      throw e;
    }
  }
  throw new Error(`Gagal menyelesaikan ${label} setelah ${maxAttempts} percobaan`);
}
