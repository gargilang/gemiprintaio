# Fase 6 — Cleanup, Dead-Code & Monolith Refactor Implementation Plan

> **Untuk agentic workers:** REQUIRED SUB-SKILL: gunakan superpowers:executing-plans (atau subagent-driven-development) untuk eksekusi task demi task. Semua step pakai checkbox (`- [ ]`). Kerjakan TIER demi TIER — jangan loncat ke tier berisiko sebelum tier aman selesai & ter-deploy.

**Goal:** Membersihkan dead/duplicate code dan memecah komponen monolit yang tersisa menjadi unit kecil yang readable & maintainable, tanpa mengubah perilaku aplikasi.

**Architecture:** Tiga tier risiko. Tier A (aman): hapus dead code + fix kosmetik. Tier B (medium): pecah monolit non-money-path. Tier C (tinggi): pecah money-path (POS, keuangan) dengan Context + verifikasi ekstra, lalu audit cross-platform. Tiap monolit dipecah dengan pola terbukti dari Fase 5: petakan state DULU, ekstrak modal/section ke file fokus dengan props eksplisit (`{ entity, onClose, onSuccess, showNotification }`), `onSuccess` memicu `reload()` induk.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Context API, Jest (node + jsdom).

**Sumber:** Audit read-only 2026-06-05 (di bawah) + sisa temuan U-I1/U-I2/U-I4/U-I5/U-I6 dari `docs/superpowers/specs/2026-06-04-codebase-review.md`.

**PERINGATAN KERAS:** Jangan ekstrak JSX tanpa memetakan state lebih dulu. POS & keuangan adalah jalur uang — verifikasi `npm run type-check && npm run build` + tes manual menyeluruh tiap langkah. Idealnya nyalakan Supabase lokal saat menyentuh money-path supaya bisa tes alur transaksi nyata. Kerjakan di branch terpisah, satu monolit per branch/commit.

---

## Hasil Audit (read-only, terhadap `main`, 2026-06-05)

**Dead code (hapus di Tier A):**
- `src/lib/services/pos-mutations.ts` — `deleteSale` baris 1205-1378: baris 1206 `return voidSale(...)`, ~172 baris setelahnya UNREACHABLE.
- `src/lib/money-rounding.ts` — `getCartLineCharge` (sekitar baris 29): export, 0 referensi → dead.
- `src/lib/services/formula-service.ts` — `getActorFinanceSummaryRows` (sekitar baris 560): export, 0 referensi → dead.

**Deprecated TAPI masih dipakai (JANGAN hapus):**
- `suggestCheapestRollSize`, `getBillableDimensionsForRoll` (`src/lib/roll-size-utils.ts`) — masih dipanggil di pos/page + internal. Biarkan.

**Monolit (ukuran akurat saat audit):**
| File | Baris | Tier |
| ---- | ----- | ---- |
| `src/app/pos/page.tsx` | 2083 | C (money path) |
| `src/app/pengaturan/PengaturanSetupTab.tsx` | 2202 | B |
| `src/app/keuangan/page.tsx` | 2049 | C (money path) |
| `src/components/FormulirPembelian.tsx` | 1522 | B (purchase) |
| `src/components/finance/PengaturanKeuanganModal.tsx` | 1266 | B |
| `src/app/pengaturan/PengaturanHargaTab.tsx` | 1251 | B |
| `src/app/produksi/spk/page.tsx` | 1239 | B |
| `src/components/ModalTambahBarang.tsx` | 1186 | B |
| `src/components/finance/ExpressionAssistant.tsx` | 1176 | B |

> Catatan: `PengaturanSetupTab.tsx` di `main` BUKAN router tipis — ia berisi `SetupTab` (router) + `MaterialsTab` + `CategoriesView` (461) + `SubcategoriesView` (1131) + `UnitsSection` (1910) + 4 komponen Sortable. Tidak ada file `SetupMasterDataTab.tsx`. (Catatan sesi lama yang menyebut file itu adalah artefak branch, sudah dikoreksi.)

