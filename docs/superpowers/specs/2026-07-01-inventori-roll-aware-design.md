# Desain: Inventori Roll-Aware — Display, Input, dan Opname per Variant

**Tanggal:** 2026-07-01  
**Status:** Disetujui  
**Scope:** Tiga halaman inventori + modal di halaman Barang

---

## Latar Belakang

Barang berdimensi (`butuh_dimensi_status = 1`) menyimpan stok sebagai m² agregat di
`barang.jumlah_stok`, dan detail per lebar roll di `barang_roll_variants`
(`lebar_m`, `panjang_tersedia_m`). Ledger `inventory_movements` sudah punya kolom
`roll_variant_id`, `roll_width_m`, `linear_delta_m`, namun tiga halaman inventori
belum memanfaatkannya:

- **Riwayat Mutasi** — qty/saldo tampil sebagai angka m² mentah tanpa konteks roll
- **Penyesuaian Stok** — input delta tunggal, tidak update `panjang_tersedia_m` per variant
- **Opname Stok** — kolom Sistem hanya angka tanpa satuan, tidak per variant

Perbaikan dibagi tiga fase berdasarkan kompleksitas.

---

## Pendekatan: Helper terpusat + komponen roll terpisah

### Infrastruktur shared (baru)

**`src/lib/format-dimensi.ts`** — helper format angka dimensi untuk inventori (bukan dokumen)

```
formatQtyMutasi(row) → string
  Input: { qty_delta, roll_width_m?, linear_delta_m? }
  Output barang roll: "−45 m · lebar 1.5 m (= −67.5 m²)"
  Output non-roll: "−67.5" atau "−67.5 m²" (sesuai satuan barang)

formatStokDimensi(material) → string
  Input: { jumlah_stok, butuh_dimensi_status, roll_variants? }
  Output barang dimensi: "90 m² (1.5m: 60m · 2.0m: 15m)"
  Output non-dimensi: "{jumlah_stok} {satuan_dasar}"
```

**`src/components/InputDimensiRoll.tsx`** — form input roll-aware (Fase 2)

```
Props:
  variants: Array<{ id, lebar_m, panjang_tersedia_m }>
  onChange: (val: RollInputVal | null) => void
  disabled?: boolean
  mode: "adjustment" | "waste"
    adjustment → panjang bisa positif (+) atau negatif (−)
    waste → panjang harus positif (sistem akan balik ke qty negatif)

Output (RollInputVal):
  roll_variant_id: string
  lebar_m: number
  panjang_m: number   (absolut; waste akan di-negatifkan di service)
  qty_m2: number      (= panjang_m × lebar_m, ditampilkan real-time)
```

Validasi di komponen:
- Lebar variant harus dipilih
- panjang_m > 0
- Untuk waste: panjang_m ≤ panjang_tersedia_m (dengan toleransi 0.001 m)

---

## Fase 1 — Display Only

### 1.1 Riwayat Mutasi (`src/app/inventori/movements/`)

**Actions (`actions.ts`):**
- `getMovementLedgerAction` sudah return semua kolom `inventory_movements` — pastikan
  `roll_width_m`, `linear_delta_m`, `roll_variant_id` ikut dikembalikan ke client.
- Sertakan `butuh_dimensi_status` dari `barang` yang di-join (via materials lookup).

**Page (`page.tsx`):**
- Kolom **Qty** → pakai `formatQtyMutasi(row)` dari `format-dimensi.ts`
- Kolom **Saldo** → tampilkan `{nilai} m²` jika barang dimensi, plain number jika tidak
- Label header kolom Qty: tambahkan tooltip/keterangan "(m² atau m)"
- Ekspor CSV: tambahkan kolom `roll_width_m` dan `linear_delta_m`

### 1.2 Penyesuaian Stok (`src/app/inventori/adjustments/`)

**Actions (`actions.ts`):**
- `getAdjustmentInitAction` sudah return `materials` — `getMaterials()` sudah include
  `roll_variants`. Pastikan field `butuh_dimensi_status`, `roll_variants` tidak
  di-strip sebelum dikembalikan.

**Page (`page.tsx`):**
- Dropdown barang: tampilkan `formatStokDimensi(material)` sebagai label option
  (menggantikan `{m.nama} - stok {m.jumlah_stok || 0}`)
- Tabel riwayat adjustment: kolom Delta pakai `formatQtyMutasi(movement)`
  dengan lookup material untuk tahu apakah dimensi

### 1.3 Opname Stok (`src/app/inventori/opname/`)

**Page (`page.tsx`):**
- Kolom **Sistem**: untuk item barang dimensi tampilkan `{system_qty} m²` bukan
  angka plain
- Untuk phase ini, input fisik tetap satu angka (m²) — tapi dengan hint satuan
- Tambahkan indikator "(dimensi)" pada nama barang di kolom Barang untuk memudahkan
  user membedakan

---

## Fase 2 — Input Roll-Aware

### 2.1 Extension Service

**`src/lib/services/inventory-service.ts`**

