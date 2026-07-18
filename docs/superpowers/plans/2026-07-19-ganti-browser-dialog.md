# Ganti Browser Dialog → DialogKonfirmasi + Toast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ganti semua `window.confirm` dengan `DialogKonfirmasi` dan semua `alert` dengan toast notifikasi (`showNotification` / `setNotice`) di seluruh codebase, sehingga tidak ada lagi dialog bawaan browser yang mengganggu UX.

**Architecture:** Setiap file diubah secara mandiri — tambahkan state `confirmState` (untuk Dialog) atau ganti `alert()` dengan mekanisme notifikasi lokal yang sudah ada di file tersebut. Komponen yang tidak punya sistem notifikasi lokal akan menerima prop `showNotification` baru.

**Tech Stack:** React (useState, callback), `DialogKonfirmasi` (`@/components/DialogKonfirmasi`), pola notifikasi lokal yang sudah ada (`setNotice` / `showMsg` / `showNotification` prop).

## Global Constraints

- Bahasa Indonesia di semua label UI: judul, pesan, teks tombol konfirmasi/batal.
- Tidak ada emoji di UI.
- Dark mode: setiap kelas Tailwind warna harus punya pasangan `dark:`.
- Type `DialogKonfirmasi`: pilih `danger` untuk hapus/destruktif, `warning` untuk aksi reversibel yang butuh perhatian, `info` untuk konfirmasi informatif.
- Setiap file yang diubah harus lulus `npm run type-check` tanpa error baru.
- Commit per task, pesan commit dalam Bahasa Indonesia.

---

## Peta Perubahan

**`window.confirm` → `DialogKonfirmasi` (17 kejadian di 11 file):**

| File | Fungsi | Type Dialog |
|------|--------|-------------|
| `src/app/hutang/page.tsx` | `revert()` | `warning` |
| `src/app/inventori/opname/page.tsx` | `post()` | `warning` |
| `src/app/inventori/opname/page.tsx` | `cancel()` | `danger` |
| `src/app/penawaran/page.tsx` | `confirmDeleteQuote()` | `danger` |
| `src/app/pengaturan/harga/FinishingOptionsTab.tsx` | `handleDelete()` | `danger` |
| `src/app/pengaturan/harga/RollSizesTab.tsx` | `handleDelete()` | `danger` |
| `src/app/pengaturan/PeriodCloseTab.tsx` | `handleClose()` | `warning` |
| `src/app/pengaturan/notifikasi/page.tsx` | `handleClear()` | `danger` |
| `src/app/pesanan-pembelian/page.tsx` | `confirmReceivePo()` | `warning` |
| `src/app/pesanan-pembelian/page.tsx` | `confirmDeletePo()` | `danger` |
| `src/app/pos/page.tsx` | `handleLoadParked()` | `warning` |
| `src/app/pos/page.tsx` | `handleDeleteParked()` | `danger` |
| `src/app/produksi/spk/page.tsx` | `handleUpdateOrderStatus()` (SIAP_AMBIL) | `info` |
| `src/app/produksi/pengambilan/page.tsx` | `handleSudahDiambil()` | `info` |
| `src/app/retur-pembelian/page.tsx` | aksi posting | `warning` |
| `src/app/retur-penjualan/page.tsx` | aksi posting | `warning` |

**`alert` → toast (11 kejadian di 3 file):**

| File | Mekanisme toast |
|------|-----------------|
| `src/components/TabelPembelian.tsx` | Tambah prop `onError: (msg: string) => void` |
| `src/components/TabelRiwayatPenjualan.tsx` | `showNotification` prop sudah ada di komponen luar; tambah prop `onError` ke `PurchaseRow` inner component |
| `src/components/ModalTambahBarang.tsx` | `showNotification` prop sudah ada — pakai langsung |

---

## Task 1: Ganti `alert` di `ModalTambahBarang.tsx`

**Files:**
- Modify: `src/components/ModalTambahBarang.tsx`

**Interfaces:**
- Consumes: prop `showNotification: (type: "success" | "error", message: string) => void` (sudah ada)
- Produces: tidak ada perubahan interface ke luar

