# Redesain Dashboard Beranda — Design Spec

**Tanggal:** 2026-06-16
**Status:** Disetujui (siap masuk plan)

## Tujuan

Mendesain ulang tata letak dashboard beranda (`src/app/beranda/page.tsx`) agar
mengikuti pola visual referensi "SMART POS" (stat card gradien, blok analitik +
donut, baris daftar bawah), sambil tetap mempertahankan warna brand gemiprint
sebagai dominan dan light/dark mode penuh di setiap elemen. Menambahkan satu
baris aksi cepat (quick action) yang seluruh tombolnya mengarah ke halaman nyata
yang sudah ada — tanpa tombol placeholder.

## Ruang lingkup

- **Satu file utama berubah:** `src/app/beranda/page.tsx` (tata letak + komponen
  presentasi baru di file yang sama, mengikuti pola file ini sekarang yang sudah
  memuat `StatCard`, `SalesTrendChart`, `ReorderWidget`).
- **`src/app/beranda/actions.ts`:** tidak ada perubahan kontrak data. Donut
  memakai ulang `dailySalesTrend` yang sudah dihitung. (Jika nilai "kemarin"
  perlu eksplisit, dihitung di klien dari `dailySalesTrend`, bukan fetch baru.)
- **Cache key tidak berubah:** `dashboard-stats-v2`, `dashboard-reorder-v1`.
- **Tidak ada perubahan skema DB, tidak ada migrasi, tidak ada perubahan API.**

Ini murni reorganisasi visual/tata letak ditambah satu baris quick action dan
satu donut baru. Bukan perubahan data.

## Keputusan desain (hasil brainstorm)

1. **Warna:** Pendekatan "hybrid" — adopsi tata letak referensi, tetapi pakai
   gradien brand gemiprint (cyan→biru, emerald, amber→oranye, pink→navy). Warna
   brand dominan. Light + dark mode wajib di setiap elemen (`dark:` pair).
2. **Dua blok bawah:** Opsi 1 — **Penjualan Hari Ini** (list → `/pos`) +
   **Produksi Aktif** (tabel → `/produksi`). Memakai ulang data yang sudah
   di-load. Widget baru lain bisa ditambah belakangan.
3. **Quick action:** ditempatkan tepat di bawah header strip, sebagai pita
   sendiri dengan ruang napas (bukan menempel ke stat card). 4 tombol:
   **Kasir** (`/pos`), **Pembelian** (`/pembelian`), **Keuangan** (`/keuangan`),
   **Pelanggan** (`/pelanggan`). Role-aware via `canAccessPath`.

## Tata letak (atas ke bawah)

```
┌─────────────────────────────────────────────────────────────┐
│ Header strip — sapaan kiri, logo gemiprint kanan (ramping)    │
├─────────────────────────────────────────────────────────────┤
│ Quick Actions — Kasir · Pembelian · Keuangan · Pelanggan      │
│ (role-aware; mobile = grid 2x2)                               │
├───────────────┬───────────────┬───────────────┬──────────────┤
│ Omzet Hari    │ Transaksi     │ Saldo Kas     │ Piutang Aktif │
│ Ini (gradien) │ Hari Ini      │ (gradien)     │ (gradien)     │
├───────────────┴───────────────┴───────────┬───┴──────────────┤
│ Sales Analytics (lebar)                    │ Donut Omzet      │
│ Tren Penjualan + toggle 7/14/30            │ hari ini vs      │
│                                            │ kemarin + %      │
├────────────────────────────┬───────────────┴──────────────────┤
│ Penjualan Hari Ini → /pos  │ Produksi Aktif → /produksi        │
├────────────────────────────┴───────────────────────────────────┤
│ Widget Reorder / Saran Pembelian (tidak berubah)                │
├─────────────────────────────────────────────────────────────────┤
│ Footer                                                            │
└─────────────────────────────────────────────────────────────────┘
```

## Rincian komponen

### 1. Header strip (`DashboardHeader`)
Menggantikan welcome card tinggi sekarang dengan pita gradien ramping
(`bg-gradient-to-r from-[#00afef] to-[#2266ff]`, `rounded-2xl`, padding lebih
kecil dari sekarang). Kiri: sapaan "Selamat Datang, {nama}!" + subjudul brand.
Kanan: logo `logo-gemiprint-white.svg` (kecil, opacity rendah, `hidden md:block`).
Tujuan: hemat ruang vertikal agar quick action + stat card naik ke atas.

### 2. Quick Actions (`QuickActions`)
Baris kartu aksi. Tiap tombol: ikon SVG (komponen yang sudah ada) + label, di
atas kartu yang me-link ke route nyata. Definisi statis:

| Label | href | Ikon (komponen ada) |
|---|---|---|
| Kasir | `/pos` | `CartIcon` |
| Pembelian | `/pembelian` | `PurchaseOrderIcon` |
| Keuangan | `/keuangan` | `MoneyIcon` |
| Pelanggan | `/pelanggan` | `UsersIcon` |

- **Role-aware:** filter dengan `canAccessPath(user.role, href)` dari
  `@/components/menuConfig`. Tombol yang tidak diizinkan untuk role pengguna
  tidak dirender (tidak ada tombol mati). Jika hasil filter kosong, seluruh baris
  tidak dirender.