**Catatan performa (penting, jujur):** beban server (N+1, recalc) SUDAH diperbaiki di Fase 2. Pemecahan monolit di Fase 6 ini meningkatkan **maintainability + sedikit render browser**, BUKAN kecepatan server. Jangan jual ini sebagai peningkatan performa server.

---

## TIER A — Dead-code & kosmetik (AMAN, kerjakan dulu)

Tidak mengubah perilaku. Verifikasi tiap task: `npm run type-check && npm run build`. Tier A bisa langsung merge + deploy setelah selesai.

### Task A1: Hapus dead block di `deleteSale`

**Files:**
- Modify: `src/lib/services/pos-mutations.ts` (fungsi `deleteSale`, baris 1205-1374)

**Konteks:** `deleteSale` baris 1206 `return voidSale(id, "Penjualan dibatalkan");` — semua kode setelahnya (baris ~1208-1373) tidak akan pernah jalan. `deleteSale` sekarang sekadar delegasi ke `voidSale`.

- [ ] **Step 1: Ganti seluruh body `deleteSale` jadi delegasi bersih**

Cari `export async function deleteSale(id: string): Promise<boolean> {` dan ganti SELURUH fungsi (sampai `}` penutupnya sebelum komentar `/** Ambil semua piutang */`) menjadi:

```ts
/**
 * Hapus penjualan = void penjualan (membatalkan stok + keuangan + produksi
 * terkait). Delegasi ke voidSale yang sudah menangani reversal lengkap +
 * idempoten. (Sebelumnya fungsi ini punya implementasi kedua yang tak pernah
 * terjangkau setelah `return voidSale(...)` — dihapus di Fase 6.)
 */
export async function deleteSale(id: string): Promise<boolean> {
  return voidSale(id, "Penjualan dibatalkan");
}
```

- [ ] **Step 2: Pastikan tidak ada simbol yang jadi unused**

Run (Grep): cek `deleteMaklonPurchasesForSale` masih dipakai di file (dipakai voidSale, jadi aman). Cek tidak ada import yang hanya dipakai blok terhapus.

- [ ] **Step 3: Verifikasi**

Run: `npm run type-check && npm run build`
Expected: 0 error, build sukses.

- [ ] **Step 4: Commit**

```bash
git add src/lib/services/pos-mutations.ts
git commit -m "refactor(pos): remove unreachable dead block in deleteSale (Fase 6)"
```

---

### Task A2: Hapus fungsi mati `getCartLineCharge`

**Files:**
- Modify: `src/lib/money-rounding.ts`

**Konteks:** `getCartLineCharge` (sekitar baris 29, ditandai `@deprecated`) tidak punya satu pun pemanggil di `src/`.

- [ ] **Step 1: Konfirmasi 0 pemanggil**

Run (Grep): `getCartLineCharge` di `src/` — harus hanya muncul di definisi + komentar `@deprecated`. Jika ADA pemanggil lain, BATALKAN task ini dan lapor.

- [ ] **Step 2: Hapus fungsi + JSDoc `@deprecated`-nya**

Hapus blok `export function getCartLineCharge(...) { ... }` beserta komentar `@deprecated` di atasnya. Pertahankan fungsi lain di file (mis. `getCartLineChargeByIndex` / penggantinya).

- [ ] **Step 3: Verifikasi + commit**

Run: `npm run type-check && npm run build && npx jest src/lib/__tests__/money-rounding.test.ts`

```bash
git add src/lib/money-rounding.ts
git commit -m "refactor(finance): remove unused getCartLineCharge (Fase 6)"
```

---

### Task A3: Hapus fungsi mati `getActorFinanceSummaryRows`

**Files:**
- Modify: `src/lib/services/formula-service.ts`

**Konteks:** `getActorFinanceSummaryRows` (sekitar baris 560, `@deprecated`) tidak punya pemanggil di `src/`. Penggantinya `getActorFinanceSummary` sudah dipakai.

- [ ] **Step 1: Konfirmasi 0 pemanggil**

