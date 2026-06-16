# Desain — Keuangan Mobile (Flutter)

## Ringkasan

Membangun ulang halaman **Keuangan** di Flutter mobile/mobile-web dengan UI modern
Material 3, dua kartu ringkasan, dan dua tab: **Buku Kas** dan **Kasbon**.
Semua kalkulasi datang dari API (server-side), bukan diketik manual di Flutter.

---

## Keputusan Desain (disetujui owner)

### 1. Struktur Halaman

- Satu halaman Keuangan (route `/finance`, sudah ada)
- **Tidak ada header "Keuangan"** — mobile tidak pakai header halaman
- Dua kartu ringkasan di atas (scrollable bersama konten)
- Tab switcher Material 3 (indikator garis bawah): **Buku Kas** | **Kasbon**

### 2. Kartu Ringkasan

Dua kartu dengan border-left berwarna:

**Kartu Bisnis** (indigo `#4F46E5`):
| Posisi | Metrik | Sumber |
|--------|--------|--------|
| Hero (besar) | **Saldo** | `systemMetrics.saldo` |
| Sub — teks | Omzet | `systemMetrics.omzet` |
| Sub — teks | Biaya | `systemMetrics.biaya_operasional + biaya_bahan` |
| Sub — teks | Hutang | API baru (lihat bawah) |
| Sub — teks | Piutang | API baru (lihat bawah) |

**Kartu Kas & Penggajian** (amber `#F59E0B`):
| Posisi | Metrik | Sumber |
|--------|--------|--------|
| Hero (besar) | **Kas** | `systemMetrics.kas` |
| Sub — teks | Modal Kas | `systemMetrics.modal_kas` |
| Sub — teks | Saldo Kasbon | `systemMetrics.saldo_kasbon` |

**Gaya kartu:** menggunakan ulang `_summaryCard` (gradient) dan `_miniSummaryCard`
(background terang + border) dari halaman Keuangan existing.

- **Saldo** → `_summaryCard` gradient indigo, lebar penuh
- **Kas** → `_summaryCard` gradient amber, lebar penuh
- **Sub-metrik** (Omzet, Biaya, Hutang, Piutang, Modal Kas, Saldo Kasbon) → `_miniSummaryCard`
  dengan warna sesuai domain: hijau=Omzet/Piutang, kuning=Biaya, merah=Hutang/Kasbon,
  biru=Modal Kas

### 3. Gaya Visual

- **Referensi:** `customers_page.dart`
- **Header halaman:** tidak ada (mengikuti pola halaman mobile lain)
- **Kartu Saldo/Kas:** gradient `_summaryCard` (indigo/amber), rounded 12px
- **Kartu sub-metrik:** `_miniSummaryCard` border + background terang
- **Tab switcher:** Material 3 `TabBar` dengan indikator garis bawah
- **Avatar inisial:** lingkaran 40px, 2 huruf pertama dari `keperluan`, gradien indigo
- **Badge kategori:** label kecil berwarna di samping tanggal
  - KAS → biru (`#DBEAFE` / `#2563EB`)
  - BIAYA → kuning (`#FEF3C7` / `#D97706`)
  - OMZET → hijau (`#D1FAE5` / `#059669`)
  - dst.
- **Jumlah:** merah (`#EF4444`) untuk debit, hijau (`#10B981`) untuk kredit
- **Baris non-deletable:** badge `🔗POS` / `🔗Pembelian` + ikon kunci (Material `Icons.lock_outline`)
- **Ikon:** Material Icons saja, **tidak boleh emoji**
- **FAB:** `+` saja, warna brand `#00AFEF`

### 4. Tab Buku Kas

- **Tambah Transaksi:** bottom sheet form (tanggal, kategori dropdown dari API, debit/kredit, keperluan, catatan)
- **List:** search + filter kategori (horizontal FilterChip)
- **Delete:** hanya untuk baris dengan `dapat_dihapus = true` (manual, tidak ada source link)
- **Tidak ada edit** di mobile

### 5. Tab Kasbon

- **Daftar karyawan:** dari `GET /api/penggajian/ringkasan-kasbon`
  - Tiap baris: avatar inisial, nama, role, sisa kasbon (merah jika > 0, hijau "Lunas" jika 0)
  - Search karyawan
  - Stat chips: Total Kasbon + Jumlah Karyawan
- **Tap karyawan → Detail Sheet (bottom sheet):**
  - Avatar besar + nama + role + saldo kasbon
  - Dua tombol aksi: **Tarik Kasbon** (merah) / **Bayar Tunai** (hijau)
  - Riwayat transaksi kasbon karyawan tersebut
  - Tombol ↩ **Revert** di tiap baris riwayat

