# Spesifikasi: Fitur Cetak Laporan Manajemen Bulanan

**Tanggal:** 2026-06-24  
**Status:** Draft — menunggu persetujuan implementasi  
**Kategori:** Fitur baru — Halaman Laporan

---

## Latar Belakang

gemiprint adalah PT yang berinteraksi dengan perusahaan besar sebagai klien. Manajemen membutuhkan dokumen laporan bulanan yang bisa dicetak atau disimpan sebagai PDF — format resmi yang layak diserahkan ke klien, bank, atau auditor bila diminta.

Halaman Laporan saat ini sudah memiliki 5 jenis laporan (Kas, Laba Rugi, Persediaan, Margin Penjualan, Hutang & Piutang) yang ditampilkan di layar, tetapi belum ada fitur untuk mencetak laporan ringkasan bulanan sebagai dokumen resmi.

---

## Tujuan

Menambahkan fitur **"Laporan Manajemen Bulanan"** yang:

1. Dipicu dari halaman Laporan yang sudah ada (`/laporan`)
2. Terikat pada **Periode Akuntansi yang sudah ditutup** (bukan tanggal bebas)
3. Menghasilkan dokumen HTML bergaya konsisten dengan faktur Gemiprint (portrait A4)
4. Bisa dicetak via dialog print browser atau diunduh sebagai PDF
5. Memiliki kata pembuka dan penutup yang bisa diedit sebelum cetak

---

## Struktur Dokumen yang Dicetak

### Halaman 1 — Ringkasan Eksekutif

#### Kop Surat
- Logo SVG Gemiprint (sama persis dengan faktur)
- Wordmark: **"gemi"** `#00AFEF` + **"print"** `#0a1b3d` — font **Bauhaus 93 Italic**, ukuran 29pt
- Slogan: "Digital Printing & Advertising" — font TW Cen MT, 9pt, warna `#555`
- Alamat, telepon, email dari tabel `pengaturan_toko`
- Garis pemisah bawah `2px solid #0a1b3d` (persis seperti faktur)

#### Identitas Dokumen
- **Judul:** "LAPORAN MANAJEMEN BULANAN" — TW Cen MT Bold, uppercase, tracking wide
- **Periode:** nama bulan + tahun (contoh: "Juni 2026"), dari `accounting_periods.nama_periode`
- **Nomor Laporan:** format `LPR/[YYYY]/[MM]/[XXX]` — sequential per bulan, tersimpan di tabel baru `laporan_bulanan`

#### Kata Pembuka
Teks paragraf standar yang bisa diedit pengguna sebelum generate:

> Dengan hormat,
>
> Bersama laporan ini kami sampaikan ringkasan kinerja keuangan dan operasional [nama_toko] untuk periode [nama_periode]. Laporan ini disusun berdasarkan data transaksi yang telah diverifikasi oleh manajemen.

#### Tabel Ringkasan KPI

| No | Uraian | Nilai |
|---|---|---|
| 1 | Omzet Penjualan | Rp X.XXX.XXX (N faktur) |
| 2 | Harga Pokok Penjualan (HPP) | Rp X.XXX.XXX |
| 3 | Laba Kotor | Rp X.XXX.XXX (margin XX%) |
| 4 | Biaya Operasional | Rp X.XXX.XXX |
| 5 | Total Gaji Dibayar | Rp X.XXX.XXX |
| 6 | Laba Bersih | Rp X.XXX.XXX (net margin XX%) |
| 7 | Total Pembelian | Rp X.XXX.XXX (N pesanan) |
| 8 | Nilai Inventori Akhir Periode | Rp X.XXX.XXX |

#### Tabel Status Hutang & Piutang

| Uraian | Jumlah Dokumen | Total Outstanding |
|---|---|---|
| Piutang Pelanggan (belum lunas) | N faktur | Rp X.XXX.XXX |
| Hutang Vendor (belum lunas) | N tagihan | Rp X.XXX.XXX |

> **Catatan:** Ini adalah posisi saldo outstanding per **akhir** periode akuntansi, bukan akumulasi selama periode berjalan.

#### Kata Penutup
Teks paragraf standar yang bisa diedit:

> Demikian laporan ini kami sampaikan. Atas perhatian dan kepercayaan Anda, kami ucapkan terima kasih.

#### Kolom Tanda Tangan

```
Bekasi, [tanggal akhir periode]

Direktur,                              Manajer,


________________________               ________________________
[nama_direktur dari tabel pegawai]     [nama_manajer dari tabel pegawai]
```

Nama diambil dari tabel `pegawai` berdasarkan `role_code`:
- Direktur: pegawai dengan `role_code` mengandung kata "direktur" (case-insensitive)
- Manajer: pegawai dengan `role_code` mengandung kata "manajer" atau "manager"
- Bila tidak ada: tampilkan placeholder `(________________________)`

---

### Halaman 2+ — Riwayat Buku Kas

Header ringkas di setiap halaman (nama toko, periode, nomor laporan).

Tabel lengkap semua baris `keuangan` dalam periode, diurutkan tanggal:

| Tanggal | Kategori | Keterangan | Debit | Kredit | Saldo |
|---|---|---|---|---|---|

Di akhir tabel: baris **SALDO AKHIR** tebal.

---

## Sumber Data

