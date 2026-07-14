# Redesign POS — Pilih Barang & Keranjang (Overlay Penuh)

**Tanggal:** 2026-07-15
**Status:** Disetujui (menunggu review spec)
**Cakupan:** UI/UX halaman POS (`src/app/pos/page.tsx`) + komponen keranjang. **Tanpa** perubahan logika bisnis (checkout, kompensasi, roll/AVCO, PPN/NSFP, parkir, riwayat).

## Masalah

Pada monitor FHD:

1. **"Pilih Barang" terpotong ke bawah.** Grid produk dan form edit barang ditata **bertumpuk** (atas-bawah). Saat sebuah produk dipilih, form edit muncul di bawah grid dan terdorong keluar viewport, sehingga kasir harus scroll untuk melihat semua opsi input (satuan/harga, jumlah, ukuran roll, dsb.). Input jadi kurang intuitif.
2. **Keranjang: banyak item, sedikit terlihat.** Panel keranjang di kolom kanan (`col-span-1`) menyimpan daftar item **dan** seluruh panel pembayaran (metode bayar, jumlah dibayar, denominasi, kembalian, catatan, cetak, tombol Proses). Panel pembayaran selalu tampil dan memakan ruang vertikal besar, sehingga dari 5 item di keranjang hanya ~1 yang terlihat; kasir harus scroll di dalam panel untuk melihat isi keranjang.

## Tujuan

- Manfaatkan **seluruh lebar halaman** untuk area kerja (Pilih Barang) dengan memindahkan detail keranjang + pembayaran ke **overlay penuh** yang dibuka saat mau bayar.
- Di layar utama, keranjang diwakili **bar ringkas** (jumlah item, total, tombol Simpan/Tersimpan/Bayar).
- Tata "Pilih Barang" jadi **dua kolom** (grid produk + form edit berdampingan) supaya form selalu terlihat tanpa scroll.
- Overlay keranjang menampilkan **banyak item sekaligus** (dua kolom: item kiri, pembayaran kanan).

## Non-Tujuan

- Tidak mengubah server action / logika checkout / kompensasi kegagalan / roll & AVCO / PPN & NSFP / parkir keranjang / riwayat penjualan.
- Tidak menambah toggle i18n baru.
- Tidak me-refactor kode yang tidak berkaitan dengan redesign ini.

## Keputusan Desain (hasil brainstorming)

| Topik | Keputusan |
| --- | --- |
| Pola keranjang | Overlay penuh saat checkout (Opsi A: refactor terarah) |
| Ringkasan di layar utama | Bar ringkas (item + total + tombol) |
| Tata "Pilih Barang" | Dua kolom: grid produk + form edit berdampingan |
| Trigger overlay | Manual via tombol "Lihat Keranjang / Bayar"; edit item juga membuka layar utama |
| Isi overlay | Dua kolom: daftar item (kiri) + pembayaran (kanan) |
| Elemen sekunder | Simpan/Tersimpan di bar ringkas; Lihat Faktur, PPN, Bulatkan di dalam overlay |
| Posisi bar ringkas | Sticky **bawah** area kerja (dapat diubah ke atas bila diminta) |

## Arsitektur

### Struktur `page.tsx`

- Hapus `grid grid-cols-1 lg:grid-cols-3`. Area kerja pakai lebar penuh (`space-y-4`).
- Root halaman tetap `<div className="space-y-6">` (bukan `<main>` kedua — shell sudah menyediakannya).
- Urutan: Pelanggan → Pilih Barang (dua kolom) → **BarRingkasKeranjang** (sticky bawah) → Riwayat Penjualan (tetap).
- Overlay & modal existing dirender di akhir (portal/fixed).

### Komponen baru

1. **`src/components/pos/BarRingkasKeranjang.tsx`**
   - Sticky (`sticky bottom-0`), kartu gradient brand tipis, dark-mode penuh, ikon SVG dari `src/components/icons` (bukan emoji).
   - Isi satu baris responsif: ikon keranjang · `{n} item` · `Total Rp …` (besar, brand) · tombol **Simpan** (parkir) · **Tersimpan (n)** (memakai `DropdownKeranjangTersimpan` yang ada) · tombol utama **Lihat Keranjang / Bayar** (buka overlay; disabled saat cart kosong).
   - Props: `cart` (untuk count + total), `total`, `onParkClick`, `parkedCarts`, `onLoadParked`, `onJadikanPenawaran`, `onDeleteParked`, `onOpenOverlay`.

