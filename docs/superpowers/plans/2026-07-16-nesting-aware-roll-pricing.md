# Nesting-Aware Roll Pricing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Barang berdimensi murni di POS dihargai dengan mempertimbangkan berapa lembar muat berdampingan di lebar roll (nesting), sehingga harga adil (kasus hemat tidak overcharge, kasus boros tetap ditagih), matematika disembunyikan dari kasir, dan stok produksi selaras.

**Architecture:** Fungsi murni baru `getNestedRollBilling` di `roll-size-utils.ts` (fungsi lama `getBillableDimensionsForRoll` TIDAK diubah — tetap dipakai jalur komponen rakitan). Form POS + preview + createSale beralih ke fungsi baru untuk menghitung total area roll (dibagi ke lembar). Kolom nesting baru di `item_penjualan` diteruskan ke SPK sebagai saran. Konsumsi produksi memakai panjang roll nesting sebagai `suggestedLinear` (operator tetap override).

**Tech Stack:** Next.js (server actions/services), TypeScript, Jest (project `node`), Tailwind.

**Spec:** `docs/superpowers/specs/2026-07-16-nesting-aware-roll-pricing-design.md`

## Global Constraints

- #2 Schema change → TIGA tempat sinkron: (a) `supabase/migrations/<ts>_<name>.sql` (additive, `IF NOT EXISTS`), (b) `database/sqlite-schema.sql`, (c) runtime `ALTER TABLE ADD COLUMN` di `src/lib/db-unified.ts`.
- #3 Inventory mutation lewat `postInventoryMovement` roll-aligned (tak diubah alurnya, hanya `suggestedLinear`).
- #6 Roll/dimensi: input Lebar × Panjang; jaga `issueArea = min(billedArea, areaUsed)` agar tak over-consume.
- #7 Closed-period guard: jalur konsumsi produksi existing sudah bertanggal (tak berubah).
- #10 Verifikasi: `npm run type-check` (0 error) → `npm run build` → `npx jest <relevant>`.
- Fungsi lama `getBillableDimensionsForRoll` (`src/lib/roll-size-utils.ts:90-141`) TIDAK diubah (dipakai komponen rakitan + fallback).
- Tidak ada istilah teknis (itemsPerRow/nesting) di UI kasir.
- Bahasa Indonesia baku untuk komentar/UI baru.
- Fungsi/util existing (verified): `getBillableDimensionsForRoll`, `suggestCheapestRollSize`, `isRollSizeValidForDimensions`, `getRoundedDimensions` (`roll-size-utils.ts`); `allocateCartLineCharges`, `roundUpToThousand`, `formatRollCartDetailLine`, `formatPosUnitPrice` (`money-rounding.ts`); `postProductionMaterialConsumption` (`production-service.ts:818`). Test existing gaya: `src/lib/__tests__/roll-size-utils.test.ts`.

---

### Task 1: Fungsi nesting `getNestedRollBilling`

**Files:**
- Modify: `src/lib/roll-size-utils.ts` (tambah interface + fungsi setelah `getBillableDimensionsForRoll` ~141)
- Test: `src/lib/__tests__/roll-nesting.test.ts` (baru)

**Interfaces:**
- Produces:
  ```ts
  export interface NestedRollBilling {
    itemsPerRow: number; rows: number; sisiMelintang: number; sisiCetak: number;
    totalPanjangRoll: number; totalAreaRoll: number; areaEfektifPerLembar: number;
    usesRotation: boolean;
  }
  export function getNestedRollBilling(
    panjang: number, lebar: number, jumlahLembar: number, rollWidth: number,
  ): NestedRollBilling | null;
  ```

- [ ] **Step 1: Tulis test gagal**

Buat `src/lib/__tests__/roll-nesting.test.ts`:

