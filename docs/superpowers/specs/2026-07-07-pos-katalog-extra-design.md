# Spec — POS & Katalog Extra: Quick-Add, Safeguard, Pilih Barang, Transfer, Populer, Kategori

> Sub-proyek C dari sesi brainstorming 2026-07-07.
> Mencakup 6 isu: C1 quick-add tanpa vendor/HPP, C2 safeguard pending,
> C3 katalog extra lewat Pilih Barang, C4 metode bayar TRANSFER, C5 sistem
> Populer, C6 kategori dari `kategori_barang`.

## Isu yang ditangani

| ID | Isu | Ringkasan solusi |
|---|---|---|
| C1 | Kasir POS tidak bisa tambah barang Katalog Extra tanpa vendor+HPP | `ModalTambahItemLainnya` ringkas: wajib hanya nama+satuan+harga. Simpan ke `katalog_maklon` + keranjang. Vendor/biaya opsional (collapsed). |
| C2 | Safeguard: item tanpa vendor+HPP tidak boleh masuk SPK/Keuangan/Laporan sampai diisi | Relaksasi validasi `createSaleAttempt`. Pending maklon → `pending_vendor_hpp=1`, HPP=0, no PO, no SPK item, no keuangan. Reconcile manual via queue UI. |
| C3 | Item katalog extra di POS langsung ke keranjang, kasir tidak bisa atur qty/harga/finishing/biaya tambahan | `handleProdukJualClick` untuk KATALOG_MAKLON → set `selectedMaterial` virtual + tampilkan form (qty + ubah harga + biaya tambahan, TANPA finishing). |
| C4 | Katalog Extra tidak ada opsi bayar "Transfer" ke vendor | Tambah `TRANSFER` ke enum `metode_bayar_vendor` (DB CHECK + schema + modal + service). TRANSFER = bayar langsung seperti CASH, label berbeda. |
| C5 | "Urutan Tampil" di Katalog Extra; badge "Populer" di POS tidak berfungsi | Ganti `urutan` dengan sistem Populer: `populer_status` manual + auto-compute dari `item_penjualan` 30 hari. Badge Populer di POS = sort toggle. |
| C6 | Kategori barang dari `kategori_barang` tidak muncul di POS untuk katalog extra | Tambah `kategori_id` FK di `katalog_maklon` → `kategori_barang`. Modal pakai dropdown. POS filter baca dari join. |

---

## C1 — POS quick-add ke katalog_maklon

### Root cause
`ModalTambahItemLainnya.tsx` (POS) mewajibkan vendor+biaya+metode sebelum simpan
(L77-81: jika salah satu kosong → error "Lengkapi Rincian Internal"). Padahal
modal Katalog Extra (`ModalKatalogMaklon.tsx`) sudah allow vendor=null/biaya=0.

### Solusi
Ubah `ModalTambahItemLainnya` supaya **sejajar** dengan `ModalKatalogMaklon`:

1. **Field wajib**: nama item, satuan, harga jual, jumlah.
2. **Field opsional** (collapsed "Rincian Internal", TIDAK mewajibkan):
   vendor, biaya subkontrak, metode bayar.
3. **On save** (`handleSaveTambahItemLainnya` di `pos/page.tsx:807-831`):
   - Panggil `createKatalogMaklonAction` untuk simpan ke `katalog_maklon`
     (vendor=null/biaya=0 jika kosong).
   - Tambah item baru ke keranjang dengan `tipe_item: "MAKLON"`,
     `katalog_maklon_id: <id baru>`, `pending_vendor_hpp: true` (jika
     vendor/biaya kosong).
   - Refresh cache `katalogMaklon` via `useInvalidate("katalog-maklon")`
     supaya item muncul di halaman Katalog Extra.

### Props `TambahItemLainnyaValue`
Tambah field opsional:
```ts
export interface TambahItemLainnyaValue {
  barang_nama: string;
  jumlah: number;
  nama_satuan: string;
  harga_satuan: number;
  vendor_subkontrak_id?: string | null;   // opsional
  biaya_subkontrak?: number | null;        // opsional
  metode_bayar_vendor?: "CASH" | "NET30" | "TRANSFER" | null;  // opsional
}
```