Run (Grep): `getActorFinanceSummaryRows` di `src/` — hanya definisi + komentar. Jika ada pemanggil, BATALKAN & lapor.

- [ ] **Step 2: Hapus fungsi + JSDoc-nya**

Hapus blok `export async function getActorFinanceSummaryRows(...) { ... }` + komentar `@deprecated` di atasnya.

- [ ] **Step 3: Verifikasi + commit**

Run: `npm run type-check && npm run build && npx jest src/lib/__tests__`

```bash
git add src/lib/services/formula-service.ts
git commit -m "refactor(finance): remove unused getActorFinanceSummaryRows (Fase 6)"
```

---

### Task A4: Fix `key={index}` di file AMAN (non-money-path)

**Files (hanya yang punya id stabil; SKIP file money-path):**
- `src/components/ModalPilihBulan.tsx`, `ModalTambahFinishing.tsx`, `SuratJalanModal.tsx`, `SuratJalanTable.tsx`
- `src/app/laporan/page.tsx`, `laporan/print/page.tsx`, `laporan/financial/print/page.tsx`
- `src/app/pengaturan/PengaturanHargaTab.tsx` (bagian list non-form)

> SKIP (money-path, ditangani di Tier B/C): `pos/page.tsx`, `keuangan/page.tsx`, `KeranjangPOS.tsx`, `FormulirPembelian.tsx`, `ExpressionAssistant.tsx`, `ModalTambahBarang.tsx`, `TabelRiwayatPenjualan.tsx`, `ModalKonversiRoll.tsx`, `MaklonLineModal.tsx`.

- [ ] **Step 1: Ganti hanya yang punya id stabil**

Untuk tiap lokasi, jika item map punya field id unik (`.id`, `.kode`, `.label` unik), ganti `key={index}` → `key={item.id}`. Jika list murni statis/append-only TANPA id stabil (mis. baris cetak yang tidak pernah reorder), BIARKAN (index key sah di sana) dan catat alasannya.

- [ ] **Step 2: Verifikasi + commit**

Run: `npm run type-check && npm run build`

```bash
git add src
git commit -m "fix(ui): stable keys for reorderable lists in safe files (Fase 6)"
```

---

## TIER B — Pecah monolit non-money-path (MEDIUM)

Pola sama untuk semua: (1) baca seluruh file, petakan state per modal/section sebagai catatan; (2) ekstrak ke file fokus dengan props eksplisit `{ entity, onClose, onSuccess, showNotification }`; (3) modal pegang state form + submit-nya sendiri; (4) `onSuccess` panggil `reload()` induk. Verifikasi tiap task: `npm run type-check && npm run build` + tes manual klik semua tombol/modal. Satu file per commit/branch.

### Task B1: Pecah `PengaturanSetupTab.tsx` (2202 baris)

**Files:**
- Modify: `src/app/pengaturan/PengaturanSetupTab.tsx`
- Create: `src/app/pengaturan/setup/CategoriesView.tsx`, `setup/SubcategoriesView.tsx`, `setup/UnitsSection.tsx`, `setup/sortables.tsx` (4 komponen Sortable + types bersama)

**Konteks (audit):** isi = `SetupTab` (router, ~111) + `MaterialsTab` (~202) + `SortableCategory` (309) + `CategoriesView` (461) + `SortableSubcategory` (805) + `SortableUnit` (917) + `SortableQuickSpec` (1027) + `SubcategoriesView` (1131) + `UnitsSection` (1910). Type bersama: `Category`, `Subcategory`, `Unit`, `QuickSpec`.

- [ ] **Step 1: Ekstrak types + sortables ke `setup/sortables.tsx`**

Pindahkan interface `Category`/`Subcategory`/`Unit`/`QuickSpec` dan 4 komponen `Sortable*` ke file baru `src/app/pengaturan/setup/sortables.tsx`, export masing-masing. Import balik ke file induk. Verifikasi build.

- [ ] **Step 2: Ekstrak `CategoriesView` → `setup/CategoriesView.tsx`**

