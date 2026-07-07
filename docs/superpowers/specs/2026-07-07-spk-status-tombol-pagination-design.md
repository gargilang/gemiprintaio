# Sub-project A: SPK — Status, Tombol Siap Diambil, Pagination

**Tanggal:** 2026-07-07
**Lingkup:** Halaman SPK (`/produksi/spk`) dan Pengambilan (`/produksi/pengambilan`).
**Tujuan:** Empat perubahan dari daftar isu owner, difokuskan pada SPK. Alur X Banner (rakitan berdimensi) sengaja dikeluarkan — masuk Sub-project B (Komponen Rakitan).

## Latar belakang

Owner adalah operator non-programmer yang memakai halaman SPK setiap hari.
Empat isu konkret dilaporkan:

1. Setiap finishing item menampilkan badge "Menunggu" yang dianggap berisik.
2. Tidak ada tombol fisik "Siap Diambil" — operator harus cari di dropdown status
   order lalu konfirmasi.
3. Saat SPK sudah `SELESAI` (di-set lewat halaman Pengambilan), membuka modal
   detail menampilkan dropdown status yang auto-pilih "Menunggu" walaupun badge
   warnanya benar. Akar masalah: `<select>` difilter `!== "SELESAI"`, jadi tidak
   ada option yang cocok dengan value saat ini → browser pilih option pertama.
4. Saat jumlah SPK dan barang siap/sudah diambil berlimpah, load page berat
   karena semua data di-fetch sekaligus tanpa batas.

## Non-tujuan (YAGNI)

- Tidak mengubah alur SPK untuk item rakitan berdimensi (X Banner) — Sub-project B.
- Tidak menambah status produksi baru selain yang sudah ada.
- Tidak mengubah logika cascade `setOrderStatusSiapDiambilCascade` (sudah benar).

## Arsitektur

### Section 1 — Hapus field `status` dari `item_finishing`