### File
| File | Perubahan |
|---|---|
| `src/app/pos/ModalTambahItemLainnya.tsx` | Hapus validasi wajib vendor+biaya (L77-81). Rincian Internal tetap collapsed toggle, tapi optional. Tambah opsi TRANSFER di metode (C4). |
| `src/app/pos/page.tsx` (`handleSaveTambahItemLainnya` L807-831) | Panggil `createKatalogMaklonAction` → simpan ke `katalog_maklon` → tambah ke keranjang dengan `katalog_maklon_id` + `pending_vendor_hpp` flag. Invalidate cache katalog. |

---

## C2 — Safeguard pending vendor/HPP

### Root cause
`pos-mutations.ts:385-409` validasi mewajibkan vendor+biaya+metode+deskripsi
untuk semua item MAKLON. Jika kosong → throw → checkout gagal.

### Solusi: model "pending then reconcile"

#### C2.a Skema: tambah kolom di `item_penjualan`

Migrasi Supabase `<timestamp>_item_penjualan_pending_maklon_kategori.sql`:
```sql
ALTER TABLE "public"."item_penjualan"
  ADD COLUMN IF NOT EXISTS "pending_vendor_hpp" integer NOT NULL DEFAULT 0;
ALTER TABLE "public"."item_penjualan"
  ADD COLUMN IF NOT EXISTS "katalog_maklon_id" text;
ALTER TABLE "public"."item_penjualan"
  ADD COLUMN IF NOT EXISTS "populer_status_cache" integer DEFAULT 0;
-- FK katalog_maklon_id → katalog_maklon(id) ON DELETE SET NULL
ALTER TABLE "public"."item_penjualan"
  DROP CONSTRAINT IF EXISTS "item_penjualan_katalog_maklon_id_fkey";
ALTER TABLE "public"."item_penjualan"
  ADD CONSTRAINT "item_penjualan_katalog_maklon_id_fkey"
  FOREIGN KEY ("katalog_maklon_id") REFERENCES "public"."katalog_maklon"("id")
  ON DELETE SET NULL;
```
+ `database/sqlite-schema.sql` + runtime ALTER di `db-unified.ts`.

`populer_status_cache` dipakai untuk C5 (auto-compute). `katalog_maklon_id`
dipakai untuk C5 (tracking maklon sales) + C2 (link reconcile ke katalog
entry).

#### C2.b Relaksasi validasi `createSaleAttempt`

`pos-mutations.ts:385-409` ubah:
```ts
for (let i = 0; i < data.items.length; i++) {
  const item = data.items[i];
  if (item.tipe_item === "MAKLON") {
    if (!item.deskripsi_pekerjaan?.trim()) {
      throw new Error(`Item ${i + 1} (Maklon): deskripsi pekerjaan wajib diisi`);
    }
    // Vendor + biaya + metode OPSIONAL — pending jika kosong.
    // Validasi metode hanya jika vendor+biaya diisi.
    if (item.vendor_subkontrak_id && item.biaya_subkontrak > 0) {
      if (!["CASH", "NET30", "TRANSFER"].includes(item.metode_bayar_vendor || "")) {
        throw new Error(`Item ${i + 1} (Maklon): metode bayar vendor tidak valid`);
      }
    }
  }
}
```

#### C2.c Pending maklon di sale flow

Di `createSaleAttempt` (L569-668), untuk item MAKLON:
```ts
const isMaklon = item.tipe_item === "MAKLON";
const isPendingMaklon = isMaklon && (
  !item.vendor_subkontrak_id || !item.biaya_subkontrak || item.biaya_subkontrak <= 0
);

if (isMaklon) {
  if (isPendingMaklon) {
    hppSatuan = 0;       // belum ada modal dicatat
    hppTotal = 0;
  } else {
    const biaya = Number(item.biaya_subkontrak) || 0;
    hppTotal = biaya;
    hppSatuan = item.jumlah > 0 ? biaya / item.jumlah : biaya;
  }
}
```

