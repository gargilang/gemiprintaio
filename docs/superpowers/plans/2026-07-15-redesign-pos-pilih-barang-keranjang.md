# Redesign POS — Pilih Barang & Keranjang (Overlay Penuh) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign halaman POS agar "Pilih Barang" memakai lebar penuh dua kolom (grid produk + form edit berdampingan) dan Keranjang menjadi bar ringkas + overlay penuh dua kolom (item kiri, pembayaran kanan), tanpa mengubah logika bisnis.

**Architecture:** Refactor terarah pada presentasi. `KeranjangPOS.tsx` (panel sticky kanan) dipecah menjadi `BarRingkasKeranjang.tsx` (ringkasan di layar utama) + `OverlayKeranjang.tsx` (detail + pembayaran dalam overlay portal). Layout `page.tsx` diubah dari grid 3 kolom menjadi lebar penuh; area "Pilih Barang" jadi dua kolom. Semua state, handler, server action, dan logika checkout/roll/PPN/parkir yang ada tetap dipakai — hanya di-*wire* ulang ke komponen baru.

**Tech Stack:** Next.js (App Router, client component), React, TypeScript, Tailwind CSS, `createPortal`, `useFocusTrap`.

**Spec:** `docs/superpowers/specs/2026-07-15-redesign-pos-pilih-barang-keranjang-design.md`

## Global Constraints

- Bahasa: UI strings, komentar/JSDoc baru → Bahasa Indonesia baku. Terms framework/props tetap Inggris.
- Ikon: WAJIB komponen SVG dari `src/components/icons/` — **DILARANG emoji sebagai ikon**.
- Dark mode WAJIB di setiap elemen: tiap kelas warna punya pasangan `dark:` (mis. `bg-white dark:bg-slate-900`). Hindari token invalid (mis. `dark:bg-slate-8000`).
- Page root tetap `<div className="space-y-6">`, BUKAN `<main>` kedua.
- Modal/overlay: ESC menutup, klik backdrop menutup (`if (e.target === e.currentTarget)`), tombol X di header, focus trap via `useFocusTrap(ref, isOpen)` (`src/components/useFocusTrap.ts`), aksi utama kanan warna brand.
- JANGAN ubah server action, logika checkout/kompensasi, roll/AVCO, PPN/NSFP, parkir keranjang, riwayat penjualan.
- Stabilkan array turunan dengan `useMemo` bila memindah derivasi.
- Verifikasi tiap task: `npm run type-check` (0 error). Verifikasi akhir: `npm run type-check` → `npm run build`. Perbaiki lint warning baru yang diperkenalkan.
- Warna brand: `#00afef` / `#2266ff`. Domain warna: emerald=barang/inventori, indigo=netral.

---

### Task 1: Buat `BarRingkasKeranjang.tsx` (ringkasan keranjang di layar utama)

Komponen presentasi murni: menampilkan jumlah item + total + tombol Simpan / Tersimpan / Lihat Keranjang. Belum dipasang ke `page.tsx` (Task 4).

**Files:**
- Create: `src/components/pos/BarRingkasKeranjang.tsx`

**Interfaces:**
- Consumes: `DropdownKeranjangTersimpan` dari `@/app/pos/DropdownKeranjangTersimpan`; tipe `ParkedCart` dari `@/lib/services/keranjang-tersimpan-service`.
- Produces:
  ```ts
  export interface BarRingkasKeranjangProps {
    itemCount: number;
    total: number;
    onOpenOverlay: () => void;
    onParkClick?: () => void;
    parkedCarts?: ParkedCart[];
    onLoadParked?: (id: string) => void;
    onJadikanPenawaran?: (id: string) => void;
    onDeleteParked?: (id: string) => void;
  }
  export default function BarRingkasKeranjang(props: BarRingkasKeranjangProps): JSX.Element;
  ```

- [ ] **Step 1: Tulis komponen**

Buat `src/components/pos/BarRingkasKeranjang.tsx`:

