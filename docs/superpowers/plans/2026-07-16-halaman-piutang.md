# Halaman Piutang — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Halaman `/piutang` di bawah menu Penjualan yang menampilkan piutang dikelompokkan per pelanggan (expandable + total) dan mendukung pembayaran lump-sum dengan alokasi FIFO otomatis, plus isi nama pelanggan walk-in yang sinkron ke Riwayat Penjualan & SPK.

**Architecture:** Opsi A — reuse maksimal. Query agregat baru `getReceivablesByCustomer` (bungkus `getReceivables` existing, kelompokkan in-memory). Orkestrator `payReceivableLumpSum` mengalokasikan FIFO lalu memanggil `payReceivable` existing per tagihan. Server actions ber-guard baru di `src/app/piutang/actions.ts`. Halaman + modal baru. Tidak ada tabel DB baru.

**Tech Stack:** Next.js (App Router, client components + server actions), TypeScript, Zod, Jest (project `node`), Tailwind.

**Spec:** `docs/superpowers/specs/2026-07-16-halaman-piutang-design.md`

## Global Constraints

- #1 Fetch data → `useCachedData` (SWR), cache key stabil (`"piutang-grouped"`), bust via `useInvalidate`.
- #4 Money mutation → reuse `payReceivable` (token `[REF:id_penjualan]` per tagihan); revert lewat `revertSalePayment`.
- #7 Closed-period guard pada mutasi bertanggal (`isDateInClosedPeriod` dari `@/lib/services/accounting-periods-service`).
- #14 Setiap mutasi ber-guard (`requireAdminOrManager` dari `@/lib/auth-guard-server`), `dibuat_oleh` dari `session.uid`, tangani `AuthGuardError` (kembalikan `.status`).
- #15 Validasi input hot-path dengan Zod (`safeParse` → 422).
- #16 Surface DB error via `friendlyPgError` (`@/lib/pg-error`).
- UI: root `<div className="space-y-6">`, gradient title card, dark-mode pair tiap elemen, ikon SVG dari `@/components/icons/PageIcons` (bukan emoji), modal pakai `ModalFormShell` + `useFocusTrap`, `error.tsx` per area, `const x = useMemo(() => data ?? [], [data])` untuk array SWR.
- Bahasa Indonesia baku untuk UI/komentar baru.
- Fungsi existing (verified): `getReceivables()` (`src/lib/services/pos-queries.ts:787`), interface `Receivable` (`pos-queries.ts:108`), `payReceivable(data)` (`src/lib/services/pos-mutations.ts:1502`, return `{id,jumlah_bayar,status_baru,sisa_piutang}`), `revertSalePayment({sale_id,dibuat_oleh})` (`pos-mutations.ts:1644`), `updateSaleCustomer(penjualanId,{pelanggan_id?,pelanggan_nama_snapshot?})` (`src/lib/services/production-service.ts:1463`), `isDateInClosedPeriod(date)` (`accounting-periods-service.ts:122`), `friendlyPgError(e,table?)` (`pg-error.ts:11`), `requireAdminOrManager()` (`auth-guard-server.ts:16`).
- Barrel service: fungsi dipakai lewat `@/lib/services/pos-queries` & `@/lib/services/pos-mutations` (cek re-export bila ada barrel `@/lib/services/pos-service`).

---

### Task 1: Query agregat `getReceivablesByCustomer`

**Files:**
- Modify: `src/lib/services/pos-queries.ts` (tambah interface + fungsi, dekat `getReceivables` ~787-830; interface dekat `Receivable` ~108-126)
- Test: `src/lib/__tests__/piutang-grouping.test.ts` (baru)

**Interfaces:**
- Consumes: `getReceivables(): Promise<Receivable[]>` (existing).
- Produces:
  ```ts
  export interface ReceivableGroup {
    customerKey: string;
    pelanggan_id: string | null;
    pelanggan_nama: string;
    is_walk_in: boolean;
    total_sisa: number;
    jumlah_tagihan: number;
    tagihan: Receivable[]; // FIFO: dibuat_pada asc
  }
  export async function getReceivablesByCustomer(): Promise<ReceivableGroup[]>;
  ```

- [ ] **Step 1: Tulis test gagal**