```ts
import { getNestedRollBilling } from "@/lib/roll-size-utils";

describe("getNestedRollBilling", () => {
  it("kasus A: 2 lembar 1×1.5 di roll 2m → nesting 2/baris, area 3m²", () => {
    const b = getNestedRollBilling(1, 1.5, 2, 2)!;
    expect(b.itemsPerRow).toBe(2);
    expect(b.rows).toBe(1);
    expect(b.totalAreaRoll).toBeCloseTo(3, 5);
    expect(b.areaEfektifPerLembar).toBeCloseTo(1.5, 5);
  });

  it("kasus B: 1 lembar 1.2×1.7 di roll 1.5m → 1/baris, area 2.55m²", () => {
    const b = getNestedRollBilling(1.2, 1.7, 1, 1.5)!;
    expect(b.itemsPerRow).toBe(1);
    expect(b.totalAreaRoll).toBeCloseTo(2.55, 5);
  });

  it("6 lembar 0.9×1.7 di roll 2m → 2/baris, 3 baris, area 10.2m²", () => {
    const b = getNestedRollBilling(0.9, 1.7, 6, 2)!;
    expect(b.itemsPerRow).toBe(2);
    expect(b.rows).toBe(3);
    expect(b.totalPanjangRoll).toBeCloseTo(5.1, 5);
    expect(b.totalAreaRoll).toBeCloseTo(10.2, 5);
  });

  it("baris tak penuh: 5 lembar 0.9×1.7 di roll 2m → 2/baris, 3 baris", () => {
    const b = getNestedRollBilling(0.9, 1.7, 5, 2)!;
    expect(b.itemsPerRow).toBe(2);
    expect(b.rows).toBe(3);
  });

  it("jumlah 1 setara rumus roll-aligned lama (1.2×2.7 roll 3m → 3.6m²)", () => {
    const b = getNestedRollBilling(1.2, 2.7, 1, 3)!;
    expect(b.totalAreaRoll).toBeCloseTo(3.6, 5);
    expect(b.usesRotation).toBe(true);
  });

  it("roll terlalu kecil untuk kedua orientasi → null", () => {
    expect(getNestedRollBilling(1.2, 1.7, 1, 1)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test → gagal**

Run: `npx jest roll-nesting`
Expected: FAIL (fungsi belum ada).

- [ ] **Step 3: Implementasi**

Di `src/lib/roll-size-utils.ts`, setelah `getBillableDimensionsForRoll` (~141):

```ts
export interface NestedRollBilling {
  itemsPerRow: number;
  rows: number;
  sisiMelintang: number;
  sisiCetak: number;
  totalPanjangRoll: number;
  totalAreaRoll: number;
  areaEfektifPerLembar: number;
  usesRotation: boolean;
}

/**
 * Billing roll dengan nesting: berapa lembar identik muat berdampingan di lebar
 * roll (floor(rollWidth / sisiMelintang)), lalu total area roll terpakai.
 * Coba dua orientasi (non-rotasi & rotasi), pilih total area terkecil.
 * Return null bila roll tak cukup lebar untuk salah satu orientasi.
 *
 * Contoh: 2 lembar 1×1.5 di roll 2m → rotasi: 2 muat berdampingan, 1 baris,
 * panjang 1.5m, area 2×1.5=3m² (efektif 1.5m²/lembar = luas banner).
 */
