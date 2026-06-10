# Pisahkan Pengurus & Karyawan — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Jalankan satu subagent saja pada satu waktu (aturan proyek).

**Goal:** Pisahkan dengan tegas "Pengurus" (penerima bagi hasil, dikelola di Pengaturan Keuangan) dari "Karyawan" (penerima gaji, dikelola di halaman Penggajian), pangkas form lama, tambah pintu masuk "Tambah Karyawan" dari Penggajian, dan rapikan istilah + Bahasa Indonesia.

**Architecture:** Murni perubahan frontend + teks. Satu orang tetap satu baris tabel `pegawai` (`business_actors`); tempat tampil ditentukan dinamis dari `profit_share_percent` dan jumlah komponen kompensasi. `syncFormulasForActor` sudah data-driven, jadi cukup form berhenti mengirim field kasbon/bonus — tidak ada perubahan service/DB. DB masih kosong (tahap pengembangan), tidak ada migrasi data.

**Tech Stack:** TypeScript, Next.js 16, React 19, SWR (`useCachedData`), `ModalFormShell`, server actions. Verifikasi: `npm run type-check` → `npm run build`.

---

## Urutan & strategi

Frontend-only, tidak ada test service baru (logika service tak berubah). Verifikasi tiap task: `npm run type-check` (0 error). Build penuh + cek browser di task terakhir. Commit per task.

### Task 1: Pangkas form Pengurus — hapus Kasbon + Bonus, filter daftar, rename "Pengurus"

**Files:**
- Modify: `src/components/finance/pengaturan-keuangan/TabPengurus.tsx`

Tujuan: form orang hanya Nama + Jabatan + Bagi Hasil (%) + Catatan. Daftar hanya tampilkan pengurus (`profit_share_percent !== null`). Hapus section Kasbon (picker kategori + "Keperluan harus mengandung" + `QuickAddCategoryButton`) dan section Bonus. Hentikan pengiriman `cash_advance_categories`, `keperluan_keyword`, `bonus_percent`, `bonus_source_formula_key`.

- [ ] **Step 1: Hapus `QuickAddCategoryButton` + state & impor terkait kategori**

Hapus komponen `QuickAddCategoryButton` (seluruh fungsi). Hapus state `finCats`, `setFinCats`, dan `apiJSON<...categories...>` di efek load. Hapus tipe `FinanceCatOption` bila tak terpakai lagi.

- [ ] **Step 2: Sederhanakan `OrangForm` + `EMPTY_ORANG`**

Sisakan field: `display_name`, `role_code`, `notes`, `enable_profit_share`, `profit_share_percent`. Hapus `enable_cash_advance`, `kasbon_category_codes`, `keperluan_keyword`, `enable_bonus`, `bonus_percent`, `bonus_source_formula_key` dari interface, `EMPTY_ORANG`, `actorToForm`, dan `describeActor`.

- [ ] **Step 3: Hapus JSX section Kasbon & Bonus + preview-nya**

Di body modal form, hapus blok `{/* Kasbon */}` dan `{/* Bonus */}` sepenuhnya. Di `orangPreview`, sisakan hanya cabang bagi hasil. Validasi `submitOrang`: ganti syarat "centang minimal satu rumus" menjadi "wajib aktifkan Bagi Hasil" (karena ini tab Pengurus).

- [ ] **Step 4: `submitOrang` kirim payload bagi-hasil saja**

Body POST `/api/business-actors` hanya kirim: `action`, `id`, `display_name`, `role_code`, `notes`, `profit_share_percent` (atau `null`). JANGAN kirim field kasbon/bonus (parseActorInput akan set null → `syncFormulasForActor` otomatis tak membuat kolomnya).

- [ ] **Step 5: Filter daftar ke pengurus + rename label**

`filteredActors` tambah filter `a.profit_share_percent !== null`. Ganti judul/tombol "Pegawai" → "Pengurus" ("Tambah Pegawai" → "Tambah Pengurus", "Edit Pegawai" → "Edit Pengurus", dst.). Empty-state: "Belum ada pengurus. Tekan + Tambah Pengurus…".

- [ ] **Step 6: Verifikasi**