2. **`src/components/pos/OverlayKeranjang.tsx`**
   - Fixed full-screen via `createPortal` ke `document.body`. Backdrop `bg-black/50`, klik backdrop menutup (`if (e.target === e.currentTarget)`), tombol X, ESC menutup, `useFocusTrap` (aturan proyek modal).
   - Panel `max-w-5xl w-full max-h-[90vh]`, rounded-2xl, header kartu gradient brand (Keranjang + jumlah item + Total besar).
   - Body `grid grid-cols-1 lg:grid-cols-2`:
     - **Kiri — daftar item** (scroll sendiri): seluruh baris item dari `KeranjangPOS` existing (nama, rincian dimensi/roll, harga, badge "Harga Ubah", finishing, biaya tambahan, tombol edit / rincian maklon / hapus). Kolom tinggi+lebar → 5 item terlihat sekaligus.
     - **Kanan — pembayaran** (sticky di panel): Bulatkan Rp1.000 (bila relevan), Lihat Faktur, Faktur Pajak (PPN), ringkasan subtotal + biaya tambahan, Metode Pembayaran, Jumlah Dibayar + Kilat, denominasi cepat, kembalian/kurang, Catatan, Cetak setelah transaksi, tombol besar **Proses Pembayaran**.
   - Tombol edit item → tutup overlay + set `editingCartIndex` (existing) + scroll ke `productFormRef` (existing) di layar utama.
   - Menerima **semua props** yang sekarang diterima `KeranjangPOS` + `open` + `onClose`.

3. **Retire `src/components/KeranjangPOS.tsx`**
   - Satu-satunya pemakai adalah `page.tsx`. Setelah `BarRingkasKeranjang` + `OverlayKeranjang` menggantikan perannya, `KeranjangPOS.tsx` dihapus.
   - Helper murni (`calculateChange`, `getItemBiayaTambahanTotal`, `getCartBiayaTambahanTotal`, `getCartItemNamaTampil`, `denominations`) dipindah ke `OverlayKeranjang.tsx` (atau helper bersama bila dipakai di dua tempat). Tipe `PrintType`, `BiayaTambahan`, `CartItem`-shape yang di-*export* dari `KeranjangPOS` harus tetap diekspor dari lokasi baru agar import lain (mis. `PrintType`) tidak putus.

### Perubahan "Pilih Barang" (dalam `page.tsx`)

- Header (judul + Filter + Tambah Item Lainnya + Populer) tetap. Baris kategori tetap.
- Body jadi `grid grid-cols-1 lg:grid-cols-2 gap-4`:
  - Kiri: grid produk (`grid-cols-2` di dalamnya), tinggi dinaikkan (mis. `max-h-[calc(100vh-380px)]` dengan minimum wajar), **tidak menyusut** saat produk dipilih.
  - Kanan: form edit barang terpilih (semua field existing dipindah apa adanya). Empty state saat belum ada produk dipilih.
- Responsif: di layar sempit kembali `grid-cols-1` (mobile-web aman).

### State (di `page.tsx`)

- Tambah `const [showOverlayKeranjang, setShowOverlayKeranjang] = useState(false)`.
- `handleCheckout` sukses → `setShowOverlayKeranjang(false)` (selain reset yang sudah ada).
- Edit item dari overlay → `setEditingCartIndex(index)` + `setShowOverlayKeranjang(false)` + scroll ke `productFormRef`.
- Semua state & handler lain (cart, paymentMethod, jumlahBayar, catatan, prioritas, printType, roundCartPrices, PPN, parkir) **tetap** — hanya di-*wire* ke komponen baru.

## Aturan Proyek yang Dipatuhi

- Root `<div className="space-y-6">`, gradient title card sudah ada (POS / KASIR), dark-mode pair di semua elemen baru, token dark valid.
- Ikon: komponen SVG dari `src/components/icons` — **tanpa emoji**.
- Modal/overlay: ESC, backdrop dismiss, tombol X, focus trap (`useFocusTrap`), aksi utama kanan dengan warna brand.
- Combobox/dropdown (pencarian pelanggan/barang existing) tidak diubah perilakunya.
- Stabilkan array SWR dengan `useMemo` bila memindah derivasi.

## Verifikasi

- `npm run type-check` (0 error) → `npm run build`.
- Perubahan UI-only (tanpa sentuh service/logika). Ada `src/app/pos/__tests__/` — jalankan test yang relevan bila komponen keranjang tersentuh; perbaiki lint warning baru.
- Cek manual di FHD: (a) form Pilih Barang terlihat berdampingan tanpa scroll saat produk dipilih; (b) overlay keranjang menampilkan ≥5 item tanpa scroll berlebih; (c) alur checkout, parkir, PPN, cetak tetap berfungsi.

## Risiko & Mitigasi

- **Pemindahan JSX besar dari `KeranjangPOS.tsx`.** Mitigasi: pindah apa adanya, petakan props satu per satu, jaga tipe yang diekspor.
- **Import `PrintType`/tipe lain putus.** Mitigasi: re-export tipe dari lokasi baru; grep pemakai sebelum menghapus file lama.
- **Sticky bottom bar menutupi konten.** Mitigasi: beri padding bawah pada area kerja setinggi bar.

## Yang TIDAK Berubah

Server action, logika checkout/kompensasi, roll/AVCO, PPN/NSFP, parkir keranjang, riwayat penjualan, komponen pencarian pelanggan/barang, modal existing (Tambah Item Lainnya, Rincian Internal Maklon, Parkir, Faktur Umum, Bayar Piutang).
