# Fase 5 — Refactor UI Monolit & Aksesibilitas Implementation Plan

> **Untuk agentic workers:** REQUIRED SUB-SKILL: gunakan superpowers:subagent-driven-development (disarankan) atau superpowers:executing-plans untuk eksekusi task demi task. Semua step pakai checkbox (`- [ ]`).

**Goal:** Memecah komponen monolit (>1000 baris) dengan pola Context-per-domain + ekstrak modal, menambah error/loading boundary, dan memperbaiki aksesibilitas (U-C2..U-C5, U-I1..U-I8, minor UI).

**Architecture:** Untuk tiap halaman monolit: (1) buat Context domain untuk state bersama, (2) ekstrak modal lebih dulu (unit paling terisolasi), (3) ekstrak section. Urutan termudah→tersulit: barang → pengguna → PengaturanKeuanganModal → keuangan → pos. Tambah `error.tsx`/`loading.tsx` per route kritis.

**Tech Stack:** React 19, Next.js App Router, Context API, @tanstack/react-virtual, focus-trap (kustom/ringan).

**Sumber temuan:** `docs/superpowers/specs/2026-06-04-codebase-review.md` bagian 3 (React UI) + Appendix B plan cleanup.

**PERINGATAN KERAS (dari plan cleanup sebelumnya):** Jangan pernah ekstrak JSX ke file baru tanpa pemetaan state lebih dulu. Baca seluruh komponen, identifikasi semua state yang dibutuhkan sub-komponen, baru putuskan interface props atau Context. Ekstraksi naif menghasilkan prop-drilling yang lebih buruk — inilah alasan task ini di-skip sebelumnya.

---

## File Structure

Quick wins dulu (Task 1-4), lalu refactor besar (Task 5-9), lalu polish (Task 10-13).

- Modify: `src/app/pengaturan/PengaturanSetupTab.tsx` (hapus duplikat use client).
- Modify: `src/app/pengaturan/page.tsx` (lazy-mount tab).
- Create: `src/app/error.tsx`, `src/app/loading.tsx`, `src/app/pos/error.tsx`, `src/app/keuangan/error.tsx`, `src/app/pembelian/error.tsx`.
- Modify: `src/components/PilihanCari.tsx` (ARIA combobox).
- Create: `src/components/useFocusTrap.ts` + integrasi ke `ModalFormShell.tsx`.
- Refactor monolit (per task, tiap satu file):
  - `src/app/barang/page.tsx` → `barang/ModalCatatRusak.tsx`, `barang/ModalKonversiRoll.tsx`, dst.
  - `src/app/pengguna/page.tsx` → `pengguna/FormPenggunaModal.tsx`, dst.
  - `src/components/finance/PengaturanKeuanganModal.tsx` → pecah per-tab.
  - `src/app/keuangan/page.tsx` → `keuangan/KeuanganContext.tsx` + sections/modals.
  - `src/app/pos/page.tsx` → `pos/POSContext.tsx` + sections/modals.
- Create: `src/components/TabelVirtual.tsx` atau integrasi react-virtual ke tabel besar.

Catatan: file `*-service.ts` boleh tetap English (settled exception), tapi komponen baru pakai nama Bahasa Indonesia (`.cursorrules`).

---

### Task 1: Hapus duplikat "use client" di PengaturanSetupTab (U-C2)

**Files:**
- Modify: `src/app/pengaturan/PengaturanSetupTab.tsx:1-3`

- [ ] **Step 1: Hapus directive duplikat**

Ganti dua baris `"use client";` (baris 1 dan 3) menjadi satu di paling atas:

```tsx
"use client";

import { useState, useEffect } from "react";
import { useCachedData } from "@/lib/use-cached-data";
```

- [ ] **Step 2: Cek import duplikat lain pasca refactor task 10 lama**

Baca bagian import file; jika ada import yang sama dua kali (sisa pemecahan), hapus duplikatnya.

- [ ] **Step 3: Verifikasi + commit**

Run: `npm run type-check && npm run build`