- [ ] **Step 1: Ganti semua `alert(...)` dengan `showNotification("error", ...)`**

  Lokasi-lokasi yang diubah (semua di dalam `handleSubmit` dan `removeUnitPrice`):

  ```ts
  // ❌ Sebelum
  alert("Minimal harus ada 1 produk jual");
  // ✅ Sesudah
  showNotification("error", "Minimal harus ada 1 produk jual");

  // ❌ Sebelum
  alert("Nama barang harus diisi");
  // ✅ Sesudah
  showNotification("error", "Nama barang harus diisi");

  // ❌ Sebelum
  alert("Satuan dasar harus diisi");
  // ✅ Sesudah
  showNotification("error", "Satuan dasar harus diisi");

  // ❌ Sebelum
  alert("Satuan tidak boleh kosong");
  // ✅ Sesudah
  showNotification("error", "Satuan tidak boleh kosong");

  // ❌ Sebelum
  alert("Faktor konversi harus lebih dari 0");
  // ✅ Sesudah
  showNotification("error", "Faktor konversi harus lebih dari 0");

  // ❌ Sebelum (alert dengan template literal, cek baris 340)
  alert(`Nama produk "${duplicateNama}" sudah dipakai. Setiap produk jual harus punya nama unik.`);
  // ✅ Sesudah
  showNotification("error", `Nama produk "${duplicateNama}" sudah dipakai. Setiap produk jual harus punya nama unik.`);
  ```

  Catatan: fungsi `removeUnitPrice` memanggil `alert("Minimal harus ada 1 produk jual")` — di sini tidak ada `showNotification` dalam scope, tapi komponen menerima `showNotification` sebagai prop. Pastikan prop ini accessible di dalam fungsi tersebut (sudah berada di scope komponen, jadi langsung pakai).

- [ ] **Step 2: Jalankan type-check**

  ```bash
  npm run type-check
  ```
  Expected: 0 error baru.

- [ ] **Step 3: Commit**

  ```bash
  git add src/components/ModalTambahBarang.tsx
  git commit -m "fix(barang): ganti alert() dengan toast showNotification di ModalTambahBarang"
  ```

---

## Task 2: Ganti `alert` di `TabelPembelian.tsx`

**Files:**
- Modify: `src/components/TabelPembelian.tsx`

**Interfaces:**
- Produces: tambah prop `onError: (msg: string) => void` ke `PurchaseTableProps` dan ke `PurchaseRow` inner component
- Consumes: dipanggil dari `src/app/pembelian/page.tsx` — harus tambahkan prop `onError` di sana juga

- [ ] **Step 1: Tambah `onError` ke `PurchaseTableProps` dan `PurchaseRow`**

  ```ts
  // Di interface PurchaseTableProps (sekitar baris 45):
  interface PurchaseTableProps {
    purchases: Purchase[];
    loading: boolean;
    onEdit: (purchase: Purchase) => void;
    onDelete: (purchase: Purchase) => void;
    onRevert?: (purchase: Purchase) => void;
    onRetur?: (purchase: Purchase) => void;
    onError?: (msg: string) => void; // ← tambah ini
  }

  // Di PurchaseRow inner component props (sekitar baris 55):
  ({
    purchase,
    index,
    onEdit,
    onDelete,
    onRevert,
    onRetur,
    onError,   // ← tambah ini
  }: {
    purchase: Purchase;
    index: number;
    onEdit: (purchase: Purchase) => void;
    onDelete: (purchase: Purchase) => void;
    onRevert?: (purchase: Purchase) => void;
    onRetur?: (purchase: Purchase) => void;
    onError?: (msg: string) => void; // ← tambah ini
  })
  ```

- [ ] **Step 2: Ganti `alert(...)` di `handlePreview` dan `handlePrint` dengan `onError?.(...)`**

  ```ts
  // handlePreview (baris ~126):
  // ❌ Sebelum
  alert("Gagal menyiapkan preview.");
  // ✅ Sesudah
  onError?.("Gagal menyiapkan preview.");

  // handlePrint (baris ~181):
  // ❌ Sebelum
  alert("Gagal menyiapkan dokumen untuk dicetak.");
  // ✅ Sesudah
  onError?.("Gagal menyiapkan dokumen untuk dicetak.");
  ```

- [ ] **Step 3: Teruskan `onError` ke setiap `PurchaseRow` di render list**

  Cari tempat `<PurchaseRow` dirender (di komponen `TabelPembelian`) dan tambahkan `onError={onError}`.