Run: `npm run type-check`
Expected: 0 error (tak ada referensi tersisa ke field yang dihapus).

- [ ] **Step 7: Commit**

```bash
git add src/components/finance/pengaturan-keuangan/TabPengurus.tsx
git commit -m "refactor(pengurus): pangkas form jadi bagi hasil saja + filter daftar pengurus"
```

### Task 2: Rename tab + istilah di PengaturanKeuanganModal & halaman Keuangan

**Files:**
- Modify: `src/components/finance/PengaturanKeuanganModal.tsx`
- Modify: `src/app/keuangan/page.tsx:1150,1270`

- [ ] **Step 1: Ganti label tab "Pegawai" → "Pengurus"**

Di `PengaturanKeuanganModal.tsx`, array `TABS`, ubah `{ id: "pengurus", label: "Pegawai" }` menjadi `label: "Pengurus"`. Footer hitungan: `${pengurusAktif} pegawai aktif` → `${pengurusAktif} pengurus aktif`.

- [ ] **Step 2: Ganti komentar/teks "Pegawai" di keuangan/page.tsx**

Baris ~1150 komentar `{/* Pegawai Usaha — ... */}` → `{/* Pengurus Usaha — ... */}`. Baris ~1270 `title="Kelola pegawai, kategori transaksi, dan rumus kalkulasi"` → `title="Kelola pengurus, kategori transaksi, dan rumus kalkulasi"`.

- [ ] **Step 3: Verifikasi + commit**

Run: `npm run type-check` → 0 error.
```bash
git add src/components/finance/PengaturanKeuanganModal.tsx src/app/keuangan/page.tsx
git commit -m "refactor(keuangan): label tab Pengurus + istilah"
```

### Task 3: Indonesia-kan + recontext DynamicActorSummary ke "Pengurus"

**Files:**
- Modify: `src/components/finance/DynamicActorSummary.tsx`

- [ ] **Step 1: Terjemahkan komentar/JSDoc ke Bahasa Indonesia baku**

Header komponen ("Per-person finance summary panel…"), komentar `fetchSummary`, `sumGroup`, dan komentar `swrKey` panjang → Bahasa Indonesia. Jangan ubah identifier/prop.

- [ ] **Step 2: Teks UI ke konteks Pengurus**

- "Memuat ringkasan pegawai…" → "Memuat ringkasan pengurus…"
- "Pegawai Usaha" → "Pengurus Usaha"
- "({actorRows.length} pegawai)" → "({actorRows.length} pengurus)"
- "Buka Pengaturan → Pegawai" → "Buka Pengaturan → Pengurus"
- `title="Pengaturan → Pegawai"` + `aria-label="Pengaturan Pegawai"` → "Pengaturan → Pengurus" / "Pengaturan Pengurus"
- "Belum ada rumus — edit di Pengaturan → Pegawai" → "Belum ada rumus — edit di Pengaturan → Pengurus"
- Pesan `legacyCount`: "Kelola pegawai di … Pengaturan → Pegawai" → "Kelola pengurus di … Pengaturan → Pengurus".

- [ ] **Step 3: Empty-state tanpa kasbon/bonus**

Ganti kalimat empty-state: "Belum ada pegawai terdaftar. Tambah di **Pengaturan → Pegawai**, lalu centang bagi hasil, kasbon, atau bonus agar angka muncul di kolom di bawah." → "Belum ada pengurus terdaftar. Tambah di **Pengaturan → Pengurus**, lalu atur bagi hasil agar angka muncul di kolom di bawah."

- [ ] **Step 4: Verifikasi + commit**

Run: `npm run type-check` → 0 error.
```bash
git add src/components/finance/DynamicActorSummary.tsx
git commit -m "refactor(keuangan): Indonesia-kan + recontext DynamicActorSummary ke Pengurus"
```

### Task 4: Server action tambah karyawan + daftar peran karyawan

**Files:**
- Modify: `src/app/penggajian/actions.ts`

Tambah action membuat orang baru (tanpa bagi hasil) + helper daftar peran non-owner untuk dropdown.

- [ ] **Step 1: Tambah impor**

