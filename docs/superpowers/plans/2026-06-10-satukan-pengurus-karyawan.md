# Satukan Manajemen Orang (Pengurus & Karyawan) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. Jalankan satu subagent saja pada satu waktu (aturan proyek).

**Goal:** Satukan sistem orang jadi satu sumber kebenaran per orang (`pegawai`/`business_actors`), dengan bagi hasil "sadar sisa" (hard cap 100%), halaman Karyawan menampilkan semua orang kecuali Pemilik, dan Ringkasan Pengurus menampilkan kasbon nyata dari ledger.

**Architecture:** Murni frontend + action + satu helper service. Tidak ada migrasi DB (DB baru di-reset). Bagi hasil tetap di kolom `pegawai.profit_share_percent` (satu pintu: tab Pengurus). Gaji di `komponen_kompensasi`, kasbon di ledger `pinjaman_karyawan`. Tiga layar hanya menyaring/menampilkan data orang yang sama.

**Tech Stack:** TypeScript, Next.js 16, React 19, SWR (`useCachedData`), server actions, AST cashbook engine. Verifikasi: `npm run type-check` → `npm run build` → `npx jest`.

---

## Urutan & strategi

Tiga task independen. Verifikasi tiap task: `npm run type-check` (0 error). Build penuh + jest di task terakhir. Commit per task.

### Task 1: Bagi hasil "sadar sisa" + hard cap 100% di TabPengurus

**Files:**
- Modify: `src/components/finance/pengaturan-keuangan/TabPengurus.tsx`

Tujuan: saat tambah pengurus baru, field Bagi Hasil otomatis terisi `sisa = 100 − Σ(profit_share_percent pengurus aktif lain)`. Saat simpan, tolak bila total > 100 (hard cap). Nonaktif/hapus otomatis mengembalikan jatah (karena `sisa` dihitung dari pengurus aktif saja — sudah otomatis).

- [ ] **Step 1: Tambah helper `sisaBagiHasil`**

Di dalam komponen `TabPengurus`, setelah `filteredActors` (atau dekat `actors`), tambah perhitungan sisa. `actors` adalah `BusinessActorApi[]`; field `is_active` (number) dan `profit_share_percent` (number|null) sudah ada di interface.

```tsx
  // Sisa jatah bagi hasil = 100 − Σ(bagi hasil pengurus AKTIF lain).
  // Saat edit, kecualikan diri sendiri agar tidak menghitung jatahnya dua kali.
  const sisaBagiHasil = useMemo(() => {
    const terpakai = actors
      .filter((a) => a.is_active === 1 && a.id !== editingActorId)
      .reduce((sum, a) => sum + (a.profit_share_percent ?? 0), 0);
    return Math.max(0, 100 - terpakai);
  }, [actors, editingActorId]);
```

- [ ] **Step 2: Default field bagi hasil = sisa saat buka form Tambah**

Cari tombol "+ Tambah Pengurus" (handler `onClick` yang memanggil `setOrangForm({ ...EMPTY_ORANG, role_code: ... })` lalu `setFormOpen(true)`). Ubah agar mengisi `enable_profit_share: true` dan `profit_share_percent` dengan sisa:

```tsx
          <button type="button" onClick={() => { setEditingActorId(null); setOrangForm({ ...EMPTY_ORANG, role_code: roles[0]?.role_code ?? "", enable_profit_share: true, profit_share_percent: String(sisaBagiHasil) }); setFormOpen(true); }} className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 font-semibold">
            + Tambah Pengurus
          </button>
```

- [ ] **Step 3: Tampilkan info sisa + hard cap di input persentase**

Di blok Bagi Hasil (cari `<label className="block text-xs font-semibold ...">Persentase (%)</label>` di section `enable_profit_share`), tambahkan teks bantu sisa di bawah input. Ganti blok `<div className="mt-3">…</div>` menjadi:

```tsx
              <div className="mt-3">
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Persentase (%)</label>
                <input type="number" min="0" max="100" step="0.01" value={orangForm.profit_share_percent} onChange={(e) => setF("profit_share_percent", e.target.value)} placeholder="Mis. 40" className="w-40 px-3 py-2 text-sm border border-slate-300 rounded-md dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500" />
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Sisa jatah bagi hasil tersedia: <strong>{sisaBagiHasil}%</strong>. Total semua pengurus tidak boleh lebih dari 100%.</p>
              </div>
```

- [ ] **Step 4: Hard cap di `submitOrang`**

Di fungsi `submitOrang`, setelah cek `if (!orangForm.enable_profit_share)` dan sebelum `setOrangSaving(true)`, tambahkan validasi cap:

```tsx
    const persenInput = Number(orangForm.profit_share_percent) || 0;
    if (persenInput > sisaBagiHasil) {
      showMsg("error", `Bagi hasil ${persenInput}% melebihi sisa jatah ${sisaBagiHasil}%. Total semua pengurus maksimal 100%.`);
      return;
    }
```

- [ ] **Step 5: Verifikasi**

Run: `npm run type-check`
Expected: 0 error.

- [ ] **Step 6: Commit**

```bash
git add src/components/finance/pengaturan-keuangan/TabPengurus.tsx
git commit -m "feat(pengurus): bagi hasil sadar sisa + hard cap 100%"
```

### Task 2: Halaman Karyawan tampilkan semua kecuali Pemilik

**Files:**
- Modify: `src/app/penggajian/actions.ts`
- Modify: `src/app/penggajian/page.tsx`

Tujuan: daftar Karyawan menampilkan semua orang yang `role_group !== "owner"` (termasuk penerima bagi hasil non-Pemilik seperti manajer, supaya kasbon mereka tetap bisa diatur). Perlu `role_group` di `RingkasanKaryawan`.

- [ ] **Step 1: Tambah `role_group` ke `RingkasanKaryawan` + isi dari peran**

Di `src/app/penggajian/actions.ts`, interface `RingkasanKaryawan` tambah field. Lalu di `listRingkasanKaryawanAction`, muat peran sekali dan petakan `role_code → role_group`.

Ubah interface:

```ts
export interface RingkasanKaryawan {
  actor_id: string;
  nama: string;
  role_code: string;
  role_group: string;
  jumlah_komponen: number;
  tipe_komponen: string[];
  saldo_pinjaman: number;
  profit_share_percent: number | null;
}
```

Di `listRingkasanKaryawanAction`, sebelum `const actors = ...`, ganti awal fungsi menjadi (memuat roles untuk peta group):

```ts
  try {
    const [actors, roles] = await Promise.all([
      listBusinessActors({ includeInactive: false }),
      listActorRoles(),
    ]);
    const groupByCode = new Map(roles.map((r) => [r.role_code, r.role_group]));
    const hasil: RingkasanKaryawan[] = [];
    for (const a of actors) {
      const komponen = await listKomponen(a.id);
      const aktif = komponen.filter((k) => Number(k.aktif_status ?? 1) === 1);
      const saldo = await hitungSaldoPinjaman(a.id);
      hasil.push({
        actor_id: a.id,
        nama: a.display_name,
        role_code: a.role_code,
        role_group: groupByCode.get(a.role_code) ?? "other",
        jumlah_komponen: aktif.length,
        tipe_komponen: Array.from(new Set(aktif.map((k) => k.tipe))),
        saldo_pinjaman: saldo,
        profit_share_percent: a.profit_share_percent,
      });
    }
    return hasil;
```

(`listActorRoles` sudah diimpor dari `business-actor-service` di file ini.)

- [ ] **Step 2: Ubah filter di halaman Karyawan**

Di `src/app/penggajian/page.tsx`, ganti `karyawan` memo:

```ts
  const karyawan = useMemo(
    () => (data ?? []).filter((k) => k.role_group !== "owner"),
    [data]
  );
```

- [ ] **Step 3: Verifikasi**

Run: `npm run type-check`
Expected: 0 error.

- [ ] **Step 4: Commit**

```bash
git add src/app/penggajian/actions.ts src/app/penggajian/page.tsx
git commit -m "feat(karyawan): tampilkan semua orang kecuali Pemilik"
```

### Task 3: Ringkasan Pengurus tampilkan kasbon nyata (ledger) + bonus/komisi (komponen)

**Files:**
- Modify: `src/app/api/keuangan/summary-v2/route.ts`
- Modify: `src/components/finance/RingkasanPengurus.tsx`

Tujuan: panel "Pengurus Usaha" menampilkan, per pengurus, kolom Kasbon (saldo ledger `pinjaman_karyawan`) dan Bonus (Σ komponen tipe BONUS+KOMISI). Bagi Hasil tetap dari AST. Karena kasbon/bonus kini di sumber baru, kita injeksi nilainya ke baris ringkasan di server.

Konteks: `getActorFinanceSummary` (di `formula-service.ts`) mengembalikan `{ columns: {formulaKey,label,group}[], rows: {actorId, displayName, roleLabel, metrics, displayOrder, isGlobal}[] }`. `RingkasanPengurus` hanya menampilkan baris `!isGlobal` dan sudah punya kolom grup `profit_share`/`cash_advance`/`bonus`. Kita tambahkan kolom sintetis `kasbon_ledger` (grup `cash_advance`) dan `bonus_komponen` (grup `bonus`), lalu isi metrics per actor.

