/**
 * Coalescing untuk operasi async idempoten yang mahal (mis. recalc buku kas).
 *
 * Mengembalikan fungsi pembungkus yang menjamin:
 *  - TIDAK ada dua eksekusi `fn` berjalan bersamaan.
 *  - N pemanggilan berbarengan dikolaps menjadi sesedikit mungkin run.
 *  - Garansi kesegaran: setiap pemanggil dilayani oleh run yang DIMULAI setelah
 *    pemanggilannya, sehingga efek tulisan sebelum pemanggilan pasti terhitung.
 *
 * Implementasi: satu run aktif pada satu waktu. Pemanggil yang masuk saat run
 * berjalan ditandai "dirty" dan dilayani oleh run berikutnya (yang dimulai
 * setelah run sekarang selesai).
 */
export function createCoalescedRunner<T>(
  fn: () => Promise<T>
): () => Promise<T> {
  let running = false;
  let dirty = false;
  let waiters: Array<(v: T) => void> = [];
  let rejecters: Array<(e: unknown) => void> = [];

  async function drain(): Promise<void> {
    running = true;
    try {
      while (dirty) {
        dirty = false;
        const servedResolve = waiters;
        const servedReject = rejecters;
        waiters = [];
        rejecters = [];
        try {
          const result = await fn();
          for (const w of servedResolve) w(result);
        } catch (e) {
          for (const r of servedReject) r(e);
        }
      }
    } finally {
      running = false;
    }
  }

  return function coalesced(): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      waiters.push(resolve);
      rejecters.push(reject);
      dirty = true;
      if (!running) {
        void drain();
      }
    });
  };
}