Buat `src/lib/__tests__/piutang-grouping.test.ts`. Mock `getReceivables` via `jest.mock("@/lib/services/pos-queries", ...)` TIDAK bisa (fungsi di file yang sama) — sebagai gantinya, uji fungsi grouping murni. Refactor: ekstrak grouping ke fungsi murni `groupReceivablesByCustomer(rows: Receivable[]): ReceivableGroup[]` yang diekspor & di-test, lalu `getReceivablesByCustomer` = `groupReceivablesByCustomer(await getReceivables())`.

```ts
import { groupReceivablesByCustomer } from "@/lib/services/pos-queries";
import type { Receivable } from "@/lib/services/pos-queries";

const mk = (o: Partial<Receivable>): Receivable => ({
  id: o.id!, id_penjualan: o.id_penjualan || o.id!, sisa_piutang: o.sisa_piutang ?? 0,
  jumlah_piutang: o.jumlah_piutang ?? o.sisa_piutang ?? 0, jumlah_terbayar: 0,
  status: o.status || "AKTIF", pelanggan_id: o.pelanggan_id ?? null,
  pelanggan_nama: o.pelanggan_nama, dibuat_pada: o.dibuat_pada, ...o,
});

it("kelompokkan per pelanggan_id + FIFO + total", () => {
  const rows = [
    mk({ id: "b", pelanggan_id: "didi", sisa_piutang: 300000, dibuat_pada: "2026-02-01" }),
    mk({ id: "a", pelanggan_id: "didi", sisa_piutang: 50000, dibuat_pada: "2026-01-01" }),
  ];
  const g = groupReceivablesByCustomer(rows);
  expect(g).toHaveLength(1);
  expect(g[0].pelanggan_id).toBe("didi");
  expect(g[0].total_sisa).toBe(350000);
  expect(g[0].jumlah_tagihan).toBe(2);
  expect(g[0].tagihan.map((t) => t.id)).toEqual(["a", "b"]); // FIFO tertua dulu
});

it("walk-in dikelompokkan per nama snapshot (case-insensitive)", () => {
  const rows = [
    mk({ id: "1", pelanggan_id: null, pelanggan_nama: "Budi", sisa_piutang: 10000 }),
    mk({ id: "2", pelanggan_id: null, pelanggan_nama: "budi", sisa_piutang: 20000 }),
  ];
  const g = groupReceivablesByCustomer(rows);
  expect(g).toHaveLength(1);
  expect(g[0].is_walk_in).toBe(true);
  expect(g[0].total_sisa).toBe(30000);
});

it("walk-in tanpa nama → grup __tanpa_nama__", () => {
  const rows = [mk({ id: "1", pelanggan_id: null, pelanggan_nama: "", sisa_piutang: 5000 })];
  const g = groupReceivablesByCustomer(rows);
  expect(g[0].customerKey).toBe("__tanpa_nama__");
});
```

- [ ] **Step 2: Run test → gagal**

Run: `npx jest piutang-grouping`
Expected: FAIL (fungsi belum ada).

- [ ] **Step 3: Implementasi**

Di `src/lib/services/pos-queries.ts`, tambah interface `ReceivableGroup` (dekat `Receivable`) dan fungsi:

```ts
export function groupReceivablesByCustomer(
  rows: Receivable[],
): ReceivableGroup[] {
  const map = new Map<string, ReceivableGroup>();
  for (const r of rows) {
    let key: string;
    let isWalkIn: boolean;
    if (r.pelanggan_id) {
      key = r.pelanggan_id;
      isWalkIn = false;
    } else {
      const nama = (r.pelanggan_nama || "").trim();
      key = nama ? `nama:${nama.toLowerCase()}` : "__tanpa_nama__";
      isWalkIn = true;
    }
    let g = map.get(key);
    if (!g) {
      g = {
        customerKey: key,
        pelanggan_id: r.pelanggan_id ?? null,
        pelanggan_nama:
          (r.pelanggan_nama || "").trim() ||
          (isWalkIn ? "Pelanggan Umum" : "—"),
        is_walk_in: isWalkIn,
        total_sisa: 0,
        jumlah_tagihan: 0,
        tagihan: [],
      };
      map.set(key, g);
    }
    g.total_sisa += Number(r.sisa_piutang) || 0;
    g.jumlah_tagihan += 1;
    g.tagihan.push(r);
  }
  const groups = Array.from(map.values());
  for (const g of groups) {
    g.tagihan.sort((a, b) =>
      String(a.dibuat_pada || "").localeCompare(String(b.dibuat_pada || "")),
    );
  }
  groups.sort((a, b) => b.total_sisa - a.total_sisa);
  return groups;
}

export async function getReceivablesByCustomer(): Promise<ReceivableGroup[]> {
  const rows = await getReceivables();
  return groupReceivablesByCustomer(rows);
}
```

