# Arsitektur Kode Perhitungan Cash Book

## Overview

Setiap operasi memiliki kode perhitungan **TERPISAH** di file yang berbeda. Ini menyebabkan duplikasi logika yang harus dijaga konsistensinya.

## File-File Perhitungan

### 1️⃣ **Manual Input Transaksi Baru**

**File:** `src/app/api/finance/cash-book/route.ts`
**Method:** `POST`
**Kapan Dipanggil:**

- User klik tombol "Tambah Transaksi" di UI
- Input form transaksi baru secara manual
- Submit form

**Proses:**

```
1. Insert transaksi baru ke database
2. Ambil SEMUA transaksi (ORDER BY tanggal ASC, created_at ASC)
3. Loop dan recalculate SEMUA baris dari awal
4. Update setiap baris dengan nilai yang baru dihitung
```

---

### 2️⃣ **Edit Transaksi yang Sudah Ada**

**File:** `src/app/api/finance/cash-book/[id]/route.ts`
**Method:** `PUT`
**Kapan Dipanggil:**

- User klik tombol "Edit" (ikon pensil) di transaksi
- Edit debit/kredit/kategori/tanggal/keperluan
- Submit form edit

**Proses:**

```
1. Update transaksi yang di-edit
2. Ambil SEMUA transaksi (ORDER BY tanggal ASC, created_at ASC)
3. Loop dan recalculate SEMUA baris dari awal
4. Update setiap baris dengan nilai yang baru dihitung
```

---

### 3️⃣ **Manual Override (Edit Kolom Terhitung)**

**File:** `src/app/api/cashbook/override/[id]/route.ts`
**Method:** `PATCH`
**Kapan Dipanggil:**

- User klik tombol "Edit Manual" (ikon 🎛️) di transaksi
- Edit nilai kolom terhitung seperti Saldo, Omzet, Bagi Hasil, dll
- Submit form override

**Proses:**

```
1. Update nilai yang di-override + set flag override = 1
2. Ambil SEMUA transaksi (ORDER BY tanggal ASC, created_at ASC)
3. Loop dan recalculate SEMUA baris dari awal
4. Respect override flags (skip calculation jika override = 1)
5. Update setiap baris dengan nilai yang baru dihitung
```

**Perbedaan:** Kolom yang di-override tidak akan dihitung ulang, nilai manual dipertahankan.

---

### 4️⃣ **Import Data CSV dalam Jumlah Besar**

**File:** `src/app/api/cashbook/import/route.ts`
**Method:** `POST`
**Kapan Dipanggil:**

- User klik "Import CSV"
- Upload file CSV dengan banyak transaksi

**Proses:**

```
1. Parse CSV file
2. Insert SEMUA baris CSV ke database (bulk insert)
3. Panggil fungsi recalculateCashbook()
4. Loop dan recalculate SEMUA baris dari awal
5. Update setiap baris dengan nilai yang baru dihitung
```

**Catatan:** Ini adalah operasi paling berat karena bisa insert ratusan baris sekaligus.

---

### 5️⃣ **Drag & Drop Reorder Transaksi**

**File:** `src/app/api/cashbook/reorder/route.ts`
**Method:** `POST`
**Kapan Dipanggil:**

- User drag & drop row di tabel untuk mengubah urutan
- Mengubah `display_order` transaksi

**Proses:**

```
1. Update display_order untuk baris yang di-drag
2. Ambil SEMUA transaksi (ORDER BY display_order ASC)
3. Loop dan recalculate SEMUA baris dari awal
4. Update setiap baris dengan nilai yang baru dihitung
```

**Penting:** Urutan menentukan running balance yang benar!

---

## ⚠️ Masalah Arsitektur Saat Ini

### Duplikasi Kode

Setiap file memiliki **COPY-PASTE** dari logika perhitungan yang sama:

- Perhitungan Omzet
- Perhitungan Biaya Operasional
- Perhitungan Saldo
- Perhitungan Bagi Hasil
- dll...

### Risiko Inconsistency

Jika ada perubahan logika bisnis:

- ❌ Harus update di **5 tempat berbeda**
- ❌ Risiko lupa update salah satu file
- ❌ Risiko logika berbeda antar file (seperti yang terjadi sebelumnya)

