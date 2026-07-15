# Halaman Piutang — Daftar per Pelanggan + Pembayaran Lump-Sum

**Tanggal:** 2026-07-16
**Status:** Disetujui (langsung ke writing-plans, tanpa gate review per instruksi owner)
**Cakupan:** Halaman baru `/piutang` di bawah menu Penjualan + query agregat + orkestrator pembayaran lump-sum. Menyentuh uang/piutang (aturan besi #4, #7, #14, #15, #16).

## Masalah

Belum ada halaman khusus untuk mengelola piutang penjualan. Piutang hanya bisa dibayar lewat `ModalBayarPiutang` di POS (per-tagihan). Owner butuh:
1. Melihat piutang **dikelompokkan per pelanggan** — total piutang tiap pelanggan (mis. total Pak Didi) sekaligus rincian per penjualan/tagihan.
2. Membayar **lump-sum/custom** — mis. Pak Didi punya 4 tagihan (50rb, 100rb, 200rb, 300rb) lalu transfer 400rb. Owner ingin input satu angka 400rb yang otomatis dialokasikan ke tagihan-tagihannya, tanpa membuka & melunasi satu per satu.
3. Mengisi **nama pelanggan** untuk penjualan yang belum bernama (walk-in), dan nama itu sinkron ke Riwayat Penjualan + SPK (backward-compatible seperti SPK).

## Tujuan

- Halaman `/piutang` menampilkan daftar piutang per pelanggan (expandable) + total keseluruhan.
- Pembayaran lump-sum dengan alokasi otomatis **FIFO** (tagihan tertua dulu).
- Isi/ubah nama pelanggan untuk penjualan walk-in, sinkron ke seluruh aplikasi.
- Revert pembayaran (per-penjualan) tersedia di halaman ini.

## Non-Tujuan

- Tidak menyimpan "uang lebih" bila lump-sum melebihi total piutang (hanya info kelebihan, tidak jadi saldo/deposit).
- Tidak mengubah alur pembuatan piutang di `createSale`.
- Tidak mengganti `ModalBayarPiutang` di POS (tetap dipakai untuk pembayaran per-tagihan di sana).
- Tidak menambah tabel DB baru (reuse `piutang_penjualan` + `pelunasan_piutang`).

## Keputusan Desain (hasil brainstorming)

| Topik | Keputusan |
| --- | --- |
| Alokasi lump-sum | FIFO otomatis (tagihan tertua dulu) |
| Tampilan halaman | Dikelompokkan per pelanggan, expandable |
| Walk-in (tanpa pelanggan_id) | Dikelompokkan per nama snapshot; bisa diisi nama → sinkron ke Riwayat & SPK |
| Pencatatan keuangan | Reuse `payReceivable` per tagihan (token `[REF:id_penjualan]` per tagihan) |
| Field input | Jumlah + metode + tanggal + catatan |
| Closed-period | Tolak bila tanggal masuk periode tertutup |
| Role | Staf lihat (FULL_STAFF); bayar/revert `requireAdminOrManager`; revert per-penjualan |
| Pendekatan | Opsi A: reuse maksimal, lapisan tipis baru |

## Arsitektur

### Data layer (reuse existing)

Tabel tidak berubah: `piutang_penjualan` (flat per-tagihan, pelanggan via join ke `penjualan.pelanggan_id`/`pelanggan_nama_snapshot`) + `pelunasan_piutang`. Fungsi existing yang di-reuse:
- `getReceivables()` (`src/lib/services/pos-queries.ts:787`) → `Receivable[]` ter-enrich.
- `payReceivable(data)` (`src/lib/services/pos-mutations.ts:1502`) → pembayaran satu tagihan (insert `pelunasan_piutang`, update `piutang_penjualan`, `createFinanceEntry` token `[REF:id_penjualan]`, recalc cashbook).
- `revertSalePayment({ sale_id, dibuat_oleh })` (`src/lib/services/pos-mutations.ts:1644`).
- `updateSaleCustomer(penjualanId, { pelanggan_id?, pelanggan_nama_snapshot? })` (`src/lib/services/production-service.ts:1463`) → dipakai SPK & Riwayat Penjualan.

### Query agregat (baru — `src/lib/services/pos-queries.ts`)

```ts
export interface ReceivableGroup {
  customerKey: string;      // pelanggan_id | `nama:${snapshotLower}` | "__tanpa_nama__"
  pelanggan_id: string | null;
  pelanggan_nama: string;   // nama tampilan
  is_walk_in: boolean;      // true bila tanpa pelanggan_id terdaftar
  total_sisa: number;
  jumlah_tagihan: number;
  tagihan: Receivable[];    // urut FIFO (dibuat_pada asc)
}

export async function getReceivablesByCustomer(): Promise<ReceivableGroup[]>;
```

- Panggil `getReceivables()`, kelompokkan in-memory per kunci: `pelanggan_id` bila ada; walk-in pakai `nama:${namaSnapshot.trim().toLowerCase()}`; nama kosong → `"__tanpa_nama__"`.
- `total_sisa` = Σ `sisa_piutang` grup; `jumlah_tagihan` = jumlah baris; `tagihan` diurutkan `dibuat_pada` asc (FIFO).
- Urutan grup: `total_sisa` desc.
- Read-only, tanpa auth guard.

### Orkestrator lump-sum (baru — `src/lib/services/pos-mutations.ts`)

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
}>;
```

Alur:
1. Validasi `jumlah_bayar > 0`. Ambil baris `piutang_penjualan` untuk `tagihan_ids`, saring `status ∈ {AKTIF, SEBAGIAN}` & `sisa_piutang > 0`.
2. Closed-period guard (#7): cek `tanggal_bayar` via `isDateInClosedPeriod` di awal; tolak dgn error ramah bila tertutup.
3. Urutkan FIFO server-side (`dibuat_pada` asc) — tidak percaya urutan klien.
4. Alokasi: `sisa = jumlah_bayar`; per tagihan `bayar = min(sisa, tagihan.sisa_piutang)`; bila `bayar > 0` panggil `payReceivable({ piutang_id, jumlah_bayar: bayar, ... })`; kurangi `sisa`; stop bila habis.
5. Kelebihan: bila `sisa > 0` setelah semua lunas → kembalikan sebagai `sisa_uang` (tidak disimpan).
6. Return ringkasan `alokasi`.

Atomisitas: tiap `payReceivable` best-effort (konsisten pola existing). Kegagalan di tengah → yang sukses tetap tercatat; return melaporkan alokasi berhasil. Token `[REF:id_penjualan]` per tagihan tetap ada → void/revert per-penjualan jalan.

### Zod schema (baru — `src/lib/schemas/`)

```ts
export const payReceivableLumpSumSchema = z.object({
  tagihan_ids: z.array(z.string().min(1)).min(1),
  jumlah_bayar: finiteNumber.positive(),
  tanggal_bayar: z.string().optional(),
  metode_pembayaran: z.string().optional(),
  referensi: z.string().nullable().optional(),
  catatan: z.string().nullable().optional(),
  dibuat_oleh: z.string().nullable().optional(),
}).passthrough();
```

### Server actions (baru — `src/app/piutang/actions.ts`)

- `getPiutangGroupedAction()` → `getReceivablesByCustomer()` (read, tanpa guard).
- `bayarPiutangLumpSumAction(input)` → `requireAdminOrManager()`; `safeParse` `payReceivableLumpSumSchema` (422 ramah bila gagal); `payReceivableLumpSum({ ...input, dibuat_oleh: s.uid })`. Catch `AuthGuardError` → return `.status`.
- `bayarPiutangSatuAction(input)` → `requireAdminOrManager()`; `payReceivable({ ...input, dibuat_oleh: s.uid })` (untuk pembayaran satu tagihan dari rincian).
- `revertPiutangAction({ sale_id })` → `requireAdminOrManager()`; `revertSalePayment({ sale_id, dibuat_oleh: s.uid })`.
- `isiNamaPelangganAction({ penjualan_id, pelanggan_id?, pelanggan_nama_snapshot? })` → `requireAdminOrManager()`; `updateSaleCustomer(penjualan_id, {...})`.

Aturan besi #14: guard + `dibuat_oleh` dari `session.uid`, tangani `AuthGuardError`. Surface DB error via `friendlyPgError` (#16) di action mutasi.

### UI (baru)

**`src/app/piutang/page.tsx`** (client):
- Root `<div className="space-y-6">`; gradient title card `from-emerald-500 to-teal-600` + ikon SVG dari `PageIcons`.
- `useCachedData<ReceivableGroup[]>("piutang-grouped", getPiutangGroupedAction)`; `const grup = useMemo(() => data ?? [], [data])`.
- Ringkasan atas: total piutang keseluruhan + jumlah pelanggan berpiutang.
- Filter: cari nama pelanggan (+ opsional status).
- Daftar per pelanggan expandable: nama (+ badge "Umum" bila walk-in), total, jumlah tagihan, tombol Bayar + expand. Expand → rincian tiap tagihan (faktur, tanggal, total, terbayar, sisa, status) + tombol Revert (per-penjualan) + tombol Isi Nama (untuk walk-in tanpa nama).
- Dark-mode pair; ikon SVG; badge putih shade solid.
- Bust cache via `useInvalidate("piutang-grouped")` setelah mutasi.

**`src/app/piutang/ModalBayarLumpSum.tsx`** (pakai `ModalFormShell` + `useFocusTrap`):
- Header emerald. Judul "Bayar Piutang — {nama}".
- Daftar tagihan grup (urut FIFO, read-only) + total.
- Form: Jumlah Dibayar (tombol cepat "Lunas Semua" = total grup), Metode (CASH/TRANSFER/QRIS/DEBIT), Tanggal (default hari ini), Catatan.
- Pratinjau alokasi FIFO live saat user ketik jumlah + peringatan kelebihan.
- Submit → `bayarPiutangLumpSumAction` → toast + invalidate cache + tutup. Disabled state "Memproses...".

**`src/app/piutang/ModalIsiNamaPelanggan.tsx`** (atau inline): pilih pelanggan terdaftar (`PilihanCari`) atau ketik nama bebas → `isiNamaPelangganAction`.

**`src/app/piutang/error.tsx`**: client boundary, pesan Bahasa Indonesia + "Coba Lagi".

**`src/components/menuConfig.tsx`**: tambah item `/piutang` "Piutang" di grup Penjualan (ikon `DebtIcon`/`MoneyIcon`, role `FULL_STAFF`) + `PAGE_TITLE_MAP["/piutang"] = "Piutang"`.

## Aturan Proyek yang Dipatuhi

- #1 Fetch data → `useCachedData` (SWR), cache key stabil, `useInvalidate`.
- #4 Money mutation → reuse `payReceivable` (token `[REF:id_penjualan]`); revert lewat `revertSalePayment`.
- #7 Closed-period guard pada mutasi bertanggal.
- #14 Setiap mutasi ber-guard (`requireAdminOrManager`), `dibuat_oleh` dari session, tangani `AuthGuardError`.
- #15 Validasi input hot-path dengan Zod (`safeParse` → 422).
- #16 Surface DB error via `friendlyPgError`.
- UI: root `space-y-6`, gradient title card, dark-mode pair, ikon SVG (bukan emoji), modal pakai `ModalFormShell`/`useFocusTrap`, `error.tsx`, `useMemo` stabilkan array SWR.

## Verifikasi & Testing

- `npm run type-check` (0 error) → `npm run build`.
- Jest (project node):
  - `getReceivablesByCustomer`: grouping per pelanggan_id, walk-in per nama snapshot, `__tanpa_nama__`, urutan tagihan FIFO, `total_sisa` benar.
  - `payReceivableLumpSum`: alokasi FIFO (contoh 400rb → 50/100/200 lunas + 50 ke tagihan 300); kelebihan uang → `sisa_uang`; closed-period → tolak; hanya tagihan AKTIF/SEBAGIAN diproses.
- Manual: Pak Didi 4 tagihan → bayar 400rb lump-sum → cek alokasi, saldo piutang, entri keuangan per tagihan; isi nama walk-in → cek muncul di Riwayat Penjualan & SPK; revert → piutang kembali.

## Risiko & Mitigasi

- **Non-atomik (beberapa payReceivable).** Mitigasi: reuse fungsi teruji + best-effort seperti existing; return laporkan alokasi berhasil; token [REF] per tagihan menjaga revert.
- **Kunci walk-in salah gabung.** Mitigasi: normalisasi nama (trim+lowercase); nama kosong → grup khusus; owner bisa isi nama untuk merapikan.
- **`payReceivableAction` POS tanpa guard.** Mitigasi: halaman Piutang pakai action ber-guard sendiri, tidak reuse action POS.
- **Double-submit.** Mitigasi: disabled state modal saat async.

## Yang TIDAK Berubah

Tabel DB, alur `createSale`/pembuatan piutang, `ModalBayarPiutang` POS, `getReceivables`/`payReceivable`/`revertSalePayment`/`updateSaleCustomer` (dipakai apa adanya).