Di `saleItem` insert (L630-665), tambah field:
```ts
pending_vendor_hpp: isPendingMaklon ? 1 : 0,
katalog_maklon_id: item.katalog_maklon_id || null,
```

#### C2.d Skip PO + SPK + keuangan HPP untuk pending

1. **PO maklon** (L978-1023): hanya proses `maklonItemIds` yang
   **non-pending**. Filter:
   ```ts
   for (const [idx, saleItemId] of maklonItemIds) {
     const it = data.items[idx];
     const isPending = !it.vendor_subkontrak_id || !it.biaya_subkontrak || it.biaya_subkontrak <= 0;
     if (isPending) continue;   // skip, reconcile nanti
     // ... grouping & createMaklonPurchase
   }
   ```
2. **SPK item** (L884-945): skip `item_produksi` creation untuk pending
   maklon. Tambah guard:
   ```ts
   if (isMaklon && isPendingMaklon) continue;  // tidak buat SPK item
   ```
3. **HPP keuangan** (L775-788): `totalHpp` sudah exclude pending
   (hppTotal=0), jadi HPP entry otomatis 0 untuk pending. Tapi pastikan
   `totalHpp` tidak post baris 0 yang kosong — guard `if (totalHpp > 0)`
   sudah ada (L775).

#### C2.e Reconcile pending maklon

Buat server action `reconcilePendingMaklonItemAction` di
`src/app/katalog-maklon/actions.ts` (atau `pos/actions.ts`):

```ts
export async function reconcilePendingMaklonItemAction(
  itemPenjualanId: string,
  data: {
    vendor_subkontrak_id: string;
    biaya_subkontrak: number;
    metode_bayar_vendor: "CASH" | "NET30" | "TRANSFER";
  },
) {
  await requireSession();
  // 1. Update item_penjualan: set vendor+biaya+metode, pending_vendor_hpp=0
  // 2. Recompute hpp_satuan, hpp_total, gross_profit, gross_margin
  // 3. Post HPP keuangan [REF:itemPenjualanId]
  // 4. Create PO maklon (createMaklonPurchase)
  // 5. (Opsional) create SPK item retroactive — OUT OF SCOPE MVP
}
```

Guard: `requireSession` (Staf+ boleh reconcile). Validasi Zod.

#### C2.f UI: queue "Pending Vendor/HPP"

Di halaman `src/app/katalog-maklon/page.tsx` (atau section baru di Beranda),
tambah tab/section **"Pending Vendor/HPP"**:
- Query `item_penjualan` where `pending_vendor_hpp = 1`, join `penjualan`
  (nomor_faktur, tanggal, pelanggan).
- Tampilkan tabel: faktur, tanggal, nama item (deskripsi), jumlah, harga
  jual, [aksi: "Isi Vendor & HPP" → modal reconcile].
- Modal reconcile: dropdown vendor, input biaya, metode (CASH/NET30/TRANSFER),
  tombol "Reconcile" → `reconcilePendingMaklonItemAction`.
- Setelah reconcile → invalidate cache riwayat + keuangan.

Gunakan `useCachedData("pending-maklon-v1", ...)`.

### C2.g Void sale dengan pending maklon
`voidSale` (L1140-1305): saat void penjualan dengan pending maklon, tidak
ada HPP keuangan yang perlu direversal (karena HPP=0). Tidak ada PO maklon
yang perlu dibatalkan. Void tetap reverses SALE_ISSUE inventory untuk
barang biasa. Tidak ada perubahan khusus — pastikan `voidSale` tidak
crash pada item dengan `vendor_subkontrak_id = NULL` (cek `voidSale`
L1200-1211 — HPP reversal pakai `item.hpp_satuan` yang sudah 0 untuk
pending, jadi aman).

---

## C3 — Katalog extra lewat Pilih Barang flow

### Root cause
`handleProdukJualClick` (`pos/page.tsx:641-667`) untuk
`produk.sumber === "KATALOG_MAKLON"` langsung buat CartItem + `return` awal
— tidak set `selectedMaterial`/`selectedUnit`, tidak tampilkan form.

### Solusi
Ubah `handleProdukJualClick` supaya katalog maklon juga lewat form:

```ts
const handleProdukJualClick = (produk: ProdukJualFlat) => {
  if (produk.sumber === "KATALOG_MAKLON") {
    // Set virtual material + unit supaya form muncul
    setSelectedMaterial({
      id: ID_BARANG_PLACEHOLDER_MAKLON,
      nama: produk.barang_nama ?? produk.nama,
      satuan_dasar: produk.nama_satuan,
      // virtual flag — form tahu ini maklon
      _isKatalogMaklon: true,
      _katalogMaklonId: produk.katalog_maklon_id,
    });
    setSelectedUnit({
      id: ID_HARGA_PLACEHOLDER_MAKLON,
      nama_satuan: produk.nama_satuan,
      nama_produk_jual: produk.nama_produk_jual,
      faktor_konversi: 1,
      harga_jual: produk.harga_jual,
      harga_member: produk.harga_member,
    });
    setQuantity("1");
    setFormHargaSatuan(null);
    setFormBiayaTambahan([]);
    setFormFinishing([]);  // maklon tidak ada finishing
    setEditingCartIndex(null);
    return;
  }
  // ... existing barang path
};
```

### Adaptasi form untuk maklon

Di area form (sekitar L2080-2160), saat `selectedMaterial._isKatalogMaklon`:
- **Sembunyikan** panel finishing (`showFormFinishingModal` trigger,
  finishing options) — maklon outsourced, finishing tidak relevan.
- **Tampilkan**: qty, ubah harga (formHargaSatuan), biaya tambahan.
- **Sembunyikan** roll/dimensi input (katalog maklon tidak berdimensi).

Di `buildCartItemFromForm` (L600-630), deteksi
`selectedMaterial._isKatalogMaklon` → buat CartItem dengan:
```ts
{
  barang_id: ID_BARANG_PLACEHOLDER_MAKLON,
  harga_satuan_id: ID_HARGA_PLACEHOLDER_MAKLON,
  tipe_item: "MAKLON",
  katalog_maklon_id: selectedMaterial._katalogMaklonId,
  // ... qty, harga override, biaya tambahan dari form
}
```

`deskripsi_pekerjaan` = `produk.nama` (nama katalog). Vendor/biaya/metode
TIDAK di-set di sini (di-isi via ModalRincianInternalMaklon saat edit, atau
pending jika kosong → safeguard C2).

### Edit cart item maklon
`handleEditCartItem` (L707-715) saat ini alihkan maklon ke
`ModalRincianInternalMaklon`. Pertahankan — kasir bisa edit vendor/biaya/
metode lewat modal itu. TAPI tambah: juga bisa edit qty/harga/biaya tambahan
lewat form Pilih Barang (re-click produk). Atau: gabung — `ModalRincianInternalMaklon`
tetap untuk vendor/biaya, form Pilih Barang untuk qty/harga/biaya tambahan.

**MVP**: edit maklon lewat `ModalRincianInternalMaklon` (vendor/biaya) +
lewat form Pilih Barang (qty/harga/biaya tambahan). Dua jalur, tergantung
klik edit di kolom mana. Sederhanakan: saat klik edit maklon → tampilkan
form Pilih Barang (re-select katalog item), bukan ModalRincianInternal. Lalu
vendor/biaya diedit via "Rincian Internal" toggle di form itu.

Untuk MVP minimal: **form Pilih Barang** saja untuk katalog maklon (qty,
harga, biaya tambahan). Vendor/biaya/metode diedit lewat collapsed "Rincian
Internal" section di form (bukan modal terpisah). Hapus alih ke
`ModalRincianInternalMaklon` untuk katalog extra existing (tapi tetap pakai
untuk ad-hoc maklon dari `ModalTambahItemLainnya` yang belum masuk katalog).

### File
| File | Perubahan |
|---|---|
| `src/app/pos/page.tsx` (`handleProdukJualClick` L641-667) | Set virtual material+unit untuk KATALOG_MAKLON, jangan langsung ke cart. |
| `src/app/pos/page.tsx` (form area ~L2080-2160) | Sembunyikan finishing + roll untuk maklon; tampilkan qty/harga/biaya tambahan. |
| `src/app/pos/page.tsx` (`buildCartItemFromForm` L600-630) | Handle `_isKatalogMaklon` → CartItem MAKLON dengan katalog_maklon_id. |
| `src/app/pos/page.tsx` (`handleEditCartItem` L707-715) | Alihkan edit maklon ke form Pilih Barang (re-select), bukan ModalRincianInternal. |