- [ ] **Step 4: Tambah `onError` di `src/app/pembelian/page.tsx`**

  Cari pemakaian `<TabelPembelian` dan tambahkan prop:
  ```tsx
  <TabelPembelian
    ...
    onError={(msg) => setNotice(msg)}
  />
  ```
  (Halaman pembelian sudah punya `setNotice`.)

- [ ] **Step 5: Jalankan type-check**

  ```bash
  npm run type-check
  ```
  Expected: 0 error baru.

- [ ] **Step 6: Commit**

  ```bash
  git add src/components/TabelPembelian.tsx src/app/pembelian/page.tsx
  git commit -m "fix(pembelian): ganti alert() dengan onError prop di TabelPembelian"
  ```

---

## Task 3: Ganti `alert` di `TabelRiwayatPenjualan.tsx`

**Files:**
- Modify: `src/components/TabelRiwayatPenjualan.tsx`

**Interfaces:**
- Consumes: prop `showNotification: (type: "success" | "error", message: string) => void` (sudah ada di komponen ini)

- [ ] **Step 1: Ganti `alert(...)` di `reprintThermal`, `previewFaktur`, `reprintFaktur` dengan `showNotification("error", ...)`**

  ```ts
  // reprintThermal (baris ~361):
  // ❌ Sebelum
  alert("Gagal menyiapkan struk untuk dicetak.");
  // ✅ Sesudah
  showNotification("error", "Gagal menyiapkan struk untuk dicetak.");

  // previewFaktur (baris ~469):
  // ❌ Sebelum
  alert("Gagal menyiapkan preview faktur.");
  // ✅ Sesudah
  showNotification("error", "Gagal menyiapkan preview faktur.");

  // reprintFaktur (baris ~573):
  // ❌ Sebelum
  alert("Gagal menyiapkan faktur untuk dicetak.");
  // ✅ Sesudah
  showNotification("error", "Gagal menyiapkan faktur untuk dicetak.");
  ```

- [ ] **Step 2: Jalankan type-check**

  ```bash
  npm run type-check
  ```
  Expected: 0 error baru.

- [ ] **Step 3: Commit**

  ```bash
  git add src/components/TabelRiwayatPenjualan.tsx
  git commit -m "fix(penjualan): ganti alert() dengan toast showNotification di TabelRiwayatPenjualan"
  ```

---

## Task 4: Ganti `window.confirm` di `hutang/page.tsx`

**Files:**
- Modify: `src/app/hutang/page.tsx`

**Pola `DialogKonfirmasi` yang dipakai di file ini:**
```tsx
// 1. Import
import DialogKonfirmasi from "@/components/DialogKonfirmasi";

// 2. State
const [confirmState, setConfirmState] = useState<{
  show: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
}>({ show: false, title: "", message: "", onConfirm: () => {} });

// 3. Helper untuk menutup
const closeConfirm = () => setConfirmState((s) => ({ ...s, show: false }));

// 4. Render di JSX (sebelum penutup </div> terluar)
<DialogKonfirmasi
  show={confirmState.show}
  title={confirmState.title}
  message={confirmState.message}
  confirmText="Ya, Lanjutkan"
  cancelText="Batal"
  onConfirm={() => { confirmState.onConfirm(); closeConfirm(); }}
  onCancel={closeConfirm}
  type="warning"
/>
```

- [ ] **Step 1: Tambah import `DialogKonfirmasi` dan state `confirmState`**

  ```tsx
  import DialogKonfirmasi from "@/components/DialogKonfirmasi";

  // Di dalam komponen:
  const [confirmState, setConfirmState] = useState<{
    show: boolean;
    title: string;
    message: string;
    type: "warning" | "danger" | "info";
    onConfirm: () => void;
  }>({ show: false, title: "", message: "", type: "warning", onConfirm: () => {} });

  const closeConfirm = () => setConfirmState((s) => ({ ...s, show: false }));
  ```

- [ ] **Step 2: Ganti `window.confirm` di `revert()` dengan buka dialog**

  ```tsx
  // ❌ Sebelum
  async function revert(debt: any) {
    if (!window.confirm(
      `Revert pembayaran ${debt.nomor_pembelian || debt.nomor_faktur}?\nIni akan menghapus pelunasan dan kembalikan saldo hutang.`
    )) return;
    setSaving(true);
    // ... sisa logika

  // ✅ Sesudah
  function revert(debt: any) {
    setConfirmState({
      show: true,
      title: "Revert Pembayaran",
      message: `Revert pembayaran ${debt.nomor_pembelian || debt.nomor_faktur}?\nIni akan menghapus pelunasan dan kembalikan saldo hutang.`,
      type: "warning",
      onConfirm: async () => {
        setSaving(true);
        try {
          await revertDebtPaymentAction(debt.id);
          setNotice("Pembayaran hutang direvert.");
          await reload();
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "Gagal revert");
        } finally {
          setSaving(false);
        }
      },
    });
  }
  ```

