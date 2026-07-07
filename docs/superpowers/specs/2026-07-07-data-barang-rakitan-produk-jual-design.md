# Spec — Data Barang: Rakitan per Produk Jual, HPP BOM, Satuan Default

> Sub-proyek B dari sesi brainstorming 2026-07-07.
> Mencakup: B1 satuan default produk jual, B2 rakitan per produk jual + HPP
> BOM, B3 klarifikasi input roll komponen, B4 (konsekuensi B2 — SPK otomatis
> handle).

## Isu yang ditangani

| ID | Isu | Ringkasan solusi |
|---|---|---|
| B1 | "Tambah Produk Jual" tidak auto-isi satuan dasar (kecuali produk pertama) | Default `nama_satuan = formData.base_unit` saat tambah produk jual baru |
| B2 | Komponen Rakitan per-item barang, padahal butuh per-Produk Jual. HPP tidak termasuk biaya BOM | Tambah kolom `unit_price_id` (nullable) di `barang_komponen`; HPP saat jual = AVCO induk × faktor + Σ(AVCO komponen × qty/unit) |
| B3 | Opsi "Jumlah roll" di rakitan komponen berdimensi membingungkan | Drop field `jumlah_roll` dari UI BOM (default 1, hidden); input cukup Lebar × Panjang = m²/unit |
| B4 | SPK handle kerjaan X Banner berdimensi | Konsekuensi B2: BOM per produk jual → `deductBomComponents` otomatis pakai BOM yang tepat per produk jual. SPK UI roll sudah benar (operator pilih variant + panjang aktual). Tidak ada perubahan SPK. |

---

## B1 — Satuan default "Tambah Produk Jual"

### Root cause
`ModalTambahBarang.tsx:260-266` `addUnitPrice`:
```ts
const addUnitPrice = () => {
  const refUnit = unitPrices.find((up) => up.faktor_konversi === 1);
  setUnitPrices([
    ...unitPrices,
    {
      nama_satuan: "",            // ← BUG: kosong, user harus pilih manual
      faktor_konversi: 1,
      harga_beli: refUnit?.harga_beli || 0,
      harga_jual: refUnit?.harga_jual || 0,
      harga_member: refUnit?.harga_member || 0,
    },
  ]);
};
```

Produk jual pertama (saat init modal, L177-183) sudah diisi `firstUnit`
(satuan dasar atau "m²" untuk Media Cetak). Produk jual kedua dst. kosong.

### Solusi
Default `nama_satuan` ke `formData.base_unit` (satuan dasar barang induk):
```ts
const addUnitPrice = () => {
  const refUnit = unitPrices.find((up) => up.faktor_konversi === 1);
  setUnitPrices([
    ...unitPrices,
    {
      nama_satuan: formData.base_unit || "",   // ← auto-isi satuan dasar
      faktor_konversi: 1,
      harga_beli: refUnit?.harga_beli || 0,
      harga_jual: refUnit?.harga_jual || 0,
      harga_member: refUnit?.harga_member || 0,
    },
  ]);
};
```

Jika `formData.base_unit` kosong (kasus edge), fallback ke `unitsData[0]?.nama`
atau "" (behavior lama). Tapi `base_unit` selalu terisi karena punya default
saat init modal (L162-175).

### File
| File | Perubahan |
|---|---|
| `src/components/ModalTambahBarang.tsx` (L260-266, `addUnitPrice`) | `nama_satuan: ""` → `nama_satuan: formData.base_unit \|\| ""` |

---

## B2 — Rakitan per Produk Jual + HPP BOM

### B2.a Skema: tambah `unit_price_id` di `barang_komponen`