```tsx
"use client";

import DropdownKeranjangTersimpan from "@/app/pos/DropdownKeranjangTersimpan";
import type { ParkedCart } from "@/lib/services/keranjang-tersimpan-service";

export interface BarRingkasKeranjangProps {
  itemCount: number;
  total: number;
  onOpenOverlay: () => void;
  onParkClick?: () => void;
  parkedCarts?: ParkedCart[];
  onLoadParked?: (id: string) => void;
  onJadikanPenawaran?: (id: string) => void;
  onDeleteParked?: (id: string) => void;
}

/**
 * Bar ringkas keranjang yang menempel (sticky) di bawah area kerja POS.
 * Menampilkan jumlah item, total, dan aksi cepat: Simpan (parkir),
 * Tersimpan (dropdown), serta tombol utama untuk membuka overlay keranjang.
 */
export default function BarRingkasKeranjang({
  itemCount,
  total,
  onOpenOverlay,
  onParkClick,
  parkedCarts = [],
  onLoadParked,
  onJadikanPenawaran,
  onDeleteParked,
}: BarRingkasKeranjangProps) {
  const kosong = itemCount === 0;
  return (
    <div className="sticky bottom-0 z-30 -mx-1 px-1">
      <div className="flex items-center gap-3 rounded-2xl border-2 border-[#00afef]/30 bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-slate-800 dark:to-slate-900 shadow-lg px-4 py-3">
        <div className="bg-gradient-to-br from-[#00afef] to-[#0088cc] p-2 rounded-lg shadow-sm shrink-0">
          <svg
            className="w-5 h-5 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
        </div>

        <div className="min-w-0">
          <p className="text-sm text-gray-500 dark:text-slate-400 leading-tight">
            {itemCount} item
          </p>
          <p className="text-lg font-bold text-[#00afef] leading-tight">
            Rp {total.toLocaleString("id-ID")}
          </p>
        </div>

        <div className="flex items-center gap-2 ml-auto flex-wrap justify-end">
          {onParkClick && (
            <button
              type="button"
              onClick={onParkClick}
              disabled={kosong}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-sm font-semibold disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              title="Simpan keranjang"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                />
              </svg>
              Simpan
            </button>
          )}
          {onLoadParked && onJadikanPenawaran && onDeleteParked && (
            <DropdownKeranjangTersimpan
              parkedCarts={parkedCarts}
              onLoad={onLoadParked}
              onJadikanPenawaran={onJadikanPenawaran}
              onDelete={onDeleteParked}
            />
          )}
          <button
            type="button"
            onClick={onOpenOverlay}
            disabled={kosong}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-[#00afef] to-[#2266ff] text-white font-bold text-base hover:from-[#0099dd] hover:to-[#1955ee] transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            Lihat Keranjang / Bayar
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verifikasi type-check**

Run: `npm run type-check`
Expected: 0 error (komponen belum diimpor di mana pun; berdiri sendiri secara valid).

- [ ] **Step 3: Commit**

```bash
git add src/components/pos/BarRingkasKeranjang.tsx
git commit -m "feat(pos): tambah BarRingkasKeranjang untuk ringkasan keranjang di layar utama"
```

---

### Task 2: Buat `OverlayKeranjang.tsx` (pindahkan seluruh isi KeranjangPOS ke overlay dua kolom)

Salin **seluruh isi** `src/components/KeranjangPOS.tsx` menjadi `OverlayKeranjang.tsx`, lalu bungkus dalam kerangka overlay (backdrop + panel + focus trap) dan tata ulang body jadi dua kolom (item kiri, pembayaran kanan). Semua helper, tipe, dan JSX baris item + panel pembayaran dipindah **apa adanya**; hanya wadah luar yang berubah.

**Files:**
- Create: `src/components/pos/OverlayKeranjang.tsx` (basis: salinan `src/components/KeranjangPOS.tsx`)
- Reference (baca, jangan ubah): `src/components/KeranjangPOS.tsx`, `src/components/useFocusTrap.ts`

**Interfaces:**
- Consumes: semua util yang sudah dipakai `KeranjangPOS` (`previewNomorFakturAction`, `DropdownKeranjangTersimpan`, `ParkedCart`, ikon dari `./icons/ContentIcons` → sesuaikan path jadi `../icons/ContentIcons`, helper dari `@/lib/money-rounding`), plus `useFocusTrap` dari `@/components/useFocusTrap` dan `createPortal` dari `react-dom`.
- Produces:
  ```ts
  export type PrintType = "thermal" | "faktur" | "both" | "none";
  export interface BiayaTambahan { label: string; nominal: number; modal?: number; }
  // Props = SEMUA props POSCartProps yang ada di KeranjangPOS.tsx + dua tambahan:
  export interface OverlayKeranjangProps extends /* semua field POSCartProps lama */ {
    open: boolean;
    onClose: () => void;
  }
  export default function OverlayKeranjang(props: OverlayKeranjangProps): JSX.Element | null;
  ```

- [ ] **Step 1: Salin file sebagai basis**

Run:
```bash
cp src/components/KeranjangPOS.tsx src/components/pos/OverlayKeranjang.tsx
```

- [ ] **Step 2: Sesuaikan import path (naik satu level folder)**

Di `src/components/pos/OverlayKeranjang.tsx`, ubah import relatif yang sekarang menunjuk `./` (karena file pindah ke subfolder `pos/`) menjadi `../`:

```tsx
// SEBELUM (di KeranjangPOS.tsx):
import {
  CashIcon,
  TransferIcon,
  QRISIcon,
  CardIcon,
  CalendarIcon,
} from "./icons/ContentIcons";

