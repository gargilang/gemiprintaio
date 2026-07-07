# Sub-proyek D: Beranda — Fix Navigasi Draf Pesanan Pembelian — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Klik "Buat Draf" dari widget stok-menipis di Beranda harus tetap
navigasi ke `/pesanan-pembelian`, tidak memantul kembali ke Beranda. Cache SWR
`"dashboard-reorder-v1"` tetap ter-invalidate supaya widget refresh saat
pengguna kembali ke Beranda.

**Root cause:** Pada `handleGenerate` (`src/app/beranda/page.tsx:586-610`),
`onChanged()` (yang memicu `void mutateReorder()` → revalidate SWR lokal yang
sangat cepat) dipanggil **sebelum** `router.push("/pesanan-pembelian")`.
Revalidate selesai sebelum/during soft navigation (App Router pakai
`startTransition` internal), men-trigger re-render `ReorderWidget` di Beranda
sebelum navigasi sempat commit → navigasi tertunda/dibatalkan, pengguna
"memantul" kembali.

**Solusi:** Tukar urutan — navigasi DULU, invalidate BELAKANG
(fire-and-forget). Untuk cabang "tidak ada draf" (`created.length === 0`),
tetap di Beranda + invalidate supaya widget update (stok mungkin berubah oleh
action).

**Tech Stack:** Next.js 15 (App Router, `useRouter().push`), React 19, SWR
(`useCachedData`), Bahasa Indonesia untuk UI/komentar.

**Scope:** Hanya 1 file berubah: `src/app/beranda/page.tsx`. Tidak ada
perubahan skema, API, service, atau Tauri. Tidak ada test otomatis (race
condition UI sulit direproduksi di jsdom — lihat spec Section 6).

## Global Constraints

- Bahasa Indonesia untuk semua UI strings, komentar baru, pesan error. Framework/library terms boleh English.
- Tidak boleh import `getSupabaseAdmin` dari client code.
- Fetch data client pakai `useCachedData` (SWR), bukan `useAsyncData` — sudah diterapkan di kode eksisting, jangan diregresi.
- Dark mode wajib: setiap color class butuh pasangan `dark:`. Perubahan ini tidak menambah elemen UI, jadi tidak ada class baru.
- Icons: SVG components dari `src/components/icons/`, jangan emoji. Tidak ada icon baru di sub-proyek ini.
- Verifikasi wajib selesai "done": `npm run type-check` (0 error) → `npm run build`. UI-only change → jest opsional (spec bilang skip karena race condition jsdom).
- Node 22 + npm. Next.js standalone.
- Tidak commit secrets (`.env.local`, keys, certs).
- Deployed-contract safety: tidak ada rename kolom/API di sub-proyek ini.

## File Structure

**Modify:**
- `src/app/beranda/page.tsx` — fungsi `handleGenerate` di L586-610: tukar urutan `router.push` ↔ `onChanged()`.

**Create:** none.

---

### Task 1: Tukar urutan `router.push` ↔ `onChanged()` di `handleGenerate`

**File:** `src/app/beranda/page.tsx` (L586-610, fungsi `handleGenerate`)

**Alasan:** Lihat root cause di header plan. Navigasi harus dijalankan
sebelum re-render SWR yang dipicu `onChanged()`.

- [ ] **Step 1: Baca fungsi `handleGenerate` untuk konfirmasi state saat ini**

Baca `src/app/beranda/page.tsx:586-610` dan konfirmasi signature `onChanged`
(di L395-401, `() => { void mutateReorder(); }`). Jangan ubah wiring
`onChanged` — hanya urutan pemanggilan di dalam `handleGenerate`.

- [ ] **Step 2: Tukar urutan pemanggilan di cabang `created.length > 0`**