---

## C4 — Metode bayar TRANSFER

### Root cause
`katalog_maklon.metode_bayar_vendor_default` ada CHECK constraint
`IN ('CASH','NET30')` (migrasi `20260704120000`). Modal `ModalKatalogMaklon`
opsi hanya CASH/NET30 (L322-325). `pos-mutations.ts:398-401` validasi hanya
CASH/NET30.

### Solusi

#### C4.a Skema
Migrasi `<timestamp>_item_penjualan_pending_maklon_kategori.sql` (gabung
dengan C2.a):
```sql
ALTER TABLE "public"."katalog_maklon"
  DROP CONSTRAINT IF EXISTS "katalog_maklon_metode_bayar_vendor_default_check";
ALTER TABLE "public"."katalog_maklon"
  ADD CONSTRAINT "katalog_maklon_metode_bayar_vendor_default_check"
  CHECK ("metode_bayar_vendor_default" IN ('CASH','NET30','TRANSFER'));
```
+ `database/sqlite-schema.sql` update CHECK.

#### C4.b Schema Zod
`src/lib/schemas/katalog-maklon.ts`:
```ts
metode_bayar_vendor_default: z.enum(["CASH", "NET30", "TRANSFER"]).default("CASH"),
```

#### C4.c UI
- `ModalKatalogMaklon.tsx:311-326`: tambah `<option value="TRANSFER">TRANSFER (bayar langsung via bank)</option>`.
- `ModalTambahItemLainnya.tsx:238-248`: tambah TRANSFER.
- `ModalRincianInternalMaklon.tsx`: tambah TRANSFER.

#### C4.d Service `pos-mutations.ts`
- Validasi (L398-401): `["CASH", "NET30", "TRANSFER"]`.
- Grouping PO maklon (L1005-1015): `metodeBayar as "CASH" | "NET30" | "TRANSFER"`.
- `createMaklonPurchase` di `purchases-service.ts`: TRANSFER → post keuangan
  langsung seperti CASH (metode_pembayaran = "TRANSFER"), BUKAN buat hutang.

#### C4.e Type `KatalogMaklon`
`katalog-maklon-service.ts:11`: `metode_bayar_vendor_default: "CASH" | "NET30" | "TRANSFER"`.
`pos-types.ts` `SubkontraktorOption` & `CartItem.metode_bayar_vendor`: sama.

---

## C5 — Sistem Populer

### Root cause
Badge "Populer" di `pos/page.tsx:1645-1647` hanya label statis — tidak ada
logika sort/filter. `katalog_maklon.urutan` manual, tidak terkait popularitas.

### Solusi

#### C5.a Skema
Migrasi `<timestamp>_populer_status.sql`:
```sql
ALTER TABLE "public"."harga_barang_satuan"
  ADD COLUMN IF NOT EXISTS "populer_status" integer NOT NULL DEFAULT 0;
ALTER TABLE "public"."katalog_maklon"
  ADD COLUMN IF NOT EXISTS "populer_status" integer NOT NULL DEFAULT 0;
```
+ SQLite + runtime ALTER.