```bash
git add src/app/pengaturan/PengaturanSetupTab.tsx
git commit -m "fix(ui): remove duplicate use client directive (U-C2)"
```

---

### Task 2: Tambah error.tsx + loading.tsx (U-C5)

**Files:**
- Create: `src/app/error.tsx`, `src/app/loading.tsx`
- Create: `src/app/pos/error.tsx`, `src/app/keuangan/error.tsx`, `src/app/pembelian/error.tsx`
- Create: `src/app/not-found.tsx`

- [ ] **Step 1: Root error boundary**

Create `src/app/error.tsx`:

```tsx
"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
      <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
        Terjadi kesalahan
      </h2>
      <p className="text-slate-600 dark:text-slate-400">
        Maaf, terjadi masalah saat memuat halaman ini.
      </p>
      <button
        onClick={reset}
        className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
      >
        Coba Lagi
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Root loading + not-found**

Create `src/app/loading.tsx`:

```tsx
export default function Loading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
    </div>
  );
}
```

Create `src/app/not-found.tsx`:

```tsx
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
      <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
        Halaman tidak ditemukan
      </h2>
      <Link href="/beranda" className="text-indigo-600 hover:underline">
        Kembali ke Beranda
      </Link>
    </div>
  );
}
```

- [ ] **Step 3: Error boundary per area kritis**

Buat `src/app/pos/error.tsx`, `src/app/keuangan/error.tsx`, `src/app/pembelian/error.tsx` — sama dengan root error tapi pesan spesifik area (mis. "Gagal memuat halaman Kasir").

- [ ] **Step 4: Verifikasi + commit**

Run: `npm run type-check && npm run build`

```bash
git add src/app/error.tsx src/app/loading.tsx src/app/not-found.tsx src/app/pos/error.tsx src/app/keuangan/error.tsx src/app/pembelian/error.tsx
git commit -m "feat(ui): add error/loading/not-found boundaries (U-C5)"
```

---

### Task 3: Lazy-mount tab Pengaturan (U-C3)

**Files:**
- Modify: `src/app/pengaturan/page.tsx:63-71`

**Konteks:** 5 tab (termasuk SetupTab 2175 baris) semua mounted via CSS `hidden` → 5 fetch paralel saat load.

- [ ] **Step 1: Mount tab aktif saja, cache hasil di SWR**

Karena tiap tab pakai `useCachedData` (SWR cache), re-mount murah. Ganti blok yang me-render semua tab dengan render kondisional tab aktif:

```tsx
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
        {activeTab === "system" && <SystemTab />}
        {activeTab === "company" && <CompanyTab />}
        {activeTab === "setup" && <SetupTab />}
        {activeTab === "ppn" && <PpnTab />}
        {activeTab === "period" && <PeriodCloseTab />}
      </div>
```

> SWR cache (`useCachedData`) memastikan pindah tab tidak re-fetch dari nol — data tampil instan dari cache lalu revalidate background. Ini menggantikan strategi "semua mounted" tanpa kehilangan UX. Verifikasi tiap tab pakai cache key stabil.

- [ ] **Step 2: (Opsional) dynamic import untuk SetupTab berat**

Jika first paint masih berat, lazy-load SetupTab:

```tsx
import dynamic from "next/dynamic";
const SetupTab = dynamic(() => import("./PengaturanSetupTab"), {
  loading: () => <div className="animate-pulse h-40" />,
});
```

- [ ] **Step 3: Verifikasi + commit**

Run: `npm run type-check && npm run build`. Buka halaman Pengaturan, pindah-pindah tab, pastikan data tetap muncul instan dan tidak ada error.

```bash
git add src/app/pengaturan/page.tsx
git commit -m "perf(ui): lazy-mount settings tabs, rely on SWR cache (U-C3)"
```

---

### Task 4: ARIA combobox di PilihanCari (U-C4)

**Files:**
- Modify: `src/components/PilihanCari.tsx`

**Konteks:** Tiap option pakai `role="option"` + `tabIndex=0` tanpa parent `role="listbox"`. Input tidak punya `role="combobox"`. Screen reader tidak announce sebagai dropdown.

- [ ] **Step 1: Set role combobox di input**

Pada elemen `<input>` pencarian, tambah atribut ARIA:

```tsx
<input
  // ...props lama
  role="combobox"
  aria-expanded={isOpen}
  aria-controls="pilihancari-list"
  aria-activedescendant={
    highlightedIndex >= 0 ? `pilihancari-opt-${highlightedIndex}` : undefined
  }
  aria-autocomplete="list"
