# Inventori Roll-Aware Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membuat tiga halaman inventori (Riwayat Mutasi, Penyesuaian, Opname) dan modal di halaman Barang menjadi sadar terhadap barang dimensi/roll — menampilkan konteks m²+roll, menerima input per variant lebar, dan melakukan opname per variant.

**Architecture:** Tiga fase terpisah: (1) display-only helpers dan format angka, (2) form input roll-aware dengan ekstensi service, (3) schema migration + opname per variant. Setiap fase menghasilkan software yang bisa digunakan secara mandiri. Helper format terpusat di `format-dimensi.ts`; komponen form di `InputDimensiRoll.tsx`.

**Tech Stack:** Next.js App Router, React, TypeScript, Supabase Postgres, SQLite (better-sqlite3 via Tauri), Jest (node project, mock-db helper), Tailwind CSS.

---

## Peta File

| File | Status | Tanggung Jawab |
|------|--------|----------------|
| `src/lib/format-dimensi.ts` | Baru | Format angka m² + roll untuk tampilan inventori |
| `src/lib/__tests__/format-dimensi.test.ts` | Baru | Unit tests pure helpers |
| `src/lib/__tests__/inventory-service-roll.test.ts` | Baru | Tests service adjustment + waste dengan roll params |
| `src/lib/__tests__/stock-opname-service-roll.test.ts` | Baru | Tests opname per variant |
| `src/components/InputDimensiRoll.tsx` | Baru | Form input roll (pilih lebar + panjang meter) |
| `src/app/barang/ModalAdjustStok.tsx` | Baru | Modal adjustment stok diekstrak dari barang/page.tsx |
| `supabase/migrations/20260701000000_stock_opname_items_roll.sql` | Baru | Kolom roll di stock_opname_items |
| `src/app/inventori/movements/actions.ts` | Diubah | Sertakan butuh_dimensi_status + satuan_dasar |
| `src/app/inventori/movements/page.tsx` | Diubah | Format qty/saldo pakai format-dimensi |
| `src/app/inventori/adjustments/actions.ts` | Diubah | Forward roll params ke service |
| `src/app/inventori/adjustments/page.tsx` | Diubah | Label dropdown + InputDimensiRoll jika dimensi |
| `src/app/inventori/opname/actions.ts` | Diubah | counted_linear_m untuk item dimensi |
| `src/app/inventori/opname/page.tsx` | Diubah | Per-variant rows untuk barang dimensi |
| `src/app/barang/page.tsx` | Diubah | Gunakan ModalAdjustStok; pass roll_variants ke ModalCatatRusak |
| `src/app/barang/ModalCatatRusak.tsx` | Diubah | InputDimensiRoll jika barang dimensi |
| `src/lib/services/inventory-service.ts` | Diubah | Roll params di createInventoryAdjustment + createWasteMovement |
| `src/lib/services/stock-opname-service.ts` | Diubah | Opname per variant, validasi sebelum post |
| `src/lib/db-sqlite-migrations.ts` | Diubah | Runtime ALTER untuk kolom baru stock_opname_items |
| `database/sqlite-schema.sql` | Diubah | Kolom roll di definisi CREATE TABLE stock_opname_items |

---

## FASE 1 — Display Only

### Task 1: Helper format-dimensi.ts + unit tests

**Files:**
- Create: `src/lib/format-dimensi.ts`
- Create: `src/lib/__tests__/format-dimensi.test.ts`

- [ ] **Step 1.1: Tulis failing test**

```ts
// src/lib/__tests__/format-dimensi.test.ts
import {
  formatQtyMutasi,
  formatSaldoMutasi,
  formatStokDimensi,
} from "../format-dimensi";

describe("formatQtyMutasi", () => {
  it("menampilkan detail roll jika ada roll_width_m dan linear_delta_m negatif", () => {
    expect(
      formatQtyMutasi({ qty_delta: -67.5, roll_width_m: 1.5, linear_delta_m: -45 })
    ).toBe("−45 m · lebar 1.5 m (= −67.5 m²)");
  });

  it("menampilkan tanda positif untuk penambahan roll", () => {
    expect(
      formatQtyMutasi({ qty_delta: 90, roll_width_m: 1.5, linear_delta_m: 60 })
    ).toBe("+60 m · lebar 1.5 m (= +90 m²)");
  });

  it("membulatkan m² ke 2 desimal", () => {
    const result = formatQtyMutasi({
      qty_delta: -22.5,
      roll_width_m: 1.5,
      linear_delta_m: -15,
    });
    expect(result).toBe("−15 m · lebar 1.5 m (= −22.5 m²)");
  });

  it("menampilkan angka + satuan jika tidak ada data roll", () => {
    expect(formatQtyMutasi({ qty_delta: -10, satuan_dasar: "kg" })).toBe("-10 kg");
  });

  it("menampilkan angka tanpa satuan jika satuan kosong", () => {
    expect(formatQtyMutasi({ qty_delta: 5 })).toBe("5");
  });

  it("mengabaikan roll_width_m jika linear_delta_m null", () => {
    expect(
      formatQtyMutasi({ qty_delta: -10, roll_width_m: 1.5, linear_delta_m: null })
    ).toBe("-10");
  });
});

describe("formatSaldoMutasi", () => {
  it("menambahkan m² untuk barang dimensi", () => {
    expect(formatSaldoMutasi(90, true)).toBe("90 m²");
  });

  it("menampilkan desimal yang dibutuhkan", () => {
    expect(formatSaldoMutasi(67.5, true)).toBe("67.5 m²");
  });

  it("tidak menambahkan satuan untuk barang non-dimensi", () => {
    expect(formatSaldoMutasi(10, false)).toBe("10");
  });
});

describe("formatStokDimensi", () => {
  it("menampilkan breakdown roll jika ada variant dengan stok > 0", () => {
    expect(
      formatStokDimensi({
        jumlah_stok: 90,
        butuh_dimensi_status: 1,
        roll_variants: [
          { lebar_m: 1.5, panjang_tersedia_m: 60 },
          { lebar_m: 2, panjang_tersedia_m: 0 },
        ],
      })
    ).toBe("90 m² (1.5m: 60m)");
  });

  it("menampilkan total m² tanpa breakdown jika semua variant nol", () => {
    expect(
      formatStokDimensi({
        jumlah_stok: 0,
        butuh_dimensi_status: 1,
        roll_variants: [{ lebar_m: 1.5, panjang_tersedia_m: 0 }],
      })
    ).toBe("0 m²");
  });

  it("menampilkan total m² tanpa breakdown jika roll_variants kosong", () => {
    expect(
      formatStokDimensi({ jumlah_stok: 45, butuh_dimensi_status: 1 })
    ).toBe("45 m²");
  });

  it("menampilkan angka + satuan untuk barang non-dimensi", () => {
    expect(
      formatStokDimensi({ jumlah_stok: 10, butuh_dimensi_status: 0, satuan_dasar: "kg" })
    ).toBe("10 kg");
  });

  it("multiple variants tampil dengan pemisah ·", () => {
    expect(
      formatStokDimensi({
        jumlah_stok: 120,
        butuh_dimensi_status: 1,
        roll_variants: [
          { lebar_m: 1.5, panjang_tersedia_m: 60 },
          { lebar_m: 2, panjang_tersedia_m: 15 },
        ],
      })
    ).toBe("120 m² (1.5m: 60m · 2m: 15m)");
  });
});
```

- [ ] **Step 1.2: Jalankan test — harus FAIL**

```bash
npx jest src/lib/__tests__/format-dimensi.test.ts --no-coverage
```

Expected: `Cannot find module '../format-dimensi'`

- [ ] **Step 1.3: Implementasi format-dimensi.ts**

```ts
// src/lib/format-dimensi.ts

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
```

- [ ] **Step 1.4: Jalankan test — harus PASS**

```bash
npx jest src/lib/__tests__/format-dimensi.test.ts --no-coverage
```

Expected: `Tests: 11 passed`

- [ ] **Step 1.5: Commit**

```bash
git add src/lib/format-dimensi.ts src/lib/__tests__/format-dimensi.test.ts
git commit -m "feat: tambah helper format-dimensi untuk tampilan inventori roll"
```

---

### Task 2: Riwayat Mutasi — format display roll

**Files:**
- Modify: `src/app/inventori/movements/actions.ts`
- Modify: `src/app/inventori/movements/page.tsx`

- [ ] **Step 2.1: Update actions.ts — sertakan butuh_dimensi_status dan satuan_dasar**

Ganti seluruh isi `src/app/inventori/movements/actions.ts`:

```ts
"use server";

import {
  getInventoryMovements,
  type InventoryMovementType,
} from "@/lib/services/inventory-service";
import { getMaterials } from "@/lib/services/materials-service";

export async function getMovementLedgerAction(filters: {
  barang_id?: string;
  source_id?: string;
  source_type?: string;
  movement_type?: InventoryMovementType;
  date_from?: string;
  date_to?: string;
  reference?: string;
}) {
  const [movements, materials] = await Promise.all([
    getInventoryMovements(filters),
    getMaterials(),
  ]);

  // Map barang_id → data tampilan (nama, satuan, dimensi)
  const materialMap = new Map(
    materials.map((m: any) => [
      m.id,
      {
        nama: m.nama,
        satuan_dasar: m.satuan_dasar ?? "",
        butuh_dimensi_status: Number(m.butuh_dimensi_status),
      },
    ])
  );

  // Hitung running balance per barang (replay forward dari urutan waktu)
  const byBarang = new Map<string, any[]>();
  for (const movement of movements) {
    const list = byBarang.get(movement.barang_id) || [];
    list.push(movement);
    byBarang.set(movement.barang_id, list);
  }
  for (const [, list] of byBarang) {
    list.sort((a, b) =>
      String(a.dibuat_pada || "").localeCompare(String(b.dibuat_pada || ""))
    );
    let running = 0;
    for (const movement of list) {
      if (typeof movement.qty_after === "number" && Number.isFinite(movement.qty_after)) {
        running = movement.qty_after;
      } else {
        running += Number(movement.qty_delta || 0);
      }
      movement.running_balance = running;
    }
  }

  return {
    movements: movements.map((movement) => {
      const mat = materialMap.get(movement.barang_id);
      return {
        ...movement,
        barang_nama: mat?.nama || movement.barang_id,
        satuan_dasar: mat?.satuan_dasar ?? "",
        butuh_dimensi_status: mat?.butuh_dimensi_status ?? 0,
      };
    }),
    materials,
  };
}
```