#### C5.b Auto-compute popularitas
Buat server action `getPopularItemsAction()` di `src/app/pos/actions.ts`:
```ts
export async function getPopularItemsAction(): Promise<{
  barangUnitPriceIds: Set<string>;
  katalogMaklonIds: Set<string>;
}> {
  await requireSession();
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

  // Barang: group by harga_satuan_id, count >= 3
  const barangSales = await db.query<any>("item_penjualan", {
    where: { tipe_item: "BARANG", harga_satuan_id: { ne: null } },
    // Note: db-unified where mungkin tidak support range tanggal —
    // kalau tidak, fetch all lalu filter in-memory by dibuat_pada >= since
  });
  const barangCounts = new Map<string, number>();
  for (const it of barangSales.data || []) {
    if (it.dibuat_pada < since) continue;
    const id = it.harga_satuan_id;
    if (!id) continue;
    barangCounts.set(id, (barangCounts.get(id) || 0) + 1);
  }

  // Maklon: group by katalog_maklon_id, count >= 3
  const maklonSales = await db.query<any>("item_penjualan", {
    where: { tipe_item: "MAKLON", katalog_maklon_id: { ne: null } },
  });
  const maklonCounts = new Map<string, number>();
  for (const it of maklonSales.data || []) {
    if (it.dibuat_pada < since) continue;
    const id = it.katalog_maklon_id;
    if (!id) continue;
    maklonCounts.set(id, (maklonCounts.get(id) || 0) + 1);
  }

  // Manual override: populer_status = 1 → selalu populer
  const manualBarang = await db.query<any>("harga_barang_satuan", {
    where: { populer_status: 1, is_deleted: false },
  });
  const manualMaklon = await db.query<any>("katalog_maklon", {
    where: { populer_status: 1, is_deleted: 0 },
  });

  const THRESHOLD = 3;
  const barangUnitPriceIds = new Set<string>([
    ...[...barangCounts.entries()].filter(([, c]) => c >= THRESHOLD).map(([id]) => id),
    ...(manualBarang.data || []).map((r) => r.id),
  ]);
  const katalogMaklonIds = new Set<string>([
    ...[...maklonCounts.entries()].filter(([, c]) => c >= THRESHOLD).map(([id]) => id),
    ...(manualMaklon.data || []).map((r) => r.id),
  ]);

  return { barangUnitPriceIds, katalogMaklonIds };
}
```

Catatan N+1: query `item_penjualan` fetch all lalu filter tanggal in-memory.
Untuk MVP acceptable. Optimasi: jika `db-unified` support range `where`
tanggal, pakai itu. Tandai di komentar.

#### C5.c POS: badge Populer jadi sort toggle

`pos/page.tsx`:
- Tambah state `const [sortPopuler, setSortPopuler] = useState(false);`
- Fetch popularitas via `useCachedData("pos-populer-v1", getPopularItemsAction)`.
- `filteredProdukJual` (L470-486): jika `sortPopuler`, sort supaya
  popular items (id ada di `barangUnitPriceIds` atau `katalogMaklonIds`)
  ke depan:
  ```ts
  const sorted = sortPopuler
    ? [...filtered].sort((a, b) => {
        const aPop = isItemPopular(a, popularData);
        const bPop = isItemPopular(b, popularData);
        return (bPop ? 1 : 0) - (aPop ? 1 : 0);
      })
    : filtered;
  ```
- Badge "Populer" (L1645-1647): ubah jadi button toggle:
  ```tsx
  <button
    type="button"
    onClick={() => setSortPopuler((v) => !v)}
    className={`... ${sortPopuler ? "bg-cyan-500 text-white" : "bg-cyan-50"}`}
  >
    Populer {sortPopuler ? "ON" : "OFF"}
  </button>
  ```

`isItemPopular(produk, popularData)`:
- Jika `produk.sumber === "KATALOG_MAKLON"` → `popularData.katalogMaklonIds.has(produk.katalog_maklon_id)`.
- Else → `popularData.barangUnitPriceIds.has(produk.id)` (produk.id = harga_satuan_id).

#### C5.d UI: "Tandai Populer" di modal

**`ModalKatalogMaklon.tsx`**: ganti field "Urutan Tampil" (L328-345) dengan
checkbox "Tandai Populer" → set `populer_status`:
```tsx
<input type="checkbox" checked={form.populer_status === 1}
  onChange={(e) => setForm({ ...form, populer_status: e.target.checked ? 1 : 0 })} />
<label>Tandai Populer (muncul di atas saat filter Populer ON di POS)</label>
```
Drop field `urutan` dari UI (kolom DB tetap untuk backwards-compat).

**`PanelHargaSatuan.tsx`**: tambah checkbox "Populer" per produk jual
(sets `up.popuer_status`). Field `populer_status` di `UnitPrice` type.