**Data model (3 tempat sync per iron rule #2):**

1. Migration baru `supabase/migrations/<timestamp>_drop_item_finishing_status.sql`:
   ```sql
   ALTER TABLE item_finishing DROP COLUMN IF EXISTS status;
   ```
   Additive (drop column aman karena kolom tidak dipakai FK/index). Tidak perlu
   default karena kolom dihapus, bukan ditambah.

2. `database/sqlite-schema.sql`: hapus kolom `status` dari definisi `item_finishing`.

3. `src/lib/db-unified.ts`: runtime ALTER
   ```ts
   // SQLite 3.35+ (Node 22 / better-sqlite3 modern) mendukung DROP COLUMN.
   db.exec("ALTER TABLE item_finishing DROP COLUMN status");
   ```
   Bungkus try/catch karena kolom mungkin sudah tidak ada (idempoten). Tidak
   perda recreate-table pattern kecuali SQLite lokal ternyata < 3.35 — verifikasi
   saat eksekusi.

**Kode:**

- `src/lib/services/production-service.ts`:
  - Hapus field `status` dari interface `FinishingItem` (line 100).
  - Hapus field `status` dari object insert `item_finishing` di
    `createProductionOrder` (sekitar line 607-616) dan `pos-mutations.ts`
    (sekitar line 955-965).
  - Hapus referensi `finishing.status` dari enrichment `getProductionOrders`
    dan `getProductionOrderById` (line 169-175, 343-358) — sebenarnya tidak
    ada manipulasi `status` di enrichment, hanya select, jadi otomatis
    hilang saat interface berubah.
- `src/app/produksi/spk/components/SpkDetailModal.tsx`:
  - Hapus badge `<span ...>{fin.status}</span>` (line 391-399). Finishing
    hanya tampilkan `jenis_finishing` + `keterangan`.
- `src/lib/schemas/pos.ts`: `saleFinishingSchema` sudah hanya
  `jenis_finishing` + `keterangan` (line 8) — tidak ada perubahan.
- `src/lib/sync-config.ts`: `item_finishing` sudah terdaftar sebagai synced
  table. Tidak ada perubahan kolom sync — kolom `status` yang dihapus bukan
  kolom sync. Tetap perlu verifikasi `SYNC_TABLES` dan `sync-config` tidak
  referensikan `status` di select list.

**Test:**

- `src/lib/__tests__/production-order-detail.test.ts`: mock `item_finishing`
  (line 40) masih set `status` — hapus field itu dari mock, atau biarkan
  (extra field tidak fatal). Pastikan test tetap lulus.

**Trade-off:** data historis status finishing hilang. Owner sudah tidak
memakainya untuk pelacakan (status item yang dipakai, bukan status per
finishing line). Sederhana, sesuai keinginan owner.

### Section 2 — Tombol "Siap Diambil" di dalam modal detail SPK

**Lokasi:** footer modal `SpkDetailModal.tsx`, di antara tombol Batal dan
Cetak SPK (atau di area info order sebelum items — implementer pilih yang
paling pas visual). Bukan di tabel baris SPK.

**Kapan muncul (kondisi render):**

```ts
const bisaSiapDiambil =
  order.status === "MENUNGGU" || order.status === "PROSES";
```
Tidak muncul saat `SIAP_AMBIL`/`SELESAI`/`DIBATALKAN` (tidak ada gunanya).

**Aksi:**

Panggil `setOrderStatusSiapDiambilCascadeAction(order.id)` (sudah ada, tidak
ubah backend). Handle response sesuai pola yang sudah ada di
`handleUpdateStatus` (line 221-238):

- `hasil.terhalang.length > 0` → toast error: "Item berikut belum bisa
  diselesaikan: {nama}. Konfirmasi bahan roll dulu jika perlu."
- `hasil.statusOrderAkhir === "SIAP_AMBIL"` → toast success "SPK ditandai
  Siap Diambil".
- Lain → toast error "SPK belum bisa ditandai Siap Diambil — periksa status
  item."

**Props baru modal:**

```ts
export interface SpkDetailModalProps {
  // ... existing ...
  onMarkSiapDiambil: (orderId: string) => Promise<void>;
}
```

Di `page.tsx`, buat handler `handleMarkSiapDiambil` yang membungkus logic
line 221-238 (pindah dari `handleUpdateStatus` agar modal bisa pakai tombol
langsung tanpa harus lewat dropdown). Handler ini juga melakukan
`loadOrders()` + `refreshSelectedOrder()` setelah sukses agar state modal
terupdate.

**Loading state:** tombol disabled + teks "Menandai..." saat async berjalan.

**Tidak ada perubahan backend.**

### Section 3 — Status "Selesai" sebagai `<option disabled>` (Poin 3)

**Dropdown order (modal line 191-208):**

```tsx
<select value={order.status} onChange={...} className={...}>
  {STATUS_ORDER.filter((s) => s !== "SELESAI").map((s) => (
    <option key={s} value={s} className="bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100">
      {labelStatus(s)}
    </option>
  ))}
  {order.status === "SELESAI" && (
    <option disabled value="SELESAI" className="bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100">
      {labelStatus("SELESAI")}
    </option>
  )}
</select>
```

Option `SELESAI` hanya dirender saat value saat ini = `SELESAI`, dan
`disabled` agar tidak bisa dipilih ulang. Ini memperbaiki bug browser
auto-pilih option pertama karena tidak ada option yang cocok dengan value.

**Dropdown item (modal line 254-274):**

```tsx
const statusList = daftarStatusManualUntukItem(item); // tetap filter SIAP_AMBIL & SELESAI
const terminalStatus = ["SIAP_AMBIL", "SELESAI"];

<select value={item.status} onChange={...} className={...}>
  {statusList.map((s) => (
    <option key={s} value={s} ...>{labelStatus(s)}</option>
  ))}
  {terminalStatus.includes(item.status) && (
    <option disabled value={item.status} ...>{labelStatus(item.status)}</option>
  )}
</select>
```

Saat `item.status` = `SIAP_AMBIL` atau `SELESAI`, tambahkan option disabled
dengan value tersebut di akhir daftar, agar select menampilkan nilai benar.

**Backend guard (hardening):**

`updateProductionItemStatusAction` / service `updateProductionItemStatus`:
tolak `newStatus === "SIAP_AMBIL"` dan `newStatus === "SELESAI"` untuk item.
Status terminal item hanya boleh di-set via cascade (Siap Diambil) atau via
Pengambilan (Selesai). Return error friendly: "Status {label} item hanya
bisa di-set otomatis lewat Siap Diambil / Pengambilan."

`handleUpdateStatus` di page (line 214-218) sudah blokir `SELESAI` di
dropdown order — pertahankan. Tambahkan juga blok untuk `SIAP_AMBIL`? Tidak
perlu — `SIAP_AMBIL` di order sah via tombol cascade (Section 2). Dropdown
order tetap boleh pilih `SIAP_AMBIL` sebagai fallback.

**Tidak ada perubahan data model.**

### Section 4 — Pagination server-side limit/offset + counter total

**Backend `src/lib/services/production-service.ts`:**

Ubah signature `getProductionOrders`:

```ts
export async function getProductionOrders(params?: {
  limit?: number;
  offset?: number;
  search?: string;
  status?: string;
  prioritas?: string;
}): Promise<{ data: ProductionOrder[]; total: number }>;
```

- Default `limit = 50`, `offset = 0` jika tidak disediakan.
- Supabase: `.range(offset, offset + limit - 1)` + baca `count` dari response
  (`{ count: "exact" }`). Filter `penjualan_dibatalkan` di server
  (`.eq("penjualan_dibatalkan", false)` atau `.is("penjualan_dibatalkan", false)` —
  verifikasi nama kolom saat eksekusi, lihat query klien yang sudah ada
  `o.penjualan_dibatalkan` di page line 67).
- SQLite: `LIMIT ? OFFSET ?` + `SELECT COUNT(*)` terpisah.
- Filter `search`/`status`/`prioritas` diterapkan di server (bukan klien) agar
  pagination akurat terhadap filter.
- `orderBy: dibuat_pada DESC` dipertahankan.
- Enrichment item/finishing/konsumsi tetap batch setelah pagination header —
  hanya enrich order yang di-return, bukan semua.

**Fungsi baru `getProductionOrderCounts()`:**

```ts
export async function getProductionOrderCounts(): Promise<{
  MENUNGGU: number;
  PROSES: number;
  SIAP_AMBIL: number;
  SELESAI: number;
  DIBATALKAN: number;
  KILAT: number;
}>;
```

Satu query `select status, count(*) group by status` + satu query count
`prioritas = 'KILAT'`. Filter `penjualan_dibatalkan` tetap diterapkan. Dipakai
untuk 5 stat-card di page SPK.

**Action layer `src/app/produksi/spk/actions.ts`:**

```ts
export async function getProductionOrdersAction(params?: {
  limit?: number; offset?: number; search?: string; status?: string; prioritas?: string;
}): Promise<{ data: ProductionOrder[]; total: number }>;

export async function getProductionOrderCountsAction(): Promise<...>;
```

**Client `src/app/produksi/spk/page.tsx`:**

- State baru: `limit` (default 50), `offset` (default 0).
- SWR key:
  `` `production-orders:${limit}:${offset}:${searchQuery}:${filterStatus}:${filterPriority}` ``.
- `useCachedData` fetch `getProductionOrdersAction({ limit, offset, search: searchQuery, status: filterStatus, prioritas: filterPriority })`.
- `data` = `{ data: orders, total }`. `orders` dipakai untuk tabel.
- Counter stat-card pakai `useCachedData("production-order-counts", getProductionOrderCountsAction)` — key terpisah, tidak terpengaruh pagination/filter.
- Tombol "Muat 50 data lagi" muncul saat `orders.length < total`. Klik:
  `setLimit((n) => n + 50)` — re-fetch dengan limit lebih besar dari awal
  (single fetch, bukan append). Lebih simpel daripada append manual + offset.
- Saat filter (search/status/prioritas) berubah: `setLimit(50)` (reset).
- Empty state: tetap "Tidak ada order" saat `total === 0`, atau "Tidak ada
  yang sesuai filter" saat `total > 0 && orders.length === 0` (seharusnya
  tidak terjadi jika filter di server benar, tapi guard tetap ada).