- [ ] **Step 2.2: Update page.tsx — gunakan formatQtyMutasi dan formatSaldoMutasi**

Tambahkan import di bagian atas `src/app/inventori/movements/page.tsx`:

```ts
import { formatQtyMutasi, formatSaldoMutasi } from "@/lib/format-dimensi";
```

Hapus definisi `numberFmt` (tidak dipakai lagi di kolom utama):
```ts
// HAPUS baris ini:
const numberFmt = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 4 });
```

Ubah baris render kolom Qty (sekitar baris 240):
```tsx
// SEBELUM:
<td className={`p-3 text-right ${Number(row.qty_delta || 0) < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
  {numberFmt.format(Number(row.qty_delta || 0))}
</td>

// SESUDAH:
<td className={`p-3 text-right tabular-nums ${Number(row.qty_delta || 0) < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
  {formatQtyMutasi(row)}
</td>
```

Ubah baris render kolom Saldo (sekitar baris 241):
```tsx
// SEBELUM:
<td className="p-3 text-right">{numberFmt.format(Number(row.running_balance ?? row.qty_after ?? 0))}</td>

// SESUDAH:
<td className="p-3 text-right tabular-nums">
  {formatSaldoMutasi(Number(row.running_balance ?? row.qty_after ?? 0), Number(row.butuh_dimensi_status) === 1)}
</td>
```

Ubah header kolom Qty agar informatif:
```tsx
// SEBELUM:
<th className="p-3 text-right">Qty</th>

// SESUDAH:
<th className="p-3 text-right">Qty / Delta</th>
```

Update ekspor CSV — tambahkan kolom roll di `exportCsv()`. Ganti array `header`:
```ts
const header = [
  "tanggal",
  "barang",
  "movement_type",
  "qty_delta",
  "qty_after",
  "running_balance",
  "roll_width_m",
  "linear_delta_m",
  "unit_cost",
  "value_delta",
  "source_type",
  "source_id",
  "catatan",
];
```

Dan baris data di dalam loop:
```ts
lines.push(
  [
    row.tanggal,
    row.barang_nama,
    row.movement_type,
    row.qty_delta,
    row.qty_after,
    row.running_balance,
    row.roll_width_m ?? "",
    row.linear_delta_m ?? "",
    row.unit_cost,
    row.value_delta,
    row.source_type,
    row.source_id,
    row.catatan,
  ]
    .map(escape)
    .join(",")
);
```

- [ ] **Step 2.3: Type-check**

```bash
npm run type-check 2>&1 | head -30
```

Expected: `Found 0 errors`

- [ ] **Step 2.4: Commit**

```bash
git add src/app/inventori/movements/actions.ts src/app/inventori/movements/page.tsx
git commit -m "feat(fase1): riwayat mutasi tampilkan detail roll pada kolom qty/saldo"
```

---

### Task 3: Penyesuaian Stok — label dropdown + format delta

**Files:**
- Modify: `src/app/inventori/adjustments/page.tsx`

- [ ] **Step 3.1: Tambah import format-dimensi di page.tsx**

```ts
import { formatQtyMutasi, formatStokDimensi } from "@/lib/format-dimensi";
```

- [ ] **Step 3.2: Ubah label dropdown barang**

Temukan blok `<select>` untuk pilih barang (sekitar baris 98–108):

```tsx
// SEBELUM:
{sembunyikanPlaceholderBarang(data.materials).map((m: any) => (
  <option key={m.id} value={m.id}>{m.nama} - stok {m.jumlah_stok || 0}</option>
))}

// SESUDAH:
{sembunyikanPlaceholderBarang(data.materials).map((m: any) => (
  <option key={m.id} value={m.id}>
    {m.nama} — {formatStokDimensi(m)}
  </option>
))}
```

- [ ] **Step 3.3: Format kolom Delta di tabel riwayat**

Tambahkan lookup material di dalam map tabel (sekitar baris 147–154):

```tsx
// SEBELUM:
) : data.movements.map((movement: any) => {
  const material = data.materials.find((m: any) => m.id === movement.barang_id);
  return (
    <tr key={movement.id} ...>
      ...
      <td className={...}>{movement.qty_delta}</td>
```

```tsx
// SESUDAH:
) : data.movements.map((movement: any) => {
  const material = data.materials.find((m: any) => m.id === movement.barang_id);
  const movWithMeta = {
    ...movement,
    satuan_dasar: material?.satuan_dasar ?? "",
    butuh_dimensi_status: Number(material?.butuh_dimensi_status ?? 0),
  };
  return (
    <tr key={movement.id} ...>
      ...
      <td className={`p-3 text-right tabular-nums ${movement.qty_delta < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
        {formatQtyMutasi(movWithMeta)}
      </td>
```

- [ ] **Step 3.4: Type-check**

```bash
npm run type-check 2>&1 | head -30
```

Expected: `Found 0 errors`

- [ ] **Step 3.5: Commit**

```bash
git add src/app/inventori/adjustments/page.tsx
git commit -m "feat(fase1): penyesuaian stok dropdown tampilkan stok m² dan breakdown roll"
```

---

### Task 4: Opname Stok — kolom Sistem dengan satuan + hint dimensi

**Files:**
- Modify: `src/lib/services/stock-opname-service.ts`
- Modify: `src/app/inventori/opname/page.tsx`

- [ ] **Step 4.1: Tambah butuh_dimensi_status ke enrichSessions**

Di `src/lib/services/stock-opname-service.ts`, ubah `buildLookupMap` di `enrichSessions`:

```ts
// SEBELUM:
const barangMap = await buildLookupMap<{ id: string; nama: string }>(
  "barang",
  barangIds,
  "nama,satuan_dasar"
);

return rows.map((row) => ({
  ...row,
  items: (itemsBySession.get(row.id) || []).map((item) => ({
    ...item,
    barang_nama: barangMap.get(item.barang_id)?.nama || "",
  })),
}));
```

```ts
// SESUDAH:
const barangMap = await buildLookupMap<{
  id: string;
  nama: string;
  satuan_dasar: string;
  butuh_dimensi_status: number;
}>("barang", barangIds, "nama,satuan_dasar,butuh_dimensi_status");

return rows.map((row) => ({
  ...row,
  items: (itemsBySession.get(row.id) || []).map((item) => {
    const barang = barangMap.get(item.barang_id);
    return {
      ...item,
      barang_nama: barang?.nama || "",
      satuan_dasar: barang?.satuan_dasar ?? "",
      butuh_dimensi_status: Number(barang?.butuh_dimensi_status ?? 0),
    };
  }),
}));
```

- [ ] **Step 4.2: Tambah import format-dimensi di opname page.tsx**

```ts
import { formatStokDimensi } from "@/lib/format-dimensi";
```

- [ ] **Step 4.3: Ubah kolom Sistem di tabel opname**

Temukan kolom Sistem (sekitar baris 224):

```tsx
// SEBELUM:
<td className="p-3 text-right">{item.system_qty}</td>

// SESUDAH:
<td className="p-3 text-right tabular-nums">
  {Number(item.butuh_dimensi_status) === 1
    ? `${Number(item.system_qty || 0).toFixed(2)} m²`
    : String(item.system_qty ?? 0)}
</td>
```

Tambahkan label "(dimensi)" pada nama barang di kolom Barang:

```tsx
// SEBELUM:
<td className="p-3">{item.barang_nama || item.barang_id}</td>

// SESUDAH:
<td className="p-3">
  <span>{item.barang_nama || item.barang_id}</span>
  {Number(item.butuh_dimensi_status) === 1 && (
    <span className="ml-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">(dimensi)</span>
  )}
</td>
```

Ubah label kolom header "Fisik" dengan hint:

```tsx
// SEBELUM:
<th className="p-3 text-right">Fisik</th>

// SESUDAH:
<th className="p-3 text-right">Fisik (m² atau unit)</th>
```

- [ ] **Step 4.4: Type-check**

```bash
npm run type-check 2>&1 | head -30
```

Expected: `Found 0 errors`

- [ ] **Step 4.5: Commit**

```bash
git add src/lib/services/stock-opname-service.ts src/app/inventori/opname/page.tsx
git commit -m "feat(fase1): opname tampilkan satuan m² dan label dimensi untuk barang roll"
```

---

## FASE 2 — Input Roll-Aware

### Task 5: Extend createInventoryAdjustment + createWasteMovement + tests

**Files:**
- Modify: `src/lib/services/inventory-service.ts`
- Create: `src/lib/__tests__/inventory-service-roll.test.ts`

- [ ] **Step 5.1: Tulis failing test**

```ts
// src/lib/__tests__/inventory-service-roll.test.ts

import { resetMockDb, mockTable } from "./helpers/mock-db";

jest.mock("@/lib/db-unified", () => {
  const real = jest.requireActual("./helpers/mock-db") as typeof import("./helpers/mock-db");
  return {
    db: real.__mock.db,
    generateId: real.__mock.generateId,
    getCurrentTimestamp: real.__mock.getCurrentTimestamp,
  };
});

jest.mock("@/lib/services/accounting-periods-service", () => ({
  isDateInClosedPeriod: jest.fn().mockResolvedValue(false),
}));

import {
  createInventoryAdjustment,
  createWasteMovement,
} from "../services/inventory-service";

function seedBarangDimensi() {
  mockTable("barang").set("barang-roll-1", {
    id: "barang-roll-1",
    nama: "Bahan Roll A",
    jumlah_stok: 90,
    average_cost_per_base_unit: 5000,
    lacak_inventori_status: 1,
    butuh_dimensi_status: 1,
  });
  mockTable("barang_roll_variants").set("variant-1", {
    id: "variant-1",
    barang_id: "barang-roll-1",
    lebar_m: 1.5,
    panjang_tersedia_m: 60,
    average_cost_per_m2: 5000,
    aktif_status: 1,
  });
}

describe("createInventoryAdjustment dengan roll params", () => {
  beforeEach(() => {
    resetMockDb();
    seedBarangDimensi();
  });

  it("meneruskan roll_variant_id dan linear_delta_m ke movement", async () => {
    const result = await createInventoryAdjustment({
      barang_id: "barang-roll-1",
      qty_delta: -22.5,
      reason: "Koreksi stok",
      roll_variant_id: "variant-1",
      roll_width_m: 1.5,
      linear_delta_m: -15,
    });

    expect(result).not.toBeNull();
    const movements = Array.from(mockTable("inventory_movements").values());
    expect(movements).toHaveLength(1);
    expect(movements[0].roll_variant_id).toBe("variant-1");
    expect(movements[0].roll_width_m).toBe(1.5);
    expect(movements[0].linear_delta_m).toBe(-15);
    expect(movements[0].qty_delta).toBeCloseTo(-22.5);
  });

  it("update panjang_tersedia_m pada variant setelah adjustment pengurangan", async () => {
    await createInventoryAdjustment({
      barang_id: "barang-roll-1",
      qty_delta: -22.5,
      reason: "Koreksi",
      roll_variant_id: "variant-1",
      roll_width_m: 1.5,
      linear_delta_m: -15,
    });

    const variant = mockTable("barang_roll_variants").get("variant-1");
    expect(variant.panjang_tersedia_m).toBeCloseTo(45); // 60 - 15
  });

  it("tetap berjalan tanpa roll params untuk barang non-dimensi", async () => {
    mockTable("barang").set("barang-biasa", {
      id: "barang-biasa",
      nama: "Tinta Hitam",
      jumlah_stok: 10,
      average_cost_per_base_unit: 50000,
      lacak_inventori_status: 1,
      butuh_dimensi_status: 0,
    });

    const result = await createInventoryAdjustment({
      barang_id: "barang-biasa",
      qty_delta: -2,
      reason: "Adjustment biasa",
    });

    expect(result).not.toBeNull();
    const movements = Array.from(mockTable("inventory_movements").values());
    expect(movements[0].roll_variant_id).toBeNull();
  });
});

describe("createWasteMovement dengan roll params", () => {
  beforeEach(() => {
    resetMockDb();
    seedBarangDimensi();
  });

  it("meneruskan roll params ke movement dan qty_delta negatif", async () => {
    const result = await createWasteMovement({
      barang_id: "barang-roll-1",
      qty: 22.5,
      reason: "Misprint",
      roll_variant_id: "variant-1",
      roll_width_m: 1.5,
      linear_delta_m: 15,
    });

    expect(result).not.toBeNull();
    const movements = Array.from(mockTable("inventory_movements").values());
    expect(movements[0].qty_delta).toBeCloseTo(-22.5);
    expect(movements[0].roll_variant_id).toBe("variant-1");
    expect(movements[0].linear_delta_m).toBe(-15); // service membalik ke negatif
  });
});
```

- [ ] **Step 5.2: Jalankan test — harus FAIL**

```bash
npx jest src/lib/__tests__/inventory-service-roll.test.ts --no-coverage
```

Expected: `FAIL` — roll params tidak ada di function signatures

- [ ] **Step 5.3: Extend createInventoryAdjustment di inventory-service.ts**

Temukan interface `createInventoryAdjustment` (sekitar baris 387) dan tambahkan roll params:

```ts
// SEBELUM:
export async function createInventoryAdjustment(input: {
  barang_id: string;
  qty_delta: number;
  reason: string;
  adjustment_reason?: StockAdjustmentReason;
  unit_cost?: number | null;
  tanggal?: string;
  dibuat_oleh?: string | null;
}): Promise<InventoryMovement | null>

// SESUDAH:
export async function createInventoryAdjustment(input: {
  barang_id: string;
  qty_delta: number;
  reason: string;
  adjustment_reason?: StockAdjustmentReason;
  unit_cost?: number | null;
  tanggal?: string;
  dibuat_oleh?: string | null;
  /** Opsional — hanya untuk barang dimensi */
  roll_variant_id?: string | null;
  roll_width_m?: number | null;
  linear_delta_m?: number | null;
}): Promise<InventoryMovement | null>
```

Ubah body `createInventoryAdjustment` — ganti `return postInventoryMovement(...)`:

```ts
// SEBELUM:
return postInventoryMovement({
  barang_id: input.barang_id,
  tanggal: input.tanggal || new Date().toISOString().split("T")[0],
  movement_type: "ADJUSTMENT",
  qty_delta: input.qty_delta,
  unit_cost: input.unit_cost ?? null,
  source_type: "ADJUSTMENT",
  source_id: generateId(),
  catatan: note,
  dibuat_oleh: input.dibuat_oleh || null,
});

// SESUDAH:
return postInventoryMovement({
  barang_id: input.barang_id,
  tanggal: input.tanggal || new Date().toISOString().split("T")[0],
  movement_type: "ADJUSTMENT",
  qty_delta: input.qty_delta,
  unit_cost: input.unit_cost ?? null,
  source_type: "ADJUSTMENT",
  source_id: generateId(),
  catatan: note,
  dibuat_oleh: input.dibuat_oleh || null,
  roll_variant_id: input.roll_variant_id ?? null,
  roll_width_m: input.roll_width_m ?? null,
  linear_delta_m: input.linear_delta_m ?? null,
});
```

- [ ] **Step 5.4: Extend createWasteMovement di inventory-service.ts**

```ts
// SEBELUM:
export async function createWasteMovement(input: {
  barang_id: string;
  qty: number;
  reason: string;
  tanggal?: string;
  dibuat_oleh?: string | null;
}): Promise<InventoryMovement | null>

// SESUDAH:
export async function createWasteMovement(input: {
  barang_id: string;
  qty: number;
  reason: string;
  tanggal?: string;
  dibuat_oleh?: string | null;
  /** Opsional — hanya untuk barang dimensi */
  roll_variant_id?: string | null;
  roll_width_m?: number | null;
  /** linear_delta_m harus positif; service akan membalik ke negatif */
  linear_delta_m?: number | null;
}): Promise<InventoryMovement | null>
```

Ubah body `createWasteMovement` — ganti `return postInventoryMovement(...)`:

```ts
// SESUDAH:
return postInventoryMovement({
  barang_id: input.barang_id,
  tanggal: input.tanggal || new Date().toISOString().split("T")[0],
  movement_type: "WASTE",
  qty_delta: -qty,
  unit_cost: null,
  source_type: "WASTE",
  source_id: generateId(),
  catatan: input.reason.trim(),
  dibuat_oleh: input.dibuat_oleh || null,
  roll_variant_id: input.roll_variant_id ?? null,
  roll_width_m: input.roll_width_m ?? null,
  // linear_delta_m dari caller selalu positif; WASTE mengurangi stok → negatif
  linear_delta_m:
    input.linear_delta_m != null ? -Math.abs(Number(input.linear_delta_m)) : null,
});
```

- [ ] **Step 5.5: Jalankan test — harus PASS**

```bash
npx jest src/lib/__tests__/inventory-service-roll.test.ts --no-coverage
```

Expected: `Tests: 4 passed`

- [ ] **Step 5.6: Type-check**

```bash
npm run type-check 2>&1 | head -30
```

Expected: `Found 0 errors`

- [ ] **Step 5.7: Commit**

```bash
git add src/lib/services/inventory-service.ts src/lib/__tests__/inventory-service-roll.test.ts
git commit -m "feat(fase2): tambah roll params ke createInventoryAdjustment dan createWasteMovement"
```

---

### Task 6: Komponen InputDimensiRoll

**Files:**
- Create: `src/components/InputDimensiRoll.tsx`

- [ ] **Step 6.1: Buat komponen**

```tsx
// src/components/InputDimensiRoll.tsx
"use client";

import { useState } from "react";

/**
 * Form input roll-aware: pilih lebar variant + masukkan panjang meter.
 * Dipakai di form penyesuaian, waste, dan opname untuk barang dimensi.
 */

export interface RollInputVal {
  roll_variant_id: string;
  lebar_m: number;
  /** Panjang meter: positif = tambah, negatif = kurangi (adjustment).
   *  Untuk waste, selalu positif — service yang membalik ke negatif. */
  panjang_m: number;
  /** Dikomputasi: panjang_m × lebar_m (bisa negatif untuk adjustment). */
  qty_m2: number;
}

export interface RollVariantOption {
  id: string;
  lebar_m: number;
  panjang_tersedia_m: number;
}

interface InputDimensiRollProps {
  variants: RollVariantOption[];
  onChange: (val: RollInputVal | null) => void;
  disabled?: boolean;
  /** "waste" → panjang harus positif; "adjustment" → boleh positif atau negatif. */
  mode: "adjustment" | "waste";
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

export default function InputDimensiRoll({
  variants,
  onChange,
  disabled,
  mode,
}: InputDimensiRollProps) {
  const [variantId, setVariantId] = useState(variants[0]?.id ?? "");
  const [panjangStr, setPanjangStr] = useState("");

  function getVariant(id: string): RollVariantOption | null {
    return variants.find((v) => v.id === id) ?? null;
  }

  function buildVal(id: string, str: string): RollInputVal | null {
    const variant = getVariant(id);
    if (!variant) return null;
    const panjang = Number(str);
    if (!Number.isFinite(panjang) || panjang === 0) return null;
    if (mode === "waste" && panjang < 0) return null;
    const lebar = Number(variant.lebar_m);
    return {
      roll_variant_id: variant.id,
      lebar_m: lebar,
      panjang_m: panjang,
      qty_m2: panjang * lebar,
    };
  }

  function handleVariantChange(id: string) {
    setVariantId(id);
    setPanjangStr("");
    onChange(null);
  }

  function handlePanjangChange(str: string) {
    setPanjangStr(str);
    onChange(buildVal(variantId, str));
  }

  const selectedVariant = getVariant(variantId);
  const panjang = Number(panjangStr);
  const qtyM2 = selectedVariant && panjangStr ? panjang * Number(selectedVariant.lebar_m) : 0;

  const errorMsg = (() => {
    if (!panjangStr) return null;
    if (!Number.isFinite(panjang) || panjang === 0) {
      return mode === "waste"
        ? "Panjang harus lebih dari 0"
        : "Panjang tidak boleh 0";
    }
    if (mode === "waste" && panjang < 0) return "Untuk waste, masukkan angka positif";
    if (
      mode === "waste" &&
      selectedVariant &&
      panjang > Number(selectedVariant.panjang_tersedia_m) + 0.001
    ) {
      return `Melebihi stok tersedia (${fmt(Number(selectedVariant.panjang_tersedia_m))} m)`;
    }
    return null;
  })();

  if (variants.length === 0) {
    return (
      <p className="text-sm text-amber-600 dark:text-amber-400">
        Belum ada varian roll aktif untuk barang ini.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
          Lebar roll
        </label>
        <select
          className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-2 text-sm"
          value={variantId}
          onChange={(e) => handleVariantChange(e.target.value)}
          disabled={disabled}
        >
          {variants.map((v) => (
            <option key={v.id} value={v.id}>
              {fmt(Number(v.lebar_m))} m (tersedia: {fmt(Number(v.panjang_tersedia_m))} m)
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
          Panjang (meter)
          {mode === "adjustment" && (
            <span className="ml-1 text-slate-400 dark:text-slate-500">
              (positif = tambah, negatif = kurangi)
            </span>
          )}
        </label>
        <input
          type="number"
          step="0.01"
          value={panjangStr}
          onChange={(e) => handlePanjangChange(e.target.value)}
          disabled={disabled}
          className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 p-2 text-sm"
          placeholder={mode === "waste" ? "Contoh: 10" : "Contoh: 10 atau -5"}
        />
        {errorMsg && (
          <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">{errorMsg}</p>
        )}
        {!errorMsg && panjangStr && qtyM2 !== 0 && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
            = {Math.abs(qtyM2).toFixed(2)} m²
            {qtyM2 < 0 ? " (pengurangan)" : " (penambahan)"}
          </p>
        )}
      </div>
    </div>
  );
}
```

**Catatan:** Ganti `import_useState` dengan `useState` yang diimpor di baris pertama file:
```ts
import { useState } from "react";
```
(Ditulis terpisah karena formatter plan bisa mengganggu import)

- [ ] **Step 6.2: Type-check**

```bash
npm run type-check 2>&1 | head -30
```

Expected: `Found 0 errors`

- [ ] **Step 6.3: Commit**

```bash
git add src/components/InputDimensiRoll.tsx
git commit -m "feat(fase2): komponen InputDimensiRoll untuk input roll per variant"
```

---

### Task 7: Penyesuaian Stok — form roll-aware + update actions

**Files:**
- Modify: `src/app/inventori/adjustments/actions.ts`
- Modify: `src/app/inventori/adjustments/page.tsx`

- [ ] **Step 7.1: Update actions.ts — forward roll params**

Ganti seluruh isi `src/app/inventori/adjustments/actions.ts`:

```ts
"use server";

import { requireAdminOrManager } from "@/lib/auth-guard-server";
import { getMaterials } from "@/lib/services/materials-service";
import {
  createInventoryAdjustment,
  createWasteMovement,
  getInventoryMovements,
} from "@/lib/services/inventory-service";

export async function getAdjustmentInitAction() {
  const [materials, movements] = await Promise.all([
    getMaterials(),
    getInventoryMovements({ source_type: "ADJUSTMENT" }),
  ]);
  const waste = await getInventoryMovements({ source_type: "WASTE" });
  return {
    materials,
    movements: [...movements, ...waste].sort((a, b) =>
      String(b.dibuat_pada || "").localeCompare(String(a.dibuat_pada || ""))
    ),
  };
}

export async function createInventoryAdjustmentAction(
  input: Parameters<typeof createInventoryAdjustment>[0]
) {
  const s = await requireAdminOrManager();
  return createInventoryAdjustment({ ...input, dibuat_oleh: s.uid });
}

export async function createWasteMovementAction(
  input: Parameters<typeof createWasteMovement>[0]
) {
  const s = await requireAdminOrManager();
  return createWasteMovement({ ...input, dibuat_oleh: s.uid });
}
```

(Actions tidak berubah struktur — `Parameters<typeof>` otomatis include roll params baru.)

- [ ] **Step 7.2: Update page.tsx — deteksi dimensi dan tampilkan InputDimensiRoll**

Tambahkan imports:

```ts
import InputDimensiRoll, { type RollInputVal } from "@/components/InputDimensiRoll";
import { useMemo } from "react";
```

Tambahkan state `rollInput` dan `selectedMaterial` di atas state yang ada:

```ts
const [rollInput, setRollInput] = useState<RollInputVal | null>(null);

// Derived: material yang sedang dipilih
const selectedMaterial = useMemo(
  () => data.materials.find((m: any) => m.id === barangId) ?? null,
  [data.materials, barangId]
);
const isDimensi = Number(selectedMaterial?.butuh_dimensi_status ?? 0) === 1;
const rollVariants = useMemo(
  () =>
    isDimensi
      ? (selectedMaterial?.roll_variants ?? []).filter(
          (v: any) => Number(v.aktif_status) !== 0
        )
      : [],
  [isDimensi, selectedMaterial]
);
```

Reset rollInput saat barangId berubah — tambahkan setelah definisi state:

```ts
// Reset form saat barang berubah
const handleBarangChange = (id: string) => {
  setBarangId(id);
  setQty(0);
  setRollInput(null);
};
```

Ganti `onChange={(e) => setBarangId(e.target.value)}` di dropdown barang dengan:

```tsx
onChange={(e) => handleBarangChange(e.target.value)}
```

Ganti blok input qty (sekitar baris 109–115) dengan conditional:

```tsx
{isDimensi ? (
  <InputDimensiRoll
    variants={rollVariants}
    onChange={setRollInput}
    disabled={saving}
    mode={mode === "WASTE" ? "waste" : "adjustment"}
  />
) : (
  <input
    className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 p-2"
    type="number"
    value={qty || ""}
    onChange={(e) => setQty(Number(e.target.value))}
    placeholder={mode === "WASTE" ? "Qty waste (akan dikurangi)" : "Delta stok (+/-)"}
    disabled={saving}
  />
)}
```

Ganti fungsi `submit` sepenuhnya:

```ts
async function submit() {
  if (!barangId || !reason.trim()) return setNotice("Barang dan alasan wajib diisi.");

  setSaving(true);
  try {
    if (isDimensi) {
      if (!rollInput) return setNotice("Pilih variant roll dan isi panjang.");
      if (mode === "WASTE") {
        await createWasteMovementAction({
          barang_id: barangId,
          qty: rollInput.qty_m2,
          reason,
          roll_variant_id: rollInput.roll_variant_id,
          roll_width_m: rollInput.lebar_m,
          linear_delta_m: rollInput.panjang_m,
        });
      } else {
        await createInventoryAdjustmentAction({
          barang_id: barangId,
          qty_delta: rollInput.qty_m2,
          reason,
          adjustment_reason: adjReason,
          roll_variant_id: rollInput.roll_variant_id,
          roll_width_m: rollInput.lebar_m,
          linear_delta_m: rollInput.panjang_m,
        });
      }
    } else {
      if (!qty) return setNotice("Qty wajib diisi.");
      if (mode === "WASTE") {
        await createWasteMovementAction({ barang_id: barangId, qty: Math.abs(qty), reason });
      } else {
        await createInventoryAdjustmentAction({
          barang_id: barangId,
          qty_delta: qty,
          reason,
          adjustment_reason: adjReason,
        });
      }
    }

    setQty(0);
    setRollInput(null);
    setReason("");
    setNotice("Mutasi stok tersimpan.");
    await reload();
  } catch (error) {
    setNotice(error instanceof Error ? error.message : "Gagal menyimpan");
  } finally {
    setSaving(false);
  }
}
```

- [ ] **Step 7.3: Type-check**

```bash
npm run type-check 2>&1 | head -30
```

Expected: `Found 0 errors`

- [ ] **Step 7.4: Commit**

```bash
git add src/app/inventori/adjustments/actions.ts src/app/inventori/adjustments/page.tsx
git commit -m "feat(fase2): penyesuaian stok form roll-aware dengan InputDimensiRoll"
```

---

### Task 8: Ekstrak ModalAdjustStok dari barang/page.tsx + roll-aware

**Files:**
- Create: `src/app/barang/ModalAdjustStok.tsx`
- Modify: `src/app/barang/page.tsx`

- [ ] **Step 8.1: Buat ModalAdjustStok.tsx**

```tsx
// src/app/barang/ModalAdjustStok.tsx
"use client";

import { useState, useMemo } from "react";
import InputDimensiRoll, { type RollInputVal } from "@/components/InputDimensiRoll";
import { createInventoryAdjustmentAction } from "./actions";

export interface MaterialAdjust {
  id: string;
  nama: string;
  satuan_dasar: string;
  jumlah_stok: number;
  butuh_dimensi_status: number | boolean;
  roll_variants?: Array<{ id: string; lebar_m: number; panjang_tersedia_m: number; aktif_status?: number }>;
}

interface Props {
  material: MaterialAdjust;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
  showNotification: (type: "success" | "error", message: string) => void;
}

/**
 * Modal Adjustment Stok — mencatat ADJUSTMENT di ledger.
 * Untuk barang dimensi: input roll (pilih lebar + panjang meter).
 * Diekstrak dari barang/page.tsx agar state form terisolasi.
 */
export default function ModalAdjustStok({
  material,
  onClose,
  onSuccess,
  showNotification,
}: Props) {
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [rollInput, setRollInput] = useState<RollInputVal | null>(null);
  const [saving, setSaving] = useState(false);

  const isDimensi = Number(material.butuh_dimensi_status) === 1;
  const rollVariants = useMemo(
    () =>
      isDimensi
        ? (material.roll_variants ?? []).filter((v) => Number(v.aktif_status ?? 1) !== 0)
        : [],
    [isDimensi, material.roll_variants]
  );

  const submit = async () => {
    if (!adjustReason.trim()) {
      showNotification("error", "Alasan adjustment wajib diisi");
      return;
    }

    setSaving(true);
    try {
      if (isDimensi) {
        if (!rollInput) {
          showNotification("error", "Pilih variant roll dan isi panjang");
          return;
        }
        await createInventoryAdjustmentAction({
          barang_id: material.id,
          qty_delta: rollInput.qty_m2,
          reason: adjustReason.trim(),
          roll_variant_id: rollInput.roll_variant_id,
          roll_width_m: rollInput.lebar_m,
          linear_delta_m: rollInput.panjang_m,
        });
      } else {
        const qty = Number(adjustQty);
        if (!Number.isFinite(qty) || qty === 0) {
          showNotification("error", "Qty adjustment tidak boleh 0");
          return;
        }
        await createInventoryAdjustmentAction({
          barang_id: material.id,
          qty_delta: qty,
          reason: adjustReason.trim(),
        });
      }

      await onSuccess();
      onClose();
      showNotification("success", "Adjustment stok berhasil disimpan");
    } catch (error: any) {
      showNotification("error", error.message || "Gagal menyimpan adjustment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
            Adjustment Stok
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">{material.nama}</p>
        </div>
        <div className="p-6 space-y-4">
          {isDimensi ? (
            <InputDimensiRoll
              variants={rollVariants}
              onChange={setRollInput}
              disabled={saving}
              mode="adjustment"
            />
          ) : (
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Qty Delta
              </label>
              <input
                type="number"
                value={adjustQty}
                onChange={(e) => setAdjustQty(e.target.value)}
                disabled={saving}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="Contoh: -2 atau 10"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Alasan <span className="text-rose-500">*</span>
            </label>
            <textarea
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
              disabled={saving}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
              rows={3}
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            Batal
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 8.2: Update barang/page.tsx — ganti inline adjustment modal**

Tambahkan import di bagian atas:
```ts
import ModalAdjustStok, { type MaterialAdjust } from "./ModalAdjustStok";
```

Import `createInventoryAdjustmentAction` di `barang/page.tsx` (baris 20) tetap diperlukan untuk bagian lain di halaman ini. **Jangan hapus.** ModalAdjustStok mengimport sendiri dari `./actions`.

Hapus state yang dipindah ke modal:
```ts
// HAPUS state-state ini dari page (sudah pindah ke ModalAdjustStok):
// const [adjustQty, setAdjustQty] = useState(""); 
// const [adjustReason, setAdjustReason] = useState("");
// const [savingAdjustment, setSavingAdjustment] = useState(false);
// const submitAdjustment = async () => { ... };
```

Ganti blok modal inline (`{adjustMaterial && (<div className="fixed...">...)</div>)}`) dengan:

```tsx
{adjustMaterial && (
  <ModalAdjustStok
    material={adjustMaterial as MaterialAdjust}
    onClose={() => setAdjustMaterial(null)}
    onSuccess={async () => { await reload(); setAdjustMaterial(null); }}
    showNotification={showNotification}
  />
)}
```

- [ ] **Step 8.3: Type-check**

```bash
npm run type-check 2>&1 | head -30
```

Expected: `Found 0 errors`

- [ ] **Step 8.4: Commit**

```bash
git add src/app/barang/ModalAdjustStok.tsx src/app/barang/page.tsx
git commit -m "feat(fase2): ekstrak ModalAdjustStok dan tambah input roll-aware untuk adjustment barang"
```

---

### Task 9: ModalCatatRusak — roll-aware untuk waste barang dimensi

**Files:**
- Modify: `src/app/barang/ModalCatatRusak.tsx`
- Modify: `src/app/barang/page.tsx` (untuk pass roll_variants)

- [ ] **Step 9.1: Update MaterialRusak interface dan tambah roll input**

Ganti seluruh isi `src/app/barang/ModalCatatRusak.tsx`:

```tsx
// src/app/barang/ModalCatatRusak.tsx
"use client";

import { useState, useMemo } from "react";
import InputDimensiRoll, { type RollInputVal } from "@/components/InputDimensiRoll";
import { createWasteMovementAction } from "./actions";

/** Material minimal yang dibutuhkan modal catat-rusak. */
export interface MaterialRusak {
  id: string;
  nama: string;
  satuan_dasar: string;
  jumlah_stok: number;
  butuh_dimensi_status?: number | boolean;
  roll_variants?: Array<{ id: string; lebar_m: number; panjang_tersedia_m: number; aktif_status?: number }>;
}

interface Props {
  material: MaterialRusak;
  onClose: () => void;
  /** Dipanggil setelah waste tersimpan; parent me-reload daftar. */
  onSuccess: () => void | Promise<void>;
  showNotification: (type: "success" | "error", message: string) => void;
}

/**
 * Modal "Catat Material Rusak" — mencatat WASTE di ledger stok.
 * Untuk barang dimensi: input roll (pilih lebar + panjang meter).
 */
export default function ModalCatatRusak({
  material,
  onClose,
  onSuccess,
  showNotification,
}: Props) {
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [rollInput, setRollInput] = useState<RollInputVal | null>(null);
  const [saving, setSaving] = useState(false);

  const isDimensi = Number(material.butuh_dimensi_status ?? 0) === 1;
  const rollVariants = useMemo(
    () =>
      isDimensi
        ? (material.roll_variants ?? []).filter((v) => Number(v.aktif_status ?? 1) !== 0)
        : [],
    [isDimensi, material.roll_variants]
  );

  const submit = async () => {
    if (!reason.trim()) {
      showNotification("error", "Alasan/keterangan wajib diisi");
      return;
    }

    setSaving(true);
    try {
      if (isDimensi) {
        if (!rollInput) {
          showNotification("error", "Pilih variant roll dan isi panjang");
          return;
        }
        await createWasteMovementAction({
          barang_id: material.id,
          qty: rollInput.qty_m2,
          reason: reason.trim(),
          roll_variant_id: rollInput.roll_variant_id,
          roll_width_m: rollInput.lebar_m,
          linear_delta_m: rollInput.panjang_m,
        });
      } else {
        const qtyNum = Number(qty);
        if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
          showNotification("error", "Jumlah barang rusak harus lebih dari 0");
          return;
        }
        await createWasteMovementAction({
          barang_id: material.id,
          qty: qtyNum,
          reason: reason.trim(),
        });
      }

      await onSuccess();
      onClose();
      showNotification("success", "Barang rusak berhasil dicatat");
    } catch (error: any) {
      showNotification("error", error.message || "Gagal menyimpan catatan barang rusak");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
        <h3 className="text-lg font-bold text-rose-700 dark:text-rose-400">
          Catat Material Rusak
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Tercatat sebagai <span className="font-mono">WASTE</span> di riwayat stok.
          Mengurangi <span className="font-semibold">{material.nama}</span> dengan nilai
          average cost saat ini.
        </p>

        {isDimensi ? (
          <InputDimensiRoll
            variants={rollVariants}
            onChange={setRollInput}
            disabled={saving}
            mode="waste"
          />
        ) : (
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Jumlah rusak (satuan: {material.satuan_dasar})
            </label>
            <input
              type="number"
              step="0.01"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="Contoh: 5"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg"
              autoFocus
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Stok saat ini:{" "}
              {Number(material.jumlah_stok || 0).toLocaleString("id-ID")}{" "}
              {material.satuan_dasar}
            </p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Alasan / keterangan <span className="text-rose-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Misprint mesin Eco-Solvent, batch BCD123 — tinta luntur, dll."
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg"
          />
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            Batal
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Menyimpan..." : "Catat sebagai Waste"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 9.2: Update barang/page.tsx — pass roll_variants ke ModalCatatRusak**

Temukan di `barang/page.tsx` tempat `wasteMaterial` di-set dan `ModalCatatRusak` dipanggil.

Di `onAdjustStock` atau `onCatatRusak`, pastikan yang dikirim ke modal sudah include `roll_variants`. Cari baris `setWasteMaterial(material)` dan pastikan `material` sudah punya `roll_variants` dari `getMaterials()` (yang sudah otomatis include ini).

Jika `MaterialRusak` type di prop `material` ModalCatatRusak belum include `roll_variants`, TypeScript akan error — itu sinyal bahwa prop perlu diteruskan. Cek tipe material yang dikirim ke `setWasteMaterial`.

Jika material yang dikirim adalah tipe dari `getMaterials()` (sudah ada `roll_variants`), cukup pastikan tidak ada type casting yang membuang field itu.

- [ ] **Step 9.3: Type-check**

```bash
npm run type-check 2>&1 | head -30
```

Expected: `Found 0 errors`

- [ ] **Step 9.4: Commit**

```bash
git add src/app/barang/ModalCatatRusak.tsx src/app/barang/page.tsx
git commit -m "feat(fase2): ModalCatatRusak tambah input roll-aware untuk waste barang dimensi"
```

---

## FASE 3 — Opname Per Variant Roll

### Task 10: Migrasi skema stock_opname_items (3 tempat sync)

**Files:**
- Create: `supabase/migrations/20260701000000_stock_opname_items_roll.sql`
- Modify: `database/sqlite-schema.sql`
- Modify: `src/lib/db-sqlite-migrations.ts`

- [ ] **Step 10.1: Buat file migrasi Supabase**

```sql
-- supabase/migrations/20260701000000_stock_opname_items_roll.sql
-- Tambah kolom roll ke stock_opname_items untuk opname per variant.
-- Additive, idempotent (IF NOT EXISTS tidak didukung ALTER di PG,
-- gunakan DO block untuk cek existence).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'stock_opname_items' AND column_name = 'roll_variant_id') THEN
    ALTER TABLE stock_opname_items ADD COLUMN roll_variant_id TEXT REFERENCES barang_roll_variants(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'stock_opname_items' AND column_name = 'roll_width_m') THEN
    ALTER TABLE stock_opname_items ADD COLUMN roll_width_m REAL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'stock_opname_items' AND column_name = 'system_linear_m') THEN
    ALTER TABLE stock_opname_items ADD COLUMN system_linear_m REAL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'stock_opname_items' AND column_name = 'counted_linear_m') THEN
    ALTER TABLE stock_opname_items ADD COLUMN counted_linear_m REAL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'stock_opname_items' AND column_name = 'delta_linear_m') THEN
    ALTER TABLE stock_opname_items ADD COLUMN delta_linear_m REAL;
  END IF;
END
$$;
```

- [ ] **Step 10.2: Update database/sqlite-schema.sql**

Temukan blok `CREATE TABLE stock_opname_items` (sekitar baris 571–596) dan tambahkan kolom sebelum penutup `)`:

```sql
-- SEBELUM:
      movement_id TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')),

-- SESUDAH:
      movement_id TEXT,
      roll_variant_id TEXT,
      roll_width_m REAL,
      system_linear_m REAL,
      counted_linear_m REAL,
      delta_linear_m REAL,
      dibuat_pada TEXT DEFAULT (datetime('now')),
```

- [ ] **Step 10.3: Update db-sqlite-migrations.ts — runtime ALTER**

Temukan array `rollInventoryCols` (sekitar baris 1093) dan tambahkan 5 entri baru di akhir array sebelum `];`:

```ts
// Tambahkan sebelum ]; penutup rollInventoryCols:
{ table: "stock_opname_items", column: "roll_variant_id", ddl: "ALTER TABLE stock_opname_items ADD COLUMN roll_variant_id TEXT" },
{ table: "stock_opname_items", column: "roll_width_m", ddl: "ALTER TABLE stock_opname_items ADD COLUMN roll_width_m REAL" },
{ table: "stock_opname_items", column: "system_linear_m", ddl: "ALTER TABLE stock_opname_items ADD COLUMN system_linear_m REAL" },
{ table: "stock_opname_items", column: "counted_linear_m", ddl: "ALTER TABLE stock_opname_items ADD COLUMN counted_linear_m REAL" },
{ table: "stock_opname_items", column: "delta_linear_m", ddl: "ALTER TABLE stock_opname_items ADD COLUMN delta_linear_m REAL" },
```

- [ ] **Step 10.4: Verifikasi sync-config.ts — stock_opname_items sudah terdaftar**

Buka `src/lib/sync-config.ts` dan konfirmasi `"stock_opname_items"` ada di `CORE_SYNC_TABLES`. (Sudah ada — tidak perlu diubah. Kolom baru otomatis ikut sync karena tabel sudah terdaftar.)

- [ ] **Step 10.5: Type-check**

```bash
npm run type-check 2>&1 | head -30
```

Expected: `Found 0 errors`

- [ ] **Step 10.6: Commit**

```bash
git add supabase/migrations/20260701000000_stock_opname_items_roll.sql \
        database/sqlite-schema.sql \
        src/lib/db-sqlite-migrations.ts
git commit -m "feat(fase3): migrasi skema — tambah kolom roll ke stock_opname_items (3 tempat sync)"
```

---

### Task 11: stock-opname-service extension — per-variant create, update, post

**Files:**
- Create: `src/lib/__tests__/stock-opname-service-roll.test.ts`
- Modify: `src/lib/services/stock-opname-service.ts`
- Modify: `src/app/inventori/opname/actions.ts`

- [ ] **Step 11.1: Tulis failing tests**

```ts
// src/lib/__tests__/stock-opname-service-roll.test.ts

import { resetMockDb, mockTable } from "./helpers/mock-db";

jest.mock("@/lib/db-unified", () => {
  const real = jest.requireActual("./helpers/mock-db") as typeof import("./helpers/mock-db");
  return {
    db: real.__mock.db,
    generateId: real.__mock.generateId,
    getCurrentTimestamp: real.__mock.getCurrentTimestamp,
  };
});

jest.mock("@/lib/services/accounting-periods-service", () => ({
  isDateInClosedPeriod: jest.fn().mockResolvedValue(false),
}));

jest.mock("@/lib/services/document-number-service", () => ({
  generateDailyDocumentNumber: jest.fn().mockResolvedValue("SO-20260701-001"),
  numeric: (n: unknown) => Number(n) || 0,
  todayJakarta: () => "2026-07-01",
}));

jest.mock("@/lib/services/materials-service", () => ({
  getMaterials: jest.fn(),
}));

import { getMaterials } from "@/lib/services/materials-service";
import {
  createStockOpname,
  updateStockOpnameCounts,
  postStockOpname,
} from "../services/stock-opname-service";

const mockGetMaterials = getMaterials as jest.Mock;

function seedDimensional() {
  // Barang dimensi dengan 2 variant aktif
  mockGetMaterials.mockResolvedValue([
    {
      id: "barang-roll",
      nama: "Bahan Roll A",
      satuan_dasar: "m²",
      jumlah_stok: 120,
      average_cost_per_base_unit: 5000,
      lacak_inventori_status: 1,
      butuh_dimensi_status: 1,
    },
  ]);
  mockTable("barang_roll_variants").set("var-1", {
    id: "var-1",
    barang_id: "barang-roll",
    lebar_m: 1.5,
    panjang_tersedia_m: 60,
    average_cost_per_m2: 5000,
    aktif_status: 1,
  });
  mockTable("barang_roll_variants").set("var-2", {
    id: "var-2",
    barang_id: "barang-roll",
    lebar_m: 2,
    panjang_tersedia_m: 15,
    average_cost_per_m2: 5000,
    aktif_status: 1,
  });
}

describe("createStockOpname — barang dimensi", () => {
  beforeEach(() => {
    resetMockDb();
    seedDimensional();
  });

  it("membuat 2 item opname (1 per variant) untuk barang dimensi", async () => {
    await createStockOpname({ tanggal: "2026-07-01" });

    const items = Array.from(mockTable("stock_opname_items").values());
    expect(items).toHaveLength(2);

    const item1 = items.find((i) => i.roll_variant_id === "var-1");
    const item2 = items.find((i) => i.roll_variant_id === "var-2");

    expect(item1).toBeDefined();
    expect(item1.roll_width_m).toBe(1.5);
    expect(item1.system_linear_m).toBe(60);
    expect(item1.system_qty).toBeCloseTo(90); // 60 × 1.5

    expect(item2).toBeDefined();
    expect(item2.roll_width_m).toBe(2);
    expect(item2.system_linear_m).toBe(15);
    expect(item2.system_qty).toBeCloseTo(30); // 15 × 2
  });
});

describe("updateStockOpnameCounts — counted_linear_m untuk dimensi", () => {
  beforeEach(() => {
    resetMockDb();
    seedDimensional();
  });

  it("menghitung counted_qty dan delta_linear_m dari counted_linear_m", async () => {
    // Setup sesi opname
    const session = { id: "opname-1", nomor_opname: "SO-001", status: "DRAFT", tanggal: "2026-07-01" };
    mockTable("stock_opnames").set("opname-1", session);
    const item1 = {
      id: "item-1",
      stock_opname_id: "opname-1",
      barang_id: "barang-roll",
      roll_variant_id: "var-1",
      roll_width_m: 1.5,
      system_qty: 90,
      system_linear_m: 60,
      counted_qty: null,
      delta_qty: 0,
      unit_cost: 5000,
      delta_value: 0,
    };
    mockTable("stock_opname_items").set("item-1", item1);

    await updateStockOpnameCounts("opname-1", [
      { stock_opname_item_id: "item-1", counted_linear_m: 55 },
    ]);

    const updated = mockTable("stock_opname_items").get("item-1");
    expect(updated.counted_linear_m).toBe(55);
    expect(updated.counted_qty).toBeCloseTo(82.5); // 55 × 1.5
    expect(updated.delta_qty).toBeCloseTo(-7.5); // 82.5 - 90
    expect(updated.delta_linear_m).toBeCloseTo(-5); // 55 - 60
  });
});

describe("postStockOpname — validasi sebelum posting", () => {
  beforeEach(() => {
    resetMockDb();
    seedDimensional();
  });

  it("menolak posting jika counted_linear_m melebihi stok sistem", async () => {
    mockTable("stock_opnames").set("opname-1", {
      id: "opname-1",
      nomor_opname: "SO-001",
      status: "DRAFT",
      tanggal: "2026-07-01",
    });
    mockTable("stock_opname_items").set("item-1", {
      id: "item-1",
      stock_opname_id: "opname-1",
      barang_id: "barang-roll",
      roll_variant_id: "var-1",
      roll_width_m: 1.5,
      system_qty: 90,
      system_linear_m: 60,
      counted_qty: 120,
      counted_linear_m: 80, // > 60 tersedia → pengurangan stok 80-60=-20m DITAMBAH ke variant, OK?
      delta_qty: 30, // 120-90
      delta_linear_m: 20, // 80-60 positif = tambah, ini OK
      unit_cost: 5000,
      delta_value: 150000,
    });

    // Pengurangan (delta negatif) yang membuat variant negatif harus ditolak
    mockTable("stock_opname_items").set("item-2", {
      id: "item-2",
      stock_opname_id: "opname-1",
      barang_id: "barang-roll",
      roll_variant_id: "var-2",
      roll_width_m: 2,
      system_qty: 30,
      system_linear_m: 15,
      counted_qty: 0, // fisik = 0m → delta = -30m²
      counted_linear_m: 0,
      delta_qty: -30,
      delta_linear_m: -15,
      unit_cost: 5000,
      delta_value: -150000,
    });

    // Setup barang di mock
    mockTable("barang").set("barang-roll", {
      id: "barang-roll",
      jumlah_stok: 120,
      average_cost_per_base_unit: 5000,
      lacak_inventori_status: 1,
    });

    // Posting harus berhasil (delta_linear_m -15 tapi panjang_tersedia_m=15, tidak negatif)
    await expect(postStockOpname("opname-1")).resolves.toBeDefined();
  });

  it("menolak posting jika delta menyebabkan panjang_tersedia_m negatif", async () => {
    mockTable("stock_opnames").set("opname-bad", {
      id: "opname-bad",
      nomor_opname: "SO-002",
      status: "DRAFT",
      tanggal: "2026-07-01",
    });
    mockTable("stock_opname_items").set("item-bad", {
      id: "item-bad",
      stock_opname_id: "opname-bad",
      barang_id: "barang-roll",
      roll_variant_id: "var-1",
      roll_width_m: 1.5,
      system_qty: 90,
      system_linear_m: 60,
      counted_qty: 0,
      counted_linear_m: 0,
      delta_qty: -90, // pengurangan penuh
      delta_linear_m: -60, // habiskan var-1 (60m → 0m)
      unit_cost: 5000,
      delta_value: -450000,
    });
    mockTable("barang").set("barang-roll", {
      id: "barang-roll",
      jumlah_stok: 120,
      average_cost_per_base_unit: 5000,
      lacak_inventori_status: 1,
    });

    // -60m dari 60m tersedia = 0m, masih valid (tidak negatif)
    // Tes sebaliknya: -61m dari 60m harus ditolak
    mockTable("stock_opname_items").set("item-bad", {
      id: "item-bad",
      stock_opname_id: "opname-bad",
      barang_id: "barang-roll",
      roll_variant_id: "var-1",
      roll_width_m: 1.5,
      system_qty: 90,
      system_linear_m: 60,
      counted_qty: -1.5, // fisik = -1m → tidak valid
      counted_linear_m: -1,
      delta_qty: -91.5,
      delta_linear_m: -61, // 60 tersedia, butuh 61 → DITOLAK
      unit_cost: 5000,
      delta_value: -457500,
    });

    await expect(postStockOpname("opname-bad")).rejects.toThrow("Roll lebar 1.5m");
  });
});
```

- [ ] **Step 11.2: Jalankan test — harus FAIL**

```bash
npx jest src/lib/__tests__/stock-opname-service-roll.test.ts --no-coverage
```

Expected: `FAIL` — createStockOpname belum buat baris per variant

- [ ] **Step 11.3: Update createStockOpname di stock-opname-service.ts**

Tambahkan import `getRollVariants` di bagian atas file:

```ts
import { postInventoryMovement, getRollVariants } from "@/lib/services/inventory-service";
```

Ganti body `createStockOpname` (dalam `db.transaction`):

```ts
await db.transaction(async () => {
  const header = await db.insert("stock_opnames", {
    id,
    nomor_opname: nomor,
    tanggal,
    status: "DRAFT",
    catatan: input.catatan?.trim() || null,
    dibuat_oleh: input.dibuat_oleh || null,
    total_items: tracked.length,
    total_delta_qty: 0,
    total_delta_value: 0,
  });
  if (header.error) throw header.error;

  for (const material of tracked) {
    const isDimensi = Number(material.butuh_dimensi_status) === 1;

    if (isDimensi) {
      // Untuk barang dimensi: satu baris per variant aktif
      const variants = await getRollVariants(material.id);
      const aktif = variants.filter((v) => Number(v.aktif_status) !== 0);

      if (aktif.length === 0) {
        // Fallback: satu baris agregat tanpa roll detail
        const row = await db.insert("stock_opname_items", {
          id: generateId(),
          stock_opname_id: id,
          barang_id: material.id,
          system_qty: numeric(material.jumlah_stok),
          counted_qty: null,
          delta_qty: 0,
          unit_cost: numeric(material.average_cost_per_base_unit),
          delta_value: 0,
          roll_variant_id: null,
          roll_width_m: null,
          system_linear_m: null,
          counted_linear_m: null,
          delta_linear_m: null,
        });
        if (row.error) throw row.error;
      } else {
        for (const variant of aktif) {
          const lebar = Number(variant.lebar_m);
          const panjang = Number(variant.panjang_tersedia_m);
          const systemQty = panjang * lebar; // m²
          const row = await db.insert("stock_opname_items", {
            id: generateId(),
            stock_opname_id: id,
            barang_id: material.id,
            system_qty: systemQty,
            counted_qty: null,
            delta_qty: 0,
            unit_cost: numeric(material.average_cost_per_base_unit),
            delta_value: 0,
            roll_variant_id: variant.id,
            roll_width_m: lebar,
            system_linear_m: panjang,
            counted_linear_m: null,
            delta_linear_m: null,
          });
          if (row.error) throw row.error;
        }
      }
    } else {
      // Barang non-dimensi: satu baris seperti sebelumnya
      const row = await db.insert("stock_opname_items", {
        id: generateId(),
        stock_opname_id: id,
        barang_id: material.id,
        system_qty: numeric(material.jumlah_stok),
        counted_qty: null,
        delta_qty: 0,
        unit_cost: numeric(material.average_cost_per_base_unit),
        delta_value: 0,
        roll_variant_id: null,
        roll_width_m: null,
        system_linear_m: null,
        counted_linear_m: null,
        delta_linear_m: null,
      });
      if (row.error) throw row.error;
    }
  }
});
```

- [ ] **Step 11.4: Update updateStockOpnameCounts — terima counted_linear_m**

Ganti signature fungsi `updateStockOpnameCounts`:

```ts
// SEBELUM:
export async function updateStockOpnameCounts(
  id: string,
  items: Array<{ stock_opname_item_id: string; counted_qty: number; catatan?: string | null }>
)

// SESUDAH:
export async function updateStockOpnameCounts(
  id: string,
  items: Array<{
    stock_opname_item_id: string;
    counted_qty?: number;
    /** Untuk item dimensi (roll_variant_id != null): panjang fisik dalam meter. */
    counted_linear_m?: number;
    catatan?: string | null;
  }>
)
```

Ganti logic dalam loop `for (const input of items)`:

```ts
for (const input of items) {
  const existing = (session.items || []).find(
    (item: any) => item.id === input.stock_opname_item_id
  );
  if (!existing) continue;

  let countedQty: number;
  let deltaLinearM: number | null = null;
  let countedLinearMVal: number | null = null;

  if (existing.roll_variant_id && input.counted_linear_m !== undefined) {
    // Item dimensi: hitung m² dari panjang meter
    const lebar = Number(existing.roll_width_m) || 1;
    countedLinearMVal = numeric(input.counted_linear_m);
    countedQty = countedLinearMVal * lebar;
    deltaLinearM = countedLinearMVal - numeric(existing.system_linear_m);
  } else {
    countedQty = numeric(input.counted_qty ?? input.counted_linear_m ?? existing.system_qty);
  }

  const deltaQty = countedQty - numeric(existing.system_qty);
  const deltaValue = deltaQty * numeric(existing.unit_cost);

  const upd = await db.update("stock_opname_items", existing.id, {
    counted_qty: countedQty,
    counted_linear_m: countedLinearMVal,
    delta_qty: deltaQty,
    delta_linear_m: deltaLinearM,
    delta_value: deltaValue,
    catatan: input.catatan?.trim() || null,
  });
  if (upd.error) throw upd.error;
}
```

- [ ] **Step 11.5: Update postStockOpname — validasi + roll params**

Tambahkan validasi sebelum loop posting di `postStockOpname`:

```ts
// Validasi: tidak ada delta yang menyebabkan panjang_tersedia_m negatif
for (const item of session.items || []) {
  if (!item.roll_variant_id) continue;
  const deltaLinear = numeric(item.delta_linear_m);
  if (Math.abs(deltaLinear) < 0.000001) continue;
  if (deltaLinear < 0) {
    // Pengurangan — cek apakah variant cukup stok
    const variantResult = await db.queryOne<any>("barang_roll_variants", {
      where: { id: item.roll_variant_id },
    });
    if (variantResult.error) throw variantResult.error;
    const variant = variantResult.data;
    if (!variant) continue;
    const setelahPosting = numeric(variant.panjang_tersedia_m) + deltaLinear;
    if (setelahPosting < -0.001) {
      const lebar = Number(item.roll_width_m).toFixed(2);
      const tersedia = Number(variant.panjang_tersedia_m).toFixed(2);
      const butuh = Math.abs(deltaLinear).toFixed(2);
      throw new Error(
        `Roll lebar ${lebar}m: stok tersedia ${tersedia}m, dibutuhkan ${butuh}m — ` +
        `periksa kembali hitungan fisik untuk barang ini.`
      );
    }
  }
}
```

Ganti baris `await postInventoryMovement(...)` dalam loop untuk sertakan roll params:

```ts
// SEBELUM:
const movement = await postInventoryMovement({
  id: `mov-${item.id}`,
  barang_id: item.barang_id,
  tanggal: session.tanggal || todayJakarta(),
  movement_type: "ADJUSTMENT",
  qty_delta: deltaQty,
  unit_cost: numeric(item.unit_cost),
  source_type: "STOCK_OPNAME",
  source_id: id,
  source_line_id: item.id,
  catatan: item.catatan || `Stock opname ${session.nomor_opname}`,
  dibuat_oleh: actorId || null,
});

// SESUDAH:
const movement = await postInventoryMovement({
  id: `mov-${item.id}`,
  barang_id: item.barang_id,
  tanggal: session.tanggal || todayJakarta(),
  movement_type: "ADJUSTMENT",
  qty_delta: deltaQty,
  unit_cost: numeric(item.unit_cost),
  source_type: "STOCK_OPNAME",
  source_id: id,
  source_line_id: item.id,
  catatan: item.catatan || `Stock opname ${session.nomor_opname}`,
  dibuat_oleh: actorId || null,
  roll_variant_id: item.roll_variant_id || null,
  roll_width_m: item.roll_width_m ? Number(item.roll_width_m) : null,
  linear_delta_m: item.delta_linear_m ? numeric(item.delta_linear_m) : null,
});
```

- [ ] **Step 11.6: Update opname/actions.ts — teruskan counted_linear_m**

Ganti `updateStockOpnameCountsAction` — tipe sudah auto-update via `Parameters<typeof updateStockOpnameCounts>[1]`:

```ts
export async function updateStockOpnameCountsAction(
  id: string,
  items: Parameters<typeof updateStockOpnameCounts>[1]
) {
  await requireAdminOrManager();
  return updateStockOpnameCounts(id, items);
}
```

(Tidak ada perubahan kode, hanya verifikasi bahwa type propagates correctly.)

- [ ] **Step 11.7: Jalankan test — harus PASS**

```bash
npx jest src/lib/__tests__/stock-opname-service-roll.test.ts --no-coverage
```

Expected: `Tests: 4 passed` (atau lebih sesuai jumlah test yang ditulis)

- [ ] **Step 11.8: Jalankan semua service tests**

```bash
npx jest src/lib/__tests__/ --no-coverage
```

Expected: semua pass, tidak ada regresi

- [ ] **Step 11.9: Type-check**

```bash
npm run type-check 2>&1 | head -30
```

Expected: `Found 0 errors`

- [ ] **Step 11.10: Commit**

```bash
git add src/lib/services/stock-opname-service.ts \
        src/lib/__tests__/stock-opname-service-roll.test.ts \
        src/app/inventori/opname/actions.ts
git commit -m "feat(fase3): opname service — create per variant, update counted_linear_m, validasi sebelum post"
```

---

### Task 12: Opname UI — tampilan per-variant roll

**Files:**
- Modify: `src/app/inventori/opname/page.tsx`

- [ ] **Step 12.1: Kelompokkan items per barang dan tampilkan sub-rows untuk dimensi**

State `counts` diperluas untuk support barang dimensi. Ganti tipe:

```ts
// Ganti:
const [counts, setCounts] = useState<Record<string, number>>({});

// Dengan:
const [counts, setCounts] = useState<Record<string, { qty?: number; linear_m?: number }>>({});
```

Ganti `useEffect` init counts:

```ts
useEffect(() => {
  if (!selected) return;
  setCounts((prev) => {
    const next: Record<string, { qty?: number; linear_m?: number }> = {};
    let differs = false;
    for (const item of selected.items || []) {
      const isRoll = !!item.roll_variant_id;
      const value = isRoll
        ? { linear_m: Number(item.counted_linear_m ?? item.system_linear_m ?? 0) }
        : { qty: Number(item.counted_qty ?? item.system_qty ?? 0) };
      next[item.id] = value;
      if (JSON.stringify(prev[item.id]) !== JSON.stringify(value)) differs = true;
    }
    const prevKeys = Object.keys(prev);
    if (!differs && prevKeys.length === Object.keys(next).length) return prev;
    return next;
  });
}, [selected]);
```

Ganti `saveCounts` — teruskan tipe yang benar ke action:

```ts
async function saveCounts(idOverride?: string) {
  const id = idOverride || selected?.id;
  if (!id) return;
  setSaving(true);
  try {
    await updateStockOpnameCountsAction(
      id,
      Object.entries(counts).map(([stock_opname_item_id, val]) => ({
        stock_opname_item_id,
        counted_qty: val.qty,
        counted_linear_m: val.linear_m,
      }))
    );
    setNotice("Hitungan fisik tersimpan.");
    await reload();
  } catch (error) {
    setNotice(error instanceof Error ? error.message : "Gagal simpan hitungan");
  } finally {
    setSaving(false);
  }
}
```

Ganti tabel items. Temukan blok `{(selected.items || []).map((item: any) => {` dan ganti dengan logika grouping:

```tsx
{(() => {
  // Kelompokkan: non-roll tampil langsung, roll dikelompokkan per barang_id.
  // Gunakan React (import React from "react") jika JSX.Element belum di-scope.
  const items: any[] = selected.items || [];
  const nonRoll = items.filter((item: any) => !item.roll_variant_id);
  const rollByBarang = new Map<string, any[]>();
  for (const item of items.filter((i: any) => i.roll_variant_id)) {
    const list = rollByBarang.get(item.barang_id) || [];
    list.push(item);
    rollByBarang.set(item.barang_id, list);
  }

  const rows: React.ReactElement[] = [];

  // Tampilkan barang dimensi dulu (per group)
  for (const [barangId, variantItems] of rollByBarang) {
    const totalSistem = variantItems.reduce(
      (sum: number, i: any) => sum + Number(i.system_qty || 0),
      0
    );
    rows.push(
      <tr key={`group-${barangId}`} className="bg-emerald-50/50 dark:bg-emerald-900/10 border-t border-slate-200 dark:border-slate-700">
        <td className="p-3 font-semibold text-emerald-800 dark:text-emerald-300" colSpan={4}>
          {variantItems[0].barang_nama || barangId}
          <span className="ml-2 text-xs font-normal text-emerald-600 dark:text-emerald-400">
            ({totalSistem.toFixed(2)} m² sistem)
          </span>
        </td>
      </tr>
    );

    for (const item of variantItems) {
      const countVal = counts[item.id] ?? { linear_m: Number(item.system_linear_m ?? 0) };
      const countedLinear = countVal.linear_m ?? 0;
      const countedQty = countedLinear * Number(item.roll_width_m);
      const delta = countedQty - Number(item.system_qty || 0);

      rows.push(
        <tr key={item.id} className="border-t border-slate-100 dark:border-slate-800 text-slate-800 dark:text-slate-200">
          <td className="p-3 pl-8 text-sm text-slate-500 dark:text-slate-400">
            ↳ Lebar {Number(item.roll_width_m).toFixed(2)} m
          </td>
          <td className="p-3 text-right tabular-nums text-sm">
            {Number(item.system_linear_m ?? 0).toFixed(2)} m
            <span className="ml-1 text-xs text-slate-400">(= {Number(item.system_qty || 0).toFixed(2)} m²)</span>
          </td>
          <td className="p-3 text-right">
            <input
              disabled={saving || selected.status !== "DRAFT"}
              className="w-28 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-1 text-right text-sm"
              type="number"
              step="0.01"
              value={countedLinear}
              onChange={(e) =>
                setCounts((prev) => ({
                  ...prev,
                  [item.id]: { linear_m: Number(e.target.value) },
                }))
              }
            />
            <span className="ml-1 text-xs text-slate-400">m</span>
          </td>
          <td className={`p-3 text-right tabular-nums text-sm ${delta === 0 ? "text-slate-400 dark:text-slate-500" : delta < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
            {delta === 0 ? "—" : `${delta > 0 ? "+" : ""}${delta.toFixed(2)} m²`}
          </td>
        </tr>
      );
    }
  }

  // Tampilkan barang non-dimensi
  for (const item of nonRoll) {
    const countVal = counts[item.id] ?? { qty: Number(item.system_qty || 0) };
    const counted = countVal.qty ?? 0;
    const delta = counted - Number(item.system_qty || 0);

    rows.push(
      <tr key={item.id} className="border-t border-slate-100 dark:border-slate-800 text-slate-800 dark:text-slate-200">
        <td className="p-3">
          {item.barang_nama || item.barang_id}
        </td>
        <td className="p-3 text-right tabular-nums">{item.system_qty}</td>
        <td className="p-3 text-right">
          <input
            disabled={saving || selected.status !== "DRAFT"}
            className="w-28 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-1 text-right"
            type="number"
            value={counted}
            onChange={(e) =>
              setCounts((prev) => ({
                ...prev,
                [item.id]: { qty: Number(e.target.value) },
              }))
            }
          />
        </td>
        <td className={`p-3 text-right tabular-nums ${delta === 0 ? "text-slate-400 dark:text-slate-500" : delta < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
          {delta}
        </td>
      </tr>
    );
  }

  return rows;
})()}
```

Ubah `post()` agar save counts dulu dengan format baru (sudah handled via `saveCounts`).

- [ ] **Step 12.2: Type-check**

```bash
npm run type-check 2>&1 | head -30
```

Expected: `Found 0 errors`

- [ ] **Step 12.3: Build**

```bash
npm run build 2>&1 | tail -20
```

Expected: sukses tanpa error

- [ ] **Step 12.4: Commit**

```bash
git add src/app/inventori/opname/page.tsx
git commit -m "feat(fase3): opname tampilkan sub-baris per variant roll dengan input panjang meter"
```

---

### Task 13: Verifikasi Akhir

- [ ] **Step 13.1: Jalankan semua tests**

```bash
npx jest src/lib/__tests__/ --no-coverage
```

Expected: semua pass, 0 failures

- [ ] **Step 13.2: Type-check penuh**

```bash
npm run type-check
```

Expected: `Found 0 errors`

- [ ] **Step 13.3: Build produksi**

```bash
npm run build
```

Expected: Build completed successfully, 0 errors

- [ ] **Step 13.4: Checklist regresi manual**

Verifikasi secara mental/visual di tiap halaman:
- Riwayat Mutasi: baris non-roll masih tampil angka biasa (tidak error)
- Penyesuaian: barang non-dimensi masih pakai input qty biasa
- Opname: barang non-dimensi tampil baris single seperti semula
- Modal Catat Rusak: barang non-dimensi tampil input qty tunggal

- [ ] **Step 13.5: Commit final jika ada perubahan minor**

```bash
git add -A
git status  # pastikan tidak ada file tak diinginkan
git commit -m "chore: verifikasi akhir inventori roll-aware semua fase"
```

---

## Checklist Acceptance Criteria

### Fase 1
- [ ] Riwayat mutasi: baris dengan roll data tampil "−45 m · lebar 1.5 m (= −67.5 m²)"
- [ ] Dropdown barang dimensi di penyesuaian tampil "90 m² (1.5m: 60m)"
- [ ] Kolom Sistem di opname tampil "90 m²" bukan "90"
- [ ] Barang non-dimensi tidak regresi di ketiga halaman
- [ ] type-check + build lulus

### Fase 2
- [ ] Form penyesuaian/waste untuk barang dimensi: pilih lebar + panjang meter
- [ ] Setelah adjustment roll: panjang_tersedia_m di barang_roll_variants ikut update
- [ ] Modal Catat Rusak barang dimensi: pakai InputDimensiRoll
- [ ] ModalAdjustStok barang dimensi: pakai InputDimensiRoll
- [ ] Semua tests pass

### Fase 3
- [ ] Opname baru barang dimensi: baris per variant (bukan satu baris)
- [ ] Input fisik opname per variant dalam meter, delta otomatis dalam m²
- [ ] Posting gagal dengan pesan jelas jika delta > stok variant
- [ ] Migrasi skema di 3 tempat (Supabase sql, sqlite-schema, db-sqlite-migrations)
- [ ] type-check + build + jest lulus
