# Spec — UI Polish: Dark Mode, Tombol Simpan, Modal Ringkas, Font Struk 80mm

> Sub-proyek E dari sesi brainstorming 2026-07-07.
> Kumpulan perbaikan UI kecil-menasengah yang tidak punya dependensi cross-modul.

## Isu yang ditangani

| ID | Isu | Root cause |
|---|---|---|
| E1 | Modal Terima Piutang: ada box teks putih tidak cocok dark mode | `ModalBayarPiutang.tsx` — beberapa input/info-box missing `dark:` pair |
| E2 | Cek & perbaiki Bayar Hutang (kemungkinan issue serupa) | `ModalBayarHutang.tsx` — pola yang sama |
| E3 | Tombol "Parkir" di keranjang POS → ubah jadi "Simpan" | `KeranjangPOS.tsx:338` label "Parkir" |
| E4 | Modal edit barang terlalu panjang; hint terlalu bertele-tele | `PanelHargaSatuan.tsx` + `ModalTambahBarang.tsx` hint `text-base` (16px) + box "Contoh Penggunaan" verbose |
| E5 | Struk 80mm Penjualan & SPK tidak tampilkan font branded (Faktur A4 sudah benar) | `thermal-print.ts` & `spk-print.ts` pakai URL relatif font di popup `about:blank` → resolve gagal → fallback Arial. Pipeline Faktur A4 (`preparePrintHtml` → `embedPrintFontsAction` base64 + `<base href>`) belum dipakai. |

---

## E1 + E2 — Dark mode Modal Piutang & Hutang

### Audit `ModalBayarPiutang.tsx`

Ditemukan gap dark mode:
- Semua `<input>`/`<select>`/`<textarea>` form pembayaran pakai
  `border-gray-300` **tanpa** `dark:border-slate-700` → border terang di dark
  mode (kontras buruk).
- Info-box "Sisa Piutang" (`L349-366`): `bg-gradient-to-br from-cyan-50 to-blue-50`
  **tanpa** `dark:` pair → box tetap terang di dark mode.
- Tombol "Batal" footer (`L475`): `border-gray-300` tanpa `dark:border-slate-700`.

### Audit `ModalBayarHutang.tsx`

Struktur mirror `ModalBayarPiutang` (list hutang + form pembayaran). Audit
pola yang sama saat implementasi: cari `border-gray-300` tanpa `dark:border`,
`bg-white` tanpa `dark:bg`, gradient tanpa `dark:` pair, `text-gray-700` tanpa
`dark:text-slate-300`.

### Perbaikan

- Tambah `dark:border-slate-700` ke semua input/select/textarea border.
- Tambah `dark:from-slate-800 dark:to-slate-800` (atau `dark:bg-slate-800/60`)
  ke info-box gradient supaya konsisten dark.
- Audit semua `text-gray-*` → pasangkan `dark:text-slate-*` jika belum.
- Jangan ubah behavior/logika — mungkin kelas warna saja.

**Prinsip iron rule dark mode:** setiap kelas warna butuh pasangan `dark:`.

---

## E3 — Tombol "Parkir" → "Simpan"

### Lokasi
- `src/components/KeranjangPOS.tsx:317-340` — tombol dengan teks "Parkir"
  (`title="Parkir keranjang"`).
- `src/app/pos/ModalParkirKeranjang.tsx` — header "Parkir Keranjang"
  (L44) + tombol konfirmasi "Parkir" (L73).

### Perubahan
- `KeranjangPOS.tsx:338`: teks `Parkir` → `Simpan`. `title` (L323):
  `Parkir keranjang` → `Simpan keranjang`.
- `ModalParkirKeranjang.tsx:44`: `Parkir Keranjang` → `Simpan Keranjang`.
- `ModalParkirKeranjang.tsx:73`: `{saving ? "Menyimpan..." : "Parkir"}` →
  `{saving ? "Menyimpan..." : "Simpan"}`.
- `src/app/pos/page.tsx:885`: toast `"Keranjang diparkir"` →
  `"Keranjang disimpan"`.

**Tidak mengubah:** nama state `showParkirModal`, nama fungsi `handlePark`,
nama action `parkCartAction` (kode internal, tidak user-facing — renaming
churn tinggi tanpa nilai). Hanya label user-facing yang diubah.

---

## E4 — Modal edit barang lebih ringkas