- [ ] **Step 3: Tambah `<DialogKonfirmasi>` di JSX**

  Tambahkan sebelum penutup fragment/div terluar komponen:
  ```tsx
  <DialogKonfirmasi
    show={confirmState.show}
    title={confirmState.title}
    message={confirmState.message}
    confirmText="Ya, Lanjutkan"
    cancelText="Batal"
    onConfirm={() => { confirmState.onConfirm(); closeConfirm(); }}
    onCancel={closeConfirm}
    type={confirmState.type}
  />
  ```

- [ ] **Step 4: Jalankan type-check**

  ```bash
  npm run type-check
  ```
  Expected: 0 error baru.

- [ ] **Step 5: Commit**

  ```bash
  git add src/app/hutang/page.tsx
  git commit -m "fix(hutang): ganti window.confirm dengan DialogKonfirmasi"
  ```

---

## Task 5: Ganti `window.confirm` di `inventori/opname/page.tsx`

**Files:**
- Modify: `src/app/inventori/opname/page.tsx`

Ada dua `window.confirm`: `post()` (warning) dan `cancel()` (danger).

- [ ] **Step 1: Tambah import dan state confirmState (pola sama dengan Task 4)**

- [ ] **Step 2: Refactor `post()` — pindahkan logika async ke dalam `onConfirm`**

  ```tsx
  function post() {
    if (!selected) return;
    setConfirmState({
      show: true,
      title: "Posting Stock Opname",
      message: `Posting stock opname ${selected.nomor_opname}?\nDelta akan menjadi mutasi ADJUSTMENT dan stok di sistem akan diupdate. Item dengan delta nol tidak akan membuat mutasi.`,
      type: "warning",
      onConfirm: async () => {
        setSaving(true);
        try {
          await updateStockOpnameCountsAction(
            selected.id,
            Object.entries(counts).map(([stock_opname_item_id, val]) => ({
              stock_opname_item_id,
              counted_qty: val.qty,
              counted_linear_m: val.linear_m,
            })),
          );
          await postStockOpnameAction(selected.id);
          setNotice("Stock opname diposting.");
          await reload();
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "Gagal posting opname");
        } finally {
          setSaving(false);
        }
      },
    });
  }
  ```

- [ ] **Step 3: Refactor `cancel()` — type `danger`**

  ```tsx
  function cancel() {
    if (!selected) return;
    setConfirmState({
      show: true,
      title: "Batalkan Opname",
      message: `Batalkan opname ${selected.nomor_opname}?`,
      type: "danger",
      onConfirm: async () => {
        setSaving(true);
        try {
          await cancelStockOpnameAction(selected.id);
          setNotice("Sesi opname dibatalkan.");
          await reload();
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "Gagal batal opname");
        } finally {
          setSaving(false);
        }
      },
    });
  }
  ```

- [ ] **Step 4: Tambah `<DialogKonfirmasi>` di JSX**

- [ ] **Step 5: Jalankan type-check, lalu commit**

  ```bash
  npm run type-check
  git add src/app/inventori/opname/page.tsx
  git commit -m "fix(opname): ganti window.confirm dengan DialogKonfirmasi"
  ```

---

## Task 6: Ganti `window.confirm` di `penawaran/page.tsx`

**Files:**
- Modify: `src/app/penawaran/page.tsx`

Satu `window.confirm` di `confirmDeleteQuote()` — type `danger`.

- [ ] **Step 1: Tambah import dan state confirmState**

- [ ] **Step 2: Refactor `confirmDeleteQuote()`**

  ```tsx
  function confirmDeleteQuote(quote: any) {
    setConfirmState({
      show: true,
      title: "Hapus Draf Penawaran",
      message: `Hapus draf ${quote.nomor_penawaran}?\nTindakan ini tidak bisa dibatalkan.`,
      type: "danger",
      onConfirm: async () => {
        setSaving(true);
        try {
          await deleteQuotationDraftAction(quote.id);
          if (editingQuoteId === quote.id) resetForm();
          setNotice(`Draf ${quote.nomor_penawaran} dihapus.`);
          await reload();
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "Gagal menghapus draf");
        } finally {
          setSaving(false);
        }
      },
    });
  }
  ```