#### C5.e Persist `katalog_maklon_id` di sale
Saat insert `item_penjualan` (C2.c), set `katalog_maklon_id` dari cart item.
Ini sudah ada di C2.c. Tanpa ini, auto-compute maklon tidak jalan.

### File C5
| File | Perubahan |
|---|---|
| `supabase/migrations/<timestamp>_populer_status.sql` | `populer_status` di `harga_barang_satuan` + `katalog_maklon`. |
| `database/sqlite-schema.sql` + `db-unified.ts` | Kolom baru. |
| `src/app/pos/actions.ts` | `getPopularItemsAction`. |
| `src/app/pos/page.tsx` | State `sortPopuler`, badge jadi toggle, sort di `filteredProdukJual`, fetch popularitas. |
| `src/app/katalog-maklon/ModalKatalogMaklon.tsx` | Ganti "Urutan Tampil" → "Tandai Populer". |
| `src/lib/schemas/katalog-maklon.ts` | `urutan` → `popuer_status`. |
| `src/lib/services/katalog-maklon-service.ts` | `createKatalogMaklon`/`updateKatalogMaklon` simpan `popuer_status`. |
| `src/components/barang/PanelHargaSatuan.tsx` | Tambah checkbox "Populer" per produk jual. |
| `src/components/barang/types-barang.ts` | `UnitPrice.popuer_status?: number`. |

---

## C6 — Kategori dari `kategori_barang`

### Root cause
`katalog_maklon.kategori` free-text (migrasi L39). POS filter
`materialCategories` (`pos/page.tsx:410-420`) baca `m.kategori_nama` (barang
join via `kategori_id`). Katalog maklon tidak pakai `kategori_id` →
kategori-nya tidak muncul di filter POS.

### Solusi

#### C6.a Skema
Migrasi `<timestamp>_katalog_maklon_kategori_id.sql`:
```sql
ALTER TABLE "public"."katalog_maklon"
  ADD COLUMN IF NOT EXISTS "kategori_id" text;
ALTER TABLE "public"."katalog_maklon"
  DROP CONSTRAINT IF EXISTS "katalog_maklon_kategori_id_fkey";
ALTER TABLE "public"."katalog_maklon"
  ADD CONSTRAINT "katalog_maklon_kategori_id_fkey"
  FOREIGN KEY ("kategori_id") REFERENCES "public"."kategori_barang"("id")
  ON DELETE SET NULL;
-- Migrasi data: coba match kategori free-text → id
UPDATE "public"."katalog_maklon" km
  SET "kategori_id" = kb.id
  FROM "public"."kategori_barang" kb
  WHERE km.kategori = kb.nama AND km.kategori_id IS NULL;
```
+ SQLite + runtime ALTER.

#### C6.b Service & schema
- `katalog-maklon-service.ts`: `KatalogMaklon` interface tambah
  `kategori_id: string | null`. `createKatalogMaklon`/`updateKatalogMaklon`
  simpan `kategori_id` (null jika kosong). Tetap simpan `kategori` (legacy
  free-text) supaya tidak kehilangan data — tapi UI pakai `kategori_id`.
- `schemas/katalog-maklon.ts`: tambah `kategori_id: z.string().nullable().optional()`.
- Query `getKatalogMaklon` join `kategori_barang` → return `kategori_nama`.

#### C6.c UI
- `ModalKatalogMaklon.tsx`: ganti input free-text "Kategori" (L219-232) →
  `<select>` dropdown dari `kategori_barang` (fetch via action
  `getKategoriBarangAction` jika belum ada, atau lewat init data).
  Opsi: "— Tanpa kategori —" (null) + list kategori.
- `pos/page.tsx` `produkJualList` (L448-461): untuk katalog maklon, set
  `kategori_nama: k.kategori_nama` (dari join `kategori_id`) bukan
  `k.kategori` (free-text).
- `pos/page.tsx` `materialCategories` (L410-420): sudah iterasi `materials`
  — tambah iterasi `katalogMaklon` supaya kategori katalog muncul di filter:
  ```ts
  for (const k of katalogMaklon) {
    if (k.kategori_nama) names.add(k.kategori_nama);
  }
  ```

