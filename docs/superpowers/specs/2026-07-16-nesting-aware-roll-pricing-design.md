# Nesting-Aware Roll Pricing — Barang Berdimensi POS

**Tanggal:** 2026-07-16
**Status:** Disetujui (langsung ke writing-plans, tanpa gate review per instruksi owner)
**Cakupan:** Perhitungan harga roll barang berdimensi MURNI di POS + penyelarasan konsumsi stok produksi. Menyentuh uang/roll/AVCO/stok (aturan besi #2, #3, #6, #7).

## Masalah

Barang berdimensi (banner, `butuh_dimensi_status=1`) dijual per m². Saat edit form POS, kasir memilih "roll yang dipakai", dan harga dihitung **roll-width-aligned**: sistem mengasumsikan **1 lembar mengisi lebar roll penuh** (`getBillableDimensionsForRoll` di `roll-size-utils.ts:90-141` → `billableArea = rollWidth × sisiCut`). Sisa lebar roll selalu ditagihkan sebagai terbuang.

Realita produksi: roll punya lebar tetap tapi panjang bebas dipotong. Operator menata (nesting) beberapa lembar **berdampingan** di lebar roll yang sama untuk hemat bahan.

Dua kasus yang berlawanan, keduanya sah:
- **Kasus A (nesting hemat):** 2 banner 1m×1.5m di roll 2m → muat 2 berdampingan (1+1=2m), berbagi panjang 1.5m. Bahan = 3m², adil = luas banner. **Model sekarang salah** (menagih 2×(2×1.5)=6m², overcharge).
- **Kasus B (roll terpaksa boros):** banner 1.2m×1.7m, roll 2m (termurah) habis, terpaksa roll 1.5m → cuma muat 1 (1.2m, sisa 0.3m tak muat lagi) → sisa terbuang, harga naik. **Wajar.**

Akar masalah: sistem tidak tahu **berapa lembar muat berdampingan per lebar roll**. Model "1 baris jual = 1 lembar = 1 lebar roll penuh" tidak menangkap nesting.

Stok produksi (`postProductionMaterialConsumption`, `production-service.ts:818-937`) memakai asumsi sama (`areaUsed = rollWidth × linearUsed`, `suggestedLinear = billableArea / rollWidth` per lembar penuh) — bila POS diperbaiki tanpa produksi, stok bisa over-consume.

## Tujuan

1. **Kemudahan kasir:** input ukuran + jumlah lembar, lalu pilih roll dari daftar yang harganya sudah dihitung otomatis. Semua matematika nesting disembunyikan.
2. **Harga adil ke pelanggan:** memperhitungkan berapa lembar muat berdampingan; sisa lebar hanya ditagih bila benar-benar terbuang.
3. **Stok akurat:** konsumsi roll produksi selaras dengan nesting (tidak over-consume); operator tetap bisa override panjang aktual.

## Non-Tujuan

- Tidak menerapkan nesting ke komponen rakitan BOM (isu #2 sudah di main dengan jalur roll sendiri; nesting komponen = iterasi terpisah). Rumus dibuat reusable untuk itu nanti.
- Tidak mengubah `getBillableDimensionsForRoll` lama (tetap dipakai jalur komponen rakitan + validasi). Fungsi nesting baru terpisah.
- Tidak menampilkan istilah teknis (itemsPerRow/nesting/baris) di UI kasir.
- Tidak mengubah harga per m² (`harga_jual`/`harga_member`) — hanya luas billable yang diperbaiki.

## Keputusan Desain (hasil brainstorming)

| Topik | Keputusan |
| --- | --- |
| Rumus | `itemsPerRow = floor(rollWidth / sisiMelintang)`; coba 2 orientasi (rotasi), pilih total area terkecil |
| Baris tak penuh | `rows = ceil(jumlahLembar / itemsPerRow)`; tiap baris habiskan panjang sisi cetak penuh (baris terakhir tetap penuh) |
| UX kasir | Input ukuran + jumlah lembar + pilih roll dari daftar (harga otomatis, default termurah); matematika disembunyikan |
| Teruskan ke SPK | Ya — simpan roll terpilih + panjang roll tersarankan sebagai saran; operator override tetap final |
| Stok produksi | Diselaraskan dengan nesting (suggestedLinear = total panjang roll nesting) |
| Cakupan | Barang berdimensi MURNI dulu; komponen rakitan menyusul |
| Pendekatan | Opsi A: fungsi nesting baru terpisah + migrasi additive |

## Arsitektur

### Rumus inti (baru — `src/lib/roll-size-utils.ts`)

Fungsi murni baru (fungsi lama `getBillableDimensionsForRoll` TIDAK diubah):

```ts
export interface NestedRollBilling {
  itemsPerRow: number;       // lembar muat berdampingan per lebar roll
  rows: number;              // ceil(jumlahLembar / itemsPerRow)
  sisiMelintang: number;     // sisi lembar yang sejajar lebar roll (m)
  sisiCetak: number;         // sisi lembar sepanjang roll (m)
  totalPanjangRoll: number;  // rows × sisiCetak (m)
  totalAreaRoll: number;     // rollWidth × totalPanjangRoll (m²) — dasar billing
  areaEfektifPerLembar: number; // totalAreaRoll / jumlahLembar (m²)
  usesRotation: boolean;
}

/**
 * Hitung billing roll dengan nesting: berapa lembar identik muat berdampingan
 * di lebar roll, lalu total area roll terpakai. Coba dua orientasi (rotasi),
 * pilih total area terkecil. Return null bila roll tak cukup lebar untuk
 * salah satu orientasi.
 */
export function getNestedRollBilling(
  panjang: number,
  lebar: number,
  jumlahLembar: number,
  rollWidth: number,
): NestedRollBilling | null;
```

Rumus per orientasi (dua kandidat):
- Orientasi 1 (non-rotasi): `sisiMelintang = lebar`, `sisiCetak = panjang`. Valid bila `rollWidth >= lebar`.
- Orientasi 2 (rotasi): `sisiMelintang = panjang`, `sisiCetak = lebar`. Valid bila `rollWidth >= panjang`.
- Untuk tiap kandidat valid: `itemsPerRow = max(1, floor(rollWidth / sisiMelintang))`; `rows = ceil(jumlahLembar / itemsPerRow)`; `totalPanjangRoll = rows × sisiCetak`; `totalAreaRoll = rollWidth × totalPanjangRoll`.
- Pilih kandidat dengan `totalAreaRoll` terkecil. Bila tak ada kandidat valid → `null`.

Verifikasi contoh:
- 2× (1×1.5), roll 2m: non-rotasi sisiMelintang=1.5→floor(2/1.5)=1→rows2→panjang3→area6; rotasi sisiMelintang=1→floor(2/1)=2→rows1→panjang1.5→area3 ✓ (pilih 3m², efektif 1.5m²/lembar = luas banner, adil).
- 1× (1.2×1.7), roll 1.5m: non-rotasi sisiMelintang=1.7>1.5 invalid; rotasi sisiMelintang=1.2→floor(1.5/1.2)=1→rows1→panjang1.7→area2.55 ✓ (roll-aligned, boros wajar).
- 6× (0.9×1.7), roll 2m: rotasi sisiMelintang=0.9→floor(2/0.9)=2→rows3→panjang5.1→area10.2 (efektif 1.7m²/lembar).

### Perhitungan harga di form POS (`src/app/pos/page.tsx`)

- `rollBillingPreview` (useMemo, ~384-423): beralih memakai `getNestedRollBilling(parsedPanjang, parsedLebar, pieceCount, selectedRollSize)`. `subtotalRaw = billing.totalAreaRoll × hargaPerSatuan`.
- Dropdown "Roll yang dipakai" (~2366-2415): tiap roll variant valid → hitung `getNestedRollBilling(...).totalAreaRoll × harga` → tampilkan harga. Default pilih roll dengan total area terkecil (termurah) — reuse `suggestCheapestRollSize` yang diperluas atau hitung langsung.
- `buildCartItemFromForm` (~635-674): `jumlah` (m² total ditagih) = `billing.totalAreaRoll`. `billedPanjang`/`billedLebar` tetap menyimpan dimensi cut untuk tampilan, tapi total m² kini dari nesting. Simpan field nesting baru ke CartItem: `roll_items_per_row`, `roll_rows`, `roll_panjang_total_m` (untuk diteruskan ke item_penjualan).

Catatan `harga_satuan` per m²: `harga_satuan efektif = subtotalRaw / jumlah` tetap dihitung saat checkout (`page.tsx:1340`), konsisten.

### Field CartItem baru (`src/app/pos/pos-types.ts`)

```ts
roll_items_per_row?: number;  // lembar berdampingan per lebar roll
roll_rows?: number;           // jumlah baris
roll_panjang_total_m?: number; // total panjang roll tersarankan (saran SPK)
```

### Migrasi DB (aturan besi #2 — tiga tempat)

Tambah ke `item_penjualan`:
- `roll_items_per_row REAL`, `roll_rows REAL`, `roll_panjang_total_m REAL` (semua nullable).

1. `supabase/migrations/20260716120000_item_penjualan_roll_nesting.sql` (additive `ADD COLUMN IF NOT EXISTS`).
2. `database/sqlite-schema.sql` (definisi `CREATE TABLE item_penjualan`).
3. Runtime ALTER di `src/lib/db-unified.ts` (guard `!cols.includes`).

`item_penjualan` sudah tabel tersinkron; kolom baru ikut otomatis (kolom-agnostik).

### createSale (`src/lib/services/pos-mutations.ts`)

Simpan field nesting dari item ke `item_penjualan`: `roll_items_per_row`, `roll_rows`, `roll_panjang_total_m` (dari CartItem). `jumlah` (m²) sudah = totalAreaRoll dari POS. `recommended_roll_width_m` tetap = roll terpilih.

### Konsumsi produksi (`src/lib/services/production-service.ts`)

`postProductionMaterialConsumption` (~818-937): `suggestedLinear` diselaraskan.
- Bila `saleItem.roll_panjang_total_m` tersedia (penjualan baru nesting-aware) → `suggestedLinear = roll_panjang_total_m` (untuk variant roll yang cocok dengan `recommended_roll_width_m`; bila operator pilih roll lain, hitung ulang via `getNestedRollBilling` dgn jumlah lembar dari `saleItem`).
- Bila tidak tersedia (data lama) → fallback ke rumus lama (`getBillableDimensionsForRoll(...).area / rollWidth`).
- Operator tetap bisa override `linear_used_m` (final). `areaUsed = rollWidth × linearUsed`; `issueArea = min(billedArea, areaUsed)` — jaga tidak over-consume.
- Jumlah lembar untuk hitung ulang: turunkan dari `saleItem.roll_rows × saleItem.roll_items_per_row` atau simpan jumlah lembar; bila tak ada, dari `jumlah / (billed_panjang × billed_lebar)`.

### SPK — saran roll (`SpkDetailModal.tsx` + `spk-print.ts`)

- UI konfirmasi roll menampilkan saran: roll terpilih (`recommended_roll_width_m`) + panjang tersarankan (`roll_panjang_total_m`) sebagai default input `linear_used_m` (editable). Beri hint ringkas ("Saran: Roll 2m, ~5.1m").
- Cetak SPK menampilkan saran roll + panjang bila tersedia.

## Aturan Proyek yang Dipatuhi

- #2 Schema change tiga tempat sinkron.
- #3 Inventory mutation lewat `postInventoryMovement` roll-aligned (tak diubah alurnya, hanya suggestedLinear).
- #6 Roll/dimensi: m² = fungsi dimensi × roll; roll-width-aligned; input Lebar × Panjang; jaga tak over-consume.
- #7 Closed-period guard: konsumsi produksi lewat jalur existing yang sudah bertanggal (tak berubah).
- Fungsi nesting murni (mudah di-test); fungsi lama tak disentuh (aman untuk komponen rakitan).

## Verifikasi & Testing

- `npm run type-check` (0 error) → `npm run build`.
- Jest (project node):
  - `getNestedRollBilling`: kasus A (2×1×1.5 roll2m → area 3, efektif 1.5), kasus B (1.2×1.7 roll1.5m → 2.55), 6×0.9×1.7 roll2m (area 10.2, itemsPerRow 2, rows 3), rotasi terpilih benar, roll terlalu kecil → null, jumlahLembar 1 (setara rumus lama non-nesting), baris tak penuh (5 lembar itemsPerRow 2 → rows 3).
  - createSale: field nesting tersimpan ke item_penjualan; `jumlah` = totalAreaRoll.
  - postProductionMaterialConsumption: suggestedLinear pakai roll_panjang_total_m bila ada, fallback lama bila tidak; tidak over-consume.
- Manual: jual 2 banner 1×1.5m → cek daftar roll (roll 2m harga adil = luas banner, bukan dobel); jual 1.2×1.7m roll 1.5m → harga roll-aligned; SPK tampilkan saran roll + panjang; operator override panjang → stok akurat; data lama tetap jalan (fallback).

## Risiko & Mitigasi

- **Over-consume stok bila POS & produksi tidak selaras.** Mitigasi: perbaiki keduanya dalam fitur ini; `issueArea = min(billedArea, areaUsed)`.
- **Data lama tanpa field nesting.** Mitigasi: field nullable + fallback rumus lama di produksi.
- **Regresi ke komponen rakitan (isu #2).** Mitigasi: fungsi lama tak diubah; nesting fungsi baru terpisah; jalur komponen rakitan tak disentuh.
- **Pembulatan/selisih harga.** Mitigasi: `allocateCartLineCharges` existing (pembulatan di total transaksi) tetap dipakai; billing per baris = totalAreaRoll × harga.

## Yang TIDAK Berubah

`getBillableDimensionsForRoll` lama, harga per m², alur komponen rakitan (isu #2), `allocateCartLineCharges`, mekanisme override `linear_used_m` di SPK, closed-period guard.