---

## API — Perubahan & Penambahan

### A. `GET /api/keuangan/cash-book` — tambah field `dapat_dihapus`

Setiap baris cashbook mendapat field boolean `dapat_dihapus`:
- `true` jika `reference_type` NULL / bukan dari POS, pembelian, atau kasbon
- `false` jika dari POS (`reference_type = 'SALE'`), pembelian (`PURCHASE`), atau kasbon (`PINJAMAN_KARYAWAN`)
- Server yang menentukan, bukan client

### B. `DELETE /api/keuangan/cash-book/[id]` — periksa ulang `dapat_dihapus`

Sebelum menghapus, server memeriksa apakah baris benar-benar manual.
Jika tidak, tolak dengan 403.

### C. `GET /api/penggajian/ringkasan-kasbon` — BARU

Mengembalikan daftar karyawan aktif + saldo kasbon masing-masing.
Menggunakan `hitungSaldoPinjamanBatch` (sudah ada, sudah batched).

Response:
```json
{
  "karyawan": [
    {
      "actor_id": "...",
      "nama": "Andi Setiawan",
      "role": "Staf Produksi",
      "role_label": "Staf Produksi",
      "saldo_pinjaman": 600000
    }
  ],
  "total_kasbon": 1250000,
  "jumlah_karyawan": 4
}
```

### D. `GET /api/keuangan/ringkasan-hutang-piutang` — BARU

Mengembalikan total hutang (dari `hutang` table) dan piutang (dari `piutang` table).

Response:
```json
{
  "hutang": { "total": 3800000, "jumlah": 3 },
  "piutang": { "total": 2100000, "jumlah": 5 }
}
```

Alternatif: tambahkan langsung ke `systemMetrics` di `GET /api/keuangan/cash-book`.
**Keputusan:** endpoint terpisah agar ringan (cash-book tidak perlu hitung hutang/piutang
setiap kali dimuat). Flutter memanggil paralel.

---

## Model Flutter — Perubahan

### Model Baru

```dart
// flutter/lib/models/ringkasan_kasbon.dart
class RingkasanKasbon {
  final List<KaryawanKasbon> karyawan;
  final double totalKasbon;
  final int jumlahKaryawan;
}

class KaryawanKasbon {
  final String actorId;
  final String nama;
  final String role;
  final String roleLabel;
  final double saldoPinjaman;
}

// flutter/lib/models/ringkasan_hutang_piutang.dart
class RingkasanHutangPiutang {
  final HutangPiutangInfo hutang;
  final HutangPiutangInfo piutang;
}

class HutangPiutangInfo {
  final double total;
  final int jumlah;
}
```

### CashBookEntry — tambah field

```dart
// tambah di flutter/lib/models/cashbook.dart
final bool dapatDihapus;
```

---

## Service Flutter — Perubahan

`flutter/lib/services/finance_service.dart` — tambah method:
- `Future<RingkasanKasbon> getRingkasanKasbon()` → panggil `/api/penggajian/ringkasan-kasbon`
- `Future<RingkasanHutangPiutang> getRingkasanHutangPiutang()` → panggil `/api/keuangan/ringkasan-hutang-piutang`

---

## Perbaikan Halaman Existing

### 1. Hapus tombol di empty state

Di halaman berikut, hapus tombol `+ Tambah X` dari widget `EmptyState`:
- `flutter/lib/features/customers/customers_page.dart`
- `flutter/lib/features/vendors/vendors_page.dart` (verifikasi)
- `flutter/lib/features/barang/barang_page.dart` (verifikasi)
- `flutter/lib/features/pembelian/pembelian_page.dart` (verifikasi)

### 2. Unifikasi warna FAB

Semua `FloatingActionButton` di halaman mobile pakai warna brand `#00AFEF`:
- `customers_page.dart`
- `vendors_page.dart`
- `barang_page.dart`
- `pembelian_page.dart`
- `finance_page.dart` (baru)

### 3. FAB Pembelian: teks "+ Beli" → "+"

### 4. FAB Keuangan: cukup "+"

---

## Yang TIDAK Masuk Mobile (v1)

- Rumus / AST engine
- Manajemen kolom/kategori keuangan
- Kompensasi / Gaji
- Edit transaksi
- Form tambah karyawan (pakai web app)

---

## Verifikasi

- `npm run type-check` + `npm run build` untuk semua perubahan API
- `flutter analyze` untuk Flutter
- Test Jest untuk route API baru