Pindahkan `CategoriesView` + state/handler kategori-nya (loadCategories, modal kategori) ke file sendiri. Props: `{ onCategoryClick, autoOpenModal }` (sesuai pemakaian di `MaterialsTab`). Import balik. Verifikasi build + tes manual CRUD kategori.

- [ ] **Step 3: Ekstrak `SubcategoriesView` → `setup/SubcategoriesView.tsx`**

Pindahkan `SubcategoriesView` (paling besar, ~1131-1909) + state subkategori & quick-spec + modal-modalnya. Props: `{ category, onBack }`. Import balik. Verifikasi build + tes CRUD subkategori & spesifikasi cepat.

- [ ] **Step 4: Ekstrak `UnitsSection` → `setup/UnitsSection.tsx`**

Pindahkan `UnitsSection` (~1910+) + state satuan + modal satuan. Props: `{ autoOpenModal }`. Import balik. File induk kini tinggal `SetupTab` + `MaterialsTab` (router + breadcrumb).

- [ ] **Step 5: Verifikasi + commit**

Run: `npm run type-check && npm run build`. Tes manual menyeluruh: kategori → subkategori → spesifikasi, dan satuan (tambah/edit/hapus/urut drag-drop).

```bash
git add src/app/pengaturan
git commit -m "refactor(ui): split PengaturanSetupTab into setup/ view components (U-I2)"
```

---

### Task B2: Pecah `PengaturanKeuanganModal.tsx` (1266 baris)

**Files:**
- Modify: `src/components/finance/PengaturanKeuanganModal.tsx`
- Create: `src/components/finance/pengaturan-keuangan/TabPengurus.tsx`, `TabKategori.tsx`, `TabKolomRumus.tsx`

**Konteks:** 3 tab (Pengurus/Orang, Kategori, Kolom/Rumus) berbagi `notice`, `pendingConfirm`, `finCats`, dan helper. PERHATIAN: tab-tab ini tightly-coupled — bawa shared state lewat props (bukan Context, karena hanya 1 induk). Petakan dulu state mana yang dipakai >1 tab.

- [ ] **Step 1: Petakan state bersama vs per-tab**

Baca seluruh file. Tandai: `notice`, `pendingConfirm`, `finCats` (bersama → tetap di induk, oper via props). State `actors`/`roles`/`orang*` → TabPengurus. `categories`/`kat*` → TabKategori. `formulas`/`rumus*`/`testRows` → TabKolomRumus.

- [ ] **Step 2: Ekstrak TabPengurus**

Pindahkan UI + state Pengurus ke `pengaturan-keuangan/TabPengurus.tsx`. Props: state bersama + callback yang dibutuhkan (`showNotice`, `requestConfirm`, `finCats`, `onChanged`). Verifikasi build.

- [ ] **Step 3: Ekstrak TabKategori & TabKolomRumus**

Sama, satu per satu, verifikasi build tiap ekstraksi. Induk jadi shell: header + tab switch + render tab aktif (kondisional, bukan semua mounted).

- [ ] **Step 4: Verifikasi + commit**

Run: `npm run type-check && npm run build`. Tes tiap tab + dialog konfirmasi + simpan rumus.

```bash
git add src/components/finance
git commit -m "refactor(ui): split PengaturanKeuanganModal into per-tab components (U-I1)"
```

### Task B3: Pecah `PengaturanHargaTab.tsx` (1251 baris)

**Files:**
- Modify: `src/app/pengaturan/PengaturanHargaTab.tsx`
- Create: `src/app/pengaturan/harga/PricingTab.tsx`, `harga/RollSizesTab.tsx`, `harga/FinishingOptionsTab.tsx`

**Konteks:** file ini meng-export `PricingTab` (~136), `RollSizesTab` (~523), `FinishingOptionsTab` (~882) — tiga tab independen di satu file. Ini split paling bersih (komponen sudah terpisah, tinggal pindah file).

- [ ] **Step 1: Pindahkan tiap fungsi ke file sendiri**