/>
```

> Sesuaikan nama state `isOpen`/`highlightedIndex` dengan yang ada di file.

- [ ] **Step 2: Bungkus daftar dengan role listbox**

Pada div container daftar option (yang sekarang membungkus `filteredOptions.map`), tambah:

```tsx
<div role="listbox" id="pilihancari-list">
  {/* ... map option ... */}
</div>
```

- [ ] **Step 3: Hapus tabIndex dari tiap option, fokus tetap di input**

Pada tiap option div, ganti atribut:

```tsx
<div
  key={option.value}
  id={`pilihancari-opt-${index}`}
  role="option"
  aria-selected={option.value === value}
  // HAPUS tabIndex={0}
  // HAPUS onKeyDown per-option (navigasi Enter/Arrow ditangani di input)
  onClick={() => handleSelect(option.value)}
  onMouseEnter={() => setHighlightedIndex(index)}
  // ... className lama
>
  {option.label}
</div>
```

Pastikan navigasi keyboard (ArrowUp/Down/Enter) ditangani di `onKeyDown` input, bukan di tiap option, supaya tab order tidak rusak.

- [ ] **Step 4: Verifikasi lint a11y + commit**

Run: `npm run lint` (warning `role-has-required-aria-props` harus hilang) `&& npm run type-check && npm run build`

```bash
git add src/components/PilihanCari.tsx
git commit -m "fix(a11y): proper combobox/listbox ARIA in PilihanCari (U-C4)"
```

---

### Task 5: Focus trap + Escape konsisten di modal (U-I3)

**Files:**
- Create: `src/components/useFocusTrap.ts`
- Modify: `src/components/ModalFormShell.tsx`

- [ ] **Step 1: Buat hook focus trap kustom (tanpa dependency)**

Create `src/components/useFocusTrap.ts`:

```tsx
import { useEffect, RefObject } from "react";

/** Jebak fokus di dalam container saat modal terbuka + tutup pada Escape. */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  isOpen: boolean,
  onClose: () => void
) {
  useEffect(() => {
    if (!isOpen) return;
    const node = ref.current;
    if (!node) return;

    const selector =
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = Array.from(
        node!.querySelectorAll<HTMLElement>(selector)
      ).filter((el) => el.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    const prevActive = document.activeElement as HTMLElement | null;
    node.querySelector<HTMLElement>(selector)?.focus();
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      prevActive?.focus();
    };
  }, [ref, isOpen, onClose]);
}
```

- [ ] **Step 2: Integrasi ke ModalFormShell**

Di `ModalFormShell.tsx`, tambahkan ref ke container modal dan panggil hook:

```tsx
import { useRef } from "react";
import { useFocusTrap } from "./useFocusTrap";
// ...
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(containerRef, true, onClose);
// pasang ref={containerRef} di div panel modal terdalam
```

> Modal yang sudah pakai `ModalFormShell` otomatis dapat focus trap + Escape. Modal yang BELUM pakai shell (ModalTambahBarang, ModalBayarHutang, ModalReturPembelian) sebaiknya dimigrasi ke shell saat di-refactor di task berikutnya, atau panggil `useFocusTrap` langsung.

- [ ] **Step 3: Verifikasi + commit**

Run: `npm run type-check && npm run build`. Tes manual: buka modal, tekan Tab berkali-kali (fokus tidak keluar), tekan Escape (tutup).

```bash
git add src/components/useFocusTrap.ts src/components/ModalFormShell.tsx
git commit -m "fix(a11y): focus trap + Escape in modal shell (U-I3)"
```

---

### Task 6: Refactor barang/page.tsx — modal dulu (U-I1, termudah)

**Files:**
- Modify: `src/app/barang/page.tsx` (1603 baris)
- Create: `src/app/barang/ModalCatatRusak.tsx`, `src/app/barang/ModalKonversiRoll.tsx`

**Konteks (urutan Appendix B):** barang paling mudah karena modal-modalnya paling bisa diisolasi.

- [ ] **Step 1: Petakan state sebelum ekstraksi**

Baca seluruh `barang/page.tsx`. Catat: state apa yang dipakai tiap modal (material terpilih, form fields, handler submit, showNotification). Tulis daftar ini sebagai komentar sementara di atas file. JANGAN ekstrak sebelum peta lengkap.

- [ ] **Step 2: Ekstrak ModalCatatRusak**

Buat `src/app/barang/ModalCatatRusak.tsx` dengan interface props eksplisit:

```tsx
"use client";