---

## ✅ Solusi yang Disarankan (Refactoring)

### Centralized Calculation Function

**Buat file baru:** `src/lib/cashbook-calculator.ts`

```typescript
/**
 * Centralized calculation logic untuk semua operasi cash book
 * Single source of truth untuk business logic
 */
export function recalculateAllEntries(entries: CashBookEntry[]) {
  let runningOmzet = 0;
  let runningBiayaOps = 0;
  // ... semua variabel running
  let prevLabaBersih = 0;

  const updatedEntries = [];

  for (const row of entries) {
    const cat = row.kategori_transaksi;
    const debit = row.debit || 0;
    const kredit = row.kredit || 0;

    // OMZET
    if (!row.override_omzet) {
      if (cat === "OMZET" || cat === "PIUTANG") {
        runningOmzet += debit;
      }
    } else {
      runningOmzet = row.omzet;
    }

    // ... semua logika perhitungan ...

    updatedEntries.push({
      ...row,
      omzet: runningOmzet,
      biaya_operasional: runningBiayaOps,
      // ... semua kolom hasil perhitungan
    });
  }

  return updatedEntries;
}
```

### Penggunaan di Setiap File:

**File POST/PUT/PATCH/Import/Reorder:**

```typescript
import { recalculateAllEntries } from '@/lib/cashbook-calculator';

// ... insert/update transaksi ...

// Recalculate
const allEntries = db.prepare("SELECT * FROM cash_book ORDER BY tanggal ASC").all();
const updatedEntries = recalculateAllEntries(allEntries);

// Update database
for (const entry of updatedEntries) {
  db.prepare("UPDATE cash_book SET ... WHERE id = ?").run(...);
}
```

---

## 🎯 Keuntungan Refactoring:

✅ **Single Source of Truth** - Logika hanya di 1 tempat
✅ **Easier Maintenance** - Update sekali, berlaku di semua tempat
✅ **Consistency Guaranteed** - Tidak mungkin ada logika berbeda
✅ **Easier Testing** - Test 1 function, semua operasi tercover
✅ **Better Performance** - Bisa optimize di 1 tempat

---

## 📊 Status Saat Ini (Setelah Perbaikan)

| File                | Status   | Logika     |
| ------------------- | -------- | ---------- |
| POST (Manual Input) | ✅ Fixed | Consistent |
| PUT (Edit)          | ✅ Fixed | Consistent |
| PATCH (Override)    | ✅ Fixed | Consistent |
| Import CSV          | ✅ Fixed | Consistent |
| Reorder             | ✅ Fixed | Consistent |

**Catatan:** Semua file sekarang sudah konsisten, tapi masih ada duplikasi kode. Refactoring disarankan untuk long-term maintenance.

---

## 🔍 Cara Cek File Mana yang Dipanggil

### Di Browser DevTools:

1. Buka Network tab
2. Lakukan operasi (tambah/edit/import/override)
3. Lihat request yang dipanggil:
   - `POST /api/finance/cash-book` → Manual input baru
   - `PUT /api/finance/cash-book/[id]` → Edit transaksi
   - `PATCH /api/cashbook/override/[id]` → Manual override
   - `POST /api/cashbook/import` → Import CSV
   - `POST /api/cashbook/reorder` → Drag & drop

### Di Server Logs:

Tambahkan console.log di setiap file untuk tracking:

```typescript
console.log("📝 [POST] Manual input - recalculating...");
console.log("✏️ [PUT] Edit transaksi - recalculating...");
console.log("🎛️ [PATCH] Override - recalculating...");
console.log("📥 [IMPORT] CSV import - recalculating...");
console.log("↕️ [REORDER] Drag drop - recalculating...");
```

---

## 💡 Kesimpulan

**Jawaban singkat untuk pertanyaan Anda:**

> Setiap operasi punya kode sendiri di file berbeda. Tidak berpusat di satu tempat. Makanya harus update di 5 file saat ada perubahan logika.

**Rekomendasi:**

- ✅ Saat ini: Semua sudah konsisten dan benar
- 🔄 Masa depan: Pertimbangkan refactoring ke centralized function
- 📝 Maintenance: Jika ada perubahan logika, ingat update di 5 file