Pindahkan `PricingTab` → `harga/PricingTab.tsx`, `RollSizesTab` → `harga/RollSizesTab.tsx`, `FinishingOptionsTab` → `harga/FinishingOptionsTab.tsx`, masing-masing dengan import yang dibutuhkan. Pertahankan named export agar `PengaturanSetupTab` (yang import `{ PricingTab, RollSizesTab, FinishingOptionsTab }`) tetap jalan — buat `PengaturanHargaTab.tsx` jadi re-export barrel, ATAU update importer ke path baru.

- [ ] **Step 2: Perbaiki warning set-state-in-effect di RollSizesTab (baris ~540)**

Saat memindahkan `RollSizesTab`, ganti pola `useEffect(() => setRollSizes(defaults), ...)` dengan derived state / lazy initializer bila bergantung props, atau biarkan jika perlu fetch (set-state setelah await itu sah). Verifikasi lint warning berkurang.

- [ ] **Step 3: Verifikasi + commit**

Run: `npm run type-check && npm run build`. Tes tab Harga, Ukuran Roll, Opsi Finishing.

```bash
git add src/app/pengaturan
git commit -m "refactor(ui): split PengaturanHargaTab into harga/ tab components (U-I1)"
```

---

### Task B4: Pecah `FormulirPembelian.tsx` (1522 baris)

**Files:**
- Modify: `src/components/FormulirPembelian.tsx`
- Create: `src/components/pembelian/BarisItemPembelian.tsx`, `pembelian/PanelPpnPembelian.tsx`, `pembelian/ModalSplitRoll.tsx`

**Konteks:** form pembelian = daftar item + panel PPN + modal split-roll. Jalur pembelian (sentuh stok via service) — verifikasi ekstra.

- [ ] **Step 1: Petakan state**

Baca seluruh file. Tandai state induk (daftar item, total, vendor, metode bayar, PPN header) vs state per-baris item. Item row & PPN panel terima props + callback `onChange`/`onRemove`.

- [ ] **Step 2: Ekstrak `BarisItemPembelian`**

Satu baris item (barang, qty, harga, dimensi roll) → komponen props `{ item, index, onChange, onRemove, ...lookups }`. Verifikasi build. Perbaiki warning `handleRemoveItem` exhaustive-deps (baris ~186) dengan `useCallback` di induk saat ini.

- [ ] **Step 3: Ekstrak `PanelPpnPembelian` + `ModalSplitRoll`**

Pindahkan panel PPN & modal split-roll. Verifikasi iron rule #6 (dimensi roll Lebar×Panjang, jumlah_roll integer ≥1) tetap utuh. Tes manual: buat pembelian dengan PPN + split roll.

- [ ] **Step 4: Verifikasi + commit**

Run: `npm run type-check && npm run build && npx jest src/lib/__tests__`

```bash
git add src/components
git commit -m "refactor(ui): split FormulirPembelian into item/ppn/roll components (U-I1)"
```

---

### Task B5: Pecah `ModalTambahBarang.tsx` (1186 baris)

**Files:**
- Modify: `src/components/ModalTambahBarang.tsx`
- Create: `src/components/barang/PanelVarianRoll.tsx`, `barang/PanelHargaSatuan.tsx`

- [ ] **Step 1: Petakan + ekstrak PanelVarianRoll & PanelHargaSatuan**

Pindahkan blok varian roll dan blok harga-per-satuan ke sub-komponen props eksplisit. Verifikasi iron rule #6 utuh. Perbaiki warning exhaustive-deps `loadMasterData` (baris ~90) & `useCallback` deps (baris ~454) dengan membungkus callback prop di induk.

- [ ] **Step 2: Verifikasi + commit**

Run: `npm run type-check && npm run build`. Tes tambah/edit barang termasuk roll + multi-satuan.

```bash
git add src/components
git commit -m "refactor(ui): split ModalTambahBarang into roll/price panels (U-I1)"
```

---

### Task B6: Pecah `ExpressionAssistant.tsx` (1176 baris) & SPK `produksi/spk/page.tsx` (1239)