// SESUDAH (di pos/OverlayKeranjang.tsx):
import {
  CashIcon,
  TransferIcon,
  QRISIcon,
  CardIcon,
  CalendarIcon,
} from "../icons/ContentIcons";
```

Tambahkan import berikut di bagian atas:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "@/components/useFocusTrap";
```

(Import `previewNomorFakturAction`, `DropdownKeranjangTersimpan`, `ParkedCart`, `@/lib/money-rounding` sudah absolut (`@/...`) — biarkan.)

- [ ] **Step 3: Ubah nama komponen + tipe props + tambah `open`/`onClose`**

Ganti nama fungsi `KeranjangPOS` → `OverlayKeranjang`. Rename `interface POSCartProps` → `interface OverlayKeranjangProps` dan tambahkan dua field:

```tsx
interface OverlayKeranjangProps {
  open: boolean;
  onClose: () => void;
  // ...semua field POSCartProps yang sudah ada, dibiarkan apa adanya...
}
```

Ubah signature:
```tsx
export default function OverlayKeranjang({
  open,
  onClose,
  cart,
  roundCartPrices,
  // ...sisa destructuring props yang sama persis seperti KeranjangPOS...
}: OverlayKeranjangProps) {
```

- [ ] **Step 4: Tambah early-return + focus trap + ESC**

Tepat sebelum `const totalRaw = ...` (perhitungan yang sudah ada), tambahkan ref + guard. Tetapi hooks harus dipanggil tanpa syarat, jadi letakkan `useRef`/`useFocusTrap`/`useEffect` di atas semua perhitungan, dan early-return `null` SETELAH semua hook:

```tsx
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
```

Pindahkan `useState`/`useMemo` yang sudah ada (`showChangeDetail`, `showNotes`, `lineCharges`, dll.) agar tetap di atas early-return. Lalu tambahkan setelah semua hook + perhitungan:

```tsx
  if (!open) return null;
```

- [ ] **Step 5: Ganti kerangka luar (root) jadi overlay portal dua kolom**

Ganti elemen root lama:
```tsx
// LAMA:
<div className="bg-gradient-to-br from-slate-50 to-gray-100 ... sticky top-6 flex flex-col max-h-[calc(100vh-5rem)] overflow-hidden">
  {/* header, rounding bar, item list, payment */}
</div>
```

menjadi struktur overlay berikut. **Bungkus seluruh return dengan `createPortal(..., document.body)`.** Header lama dipertahankan sebagai header panel. Body dibagi dua kolom: kiri = blok "Item list" lama, kanan = blok "Payment + checkout" lama. Baris "rounding + Lihat Faktur" lama masuk ke kolom kanan (atas).