Di `actions.ts`, tambahkan ke impor dari `business-actor-service`: `createBusinessActor`, `listActorRoles`. (`listBusinessActors` sudah diimpor.)

- [ ] **Step 2: Tambah action `listPeranKaryawanAction`**

Kembalikan peran yang grup-nya BUKAN `owner` (owner = ranah Pengurus/bagi hasil). Ungated (read).

```ts
// ── Peran untuk dropdown Tambah Karyawan (sembunyikan grup owner) ────────────
export async function listPeranKaryawanAction() {
  try {
    const roles = await listActorRoles();
    return roles.filter((r) => r.role_group !== "owner");
  } catch (error) {
    console.error("listPeranKaryawanAction error:", error);
    throw error;
  }
}
```

- [ ] **Step 3: Tambah action `tambahKaryawanAction`**

Buat orang tanpa bagi hasil/kasbon/bonus. Guarded. Kembalikan `actor_id` untuk alur auto-buka Atur Kompensasi.

```ts
// ── Tambah karyawan baru (tanpa bagi hasil) ─────────────────────────────────
export async function tambahKaryawanAction(input: {
  display_name: string;
  role_code: string;
  notes?: string;
}) {
  try {
    await requireAdminOrManager();
    const created = await createBusinessActor({
      display_name: input.display_name,
      role_code: input.role_code,
      notes: input.notes ?? null,
      profit_share_percent: null,
      cash_advance_categories: null,
      keperluan_keyword: null,
      bonus_percent: null,
      bonus_source_formula_key: null,
    });
    if (created.error || !created.data) {
      throw new Error(created.error?.message || "Gagal menambah karyawan");
    }
    return { success: true, actor_id: created.data.id, nama: created.data.display_name };
  } catch (error) {
    console.error("tambahKaryawanAction error:", error);
    throw error;
  }
}
```

- [ ] **Step 4: Verifikasi + commit**

Run: `npm run type-check` → 0 error.
```bash
git add src/app/penggajian/actions.ts
git commit -m "feat(penggajian): action tambah karyawan + daftar peran non-owner"
```

### Task 5: Komponen baru `ModalTambahKaryawan`

**Files:**
- Create: `src/app/penggajian/ModalTambahKaryawan.tsx`

Modal tambah karyawan: Nama + Jabatan (peran non-owner) + Catatan. Setelah simpan, panggil `onCreated(actorId, nama)` agar induk membuka Atur Kompensasi.

- [ ] **Step 1: Tulis file lengkap**

```tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import ModalFormShell from "@/components/ModalFormShell";
import { listPeranKaryawanAction, tambahKaryawanAction } from "./actions";

export interface ModalTambahKaryawanProps {
  onClose: () => void;
  /** Dipanggil setelah karyawan dibuat; induk membuka Atur Kompensasi. */
  onCreated: (actorId: string, nama: string) => void;
  showNotification: (type: "success" | "error", message: string) => void;
}

interface PeranOpsi {
  id: string;
  role_code: string;
  role_label: string;
  role_group: string;
}

export default function ModalTambahKaryawan({
  onClose,
  onCreated,
  showNotification,
}: ModalTambahKaryawanProps) {
  const [roles, setRoles] = useState<PeranOpsi[]>([]);
  const [nama, setNama] = useState("");
  const [roleCode, setRoleCode] = useState("");
  const [catatan, setCatatan] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    listPeranKaryawanAction()
      .then((r) => {
        setRoles(r as PeranOpsi[]);
        if (r.length > 0) setRoleCode((r as PeranOpsi[])[0].role_code);
      })
      .catch(() => {});
  }, []);

  const canSubmit = useMemo(
    () => nama.trim().length > 0 && roleCode.length > 0 && !submitting,
    [nama, roleCode, submitting]
  );

  async function handleSimpan() {
    if (!canSubmit) return;
    try {
      setSubmitting(true);
      const res = await tambahKaryawanAction({
        display_name: nama.trim(),
        role_code: roleCode,
        notes: catatan.trim() || undefined,
      });
      showNotification("success", `${res.nama} ditambahkan.`);
      onCreated(res.actor_id, res.nama);
    } catch (e) {
      showNotification(
        "error",
        (e as Error)?.message || "Gagal menambah karyawan."
      );
    } finally {
      setSubmitting(false);
    }
  }

  const header = (
    <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-gradient-to-r from-indigo-600 to-emerald-600 text-white">
      <div>
        <h2 className="text-lg font-semibold">Tambah Karyawan</h2>
        <p className="text-sm text-indigo-100">
          Setelah disimpan, atur komponen gajinya.
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Tutup"
        className="text-indigo-100 hover:text-white text-2xl leading-none"
      >
        &times;
      </button>
    </div>
  );

  const footer = (
    <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2">
      <button
        type="button"
        onClick={onClose}
        className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 font-medium"
      >
        Batal
      </button>
      <button
        type="button"
        disabled={!canSubmit}
        onClick={handleSimpan}
        className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-60"
      >
        {submitting ? "Menyimpan..." : "Simpan & Atur Gaji"}
      </button>
    </div>
  );

  return (
    <ModalFormShell open onClose={onClose} header={header} footer={footer} maxWidthClass="max-w-lg">
      <div className="p-6 space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Nama
          </label>
          <input
            type="text"
            autoFocus
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            placeholder="Mis. Andi"
            className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Jabatan
          </label>
          <select
            value={roleCode}
            onChange={(e) => setRoleCode(e.target.value)}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
          >
            {roles.map((r) => (
              <option key={r.id} value={r.role_code}>
                {r.role_label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Catatan (opsional)
          </label>
          <input
            type="text"
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
          />
        </div>
      </div>
    </ModalFormShell>
  );
}
```