`createInventoryAdjustment` — tambah optional params:
```ts
roll_variant_id?: string | null
linear_delta_m?: number | null   // positif = tambah, negatif = kurangi
roll_width_m?: number | null
```
Jika `roll_variant_id` dan `linear_delta_m` disuplai:
- `qty_delta` dihitung dari `linear_delta_m × roll_width_m` (tidak dari input terpisah)
- Pass semua ke `postInventoryMovement`

`createWasteMovement` — tambah optional params yang sama.
- `qty` (m²) dihitung dari `Math.abs(linear_delta_m) × roll_width_m`
- `qty_delta` selalu negatif untuk waste

### 2.2 Penyesuaian Stok — Form Roll-Aware

**Page (`src/app/inventori/adjustments/page.tsx`):**
- Setelah user memilih barang dimensi: tampilkan `InputDimensiRoll` di bawah
  dropdown barang (menggantikan input qty tunggal)
- Untuk barang non-dimensi: tetap input qty tunggal seperti saat ini
- Submit memanggil `createInventoryAdjustmentAction` dengan tambahan
  `roll_variant_id`, `linear_delta_m`, `roll_width_m`

**Actions (`actions.ts`):**
- `createInventoryAdjustmentAction` dan `createWasteMovementAction` diteruskan
  parameter roll ke service

### 2.3 Modal Catat Rusak (`src/app/barang/ModalCatatRusak.tsx`)

- Props tambahan: `rollVariants?: RollVariant[]` (dari parent `barang/page.tsx`)
- Jika barang dimensi dan ada `rollVariants`: tampilkan `InputDimensiRoll` (mode: waste)
  menggantikan input qty tunggal
- Jika barang non-dimensi: tampilan tidak berubah
- Submit menggunakan `qty_m2` dari komponen sebagai `qty`, plus roll fields

**`src/app/barang/page.tsx`**:
- Modal adjustment inline (jika ada) diupdate dengan pola yang sama
- `MaterialRusak` interface di `ModalCatatRusak.tsx` diperluas dengan
  `roll_variants?: RollVariant[]`

### 2.4 Penyesuaian dari barang/page.tsx

Jika `barang/page.tsx` memiliki modal adjustment inline, pola yang sama diterapkan:
- Deteksi `butuh_dimensi_status`
- Tampilkan `InputDimensiRoll` jika dimensi

---

## Fase 3 — Opname Per Variant Roll

### 3.1 Migrasi Skema (3 tempat wajib sync)

**Kolom baru di `stock_opname_items`:**

| Kolom | Tipe | Default | Keterangan |
|-------|------|---------|------------|
| `roll_variant_id` | TEXT | NULL | FK ke `barang_roll_variants.id` |
| `roll_width_m` | REAL | NULL | Lebar roll (m), denormalisasi |
| `system_linear_m` | REAL | NULL | Panjang tersedia sistem (m) saat snapshot |
| `counted_linear_m` | REAL | NULL | Panjang fisik hasil hitung (m) |
| `delta_linear_m` | REAL | NULL | counted − system (m), NULL jika non-dimensi |

**File yang harus diperbarui:**
1. `supabase/migrations/<timestamp>_stock_opname_items_roll.sql` — ALTER TABLE additive,
   `IF NOT EXISTS`, `DEFAULT NULL`
2. `database/sqlite-schema.sql` — tambahkan kolom ke CREATE TABLE `stock_opname_items`
3. `src/lib/db-unified.ts` — runtime ALTER TABLE ADD COLUMN (bagian startup migration)
4. `src/lib/sync-config.ts` — tambahkan kolom baru ke definisi sync `stock_opname_items`

### 3.2 Extension `stock-opname-service.ts`

**`createStockOpname`:**
- Untuk barang dimensi yang punya `roll_variants` aktif: buat **N baris** di
  `stock_opname_items` (satu per variant), bukan 1 baris
  - `system_qty` = `variant.panjang_tersedia_m × variant.lebar_m` (m²)
  - `system_linear_m` = `variant.panjang_tersedia_m`
  - `roll_variant_id`, `roll_width_m` diisi
- Untuk barang dimensi tanpa variant: buat 1 baris dengan `roll_variant_id = NULL`,
  `system_linear_m = NULL` (fallback graceful)
- Untuk barang non-dimensi: tidak berubah

**`updateStockOpnameCounts`:**
- Untuk item dengan `roll_variant_id`: input adalah `counted_linear_m` (meter, bukan m²)
- `counted_qty` dihitung: `counted_linear_m × roll_width_m`
- `delta_qty` = `counted_qty − system_qty`
- `delta_linear_m` = `counted_linear_m − system_linear_m`

**`postStockOpname`:**
- Untuk item dimensi dengan `roll_variant_id`: pass `roll_variant_id`, `roll_width_m`,
  `linear_delta_m = delta_linear_m` ke `postInventoryMovement`