**Files:**
- Modify: `src/components/finance/ExpressionAssistant.tsx` → Create `finance/expression/EditorAST.tsx`, `expression/PreviewHasil.tsx`, `expression/DaftarSaran.tsx`
- Modify: `src/app/produksi/spk/page.tsx` → Create `src/app/produksi/spk/SpkList.tsx`, `spk/SpkDetailPanel.tsx`

- [ ] **Step 1: ExpressionAssistant — pisah editor/preview/saran**

HATI-HATI: jangan ubah logika evaluator AST (punya test kuat). Hanya pisah JSX + state UI. Verifikasi iron rule #13 (label saran = display name, hint = kode).

- [ ] **Step 2: SPK — pisah list & detail panel**

State seleksi SPK tetap di induk; `SpkList` props `{ orders, selectedId, onSelect }`, `SpkDetailPanel` props `{ order, onStatusChange }`.

- [ ] **Step 3: Verifikasi + commit (per file)**

Run: `npm run type-check && npm run build && npx jest src/lib/ast/__tests__`. Tes editor rumus + halaman SPK.

```bash
git add src/components/finance src/app/produksi/spk
git commit -m "refactor(ui): split ExpressionAssistant + SPK page (U-I1)"
```

---

## TIER C — Money-path monolit + audit (RISIKO TINGGI, paling akhir)

Kerjakan HANYA setelah Tier A & B selesai + ter-deploy + stabil. Tiap task: branch terpisah, Supabase lokal hidup, verifikasi `type-check + build + jest` DAN tes manual transaksi nyata end-to-end. Ini jalur uang — kesalahan kecil merusak kasir/pembukuan.

### Task C1: `KeuanganContext` + pecah `keuangan/page.tsx` (2049 baris)

**Files:**
- Create: `src/app/keuangan/KeuanganContext.tsx`
- Create: `src/app/keuangan/sections/FilterBar.tsx`, `sections/TabelBukuKas.tsx`, `sections/ModalsKeuangan.tsx`
- Modify: `src/app/keuangan/page.tsx`

**Konteks:** Sudah pakai `useCachedData` (fetch efisien). Yang dipecah = organisasi klien: filter, tabel, arsip, modal, recalc trigger. Buat Context dulu agar tidak prop-drilling lintas section.

- [ ] **Step 1: Petakan state**

Baca seluruh file. Daftar state: filter (tanggal/kategori), daftar transaksi (SWR), arsip, modal entry/edit/hapus, trigger recalc. Tandai mana yang lintas-section (→ Context) vs lokal (→ section).

- [ ] **Step 2: Buat `KeuanganContext`**

```tsx
"use client";
import { createContext, useContext, useState, ReactNode } from "react";

type KeuanganContextValue = {
  filter: { dari: string; sampai: string; kategori: string | null };
  setFilter: (f: KeuanganContextValue["filter"]) => void;
  reload: () => void;
};
const Ctx = createContext<KeuanganContextValue | null>(null);
export function useKeuangan() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useKeuangan harus di dalam KeuanganProvider");
  return v;
}
export function KeuanganProvider({ children, value }: { children: ReactNode; value: KeuanganContextValue }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
```

- [ ] **Step 3: Ekstrak FilterBar, TabelBukuKas, ModalsKeuangan**

Satu per satu, verifikasi build tiap ekstraksi. `page.tsx` jadi tipis: provider + 3 section. Section pakai `useKeuangan()` alih-alih belasan props.

- [ ] **Step 4: Verifikasi (Supabase lokal hidup) + commit**

Run: `npm run type-check && npm run build`. Tes manual menyeluruh: filter tanggal/kategori, tambah/edit/hapus transaksi, arsip & restore, recalc — pastikan saldo & rumus benar.

```bash
git add src/app/keuangan
git commit -m "refactor(ui): KeuanganContext + split keuangan page into sections (U-I1)"
```

### Task C2: `POSContext` + pecah `pos/page.tsx` (2083 baris) — PALING BERISIKO