**Before (L586-610):**
```ts
  async function handleGenerate(vendorIds: string[] | null) {
    setError(null);
    setGenerating(vendorIds === null ? "all" : vendorIds.join(","));
    try {
      const result = await generateDraftPurchaseOrdersAction(
        vendorIds ?? undefined,
      );
      onChanged();
      if (result.created.length > 0) {
        router.push("/pesanan-pembelian");
      } else {
        setError(
          "Tidak ada draf pesanan pembelian yang dibuat. Pastikan vendor sudah aktif.",
        );
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

**After:**
```ts
  async function handleGenerate(vendorIds: string[] | null) {
    setError(null);
    setGenerating(vendorIds === null ? "all" : vendorIds.join(","));
    try {
      const result = await generateDraftPurchaseOrdersAction(
        vendorIds ?? undefined,
      );
      if (result.created.length > 0) {
        // Navigasi DULU sebelum invalidate SWR — kalau onChanged() dipanggil
        // lebih dulu, revalidate lokal selesai sebelum soft navigation commit,
        // men-trigger re-render ReorderWidget di Beranda dan memantulkan
        // pengguna kembali ke Beranda (race App Router startTransition).
        router.push("/pesanan-pembelian");
        onChanged(); // fire-and-forget: Beranda segera unmount, cache refresh di background
      } else {
        setError(
          "Tidak ada draf pesanan pembelian yang dibuat. Pastikan vendor sudah aktif.",
        );
        onChanged(); // tetap di Beranda: refresh widget (stok mungkin berubah oleh action)
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

**Catatan:**
- `onChanged()` dipindah ke **dalam** tiap cabang `if/else`, bukan satu
  pemanggilan di atas. Alasannya: pada cabang `length > 0`, navigasi harus
  didahului; pada cabang `length === 0`, tidak ada navigasi jadi invalidate
  tetap boleh sinkron (pengguna tetap di Beranda, re-render aman).
- `router.push` di App Router adalah soft navigation (non-blocking); tidak
  perlu `await`. Memanggil `onChanged()` tepat setelahnya membuat revalidate
  berjalan paralel dengan transition — aman karena Beranda akan unmount.
- Error handling di `catch` dan `finally` tidak berubah.
- Komentar baru wajib Bahasa Indonesia sesuai iron rules AGENTS.md.

- [ ] **Step 3: Verifikasi tidak ada panggilan `onChanged()` lain yang ikut bergeser**

Cek bahwa perubahan hanya pada `handleGenerate`. Tidak ada perubahan pada:
- Props `ReorderWidget` (L570-586) — `onChanged: () => void` tetap.
- Wiring `onChanged={() => { void mutateReorder(); }}` (L395-401) — tetap.
- Tombol "Buat Draf" / "Buat untuk semua vendor" di JSX `ReorderWidget`
  (di bawah L612) — `onClick={() => handleGenerate(...)}` tetap.

---

### Task 2: Verifikasi type-check + build

**Files:** none (verifikasi only)

- [ ] **Step 1: Run full type-check**

Run: `npm run type-check`
Expected: 0 error. Perubahan hanya mengubah urutan pemanggilan fungsi
existing — tidak ada signature baru — jadi tidak boleh ada type error baru.

- [ ] **Step 2: Run full build**

Run: `npm run build`
Expected: sukses. Tidak boleh ada error build.

- [ ] **Step 3: Run lint (opsional, ringan)**

Run: `npm run lint`
Expected: 0 error. Jika ada warning baru dari komentar Bahasa Indonesia
(mis. eslint-disable yang hilang), perbaiki. Jika tidak ada warning baru, skip.

- [ ] **Step 4: Verifikasi manual di browser (wajib — spec Section 6)**

Karena race condition tidak tertangkap jest/jsdom, verifikasi manual:
1. Buka Beranda, pastikan ada item stok menipis (widget `ReorderWidget`
   visible dengan vendor Groups).
2. Klik "Buat Draf" untuk satu vendor, atau "Buat untuk semua vendor".
3. Verifikasi: halaman pindah ke `/pesanan-pembelian` dan **tetap** di sana
   (tidak memantul ke Beranda dalam ~1 detik).
4. Klik back (atau navigasi manual) ke Beranda → verifikasi widget stok-menipis
   sudah ter-update (item yang sudah punya draf PO tidak muncul lagi / jumlah
   berkurang). Ini konfirmasi `onChanged()` tetap berjalan.
5. Ulangi untuk kasus "tidak ada draf" (mis. semua vendor sudah punya draf /
   stok sudah di atas threshold): verifikasi pesan error tampil dan widget
   ter-refresh.

- [ ] **Step 5: Commit (jika owner meminta)**

Hanya jika owner explicit minta commit (iron rule AGENTS.md). Pesan:
```
fix(beranda): navigasi draf PO dulu, baru invalidate SWR

Tukar urutan router.push ↔ onChanged() di handleGenerate agar klik
"Buat Draf" tidak memantul kembali ke Beranda (race startTransition).
```

---

## Self-Review

**1. Spec coverage:**
- Section 3 (Solusi: navigasi dulu, invalidate belakang): Task 1 Step 2. ✓
- Section 4 (File yang diubah: `src/app/beranda/page.tsx` L586-610): Task 1. ✓
- Section 5 (Error handling tidak berubah): Task 1 Step 2 `catch`/`finally` dipertahankan. ✓
- Section 6 (Testing manual wajib, otomatis skip): Task 2 Step 4 manual, jest opsional di-skip sesuai spec. ✓
- Section 7 (Out of scope — tidak ubah action/widget): hanya `handleGenerate` berubah. ✓

**2. Placeholder scan:** Tidak ada TBD/TODO. Tidak ada angka/ID placeholder.

**3. Type consistency:**
- `handleGenerate(vendorIds: string[] | null)` signature tidak berubah. ✓
- `onChanged: () => void` props tidak berubah (L570-586). ✓
- `router.push("/pesanan-pembelian")` — `router` dari `useRouter()` di L577, tidak berubah. ✓
- `generateDraftPurchaseOrdersAction` return type `{ created: ... }` — asumsi dari kode eksisting (spec mengasumsikan `result.created.length > 0` valid). Tidak ada perubahan signature. ✓
- `setError`/`setGenerating` state setters — tidak berubah. ✓

**4. Risk analysis:**
- **Risiko rendah.** Perubahan hanya urutan pemanggilan 2 fungsi existing di 1 file, tidak ada signature baru, tidak ada skema/API/service.
- **Race condition fix correctness:** `router.push` di App Router menjadwalkan navigation via `startTransition`; memanggil `onChanged()` (yang trigger state update + SWR revalidate) setelah `router.push` membuat transition sudah "queued" sebelum state Beranda berubah. Re-render yang dipicu revalidate tidak membatalkan navigation yang sudah scheduled. Ini alasan spec memilih urutan ini.
- **Edge case "tidak ada draf":** `onChanged()` tetap dipanggil di cabang `else` (sinkron, aman karena tidak ada navigasi). Tidak ada regresi: widget tetap refresh.
- **Edge case error:** `catch` + `finally` tidak menyentuh `onChanged()` — tidak ada invalidate pada error. Ini behavior eksisting, dipertahankan (spec Section 5: "tidak berubah"). Catatan: pada error, widget tidak refresh — acceptable karena tidak ada data berubah.
- **Edge case generate timeout:** `setGenerating(null)` di `finally` tetap jalan walau navigasi terjadi (closure tetap eksekusi walau komponen unmount — React toleran terhadap setState setelah unmount di production; warning hanya di dev strict mode dan tidak fatal).

**5. Verification gate:**
- `npm run type-check` 0 error (Task 2 Step 1). ✓ required by iron rule 10.
- `npm run build` sukses (Task 2 Step 2). ✓ required by iron rule 10.
- Manual browser verification (Task 2 Step 4). ✓ required by spec Section 6 (race condition jsdom skip).
- Jest: di-skip sesuai spec (race condition tidak reproduktif di jsdom). Iron rule 10 mengizinkan skip jest untuk UI-only changes — perubahan ini UI-only.

Plan lengkap. 2 task (Task 1: perubahan kode; Task 2: verifikasi). Tidak ada
dependency antar task selain urutan (Task 2 setelah Task 1). Tidak ada task
paralel — sub-proyek terlalu kecil untuk dispatching-parallel-agents.