- **Layout:** `grid grid-cols-2 md:grid-cols-4 gap-3`. Mobile = 2x2.
- **Gaya:** kartu `bg-white dark:bg-slate-900/40` dengan ikon pada patch gradien
  brand (`bg-gradient-to-br ... text-white`), hover halus. Bukan emoji.
- Memakai `next/link` untuk navigasi (sudah diimpor di file).

### 3. Stat cards (`StatCard` — revisi gaya jadi gradien)
4 kartu gradien "punchy" (mirip referensi) menggantikan kartu putih+chip ikon
sekarang. Nilai sama persis dari `stats`:

| Judul | Nilai | Gradien brand |
|---|---|---|
| Omzet Hari Ini | `fmtCurrency(stats.todayRevenue)` | cyan→biru |
| Transaksi Hari Ini | `stats.todaySalesCount` | emerald |
| Saldo Kas | `fmtCurrency(stats.saldo)` | amber→oranye |
| Piutang Aktif | `fmtCurrency(stats.totalPiutang)` (sub: `${activePiutang} transaksi`) | pink→navy |

- Teks putih di atas gradien. Ikon pada patch `bg-white/20 rounded-lg`
  `text-white` (sesuai aturan UI: ikon stat-card tidak sewarna gradien).
- Dark mode: gradien tetap, pastikan kontras teks aman.
- `StatCard` lama (varian putih) di-refactor menjadi varian gradien; tanda
  tangan prop disesuaikan (lihat catatan tipe di plan). Pemakaian "Produksi"
  lama (Antrian Aktif / Kilat / Saldo Kas) digantikan: Saldo Kas pindah ke baris
  stat utama; Antrian Aktif & Kilat tetap ditampilkan tapi sebagai bagian
  konteks Produksi Aktif (badge di tabel) — TIDAK hilang.

> Catatan: data `activeOrders` dan `kilat` tetap dipakai. Antrian Aktif & Kilat
> ditampilkan sebagai ringkasan kecil di header blok "Produksi Aktif"
> (mis. "Antrian: N · Kilat: M"), sehingga tidak ada metrik yang hilang dari
> dashboard lama.

### 4. Sales Analytics + Donut (baris 2 kolom)
- **Kiri (lebih lebar, `lg:col-span-2`):** blok "Tren Penjualan" yang sudah ada —
  `SalesTrendChart` + toggle 7/14/30 hari. Tidak berubah secara fungsional, hanya
  ikut grid baru.
- **Kanan (lebih sempit, `lg:col-span-1`):** donut baru (`RevenueDonut`).
  Menampilkan omzet hari ini sebagai persentase dari omzet kemarin.
  - "hari ini" = elemen terakhir `dailySalesTrend`.
  - "kemarin" = elemen kedua-terakhir `dailySalesTrend`.
  - persen = `kemarin > 0 ? round(hariIni / kemarin * 100) : (hariIni > 0 ? 100 : 0)`.
  - Tampilkan angka hari ini & kemarin berlabel di bawah donut.
  - Render pakai recharts (sudah dependensi) — `PieChart` + `Pie` dengan dua
    segmen (terisi vs sisa) atau `RadialBarChart`. Pilih `RadialBarChart` untuk
    tampilan donut progres yang bersih.
  - Warna brand: arc terisi `#00afef`, track `#e5e7eb` (light) /
    `#1e293b` (dark).

### 5. Penjualan Hari Ini + Produksi Aktif (baris 2 kolom)
Memakai data `stats.recentSales` dan `stats.recentOrders` yang sudah ada. Gaya
di-refresh agar selaras tata letak baru (kartu + list/tabel), tetapi konten,
link "Lihat Semua" (`/pos`, `/produksi`), `StatusBadge`, dan format waktu/uang
tidak berubah. Header "Produksi Aktif" menambahkan ringkasan
"Antrian: {activeOrders} · Kilat: {kilat}".

### 6. Widget Reorder (`ReorderWidget`)
Tidak berubah. Tetap di bawah baris daftar.

### 7. Footer
Tidak berubah.

## Penanganan error & loading
- State loading existing dipertahankan: spinner saat `isLoading && !stats`.
- Header strip + quick action dirender di luar guard `stats` (tidak tergantung
  data dashboard), sehingga pengguna langsung bisa menekan aksi cepat meski
  statistik masih dimuat. Quick action hanya butuh `user` (role) dari sesi.
- Jika `dailySalesTrend` kosong/0, donut menampilkan 0% dengan aman (tanpa
  pembagian nol).

## Pengujian / verifikasi
Perubahan UI-only (tanpa perubahan service/skema), jadi mengikuti aturan proyek:
- `npm run type-check` → 0 error.
- `npm run build` → sukses.
- Jest boleh dilewati untuk UI-only, tetapi jika ada test komponen yang
  menyentuh beranda harus tetap hijau.
- Verifikasi manual di browser: light + dark mode, mobile (grid 2x2 quick action),
  semua link mengarah ke halaman benar, donut menampilkan persentase masuk akal,
  role rendah (mis. kasir) tidak melihat tombol di luar aksesnya.
- Tidak ada warning lint baru.

## Hal di luar ruang lingkup (bisa nanti)
- Widget "Top Pelanggan" (perlu kalkulasi baru di action).
- Tabel "Revenue History" gaya referensi (kolom payouts/status/action).
- Perubahan data/aksi server apa pun.