**Files:**
- Create: `src/app/pos/POSContext.tsx`
- Create: `src/app/pos/sections/PencarianBarang.tsx`, `sections/KeranjangPanel.tsx`, `sections/PelangganPanel.tsx`, dan ekstraksi 5 modal POS ke `src/app/pos/modals/`
- Modify: `src/app/pos/page.tsx`

**Konteks:** Ini jalur kasir/uang inti. Sudah pakai `useCachedData("pos-init")`. State paling tightly-coupled: keranjang (item + qty + harga + dimensi roll), barang terpilih, customer, metode bayar, 5 modal. Kerjakan PALING AKHIR, paling pelan.

- [ ] **Step 1: Petakan state SANGAT teliti**

Baca seluruh file. Petakan dependensi antar-state keranjang (addItem/updateItem/removeItem, perhitungan roll via `getBillableDimensionsForRoll`, total, PPN, NSFP). Tulis peta lengkap sebagai komentar sementara sebelum menyentuh apa pun.

- [ ] **Step 2: Buat `POSContext` untuk keranjang + customer**

Context pegang: `cartItems`, `addItem`, `updateItem(index, patch)`, `removeItem`, `clearCart`, `customer`, `setCustomer`, `metodePembayaran`. Modal & panel konsumsi via `usePOS()`. Pola sama dengan `KeuanganContext`.

- [ ] **Step 3: Ekstrak 5 modal SATU per SATU**

Ekstrak satu modal (mis. pembayaran, finishing, dimensi roll, konfirmasi, edit harga), verifikasi build + tes manual, BARU lanjut berikutnya. Jangan batch. Tiap modal pakai `usePOS()` / props eksplisit.

- [ ] **Step 4: Ekstrak panel (pencarian, keranjang, pelanggan)**

Setelah modal beres, ekstrak section utama. `page.tsx` jadi `<POSProvider>` + layout.

- [ ] **Step 5: Verifikasi PENUH (Supabase lokal hidup) + commit**