export function getNestedRollBilling(
  panjang: number,
  lebar: number,
  jumlahLembar: number,
  rollWidth: number,
): NestedRollBilling | null {
  const lembar = Math.max(1, Math.round(jumlahLembar) || 1);
  const candidates: NestedRollBilling[] = [];

  const addCandidate = (
    sisiMelintang: number,
    sisiCetak: number,
    usesRotation: boolean,
  ) => {
    if (rollWidth < sisiMelintang) return; // tak muat 1 pun
    const itemsPerRow = Math.max(1, Math.floor(rollWidth / sisiMelintang));
    const rows = Math.ceil(lembar / itemsPerRow);
    const totalPanjangRoll = rows * sisiCetak;
    const totalAreaRoll = rollWidth * totalPanjangRoll;
    candidates.push({
      itemsPerRow,
      rows,
      sisiMelintang,
      sisiCetak,
      totalPanjangRoll,
      totalAreaRoll,
      areaEfektifPerLembar: totalAreaRoll / lembar,
      usesRotation,
    });
  };

  // Orientasi non-rotasi: lebar melintang di roll, panjang sepanjang cetak.
  addCandidate(lebar, panjang, false);
  // Orientasi rotasi: panjang melintang di roll, lebar sepanjang cetak.
  addCandidate(panjang, lebar, true);

  if (candidates.length === 0) return null;
  return candidates.reduce((best, c) =>
    c.totalAreaRoll < best.totalAreaRoll ? c : best,
  );
}
```

- [ ] **Step 4: Run test → lolos**

Run: `npx jest roll-nesting`
Expected: PASS.

- [ ] **Step 5: Regression + type-check + commit**

Run: `npx jest roll-size-utils && npm run type-check`
Expected: test lama PASS; 0 error.

```bash
git add src/lib/roll-size-utils.ts src/lib/__tests__/roll-nesting.test.ts
git commit -m "feat(pos): fungsi getNestedRollBilling (billing roll nesting-aware)"
```

---

### Task 2: Migrasi DB kolom nesting di `item_penjualan`

**Files:**
- Create: `supabase/migrations/20260716120000_item_penjualan_roll_nesting.sql`
- Modify: `database/sqlite-schema.sql` (`CREATE TABLE item_penjualan`)
- Modify: `src/lib/db-unified.ts` (blok runtime ALTER `item_penjualan`, dekat kolom `catatan_item` yang sudah ada ~1725)

**Interfaces:**
- Produces: kolom `item_penjualan.roll_items_per_row REAL`, `roll_rows REAL`, `roll_panjang_total_m REAL` (nullable).

- [ ] **Step 1: Migrasi Supabase**

Buat `supabase/migrations/20260716120000_item_penjualan_roll_nesting.sql`:

```sql
-- Info nesting roll untuk barang berdimensi (berapa lembar berdampingan per
-- lebar roll + total panjang roll tersarankan). Dipakai untuk billing adil di
-- POS dan saran roll di SPK. Nullable → data lama fallback ke rumus lama.
ALTER TABLE item_penjualan ADD COLUMN IF NOT EXISTS roll_items_per_row REAL;
ALTER TABLE item_penjualan ADD COLUMN IF NOT EXISTS roll_rows REAL;
ALTER TABLE item_penjualan ADD COLUMN IF NOT EXISTS roll_panjang_total_m REAL;
```

- [ ] **Step 2: sqlite-schema.sql**

Di `database/sqlite-schema.sql`, `CREATE TABLE item_penjualan`, tambah setelah kolom `catatan_item TEXT,` (dari fitur sebelumnya) atau setelah `recommended_roll_width_m REAL,`:

```sql
      roll_items_per_row REAL,
      roll_rows REAL,
      roll_panjang_total_m REAL,
```

- [ ] **Step 3: Runtime ALTER**

Di `src/lib/db-unified.ts`, dalam blok migrasi `item_penjualan` (tempat `catatan_item` ditambahkan), tambah:

```ts
      if (!cols.includes("roll_items_per_row")) {
        db.exec("ALTER TABLE item_penjualan ADD COLUMN roll_items_per_row REAL");
      }
      if (!cols.includes("roll_rows")) {
        db.exec("ALTER TABLE item_penjualan ADD COLUMN roll_rows REAL");
      }
      if (!cols.includes("roll_panjang_total_m")) {
        db.exec("ALTER TABLE item_penjualan ADD COLUMN roll_panjang_total_m REAL");
      }
```

- [ ] **Step 4: type-check + commit**

Run: `npm run type-check`
Expected: 0 error.

```bash
git add supabase/migrations/20260716120000_item_penjualan_roll_nesting.sql database/sqlite-schema.sql src/lib/db-unified.ts
git commit -m "feat(pos): migrasi kolom nesting roll di item_penjualan"
```

---

### Task 3: Field CartItem + hitung nesting di form POS

**Files:**
- Modify: `src/app/pos/pos-types.ts` (interface `CartItem` ~64-107)
- Modify: `src/app/pos/page.tsx` (import ~6; `rollBillingPreview` ~384-423; dropdown roll ~2366-2415; `buildCartItemFromForm` ~635-674)

**Interfaces:**
- Consumes: `getNestedRollBilling` (Task 1).
- Produces: `CartItem.roll_items_per_row?`, `roll_rows?`, `roll_panjang_total_m?`; harga POS memakai `totalAreaRoll`.

- [ ] **Step 1: Tambah field CartItem**

Di `src/app/pos/pos-types.ts`, dalam `CartItem`, setelah `selectedRollSize?`:

```ts
  /** Lembar berdampingan per lebar roll (nesting). */
  roll_items_per_row?: number;
  /** Jumlah baris nesting. */
  roll_rows?: number;
  /** Total panjang roll tersarankan (m) — saran untuk SPK. */
  roll_panjang_total_m?: number;