**Pendekatan single-fetch vs append:**

Saya pilih single-fetch (limit tumbuh, offset tetap 0). Alasan:

- SWR cache key natural — tiap nilai limit punya cache sendiri, kembali ke
  atas tidak re-fetch.
- Tidak perduel append + dedupe.
- Payload tumbuh linear (50, 100, 150, ...) — masih jauh lebih ringan daripada
  fetch semua di awal.
- Saat user muat 500 lalu filter, reset ke 50 — payload kecil lagi.

Trade-off: refetch memuat ulang 100 baris saat muat 50 lagi (bukan hanya 50
baru). Untuk 2-5 user internal, ini acceptable.

**Cache invalidation:**

`useInvalidate` saat ini hanya invalidasi key exact. Untuk pagination,
invalidate semua key dengan prefix `production-orders`. Tambah helper di
`page.tsx`:

```ts
const { mutate } = useSWRConfig();
const invalidateOrders = useCallback(
  () => mutate((key) => typeof key === "string" && key.startsWith("production-orders")),
  undefined,
  { revalidate: true }
);
```

Pakai `invalidateOrders()` di handler `handleMarkSiapDiambil`,
`handleUpdateStatus`, `handleUpdateItemStatus`, `handleSaveCustomerName`,
`handlePostConsumption`, `handleVoidConsumption` — gantikan
`invalidate("production-orders")` + `loadOrders()`. Juga invalidate
`production-order-counts`.

