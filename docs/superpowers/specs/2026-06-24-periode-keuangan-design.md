# Desain: Periode Keuangan Berbasis `periode_id`

**Tanggal**: 2026-06-24  
**Status**: Disetujui — siap untuk implementasi

---

## Latar Belakang & Masalah

Halaman Keuangan saat ini memfilter cashbook list dan menghitung kartu summary (Omzet, Biaya, Laba Bersih) berdasarkan **bulan kalender berjalan** (`getCurrentMonthRangeJakarta()`). Ini menimbulkan dua masalah:

1. **Summary tidak reset saat tutup periode** — kartu Omzet & Total Biaya menggunakan running total kumulatif dari `transaksi_terhitung` tanpa filter periode, sehingga nilainya tidak nol setelah tutup periode.
2. **Cashbook list berbasis kalender, bukan periode bisnis** — periode bisa ditutup tanggal 28 (libur akhir bulan) atau baru ditutup awal bulan berikutnya. Filter kalender tidak mencerminkan realita bisnis ini.

**Data saat ini**: 48 transaksi di `keuangan`, semua bertanggal Mei 2026, tidak terlihat di halaman Keuangan karena filter menampilkan Juni. `accounting_periods` masih kosong.

---

## Keputusan Desain

Adopsi **Pendekatan B — periode sebagai first-class citizen**: setiap baris `keuangan` di-tag ke satu `accounting_periods` via FK `periode_id`. Semua filter halaman Keuangan berbasis `periode_id`, bukan rentang tanggal kalender.

---

## Skema & Perubahan Data

### Kolom baru: `keuangan.periode_id`

```sql
ALTER TABLE keuangan ADD COLUMN periode_id UUID REFERENCES accounting_periods(id);
```

- Nullable (data lama dibackfill, bukan NULL selamanya)
- Setiap transaksi baru auto-assign ke periode OPEN saat dibuat
- Tiga tempat wajib sync: migrasi Supabase, `database/sqlite-schema.sql`, runtime ALTER di `db-unified.ts`

### Tidak ada perubahan pada `accounting_periods`

Tabel sudah memiliki semua yang dibutuhkan: `id`, `period_key` (YYYY-MM), `start_date`, `end_date`, `status` (OPEN/CLOSED), `closed_at`.

---

## Backfill Data Mei 2026

Dijalankan otomatis dalam migrasi Supabase (dan script onetime):

1. Buat baris `accounting_periods` untuk Mei 2026 (`period_key = '2026-05'`, status `OPEN`)
2. `UPDATE keuangan SET periode_id = <id_mei> WHERE tanggal BETWEEN '2026-05-01' AND '2026-05-31'`
3. Setelah migrasi selesai, owner tutup periode Mei via UI Pengaturan seperti biasa

---

## Siklus Hidup Periode (Otomatis)

```
Transaksi pertama masuk setelah close
    → sistem panggil getOrCreateOpenPeriod()
    → buat baris OPEN baru di accounting_periods (jika belum ada)
    → tag transaksi ke periode baru

Owner klik "Tutup Periode"
    → update status → CLOSED, isi closed_at
    → halaman Keuangan langsung tampil kosong (periode baru, belum ada transaksi)
```

Owner tidak perlu tahu soal `periode_id` — interaksi satu-satunya tetap tombol "Tutup Periode" yang sudah ada.

---

## Perubahan Tiap Komponen

### Cashbook list
- Ganti: `WHERE tanggal BETWEEN bulan_ini`
- Jadi: `WHERE periode_id = id_periode_aktif`
- Tambah label "Periode: Mei 2026" di header halaman Keuangan sebagai indikator

### Kartu Total Omzet & Total Biaya
- **Tidak lagi** mengambil dari running total `transaksi_terhitung`
- Dihitung via direct `SUM` dari `keuangan WHERE periode_id = id_periode_aktif`, dikelompokkan berdasarkan pemetaan kategori dari finance config
- Reset otomatis saat periode ditutup dan periode baru dibuka

### Kartu Saldo
- Tetap dari running total global `transaksi_terhitung` — uang di laci tidak hilang saat tutup buku

### Kartu Tagihan Vendor & Piutang Pelanggan
- Tidak berubah — sudah cross-period dengan benar (outstanding balance)

### RingkasanPengurus (Bagi Hasil)
- Formula AST evaluasi dengan variabel `omzet` dan `biaya` yang di-inject dari nilai period-scoped (bukan dari running total kumulatif)
- Nilai period-scoped dihitung dari agregasi `keuangan` yang sama dengan kartu summary

### Service layer: `getOrCreateOpenPeriod()`
- Helper baru di `accounting-periods-service.ts`
- Cari periode dengan status OPEN untuk bulan berjalan → kembalikan
- Jika tidak ada → buat baris baru OPEN → kembalikan
- Dipanggil oleh `createCashBookEntry()` setiap kali transaksi baru dibuat

---

## Dampak pada Flutter

**Tidak ada perubahan Flutter yang diperlukan untuk fase ini.**

- Flutter memanggil `/api/keuangan/cash-book` → API mengembalikan data period-scoped → Flutter otomatis menampilkan data yang benar
- Field `periode_id` baru di response JSON diabaikan oleh `CashBookEntry.fromJson()` (Dart ignore unknown fields)
- Model `cashbook.dart` tidak perlu diubah

---

## Dampak pada Modul Lain (POS, Pembelian, Retur, Kasbon)

Tidak ada. Semua modul ini memanggil `createCashBookEntry()` di `finance-service.ts`. Tag `periode_id` ditambahkan di dalam service tersebut, transparan bagi semua pemanggil.

---

## Out of Scope (untuk fase ini)

- Tampilan arsip per periode (lihat histori Maret, April, dst.) — sudah ada rute arsip, integrasi periode bisa dilakukan terpisah
- Kolom legacy per-baris `omzet`/`saldo`/`laba_bersih` di tabel `keuangan` (masih dipakai Flutter untuk display per-baris) — tidak diubah
- Perbandingan antar periode — fase selanjutnya

---

## Urutan Implementasi

| # | Task |
|---|------|
| 1 | Migrasi skema: kolom `periode_id` + backfill Mei 2026 (Supabase + SQLite + db-unified) |
| 2 | Service: `getOrCreateOpenPeriod()` + auto-tag di `createCashBookEntry()` |
| 3 | API cashbook: ganti filter kalender → filter `periode_id` |
| 4 | Kartu Omzet/Biaya: direct `SUM` dari `keuangan` per periode |
| 5 | RingkasanPengurus: inject nilai period-scoped ke formula evaluator |
| 6 | UI label: tampilkan "Periode: [nama periode]" di header halaman Keuangan |