```

- [ ] **Step 2: Import fungsi nesting di page.tsx**

Di `src/app/pos/page.tsx`, tambah `getNestedRollBilling` ke import dari `@/lib/roll-size-utils` (baris ~6).

- [ ] **Step 3: Ubah `rollBillingPreview`**

Ganti perhitungan (`page.tsx:384-423`) agar memakai nesting. Inti: `pieceCount` = jumlah lembar. Hitung:

```ts
  const rollBillingPreview = useMemo(() => {
    if (!useRounding || !hasValidDimensions || selectedRollSize == null || !selectedUnit) {
      return null;
    }
    const pieceCount = Math.max(1, Math.round(parseFloat(quantity) || 1));
    const nest = getNestedRollBilling(
      parsedPanjang, parsedLebar, pieceCount, selectedRollSize,
    );
    if (!nest) return null;
    const hargaPerSatuan = selectedPelanggan?.member_status
      ? selectedUnit.harga_member || selectedUnit.harga_jual
      : selectedUnit.harga_jual;
    const subtotalRaw = nest.totalAreaRoll * hargaPerSatuan;
    return { nest, subtotalRaw, hargaPerSatuan, pieceCount };
  }, [useRounding, hasValidDimensions, parsedPanjang, parsedLebar, selectedRollSize, selectedUnit, selectedPelanggan, quantity]);
```

(Sesuaikan nama field yang dibaca UI preview "Tagih" ~2416-2427 → `rollBillingPreview.subtotalRaw`.)

- [ ] **Step 4: Ubah dropdown "Roll yang dipakai"**

Di dropdown roll (`page.tsx:2366-2415`), untuk tiap roll valid hitung `getNestedRollBilling(parsedPanjang, parsedLebar, pieceCount, size)`; bila `null` skip; harga = `nest.totalAreaRoll × harga`. Tampilkan label ringkas (tanpa istilah nesting): `{size} m — {nest.totalPanjangRoll.toFixed(2)} m × Roll {size} m = {nest.totalAreaRoll.toFixed(2)} m² · Rp {subRaw}`. Default pilih roll dengan `totalAreaRoll` terkecil (hitung saat useRounding aktif pertama kali, ganti `suggestCheapestRollSize` bila perlu — atau pertahankan `suggestCheapestRollSize` untuk pilihan awal lalu harga dihitung nesting).

- [ ] **Step 5: Ubah `buildCartItemFromForm`**

Di cabang berdimensi (`page.tsx:635-674`), saat `useRounding`, hitung nesting dan set:

```ts
    const pieceCount = Math.max(1, Math.round(finalQuantity) || 1);
    const nest = getNestedRollBilling(originalPanjang, originalLebar, pieceCount, selectedRollSize);
    if (!nest) { showMsg("error", "Roll tidak cukup untuk ukuran ini"); return null; }
    // billed dimensions untuk tampilan (dari getRoundedDimensions lama tetap boleh)
    const rounded = getRoundedDimensions(originalPanjang, originalLebar, true, selectedRollSize);
    billedP = rounded.panjang; billedL = rounded.lebar; rollUsed = rounded.rollSize ?? selectedRollSize;
    jumlahRoll = pieceCount;                         // jumlah lembar
    finalQuantity = nest.totalAreaRoll;              // m² total ditagih (nesting)
    // simpan info nesting
    rollItemsPerRow = nest.itemsPerRow;
    rollRows = nest.rows;
    rollPanjangTotal = nest.totalPanjangRoll;
```

Lalu di object CartItem yang di-return (cabang berdimensi ~752-773), tambah:

```ts
      roll_items_per_row: rollItemsPerRow,
      roll_rows: rollRows,
      roll_panjang_total_m: rollPanjangTotal,