```tsx
  return createPortal(
    <div
      className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Keranjang"
        className="w-full max-w-5xl max-h-[90vh] rounded-2xl bg-gradient-to-br from-slate-50 to-gray-100 dark:from-slate-900 dark:to-slate-900 shadow-2xl border-2 border-gray-200 dark:border-slate-800 flex flex-col overflow-hidden"
      >
        {/* ==== HEADER (pindahkan blok header lama ke sini, tambah tombol X) ==== */}
        <div className="shrink-0 flex items-center gap-2 px-5 pt-4 pb-3 border-b border-gray-200 dark:border-slate-800">
          {/* ...isi header lama (ikon + Keranjang + jumlah item + Simpan + Tersimpan + Total) ... */}
          <button
            type="button"
            onClick={onClose}
            className="ml-2 p-1.5 rounded-lg text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-800 transition-colors"
            aria-label="Tutup keranjang"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ==== BODY DUA KOLOM ==== */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2">
          {/* KIRI: daftar item (blok "Item list" lama, area scroll) */}
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2 border-b lg:border-b-0 lg:border-r border-gray-200 dark:border-slate-800">
            {/* ...pindahkan isi blok "Item list — only scrollable area" lama ke sini... */}
          </div>

          {/* KANAN: pembayaran (rounding+faktur bar + blok "Payment + checkout" lama) */}
          <div className="flex flex-col min-h-0 overflow-y-auto">
            {/* baris rounding + Lihat Faktur lama */}
            {/* blok Payment + checkout lama */}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
```

Catatan implementasi: JSX baris item, panel pembayaran, denominasi, kembalian, catatan, cetak, tombol "Proses Pembayaran", "Lihat Faktur", PPN toggle di dalamnya **tidak diubah isinya** — hanya dipindah ke kolom yang sesuai. Kelas `sticky top-6` dan `max-h-[calc(100vh-5rem)]` pada root lama DIHAPUS (sudah digantikan kerangka overlay).

- [ ] **Step 6: Verifikasi type-check**

Run: `npm run type-check`
Expected: 0 error. (`OverlayKeranjang` valid & berdiri sendiri; belum dipakai `page.tsx`. `KeranjangPOS.tsx` lama masih ada dan masih dipakai — jadi keduanya kompilasi.)

- [ ] **Step 7: Commit**

```bash
git add src/components/pos/OverlayKeranjang.tsx
git commit -m "feat(pos): tambah OverlayKeranjang (detail + pembayaran) dua kolom"
```

---

### Task 3: Tata ulang "Pilih Barang" jadi dua kolom di `page.tsx`

Ubah body card "Pilih Barang" agar grid produk (kiri) dan form edit (kanan) berdampingan, bukan bertumpuk. Ini menyelesaikan masalah form terpotong di FHD.

**Files:**
- Modify: `src/app/pos/page.tsx` (blok `<div className="space-y-3">` pembungkus grid + form, sekitar baris 1883–2423)

**Interfaces:**
- Consumes: state & handler existing (`filteredProdukJual`, `selectedMaterial`, `productFormRef`, `handleAddToCart`, dll.). Tidak ada interface baru.
- Produces: tidak ada export baru.

- [ ] **Step 1: Ubah pembungkus body jadi grid dua kolom**

Di sekitar baris 1883, blok saat ini:
```tsx
<div className="space-y-3">
  {/* baris kategori */}
  {/* grid produk (max-h) */}
  {selectedMaterial && ( /* form edit */ )}
</div>
```

Restrukturisasi menjadi: baris kategori tetap di atas (full width), lalu grid dua kolom untuk produk + form:

```tsx
<div className="space-y-3">
  {/* baris kategori — BIARKAN apa adanya (full width) */}

  {/* Grid dua kolom: produk kiri, form edit kanan */}
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
    {/* KIRI: grid produk */}
    <div>
      {/* pindahkan <div className="overflow-y-auto ... max-h-..."> grid produk ke sini */}
    </div>

    {/* KANAN: form edit atau empty state */}
    <div>
      {selectedMaterial ? (
        {/* form edit existing (ref={productFormRef}) */}
      ) : (
        <div className="h-full min-h-[240px] flex flex-col items-center justify-center text-center border-2 border-dashed border-gray-200 dark:border-slate-700 rounded-lg p-6 text-gray-400 dark:text-slate-500">
          <svg className="w-10 h-10 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
          </svg>
          <p className="font-semibold">Pilih barang di kiri</p>
          <p className="text-sm mt-1">Detail & harga akan muncul di sini</p>
        </div>
      )}
    </div>
  </div>
</div>
```

- [ ] **Step 2: Naikkan tinggi grid produk & hilangkan penyusutan saat dipilih**

Pada `<div>` grid produk (saat ini `max-h-[160px]`/`max-h-[240px]` bergantung `selectedMaterial`), ganti kelas kondisional menjadi tinggi tetap yang lebih besar (form tak lagi mendorong ke bawah):

```tsx
// SEBELUM:
className={`overflow-y-auto border-2 border-[#00afef]/30 rounded-lg p-2 transition-[max-height] duration-200 ${
  selectedMaterial ? "max-h-[160px]" : "max-h-[240px]"
}`}

// SESUDAH:
className="overflow-y-auto border-2 border-[#00afef]/30 rounded-lg p-2 max-h-[calc(100vh-380px)] min-h-[240px]"
```

- [ ] **Step 3: Verifikasi type-check**

Run: `npm run type-check`
Expected: 0 error.

- [ ] **Step 4: Commit**

```bash
git add src/app/pos/page.tsx
git commit -m "feat(pos): tata ulang Pilih Barang jadi dua kolom (grid produk + form edit)"
```

---

### Task 4: Ganti layout & pasang komponen baru di `page.tsx`, pensiunkan `KeranjangPOS`

Ubah grid 3 kolom jadi lebar penuh, tambah state `showOverlayKeranjang`, pasang `BarRingkasKeranjang` + `OverlayKeranjang`, hapus pemakaian & file `KeranjangPOS.tsx`, dan re-import `PrintType` dari lokasi baru.

**Files:**
- Modify: `src/app/pos/page.tsx` (import baris 20; state ~257; blok grid layout 1649–1651 & 2425–2484; reset checkout 1604–1616)
- Delete: `src/components/KeranjangPOS.tsx`

**Interfaces:**
- Consumes: `BarRingkasKeranjang` (Task 1), `OverlayKeranjang` + `PrintType` (Task 2).
- Produces: tidak ada export baru.

- [ ] **Step 1: Tukar import**

Baris 20, ganti:
```tsx
import KeranjangPOS, { type PrintType } from "@/components/KeranjangPOS";
```
menjadi:
```tsx
import BarRingkasKeranjang from "@/components/pos/BarRingkasKeranjang";
import OverlayKeranjang, { type PrintType } from "@/components/pos/OverlayKeranjang";
```

- [ ] **Step 2: Tambah state overlay**

Setelah baris `const [editingCartIndex, setEditingCartIndex] = useState<number | null>(null);` (baris 257), tambahkan:
```tsx
  const [showOverlayKeranjang, setShowOverlayKeranjang] = useState(false);
```

- [ ] **Step 3: Tutup overlay saat checkout sukses**

Di blok reset checkout (setelah `setCart([]);`, baris 1605), tambahkan:
```tsx
      setShowOverlayKeranjang(false);
```

- [ ] **Step 4: Ubah pembungkus grid layout jadi lebar penuh**

Baris 1649–1651, ganti:
```tsx
<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
  {/* Left: Product Selection */}
  <div className="lg:col-span-2 space-y-4">
```
menjadi:
```tsx
<div className="space-y-4">
  {/* Area kerja lebar penuh: Pelanggan + Pilih Barang */}
  <div className="space-y-4 pb-2">
```

Blok Pelanggan & Pilih Barang tetap di dalam. Tutup `</div>` pembungkus yang lama (yang sebelumnya menutup `lg:col-span-2`) tetap dipertahankan sebagai penutup area kerja.

