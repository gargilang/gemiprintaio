import { createCoalescedRunner } from "../coalesce";

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("createCoalescedRunner", () => {
  test("panggilan berbarengan dikolaps: fn jalan jauh lebih sedikit dari pemanggilan", async () => {
    let runs = 0;
    let active = 0;
    let maxActive = 0;
    const run = createCoalescedRunner(async () => {
      runs++;
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return runs;
    });

    // 10 panggilan hampir bersamaan.
    await Promise.all(Array.from({ length: 10 }, () => run()));

    expect(maxActive).toBe(1); // tidak pernah ada 2 run bersamaan
    expect(runs).toBeLessThanOrEqual(2); // 10 panggilan → maks 2 run
    expect(runs).toBeGreaterThanOrEqual(1);
  });

  test("garansi kesegaran: panggilan saat run berjalan memicu run berikutnya", async () => {
    const gate = deferred<void>();
    let runs = 0;
    const run = createCoalescedRunner(async () => {
      runs++;
      if (runs === 1) {
        await gate.promise; // tahan run pertama
      }
      return runs;
    });

    const first = run(); // memulai run #1 (tertahan)
    await Promise.resolve();
    const second = run(); // masuk saat run #1 berjalan → harus dilayani run #2

    gate.resolve();
    const [r1, r2] = await Promise.all([first, second]);
    expect(r1).toBe(1);
    expect(r2).toBe(2); // pemanggil kedua dilayani run baru, bukan hasil run #1
  });

  test("error dipropagasi ke pemanggil yang dilayani run itu", async () => {
    let runs = 0;
    const run = createCoalescedRunner(async () => {
      runs++;
      throw new Error(`boom-${runs}`);
    });
    await expect(run()).rejects.toThrow(/boom-/);
  });
});
