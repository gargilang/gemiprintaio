# Desain: Otomasi Status SPK + Nama Pelanggan Terhubung

Tanggal: 2026-06-10
Status: Draft untuk review

## Ringkasan

Menambahkan tiga kemampuan terkait di modal Detail SPK (`src/app/produksi/spk/components/SpkDetailModal.tsx`):

1. **Otomasi status order** — status SPK (order) dihitung otomatis dari status semua itemnya, tapi tetap bisa di-override manual; override reset otomatis saat derivasi item kembali selaras.
2. **Perluasan status item per jenis** — item cetak-sendiri dan item maklon punya daftar status berbeda yang sesuai alur nyatanya, ditampilkan ramah manusia (tanpa underscore).
3. **Nama pelanggan terhubung** — operator bisa mengisi/memilih nama pelanggan dari modal SPK; nama tersimpan ke transaksi `penjualan` dan otomatis sinkron dua arah dengan prompt cetak faktur di Riwayat Penjualan (POS).

Status disimpan via satu konstanta terpusat + validasi Zod (melepas CHECK constraint DB), sehingga menambah status ke depan cukup mengedit satu file tanpa migrasi enum.

<!-- MARKER:RINGKASAN -->
## Keputusan yang disepakati

- Status item **dibedakan per jenis** (cetak-sendiri vs maklon), dibedakan lewat `item_penjualan.tipe_item` (`BARANG` vs `MAKLON`).
- Status order **otomatis dari item**, tapi **bisa di-override manual**; override **reset otomatis** ketika derivasi item kembali cocok dengan status order saat ini.
- Order = SELESAI manual → **konfirmasi dulu**, lalu cascade ke item; item terhalang (roll `PENDING`) dilewati dan dilaporkan; order tidak jadi SELESAI palsu.
- Order = DIBATALKAN manual → **tidak cascade** ke item.
- Status order lain (MENUNGGU/PROSES) manual → set status + nyalakan override, tanpa cascade.
- Nama pelanggan: **pintar** — ketik bebas → `pelanggan_nama_snapshot`; pilih dari daftar → `pelanggan_id`. **Tanpa quick-add** pelanggan baru di SPK.
- Sinkron **dua arah**: prompt nama saat cetak faktur di Riwayat Penjualan ikut **menyimpan** ke `penjualan` (tidak lagi print-only).
- **Satu spec** mencakup status + nama; implementasi bertahap (status dulu, lalu nama).
- Status disimpan via **konstanta terpusat + Zod**; **CHECK constraint dilepas** (rebuild `item_produksi` di SQLite, DROP CONSTRAINT di Supabase).
- Rapikan sekalian: dua server action status produksi yang **belum ter-guard** diberi auth guard (iron rule 14).

<!-- MARKER:KEPUTUSAN -->
## Model status & sumber kebenaran terpusat

File baru: `src/lib/produksi/status-produksi.ts` — satu sumber kebenaran untuk semua status produksi.

### Status item CETAK-SENDIRI (urut atas → bawah)
1. `MENUNGGU` — "Menunggu"
2. `TUNGGU_KONFIRMASI` — "Tunggu Konfirmasi"
3. `BAHAN_HABIS` — "Bahan Habis"
4. `PRINTING` — "Printing"
5. `FINISHING` — "Finishing"
6. `SIAP_AMBIL` — "Siap Diambil"
7. `SELESAI` — "Selesai"
8. `DIBATALKAN` — "Dibatalkan"

### Status item MAKLON (urut atas → bawah)
1. `MENUNGGU` — "Menunggu"
2. `TUNGGU_KONFIRMASI` — "Tunggu Konfirmasi"
3. `BAHAN_HABIS` — "Bahan Habis"
4. `PESAN_KURIR` — "Pesan Kurir"
5. `TUNGGU_KURIR` — "Tunggu Kurir"
6. `SEDANG_DIKIRIM` — "Sedang Dikirim"
7. `DIKERJAKAN_VENDOR` — "Dikerjakan Vendor"
8. `SEDANG_DIAMBIL` — "Sedang Diambil"
9. `SIAP_AMBIL` — "Siap Diambil"
10. `SELESAI` — "Selesai"
11. `DIBATALKAN` — "Dibatalkan"

### Status ORDER (tetap)
`MENUNGGU` → "Menunggu", `PROSES` → "Proses", `SELESAI` → "Selesai", `DIBATALKAN` → "Dibatalkan".