| Data | Tabel Sumber | Filter |
|---|---|---|
| Info periode | `accounting_periods` | `id = [periode_dipilih]` |
| Omzet + jumlah faktur | `penjualan` | `tanggal BETWEEN start AND end`, `void = 0` |
| HPP, laba kotor, laba bersih | `item_penjualan` join `barang` (HPP AVCO snapshot) | dalam periode |
| Biaya operasional | `keuangan` | kategori bukan PENJUALAN/HPP, dalam periode |
| Total gaji | `keuangan` | `kategori_transaksi = 'GAJI'`, dalam periode |
| Total pembelian | `pembelian` | dalam periode |
| Piutang outstanding | `piutang_penjualan` | `sisa_piutang > 0` per akhir periode |
| Hutang outstanding | `hutang_pembelian` | `sisa_hutang > 0` per akhir periode |
| Nilai inventori | `barang` | `jumlah_stok * harga_pokok_rata2` (snapshot saat generate) |
| Nama TTD | `pegawai` | `role_code ILIKE '%direktur%'` / `'%manajer%'` |
| Info toko | `pengaturan_toko` | `id = 'default'` |
| Buku kas rincian | `keuangan` | dalam periode, ORDER BY tanggal ASC |

---

## Skema Database Baru

### Tabel `laporan_bulanan`

Menyimpan nomor laporan yang sudah di-generate agar sequential:

```sql
CREATE TABLE IF NOT EXISTS laporan_bulanan (
  id TEXT PRIMARY KEY,
  nomor_laporan TEXT NOT NULL UNIQUE,  -- format LPR/YYYY/MM/XXX
  accounting_period_id TEXT NOT NULL REFERENCES accounting_periods(id),
  dibuat_oleh TEXT NOT NULL,
  dibuat_pada TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  kata_pembuka TEXT,
  kata_penutup TEXT,
  -- kolom sync standar
  sync_status TEXT NOT NULL DEFAULT 'pending',
  last_synced_at TIMESTAMP,
  sync_version INTEGER NOT NULL DEFAULT 0,
  updated_at_server TIMESTAMP,
  updated_by_device TEXT,
  change_version INTEGER NOT NULL DEFAULT 0,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TIMESTAMP,
  client_mutation_id TEXT
);
```

Nomor laporan: hitung `COUNT(*) + 1` untuk kombinasi `YYYY/MM` yang sama, format 3 digit zero-padded.

---

## Komponen UI Baru

### Di `src/app/laporan/page.tsx`

Tambahkan tab/card baru "Laporan Bulanan" di samping 5 card laporan yang sudah ada. Warna tema: indigo.

### `src/app/laporan/ModalLaporanBulanan.tsx` (baru)

Modal `ModalFormShell` yang muncul setelah user memilih periode:

1. **Pilih Periode:** dropdown berisi accounting periods yang statusnya `CLOSED`
2. **Kata Pembuka:** `<textarea>` pre-filled teks standar, bisa diedit
3. **Kata Penutup:** `<textarea>` pre-filled teks standar, bisa diedit
4. **Tombol "Pratinjau":** buka `PratinjauFakturMengambang` orientation=portrait
5. **Tombol "Cetak":** `window.print()` dari popup
6. **Tombol "Unduh PDF":** pakai `html2pdf.js` (library client-side, tidak perlu server)

### `src/lib/laporan-bulanan-print.ts` (baru)

Generator HTML mirip `faktur-print.ts`:
- Fungsi `generateLaporanBulananHTML(data: LaporanBulananData): string`
- A4 portrait, margin 12mm
- Font Bauhaus 93 + TW Cen MT (sama dengan faktur)
- Watermark logo tipis di tengah halaman (sama dengan faktur)
- CSS `@page { size: A4 portrait; }`
- CSS print: `page-break-after: always` setelah halaman 1

### `src/app/laporan/actions.ts` (tambah fungsi)

- `generateLaporanBulananAction(params)`: fetch semua data dari DB, return HTML string
- `getLaporanBulananListAction()`: daftar laporan yang pernah digenerate
- `getClosedAccountingPeriodsAction()`: ambil periode yang statusnya CLOSED

---

## Tampilan di Layar (Preview)

Pakai `PratinjauFakturMengambang` yang sudah ada, dengan `orientation="portrait"`.

---

## Keamanan & Validasi

- Hanya `admin` dan `manager` yang bisa generate laporan (sesuai akses halaman Laporan saat ini)
- Periode yang dipilih harus berstatus `CLOSED` — validasi di server action
- Input kata pembuka/penutup: escape HTML sebelum render

---

## Library Baru

- `html2pdf.js` — client-side PDF generation. Install: `npm install html2pdf.js`
- Atau alternatif: `jspdf` + `html2canvas` — lebih kontrol tapi lebih berat
- **Pilihan rekomendasi:** `html2pdf.js` karena API-nya sangat simpel untuk use-case ini

---

## Asumsi Desain

1. Kata pembuka/penutup yang diedit **tidak disimpan permanen** sebagai template — setiap kali buka modal, teks standar akan terisi ulang. Kalau ingin simpan, perlu fitur terpisah.
2. Nilai inventori adalah **snapshot saat laporan digenerate**, bukan snapshot saat periode ditutup — karena tidak ada mekanisme snapshot stok otomatis saat period close.
3. Nomor laporan `LPR/YYYY/MM/XXX` tersimpan di tabel `laporan_bulanan` untuk memastikan sequential dan tidak duplikat.
4. "Biaya Operasional" dihitung dari semua pengeluaran di `keuangan` dalam periode kecuali yang berkaitan langsung dengan HPP penjualan (kategori bukan `PENJUALAN`/`PENDAPATAN`) — mengikuti logika yang sudah ada di `getFormalAccountingReport`.