Run: `npm run type-check && npm run build && npx jest`. Tes manual MENYELURUH: tambah barang biasa + barang roll/dimensi (cek m² benar — iron rule #6), ganti customer, tiap metode bayar (CASH/NET30/QRIS/DEBIT/DOWN_PAYMENT/TRANSFER), buat penjualan, cek faktur + nomor + stok berkurang + entri keuangan + SPK. Bandingkan hasil dengan sebelum refactor.

```bash
git add src/app/pos
git commit -m "refactor(ui): POSContext + split pos page into panels/modals (U-I1)"
```

---

### Task C3: Sisa hooks warning money-path (U-I4/U-I5)

**Files:** file money-path yang tersisa (pos, keuangan, MainShell, ModalBayarHutang, ModalBayarPiutang, PpnFakturModal, dll)

- [ ] **Step 1: Audit ulang `npm run lint`**

Setelah C1/C2, banyak warning hilang sendiri. Untuk sisa `missing dependency: 'loadX'`: bungkus fungsi di `useCallback` lalu masukkan ke deps (HATI-HATI infinite loop — tes tiap satu). Untuk `set-state-in-effect`: derived state / lazy init / pindah ke event handler.

- [ ] **Step 2: Verifikasi + commit**

Run: `npm run lint && npm run type-check && npm run build && npx jest`

```bash
git add src
git commit -m "fix(ui): resolve remaining hooks warnings in money-path files (U-I4, U-I5)"
```

---

### Task C4: Virtualisasi tabel panjang (U-I6)

**Files:** `src/components/TabelRiwayatPenjualan.tsx`, `TabelPembelian.tsx`, `SuratJalanTable.tsx`

- [ ] **Step 1: Install + virtualisasi tabel terbesar dulu**

Run: `npm install @tanstack/react-virtual`. Pakai `useVirtualizer` (render baris terlihat saja), pertahankan filter/sort. Mulai `TabelRiwayatPenjualan`. Verifikasi scroll + filter pada dataset besar.

- [ ] **Step 2: Verifikasi + commit**

```bash
git add package.json package-lock.json src/components
git commit -m "perf(ui): virtualize long tables (U-I6)"
```

---

### Task C5: Audit cross-platform (read-only verifikasi)

**Files:** tidak ada perubahan kode wajib; hasil = catatan temuan.

- [ ] **Step 1: Tauri desktop**

Jalankan `npm run tauri:dev` (atau `cargo check` minimal). Login, buat 1 penjualan + 1 pembelian, cek sync ke Supabase. Catat perbedaan perilaku vs web.

- [ ] **Step 2: Flutter**

Jalankan `cd flutter && flutter run --dart-define=API_BASE_URL=https://app.gemiprint.com` (atau web). Login (JWT Bearer), buka POS/barang/pembelian, buat 1 transaksi. Pastikan guard/Zod baru (Fase 1-2) tidak menolak payload Flutter yang sah (cek metode bayar, angka-as-string).

- [ ] **Step 3: Dokumentasikan temuan**

Tulis temuan + perbaikan yang dibutuhkan (jika ada) ke `docs/superpowers/specs/<tanggal>-cross-platform-audit.md`. Jika ada bug, buat task perbaikan terpisah.

---

## Self-Review Fase 6

**Cakupan vs sisa temuan review:**
| Temuan / pekerjaan | Task | Tier |
| ------ | ---- | ---- |
| Dead code (deleteSale, getCartLineCharge, getActorFinanceSummaryRows) | A1, A2, A3 | A |
| key={index} (file aman) | A4 | A |
| U-I2 SetupTab | B1 | B |
| U-I1 PengaturanKeuanganModal | B2 | B |
| U-I1 PengaturanHargaTab | B3 | B |
| U-I1 FormulirPembelian | B4 | B |
| U-I1 ModalTambahBarang | B5 | B |
| U-I1 ExpressionAssistant + SPK | B6 | B |
| U-I1 keuangan/page (money) | C1 | C |
| U-I1 pos/page (money) | C2 | C |
| U-I4/U-I5 hooks money-path | C3 | C |
| U-I6 virtualisasi | C4 | C |
| Audit cross-platform | C5 | C |

**Konsistensi:** semua monolit pakai pola ekstraksi yang sama (`{ entity, onClose, onSuccess, showNotification }`, `onSuccess`→`reload()`); `usePOS()`/`useKeuangan()` pola identik dengan Context Fase 5. `useFocusTrap` dari Fase 5 dipakai modal hasil ekstraksi yang bukan ModalFormShell.

**Catatan tier:** Tier A bisa selesai + deploy hari yang sama (aman). Tier B per-file, review tiap commit. Tier C butuh Supabase lokal + tes manual transaksi; POS (C2) paling akhir & paling pelan.

## Verifikasi akhir Fase 6

```bash
npm run lint          # warning hooks berkurang signifikan, 0 error
npm run type-check    # 0 errors
npm run build         # sukses
npm test              # node + jsdom, semua pass
```

Tes manual wajib di akhir (komponen yang diubah): kategori/subkategori/satuan (Pengaturan), pembelian + split roll, tambah barang roll, rumus keuangan + SPK, lalu jalur uang inti — POS (buat penjualan roll/dimensi, semua metode bayar) dan keuangan (filter, transaksi, arsip, recalc).

## Catatan untuk owner (Bahasa Indonesia)

- Fase 6 = bersih-bersih + rapikan struktur kode. **Tidak ada perubahan tampilan/fungsi** untuk pengguna.
- Tier A (hapus kode mati) aman & cepat. Tier B & C memecah file besar jadi kecil — manfaatnya kode lebih mudah dirawat agen masa depan, **bukan** aplikasi jadi lebih cepat (kecepatan server sudah diperbaiki di Fase 2).
- Tier C menyentuh kasir & buku kas (jalur uang) — dikerjakan paling akhir, pelan, dengan tes transaksi nyata. Saat itu tiba, nyalakan Supabase lokal.