#### Migrasi Supabase (baru, additive)
`supabase/migrations/<timestamp>_barang_komponen_unit_price.sql`:
```sql
ALTER TABLE "public"."barang_komponen"
  ADD COLUMN IF NOT EXISTS "unit_price_id" "text";

-- FK ke harga_barang_satuan(id) ON DELETE CASCADE
-- (kalau produk jual dihapus, BOM rows yang scoped ke produk itu ikut hilang)
ALTER TABLE "public"."barang_komponen"
  DROP CONSTRAINT IF EXISTS "barang_komponen_unit_price_id_fkey";
ALTER TABLE "public"."barang_komponen"
  ADD CONSTRAINT "barang_komponen_unit_price_id_fkey"
  FOREIGN KEY ("unit_price_id") REFERENCES "public"."harga_barang_satuan"("id")
  ON DELETE CASCADE;

-- Index untuk lookup per produk jual
CREATE INDEX IF NOT EXISTS "barang_komponen_unit_price_id_idx"
  ON "public"."barang_komponen" ("unit_price_id")
  WHERE "is_deleted" = 0;
```

#### Skema SQLite (`database/sqlite-schema.sql`)
Tambah kolom `unit_price_id TEXT` di definisi `barang_komponen` + FK.

#### Runtime ALTER (`src/lib/db-unified.ts`)
Tambah `ALTER TABLE barang_komponen ADD COLUMN unit_price_id TEXT` di blok
runtime migration (pola yang sama dengan kolom sync lain).

#### `src/lib/sync-config.ts`
Tidak perlu daftar ulang — `barang_komponen` sudah terdaftar. Kolom baru
otomatis tersinkron karena sync baca kolom dinamis.

### B2.b Aturan resolusi BOM per produk jual

Saat hitung konsumsi BOM untuk produk jual `U` (id = `harga_satuan_id`) dari
barang `B`:

1. Cari row `barang_komponen` dengan `parent_barang_id = B AND
   unit_price_id = U AND is_deleted = 0`.
2. **Jika ada ≥1 row** → pakai row itu saja (exclusive scope per produk
   jual).
3. **Jika tidak ada** → fallback ke row `parent_barang_id = B AND
   unit_price_id IS NULL AND is_deleted = 0` (scope barang-level, berlaku
   untuk semua produk jual — backwards-compat untuk data existing).

Pseudocode resolver:
```ts
async function resolveBomForUnitPrice(
  barangId: string,
  unitPriceId: string | null | undefined,
): Promise<BarangKomponen[]> {
  // 1. Coba scope per-produk-jual
  if (unitPriceId) {
    const scoped = await db.query("barang_komponen", {
      where: { parent_barang_id: barangId, unit_price_id: unitPriceId, is_deleted: 0 },
    });
    if (scoped.data && scoped.data.length > 0) return scoped.data;
  }
  // 2. Fallback ke scope barang-level (unit_price_id NULL)
  const general = await db.query("barang_komponen", {
    where: { parent_barang_id: barangId, is_deleted: 0, unit_price_id: null },
  });
  return general.data || [];
}
```

### B2.c UI: pilih produk jual saat tambah komponen

`PanelKomponenRakitan.tsx` saat ini rakit per-parent barang. Ubah:

1. Tambah dropdown **"Berlaku untuk Produk Jual"** di form tambah komponen:
   - Opsi: "Semua Produk Jual" (value = `""` → simpan `unit_price_id = NULL`)
   - Opsi: list `unit_prices` dari parent barang (value = `up.id` → simpan
     `unit_price_id = up.id`). Tampilkan `up.nama_produk_jual || up.nama_satuan`.
2. Tambah kolom **"Berlaku untuk"** di tabel komponen existing: tampilkan
   "Semua" untuk `unit_price_id = NULL`, atau nama produk jual untuk
   `unit_price_id = X`.
3. Default dropdown = "Semua Produk Jual" (backwards-compat).

`PanelKomponenRakitan` butuh akses ke `unit_prices` parent barang. Saat ini
props hanya `parentBarangId` + `allBarang`. Tambah props `unitPrices:
UnitPrice[]` dari `ModalTambahBarang` (sudah punya `editData.unit_prices`).

### B2.d API `barang-komponen` — terima `unit_price_id`

`src/app/api/barang-komponen/route.ts`:
- `KomponenSchema` tambah `unit_price_id: z.string().min(1).optional().nullable()`.
- POST: simpan `unit_price_id` (null = scope barang-level).
- GET: terima query `?unit_price_id=xxx` untuk filter, dan return field
  `unit_price_id` di response.