type Props = {
  material: { id: string; nama: string } | null;
  onClose: () => void;
  onSuccess: () => void;
};

export default function ModalCatatRusak({ material, onClose, onSuccess }: Props) {
  // pindahkan state lokal modal (jumlah rusak, alasan) ke sini
  // pindahkan handler submit; panggil onSuccess() lalu onClose() setelah berhasil
  // ...
}
```

Pindahkan JSX modal catat rusak dari page.tsx ke sini. Hapus state terkait dari page.tsx; ganti dengan render `<ModalCatatRusak material={...} onClose={...} onSuccess={reload} />`.

> Iron rule #11: untuk item baru, `onSuccess` panggil `reload()` penuh (bukan updateInState).

- [ ] **Step 3: Ekstrak ModalKonversiRoll**

Sama seperti Step 2, dengan props `{ material, onClose, onSuccess }`. Pindahkan logika konversi roll (panggil API `convertRollVariant` lewat endpoint) ke modal.

- [ ] **Step 4: Verifikasi tiap ekstraksi**

Run: `npm run type-check && npm run build`. Tes manual di browser: buka halaman Barang, klik tombol "Catat Rusak" dan "Konversi Roll", pastikan modal jalan dan data ter-refresh setelah simpan.

- [ ] **Step 5: Commit**

```bash
git add src/app/barang
git commit -m "refactor(ui): extract barang modals (ModalCatatRusak, ModalKonversiRoll) (U-I1)"
```

---

### Task 7: Refactor pengguna/page.tsx (U-I1, paling sederhana)

**Files:**
- Modify: `src/app/pengguna/page.tsx` (1387 baris)
- Create: `src/app/pengguna/FormPenggunaModal.tsx`

- [ ] **Step 1: Petakan state form modal**

Baca file. Catat field form (nama, username, role, password, aktif), handler create/update, validasi.

- [ ] **Step 2: Ekstrak FormPenggunaModal**

```tsx
"use client";

