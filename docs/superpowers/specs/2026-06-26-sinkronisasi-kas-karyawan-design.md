# Desain: Perbaikan Sinkronisasi Nilai Kas antara Halaman Keuangan dan Karyawan

**Tanggal:** 2026-06-26  
**Status:** Disetujui untuk implementasi

---

## Masalah yang Dilaporkan

1. Kartu ringkasan "Saldo Kas", "Kas", dan "Modal Kas" di halaman **Karyawan** tidak langsung berubah
   saat ada transaksi di halaman **Keuangan**. Pembaruan membutuhkan 10–20 detik.

2. Panel **Pengurus Usaha** (Laba Bersih, Kasbon per orang) di halaman Keuangan juga tidak
   langsung memperbarui nilainya setelah transaksi.

3. **Bug nilai salah sementara**: setiap transaksi kredit Kas (misal Rp 300.000) menampilkan
   nilai kartu Kas sebagai tepat `-Rp 300.000` terlebih dahulu, baru kemudian (10–20 detik)
   menampilkan nilai kumulatif yang benar.

---

## Akar Masalah (Root Causes)

### RC-1 — O(1) recalc menghasilkan nilai `kas` salah dari nol

Saat transaksi baru dibuat, sistem menjalankan `recalculateAppendedCashbookEntry` (recalc O(1)
— hanya baris terbaru). Fungsi ini membaca `transaksi_terhitung` (TC) dari **baris sebelumnya**
untuk mendapatkan nilai kumulatif `kas`, `modal_kas`, `saldo_kasbon`.

Jika baris sebelumnya **tidak punya entri TC** untuk metrik global tersebut (baris lama yang
dibuat sebelum formula-formula ini dikonfigurasi di sistem), nilai awal yang dipakai adalah `0`.
Akibatnya:

```
kas_baru = 0 − kredit_baru = −300.000   ← SALAH
```

Nilai yang salah ini tersimpan ke TC dan langsung dipublikasikan ke SWR cache halaman Karyawan.

### RC-2 — Full recalc sangat lambat: update baris `keuangan` dilakukan satu per satu

`recalculateCashbookViaSupabase` (full recalc) memperbarui setiap baris tabel `keuangan`
secara **sequential** satu demi satu:

```js
for (const { id, updates } of batch) {
  await db.update("keuangan", id, updates);  // N round-trips ke Supabase Singapura
}
```

Dengan 100 baris × ~100 ms/call = 10 detik, dan ini yang menyebabkan jeda 10–20 detik pada
panel Pengurus Usaha (yang men-trigger full recalc via `/api/keuangan/summary-v2`).

### RC-3 — Nilai salah dari RC-1 dipublikasikan ke SWR lintas halaman

Setelah transaksi, `loadCashBooks()` membaca TC (yang sudah berisi nilai salah dari RC-1),
lalu `publishKasMetricsCache()` mempublikasikan nilai salah itu ke kunci SWR
`penggajian-metrik-kas`. Halaman Karyawan membaca kunci ini dan menampilkan nilai salah
sampai full recalc selesai dan SWR revalidate ulang.

---

## Alur Sistem Saat Ini (Sebelum Perbaikan)

```
Tambah transaksi
   → O(1) recalc → kas = -300.000 (salah, prevRow TC kosong)
   → loadCashBooks() → baca TC → dapat -300.000
   → publishKasMetricsCache(-300.000) → SWR Karyawan = -300.000  ← TAMPIL SALAH

   → summary-v2 API trigger full recalc (10–20 detik, sequential N calls)
   → setelah selesai → TC benar → SWR revalidate → TAMPIL BENAR
```

---

## Solusi: Opsi 1 — Fix O(1) + Percepat Full Recalc via Batch Postgres RPC

### Komponen 1: Perbaikan O(1) recalc (RC-1)

**File:** `src/lib/services/finance-service.ts` — fungsi `recalculateAppendedCashbookEntry`

**Perubahan:**
Setelah `prevOutputs` dibangun dari `buildOutputRowFromPersisted`, tambahkan pengecekan:
jika `prevRow` ada TAPI `prevOutputs` tidak memiliki nilai **yang terdefinisi (bukan `undefined`/`null`)**
untuk setidaknya salah satu dari `kas`, `modal_kas`, atau `saldo_kasbon` (TC-only metrics),
maka O(1) recalc **tidak dapat menghasilkan nilai kumulatif yang benar** → return `false` langsung.
Nilai `0` (nol) yang valid tetap dianggap terdefinisi dan tidak men-trigger fallback.

Dengan ini, `createCashBookEntry` yang memanggil O(1) akan masuk ke cabang fallback:
```js
if (!recalced) await recalculateCashbookIfAvailable();
```
Dan full recalc yang sudah dipercepat (Komponen 2) akan berjalan.