### Lokasi
- `src/components/barang/PanelHargaSatuan.tsx` — hint `text-base` (16px)
  terlalu besar untuk teks bantu; box "Contoh Penggunaan" (L264-274) verbose.
- `src/components/ModalTambahBarang.tsx` — hint `text-base` di beberapa
  tempat (L665-669, L725-729, L879-883, L903-907).

### Perubahan

**1. Turunkan ukuran hint `text-base` → `text-xs` di seluruh hint bantuan**
   (bukan label, bukan value). Hint = paragraf abu-abu di bawah input yang
   menjelaskan, BUKAN label field. Label tetap `text-base`/`text-sm` sesuai
   eksisting.

Contoh di `PanelHargaSatuan.tsx:120`:
```
- Wajib unik per barang. Kosong = pakai nama satuan
+ Kosong = Nama Satuan
```
+ ubah `text-base` → `text-xs` pada `<p>`.

**2. Ringkas hint verbose menjadi satu baris pendek:**
- `PanelHargaSatuan.tsx:120`: "Wajib unik per barang. Kosong = pakai nama
  satuan" → "Kosong = Nama Satuan"
- `PanelHargaSatuan.tsx:145-149`: hint "Tidak ada? [tambah satuan]" tetap
  (interaktif) tapi `text-base` → `text-xs`.
- `PanelHargaSatuan.tsx:174-181`: "1 {satuan} = {faktor} {baseUnit}" tetap
  (dinamis, berguna) tapi `text-base` → `text-xs`.
- `PanelHargaSatuan.tsx:256-260`: "Setiap produk di bawah selalu muncul
  sebagai kartu terpisah di POS..." → "Produk di bawah selalu muncul di POS"
  + `text-base` → `text-xs`.
- `PanelHargaSatuan.tsx:264-274`: box "Contoh Penggunaan" → **jadikan
  `<details>` collapsed by default** (`<details className="..."><summary>Contoh
  penggunaan</summary>...isi...</details>`). Tidak dihapus (masih berguna
  untuk onboarding), tapi tidak memakan ruang default.

**3. `ModalTambahBarang.tsx`:**
- L665-669 hint dimensi: `text-base` → `text-xs`, ringkas kalimat.
- L725-729 info "Munculkan di POS / Track stok / Dimensi": `text-base` →
  `text-xs`, ringkas jadi bullet pendek (1 baris per poin maksimal).
- L879-883 / L903-907 hint stok & minimum: `text-base` → `text-xs`.

**4. Turunkan padding input di `PanelHargaSatuan` dari `py-2.5` → `py-2`**
   (hemat ~4px per row × 5 field × N produk jual). Tidak ubah `ModalTambahBarang`
   input padding (cukup di panel produk jual saja — itu yang ber-ulang per
   produk).

### Target
Tinggi modal edit barang dengan 1 produk jual turun ~15-20%. Dengan 3 produk
jualan turun lebih signifikan karena hint per-produk ber-ulang.

---

## E5 — Struk 80mm: embed font branded

### Root cause
`thermal-print.ts` (`generateThermalInvoice` L76-99) dan
`spk-print.ts` (`generateSPKHTML` L24-47) menyisipkan `@font-face` dengan
**URL relatif** `/assets/fonts/BAUHS93.ttf` dll. Saat cetak via
`window.open("", "_blank")` → popup `about:blank`, URL relatif tidak resolve
terhadap origin app → font branded gagal load → browser pakai fallback
`Arial`/sans-serif.

Faktur A4 (`faktur-print.ts:785-788`) sudah di-fix dengan pipeline:
1. `preparePrintHtml(html)` (`src/lib/print-embed-client.ts:4-12`) →
   panggil server action `embedPrintFontsAction`.
2. `embedPrintFontsAction` (`src/app/cetak/actions.ts:8-15`) →
   `embedGemiprintFontsInHtml` (`src/lib/print-fonts-server.ts:51-58`)
   baca file font dari disk (`fs.readFileSync`), embed sebagai
   `data:font/...;base64,...`, strip `@font-face` URL lama, sisipkan base64.
3. `openPrintDocument(html, title)` (`src/lib/print-fonts.ts:99-133`) →
   `injectPrintAssetOrigin` tambah `<base href="${origin}">` + absolutkan
   URL asset tersisa, lalu `printAfterAssetsReady` tunggu
   `doc.fonts.load('16px "Bauhaus 93"')` & `"TW Cen MT"` sebelum
   `window.print()`.