- Validasi: jika `unit_price_id` diisi, pastikan `harga_barang_satuan.id`
  ada dan `barang_id = parent_barang_id` (produk jual milik barang yang
  benar). Kalau mismatch → 422 "Produk jual tidak milik barang ini".

### B2.e Service: `deductBomComponents` pakai resolver per produk jual

`src/lib/services/production-service.ts:990-1048` `deductBomComponents` saat
ini query:
```ts
const res = await db.query("barang_komponen", {
  where: { parent_barang_id: barangId, is_deleted: 0 },
});
```

Ubah untuk menerima `unitPriceId` dan pakai resolver B2.b:
```ts
export async function deductBomComponents({
  barangId,
  unitPriceId,           // ← baru
  qtySPK,
  spkId,
  nomorSpk,
  dibuatOleh,
  itemProduksiId,
}: { barangId: string; unitPriceId: string | null; qtySPK: number; ... }) {
  const komponen = await resolveBomForUnitPrice(barangId, unitPriceId);
  if (komponen.length === 0) return;
  // ... loop deduct (sama seperti sebelumnya)
}
```

Caller: `updateProductionItemStatus` (L1138-1162) — teruskan `unitPriceId`
dari `item_produksi` (kolom `harga_satuan_id` — perlu cek apakah
`item_produksi` punya kolom itu; jika tidak, join ke `item_penjualan` via
`item_penjualan_id`).

### B2.f HPP saat jual: termasuk biaya BOM

`src/lib/services/pos-mutations.ts:593-604` `createSaleAttempt`, untuk item
BARANG:
```ts
// SEBELUM:
const averageCostPerBaseUnit = positiveNumber(material?.average_cost_per_base_unit)
  || (await fallbackAverageCostPerBaseUnit(item.barang_id, item.harga_satuan_id));
hppSatuan = averageCostPerBaseUnit * (positiveNumber(item.faktor_konversi) || 1);
hppTotal = hppSatuan * item.jumlah;
```

Ubah:
```ts
const averageCostPerBaseUnit = positiveNumber(material?.average_cost_per_base_unit)
  || (await fallbackAverageCostPerBaseUnit(item.barang_id, item.harga_satuan_id));
const baseHppSatuan = averageCostPerBaseUnit * (positiveNumber(item.faktor_konversi) || 1);

// BOM: tambah biaya komponen rakitan per unit produk jual
const bomComponents = await resolveBomForUnitPrice(item.barang_id, item.harga_satuan_id);
let bomCostPerUnit = 0;
for (const k of bomComponents) {
  const kompRes = await db.queryOne<any>("barang", { where: { id: k.komponen_id } });
  const komp = kompRes.data;
  if (!komp) continue;
  const kompAvco = positiveNumber(komp.average_cost_per_base_unit)
    || (await fallbackAverageCostPerBaseUnit(k.komponen_id, null));
  const perUnitQty = Number(k.qty);   // qty komponen per 1 unit produk jual
  bomCostPerUnit += kompAvco * perUnitQty;
}

hppSatuan = baseHppSatuan + bomCostPerUnit;
hppTotal = hppSatuan * item.jumlah;
```

Catatan:
- `bomCostPerUnit` = biaya BOM per 1 unit produk jual (sudah per-unit, tidak
  perlu × faktor_konversi — `k.qty` di `barang_komponen` sudah dalam
  satuan dasar komponen per unit produk jual).
- Untuk komponen berdimensi, `k.qty` sudah = `jumlah_roll × lebar × panjang`
  (m²) — lihat `hitungQtyKomponenDimensiM2`.
- `fallbackAverageCostPerBaseUnit` untuk komponen: pakai `harga_beli` dari
  `harga_barang_satuan` faktor=1 (sudah ada helper).
- Void sale (`voidSale` L1200-1211): HPP sudah disimpan di `item_penjualan.hpp_satuan`
  & `hpp_total`, jadi reversal keuangan pakai nilai yang tersimpan — tidak
  perlu recompute BOM.