### Isi file `status-produksi.ts`
- `STATUS_ITEM_CETAK` dan `STATUS_ITEM_MAKLON`: array terurut kode status.
- `STATUS_ORDER`: array terurut status order.
- `labelStatus(kode)`: peta kode → label Bahasa Indonesia; fallback humanize (ubah `SCREAMING_SNAKE_CASE` → "Title Case") agar tidak pernah ada underscore di UI. Pola sama seperti `humanizeKategoriKode` di `keuangan-utils.ts`.
- `warnaStatus(kode)`: kelas warna badge per status (selaras dengan `spk-status.ts` lama; nilai baru diberi warna wajar + pasangan dark mode).
- Helper klasifikasi: `adalahStatusTerminal(kode)` (SELESAI/DIBATALKAN), `adalahStatusAktif(kode)` (sudah bergerak dari MENUNGGU dan bukan terminal), `adalahStatusMacet(kode)` (BAHAN_HABIS/TUNGGU_KONFIRMASI).
- `daftarStatusUntukItem(item)`: kembalikan daftar status sesuai jenis item (`tipe_item === "MAKLON"` → maklon, selain itu cetak).

Validasi nilai status pindah ke Zod (lihat bagian Skema). CHECK constraint DB dilepas.

<!-- MARKER:STATUS-MODEL -->
## Derivasi status order dari item (otomatis)

Fungsi murni `deriveOrderStatus(items)` di `status-produksi.ts` — mudah dites, tanpa efek samping.

Input: daftar status semua item dalam satu order. Aturan (urut prioritas):
1. Abaikan item `DIBATALKAN` saat menilai "selesai/jalan" (item batal bukan penghalang).
2. Kalau **tidak ada** item non-batal (semua item dibatalkan) → **DIBATALKAN**.
3. Kalau **semua** item non-batal `SELESAI` → **SELESAI**.
4. Kalau **ada minimal satu** item non-batal yang sudah bergerak dari `MENUNGGU` (PRINTING, FINISHING, PESAN_KURIR, TUNGGU_KURIR, SEDANG_DIKIRIM, DIKERJAKAN_VENDOR, SEDANG_DIAMBIL, SIAP_AMBIL, BAHAN_HABIS, TUNGGU_KONFIRMASI, atau sebagian SELESAI) → **PROSES**.
5. Selain itu (semua item non-batal masih `MENUNGGU`) → **MENUNGGU**.

### Kapan derivasi jalan
Setiap kali status item berubah lewat `updateProductionItemStatus`, sistem menghitung `deriveOrderStatus` lalu:
- Hitung `derived = deriveOrderStatus(items setelah perubahan)`.
- Jika `order.status_override_manual` **false** → simpan `order.status = derived`.
- Jika `status_override_manual` **true**:
  - Jika `derived === order.status` (derivasi kembali selaras) → matikan override (`status_override_manual = false`) dan biarkan status (sudah sama). **Ini mekanisme reset-otomatis.**
  - Jika `derived !== order.status` → biarkan status order apa adanya (hormati override), jangan ditimpa.

### Override manual menyala
Saat operator mengubah dropdown status order secara manual (selain lewat cascade SELESAI):
- `order.status = pilihan`, `status_override_manual = true`.
- Tidak ada cascade ke item (kecuali SELESAI — lihat bagian berikutnya).

<!-- MARKER:DERIVASI -->
## Cascade balik (order → item) saat SELESAI manual

Saat operator memilih status **order = SELESAI** manual:

1. Tampilkan `DialogKonfirmasi` (tema sukses/hijau): "Tandai semua item produksi sebagai Selesai?".
2. Pada konfirmasi, untuk tiap item non-terminal:
   - Item yang **bisa** diselesaikan → set `SELESAI` (lewat jalur `updateProductionItemStatus` yang sama, menghormati aturan roll).
   - Item **terhalang** (roll `roll_inventory_status === "PENDING"` tanpa konsumsi POSTED) → **dilewati**, dikumpulkan ke daftar "tidak bisa diselesaikan".
3. Setelah cascade, hitung ulang `deriveOrderStatus`:
   - Jika semua item non-batal kini `SELESAI` → order `SELESAI`, `status_override_manual = false` (sudah selaras dengan derivasi).
   - Jika masih ada item terhalang → order jatuh ke `PROSES` (bukan SELESAI palsu), tampilkan pesan: "Item berikut belum bisa diselesaikan karena bahan roll belum dikonfirmasi: [daftar nama]. Konfirmasi bahannya dulu di item tersebut."