- [ ] **Step 4: Run test → lolos**

Run: `npx jest piutang-grouping`
Expected: PASS.

- [ ] **Step 5: type-check + commit**

Run: `npm run type-check`
Expected: 0 error.

```bash
git add src/lib/services/pos-queries.ts src/lib/__tests__/piutang-grouping.test.ts
git commit -m "feat(piutang): query agregat getReceivablesByCustomer (grouping + FIFO)"
```

---

### Task 2: Zod schema lump-sum

**Files:**
- Modify: `src/lib/schemas/inventori.ts` (tambah schema dekat `payReceivableSchema` ~25-37)

**Interfaces:**
- Produces: `payReceivableLumpSumSchema`, `PayReceivableLumpSumInput`.

- [ ] **Step 1: Implementasi schema**

Di `src/lib/schemas/inventori.ts`, setelah `payReceivableSchema`:

```ts
export const payReceivableLumpSumSchema = z
  .object({
    tagihan_ids: z.array(z.string().min(1)).min(1, "Minimal satu tagihan"),
    jumlah_bayar: finiteNumber.positive(),
    tanggal_bayar: z.string().optional(),
    metode_pembayaran: z.string().optional(),
    referensi: z.string().nullable().optional(),
    catatan: z.string().nullable().optional(),
    dibuat_oleh: z.string().nullable().optional(),
  })
  .passthrough();

export type PayReceivableLumpSumInput = z.infer<
  typeof payReceivableLumpSumSchema
>;
```

(`finiteNumber` sudah didefinisikan di file itu — verifikasi; bila tidak, gunakan `z.coerce.number().finite().positive()`.)

- [ ] **Step 2: type-check + commit**

Run: `npm run type-check`
Expected: 0 error.

```bash
git add src/lib/schemas/inventori.ts
git commit -m "feat(piutang): zod schema payReceivableLumpSum"
```

---

### Task 3: Orkestrator `payReceivableLumpSum`

**Files:**
- Modify: `src/lib/services/pos-mutations.ts` (tambah fungsi setelah `payReceivable` ~1639)
- Test: `src/lib/__tests__/piutang-lumpsum.test.ts` (baru)

**Interfaces:**
- Consumes: `payReceivable` (existing), `isDateInClosedPeriod`, `db`.
- Produces:
  ```ts
  export async function payReceivableLumpSum(input: {
    tagihan_ids: string[]; jumlah_bayar: number; tanggal_bayar?: string;
    metode_pembayaran?: string; referensi?: string; catatan?: string; dibuat_oleh?: string;
  }): Promise<{
    total_dialokasikan: number; sisa_uang: number;
    alokasi: Array<{ piutang_id: string; dibayar: number; status_baru: string }>;
  }>;
  ```

- [ ] **Step 1: Tulis test gagal**

Buat `src/lib/__tests__/piutang-lumpsum.test.ts`. Ikuti pola mock `db` in-memory dari test existing (`src/lib/__tests__/revert-payment-side-effects.test.ts` atau `return-service.test.ts` — pelajari cara mereka mock `@/lib/db-unified` + `accounting-periods-service`). Setup 4 baris `piutang_penjualan` (Didi) sisa 50/100/200/300rb, `dibuat_pada` menaik. Mock `isDateInClosedPeriod` → false.