- [ ] **Step 3: Tambah `<DialogKonfirmasi>` di JSX, type-check, commit**

  ```bash
  npm run type-check
  git add src/app/penawaran/page.tsx
  git commit -m "fix(penawaran): ganti window.confirm dengan DialogKonfirmasi"
  ```

---

## Task 7: Ganti `confirm` di `pengaturan/harga/FinishingOptionsTab.tsx` dan `RollSizesTab.tsx`

**Files:**
- Modify: `src/app/pengaturan/harga/FinishingOptionsTab.tsx`
- Modify: `src/app/pengaturan/harga/RollSizesTab.tsx`

Kedua file ini sudah punya `showMsg`. Tidak perlu `setNotice` terpisah.

- [ ] **Step 1: `FinishingOptionsTab.tsx` — tambah import + state + refactor `handleDelete`**

  ```tsx
  import DialogKonfirmasi from "@/components/DialogKonfirmasi";

  // State:
  const [confirmState, setConfirmState] = useState<{
    show: boolean;
    title: string;
    message: string;
    type: "warning" | "danger" | "info";
    onConfirm: () => void;
  }>({ show: false, title: "", message: "", type: "danger", onConfirm: () => {} });
  const closeConfirm = () => setConfirmState((s) => ({ ...s, show: false }));

  // Refactor:
  const handleDelete = (id: string, nama: string) => {
    setConfirmState({
      show: true,
      title: "Hapus Opsi Finishing",
      message: `Hapus opsi finishing "${nama}"?`,
      type: "danger",
      onConfirm: async () => {
        try {
          await deleteFinishingOpt(id);
          showMsg("success", "Opsi finishing berhasil dihapus");
          loadOptions();
        } catch (error: any) {
          showMsg("error", error.message || "Gagal menghapus opsi");
        }
      },
    });
  };
  ```

  Tambah `<DialogKonfirmasi ...>` di JSX.

- [ ] **Step 2: `RollSizesTab.tsx` — tambah import + state + refactor `handleDelete`**

  ```tsx
  const handleDelete = (index: number, size: number) => {
    setConfirmState({
      show: true,
      title: "Hapus Roll Size",
      message: `Hapus roll size ${size}m?`,
      type: "danger",
      onConfirm: () => {
        const newSizes = rollSizes.filter((_, i) => i !== index);
        saveToLocalStorage(newSizes);
        showMsg("success", "Roll size berhasil dihapus");
      },
    });
  };
  ```

  Tambah `<DialogKonfirmasi ...>` di JSX.

- [ ] **Step 3: Type-check, lalu commit**

  ```bash
  npm run type-check
  git add src/app/pengaturan/harga/FinishingOptionsTab.tsx src/app/pengaturan/harga/RollSizesTab.tsx
  git commit -m "fix(pengaturan): ganti confirm() dengan DialogKonfirmasi di FinishingOptions dan RollSizes"
  ```

---

## Task 8: Ganti `confirm` di `pengaturan/PeriodCloseTab.tsx`

**Files:**
- Modify: `src/app/pengaturan/PeriodCloseTab.tsx`

Satu `confirm` di `handleClose()` — type `warning` (tutup periode bukan destruktif permanen).

- [ ] **Step 1: Tambah import + state confirmState**

- [ ] **Step 2: Refactor `handleClose()`**

  ```tsx
  const handleClose = () => {
    setConfirmState({
      show: true,
      title: "Tutup Periode",
      message: `Tutup periode ${MONTHS[month - 1]} ${year}? Setelah ditutup, transaksi bertanggal bulan ini tidak bisa diubah/void/adjust tanpa membuka kembali periode. Data tetap bisa dilihat di Laporan.`,
      type: "warning",
      onConfirm: async () => {
        try {
          await closePeriodAction({ year, month, catatan: catatan.trim() || null });
          showMsg("success", "Periode berhasil ditutup");
          setCatatan("");
          await mutatePeriods();
        } catch (e: any) {
          showMsg("error", e.message || "Gagal menutup periode");
        }
      },
    });
  };
  ```