- [ ] **Step 1: Injeksi kolom + nilai kasbon/bonus di summary-v2 route**

Di `src/app/api/keuangan/summary-v2/route.ts`, tambah impor:

```ts
import { hitungSaldoPinjaman } from "@/lib/services/pinjaman-karyawan-service";
import { listKomponen } from "@/lib/services/komponen-kompensasi-service";
```

Setelah `const summary = await getActorFinanceSummary(...)` dan sebelum `const systemMetrics = {`, sisipkan augmentasi (hanya untuk baris actor non-global yang punya `actorId`):

```ts
    // Injeksi kasbon (ledger) + bonus/komisi (komponen) per pengurus.
    // Sumber kebenaran: pinjaman_karyawan & komponen_kompensasi — bukan AST,
    // karena form Pengurus tidak lagi membuat rumus kasbon/bonus per orang.
    const adaKasbon = { ada: false };
    const adaBonus = { ada: false };
    for (const row of summary.rows) {
      if (row.isGlobal || !row.actorId) continue;
      const saldoKasbon = await hitungSaldoPinjaman(row.actorId);
      const komponen = await listKomponen(row.actorId);
      const bonusKomisi = komponen
        .filter((k) => Number(k.aktif_status ?? 1) === 1 && (k.tipe === "BONUS" || k.tipe === "KOMISI"))
        .reduce((sum, k) => sum + (k.metode === "TETAP" ? Number(k.nominal) || 0 : 0), 0);
      if (saldoKasbon !== 0) {
        row.metrics["kasbon_ledger"] = saldoKasbon;
        adaKasbon.ada = true;
      }
      if (bonusKomisi !== 0) {
        row.metrics["bonus_komponen"] = bonusKomisi;
        adaBonus.ada = true;
      }
    }
    if (adaKasbon.ada) {
      summary.columns.push({ formulaKey: "kasbon_ledger", label: "Kasbon", group: "cash_advance" });
    }
    if (adaBonus.ada) {
      summary.columns.push({ formulaKey: "bonus_komponen", label: "Bonus/Komisi", group: "bonus" });
    }
```

Catatan: hanya komponen BONUS/KOMISI metode TETAP yang dijumlahkan (metode PERSEN butuh nilai periode yang tidak tersedia di konteks ringkasan; tampilkan 0 untuk persen agar tidak menyesatkan).

- [ ] **Step 2: Verifikasi type-check**

Run: `npm run type-check`
Expected: 0 error. (`SummaryColumn`/baris memakai tipe yang sudah ada; `row.metrics` adalah `Record<string, number|null>`.)

- [ ] **Step 3: Build + jest**

Run: `npm run build`
Expected: build sukses.

Run: `npx jest evaluator pinjaman-karyawan`
Expected: semua test PASS (perubahan tidak menyentuh AST evaluator maupun service kasbon).

- [ ] **Step 4: Uji manual (browser, localhost:3000)**

1. Pengaturan → Pengurus: tambah Gemi (Pemilik) → default 100%; ubah 50% → simpan. Tambah Suri (Manajer) → default sudah 50%; simpan. Coba tambah orang ketiga 60% → ditolak (sisa 50%).
2. Halaman Karyawan: Suri (penerima bagi hasil, non-Pemilik) MUNCUL; Gemi (Pemilik) TIDAK muncul. Atur kasbon Suri → tarik 1.000.000.
3. Halaman Keuangan → Ringkasan Pengurus: Suri muncul dengan Bagi Hasil + kolom Kasbon 1.000.000.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/keuangan/summary-v2/route.ts src/components/finance/RingkasanPengurus.tsx
git commit -m "feat(keuangan): Ringkasan Pengurus tampilkan kasbon ledger + bonus komponen"
```

## Catatan untuk eksekutor

- Tidak ada perubahan DB/migrasi (DB sudah di-reset).
- Modal Kompensasi TIDAK punya tipe "Bagi Hasil" — jadi tidak ada yang dicabut; bagi hasil murni diatur di tab Pengurus.
- `RingkasanPengurus.tsx` mungkin tidak butuh perubahan kode bila kolom sintetis sudah cukup (komponen sudah render grup `cash_advance`/`bonus` secara dinamis). Sentuh file itu hanya bila uji manual menunjukkan label perlu disesuaikan.
- Verifikasi tiap task dengan `npm run type-check`; build + jest di Task 3.