- [ ] **Step 2: Verifikasi + commit**

Run: `npm run type-check` → 0 error.
```bash
git add src/app/penggajian/ModalTambahKaryawan.tsx
git commit -m "feat(penggajian): modal tambah karyawan (peran non-owner)"
```

### Task 6: Integrasi di halaman Penggajian — judul, tombol, alur, filter

**Files:**
- Modify: `src/app/penggajian/page.tsx`

- [ ] **Step 1: Impor modal + state**

Tambah `import ModalTambahKaryawan from "./ModalTambahKaryawan";`. Tambah state `const [showTambah, setShowTambah] = useState(false);`.

- [ ] **Step 2: Judul "PENGGAJIAN" → "Karyawan" + subtitle**

`<h1>` "Penggajian" → "Karyawan". Subtitle → "Kelola komponen gaji, kasbon, dan proses penggajian tiap karyawan."

- [ ] **Step 3: Header — hapus "Muat Ulang", tambah "+ Tambah Karyawan"**

Hapus tombol "Muat Ulang" + handler `handleMuatUlang` (dan `showMsg` panggilan di dalamnya bila tak terpakai lain). Tambah tombol putih "+ Tambah Karyawan" yang `onClick={() => setShowTambah(true)}` di sebelah "Proses Penggajian".

- [ ] **Step 4: Filter daftar ke karyawan**

Karyawan tampil bila penerima gaji: `profit_share_percent === null` ATAU `jumlah_komponen > 0`. `RingkasanKaryawan` belum punya `profit_share_percent` — tambahkan di action (Step 4b) dan filter di sini:

```ts
const karyawan = useMemo(
  () => (data ?? []).filter((k) => k.profit_share_percent === null || k.jumlah_komponen > 0),
  [data]
);
```

- [ ] **Step 4b: Lengkapi RingkasanKaryawan dengan profit_share_percent**

Di `src/app/penggajian/actions.ts`, interface `RingkasanKaryawan` tambah `profit_share_percent: number | null;`. Di `listRingkasanKaryawanAction`, isi `profit_share_percent: a.profit_share_percent` saat push hasil.

- [ ] **Step 5: Empty-state pakai tombol Tambah Karyawan**

Ganti teks "Belum ada karyawan aktif. Tambahkan orang lewat menu Pengaturan Keuangan → Pegawai." menjadi ajakan + tombol: "Belum ada karyawan. Tekan + Tambah Karyawan untuk mulai." dengan tombol `onClick={() => setShowTambah(true)}`.

- [ ] **Step 6: Render modal + alur auto-buka Atur Kompensasi**