#### N+1 concern
Loop komponen per item bisa N+1. Optimasi: batch-fetch AVCO semua komponen
unik untuk semua item di awal `createSaleAttempt`, simpan di Map. Tapi karena
BOM biasanya kecil (1-3 komponen per produk jual) dan item per transaksi
juga kecil (~5-20), N+1 bisa ditoleransi untuk MVP. Tandai sebagai
optimasi future di komentar.

### B2.g Deduct stok BOM di sale-time?

**Tidak.** Stok BOM komponen tetap di-deduct di SPK-completion
(`deductBomComponents` di `updateProductionItemStatus`), BUKAN di sale-time.
Alasan: setiap sale otomatis buat SPK (`createSaleAttempt` L866), dan SPK
yang dikerjakan operator yang memproduksi barang + memotong komponen. Kalau
deduct di sale-time juga, akan double-deduct.

HPP di-sale-time = **estimasi** berdasarkan AVCO saat checkout (akuntansi
accrual). Stok komponen aktual di-potong saat SPK selesai. Ini konsisten
dengan model "HPP dicatat saat penjualan, stok bahan di-potong saat
produksi" yang sudah ada.

### B2.h Helper `resolveBomForUnitPrice` — lokasi & test

Buat di `src/lib/bom-utils.ts` (sudah ada, tambah fungsi):
```ts
export async function resolveBomForUnitPrice(
  barangId: string,
  unitPriceId: string | null | undefined,
): Promise<BarangKomponenRow[]> { ... }
```

Atau, jika butuh akses `db` (async), taruh di file service baru
`src/lib/services/bom-service.ts` supaya `bom-utils.ts` tetap pure (sudah
ada test `bom-utils.test.ts` — tambah test untuk resolver).

Test `src/lib/__tests__/bom-service.test.ts` (jika buat service baru):
- Scope per produk jual ada → return scope itu.
- Scope per produk jual tidak ada, barang-level ada → fallback barang-level.
- Keduanya tidak ada → return [].
- `unit_price_id = null` → hanya cari barang-level.

---

## B3 — Drop field "Jumlah roll" di UI BOM komponen

### Konteks
`PanelKomponenRakitan.tsx:286-301` input "Jumlah roll" untuk komponen
berdimensi. Saat ini `hitungQtyKomponenDimensiM2(jumlahRoll, panjang, lebar)`
= `rolls × p × l`. Untuk BOM "per 1 unit produk jual", `jumlahRoll = 1`
selalu (1 X Banner pakai 1 potong 0.5×1.7m, bukan multiple roll).

Field ini membingungkan karena "roll" di konteks barang roll = roll besar
(50m × 1.6m), tapi di sini = "1 potongan".

### Solusi
- **UI**: hide field "Jumlah roll" di `PanelKomponenRakitan` untuk komponen
  berdimensi. Input cukup **Lebar (m) × Panjang (m)** = m² per unit.
- **DB**: kolom `jumlah_roll` jadi `NOT NULL DEFAULT 1` (di migrasi B2.a,
  tambah `ALTER COLUMN jumlah_roll SET DEFAULT 1` + `SET NOT NULL`). Row
  existing yang NULL → set ke 1 dulu via `UPDATE`.
- **API** (`barang-komponen/route.ts`): jika komponen berdimensi dan
  `jumlah_roll` tidak di-supply, default 1. `hitungQtyKomponenDimensiM2(1,
  panjang, lebar)`.
- **Label help**: di UI tampilkan "Lebar × Panjang (m) = X m² per unit
  produk jual" supaya jelas konteksnya.
- **`bom-utils.ts`**: `hitungQtyKomponenDimensiM2` tetap terima
  `jumlahRoll` param (untuk backwards-compat di service), tapi caller
  selalu pass 1 dari UI BOM. Tidak ubah signature.

### File
| File | Perubahan |
|---|---|
| `src/components/PanelKomponenRakitan.tsx` | Hide input "Jumlah roll"; default `jumlahRoll = "1"` internal; label help "Lebar × Panjang (m) = m²/unit". |
| `src/app/api/barang-komponen/route.ts` | Default `jumlah_roll = 1` jika tidak di-supply & komponen berdimensi. |
| `supabase/migrations/<timestamp>_barang_komponen_unit_price.sql` | `ALTER COLUMN jumlah_roll SET DEFAULT 1` + backfill NULL → 1. |
| `database/sqlite-schema.sql` | `jumlah_roll INTEGER NOT NULL DEFAULT 1`. |