```

(`subtotalRaw = finalQuantity × hargaPerSatuan` sudah = `totalAreaRoll × harga`.)

- [ ] **Step 6: type-check + build**

Run: `npm run type-check && npm run build`
Expected: 0 error; build sukses.

- [ ] **Step 7: Commit**

```bash
git add src/app/pos/pos-types.ts src/app/pos/page.tsx
git commit -m "feat(pos): harga roll nesting-aware di form POS (default termurah, matematika tersembunyi)"
```

---

### Task 4: Simpan nesting ke item_penjualan (createSale)

**Files:**
- Modify: `src/app/pos/page.tsx` (saleItems mapping ~1316-1348)
- Modify: `src/lib/services/pos-mutations.ts` (insert item_penjualan ~669-712)
- Modify: `src/lib/schemas/pos.ts` (saleItemSchema — izinkan field baru via passthrough sudah ada; tambah eksplisit bila perlu)

**Interfaces:**
- Consumes: field nesting CartItem (Task 3).
- Produces: `item_penjualan.roll_items_per_row/roll_rows/roll_panjang_total_m` tersimpan.

- [ ] **Step 1: Teruskan di saleItems (page.tsx)**

Di mapping `saleItems` (`page.tsx:1316-1348`), tambah:

```ts
        roll_items_per_row: item.roll_items_per_row ?? null,
        roll_rows: item.roll_rows ?? null,
        roll_panjang_total_m: item.roll_panjang_total_m ?? null,
```

- [ ] **Step 2: Simpan di createSale (pos-mutations.ts)**

Di object `saleItem` yang di-insert ke `item_penjualan` (~669-712), tambah:

```ts
          roll_items_per_row: (item as any).roll_items_per_row ?? null,
          roll_rows: (item as any).roll_rows ?? null,
          roll_panjang_total_m: (item as any).roll_panjang_total_m ?? null,
```

- [ ] **Step 3: Zod schema (bila strict)**

`saleItemSchema` (`src/lib/schemas/pos.ts`) sudah `.passthrough()`, jadi field baru tidak ditolak. Tambahkan eksplisit untuk kejelasan (opsional):

```ts
    roll_items_per_row: finiteNumber.optional(),
    roll_rows: finiteNumber.optional(),
    roll_panjang_total_m: finiteNumber.optional(),
```

- [ ] **Step 4: type-check + build + commit**

Run: `npm run type-check && npm run build`
Expected: 0 error; build sukses.

```bash
git add src/app/pos/page.tsx src/lib/services/pos-mutations.ts src/lib/schemas/pos.ts
git commit -m "feat(pos): simpan info nesting roll ke item_penjualan saat checkout"
```

---

### Task 5: Selaraskan konsumsi produksi (suggestedLinear nesting)

**Files:**
- Modify: `src/lib/services/production-service.ts` (`postProductionMaterialConsumption` ~854-876)
- Test: `src/lib/__tests__/production-roll-nesting-consumption.test.ts` (baru)

**Interfaces:**
- Consumes: `getNestedRollBilling`, `saleItem.roll_panjang_total_m`, `saleItem.roll_items_per_row`.
- Produces: `suggestedLinear` memakai panjang nesting; fallback rumus lama untuk data lama; tidak over-consume.

- [ ] **Step 1: Tulis test gagal**

Buat `src/lib/__tests__/production-roll-nesting-consumption.test.ts` (pola mock dari test produksi existing). Setup item_produksi + item_penjualan berdimensi murni dengan `roll_panjang_total_m = 1.5`, `recommended_roll_width_m = 2`, `jumlah = 3` (m²), roll variant lebar 2m. Panggil konsumsi tanpa `linear_used_m` (biar pakai suggested).

```ts
it("suggestedLinear pakai roll_panjang_total_m bila tersedia (tidak over-consume)", async () => {
  // saleItem: roll_panjang_total_m=1.5, recommended_roll_width_m=2, jumlah=3
  const c = await postProductionMaterialConsumption({
    item_produksi_id: "IP-1",
    roll_variant_id: "rv-2m",
    // linear_used_m dikosongkan → suggested
    operator_id: "u1",
  });
  const mv = Array.from(mockTable("inventory_movements").values())
    .find((m) => m.movement_type === "PRODUCTION_ISSUE");
  // areaUsed = 2 × 1.5 = 3 (bukan per-lembar penuh 6)
  expect(Math.abs(Number(mv.linear_delta_m))).toBeCloseTo(1.5, 5);
  expect(Math.abs(Number(mv.qty_delta))).toBeCloseTo(3, 5);
});