```ts
it("alokasi FIFO 400rb → 50/100/200 lunas + 50 ke tagihan 300", async () => {
  // setup 4 piutang_penjualan sisa 50k,100k,200k,300k (dibuat_pada asc: a,b,c,d)
  const res = await payReceivableLumpSum({
    tagihan_ids: ["d", "c", "b", "a"], // sengaja acak, server harus urut ulang FIFO
    jumlah_bayar: 400000,
    metode_pembayaran: "TRANSFER",
    dibuat_oleh: "u1",
  });
  expect(res.total_dialokasikan).toBe(400000);
  expect(res.sisa_uang).toBe(0);
  // a,b,c lunas; d bayar 50k
  const byId = Object.fromEntries(res.alokasi.map((x) => [x.piutang_id, x]));
  expect(byId["a"].dibayar).toBe(50000);
  expect(byId["a"].status_baru).toBe("LUNAS");
  expect(byId["d"].dibayar).toBe(50000);
  expect(byId["d"].status_baru).toBe("SEBAGIAN");
});

it("kelebihan uang dikembalikan sebagai sisa_uang", async () => {
  // total piutang 350k, bayar 400k → sisa_uang 50k
  const res = await payReceivableLumpSum({ tagihan_ids: ["a","b"], jumlah_bayar: 400000 });
  expect(res.sisa_uang).toBe(50000);
});

it("tolak bila tanggal masuk periode tertutup", async () => {
  // mock isDateInClosedPeriod → true
  await expect(
    payReceivableLumpSum({ tagihan_ids: ["a"], jumlah_bayar: 10000, tanggal_bayar: "2020-01-01" }),
  ).rejects.toThrow(/periode|ditutup|tutup/i);
});
```

- [ ] **Step 2: Run test → gagal**

Run: `npx jest piutang-lumpsum`
Expected: FAIL.

- [ ] **Step 3: Implementasi**

Di `src/lib/services/pos-mutations.ts`, setelah `payReceivable` selesai (~1639). Import `isDateInClosedPeriod` dari `./accounting-periods-service` bila belum ada (cek import existing).

```ts
export async function payReceivableLumpSum(input: {
  tagihan_ids: string[];
  jumlah_bayar: number;
  tanggal_bayar?: string;
  metode_pembayaran?: string;
  referensi?: string;
  catatan?: string;
  dibuat_oleh?: string;
}): Promise<{
  total_dialokasikan: number;
  sisa_uang: number;
  alokasi: Array<{ piutang_id: string; dibayar: number; status_baru: string }>;
}> {
  if (!input.jumlah_bayar || input.jumlah_bayar <= 0) {
    throw new Error("Jumlah pembayaran harus lebih dari 0");
  }

  // Closed-period guard (#7)
  const tgl = input.tanggal_bayar || getTodayJakarta();
  if (await isDateInClosedPeriod(tgl)) {
    throw new Error(
      "Tanggal pembayaran berada di periode akuntansi yang sudah ditutup. Pilih tanggal pada periode terbuka.",
    );
  }

  // Ambil baris piutang, saring yang masih punya sisa & aktif/sebagian.
  const rows: any[] = [];
  for (const id of input.tagihan_ids) {
    const r = await db.queryOne("piutang_penjualan", { where: { id } });
    const p = r.data as any;
    if (
      p &&
      (p.status === "AKTIF" || p.status === "SEBAGIAN") &&
      Number(p.sisa_piutang) > 0
    ) {
      rows.push(p);
    }
  }
  // FIFO server-side (tidak percaya urutan klien).
  rows.sort((a, b) =>
    String(a.dibuat_pada || "").localeCompare(String(b.dibuat_pada || "")),
  );

  let sisa = input.jumlah_bayar;
  const alokasi: Array<{
    piutang_id: string;
    dibayar: number;
    status_baru: string;
  }> = [];
  for (const p of rows) {
    if (sisa <= 0) break;
    const bayar = Math.min(sisa, Number(p.sisa_piutang));
    if (bayar <= 0) continue;
    const hasil = await payReceivable({
      piutang_id: p.id,
      jumlah_bayar: bayar,
      tanggal_bayar: tgl,
      metode_pembayaran: input.metode_pembayaran,
      referensi: input.referensi || undefined,
      catatan: input.catatan || undefined,
      dibuat_oleh: input.dibuat_oleh,
    });
    alokasi.push({
      piutang_id: p.id,
      dibayar: bayar,
      status_baru: hasil.status_baru,
    });
    sisa -= bayar;
  }

  return {
    total_dialokasikan: input.jumlah_bayar - sisa,
    sisa_uang: Math.max(0, sisa),
    alokasi,
  };
}
```