**Pengambilan page (`src/app/produksi/pengambilan/page.tsx`):**

Sama — `listPengambilanBelumAction`/`listPengambilanSudahAction` terima
`{ limit, offset }`, return `{ data, total }`. Tab counter "Belum Diambil
({n})" dan "Sudah Diambil ({n})" pakai `total`, bukan `data.length`. Tombol
"Muat 50 data lagi" per tab. Invalidation prefix `pengambilan-belum` dan
`pengambilan-sudah`.

**Tantangan roll variants & consumption drafts di modal:** tidak terpengaruh
— tetap lazy-load per item saat modal dibuka (useEffect line 108-160 di
page).

## Error handling

- `setOrderStatusSiapDiambilCascadeAction` sudah throw error friendly via
  `friendlyPgError`. Tetap.
- `getProductionOrders` dengan filter tidak valid: return empty + total 0,
  tidak throw (konsisten dengan perilaku saat ini).
- Guard `SIAP_AMBIL`/`SELESAI` di `updateProductionItemStatus`: throw error
  dengan pesan Bahasa Indonesia, ditangkap di `handleUpdateItemStatus` →
  toast.

## Testing

- `src/lib/__tests__/production-order-detail.test.ts`: update mock
  `item_finishing` (hapus field `status`), pastikan enrichment tetap benar.
- `src/lib/__tests__/` (baru): `production-pagination.test.ts` — mock
  `db.query` return 100 order, assert `getProductionOrders({ limit: 50, offset: 0 })`
  return 50 data + total 100.
- `src/lib/__tests__/` (baru): `production-item-status-guard.test.ts` —
  assert `updateProductionItemStatus` tolak `SIAP_AMBIL` dan `SELESAI`.
- UI-only changes (modal, tombol, dropdown disabled) tidak wajib jest, tapi
  tetap butuh `npm run type-check` + `npm run build`.

## Urutan eksekusi rekomendasi

1. Section 1 (hapus status finishing) — perubahan data model, kerjakan
   dulu agar migration + sync 3 tempat selesai sebelum kode lain mengandalkan
   field itu hilang.
2. Section 3 (option disabled) — fix bug tampilan, tidak ada backend change
   selain guard item.
3. Section 2 (tombol Siap Diambil di modal) — frontend only.
4. Section 4 (pagination) — backend + frontend, paling besar.

## Verifikasi (wajib sebelum "done")

- `npm run type-check` → 0 error.
- `npm run build` → sukses.
- `npx jest src/lib/__tests__/production-order-detail.test.ts`
- `npx jest src/lib/__tests__/production-pagination.test.ts` (baru)
- `npx jest src/lib/__tests__/production-item-status-guard.test.ts` (baru)
- Migration diterapkan: `npm run supabase:db:push` setelah push schema.
- Cek `database/sqlite-schema.sql` dan runtime ALTER di `db-unified.ts` sync.
- Cek `src/lib/sync-config.ts` tidak referensi `status` di `item_finishing`.