it("fallback ke rumus lama bila roll_panjang_total_m kosong (data lama)", async () => {
  // saleItem tanpa roll_panjang_total_m, panjang/lebar/jumlah ada
  // suggested = getBillableDimensionsForRoll(...).area / rollWidth
  const c = await postProductionMaterialConsumption({
    item_produksi_id: "IP-2", roll_variant_id: "rv-2m", operator_id: "u1",
  });
  expect(c).toBeTruthy(); // tidak error, memakai fallback
});
```

- [ ] **Step 2: Run test → gagal**

Run: `npx jest production-roll-nesting-consumption`
Expected: FAIL.

- [ ] **Step 3: Implementasi**

Di `postProductionMaterialConsumption`, bagian menghitung `suggested`/`suggestedLinear` (~865-870), untuk baris berdimensi murni (bukan komponen), pakai nesting bila tersedia. Import `getNestedRollBilling` bila belum. Ganti:

```ts
  // suggestedLinear: bila penjualan menyimpan info nesting & roll variant cocok
  // dengan yang dipakai, pakai total panjang roll nesting (tidak over-consume).
  let suggestedLinear = 0;
  const savedPanjangTotal = positiveNumber((saleItem as any).roll_panjang_total_m);
  const savedRollWidth = positiveNumber((saleItem as any).recommended_roll_width_m);
  if (!isKomponen && savedPanjangTotal > 0) {
    if (Math.abs(savedRollWidth - rollWidth) < 1e-6) {
      // roll yang dipilih operator = roll tersarankan → pakai panjang tersimpan
      suggestedLinear = savedPanjangTotal;
    } else {
      // operator pilih roll lain → hitung ulang nesting utk roll ini
      const lembar = Math.max(
        1,
        Math.round(
          positiveNumber((saleItem as any).roll_rows) *
            positiveNumber((saleItem as any).roll_items_per_row),
        ) || 1,
      );
      const nest = getNestedRollBilling(orderP, orderL, lembar, rollWidth);
      suggestedLinear = nest ? nest.totalPanjangRoll : 0;
    }
  }
  if (suggestedLinear <= 0) {
    // Fallback rumus lama (data lama / non-nesting).
    const suggested =
      orderP > 0 && orderL > 0
        ? getBillableDimensionsForRoll(orderP, orderL, rollWidth)
        : null;
    suggestedLinear = suggested ? suggested.area / rollWidth : 0;
  }
  const linearUsed = positiveNumber(input.linear_used_m) || suggestedLinear;