- [ ] **Step 4: Run test → lolos**

Run: `npx jest piutang-lumpsum`
Expected: PASS.

- [ ] **Step 5: type-check + commit**

Run: `npm run type-check`
Expected: 0 error.

```bash
git add src/lib/services/pos-mutations.ts src/lib/__tests__/piutang-lumpsum.test.ts
git commit -m "feat(piutang): orkestrator payReceivableLumpSum (alokasi FIFO + closed-period guard)"
```

---

### Task 4: Server actions ber-guard

**Files:**
- Create: `src/app/piutang/actions.ts`

**Interfaces:**
- Consumes: `getReceivablesByCustomer`, `payReceivableLumpSum`, `payReceivable`, `revertSalePayment`, `updateSaleCustomer`, `payReceivableLumpSumSchema`, `requireAdminOrManager`, `AuthGuardError`, `friendlyPgError`.
- Produces: `getPiutangGroupedAction`, `bayarPiutangLumpSumAction`, `bayarPiutangSatuAction`, `revertPiutangAction`, `isiNamaPelangganAction`.

- [ ] **Step 1: Implementasi actions**

Buat `src/app/piutang/actions.ts`. Verifikasi jalur import barrel (cek apakah `getReceivablesByCustomer`/`payReceivableLumpSum` perlu di-reexport dari `@/lib/services/pos-service`; bila ada barrel, tambahkan re-export; bila tidak, import langsung dari `pos-queries`/`pos-mutations`).

```ts
"use server";

import {
  getReceivablesByCustomer,
} from "@/lib/services/pos-queries";
import {
  payReceivableLumpSum,
  payReceivable,
  revertSalePayment,
} from "@/lib/services/pos-mutations";
import { updateSaleCustomer } from "@/lib/services/production-service";
import { payReceivableLumpSumSchema } from "@/lib/schemas/inventori";
import { requireAdminOrManager } from "@/lib/auth-guard-server";
import { AuthGuardError } from "@/lib/auth-guard-error";
import { friendlyPgError } from "@/lib/pg-error";

export async function getPiutangGroupedAction() {
  return getReceivablesByCustomer();
}

export async function bayarPiutangLumpSumAction(input: unknown) {
  try {
    const s = await requireAdminOrManager();
    const parsed = payReceivableLumpSumSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, status: 422, error: "Data pembayaran tidak valid" };
    }
    const hasil = await payReceivableLumpSum({
      ...parsed.data,
      dibuat_oleh: s.uid,
    });
    return { ok: true, ...hasil };
  } catch (e) {
    if (e instanceof AuthGuardError) return { ok: false, status: e.status, error: e.message };
    return { ok: false, status: 500, error: friendlyPgError(e, "piutang_penjualan") };
  }
}

export async function bayarPiutangSatuAction(input: {
  piutang_id: string;
  jumlah_bayar: number;
  tanggal_bayar?: string;
  metode_pembayaran?: string;
  referensi?: string;
  catatan?: string;
}) {
  try {
    const s = await requireAdminOrManager();
    const hasil = await payReceivable({ ...input, dibuat_oleh: s.uid });
    return { ok: true, ...hasil };
  } catch (e) {
    if (e instanceof AuthGuardError) return { ok: false, status: e.status, error: e.message };
    return { ok: false, status: 500, error: friendlyPgError(e, "piutang_penjualan") };
  }
}

export async function revertPiutangAction(input: { sale_id: string }) {
  try {
    const s = await requireAdminOrManager();
    await revertSalePayment({ sale_id: input.sale_id, dibuat_oleh: s.uid });
    return { ok: true };
  } catch (e) {
    if (e instanceof AuthGuardError) return { ok: false, status: e.status, error: e.message };
    return { ok: false, status: 500, error: friendlyPgError(e, "penjualan") };
  }
}

export async function isiNamaPelangganAction(input: {
  penjualan_id: string;
  pelanggan_id?: string | null;
  pelanggan_nama_snapshot?: string | null;
}) {
  try {
    await requireAdminOrManager();
    await updateSaleCustomer(input.penjualan_id, {
      pelanggan_id: input.pelanggan_id ?? null,
      pelanggan_nama_snapshot: input.pelanggan_nama_snapshot ?? null,
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof AuthGuardError) return { ok: false, status: e.status, error: e.message };
    return { ok: false, status: 500, error: friendlyPgError(e, "penjualan") };
  }
}
```

