# Spec — Beranda: Fix Navigasi Draf Pesanan Pembelian

> Sub-proyek D dari sesi brainstorming 2026-07-07.
> Bug: klik "Buat Draf" dari widget stok-menipis di Beranda membuka halaman
> Pesanan Pembelian sebentar lalu memantul kembali ke Beranda.

## 1. Latar belakang & gejala

`ReorderWidget` di `src/app/beranda/page.tsx:586-610` memanggil:

```ts
async function handleGenerate(vendorIds: string[] | null) {
  // ...
  const result = await generateDraftPurchaseOrdersAction(vendorIds ?? undefined);
  onChanged();                              // ← void mutateReorder() (SWR revalidate)
  if (result.created.length > 0) {
    router.push("/pesanan-pembelian");      // ← soft navigation
  }
  // ...
}
```

`onChanged()` (di L395-401) = `() => { void mutateReorder(); }` — memicu
SWR revalidate key `"dashboard-reorder-v1"`. Revalidate selesai sangat cepat
(cache lokal), men-trigger re-render `ReorderWidget` **sebelum/during** soft
navigation `router.push` di App Router (yang memakai `startTransition`
internal). Race ini menyebabkan navigasi tertunda/dibatalkan, lalu komponen
re-render di Beranda → pengguna "dipantul" kembali.

## 2. Tujuan

- Klik "Buat Draf" → navigasi **tetap** di `/pesanan-pembelian`, tidak
  memantul kembali ke Beranda.
- Cache SWR `"dashboard-reorder-v1"` tetap ter-invalidate supaya widget
  stok-menipis di Beranda refresh saat pengguna kembali ke Beranda nanti.

## 3. Solusi

**Ubah urutan: navigasi DULU, invalidate BELAKANG (fire-and-forget).**

```ts
async function handleGenerate(vendorIds: string[] | null) {
  setError(null);
  setGenerating(vendorIds === null ? "all" : vendorIds.join(","));
  try {
    const result = await generateDraftPurchaseOrdersAction(vendorIds ?? undefined);
    if (result.created.length > 0) {
      router.push("/pesanan-pembelian");   // ← navigasi dulu
      onChanged();                          // ← invalidate di background (fire-and-forget)
    } else {
      setError(
        "Tidak ada draf pesanan pembelian yang dibuat. Pastikan vendor sudah aktif.",
      );
      onChanged();                          // tetap refresh widget untuk kasus kosong
    }
  } catch (err) {
    setError(
      err instanceof Error
        ? err.message
        : "Gagal membuat draf pesanan pembelian",
    );
  } finally {
    setGenerating(null);
  }
}
```

Alasan:
- `router.push` dipanggil sebelum re-render SWR → navigasi tidak tertahan
  oleh state update di komponen yang akan unmount.
- `onChanged()` setelah `router.push` tetap memicu revalidate di background.
  Karena Beranda segera unmount (navigasi soft), revalidate selesai tanpa
  re-render visible; cache sudah fresh saat pengguna kembali ke Beranda.
- Untuk cabang "tidak ada draf" (length === 0), tetap di Beranda + invalidate
  supaya widget update (mungkin stok sudah berubah oleh action).

## 4. File yang diubah

| File | Perubahan |
|---|---|
| `src/app/beranda/page.tsx` (L586-610, fungsi `handleGenerate`) | Tukar urutan `router.push` ↔ `onChanged()` sesuai solusi di atas. |

Tidak ada perubahan skema, tidak ada perubahan API, tidak ada perubahan service.

## 5. Error handling

Tidak berubah — error dari `generateDraftPurchaseOrdersAction` tetap ditangkap
di `catch` dan ditampilkan via `setError`. `setGenerating(null)` di `finally`
tetap jalan.

## 6. Testing

### Manual (wajib)
1. Buka Beranda, pastikan ada item stok menipis.
2. Klik "Buat Draf" (atau "Buat untuk semua vendor").
3. Verifikasi: halaman pindah ke `/pesanan-pembelian` dan **tetap** di sana
   (tidak memantul ke Beranda).
4. Klik back ke Beranda → verifikasi widget stok-menipis sudah ter-update
   (item yang sudah punya draf PO tidak muncul lagi / jumlah berkurang).

### Otomatis (opsional, ringan)
Karena ini adalah race condition UI yang sulit direproduksi di jsdom, test
otomatis di-skip. Fokus pada verifikasi manual. Jika ingin guard regresi:
- Render `ReorderWidget` dengan mock `generateDraftPurchaseOrdersAction`
  returning `{ created: [{ id: "po-1" }] }`, mock `useRouter` push, lalu
  assert `router.push` dipanggil **sebelum** `mutateReorder`. (Prioritas
  rendah — tambahkan hanya kalau mudah.)

## 7. Out of scope

- Performa widget stok-menipis (pagination/cache) — bukan isu ini.
- Perubahan tampilan widget reorder.
- Perubahan action `generateDraftPurchaseOrdersAction`.