```

(Pastikan `orderP`/`orderL`/`rollWidth`/`billedArea` yang sudah ada tetap dipakai. `issueArea = min(billedArea, areaUsed)` existing menjaga tak over-consume.)

- [ ] **Step 4: Run test → lolos + regression**

Run: `npx jest production-roll-nesting-consumption production-consumption production-konsumsi-komponen-roll`
Expected: semua PASS.

- [ ] **Step 5: type-check + commit**

Run: `npm run type-check`
Expected: 0 error.

```bash
git add src/lib/services/production-service.ts src/lib/__tests__/production-roll-nesting-consumption.test.ts
git commit -m "feat(spk): konsumsi roll produksi selaras nesting (suggestedLinear + fallback)"
```

---

### Task 6: Saran roll + panjang di SPK (UI + cetak)

**Files:**
- Modify: `src/lib/services/production-service.ts` (`ProductionOrderItem` type + mapping getProductionOrders/ById — sertakan `roll_panjang_total_m`, `roll_items_per_row` dari saleItem)
- Modify: `src/app/produksi/spk/components/SpkDetailModal.tsx` (blok konfirmasi roll — default `linear_used_m` + hint saran)
- Modify: `src/app/produksi/spk/components/spk-print.ts` (tampilkan saran roll bila ada)

**Interfaces:**
- Consumes: kolom nesting item_penjualan (Task 2/4).
- Produces: SPK menampilkan saran roll + panjang; input `linear_used_m` default terisi saran (editable).

- [ ] **Step 1: Sertakan field nesting di ProductionOrderItem**

Di `production-service.ts`, tipe `ProductionOrderItem`, tambah `roll_panjang_total_m?: number | null;` + `roll_items_per_row?: number | null;`. Di mapping `getProductionOrders`/`getProductionOrderById`, ambil dari `saleItem` (pola sama seperti `recommended_roll_width_m`).

- [ ] **Step 2: Default + hint di SpkDetailModal**

Di blok konfirmasi roll (`SpkDetailModal.tsx`, tempat input panjang aktual), set nilai default input `linear_used_m` = `item.roll_panjang_total_m` bila ada. Tambah hint teks kecil (Bahasa Indonesia, dark-mode pair): `Saran: Roll {recommended_roll_width_m} m, ~{roll_panjang_total_m} m`. Operator tetap bisa mengubah.

- [ ] **Step 3: Cetak SPK saran roll**

Di `spk-print.ts`, pada baris item berdimensi, bila `roll_panjang_total_m` ada, tampilkan `Saran roll: {recommended_roll_width_m} m × {roll_panjang_total_m} m`.

- [ ] **Step 4: type-check + build + commit**

Run: `npm run type-check && npm run build`
Expected: 0 error; build sukses.

```bash
git add src/lib/services/production-service.ts src/app/produksi/spk/components/SpkDetailModal.tsx src/app/produksi/spk/components/spk-print.ts
git commit -m "feat(spk): tampilkan saran roll + panjang nesting di detail & cetak SPK"
```

---

### Task 7: Verifikasi akhir & tinjauan manual

- [ ] **Step 1: Full verifikasi**

Run:
```bash
npm run type-check && npm run lint && npm run build && npx jest
```
Expected: 0 error type-check; tidak ada lint warning baru; build sukses; seluruh jest PASS.

- [ ] **Step 2: Tinjauan manual**

- Jual 2 lembar banner 1×1.5m, aktifkan pembulatan roll → daftar roll: roll 2m harga = 2×1.5×harga (adil, bukan 4×1.5); pilih roll lain harga menyesuaikan.
- Jual 1 banner 1.2×1.7m, roll 1.5m → harga roll-aligned 2.55m² (boros wajar).
- Jual 6 lembar 0.9×1.7m → cek roll 2m: total 10.2m², panjang 5.1m.
- Cek SPK item tsb: saran "Roll 2m, ~5.1m" muncul; input panjang default 5.1 (editable). Ubah panjang → stok terpotong sesuai; tidak over-consume.
- Data lama (penjualan sebelum fitur) → SPK & konsumsi tetap jalan (fallback rumus lama).
- Kasir tidak melihat istilah teknis apa pun (itemsPerRow/nesting).

- [ ] **Step 3: Commit perbaikan bila ada**

```bash
git add -A
git commit -m "fix(pos): perbaikan hasil tinjauan nesting roll pricing"
```

---

## Self-Review

**Spec coverage:**
- Rumus nesting `getNestedRollBilling` → Task 1. ✅
- Migrasi kolom nesting (3 tempat) → Task 2. ✅
- Field CartItem + harga POS nesting + UX tersembunyi + default termurah → Task 3. ✅
- Simpan ke item_penjualan → Task 4. ✅
- Konsumsi produksi selaras + fallback data lama + tak over-consume → Task 5. ✅
- Saran roll + panjang di SPK (UI + cetak) → Task 6. ✅
- Verifikasi + manual + data lama + regresi → Task 7. ✅
- Fungsi lama `getBillableDimensionsForRoll` tak diubah → dipatuhi (Task 1 hanya menambah). ✅
- Kompatibilitas komponen rakitan (isu #2) → tidak disentuh; Task 5 guard `!isKomponen`. ✅

**Placeholder scan:** Task 3 & 6 mendeskripsikan perubahan UI di file besar existing (`page.tsx`, `SpkDetailModal.tsx`) dengan potongan kode konkret + lokasi baris, tanpa menyalin seluruh blok JSX (implementer membaca blok existing sebagai sumber). Logika inti (rumus, konsumsi) di Task 1 & 5 punya kode lengkap + test. Dapat diterima.

**Type consistency:** `NestedRollBilling`/`getNestedRollBilling` (Task 1) dipakai konsisten Task 3 & 5. Kolom `roll_items_per_row`/`roll_rows`/`roll_panjang_total_m` konsisten dari Task 2 (DB) → Task 3 (CartItem) → Task 4 (item_penjualan) → Task 5/6 (konsumsi + SPK). `isKomponen` (dari isu #2, sudah di main) dipakai di Task 5 untuk membatasi ke berdimensi murni.

## Execution Handoff

Lihat pesan berikut untuk pilihan eksekusi.