- Validasi sebelum posting: jika ada item dimensi dengan `delta_linear_m` yang akan
  menyebabkan `panjang_tersedia_m < 0`, **tolak** dengan error spesifik:
  ```
  "Roll lebar 1.5m: panjang tersedia 60m, fisik yang diinput 70m — melebihi stok sistem"
  ```

### 3.3 Opname UI — Per-Variant Input

**`src/app/inventori/opname/page.tsx`:**

Tabel items di-group secara visual:
- Baris barang dimensi dengan multiple variant ditampilkan sebagai sub-baris:
  ```
  Bahan Roll A                  [header row, no input]
    └ Lebar 1.5m   60m  [input] m   Δ: X m²
    └ Lebar 2.0m   15m  [input] m   Δ: Y m²
  Bahan Roll B                  [header row, no input]
    └ Lebar 1.0m   30m  [input] m   Δ: Z m²
  Barang Biasa    100 pcs  [input] pcs   Δ: ...
  ```
- Header baris dimensi menampilkan total m² sistem dan total m² fisik yang dihitung
- Input untuk variant: angka panjang meter (bukan m²), dengan hint `= X m²` real-time
- Input untuk non-dimensi: tidak berubah (angka satuan_dasar)

**Actions (`src/app/inventori/opname/actions.ts`):**
- `updateStockOpnameCountsAction` diperluas: terima `counted_linear_m` untuk item
  dimensi, teruskan ke service

### 3.4 Enrichment `enrichSessions`

Di `stock-opname-service.ts`, `enrichSessions` diperluas:
- Include `roll_width_m`, `roll_variant_id`, `system_linear_m`, `counted_linear_m`,
  `delta_linear_m` di setiap item
- Tidak perlu join tambahan (roll info sudah ada di `stock_opname_items`)

---

## Aturan yang Tetap Berlaku

- Semua mutasi stok lewat `postInventoryMovement` — tidak raw-update `jumlah_stok`
- Setiap action mutasi dibungkus auth guard (`requireAdminOrManager`)
- Fetch UI pakai `useCachedData`, bukan `useAsyncData`
- Dark mode wajib di semua elemen UI baru
- Ikon SVG dari ContentIcons/PageIcons, bukan emoji
- Komentar baru dalam Bahasa Indonesia

---

## File yang Disentuh

### Baru
- `src/lib/format-dimensi.ts`
- `src/components/InputDimensiRoll.tsx`
- `supabase/migrations/<timestamp>_stock_opname_items_roll.sql`

### Dimodifikasi
- `src/lib/services/inventory-service.ts` — extend createInventoryAdjustment, createWasteMovement
- `src/lib/services/stock-opname-service.ts` — extend create, update, post
- `src/lib/db-unified.ts` — runtime ALTER untuk kolom baru
- `src/lib/sync-config.ts` — daftarkan kolom baru
- `database/sqlite-schema.sql` — tambah kolom ke stock_opname_items
- `src/app/inventori/movements/page.tsx` — format display roll
- `src/app/inventori/adjustments/page.tsx` — format + form roll
- `src/app/inventori/adjustments/actions.ts` — pass roll params
- `src/app/inventori/opname/page.tsx` — per-variant UI
- `src/app/inventori/opname/actions.ts` — counted_linear_m
- `src/app/barang/ModalCatatRusak.tsx` — roll input
- `src/app/barang/page.tsx` — roll variants ke ModalCatatRusak + modal adjustment

---

## Verifikasi Sebelum Selesai

1. `npm run type-check` — 0 error
2. `npm run build` — sukses
3. `npx jest src/lib/__tests__/` — test service yang disentuh lulus
4. Manual check: barang non-dimensi tidak regresi di ketiga halaman
5. Manual check: adjustment roll → `barang_roll_variants.panjang_tersedia_m` terupdate

---

## Acceptance Criteria

### Fase 1
- [ ] Riwayat mutasi: baris dengan `roll_width_m` + `linear_delta_m` tampil mis.
      `−45 m · lebar 1.5 m (= −67.5 m²)`
- [ ] Dropdown barang dimensi di penyesuaian tampil stok dengan satuan m² + hint roll
- [ ] Kolom Sistem di opname tampil `X m²` bukan angka plain
- [ ] Barang non-dimensi tidak regresi
- [ ] type-check + build lulus

### Fase 2
- [ ] Form penyesuaian/waste untuk barang dimensi: pilih lebar variant + panjang meter
- [ ] Setelah adjustment/waste roll: `panjang_tersedia_m` di `barang_roll_variants`
      ikut berubah
- [ ] Modal catat rusak di halaman Barang untuk barang dimensi: pakai form roll
- [ ] Test service di `src/lib/__tests__/` lulus

### Fase 3
- [ ] Opname baru untuk barang dimensi: expand jadi baris per variant
- [ ] Input fisik per variant dalam meter (m), delta otomatis dalam m²
- [ ] Posting gagal dengan pesan jelas jika fisik > sistem untuk suatu variant
- [ ] Migrasi skema di 3 tempat sync (Supabase migration, sqlite-schema, db-unified)
- [ ] type-check + build + jest lulus