type Props = {
  pengguna: PenggunaRow | null; // null = mode tambah
  onClose: () => void;
  onSuccess: () => void;
};
```

Pindahkan JSX form + state lokal + submit. Sisakan tabel + state daftar di page.tsx.

- [ ] **Step 3: Verifikasi + commit**

Run: `npm run type-check && npm run build`. Tes: tambah pengguna baru, edit pengguna.

```bash
git add src/app/pengguna
git commit -m "refactor(ui): extract FormPenggunaModal from pengguna page (U-I1)"
```

---

### Task 8: Refactor PengaturanKeuanganModal.tsx (U-I1, sudah ada tab structure)

**Files:**
- Modify: `src/components/finance/PengaturanKeuanganModal.tsx` (1266 baris)
- Create: file per-tab di `src/components/finance/pengaturan-keuangan/`

- [ ] **Step 1: Petakan tab yang ada**

Identifikasi tab di modal (mis. peserta bagi hasil, formula, kategori). Catat state per tab.

- [ ] **Step 2: Ekstrak tiap tab jadi komponen**

Buat satu file per tab dengan props minimal. Modal induk hanya mengatur tab aktif + render tab. Pakai pola render kondisional (bukan semua mounted) seperti Task 3.

- [ ] **Step 3: Verifikasi + commit**

Run: `npm run type-check && npm run build`. Tes tiap tab.

```bash
git add src/components/finance
git commit -m "refactor(ui): split PengaturanKeuanganModal into per-tab components (U-I1)"
```

---

### Task 9: KeuanganContext + refactor keuangan/page.tsx (U-I1)

**Files:**
- Create: `src/app/keuangan/KeuanganContext.tsx`
- Modify: `src/app/keuangan/page.tsx` (2049 baris)
- Create: `src/app/keuangan/` sub-komponen (FilterBar, TabelBukuKas, modal-modal)

**Konteks:** Buat Context dulu agar tidak prop-drilling.

- [ ] **Step 1: Petakan state buku kas**

Baca seluruh file. Daftar state: filter (tanggal, kategori), daftar transaksi, archive, modal state, recalc trigger. Tandai mana yang dibutuhkan lintas sub-komponen (→ Context) vs lokal (→ tetap di komponen).

- [ ] **Step 2: Buat KeuanganContext**

```tsx
"use client";

import { createContext, useContext, useState, ReactNode } from "react";

type KeuanganContextValue = {
  filter: { dari: string; sampai: string; kategori: string | null };
  setFilter: (f: KeuanganContextValue["filter"]) => void;
  reload: () => void;
  // tambahkan state bersama lain hasil pemetaan Step 1
};

const Ctx = createContext<KeuanganContextValue | null>(null);

export function useKeuangan() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useKeuangan harus di dalam KeuanganProvider");
  return v;
}

export function KeuanganProvider({ children }: { children: ReactNode }) {
  const [filter, setFilter] = useState({ dari: "", sampai: "", kategori: null as string | null });
  // data fetching via useCachedData di sini; expose reload
  const reload = () => {/* useInvalidate("keuangan") */};
  return <Ctx.Provider value={{ filter, setFilter, reload }}>{children}</Ctx.Provider>;
}
```

- [ ] **Step 3: Bungkus page dengan provider, ekstrak section**

`page.tsx` jadi tipis: `<KeuanganProvider><FilterBar/><TabelBukuKas/><ModalsKeuangan/></KeuanganProvider>`. Tiap section pakai `useKeuangan()` alih-alih menerima belasan props.

- [ ] **Step 4: Verifikasi + commit**

Run: `npm run type-check && npm run build`. Tes lengkap: filter, tambah transaksi, archive, recalc.

```bash
git add src/app/keuangan
git commit -m "refactor(ui): KeuanganContext + split keuangan page into sections (U-I1)"
```

---

### Task 10: POSContext + refactor pos/page.tsx (U-I1, paling kompleks — TERAKHIR)

**Files:**
- Create: `src/app/pos/POSContext.tsx`
- Modify: `src/app/pos/page.tsx` (2083 baris)
- Create: `src/app/pos/` sub-komponen (KeranjangPanel, PencarianBarang, PelangganPanel, 5 modal)

- [ ] **Step 1: Petakan state POS (paling teliti)**

Baca seluruh file. State: keranjang (items + qty + harga + dimensi roll), barang terpilih, customer, metode bayar, 5 modal. Ini paling tightly-coupled — petakan dependensi antar-state dengan hati-hati sebelum apa pun.

- [ ] **Step 2: Buat POSContext untuk keranjang + customer**

Context memegang: `cartItems`, `addItem`, `updateItem`, `removeItem`, `customer`, `setCustomer`, `metodePembayaran`. Modal dan panel konsumsi via `usePOS()`.

```tsx
"use client";

import { createContext, useContext, useState, ReactNode } from "react";

type CartItem = { /* sesuai struktur item POS aktual */ };