Sebelum penutup `</div>`, render:

```tsx
{showTambah && (
  <ModalTambahKaryawan
    onClose={() => setShowTambah(false)}
    onCreated={(actorId, nama) => {
      setShowTambah(false);
      reload();
      setKomponenTarget({ id: actorId, nama });
    }}
    showNotification={showMsg}
  />
)}
```

- [ ] **Step 7: Verifikasi + commit**

Run: `npm run type-check` → 0 error.
```bash
git add src/app/penggajian/page.tsx src/app/penggajian/actions.ts
git commit -m "feat(penggajian): judul Karyawan, tombol Tambah Karyawan, filter & alur kompensasi"
```

### Task 7: Label menu "Penggajian" → "Karyawan"

**Files:**
- Modify: `src/components/menuConfig.tsx:262,327`

- [ ] **Step 1: Ganti label menu + breadcrumb**

Baris ~262 item menu `label: "Penggajian"` → `label: "Karyawan"`. Baris ~327 peta breadcrumb `"/penggajian": "Penggajian"` → `"/penggajian": "Karyawan"`. Route `/penggajian` TETAP (jangan diubah).

- [ ] **Step 2: Verifikasi + commit**

Run: `npm run type-check` → 0 error.
```bash
git add src/components/menuConfig.tsx
git commit -m "refactor(menu): label Karyawan untuk /penggajian"
```

### Task 8: Sapuan istilah sisa + verifikasi menyeluruh

**Files:** (cek & verifikasi end-to-end)

- [ ] **Step 1: Grep sisa "Pegawai" di teks UI**

Run (pakai Grep tool): pola `Pegawai|pegawai` di `src/**/*.tsx`. Untuk tiap kemunculan di TEKS UI (bukan identifier `pegawai`/`peran_pegawai`/`PegawaiRow`/nama tabel/migrasi/test), ganti ke "Karyawan"/"Pengurus" sesuai konteks. Contoh tersisa: `src/app/kelola-orang/page.tsx:27` "Keuangan → Pengaturan → Pegawai" → "Keuangan → Pengaturan → Pengurus". JANGAN sentuh `db-sqlite-schema.ts`, `*rename-migration.test.ts`, `penggajian-service.ts` (identifier).

- [ ] **Step 2: Type-check + build**

Run: `npm run type-check && npm run build`
Expected: 0 error, build sukses.

- [ ] **Step 3: Uji manual di browser (localhost:3000)**

1. Pengaturan Keuangan → tab kini bernama **Pengurus**; form hanya Nama/Jabatan/Bagi Hasil/Catatan (tanpa Kasbon/Bonus). Tambah pengurus dgn bagi hasil → muncul di daftar + panel "Pengurus Usaha" di Keuangan.
2. Halaman /penggajian berjudul **Karyawan**, ada **+ Tambah Karyawan**, tanpa Muat Ulang. Tambah karyawan → modal Atur Kompensasi otomatis terbuka → isi komponen → karyawan tampil dengan saldo kasbon.
3. Pengurus-murni TIDAK muncul di daftar Karyawan; karyawan-murni TIDAK muncul di tab Pengurus.
4. Buku kas tetap konsisten (kasbon via halaman Karyawan = kategori PINJAMAN_KARYAWAN).

- [ ] **Step 4: Update graphify (opsional)**

Run: `graphify update .`

- [ ] **Step 5: Commit sisa bila ada**

```bash
git add -A
git commit -m "refactor: sapuan istilah Pegawai -> Karyawan/Pengurus + verifikasi"
```

## Catatan untuk eksekutor

- Tidak ada perubahan DB/service — `syncFormulasForActor` sudah data-driven (form berhenti kirim kasbon/bonus → kolomnya otomatis tak dibuat/di-disable).
- Identifier teknis TETAP (tabel `pegawai`/`peran_pegawai`, route `/penggajian`, `/api/business-actors`, prop `onOpenPeopleSettings`, enum `cash_advance`/`bonus`/`staff`).
- DB kosong (tahap pengembangan) → tak ada migrasi data lama.
- Verifikasi tiap task dengan `npm run type-check` sebelum commit; build penuh di Task 8.