### File C6
| File | Perubahan |
|---|---|
| `supabase/migrations/<timestamp>_katalog_maklon_kategori_id.sql` | `kategori_id` FK + migrasi data. |
| `database/sqlite-schema.sql` + `db-unified.ts` | Kolom + runtime ALTER. |
| `src/lib/schemas/katalog-maklon.ts` | `kategori_id`. |
| `src/lib/services/katalog-maklon-service.ts` | Interface + create/update/query join. |
| `src/app/katalog-maklon/ModalKatalogMaklon.tsx` | Dropdown kategori. |
| `src/app/pos/page.tsx` | `produkJualList.kategori_nama` dari join; `materialCategories` include katalog. |

---

## Error handling

- **C1**: `createKatalogMaklonAction` gagal (mis. nama duplikat) → toast error,
  jangan tambah ke keranjang. Kasir bisa edit nama.
- **C2 reconcile**: `reconcilePendingMaklonItemAction` gagal post keuangan →
  rollback update `item_penjualan` (transaction). Tampilkan error spesifik.
- **C3**: form maklon tanpa qty → validasi `jumlah > 0` (sudah ada di
  `buildCartItemFromForm`).
- **C4**: metode tidak valid → 422 (sudah ada validasi Zod + service).
- **C5**: `getPopularItemsAction` gagal → POS tetap jalan (sortPopuler OFF
  default, fallback ke urutan semula). Gunakan `useCachedData` dengan
  fallback `null`.
- **C6**: `kategori_id` tidak ditemukan → null (tanpa kategori), tidak throw.

---

## Testing

### Unit test (jest node)
- `src/lib/__tests__/katalog-maklon-service.test.ts`: create/update dengan
  `kategori_id` + `popuer_status`; TRANSFER metode.
- `src/lib/schemas/__tests__/katalog-maklon.test.ts` (jika ada): Zod terima
  TRANSFER, reject metode invalid.
- `src/app/api/barang-komponen/__tests__/route.test.ts`: (sudah di spec B).
- `src/lib/__tests__/pos-mutations.test.ts` (jika ada): pending maklon →
  `pending_vendor_hpp=1`, hpp=0, no PO; reconcile → post HPP + create PO.

### Component test (jest jsdom)
- `src/app/pos/__tests__/ModalTambahItemLainnya.test.tsx`: simpan tanpa
  vendor/biaya → onSuccess dipanggil dengan field opsional null.
- `src/app/katalog-maklon/__tests__/ModalKatalogMaklon.test.tsx`: dropdown
  kategori, checkbox Populer, opsi TRANSFER.

### Manual
1. POS: klik "Tambah Item Lainnya" → isi nama+satuan+harga saja → simpan →
   item masuk keranjang + muncul di halaman Katalog Extra.
2. Checkout dengan item pending → sukses. Cek: tidak ada HPP di Keuangan,
   tidak ada SPK item untuk pending, riwayat penjualan tampilkan badge
   "Pending Vendor".
3. Halaman Katalog Extra → tab "Pending Vendor/HPP" → isi vendor+biaya →
   reconcile → cek: HPP masuk Keuangan, PO maklon dibuat.
4. POS: klik katalog extra existing → form muncul (qty/harga/biaya tambahan,
   TANPA finishing) → tambah ke keranjang.
5. Katalog Extra modal: pilih metode TRANSFER → simpan → jual → cek keuangan
   post dengan metode TRANSFER.
6. POS: klik badge "Populer" → item populer sort ke atas. Tandai Populer di
   modal Katalog Extra → item muncul populer walau belum ada penjualan.
7. POS: kategori katalog extra muncul di filter chip.

---

## Out of scope

- Auto-reconcile (AI/tebakan vendor dari histori) — manual saja.
- Retroactive SPK item creation saat reconcile — owner handle manual.
- Multi-vendor per katalog item (1 katalog = 1 vendor default).
- Populer threshold configurable (hardcode 3 transaksi/30 hari untuk MVP).
- Hapus kolom `urutan` dan `kategori` (free-text) dari `katalog_maklon` —
  tetap di DB untuk backwards-compat, hanya hidden dari UI.