**Konstanta yang digunakan:** `TC_ONLY_METRIC_KEYS = ["modal_kas", "saldo_kasbon", "kas"]`
sudah ada di `finance-service.ts`.

### Komponen 2: Percepat Full Recalc via Batch RPC Postgres (RC-2)

**Strategi:** Ganti loop sequential `db.update("keuangan", id, updates)` di dalam
`recalculateCashbookViaSupabase` dengan satu Postgres RPC yang menerima semua baris sebagai
JSON array dan melakukan bulk update dalam satu round-trip.

**Implementasi:**
- Buat migrasi baru: `supabase/migrations/<timestamp>_fn_bulk_update_keuangan.sql`
  dengan fungsi:
  ```sql
  CREATE OR REPLACE FUNCTION bulk_update_keuangan(updates jsonb)
  RETURNS void LANGUAGE plpgsql AS $$
  DECLARE rec jsonb;
  BEGIN
    FOR rec IN SELECT * FROM jsonb_array_elements(updates) LOOP
      UPDATE keuangan
      SET saldo             = COALESCE((rec->>'saldo')::numeric,            saldo),
          omzet             = COALESCE((rec->>'omzet')::numeric,            omzet),
          biaya_operasional = COALESCE((rec->>'biaya_operasional')::numeric, biaya_operasional),
          biaya_bahan       = COALESCE((rec->>'biaya_bahan')::numeric,       biaya_bahan),
          laba_bersih       = COALESCE((rec->>'laba_bersih')::numeric,       laba_bersih)
      WHERE id = rec->>'id';
    END LOOP;
  END $$;
  ```
  COALESCE memastikan kolom yang tidak ada dalam payload tidak menimpa nilai yang sudah ada.

- Di `recalculateCashbookViaSupabase`, kumpulkan semua baris yang perlu diperbarui ke dalam
  satu array, lalu panggil RPC sekali.

- Fallback SQLite: loop sequential tetap dipertahankan (SQLite tidak punya network latency).

**Hasil yang diharapkan:** Full recalc dari ~15 detik turun menjadi **< 2 detik**.

### Komponen 3: Pastikan SWR Karyawan mendapat nilai yang benar (RC-3)

Setelah Komponen 1 + 2 diterapkan:
- `createCashBookEntry` menunggu full recalc (kini < 2 detik) sebelum return
- `loadCashBooks()` dipanggil setelah server action return → TC sudah benar → metrics benar
- `publishKasMetricsCache(correctMetrics)` mempublikasikan nilai benar ke SWR
- Halaman Karyawan menampilkan nilai benar segera saat dibuka

Tidak ada perubahan terpisah di halaman Karyawan yang diperlukan — perbaikan server-side
yang memancarkan nilai benar sudah cukup.

Satu-satunya tambahan di sisi client: di `handleSave` halaman Keuangan, pastikan
`bumpKasMetricsCache` hanya dipanggil jika `loadCashBooks()` tidak berhasil memperoleh
metrics (kondisi ini sudah ada tapi perlu diverifikasi tetap benar setelah perubahan).

---

## Perubahan Database

| Migrasi | Tipe | Isi |
|---------|------|-----|
| `<timestamp>_fn_bulk_update_keuangan.sql` | Additive | Postgres RPC `bulk_update_keuangan(jsonb)` |

Tidak ada kolom baru, tidak ada perubahan schema tabel.

---

## File yang Terdampak

| File | Perubahan |
|------|-----------|
| `src/lib/services/finance-service.ts` | Fix O(1) detect missing TC; ganti loop sequential ke RPC call |
| `supabase/migrations/<timestamp>_fn_bulk_update_keuangan.sql` | Fungsi batch update baru |
| `database/sqlite-schema.sql` | Tidak berubah (RPC hanya untuk Supabase) |

---

## Kriteria Keberhasilan

- Setelah transaksi kredit Rp 300.000, kartu Kas di halaman Karyawan langsung menampilkan
  nilai kumulatif yang benar (bukan `-300.000` sementara).
- Panel Pengurus Usaha memperbarui Laba Bersih dan Kasbon dalam < 3 detik setelah transaksi.
- Full recalc selesai dalam < 2 detik (bukan 10–20 detik).
- `npm run type-check` → 0 errors; `npm run build` → sukses.

---

## Asumsi

- Kolom yang masuk ke `updates` dalam full recalc adalah subset tetap:
  `saldo`, `omzet`, `biaya_operasional`, `biaya_bahan`, `laba_bersih`.
  Kolom lain tidak diperbarui oleh recalc.
- Jumlah baris `keuangan` tidak melebihi 5.000 baris (jika melewati ini, RPC tetap lebih cepat
  dari sequential, tapi perlu dipantau).