Status order lain:
- **MENUNGGU / PROSES** manual → set status + `status_override_manual = true`, tanpa cascade.
- **DIBATALKAN** manual → set status order saja, **tanpa cascade** ke item; item dibatalkan manual per item bila perlu. (Terkait guard void-sale Supabase `20260524060000` yang membaca status produksi — tidak terdampak karena kita tidak mengubah perilaku void.)

### Implementasi
Logika cascade ada di server (service `production-service.ts`) lewat fungsi baru, mis. `setOrderStatusSelesaiCascade(orderId)` yang mengembalikan ringkasan `{ selesai: string[], terhalang: { id, nama }[], statusOrderAkhir }`. Modal menampilkan ringkasan itu. Ini menjaga aturan roll tetap satu sumber (tidak menduplikasi cek di klien).

<!-- MARKER:CASCADE -->
## Nama pelanggan terhubung (SPK ↔ POS)

### Di modal SPK
Bagian "Pelanggan" yang sekarang teks statis menjadi bisa diedit, pola seperti POS:
- Pemicu (klik nama / tombol "Ubah Nama") membuka input pencarian berbasis `PilihanCari` (komponen a11y yang sudah ada).
- Operator bisa: **ketik nama bebas** → `penjualan.pelanggan_nama_snapshot`, kosongkan `pelanggan_id`; atau **pilih dari daftar pelanggan terdaftar** → set `penjualan.pelanggan_id`, kosongkan snapshot.
- **Tanpa quick-add** pelanggan baru di SPK (kalau perlu pelanggan permanen, lewat halaman Pelanggan/POS).

### Server action baru
`updateSaleCustomerAction(penjualanId, { pelanggan_id?: string | null, pelanggan_nama_snapshot?: string | null })`:
- Auth guard `requireSession` (minimal) — derive identitas dari guard, bukan klien.
- Validasi Zod: tepat salah satu dari `pelanggan_id` ATAU `pelanggan_nama_snapshot` terisi (yang lain di-null-kan).
- Tulis ke tabel `penjualan`. Pakai `friendlyPgError`.
- SPK tahu `penjualan_id` dari `order_produksi.penjualan_id`.

### Sinkronisasi dua arah
Karena nama yang tampil di SPK maupun faktur sama-sama bersumber dari kolom `penjualan` (`pelanggan_id` → join nama, atau `pelanggan_nama_snapshot`), menyimpan dari satu sisi otomatis terlihat di sisi lain saat dimuat ulang.

Sisi kasir (`src/components/TabelRiwayatPenjualan.tsx`): prompt nama/kota saat cetak faktur yang sekarang **print-only** diubah agar **ikut menyimpan** ke `penjualan` via `updateSaleCustomerAction` (nama → snapshot bila tidak terdaftar). `kota` tetap dipakai untuk cetak; bila ingin disimpan, masuk ke `pelanggan_kota` (opsional, additif — tidak wajib di fase ini).

### Konsistensi cache
Setelah simpan nama, bust cache `"production-orders"` dan cache Riwayat Penjualan via `useInvalidate`, agar kedua halaman langsung sinkron tanpa refresh manual.

<!-- MARKER:NAMA -->
## Perubahan skema & migrasi

Ikut iron rule schema — tiga tempat sinkron untuk setiap perubahan kolom.

### 1. Kolom baru `order_produksi.status_override_manual`
- Tipe: `INTEGER` 0/1 di SQLite, `boolean` di Postgres, default `0`/`false`.
- (a) Migrasi Supabase baru additif: `ALTER TABLE order_produksi ADD COLUMN IF NOT EXISTS status_override_manual boolean NOT NULL DEFAULT false;`
- (b) Template fresh-install `database/sqlite-schema.sql` (kolom + default).
- (c) Runtime `ALTER TABLE order_produksi ADD COLUMN status_override_manual INTEGER NOT NULL DEFAULT 0` di `src/lib/db-sqlite-migrations.ts` (idempoten, untuk install lama).
- Kolom ikut sync otomatis (tabel sudah punya kolom sync; bukan tabel baru → tidak perlu update `sync-config.ts`).

### 2. Lepas CHECK constraint status
- `item_produksi.status` dan `order_produksi.status`.
- **Supabase:** migrasi `ALTER TABLE ... DROP CONSTRAINT <nama_check>` (cari nama constraint aktual di migrasi awal `20260425120000_initial_schema.sql`).
- **SQLite:** rebuild tabel `item_produksi` tanpa CHECK pada `status` (SQLite tak bisa drop CHECK langsung): buat tabel baru, copy data, swap. Karena ada FK dari `item_finishing` & `production_material_consumptions` ke `item_produksi`, rebuild dibungkus transaksi dengan `PRAGMA foreign_keys=OFF` saat swap lalu `ON` kembali. `order_produksi.status` boleh dibiarkan apa adanya bila nilainya tidak berubah (MENUNGGU/PROSES/SELESAI/DIBATALKAN tetap), tapi disarankan ikut dilonggarkan untuk konsistensi bila murah.
- Template `database/sqlite-schema.sql`: hapus `CHECK(...)` pada kolom status item (dan order bila dilonggarkan).