Verifikasi signature `revertSalePayment` (param `{ sale_id, dibuat_oleh }`) dan `AuthGuardError.status`/`.message` — sesuaikan bila berbeda saat implementasi.

- [ ] **Step 2: type-check + commit**

Run: `npm run type-check`
Expected: 0 error.

```bash
git add src/app/piutang/actions.ts
git commit -m "feat(piutang): server actions ber-guard (lump-sum, revert, isi nama)"
```

---

### Task 5: Modal bayar lump-sum

**Files:**
- Create: `src/app/piutang/ModalBayarLumpSum.tsx`

**Interfaces:**
- Consumes: `ReceivableGroup` (Task 1), `bayarPiutangLumpSumAction` (Task 4), `ModalFormShell`, `useFocusTrap`.
- Produces: default export komponen `ModalBayarLumpSum`.

- [ ] **Step 1: Implementasi komponen**

Buat `src/app/piutang/ModalBayarLumpSum.tsx`. Pakai `ModalFormShell` (scaffold modal existing — baca `src/components/ModalFormShell.tsx` untuk props: kemungkinan `isOpen/open`, `onClose`, `title`, children, footer). Props komponen:

```tsx
interface Props {
  group: ReceivableGroup | null;
  onClose: () => void;
  onSuccess: () => void;
  showNotification: (tipe: "success" | "error", pesan: string) => void;
}
```

Isi:
- State: `jumlah` (string), `metode` ("CASH"), `tanggal` (default hari ini `new Date().toISOString().slice(0,10)`), `catatan`, `submitting`.
- Daftar tagihan grup (read-only) urut FIFO + total (`group.total_sisa`).
- Tombol cepat "Lunas Semua" → set `jumlah = group.total_sisa`.
- **Pratinjau alokasi FIFO** (useMemo): iterasi `group.tagihan`, alokasi `min(sisa, tagihan.sisa_piutang)`, tampilkan status per tagihan (Lunas / bayar X / tidak tersentuh) + peringatan kelebihan bila `jumlah > total_sisa`.
- Submit: panggil `bayarPiutangLumpSumAction({ tagihan_ids: group.tagihan.map(t=>t.id), jumlah_bayar: Number(jumlah), metode_pembayaran: metode, tanggal_bayar: tanggal, catatan })`. Bila `res.ok` → `showNotification("success", ...)` + `onSuccess()`; else → `showNotification("error", res.error)`. Set `submitting` selama async ("Memproses...").
- Header/tema emerald. Dark-mode pair. Ikon SVG. Format Rupiah `toLocaleString("id-ID")`.

- [ ] **Step 2: type-check**

Run: `npm run type-check`
Expected: 0 error.

- [ ] **Step 3: Commit**

```bash
git add src/app/piutang/ModalBayarLumpSum.tsx
git commit -m "feat(piutang): modal bayar lump-sum dengan pratinjau alokasi FIFO"
```

---

### Task 6: Modal/inline isi nama pelanggan

**Files:**
- Create: `src/app/piutang/ModalIsiNamaPelanggan.tsx`

**Interfaces:**
- Consumes: `isiNamaPelangganAction` (Task 4), `PilihanCari` (`src/components/PilihanCari.tsx`), daftar pelanggan.
- Produces: default export `ModalIsiNamaPelanggan`.

- [ ] **Step 1: Implementasi**

Buat `src/app/piutang/ModalIsiNamaPelanggan.tsx`. Props: `{ penjualanId: string | null; onClose; onSuccess; showNotification }`. Dua mode: (a) pilih pelanggan terdaftar via `PilihanCari` (fetch daftar pelanggan — reuse action existing bila ada, mis. dari `@/app/pos/actions` atau service pelanggan), atau (b) ketik nama bebas. Submit → `isiNamaPelangganAction({ penjualan_id, pelanggan_id?, pelanggan_nama_snapshot? })`. Pakai `ModalFormShell` + dark-mode + ikon SVG.