- [ ] **Step 3: Tambah `<DialogKonfirmasi>` di JSX, type-check, commit**

  ```bash
  npm run type-check
  git add src/app/pengaturan/PeriodCloseTab.tsx
  git commit -m "fix(pengaturan): ganti confirm() dengan DialogKonfirmasi di PeriodCloseTab"
  ```

---

## Task 9: Ganti `window.confirm` di `pengaturan/notifikasi/page.tsx`

**Files:**
- Modify: `src/app/pengaturan/notifikasi/page.tsx`

Satu `window.confirm` di `handleClear()` — type `danger`.

- [ ] **Step 1: Tambah import + state confirmState**

- [ ] **Step 2: Refactor `handleClear()`**

  ```tsx
  const handleClear = () => {
    setConfirmState({
      show: true,
      title: "Hapus Semua Log",
      message: "Hapus semua log notifikasi di perangkat ini?",
      type: "danger",
      onConfirm: () => {
        clearNotificationLogs();
        setLocalLogs([]);
        void refresh();
      },
    });
  };
  ```

- [ ] **Step 3: Tambah `<DialogKonfirmasi>` di JSX, type-check, commit**

  ```bash
  npm run type-check
  git add src/app/pengaturan/notifikasi/page.tsx
  git commit -m "fix(notifikasi): ganti window.confirm dengan DialogKonfirmasi di halaman log notifikasi"
  ```

---

## Task 10: Ganti `window.confirm` di `pesanan-pembelian/page.tsx`

**Files:**
- Modify: `src/app/pesanan-pembelian/page.tsx`

Dua `window.confirm`: terima PO (warning) dan hapus draf (danger).

- [ ] **Step 1: Tambah import + state confirmState**

- [ ] **Step 2: Refactor `confirmReceivePo()` — type `warning`**

  Pindahkan seluruh logika async ke dalam `onConfirm`:
  ```tsx
  function confirmReceivePo() {
    if (!receiveModal) return;
    const lines = receiveModal.po.items
      .map((item: any) => ({
        purchase_order_item_id: item.id,
        qty: Number(receiveModal.receivedQty?.[item.id] || 0),
      }))
      .filter((line: any) => line.qty > 0);
    if (lines.length === 0) {
      setNotice("Isi qty terima minimal satu item.");
      return;
    }
    setConfirmState({
      show: true,
      title: "Posting Penerimaan PO",
      message: `Posting penerimaan pesanan pembelian ${receiveModal.po.nomor_po}?\nIni akan membuat pembelian dan menambah stok.`,
      type: "warning",
      onConfirm: async () => {
        setSaving(true);
        try {
          await receivePurchaseOrderAction({ ... });
          setReceiveModal(null);
          setNotice("Penerimaan pesanan pembelian masuk ke pembelian.");
          await reload();
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "Gagal menerima PO");
        } finally {
          setSaving(false);
        }
      },
    });
  }
  ```

- [ ] **Step 3: Refactor `confirmDeletePo()` — type `danger`**

  ```tsx
  function confirmDeletePo(po: any) {
    setConfirmState({
      show: true,
      title: "Hapus Draf PO",
      message: `Hapus draf ${po.nomor_po}?\nTindakan ini tidak bisa dibatalkan.`,
      type: "danger",
      onConfirm: async () => {
        setSaving(true);
        try {
          await deletePurchaseOrderDraftAction(po.id);
          if (editingPoId === po.id) resetForm();
          setNotice(`Draf ${po.nomor_po} dihapus.`);
          await reload();
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "Gagal menghapus draf PO");
        } finally {
          setSaving(false);
        }
      },
    });
  }
  ```

- [ ] **Step 4: Tambah `<DialogKonfirmasi>` di JSX, type-check, commit**

  ```bash
  npm run type-check
  git add src/app/pesanan-pembelian/page.tsx
  git commit -m "fix(pesanan-pembelian): ganti window.confirm dengan DialogKonfirmasi"
  ```

---

## Task 11: Ganti `window.confirm` di `pos/page.tsx`

**Files:**
- Modify: `src/app/pos/page.tsx`

Dua `window.confirm`: ganti keranjang (warning) dan hapus keranjang tersimpan (danger). File ini sudah punya `showMsg` — tidak perlu `setNotice`.