### 3. Validasi Zod
- `src/lib/schemas/produksi.ts` baru: enum status item (gabungan cetak ∪ maklon) + enum status order, diturunkan dari konstanta `status-produksi.ts`. Dipakai di server action + REST route (`/api/produksi/[id]`, `/api/produksi/items/[itemId]`). `safeParse` → 422 saat gagal.

### 4. Auth guard (rapikan sekalian)
- `updateProductionStatusAction`, `updateProductionItemStatusAction`, dan action cascade baru: tambah `requireProductionInventoryRole` (atau `requireSession` minimal). Pass `session.uid` sebagai operator/`dibuat_oleh` jika relevan.
- `updateSaleCustomerAction`: `requireSession`.

### 5. Kolom nama pelanggan
Tidak ada kolom baru — `pelanggan_id` & `pelanggan_nama_snapshot` sudah ada di `penjualan`.

### 6. Backfill
Nilai status lama (`PRINTING`, `FINISHING`, `MENUNGGU`, `SELESAI`, `DIBATALKAN`, `PROSES`) tetap valid di daftar baru → tidak perlu migrasi data nilai.

<!-- MARKER:SKEMA -->
## Verifikasi (mandatory)

Sesuai iron rule 10:
- `npm run type-check` → 0 error.
- `npm run build` → sukses.
- Jest (project `node`):
  - `deriveOrderStatus` — kombinasi: semua MENUNGGU → MENUNGGU; ada satu PRINTING → PROSES; semua SELESAI → SELESAI; 1 DIBATALKAN + sisanya SELESAI → SELESAI; semua DIBATALKAN → DIBATALKAN; ada BAHAN_HABIS → PROSES.
  - reset-otomatis override: derivasi cocok → `status_override_manual` mati.
  - hormati override: derivasi beda + override aktif → status order tak ditimpa.
  - cascade SELESAI dengan item roll `PENDING` → item terhalang dilewati, order jatuh ke PROSES, daftar terhalang benar.
  - `updateSaleCustomerAction` — ketik bebas menulis `pelanggan_nama_snapshot` + null `pelanggan_id`; pilih terdaftar sebaliknya.
  - `labelStatus` — tidak pernah mengembalikan string ber-underscore.
- Uji manual browser (localhost): buat SPK → gerakkan item → order ikut otomatis; override manual lalu buat item selaras → override reset; order=SELESAI dengan item terhalang → pesan benar; isi nama di SPK → cek faktur kasir terisi sama; isi nama di prompt cetak kasir → cek SPK ikut update.

## Urutan implementasi (bertahap dalam satu spec)

1. Konstanta `status-produksi.ts` + Zod schema + unit test `deriveOrderStatus`/`labelStatus`.
2. Migrasi skema: `status_override_manual` (3 tempat) + lepas CHECK (Supabase DROP, SQLite rebuild) + template.
3. Service: derivasi saat item berubah, override reset-otomatis, `setOrderStatusSelesaiCascade`. Auth guard pada action.
4. UI modal SPK: dropdown per jenis item (label ramah manusia), badge warna, dialog cascade SELESAI.
5. Nama pelanggan: `updateSaleCustomerAction` + UI editor nama di SPK + ubah prompt cetak kasir agar menyimpan + invalidasi cache dua arah.
6. Verifikasi penuh (type-check, build, jest, uji manual).

## Berkas yang tersentuh (perkiraan)

- Baru: `src/lib/produksi/status-produksi.ts`, `src/lib/schemas/produksi.ts`, migrasi Supabase baru, test di `src/lib/__tests__/`.
- Ubah: `src/lib/services/production-service.ts`, `src/app/produksi/spk/actions.ts`, `src/app/produksi/spk/components/SpkDetailModal.tsx`, `src/app/produksi/spk/components/spk-status.ts`, `src/app/produksi/spk/page.tsx`, `src/app/api/produksi/[id]/route.ts`, `src/app/api/produksi/items/[itemId]/route.ts`, `src/components/TabelRiwayatPenjualan.tsx`, `database/sqlite-schema.sql`, `src/lib/db-sqlite-migrations.ts`.

<!-- MARKER:VERIFIKASI -->