- [ ] **Step 2: type-check + commit**

Run: `npm run type-check`
Expected: 0 error.

```bash
git add src/app/piutang/ModalIsiNamaPelanggan.tsx
git commit -m "feat(piutang): modal isi nama pelanggan (sinkron ke Riwayat & SPK)"
```

---

### Task 7: Halaman `/piutang` + error boundary

**Files:**
- Create: `src/app/piutang/page.tsx`
- Create: `src/app/piutang/error.tsx`

**Interfaces:**
- Consumes: `getPiutangGroupedAction`, `revertPiutangAction`, `ReceivableGroup`, `ModalBayarLumpSum`, `ModalIsiNamaPelanggan`, `useCachedData`, `useInvalidate`, `DialogKonfirmasi`, `ToastNotifikasi`.
- Produces: route `/piutang`.

- [ ] **Step 1: Implementasi error.tsx**

Buat `src/app/piutang/error.tsx` (client, pola root `src/app/error.tsx`): pesan Bahasa Indonesia + tombol "Coba Lagi" (`reset()`).

```tsx
"use client";
export default function ErrorPiutang({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg p-6 text-center">
        <p className="font-semibold text-gray-800 dark:text-slate-100">
          Gagal memuat halaman Piutang.
        </p>
        <button
          onClick={reset}
          className="mt-3 px-4 py-2 rounded-lg bg-[#00afef] text-white font-semibold"
        >
          Coba Lagi
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implementasi page.tsx**

Buat `src/app/piutang/page.tsx` (client). Pola gabungan `src/app/hutang/page.tsx` + `src/app/vendors/page.tsx`:
- `const { data, mutate } = useCachedData<ReceivableGroup[]>("piutang-grouped", getPiutangGroupedAction);`
- `const grup = useMemo(() => data ?? [], [data]);`
- Title card gradient `from-emerald-500 to-teal-600` + ikon SVG.
- Ringkasan: total piutang keseluruhan (`grup.reduce((s,g)=>s+g.total_sisa,0)`) + `grup.length` pelanggan.
- Filter cari nama (`useState` + filter `grup`).
- Daftar per pelanggan: tiap grup baris (nama + badge "Umum" bila `is_walk_in` + total + jumlah tagihan + tombol Bayar + toggle expand via `useState<Set<string>>`). Expand → tabel rincian tagihan (faktur, tanggal, total, terbayar, sisa, status) + tombol Revert per tagihan (konfirmasi via `DialogKonfirmasi` → `revertPiutangAction({ sale_id: t.id_penjualan })`) + tombol Isi Nama (buka `ModalIsiNamaPelanggan` dgn `penjualanId = t.id_penjualan`) bila walk-in tanpa nama.
- Tombol Bayar → buka `ModalBayarLumpSum` dgn `group`.
- `onSuccess` semua modal → `mutate()` / `useInvalidate("piutang-grouped")` + toast.
- Dark-mode pair; badge putih shade solid; ikon SVG.

- [ ] **Step 3: type-check + build**

Run: `npm run type-check && npm run build`
Expected: 0 error; build sukses; route `/piutang` muncul.

- [ ] **Step 4: Commit**

```bash
git add src/app/piutang/page.tsx src/app/piutang/error.tsx
git commit -m "feat(piutang): halaman Piutang per pelanggan (expandable, bayar, revert, isi nama)"
```

---

### Task 8: Menu + judul halaman

**Files:**
- Modify: `src/components/menuConfig.tsx` (children grup "penjualan" ~138; `PAGE_TITLE_MAP` ~343-372)

**Interfaces:**
- Consumes: ikon `DebtIcon`/`MoneyIcon` (sudah di-import di menuConfig).

- [ ] **Step 1: Tambah item menu**

Di `src/components/menuConfig.tsx`, tambah `MenuItem` di children grup "penjualan" (setelah "Retur Penjualan"):

```tsx
{
  href: "/piutang",
  icon: <MoneyIcon size={18} />,
  label: "Piutang",
  color: "from-emerald-500 to-teal-600",
  allowedRoles: FULL_STAFF,
},
```

Dan di `PAGE_TITLE_MAP`:

```tsx
  "/piutang": "Piutang",