type POSContextValue = {
  cartItems: CartItem[];
  addItem: (item: CartItem) => void;
  updateItem: (index: number, patch: Partial<CartItem>) => void;
  removeItem: (index: number) => void;
  clearCart: () => void;
  customer: { id: string; nama: string } | null;
  setCustomer: (c: POSContextValue["customer"]) => void;
};

const Ctx = createContext<POSContextValue | null>(null);
export function usePOS() {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePOS harus di dalam POSProvider");
  return v;
}
export function POSProvider({ children }: { children: ReactNode }) {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [customer, setCustomer] = useState<POSContextValue["customer"]>(null);
  const addItem = (item: CartItem) => setCartItems((p) => [...p, item]);
  const updateItem = (i: number, patch: Partial<CartItem>) =>
    setCartItems((p) => p.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const removeItem = (i: number) => setCartItems((p) => p.filter((_, idx) => idx !== i));
  const clearCart = () => setCartItems([]);
  return (
    <Ctx.Provider value={{ cartItems, addItem, updateItem, removeItem, clearCart, customer, setCustomer }}>
      {children}
    </Ctx.Provider>
  );
}
```

- [ ] **Step 3: Ekstrak modal POS satu per satu**

Ekstrak 5 modal (mis. pembayaran, finishing, dimensi roll, konfirmasi, edit harga) jadi komponen terpisah yang pakai `usePOS()`. Ekstrak SATU modal, verifikasi, baru lanjut berikutnya. Jangan batch.

- [ ] **Step 4: Ekstrak panel keranjang + pencarian + customer**

Setelah modal beres, ekstrak section utama. `page.tsx` jadi `<POSProvider>` + layout.

- [ ] **Step 5: Verifikasi penuh + commit**

Run: `npm run type-check && npm run build && npm test`. Tes manual menyeluruh: tambah barang ke keranjang (termasuk roll/dimensi — iron rule #6), ganti customer, pilih metode bayar, buat penjualan, cek faktur. Ini hot path uang — verifikasi sangat teliti.

```bash
git add src/app/pos
git commit -m "refactor(ui): POSContext + split pos page into panels/modals (U-I1)"
```

---

### Task 11: Lanjutkan pemecahan SetupTab (U-I2)

**Files:**
- Modify: `src/app/pengaturan/PengaturanSetupTab.tsx` (2175 baris)
- Create: modal kategori/subkategori/satuan terpisah

- [ ] **Step 1: Petakan + ekstrak modal master data**

Pisahkan modal kategori, subkategori, satuan jadi komponen sendiri dengan props `{ onClose, onSuccess }`. Sisakan tabel + state utama. Sama pola dengan Task 6.

- [ ] **Step 2: Verifikasi + commit**

Run: `npm run type-check && npm run build`. Tes CRUD kategori/subkategori/satuan.

```bash
git add src/app/pengaturan
git commit -m "refactor(ui): split SetupTab master-data modals (U-I2)"
```

---

### Task 12: Refactor sisa monolit (FormulirPembelian, ModalTambahBarang, ExpressionAssistant, SPK) (U-I1)

**Files:**
- Modify: `src/components/FormulirPembelian.tsx` (1522), `src/components/ModalTambahBarang.tsx` (1186), `src/components/finance/ExpressionAssistant.tsx` (1176), `src/app/produksi/spk/page.tsx` (1239)

- [ ] **Step 1: FormulirPembelian — ekstrak baris item + PPN + split roll**

Petakan state. Ekstrak: `BarisItemPembelian` (per-item row), `PanelPpn`, `ModalSplitRoll`. Form induk pegang daftar item + total. Pakai props eksplisit per komponen.

- [ ] **Step 2: ModalTambahBarang — ekstrak roll variants + harga satuan**

Ekstrak `PanelVarianRoll` dan `PanelHargaSatuan` jadi sub-komponen. Verifikasi iron rule #6 (dimensi roll: Lebar × Panjang, jumlah_roll integer ≥ 1) tetap utuh.

- [ ] **Step 3: ExpressionAssistant — pisah editor AST dari preview**

Ekstrak `EditorAST`, `PreviewHasil`, `DaftarSaran`. Hati-hati: ini punya test coverage AST yang kuat — jangan ubah logika evaluator, hanya pisah JSX/state UI. Verifikasi iron rule #13 (label saran = display name, hint = kode).

- [ ] **Step 4: SPK page — pisah list dari detail panel**

Ekstrak `SpkList` dan `SpkDetailPanel`. State seleksi SPK di parent.

- [ ] **Step 5: Verifikasi + commit (per file, jangan batch)**

Setiap file: `npm run type-check && npm run build` + tes manual. Commit terpisah per file:

```bash
git add src/components/FormulirPembelian.tsx src/components/pembelian
git commit -m "refactor(ui): split FormulirPembelian into item/ppn/roll components (U-I1)"
```

(Ulangi commit terpisah untuk ModalTambahBarang, ExpressionAssistant, SPK.)

---

### Task 13: Audit warning hooks — exhaustive-deps & set-state-in-effect (U-I4, U-I5)

**Files:**
- Modify: file dengan warning (ModalTambahBarang, ModalBayarHutang, ModalEditManual, ModalEditHarga, PilihanCari, PpnFakturModal, dll)

- [ ] **Step 1: Daftar semua warning**

Run: `npm run lint`. Catat tiap `react-hooks/exhaustive-deps` dan `react-hooks/set-state-in-effect`.

- [ ] **Step 2: Fix exhaustive-deps (U-I4)**

Untuk callback prop yang sering berubah → bungkus di parent dengan `useCallback`. Untuk function yang hanya dipakai di satu effect → definisikan di dalam effect. Jangan asal tambah dep yang memicu loop.

- [ ] **Step 3: Fix set-state-in-effect (U-I5)**

Ganti `setState` dalam body effect dengan: derived state via `useMemo` (jika bergantung props), atau `key` prop untuk reset natural saat identitas input berubah, atau pindah ke event handler. Contoh: ModalEditHarga.tsx:55, PilihanCari.tsx:116, PpnFakturModal.tsx:74,99.

- [ ] **Step 4: Verifikasi + commit**

Run: `npm run lint` (warning hooks berkurang signifikan) `&& npm run type-check && npm run build && npm test`

```bash
git add src
git commit -m "fix(ui): resolve react-hooks exhaustive-deps and set-state-in-effect warnings (U-I4, U-I5)"
```

---

### Task 14: Virtualization tabel panjang (U-I6)

**Files:**
- Modify: `src/components/TabelRiwayatPenjualan.tsx`, `TabelPembelian.tsx`, `SuratJalanTable.tsx`

- [ ] **Step 1: Install react-virtual**

Run: `npm install @tanstack/react-virtual`

- [ ] **Step 2: Virtualisasi tabel terbesar dulu (TabelRiwayatPenjualan)**

Pakai `useVirtualizer` untuk render hanya baris yang terlihat. Pertahankan filter/sort yang ada. Pola:

```tsx
import { useVirtualizer } from "@tanstack/react-virtual";
// parentRef = ref ke container scroll
const rowVirtualizer = useVirtualizer({
  count: rows.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 48,
  overscan: 10,
});
```

> Untuk dataset 500+ row, pertimbangkan server-side pagination + filter sebagai peningkatan terpisah. Catat di summary.

- [ ] **Step 3: Verifikasi + commit**

Run: `npm run type-check && npm run build`. Tes scroll + filter pada tabel besar.

```bash
git add package.json package-lock.json src/components/TabelRiwayatPenjualan.tsx src/components/TabelPembelian.tsx src/components/SuratJalanTable.tsx
git commit -m "perf(ui): virtualize long tables (U-I6)"
```

---

### Task 15: Minor UI cleanup (U-I8 + minor)

**Files:**
- Berbagai komponen

- [ ] **Step 1: key={index} → key unik**

Cari `key={index}` di map (Grep). Ganti dengan id record yang stabil.

- [ ] **Step 2: Dark mode class duplication (U-I8)**

Untuk pola class yang berulang, ekstrak ke konstanta atau pakai `clsx`/`cva`. Mulai dari MainShell. Tidak perlu refactor semua sekaligus; fokus titik dengan duplikasi terparah. (Opsional, prioritas rendah.)

- [ ] **Step 3: Konsistensi prop modal (isOpen vs show)**

Pilih satu konvensi (`isOpen`). Saat menyentuh modal di task lain, samakan. Tidak perlu PR massal tersendiri.

- [ ] **Step 4: Komponen bersama EmptyState (opsional)**

Buat `src/components/EmptyState.tsx` untuk empty state yang konsisten; adopsi bertahap.

- [ ] **Step 5: Verifikasi + commit**

Run: `npm run lint && npm run type-check && npm run build`

```bash
git add src
git commit -m "chore(ui): stable keys, dark-mode class extraction, minor consistency (U-I8)"
```

---

## Self-Review Fase 5

| Temuan | Task | Status |
| ------ | ---- | ------ |
| U-C2 duplikat use client | Task 1 | ✓ |
| U-C3 tab mounted simultan | Task 3 | ✓ |
| U-C4 ARIA combobox | Task 4 | ✓ |
| U-C5 error/loading.tsx | Task 2 | ✓ |
| U-I1 monolit (9 file) | Task 6,7,8,9,10,12 | ✓ |
| U-I2 SetupTab lanjut | Task 11 | ✓ |
| U-I3 focus trap modal | Task 5 | ✓ |
| U-I4 exhaustive-deps | Task 13 | ✓ |
| U-I5 set-state-in-effect | Task 13 | ✓ |
| U-I6 virtualization | Task 14 | ✓ |
| U-I7 use client di page besar | (catatan di bawah) | partial |
| U-I8 dark mode duplication | Task 15 | ✓ |
| Minor (key, EmptyState, prop naming) | Task 15 | ✓ |

**Cakupan U-I1 (9 file monolit):**
- barang/page.tsx → Task 6
- pengguna/page.tsx → Task 7
- PengaturanKeuanganModal → Task 8
- keuangan/page.tsx → Task 9
- pos/page.tsx → Task 10
- FormulirPembelian, ModalTambahBarang, ExpressionAssistant, produksi/spk → Task 12

**Catatan U-I7 (server component):** Mengonversi halaman besar `"use client"` ke server component + client island adalah refactor arsitektural besar dan berisiko, di luar scope perbaikan monolit ini. Setelah monolit dipecah (Task 6-12), konversi shell→server jadi lebih mudah sebagai peningkatan lanjutan terpisah. Ditandai partial secara sengaja; dokumentasikan di summary.

**Konsistensi:** `usePOS()`/`useKeuangan()` pola sama. `useFocusTrap(ref, isOpen, onClose)` signature konsisten dipakai di Task 5 dan modal hasil refactor. Pola props modal `{ ...entity, onClose, onSuccess }` seragam di Task 6,7,8,11.

## Verifikasi akhir Fase 5

```bash
npm run lint         # warning hooks berkurang signifikan, 0 a11y role error
npm run type-check   # 0 errors
npm run build        # sukses
npm test             # semua pass (termasuk komponen jsdom dari Fase 4)
```

Tes manual wajib (komponen yang diubah): klik semua tombol/modal di barang, pengguna, keuangan, pos, pengaturan. Hot path POS (buat penjualan dengan roll/dimensi) diverifikasi paling teliti.

## Catatan untuk owner (Bahasa Indonesia)

- Halaman besar (Kasir, Keuangan, Barang, Pengguna, Pengaturan) dipecah jadi bagian-bagian lebih kecil. Tidak ada perubahan tampilan/fungsi — hanya lebih mudah dirawat dan lebih cepat.
- Halaman sekarang punya tampilan error dan loading yang rapi, bukan error mentah.
- Dropdown pencarian dan dialog modal lebih ramah keyboard dan pembaca layar.
- Tabel panjang (riwayat penjualan, pembelian) lebih lancar di-scroll untuk data banyak.