- [ ] **Step 5: Ganti kolom kanan (KeranjangPOS) jadi bar ringkas + overlay**

Baris 2427–2484, ganti seluruh blok `{/* Right: Cart */}` (`<div className="lg:col-span-1 space-y-3"> ... <KeranjangPOS ... /> ... </div>`) menjadi bar ringkas. Tombol PPN yang tadinya di atas `KeranjangPOS` **dipindah ke dalam overlay** (sudah ada di OverlayKeranjang bila diteruskan; lihat catatan). Untuk menjaga cakupan, teruskan kontrol PPN ke overlay lewat prop jika sudah ada; jika tidak, biarkan tombol PPN existing berada tepat di atas `BarRingkasKeranjang`. Struktur minimal:

```tsx
        {/* Ringkasan keranjang — bar sticky di bawah area kerja */}
        <BarRingkasKeranjang
          itemCount={cart.length}
          total={cartTotal}
          onOpenOverlay={() => setShowOverlayKeranjang(true)}
          onParkClick={() => setShowParkirModal(true)}
          parkedCarts={parkedCarts}
          onLoadParked={handleLoadParked}
          onJadikanPenawaran={handleJadikanPenawaran}
          onDeleteParked={handleDeleteParked}
        />
```

Catatan `cartTotal`: `BarRingkasKeranjang` butuh total akhir. Hitung dengan `useMemo` di `page.tsx` memakai helper yang sama seperti overlay. Tambahkan dekat derivasi lain:
```tsx
  const cartTotal = useMemo(() => {
    const charges = allocateCartLineCharges(cart, roundCartPrices);
    const subtotalItems = charges.reduce((s, n) => s + n, 0);
    const biaya = cart.reduce(
      (s, it) =>
        s +
        (it.biaya_tambahan || [])
          .filter((b) => b.label.trim() && b.nominal > 0)
          .reduce((a, b) => a + b.nominal, 0),
      0,
    );
    return subtotalItems + biaya;
  }, [cart, roundCartPrices]);
```
Import `allocateCartLineCharges` dari `@/lib/money-rounding` di `page.tsx` bila belum ada.

- [ ] **Step 6: Render OverlayKeranjang**

Di bagian modal (setelah `</div>` penutup `space-y-6`, dekat modal lain, mis. sebelum `<ModalParkirKeranjang`), tambahkan `OverlayKeranjang` dengan **props yang sama persis** seperti yang dulu diberikan ke `KeranjangPOS` (baris 2450–2482), plus `open` + `onClose`:

```tsx
      <OverlayKeranjang
        open={showOverlayKeranjang}
        onClose={() => setShowOverlayKeranjang(false)}
        cart={cart}
        roundCartPrices={roundCartPrices}
        onRoundCartPricesChange={setRoundCartPrices}
        paymentMethod={paymentMethod}
        jumlahBayar={jumlahBayar}
        catatan={catatan}
        prioritas={prioritas}
        printType={printType}
        onRemoveItem={handleRemoveFromCart}
        editingCartIndex={editingCartIndex}
        onEditItem={(index) => {
          handleEditCartItem(index);
          setShowOverlayKeranjang(false);
        }}
        onPaymentMethodChange={setPaymentMethod}
        onJumlahBayarChange={setJumlahBayar}
        onCatatanChange={setCatatan}
        onPrioritasChange={setPrioritas}
        onPrintTypeChange={setPrintType}
        onCheckout={handleCheckout}
        customerName={
          selectedPelanggan?.nama || pencarianPelanggan.trim() || undefined
        }
        shopSettings={shopSettings}
        onEditRincianInternal={(index) => setEditingRincianInternalIndex(index)}
        onParkClick={() => setShowParkirModal(true)}
        parkedCarts={parkedCarts}
        onLoadParked={handleLoadParked}
        onJadikanPenawaran={handleJadikanPenawaran}
        onDeleteParked={handleDeleteParked}
      />
```

- [ ] **Step 7: Hapus file lama**

Run:
```bash
git rm src/components/KeranjangPOS.tsx
```

- [ ] **Step 8: Verifikasi type-check + build + grep sisa referensi**