```

(Verifikasi `MoneyIcon` sudah di-import; bila belum, tambah dari `./icons/PageIcons`. `FULL_STAFF` sudah didefinisikan di file.)

- [ ] **Step 2: type-check + build + commit**

Run: `npm run type-check && npm run build`
Expected: 0 error; build sukses.

```bash
git add src/components/menuConfig.tsx
git commit -m "feat(piutang): tambah menu Piutang di grup Penjualan"
```

---

### Task 9: Verifikasi akhir & tinjauan manual

- [ ] **Step 1: Full verifikasi**

Run:
```bash
npm run type-check && npm run lint && npm run build && npx jest
```
Expected: 0 error type-check; tidak ada lint warning baru; build sukses; seluruh jest PASS.

- [ ] **Step 2: Tinjauan manual**

- Buat beberापa penjualan NET30/DP untuk satu pelanggan (mis. Pak Didi) dgn sisa 50/100/200/300rb.
- Buka `/piutang` → grup Pak Didi muncul dgn total 650rb + 4 tagihan; expand tampil rincian.
- Bayar lump-sum 400rb → pratinjau FIFO benar; submit → 3 tagihan lunas + 1 sebagian; total piutang berkurang; cek entri `keuangan`/`pelunasan_piutang` per tagihan.
- Bayar melebihi total → peringatan kelebihan, sisa_uang tidak disimpan.
- Isi nama pelanggan walk-in → cek muncul di Riwayat Penjualan & SPK.
- Revert satu tagihan → piutang kembali.
- Login sebagai staf biasa (non-admin) → halaman terlihat, tapi aksi bayar/revert ditolak guard.
- Dark mode: kontras benar.

- [ ] **Step 3: Commit perbaikan bila ada**

```bash
git add -A
git commit -m "fix(piutang): perbaikan hasil tinjauan"
```

---

## Self-Review

**Spec coverage:**
- Query agregat per pelanggan → Task 1. ✅
- Zod schema lump-sum → Task 2. ✅
- Orkestrator FIFO + closed-period → Task 3. ✅
- Server actions ber-guard (#14) → Task 4. ✅
- Modal lump-sum + pratinjau FIFO → Task 5. ✅
- Isi nama pelanggan (sinkron SPK/Riwayat) → Task 6 + Task 4 (`isiNamaPelangganAction` → `updateSaleCustomer`). ✅
- Halaman expandable per pelanggan + revert → Task 7. ✅
- Error boundary → Task 7. ✅
- Menu + judul → Task 8. ✅
- Verifikasi + manual + role check → Task 9. ✅
- Reuse `payReceivable`/token `[REF]` (#4) → Task 3. ✅
- `friendlyPgError` (#16), `safeParse` (#15) → Task 4. ✅
- `useCachedData`/`useMemo`/`useInvalidate` (#1) → Task 7. ✅

**Placeholder scan:** Task 5, 6, 7 mendeskripsikan komponen UI dengan spesifikasi lengkap (props, state, perilaku, kelas tema) tapi tidak menyalin seluruh JSX verbatim — karena bergantung pada scaffold existing (`ModalFormShell`, `PilihanCari`, `DialogKonfirmasi`, pola `hutang`/`vendors`) yang implementer harus baca. Ini pola UI yang dapat diterima; logika inti (uang/alokasi) di Task 1-4 punya kode lengkap + test.

**Type consistency:** `ReceivableGroup` (Task 1) dipakai Task 5 & 7. `payReceivableLumpSum` signature (Task 3) cocok dgn `bayarPiutangLumpSumAction` (Task 4) & `ModalBayarLumpSum` (Task 5). `payReceivableLumpSumSchema` (Task 2) dipakai Task 4. `revertSalePayment({sale_id,dibuat_oleh})` & `updateSaleCustomer` dipakai konsisten Task 4. Action return shape `{ ok, ... , error?, status? }` konsisten dipakai UI Task 5/7.

## Execution Handoff

Lihat pesan berikut untuk pilihan eksekusi.