- [ ] **Step 1: Tambah import DialogKonfirmasi (cek apakah sudah ada)**

  Cek baris import, tambahkan jika belum:
  ```tsx
  import DialogKonfirmasi from "@/components/DialogKonfirmasi";
  ```

- [ ] **Step 2: Tambah state confirmState**

  ```tsx
  const [confirmState, setConfirmState] = useState<{
    show: boolean;
    title: string;
    message: string;
    type: "warning" | "danger" | "info";
    onConfirm: () => void;
  }>({ show: false, title: "", message: "", type: "warning", onConfirm: () => {} });
  const closeConfirm = () => setConfirmState((s) => ({ ...s, show: false }));
  ```

- [ ] **Step 3: Refactor `handleLoadParked()` — type `warning`**

  ```tsx
  const handleLoadParked = async (id: string) => {
    if (cart.length > 0) {
      setConfirmState({
        show: true,
        title: "Ganti Keranjang",
        message: "Ganti keranjang saat ini? Keranjang yang belum diparkir akan hilang.",
        type: "warning",
        onConfirm: async () => {
          const p = await loadParkedCartAction(id);
          if (!p) return;
          setCart(p.cart_snapshot as CartItem[]);
          // ... sisa logika restore pelanggan
        },
      });
      return;
    }
    // Jika keranjang kosong, langsung load tanpa konfirmasi
    const p = await loadParkedCartAction(id);
    if (!p) return;
    setCart(p.cart_snapshot as CartItem[]);
    // ... sisa logika restore pelanggan
  };
  ```

- [ ] **Step 4: Refactor `handleDeleteParked()` — type `danger`**

  ```tsx
  const handleDeleteParked = (id: string) => {
    setConfirmState({
      show: true,
      title: "Hapus Keranjang Tersimpan",
      message: "Hapus keranjang tersimpan ini?",
      type: "danger",
      onConfirm: async () => {
        await deleteParkedCartAction(id);
        await refreshParked();
      },
    });
  };
  ```

- [ ] **Step 5: Tambah `<DialogKonfirmasi>` di JSX (area render utama, sebelum penutup fragment)**

- [ ] **Step 6: Type-check, lalu commit**

  ```bash
  npm run type-check
  git add src/app/pos/page.tsx
  git commit -m "fix(pos): ganti window.confirm dengan DialogKonfirmasi untuk ganti/hapus keranjang tersimpan"
  ```

---

## Task 12: Ganti `window.confirm` di `produksi/spk/page.tsx`

**Files:**
- Modify: `src/app/produksi/spk/page.tsx`

Satu `window.confirm` di `handleUpdateOrderStatus()` untuk status SIAP_AMBIL — type `info`.

- [ ] **Step 1: Tambah import + state confirmState**

- [ ] **Step 2: Refactor blok `if (newStatus === "SIAP_AMBIL")`**

  ```tsx
  if (newStatus === "SIAP_AMBIL") {
    setConfirmState({
      show: true,
      title: "Tandai Siap Diambil",
      message: "Tandai SPK siap diambil pelanggan?",
      type: "info",
      onConfirm: async () => {
        const hasil = await setOrderStatusSiapDiambilCascadeAction(orderId);
        if (hasil.terhalang.length > 0) {
          const nama = hasil.terhalang.map((t: any) => t.nama).join(", ");
          showMsg("error", `Item berikut belum bisa diselesaikan: ${nama}. Konfirmasi bahan roll dulu jika perlu.`);
        } else if (hasil.statusOrderAkhir === "SIAP_AMBIL") {
          setSelectedOrderSiapDiambil(orderId);
          showMsg("success", "SPK ditandai Siap Diambil");
        } else {
          showMsg("error", "Status order tidak berubah ke Siap Diambil. Cek status item.");
        }
      },
    });
    return;
  }
  ```

- [ ] **Step 3: Tambah `<DialogKonfirmasi>` di JSX, type-check, commit**

  ```bash
  npm run type-check
  git add src/app/produksi/spk/page.tsx
  git commit -m "fix(spk): ganti window.confirm dengan DialogKonfirmasi untuk Siap Diambil"
  ```

---

## Task 13: Ganti `window.confirm` di `produksi/pengambilan/page.tsx`

**Files:**
- Modify: `src/app/produksi/pengambilan/page.tsx`

Satu `window.confirm` di `handleSudahDiambil()` — type `info`.

- [ ] **Step 1: Tambah import + state confirmState**