Run:
```bash
npm run type-check
```
Expected: 0 error.

Run:
```bash
grep -rn "KeranjangPOS" src --include="*.ts" --include="*.tsx" | grep -v "OverlayKeranjang\|BarRingkasKeranjang\|DropdownKeranjangTersimpan\|preview-faktur-actions.ts"
```
Expected: kosong (tidak ada sisa import komponen lama).

Run:
```bash
npm run build
```
Expected: build sukses.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(pos): layout lebar penuh + bar ringkas + overlay keranjang, pensiunkan KeranjangPOS"
```

---

### Task 5: Verifikasi akhir & tinjauan manual

**Files:** tidak ada perubahan kode (kecuali perbaikan bila ada temuan).

- [ ] **Step 1: Type-check, lint, build**

Run:
```bash
npm run type-check && npm run lint && npm run build
```
Expected: 0 error type-check; tidak ada lint warning baru yang diperkenalkan task ini; build sukses.

- [ ] **Step 2: Jalankan test POS yang ada (bila relevan)**

Run:
```bash
npx jest src/app/pos/__tests__
```
Expected: PASS (perubahan ini UI-only; test tidak boleh regress). Jika test menyentuh `KeranjangPOS` yang dihapus, perbarui import di test ke `OverlayKeranjang` dan sesuaikan seperlunya.

- [ ] **Step 3: Tinjauan manual di FHD (1920×1080)**

Periksa:
- (a) Area "Pilih Barang": pilih sebuah produk → grid produk (kiri) dan form edit (kanan) terlihat berdampingan **tanpa scroll** ke bawah.
- (b) Bar ringkas keranjang terlihat sticky di bawah area kerja; menampilkan jumlah item + total; tombol Simpan & Tersimpan berfungsi.
- (c) Klik "Lihat Keranjang / Bayar" → overlay terbuka; dengan 5 item, semua terlihat di kolom kiri tanpa scroll berlebih; kolom kanan berisi pembayaran + Proses.
- (d) ESC / klik backdrop / tombol X menutup overlay.
- (e) Edit item dari overlay → overlay tertutup, form Pilih Barang di layar utama terisi & ter-scroll.
- (f) Checkout sukses → overlay tertutup, form ter-reset.
- (g) Dark mode: semua elemen baru punya kontras benar.

- [ ] **Step 4: Commit perbaikan (jika ada)**

```bash
git add -A
git commit -m "fix(pos): perbaikan hasil tinjauan redesign keranjang"
```

---

## Self-Review

**Spec coverage:**
- Layout lebar penuh `page.tsx` → Task 4. ✅
- BarRingkasKeranjang → Task 1. ✅
- OverlayKeranjang dua kolom → Task 2. ✅
- Pilih Barang dua kolom + form selalu terlihat → Task 3. ✅
- State `showOverlayKeranjang` + tutup saat checkout + edit item → Task 4. ✅
- Retire `KeranjangPOS.tsx` + re-export `PrintType` → Task 2 (export) + Task 4 (hapus). ✅
- Elemen sekunder: Simpan/Tersimpan di bar; Lihat Faktur/PPN/Bulatkan di overlay → Task 1 + Task 2. ✅
- Aturan modal (ESC/backdrop/X/focus trap) → Task 2. ✅
- Verifikasi type-check/build/test → Task 5. ✅

**Placeholder scan:** Blok "pindahkan JSX lama ke sini" merujuk ke rentang baris eksplisit di file sumber (bukan TBD abstrak) karena JSX-nya panjang dan dipindah apa adanya; kerangka baru diberi kode lengkap. Dapat diterima untuk refactor move-in-place.

**Type consistency:** `PrintType` diekspor dari `OverlayKeranjang.tsx` (Task 2) dan diimpor di `page.tsx` (Task 4). `cartTotal` (Task 4) memakai `allocateCartLineCharges` yang sama seperti overlay. Nama props overlay identik dengan props `KeranjangPOS` lama + `open`/`onClose`. Konsisten.

## Execution Handoff

Lihat pesan di bawah untuk pilihan eksekusi.