---

## B4 — SPK handle X Banner (konsekuensi, no new work)

Setelah B2 (BOM per produk jual):
- SPK item = produk jual "Standar X Banner Flexi" (id = `harga_satuan_id`).
- Saat operator selesaikan item → `deductBomComponents` dipanggil dengan
  `unitPriceId = X Banner's harga_satuan_id` → resolver B2.b ambil BOM
  scoped ke X Banner (Kaki Roll Banner) → stok Kaki Roll Banner berkurang.
- BOM scoped ke produk jual lain (Outdoor/Indoor) TIDAK ter-deduct.
- BOM barang-level (`unit_price_id = NULL`) tetap berlaku untuk produk
  jual yang tidak punya scope sendiri.

UI SPK roll (variant + panjang aktual) **sudah benar** — tidak diubah.
Operator kerja Flexi Banner 280gsm (roll) lewat konfirmasi roll
(`SpkDetailModal.tsx:277-339`), lalu saat item SELESAI, BOM komponen
(Kaki Roll Banner, non-dimensi) auto-deduct.

---

## Error handling

- **B2.d API validasi**: `unit_price_id` tidak milik `parent_barang_id` →
  422 via `friendlyPgError`. Pesan Bahasa Indonesia: "Produk jual tidak
  milik barang ini".
- **B2.f HPP**: jika komponen tidak ditemukan (sudah di-soft-delete) →
  skip (lanjut komponen lain), jangan throw. BOM partial lebih baik
  daripada gagal checkout.
- **B2.e deductBomComponents**: jika stok komponen minus, lanjut (sudah
  jalan — `postInventoryMovement` izinkan minus, log warning). Tidak
  block SPK completion.

---

## Testing

### Unit test (jest node project)
- `src/lib/__tests__/bom-service.test.ts`: resolver B2.b (4 skenario di
  B2.h).
- `src/lib/__tests__/bom-utils.test.ts`: tambah case `hitungQtyKomponenDimensiM2`
  dengan `jumlahRoll = 1` (default BOM).
- `src/app/api/barang-komponen/__tests__/route.test.ts`: tambah POST dengan
  `unit_price_id` valid & invalid; GET filter `?unit_price_id=`.

### Integration (opsional)
- `pos-mutations.test.ts` (jika ada): item BARANG dengan BOM → verifikasi
  `hpp_satuan` di `item_penjualan` = baseHpp + bomCost.

### Manual
1. Buat barang "Flexi Banner 280gsm" (roll, berdimensi), 3 produk jual
   (Outdoor, Indoor, X Banner).
2. Buat barang "Kaki Roll Banner" (pcs, non-dimensi).
3. Edit Flexi Banner → Komponen Rakitan → tambah Kaki Roll Banner qty=1,
   **scope = "Standar X Banner Flexi"** (pilih produk jual).
4. Jual 1 X Banner di POS → cek: HPP di struk/laporan termasuk biaya Kaki
   Roll Banner. Stok Kaki Roll belum berkurang (SPK belum selesai).
5. Selesaikan SPK X Banner → cek: stok Kaki Roll Banner berkurang 1.
6. Jual 1 Outdoor Flexi → cek: HPP TIDAK termasuk Kaki Roll (BOM scoped
   X Banner). SPK Outdoor selesai → Kaki Roll TIDAK berkurang.

---

## Out of scope

- Revaluasi AVCO barang induk saat produksi (B2.g — di-sale-time only).
- BOM multi-level (komponen yang juga punya BOM) — tidak didukung, flat BOM
  saja.
- UI drag-and-drop BOM.
- Migrasi data: row `barang_komponen` existing tetap `unit_price_id = NULL`
  (scope barang-level). Tidak auto-migrate ke scope per produk jual —
  owner pilih scope via UI saat edit.