- [ ] **Step 2: Refactor `handleSudahDiambil()`**

  ```tsx
  const handleSudahDiambil = (row: PengambilanRow) => {
    setConfirmState({
      show: true,
      title: "Tandai Sudah Diambil",
      message: `Tandai SPK ${row.nomor_spk} sudah diambil pelanggan?`,
      type: "info",
      onConfirm: async () => {
        setSaving(true);
        setNotice("");
        try {
          const hasil = await markSudahDiambilAction(row.order_id);
          if (hasil.terhalang.length > 0) {
            const nama = hasil.terhalang.map((t: any) => t.nama).join(", ");
            setNotice(`Beberapa item belum bisa diselesaikan: ${nama}. Konfirmasi roll dulu jika perlu.`);
          } else {
            setNotice(`SPK ${row.nomor_spk} ditandai sudah diambil.`);
            await reload();
          }
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "Gagal menandai diambil");
        } finally {
          setSaving(false);
        }
      },
    });
  };
  ```

- [ ] **Step 3: Tambah `<DialogKonfirmasi>` di JSX, type-check, commit**

  ```bash
  npm run type-check
  git add src/app/produksi/pengambilan/page.tsx
  git commit -m "fix(pengambilan): ganti window.confirm dengan DialogKonfirmasi untuk Sudah Diambil"
  ```

---

## Task 14: Ganti `window.confirm` di `retur-pembelian/page.tsx` dan `retur-penjualan/page.tsx`

**Files:**
- Modify: `src/app/retur-pembelian/page.tsx`
- Modify: `src/app/retur-penjualan/page.tsx`

Masing-masing satu `window.confirm` — keduanya type `warning` (posting retur, bukan hapus permanen).

- [ ] **Step 1: `retur-pembelian/page.tsx` — tambah import + state + refactor**

  ```tsx
  // Refactor fungsi posting retur:
  async function handlePost() {
    if (!purchaseId || lines.length === 0 || !reason.trim()) {
      return setNotice("Pilih pembelian, qty, dan alasan retur.");
    }
    setConfirmState({
      show: true,
      title: "Posting Retur Pembelian",
      message: "Posting retur pembelian?\nIni akan: stok keluar, hutang dikurangi, refund vendor (jika sudah terbayar).",
      type: "warning",
      onConfirm: async () => {
        setSaving(true);
        try {
          await postReturPembelianAction(...);
          setNotice("Retur pembelian diposting.");
          await reload();
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "Gagal posting retur");
        } finally {
          setSaving(false);
        }
      },
    });
  }
  ```

- [ ] **Step 2: `retur-penjualan/page.tsx` — sama, dengan pesan retur penjualan**

  ```tsx
  setConfirmState({
    show: true,
    title: "Posting Retur Penjualan",
    message: "Posting retur penjualan?\nIni akan: stok kembali, piutang dikurangi, refund kas (kalau faktur sudah terbayar).",
    type: "warning",
    onConfirm: async () => { /* ... sisa logika ... */ },
  });
  ```

- [ ] **Step 3: Tambah `<DialogKonfirmasi>` di JSX keduanya, type-check, commit**

  ```bash
  npm run type-check
  git add src/app/retur-pembelian/page.tsx src/app/retur-penjualan/page.tsx
  git commit -m "fix(retur): ganti window.confirm dengan DialogKonfirmasi di retur pembelian & penjualan"
  ```

---

## Task 15: Verifikasi akhir — pastikan tidak ada sisa browser dialog

- [ ] **Step 1: Scan ulang codebase**

  ```bash
  grep -rn "window\.confirm\|window\.alert\|\balert(\|\bconfirm(" src/ \
    --include="*.tsx" --include="*.ts" \
    | grep -v "__tests__\|\.test\." \
    | grep -v "node_modules"
  ```

  Expected: **0 hasil** (atau hanya komentar/string, bukan pemanggilan aktif).

- [ ] **Step 2: Build lengkap**

  ```bash
  npm run type-check && npm run build
  ```

  Expected: 0 error, build sukses.

- [ ] **Step 3: Commit penutup jika ada sisa kecil yang terlewat**

  Jika scan menemukan sesuatu yang terlewat, perbaiki sekarang dan commit:
  ```bash
  git add <file>
  git commit -m "fix: bersihkan sisa browser dialog yang terlewat dari audit"
  ```