### Solusi
**Rutekan struk 80mm melalui pipeline yang sama.**

#### `thermal-print.ts` (struk Penjualan 80mm)
Ubah `printThermalInvoice` (L420-451):
```ts
// SEBELUM:
const win = window.open("", "_blank");
writeInvoiceToWindow(win, html);   // html = generateThermalInvoice(data)
// ... print lokal

// SESUDAH:
const html = generateThermalInvoice(data);
const prepared = await preparePrintHtml(html);   // embed base64 via server action
return openPrintDocument(prepared, "Cetak struk penjualan");
```

- Hapus inline `printAfterAssetsReady` lokal (L405-417) — pakai versi di
  `openPrintDocument`.
- Hapus iframe fallback (L429-448) — `openPrintDocument` sudah handle popup
  blocker dengan return value/feedback. (Kalau perlu retain iframe fallback,
  pindahkan ke dalam `openPrintDocument` — tapi idealnya satu jalur.)
- `generateThermalInvoice` sendiri tetap menyisipkan `@font-face` URL relatif
  (akan di-strip & di-ganti base64 oleh `embedPrintFontsAction`).

#### `spk-print.ts` (struk SPK 80mm)
Ubah handler cetak di `src/app/produksi/spk/page.tsx:359-369`:
```ts
// SEBELUM:
const printWindow = window.open("", "_blank");
printWindow.document.write(generateSPKHTML(order));
// inline window.onload → window.print()

// SESUDAH:
const html = generateSPKHTML(order);
const prepared = await preparePrintHtml(html);
return openPrintDocument(prepared, "Cetak struk SPK");
```

- `generateSPKHTML` tetap punya `@font-face` URL relatif (akan di-strip &
  di-ganti oleh pipeline).
- Hapus inline `<script>window.onload → setTimeout → window.print()</script>`
  di akhir HTML (L269-279) — `openPrintDocument` → `printAfterAssetsReady`
  sudah handle timing tunggu font ready.

#### Konsistensi font
Pastikan nama font family di `@font-face` struk 80mm SAMA dengan yang
di-embed oleh `embedGemiprintFontsInHtml`. Cek `print-fonts-server.ts:8-48`
untuk daftar font yang di-embed (Bauhaus 93, TW Cen MT, varian). Kalau struk
80mm memakai nama family berbeda (mis. `'BAUHS93'` vs `'Bauhaus 93'`),
samakan supaya cocok dengan CSS base64.

### File yang diubah

| File | Perubahan |
|---|---|
| `src/lib/thermal-print.ts` | Rutekan `printThermalInvoice` via `preparePrintHtml` + `openPrintDocument`. Hapus inline print/iframe fallback. |
| `src/app/produksi/spk/components/spk-print.ts` | Ekspor `generateSPKHTML` tetap; hapus inline `<script>window.print()</script>`. |
| `src/app/produksi/spk/page.tsx` (L359-369, `handlePrintSPK`) | Rutekan via `preparePrintHtml` + `openPrintDocument`. |

Tidak mengubah `preparePrintHtml` / `embedPrintFontsAction` /
`openPrintDocument` / `print-fonts-server.ts` (sudah benar — dipakai Faktur A4).

### Error handling
- `preparePrintHtml` throw → catch di caller, tampilkan toast "Gagal
  menyiapkan dokumen untuk dicetak" (sudah ada pola ini di
  `processCheckout` L1377-1380).
- Popup diblokir browser → `openPrintDocument` return null/throw → toast
  "Izinkan pop-up untuk situs ini" (pola sudah ada L1358-1361).

### Testing
- Manual: cetak struk Penjualan 80mm + struk SPK 80mm, verifikasi font
  branded (Bauhaus 93 / TW Cen MT) tampil di print preview, BUKAN Arial.
- Bandingkan dengan Faktur A4 (harus identik dalam hal font).
- Test di Chrome + Firefox (Firefox punya jeda 150ms di
  `printAfterAssetsReady` untuk zen compatibility).

---

## 6. Out of scope

- Mengubah library cetak (tidak ada — tetap HTML + `window.print`).
- Menambah font branded baru.
- Redesign layout struk 80mm.
- Redesign layout modal Piutang/Hutang (hanya fix dark mode kelas).
- Mengubah nama state/fungsi "parkir" di kode (hanya label user-facing).