# POS Parkir Keranjang + Katalog Maklon + Integrasi Maklon + Pratinjau Faktur — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambah 4 fitur: (1) simpan/panggil keranjang di POS, (2) katalog produk maklon berulang, (3) integrasi maklon ke picker produk POS dengan rincian internal tersembunyi, (4) tombol "Lihat Faktur" menggantikan "Pratinjau Penawaran".

**Architecture:** Dua tabel baru (`keranjang_tersimpan`, `katalog_maklon`) dengan sync columns standar. Katalog maklon diserap ke `produkJualList` POS sebagai entri `tipe_item="MAKLON"`. HPP & finance maklon **tidak diubah** (sudah ada: `hppTotal = biaya_subkontrak` + auto-PO vendor di `pos-mutations.ts`). Preview faktur pakai `generateInvoiceNumber` (tidak persist) untuk nomor berikutnya.

**Tech Stack:** Next.js App Router (React server actions + API routes), `db-unified.ts` (Postgres via Supabase service-role + SQLite via better-sqlite3), Zod, Jest (node + jsdom), Tailwind, `ModalFormShell`/`DialogKonfirmasi`/`useFocusTrap`.

**Spec:** `docs/superpowers/specs/2026-07-04-pos-maklon-parkir-design.md`

---

## File Structure

**Baru:**
- `supabase/migrations/20260704120000_keranjang_tersimpan_dan_katalog_maklon.sql` — skema Postgres 2 tabel.
- `src/lib/services/keranjang-tersimpan-service.ts` — parkCart/list/load/delete/markFinal/jadikanPenawaran.
- `src/lib/services/katalog-maklon-service.ts` — list/create/update/delete katalog.
- `src/lib/schemas/keranjang-tersimpan.ts` — Zod input parkir.
- `src/lib/schemas/katalog-maklon.ts` — Zod input katalog.
- `src/app/api/keranjang-tersimpan/route.ts` + `[id]/route.ts` + `[id]/jadikan-penawaran/route.ts`.
- `src/app/api/katalog-maklon/route.ts` + `[id]/route.ts`.
- `src/app/katalog-maklon/page.tsx` + `actions.ts` + `ModalKatalogMaklon.tsx` + `error.tsx`.
- `src/app/pos/ModalParkirKeranjang.tsx`, `DropdownKeranjangTersimpan.tsx`, `ModalTambahItemLainnya.tsx`, `ModalRincianInternalMaklon.tsx`.
- `src/lib/__tests__/keranjang-tersimpan-service.test.ts`, `src/lib/__tests__/katalog-maklon-service.test.ts`.

**Dimodifikasi:**
- `database/sqlite-schema.sql` — tambah 2 CREATE TABLE.
- `src/lib/db-unified.ts` — `ensureServerSyncQueueSchema`: 2 `CREATE TABLE IF NOT EXISTS`.
- `src/lib/sync-config.ts` — tambah `keranjang_tersimpan`, `katalog_maklon` ke `MASTER_SYNC_TABLES`.
- `src/lib/services/pos-queries.ts` — `getPOSInitData` tambah field `katalogMaklon`.
- `src/lib/services/pos-mutations.ts` — export `previewNextInvoiceNumber`.
- `src/app/pos/page.tsx` — integrasi picker terpadu, hapus tombol Maklon, ganti `MaklonLineModal`, muat parked cart UI, pass `shopSettings` ke `KeranjangPOS`.
- `src/components/KeranjangPOS.tsx` — tombol "Lihat Faktur", `handlePreviewFaktur`, header parked cart (Parkir + dropdown), ikon 👁 rincian internal, prop `shopSettings`.
- `src/components/MaklonLineModal.tsx` — dihapus.
- `src/components/menuConfig.tsx` — tambah menu "Katalog Maklon" di group Penjualan.

---

## Task 0: Worktree terisolasi

**Files:** —

- [ ] **Step 1: Buat worktree** lewat skill `using-git-worktrees` (branch `feat/pos-parkir-maklon`). Semua kerja di worktree, bukan `main`.

- [ ] **Step 2: Verifikasi base bersih**

Run: `cd <worktree> && npm run type-check && git --no-pager log -n 1 --oneline`
Expected: type-check 0 error; HEAD = commit spec `d67e573` atau lebih baru.

---

## Task 1: Skema — migrasi Postgres (kedua tabel)

**Files:**
- Create: `supabase/migrations/20260704120000_keranjang_tersimpan_dan_katalog_maklon.sql`

- [ ] **Step 1: Tulis migrasi Postgres**

```sql
-- Keranjang tersimpan (parkir cart di POS). Ringan, tidak berinteraksi dengan
-- inventori/keuangan. cart_snapshot JSONB bawa isi cart lengkap.
CREATE TABLE IF NOT EXISTS keranjang_tersimpan (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  pelanggan_id TEXT REFERENCES pelanggan(id) ON DELETE SET NULL,
  pelanggan_nama_snapshot TEXT,
  pelanggan_kota TEXT,
  prioritas TEXT NOT NULL DEFAULT 'NORMAL' CHECK(prioritas IN ('NORMAL','KILAT')),
  ppn_snapshot JSONB,
  cart_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'AKTIF' CHECK(status IN ('AKTIF','KEDALUWARSA','JADIKAN_PENAWARAN','FINAL')),
  penawaran_id TEXT REFERENCES penawaran(id) ON DELETE SET NULL,
  kedaluwarsa_pada TIMESTAMPTZ,
  dibuat_oleh TEXT REFERENCES profil(id) ON DELETE SET NULL,
  dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT now(),
  diperbarui_pada TIMESTAMPTZ NOT NULL DEFAULT now(),
  sync_status TEXT NOT NULL DEFAULT 'pending' CHECK(sync_status IN ('pending','synced','conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER NOT NULL DEFAULT 1,
  updated_at_server TIMESTAMPTZ,
  updated_by_device TEXT NOT NULL DEFAULT 'server',
  change_version INTEGER NOT NULL DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  client_mutation_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_keranjang_tersimpan_status ON keranjang_tersimpan(status, kedaluwarsa_pada);
CREATE INDEX IF NOT EXISTS idx_keranjang_tersimpan_pelanggan ON keranjang_tersimpan(pelanggan_id);

-- Katalog produk maklon berulang. Bukan barang stok; hanya template untuk
-- picker POS. biaya_subkontrak_default disembunyikan dari customer.
CREATE TABLE IF NOT EXISTS katalog_maklon (
  id TEXT PRIMARY KEY,
  nama_produk TEXT NOT NULL,
  nama_satuan TEXT NOT NULL DEFAULT 'pcs',
  harga_jual_default REAL NOT NULL DEFAULT 0,
  biaya_subkontrak_default REAL NOT NULL DEFAULT 0,
  vendor_subkontrak_id_default TEXT REFERENCES vendor(id) ON DELETE SET NULL,
  metode_bayar_vendor_default TEXT NOT NULL DEFAULT 'CASH' CHECK(metode_bayar_vendor_default IN ('CASH','NET30')),
  kategori TEXT,
  catatan_internal TEXT,
  is_aktif INTEGER NOT NULL DEFAULT 1,
  urutan INTEGER NOT NULL DEFAULT 0,
  dibuat_oleh TEXT REFERENCES profil(id) ON DELETE SET NULL,
  dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT now(),
  diperbarui_pada TIMESTAMPTZ NOT NULL DEFAULT now(),
  sync_status TEXT NOT NULL DEFAULT 'pending' CHECK(sync_status IN ('pending','synced','conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER NOT NULL DEFAULT 1,
  updated_at_server TIMESTAMPTZ,
  updated_by_device TEXT NOT NULL DEFAULT 'server',
  change_version INTEGER NOT NULL DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  client_mutation_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_katalog_maklon_aktif_urutan ON katalog_maklon(is_aktif, urutan);
CREATE UNIQUE INDEX IF NOT EXISTS idx_katalog_maklon_nama_unik ON katalog_maklon(nama_produk) WHERE is_deleted = 0;
```

- [ ] **Step 2: Apply ke Supabase lokal untuk verifikasi sintaks**

Run: `npm run supabase:local:reset 2>&1 | tail -n 20` (atau `npx supabase db reset --local`)
Expected: migrasi ter-apply tanpa error SQL. Kalau gagal, perbaiki sintaks sebelum lanjut.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260704120000_keranjang_tersimpan_dan_katalog_maklon.sql
git commit -m "feat(db): migrasi keranjang_tersimpan + katalog_maklon"
```

---

## Task 2: Skema — SQLite fresh-install + runtime ensure

**Files:**
- Modify: `database/sqlite-schema.sql` (tambah 2 CREATE TABLE setelah blok `item_penawaran`, ~line 346)
- Modify: `src/lib/db-unified.ts` (`ensureServerSyncQueueSchema`, sebelum blok `laporan_bulanan` ~line 1716)
- Modify: `src/lib/sync-config.ts` (`MASTER_SYNC_TABLES`)

- [ ] **Step 1: Tambah 2 CREATE TABLE ke `database/sqlite-schema.sql`** (model pola `penawaran` di line 268-304, termasuk semua sync columns):

```sql

-- Table: keranjang_tersimpan
CREATE TABLE keranjang_tersimpan (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      pelanggan_id TEXT,
      pelanggan_nama_snapshot TEXT,
      pelanggan_kota TEXT,
      prioritas TEXT NOT NULL DEFAULT 'NORMAL' CHECK(prioritas IN ('NORMAL','KILAT')),
      ppn_snapshot TEXT,
      cart_snapshot TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'AKTIF' CHECK(status IN ('AKTIF','KEDALUWARSA','JADIKAN_PENAWARAN','FINAL')),
      penawaran_id TEXT,
      kedaluwarsa_pada TEXT,
      dibuat_oleh TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      updated_at_server TEXT,
      updated_by_device TEXT DEFAULT 'server',
      change_version INTEGER DEFAULT 1,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT,
      FOREIGN KEY (pelanggan_id) REFERENCES pelanggan(id),
      FOREIGN KEY (penawaran_id) REFERENCES penawaran(id),
      FOREIGN KEY (dibuat_oleh) REFERENCES profil(id)
    );
CREATE INDEX idx_keranjang_tersimpan_status ON keranjang_tersimpan(status, kedaluwarsa_pada);
CREATE INDEX idx_keranjang_tersimpan_pelanggan ON keranjang_tersimpan(pelanggan_id);

-- Table: katalog_maklon
CREATE TABLE katalog_maklon (
      id TEXT PRIMARY KEY,
      nama_produk TEXT NOT NULL,
      nama_satuan TEXT NOT NULL DEFAULT 'pcs',
      harga_jual_default REAL NOT NULL DEFAULT 0,
      biaya_subkontrak_default REAL NOT NULL DEFAULT 0,
      vendor_subkontrak_id_default TEXT,
      metode_bayar_vendor_default TEXT NOT NULL DEFAULT 'CASH' CHECK(metode_bayar_vendor_default IN ('CASH','NET30')),
      kategori TEXT,
      catatan_internal TEXT,
      is_aktif INTEGER NOT NULL DEFAULT 1,
      urutan INTEGER NOT NULL DEFAULT 0,
      dibuat_oleh TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      updated_at_server TEXT,
      updated_by_device TEXT DEFAULT 'server',
      change_version INTEGER DEFAULT 1,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT,
      FOREIGN KEY (vendor_subkontrak_id_default) REFERENCES vendor(id) ON DELETE SET NULL,
      FOREIGN KEY (dibuat_oleh) REFERENCES profil(id)
    );
CREATE INDEX idx_katalog_maklon_aktif_urutan ON katalog_maklon(is_aktif, urutan);
```

Catatan: SQLite tidak duk partial unique index; unik nama diterapkan di service layer (cek `nama_produk` aktif sebelum insert). `ppn_snapshot`/`cart_snapshot` pakai `TEXT` (SQLite simpan JSON sebagai string).

- [ ] **Step 2: Tambah 2 `CREATE TABLE IF NOT EXISTS` di `ensureServerSyncQueueSchema`** (`src/lib/db-unified.ts`, sebelum blok `laporan_bulanan`):

```ts
    // Keranjang tersimpan (parkir cart di POS). IF NOT EXISTS menangani
    // instalasi existing sekaligus fresh-install.
    db.exec(`
      CREATE TABLE IF NOT EXISTS keranjang_tersimpan (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        pelanggan_id TEXT,
        pelanggan_nama_snapshot TEXT,
        pelanggan_kota TEXT,
        prioritas TEXT NOT NULL DEFAULT 'NORMAL',
        ppn_snapshot TEXT,
        cart_snapshot TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'AKTIF',
        penawaran_id TEXT,
        kedaluwarsa_pada TEXT,
        dibuat_oleh TEXT,
        dibuat_pada TEXT NOT NULL DEFAULT (datetime('now')),
        diperbarui_pada TEXT NOT NULL DEFAULT (datetime('now')),
        sync_status TEXT NOT NULL DEFAULT 'pending',
        last_synced_at TEXT,
        sync_version INTEGER NOT NULL DEFAULT 1,
        updated_at_server TEXT,
        updated_by_device TEXT NOT NULL DEFAULT 'server',
        change_version INTEGER NOT NULL DEFAULT 1,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT,
        client_mutation_id TEXT
      )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_keranjang_tersimpan_status ON keranjang_tersimpan(status, kedaluwarsa_pada)`);

    // Katalog produk maklon berulang.
    db.exec(`
      CREATE TABLE IF NOT EXISTS katalog_maklon (
        id TEXT PRIMARY KEY,
        nama_produk TEXT NOT NULL,
        nama_satuan TEXT NOT NULL DEFAULT 'pcs',
        harga_jual_default REAL NOT NULL DEFAULT 0,
        biaya_subkontrak_default REAL NOT NULL DEFAULT 0,
        vendor_subkontrak_id_default TEXT,
        metode_bayar_vendor_default TEXT NOT NULL DEFAULT 'CASH',
        kategori TEXT,
        catatan_internal TEXT,
        is_aktif INTEGER NOT NULL DEFAULT 1,
        urutan INTEGER NOT NULL DEFAULT 0,
        dibuat_oleh TEXT,
        dibuat_pada TEXT NOT NULL DEFAULT (datetime('now')),
        diperbarui_pada TEXT NOT NULL DEFAULT (datetime('now')),
        sync_status TEXT NOT NULL DEFAULT 'pending',
        last_synced_at TEXT,
        sync_version INTEGER NOT NULL DEFAULT 1,
        updated_at_server TEXT,
        updated_by_device TEXT NOT NULL DEFAULT 'server',
        change_version INTEGER NOT NULL DEFAULT 1,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT,
        client_mutation_id TEXT
      )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_katalog_maklon_aktif_urutan ON katalog_maklon(is_aktif, urutan)`);
```

- [ ] **Step 3: Register kedua tabel di `src/lib/sync-config.ts`** — tambah ke array `MASTER_SYNC_TABLES` (sebelum `] as const`):

```ts
  "keranjang_tersimpan",
  "katalog_maklon",
```

- [ ] **Step 4: Type-check**

Run: `npm run type-check`
Expected: 0 error. Tipe `SyncTable` ter-derive otomatis dari `as const`.

- [ ] **Step 5: Commit**

```bash
git add database/sqlite-schema.sql src/lib/db-unified.ts src/lib/sync-config.ts
git commit -m "feat(db): skema sqlite + sync keranjang_tersimpan & katalog_maklon"
```

---

## Task 3: Service + Zod — Katalog Maklon (TDD)

**Files:**
- Create: `src/lib/schemas/katalog-maklon.ts`
- Create: `src/lib/services/katalog-maklon-service.ts`
- Test: `src/lib/__tests__/katalog-maklon-service.test.ts`

- [ ] **Step 1: Tulis Zod schema** — `src/lib/schemas/katalog-maklon.ts`:

```ts
import { z } from "zod";

export const katalogMaklonInputSchema = z.object({
  nama_produk: z.string().min(1, "Nama produk wajib diisi").max(200),
  nama_satuan: z.string().min(1).max(50).default("pcs"),
  harga_jual_default: z.coerce.number().finite().min(0),
  biaya_subkontrak_default: z.coerce.number().finite().min(0),
  vendor_subkontrak_id_default: z.string().nullable().optional(),
  metode_bayar_vendor_default: z.enum(["CASH", "NET30"]).default("CASH"),
  kategori: z.string().nullable().optional(),
  catatan_internal: z.string().nullable().optional(),
  is_aktif: z.coerce.number().int().min(0).max(1).default(1),
  urutan: z.coerce.number().int().min(0).default(0),
});

export type KatalogMaklonInput = z.infer<typeof katalogMaklonInputSchema>;
```

- [ ] **Step 2: Tulis test gagal** — `src/lib/__tests__/katalog-maklon-service.test.ts`. Baca dulu `src/lib/__tests__/quotation-service.test.ts` untuk struktur mock (`resetMockDb`, `mockTable`). Test minimal:

```ts
import { createKatalogMaklon, listKatalogMaklon, updateKatalogMaklon, deleteKatalogMaklon } from "../services/katalog-maklon-service";
// (import mock helpers yang sama dengan quotation-service.test.ts)

describe("katalog-maklon-service", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("membuat katalog maklon dengan field lengkap", async () => {
    const result = await createKatalogMaklon({
      nama_produk: "Banner Spanduk 3x1",
      nama_satuan: "pcs",
      harga_jual_default: 75000,
      biaya_subkontrak_default: 50000,
      metode_bayar_vendor_default: "CASH",
      is_aktif: 1,
      urutan: 0,
    }, "user-1");
    expect(result.id).toBeTruthy();
    expect(result.nama_produk).toBe("Banner Spanduk 3x1");

    const all = await listKatalogMaklon();
    expect(all).toHaveLength(1);
    expect(all[0].biaya_subkontrak_default).toBe(50000);
  });

  it("menolak nama_produk duplikat yang aktif", async () => {
    await createKatalogMaklon({ nama_produk: "X", nama_satuan: "pcs", harga_jual_default: 1, biaya_subkontrak_default: 1, metode_bayar_vendor_default: "CASH", is_aktif: 1, urutan: 0 }, "u");
    await expect(
      createKatalogMaklon({ nama_produk: "X", nama_satuan: "pcs", harga_jual_default: 1, biaya_subkontrak_default: 1, metode_bayar_vendor_default: "CASH", is_aktif: 1, urutan: 0 }, "u")
    ).rejects.toThrow(/sudah ada/i);
  });

  it("update mengubah field", async () => {
    const created = await createKatalogMaklon({ nama_produk: "Y", nama_satuan: "pcs", harga_jual_default: 10, biaya_subkontrak_default: 5, metode_bayar_vendor_default: "NET30", is_aktif: 1, urutan: 2 }, "u");
    await updateKatalogMaklon(created.id, { nama_produk: "Y2", nama_satuan: "lembar", harga_jual_default: 12, biaya_subkontrak_default: 6, metode_bayar_vendor_default: "NET30", is_aktif: 1, urutan: 2 });
    const all = await listKatalogMaklon();
    expect(all[0].nama_produk).toBe("Y2");
    expect(all[0].harga_jual_default).toBe(12);
  });

  it("delete soft-delete dan hilang dari list", async () => {
    const created = await createKatalogMaklon({ nama_produk: "Z", nama_satuan: "pcs", harga_jual_default: 1, biaya_subkontrak_default: 1, metode_bayar_vendor_default: "CASH", is_aktif: 1, urutan: 0 }, "u");
    await deleteKatalogMaklon(created.id);
    const all = await listKatalogMaklon();
    expect(all).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run test — verifikasi gagal**

Run: `npx jest src/lib/__tests__/katalog-maklon-service.test.ts`
Expected: FAIL (modul service belum ada).

- [ ] **Step 4: Tulis service** — `src/lib/services/katalog-maklon-service.ts`:

```ts
import "server-only";
import { db, generateId, getCurrentTimestamp } from "@/lib/db-unified";
import { friendlyPgError } from "@/lib/pg-error";
import { katalogMaklonInputSchema, type KatalogMaklonInput } from "@/lib/schemas/katalog-maklon";

export interface KatalogMaklon {
  id: string;
  nama_produk: string;
  nama_satuan: string;
  harga_jual_default: number;
  biaya_subkontrak_default: number;
  vendor_subkontrak_id_default: string | null;
  metode_bayar_vendor_default: "CASH" | "NET30";
  kategori: string | null;
  catatan_internal: string | null;
  is_aktif: number;
  urutan: number;
  dibuat_oleh: string | null;
  dibuat_pada: string;
  diperbarui_pada: string;
}

export async function listKatalogMaklon(onlyAktif = true): Promise<KatalogMaklon[]> {
  const result = await db.query<KatalogMaklon>("katalog_maklon", {
    orderBy: { column: "urutan", ascending: true },
  });
  if (result.error) throw friendlyPgError(result.error, "katalog_maklon");
  return (result.data || []).filter((r) => Number(r.is_deleted) !== 1 && (!onlyAktif || Number(r.is_aktif) === 1));
}

async function assertNamaUnik(nama_produk: string, exceptId?: string) {
  const all = await listKatalogMaklon(false);
  const clash = all.find((r) => r.nama_produk.toLowerCase() === nama_produk.toLowerCase() && r.id !== exceptId);
  if (clash) throw new Error(`Nama produk "${nama_produk}" sudah ada di katalog maklon`);
}

export async function createKatalogMaklon(input: KatalogMaklonInput, dibuatOleh: string): Promise<KatalogMaklon> {
  const parsed = katalogMaklonInputSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  const data = parsed.data;
  await assertNamaUnik(data.nama_produk);
  const id = generateId();
  const now = getCurrentTimestamp();
  const ins = await db.insert("katalog_maklon", {
    id,
    nama_produk: data.nama_produk.trim(),
    nama_satuan: data.nama_satuan,
    harga_jual_default: data.harga_jual_default,
    biaya_subkontrak_default: data.biaya_subkontrak_default,
    vendor_subkontrak_id_default: data.vendor_subkontrak_id_default || null,
    metode_bayar_vendor_default: data.metode_bayar_vendor_default,
    kategori: data.kategori || null,
    catatan_internal: data.catatan_internal || null,
    is_aktif: data.is_aktif,
    urutan: data.urutan,
    dibuat_oleh: dibuatOleh || null,
    dibuat_pada: now,
    diperbarui_pada: now,
  });
  if (ins.error) throw friendlyPgError(ins.error, "katalog_maklon");
  return { id, ...data, vendor_subkontrak_id_default: data.vendor_subkontrak_id_default || null, dibuat_oleh: dibuatOleh || null, dibuat_pada: now, diperbarui_pada: now } as KatalogMaklon;
}

export async function updateKatalogMaklon(id: string, input: KatalogMaklonInput): Promise<void> {
  const parsed = katalogMaklonInputSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  const data = parsed.data;
  await assertNamaUnik(data.nama_produk, id);
  const upd = await db.update("katalog_maklon", id, {
    nama_produk: data.nama_produk.trim(),
    nama_satuan: data.nama_satuan,
    harga_jual_default: data.harga_jual_default,
    biaya_subkontrak_default: data.biaya_subkontrak_default,
    vendor_subkontrak_id_default: data.vendor_subkontrak_id_default || null,
    metode_bayar_vendor_default: data.metode_bayar_vendor_default,
    kategori: data.kategori || null,
    catatan_internal: data.catatan_internal || null,
    is_aktif: data.is_aktif,
    urutan: data.urutan,
    diperbarui_pada: getCurrentTimestamp(),
  });
  if (upd.error) throw friendlyPgError(upd.error, "katalog_maklon");
}

export async function deleteKatalogMaklon(id: string): Promise<void> {
  const upd = await db.update("katalog_maklon", id, {
    is_deleted: 1,
    deleted_at: getCurrentTimestamp(),
  });
  if (upd.error) throw friendlyPgError(upd.error, "katalog_maklon");
}
```

- [ ] **Step 5: Run test — verifikasi lulus**

Run: `npx jest src/lib/__tests__/katalog-maklon-service.test.ts`
Expected: 4 PASS. Sesuaikan import mock helper kalau namanya beda di `quotation-service.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/schemas/katalog-maklon.ts src/lib/services/katalog-maklon-service.ts src/lib/__tests__/katalog-maklon-service.test.ts
git commit -m "feat(katalog-maklon): service + zod + test"
```

---

## Task 4: API + Actions — Katalog Maklon

**Files:**
- Create: `src/app/api/katalog-maklon/route.ts`
- Create: `src/app/api/katalog-maklon/[id]/route.ts`
- Create: `src/app/katalog-maklon/actions.ts`

- [ ] **Step 1: Tulis API route GET/POST** — `src/app/api/katalog-maklon/route.ts`. Ikut pola `src/app/api/barang/route.ts` (baca dulu). GET: `listKatalogMaklon` tanpa guard (baca). POST: `requireAdminOrManager`, `safeParse(katalogMaklonInputSchema)` di body `.passthrough()` → 422 kalau gagal → `createKatalogMaklon(body, session.uid)`. Handle `AuthGuardError` di catch → return `.status`.

- [ ] **Step 2: Tulis API route PUT/DELETE** — `src/app/api/katalog-maklon/[id]/route.ts`. PUT `requireAdminOrManager` → `updateKatalogMaklon`. DELETE `requireAdminOrManager` → `deleteKatalogMaklon`. Handle `AuthGuardError`.

- [ ] **Step 3: Tulis server actions** — `src/app/katalog-maklon/actions.ts`:

```ts
"use server";
import { requireAdminOrManager } from "@/lib/auth-guard-server";
import {
  createKatalogMaklon,
  listKatalogMaklon,
  updateKatalogMaklon,
  deleteKatalogMaklon,
  type KatalogMaklon,
} from "@/lib/services/katalog-maklon-service";
import type { KatalogMaklonInput } from "@/lib/schemas/katalog-maklon";

export async function listKatalogMaklonAction(onlyAktif = true): Promise<KatalogMaklon[]> {
  return listKatalogMaklon(onlyAktif);
}

export async function createKatalogMaklonAction(input: KatalogMaklonInput) {
  const s = await requireAdminOrManager();
  return createKatalogMaklon(input, s.uid);
}

export async function updateKatalogMaklonAction(id: string, input: KatalogMaklonInput) {
  await requireAdminOrManager();
  return updateKatalogMaklon(id, input);
}

export async function deleteKatalogMaklonAction(id: string) {
  await requireAdminOrManager();
  return deleteKatalogMaklon(id);
}
```

- [ ] **Step 4: Type-check**

Run: `npm run type-check`
Expected: 0 error.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/katalog-maklon src/app/katalog-maklon/actions.ts
git commit -m "feat(katalog-maklon): api routes + server actions"
```

---

## Task 5: Halaman admin Katalog Maklon + menu

**Files:**
- Create: `src/app/katalog-maklon/page.tsx`
- Create: `src/app/katalog-maklon/ModalKatalogMaklon.tsx`
- Create: `src/app/katalog-maklon/error.tsx`
- Modify: `src/components/menuConfig.tsx` (tambah menu di group `penjualan`, setelah entri `/penawaran` ~line 115)

- [ ] **Step 1: Tambah menu** — di `menuConfig.tsx`, dalam `children` group `penjualan`, setelah entri `/penawaran`:

```tsx
      {
        href: "/katalog-maklon",
        icon: <PrinterIcon size={18} />,
        label: "Katalog Maklon",
        color: "from-fuchsia-500 to-purple-600",
        allowedRoles: FULL_STAFF,
      },
```

Pastikan `PrinterIcon` sudah di-import. Kalau belum, pakai ikon yang sudah ada mis. `BoxIcon`.

- [ ] **Step 2: Tulis `page.tsx`** — ikut pola `src/app/vendors/page.tsx` (baca dulu). Komponen: gradient title card (`from-fuchsia-500 to-purple-600`), `useCachedData("katalog-maklon", () => listKatalogMaklonAction())`, `useMemo(() => data ?? [], [data])`, tabel kolom (nama_produk, satuan, harga_jual, biaya_subkontrak, vendor default, metode, kategori, aktif, urutan, aksi edit/hapus), pencarian, filter kategori, `MenuAksi` per baris. Dark mode wajib di tiap elemen. Root `<div className="space-y-6">`.

- [ ] **Step 3: Tulis `ModalKatalogMaklon.tsx`** — `ModalFormShell`, form field sesuai `KatalogMaklonInput`, focus trap via shell. Submit → `createKatalogMaklonAction`/`updateKatalogMaklonAction`, `onSuccess(null)` → parent `reload()`. State `saving` → tombol "Menyimpan...". Vendor default pakai `PilihanCari` atau `<select>` dari list vendor (muat vendor via `useCachedData("vendors-init", ...)` — ikut pola vendor picker di `penawaran/page.tsx`).

- [ ] **Step 4: Tulis `error.tsx`** — client component, pesan Bahasa Indonesia + "Coba Lagi" reset. Ikut `src/app/error.tsx`.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: sukses, halaman ter-generate. Perbaiki kalau error.

- [ ] **Step 6: Commit**

```bash
git add src/app/katalog-maklon src/components/menuConfig.tsx
git commit -m "feat(katalog-maklon): halaman admin + menu"
```

---

## Task 6: Service + Zod — Keranjang Tersimpan (TDD)

**Files:**
- Create: `src/lib/schemas/keranjang-tersimpan.ts`
- Create: `src/lib/services/keranjang-tersimpan-service.ts`
- Test: `src/lib/__tests__/keranjang-tersimpan-service.test.ts`

- [ ] **Step 1: Tulis Zod schema** — `src/lib/schemas/keranjang-tersimpan.ts`:

```ts
import { z } from "zod";

export const parkCartInputSchema = z.object({
  label: z.string().min(1, "Label wajib").max(200),
  pelanggan_id: z.string().nullable().optional(),
  pelanggan_nama_snapshot: z.string().nullable().optional(),
  pelanggan_kota: z.string().nullable().optional(),
  prioritas: z.enum(["NORMAL", "KILAT"]).default("NORMAL"),
  ppn_snapshot: z.unknown().nullable().optional(),
  cart_snapshot: z.unknown(),
});
export type ParkCartInput = z.infer<typeof parkCartInputSchema>;
```

- [ ] **Step 2: Tulis test** — `src/lib/__tests__/keranjang-tersimpan-service.test.ts` (pakai mock helper yang sama dengan Task 3):

```ts
import { parkCart, listParkedCarts, loadParkedCart, deleteParkedCart, markFinal } from "../services/keranjang-tersimpan-service";

describe("keranjang-tersimpan-service", () => {
  beforeEach(() => resetMockDb());

  it("parkir menyimpan cart_snapshot dan set kedaluwarsa 30 hari", async () => {
    const r = await parkCart({
      label: "Budi · 2 item · 14:30",
      prioritas: "NORMAL",
      cart_snapshot: [{ barang_nama: "X", jumlah: 1, harga_satuan: 1000 }],
    }, "kasir-1");
    expect(r.id).toBeTruthy();
    expect(r.status).toBe("AKTIF");
    expect(r.kedaluwarsa_pada).toBeTruthy();
    const all = await listParkedCarts();
    expect(all).toHaveLength(1);
  });

  it("load mengembalikan cart_snapshot utuh", async () => {
    const r = await parkCart({ label: "L", prioritas: "NORMAL", cart_snapshot: [{ a: 1, tipe_item: "MAKLON", vendor_subkontrak_id: "v1", biaya_subkontrak: 5 }] }, "u");
    const loaded = await loadParkedCart(r.id);
    expect(loaded?.cart_snapshot).toEqual([{ a: 1, tipe_item: "MAKLON", vendor_subkontrak_id: "v1", biaya_subkontrak: 5 }]);
  });

  it("markFinal set status FINAL", async () => {
    const r = await parkCart({ label: "L", prioritas: "NORMAL", cart_snapshot: [] }, "u");
    await markFinal(r.id);
    const all = await listParkedCarts();
    expect(all).toHaveLength(0);
  });

  it("delete soft-delete", async () => {
    const r = await parkCart({ label: "L", prioritas: "NORMAL", cart_snapshot: [] }, "u");
    await deleteParkedCart(r.id);
    const all = await listParkedCarts();
    expect(all).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run test — verifikasi gagal**

Run: `npx jest src/lib/__tests__/keranjang-tersimpan-service.test.ts`
Expected: FAIL (service belum ada).

- [ ] **Step 4: Tulis service** — `src/lib/services/keranjang-tersimpan-service.ts`:

```ts
import "server-only";
import { db, generateId, getCurrentTimestamp } from "@/lib/db-unified";
import { friendlyPgError } from "@/lib/pg-error";
import { parkCartInputSchema, type ParkCartInput } from "@/lib/schemas/keranjang-tersimpan";
import { createQuotation, type QuotationItemInput } from "@/lib/services/quotation-service";

export interface ParkedCart {
  id: string;
  label: string;
  pelanggan_id: string | null;
  pelanggan_nama_snapshot: string | null;
  pelanggan_kota: string | null;
  prioritas: "NORMAL" | "KILAT";
  ppn_snapshot: unknown;
  cart_snapshot: unknown;
  status: "AKTIF" | "KEDALUWARSA" | "JADIKAN_PENAWARAN" | "FINAL";
  penawaran_id: string | null;
  kedaluwarsa_pada: string;
  dibuat_oleh: string | null;
  dibuat_pada: string;
  diperbarui_pada: string;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export async function parkCart(input: ParkCartInput, kasirId: string): Promise<ParkedCart> {
  const parsed = parkCartInputSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  const data = parsed.data;
  const id = generateId();
  const now = getCurrentTimestamp();
  const kedaluwarsa = addDaysIso(now, 30);
  const ins = await db.insert("keranjang_tersimpan", {
    id,
    label: data.label.trim(),
    pelanggan_id: data.pelanggan_id || null,
    pelanggan_nama_snapshot: data.pelanggan_nama_snapshot || null,
    pelanggan_kota: data.pelanggan_kota || null,
    prioritas: data.prioritas,
    ppn_snapshot: data.ppn_snapshot ?? null,
    cart_snapshot: data.cart_snapshot,
    status: "AKTIF",
    kedaluwarsa_pada: kedaluwarsa,
    dibuat_oleh: kasirId || null,
    dibuat_pada: now,
    diperbarui_pada: now,
  });
  if (ins.error) throw friendlyPgError(ins.error, "keranjang_tersimpan");
  return (await loadParkedCart(id))!;
}

export async function listParkedCarts(): Promise<ParkedCart[]> {
  const result = await db.query<ParkedCart>("keranjang_tersimpan", {
    orderBy: { column: "dibuat_pada", ascending: false },
    limit: 100,
  });
  if (result.error) throw friendlyPgError(result.error, "keranjang_tersimpan");
  const now = getCurrentTimestamp();
  return (result.data || [])
    .filter((r) => Number(r.is_deleted) !== 1)
    .filter((r) => r.status === "AKTIF" || r.status === "KEDALUWARSA")
    .map((r) => (r.status === "AKTIF" && new Date(r.kedaluwarsa_pada) < new Date(now) ? { ...r, status: "KEDALUWARSA" as const } : r));
}

export async function loadParkedCart(id: string): Promise<ParkedCart | null> {
  const result = await db.queryOne<ParkedCart>("keranjang_tersimpan", { where: { id } });
  if (result.error) throw friendlyPgError(result.error, "keranjang_tersimpan");
  if (!result.data || Number(result.data.is_deleted) === 1) return null;
  return result.data;
}

export async function deleteParkedCart(id: string): Promise<void> {
  const upd = await db.update("keranjang_tersimpan", id, {
    is_deleted: 1,
    deleted_at: getCurrentTimestamp(),
  });
  if (upd.error) throw friendlyPgError(upd.error, "keranjang_tersimpan");
}

export async function markFinal(id: string): Promise<void> {
  const upd = await db.update("keranjang_tersimpan", id, {
    status: "FINAL",
    diperbarui_pada: getCurrentTimestamp(),
  });
  if (upd.error) throw friendlyPgError(upd.error, "keranjang_tersimpan");
}

export async function jadikanPenawaran(
  id: string,
  items: QuotationItemInput[],
  meta: { pelanggan_id?: string | null; pelanggan_nama_snapshot?: string | null; pelanggan_kota?: string | null; kena_ppn?: boolean; ppn_persen?: number; ppn_metode?: "EKSKLUSIF" | "INKLUSIF"; catatan?: string | null; dibuatOleh: string }
): Promise<{ penawaran_id: string; nomor_penawaran: string }> {
  const created = await createQuotation({
    pelanggan_id: meta.pelanggan_id || null,
    pelanggan_nama_snapshot: meta.pelanggan_nama_snapshot || null,
    pelanggan_kota: meta.pelanggan_kota || null,
    items,
    kena_ppn: meta.kena_ppn,
    ppn_persen: meta.ppn_persen,
    ppn_metode: meta.ppn_metode,
    catatan: meta.catatan || null,
    dibuat_oleh: meta.dibuatOleh,
  });
  const upd = await db.update("keranjang_tersimpan", id, {
    status: "JADIKAN_PENAWARAN",
    penawaran_id: created.id,
    diperbarui_pada: getCurrentTimestamp(),
  });
  if (upd.error) throw friendlyPgError(upd.error, "keranjang_tersimpan");
  return { penawaran_id: created.id, nomor_penawaran: created.nomor_penawaran };
}
```

- [ ] **Step 5: Run test — verifikasi lulus**

Run: `npx jest src/lib/__tests__/keranjang-tersimpan-service.test.ts`
Expected: 4 PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/schemas/keranjang-tersimpan.ts src/lib/services/keranjang-tersimpan-service.ts src/lib/__tests__/keranjang-tersimpan-service.test.ts
git commit -m "feat(keranjang-tersimpan): service + zod + test"
```

---

## Task 7: API + Actions — Keranjang Tersimpan

**Files:**
- Create: `src/app/api/keranjang-tersimpan/route.ts` (GET list, POST park)
- Create: `src/app/api/keranjang-tersimpan/[id]/route.ts` (GET load, DELETE hapus)
- Create: `src/app/api/keranjang-tersimpan/[id]/jadikan-penawaran/route.ts` (POST)
- Create: `src/app/pos/keranjang-tersimpan-actions.ts`

- [ ] **Step 1: API route list/park** — `route.ts`: GET `listParkedCarts` (baca, tanpa guard). POST `requireSession` → `safeParse(parkCartInputSchema)` di body `.passthrough()` → 422 kalau gagal → `parkCart(body, session.uid)`.

- [ ] **Step 2: API route load/delete** — `[id]/route.ts`: GET `loadParkedCart` (baca). DELETE `requireSession` → `deleteParkedCart`. Handle `AuthGuardError` di catch → return `.status`.

- [ ] **Step 3: API route jadikan-penawaran** — `[id]/jadikan-penawaran/route.ts`, body: `{ items: QuotationItemInput[], meta: {...} }`. `requireSession` → `jadikanPenawaran(id, items, { ...meta, dibuatOleh: session.uid })`. Return `{ penawaran_id, nomor_penawaran }`.

- [ ] **Step 4: Server actions** — `src/app/pos/keranjang-tersimpan-actions.ts`: thin wrapper `parkCartAction`, `listParkedCartsAction`, `loadParkedCartAction`, `deleteParkedCartAction`, `markFinalAction`, `jadikanPenawaranAction` — semua mutating pakai `requireSession`, `dibuat_oleh = session.uid`.

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: 0 error.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/keranjang-tersimpan src/app/pos/keranjang-tersimpan-actions.ts
git commit -m "feat(keranjang-tersimpan): api routes + server actions"
```

---

## Task 8: POS init — muat katalog maklon + export preview nomor faktur

**Files:**
- Modify: `src/lib/services/pos-queries.ts` (`POSInitData` interface + `getPOSInitData` return)
- Modify: `src/lib/services/pos-mutations.ts` (export `previewNextInvoiceNumber`)

- [ ] **Step 1: Tambah field `katalogMaklon` ke `POSInitData`** (line ~113-119):

```ts
export interface POSInitData {
  customers: any[];
  materials: any[];
  sales: Sale[];
  subkontraktor: any[];
  katalogMaklon: KatalogMaklon[];
}
```

Import `KatalogMaklon` dari `@/lib/services/katalog-maklon-service`. Import `listKatalogMaklon` juga.

- [ ] **Step 2: Muat katalog di `getPOSInitData`** (sebelum `return {...}`, ~line 446). Tambah blok try/catch (jatuh-balik `[]` kalau tabel belum ada di instalasi lama):

```ts
    let katalogMaklon: KatalogMaklon[] = [];
    try {
      katalogMaklon = await listKatalogMaklon(true);
    } catch (e) {
      console.warn("[getPOSInitData] failed to load katalog_maklon:", e);
    }

    return {
      customers: customersResult.data || [],
      materials: materialsWithPrices,
      sales,
      subkontraktor,
      katalogMaklon,
    };
```

- [ ] **Step 3: Export `previewNextInvoiceNumber`** di `src/lib/services/pos-mutations.ts` (dekat `generateInvoiceNumber` ~line 153):

```ts
/** Preview nomor faktur berikutnya TANPA persist (untuk tombol "Lihat Faktur"). */
export async function previewNextInvoiceNumber(): Promise<string> {
  return generateInvoiceNumber(todayJakarta());
}
```

Pastikan `todayJakarta` di-import di pos-mutations (kemungkinan sudah, dipakai `generateInvoiceNumber`).

- [ ] **Step 4: Type-check + jest POS yang ada**

Run: `npm run type-check && npx jest src/app/pos 2>&1 | tail -n 20`
Expected: type-check 0 error; tes POS lulus. Cache lama tanpa field `katalogMaklon` aman karena konsumen pakai `safePos.katalogMaklon ?? []`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/pos-queries.ts src/lib/services/pos-mutations.ts
git commit -m "feat(pos): muat katalog maklon + preview nomor faktur"
```

---

## Task 9: Tombol "Lihat Faktur" (Workstream 4)

**Files:**
- Modify: `src/components/KeranjangPOS.tsx` (`handlePreviewQuotation` → `handlePreviewFaktur`, label tombol, prop `shopSettings`)
- Modify: `src/app/pos/page.tsx` (pass `shopSettings` ke `<KeranjangPOS>`)
- Modify: `patchQuotationHTML` (cari lokasi — kemungkinan di `KeranjangPOS.tsx` atau `src/lib/dokumen-*.ts`)

- [ ] **Step 1: Tambah prop `shopSettings` ke `KeranjangPOSProps`** (baca definisi props di file). Pass dari `POSPage` — cari `shopSettings`/`settings` di `pos/page.tsx` (~line 984-1015 `processCheckout` sudah load `shopSettings`; hoist ke state/prop atau pass langsung). Tambah `shopSettings={shopSettings}` ke `<KeranjangPOS>`.

- [ ] **Step 2: Update `patchQuotationHTML`** untuk menerima opsi `{ judul?: string }` (default `"Penawaran Harga"`). Ganti hardcoded "Penawaran Harga" jadi `judul` param.

- [ ] **Step 3: Ganti `handlePreviewQuotation` → `handlePreviewFaktur`** di `KeranjangPOS.tsx` (line ~160-228):

```ts
  const handlePreviewFaktur = async () => {
    if (cart.length === 0) {
      showMsg("error", "Keranjang kosong");
      return;
    }
    try {
      // ... items mapping tetap (line 171-205) ...

      const nomorPreview = await previewNextInvoiceNumber();

      const html = generateFakturHTML({
        nomor_faktur: nomorPreview,
        tanggal: new Date().toISOString(),
        pelanggan_nama: customerName?.trim() || "—",
        items,
        total,
        bayar: 0,
        sisa: 0,
        shop: shopSettings,
      });

      const patched = patchQuotationHTML(html, { judul: "Faktur Penjualan" });

      window.dispatchEvent(
        new CustomEvent("gemi:preview-faktur", {
          detail: { html: patched, title: "Faktur Penjualan" },
        })
      );
    } catch (e) {
      console.error("handlePreviewFaktur error:", e);
    }
  };
```

Import `previewNextInvoiceNumber` dari `@/lib/services/pos-mutations`.

- [ ] **Step 4: Ganti label tombol** (line ~309-320):

```tsx
            <button
              type="button"
              onClick={handlePreviewFaktur}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-800/50 text-[10px] font-semibold transition-colors"
              title="Lihat faktur"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Lihat Faktur
            </button>
```

- [ ] **Step 5: Type-check + build**

Run: `npm run type-check && npm run build`
Expected: 0 error, build sukses.

- [ ] **Step 6: Test manual (jika env)** — buka POS, isi cart, klik "Lihat Faktur", verifikasi: header pakai nama toko, judul "Faktur Penjualan", nomor format `INV-YYYYMMDD-NNN` berikutnya.

- [ ] **Step 7: Commit**

```bash
git add src/components/KeranjangPOS.tsx src/app/pos/page.tsx src/lib/dokumen-*.ts
git commit -m "feat(pos): tombol Lihat Faktur dengan nomor + header toko"
```

---

## Task 10: POS Picker Terpadu — gabung katalog maklon

**Files:**
- Modify: `src/app/pos/page.tsx` (`produkJualList` memo ~line 378-393, handler pilih produk, `CartItem` type, hapus Maklon tombol/modal)

- [ ] **Step 1: Extend tipe `ProdukJualFlat`** dengan field optional:

```ts
type ProdukJualFlat = {
  id: string;
  nama: string;
  // ... field existing ...
  sumber?: "BARANG" | "KATALOG_MAKLON";
  katalog_maklon_id?: string;
  biaya_subkontrak_default?: number;
  vendor_subkontrak_id_default?: string | null;
  metode_bayar_vendor_default?: "CASH" | "NET30";
};
```

- [ ] **Step 2: Gabungkan katalog ke `produkJualList`**:

```ts
  const katalogMaklon = useMemo(() => safePos.katalogMaklon ?? [], [safePos.katalogMaklon]);

  const produkJualList = useMemo<ProdukJualFlat[]>(() => {
    const result: ProdukJualFlat[] = [];
    for (const m of materials) {
      if (m.id === ID_BARANG_PLACEHOLDER_MAKLON) continue;
      for (const up of m.unit_prices) {
        result.push({
          id: up.id,
          nama: up.nama_produk_jual?.trim() || up.nama_satuan,
          // ... field existing ...
          sumber: "BARANG",
        });
      }
    }
    for (const k of katalogMaklon) {
      result.push({
        id: `katalog-${k.id}`,
        nama: k.nama_produk,
        nama_satuan: k.nama_satuan,
        nama_produk_jual: k.nama_produk,
        harga_jual: k.harga_jual_default,
        harga_member: k.harga_jual_default,
        faktor_konversi: 1,
        sumber: "KATALOG_MAKLON",
        katalog_maklon_id: k.id,
        biaya_subkontrak_default: k.biaya_subkontrak_default,
        vendor_subkontrak_id_default: k.vendor_subkontrak_id_default,
        metode_bayar_vendor_default: k.metode_bayar_vendor_default,
      });
    }
    return result;
  }, [materials, katalogMaklon]);
```

- [ ] **Step 3: Tambah `katalog_maklon_id?` ke `CartItem` type** (cari definisi di `pos/page.tsx` atau `src/app/pos/types.ts` kalau ada).

- [ ] **Step 4: Di handler pilih produk (cari `handleAddToCart`/`handlePilihProduk`)** — ketika `sumber === "KATALOG_MAKLON"`:

```ts
      if (produk.sumber === "KATALOG_MAKLON") {
        const newItem: CartItem = {
          barang_id: ID_BARANG_PLACEHOLDER_MAKLON,
          barang_nama: produk.nama,
          harga_satuan_id: ID_HARGA_PLACEHOLDER_MAKLON,
          nama_satuan: produk.nama_satuan,
          faktor_konversi: 1,
          harga_satuan: produk.harga_jual,
          jumlah: 1,
          subtotalRaw: produk.harga_jual,
          originalHargaSatuan: produk.harga_jual,
          tipe_item: "MAKLON",
          katalog_maklon_id: produk.katalog_maklon_id,
          vendor_subkontrak_id: produk.vendor_subkontrak_id_default || undefined,
          biaya_subkontrak: produk.biaya_subkontrak_default,
          metode_bayar_vendor: produk.metode_bayar_vendor_default,
          deskripsi_pekerjaan: produk.nama,
        };
        setCart((prev) => [...prev, newItem]);
        return;
      }
```

- [ ] **Step 5: Hapus tombol "Maklon" lama** (line 1431-1449) + import `MaklonLineModal` + state `showMaklonModal`/`editingMaklonIndex` + `handleOpenMaklonModal`/`handleSaveMaklonLine` + `<MaklonLineModal .../>` render (line 2089-2123).

- [ ] **Step 6: Update `handleEditCartItem` untuk maklon** (line ~609) — alihkan ke `ModalRincianInternalMaklon` (dibuat di Task 11). Untuk sementara (sebelum Task 11), biarkan throw "Belum didukung" atau buka modal edit biasa. Setelah Task 11 selesai, sambungkan.

- [ ] **Step 7: Type-check**

Run: `npm run type-check`
Expected: 0 error. Kalau ada referensi `MaklonLineModal` tersisa, hapus.

- [ ] **Step 8: Commit**

```bash
git rm src/components/MaklonLineModal.tsx
git add src/app/pos/page.tsx
git commit -m "feat(pos): picker terpadu gabung katalog maklon, hapus MaklonLineModal"
```

---

## Task 11: "Tambah Item Lainnya" + Rincian Internal modal

**Files:**
- Create: `src/app/pos/ModalTambahItemLainnya.tsx`
- Create: `src/app/pos/ModalRincianInternalMaklon.tsx`
- Modify: `src/app/pos/page.tsx` (tombol "Tambah Item Lainnya" + state + handler, sambungkan `handleEditCartItem` maklon ke rincian internal)
- Modify: `src/components/KeranjangPOS.tsx` (render ikon 👁 pada baris maklon)

- [ ] **Step 1: Tulis `ModalTambahItemLainnya.tsx`** — `ModalFormShell`, 2 section. Section "Pelanggan": `nama_item`, `jumlah`, `nama_satuan`, `harga_jual`. Section "Rincian Internal" (collapsed via state `tampilkanInternal`, ikon 👁 toggle): `vendor_subkontrak_id` (select dari `subkontraktor`), `biaya_subkontrak`, `metode_bayar_vendor`. Validasi inline sebelum `onSave`: cek `vendor_subkontrak_id` && `biaya_subkontrak > 0` && `metode_bayar_vendor`; kalau gagal, `setTampilkanInternal(true)` + pesan error "Lengkapi Rincian Internal (vendor, biaya, metode) sebelum simpan."

```tsx
export interface TambahItemLainnyaValue {
  barang_nama: string;
  jumlah: number;
  nama_satuan: string;
  harga_satuan: number;
  vendor_subkontrak_id: string;
  biaya_subkontrak: number;
  metode_bayar_vendor: "CASH" | "NET30";
}
```

- [ ] **Step 2: Tulis `ModalRincianInternalMaklon.tsx`** — `ModalFormShell`, edit baris maklon existing. Section "Pelanggan" (nama, qty, harga jual) + section "Rincian Internal" (vendor, biaya, metode). `onSave` → return `Partial<CartItem>` untuk merge di parent.

- [ ] **Step 3: Di `KeranjangPOS.tsx`** — render ikon 👁 kecil pada baris `tipe_item === "MAKLON"` (sebelah tombol edit yang sudah ada). Klik → `onEditRincianInternal(index)` prop baru yang diteruskan ke parent.

- [ ] **Step 4: Di `pos/page.tsx`** — tambah state `showTambahItemLainnya`, `editingRincianInternalIndex`. Tombol "Tambah Item Lainnya" (ikon `+`, label netral, gantikan posisi tombol Maklon lama di area produk). Handlers:

```ts
  const handleSaveTambahItemLainnya = (v: TambahItemLainnyaValue) => {
    const newItem: CartItem = {
      barang_id: ID_BARANG_PLACEHOLDER_MAKLON,
      barang_nama: v.barang_nama,
      harga_satuan_id: ID_HARGA_PLACEHOLDER_MAKLON,
      nama_satuan: v.nama_satuan,
      faktor_konversi: 1,
      harga_satuan: v.harga_satuan,
      jumlah: v.jumlah,
      subtotalRaw: v.jumlah * v.harga_satuan,
      originalHargaSatuan: v.harga_satuan,
      tipe_item: "MAKLON",
      vendor_subkontrak_id: v.vendor_subkontrak_id,
      biaya_subkontrak: v.biaya_subkontrak,
      metode_bayar_vendor: v.metode_bayar_vendor,
      deskripsi_pekerjaan: v.barang_nama,
    };
    setCart((prev) => [...prev, newItem]);
    setShowTambahItemLainnya(false);
  };

  const handleSaveRincianInternal = (index: number, v: Partial<CartItem>) => {
    setCart((prev) => prev.map((it, i) => (i === index ? { ...it, ...v } : it)));
    setEditingRincianInternalIndex(null);
  };
```

Sambungkan `handleEditCartItem` untuk `tipe_item === "MAKLON"` (line ~609) → `setEditingRincianInternalIndex(index)` + buka `ModalRincianInternalMaklon`.

- [ ] **Step 5: Type-check + build**

Run: `npm run type-check && npm run build`
Expected: 0 error, build sukses.

- [ ] **Step 6: Commit**

```bash
git add src/app/pos/ModalTambahItemLainnya.tsx src/app/pos/ModalRincianInternalMaklon.tsx src/app/pos/page.tsx src/components/KeranjangPOS.tsx
git commit -m "feat(pos): tambah item lainnya + rincian internal maklon tersembunyi"
```

---

## Task 12: UI Parkir Keranjang + Dropdown

**Files:**
- Create: `src/app/pos/ModalParkirKeranjang.tsx`
- Create: `src/app/pos/DropdownKeranjangTersimpan.tsx`
- Modify: `src/components/KeranjangPOS.tsx` (header: tombol Parkir + dropdown)
- Modify: `src/app/pos/page.tsx` (state + handlers + pass props)

- [ ] **Step 1: Tulis `ModalParkirKeranjang.tsx`** — `ModalFormShell`, input `label` (pre-isi dari prop `defaultLabel`), tombol "Parkir" → `onConfirm(label)`. ESC/backdrop dismiss via shell.

- [ ] **Step 2: Tulis `DropdownKeranjangTersimpan.tsx`** — popover/`<details>` berisi list `ParkedCart[]`. Tiap baris: `<label>`, `·` count item (hitung dari `(cart_snapshot as any[]).length`), `·` jam (dari `dibuat_pada`), badge status. Aksi: "Muat", "Jadikan Penawaran", "Hapus" (ikon). Tutup popover setelah aksi. Maks ~30: kalau `parkedCarts.length > 30`, tampil peringatan "Finalisasi atau jadikan penawaran dulu".

- [ ] **Step 3: Di `pos/page.tsx`** — state + handlers:

```ts
  const [showParkirModal, setShowParkirModal] = useState(false);
  const [parkedCarts, setParkedCarts] = useState<ParkedCart[]>([]);
  const [loadedParkedId, setLoadedParkedId] = useState<string | null>(null);

  const defaultParkLabel = useMemo(() => {
    const nama = selectedPelanggan?.nama || pencarianPelanggan.trim() || "Pelanggan Umum";
    const jam = new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
    return `${nama} · ${cart.length} item · ${jam}`;
  }, [selectedPelanggan, pencarianPelanggan, cart.length]);

  const refreshParked = useCallback(async () => {
    try { setParkedCarts(await listParkedCartsAction()); } catch (e) { console.warn(e); }
  }, []);

  const handlePark = async (label: string) => {
    await parkCartAction({
      label,
      pelanggan_id: selectedPelanggan?.id || null,
      pelanggan_nama_snapshot: selectedPelanggan?.nama || pencarianPelanggan.trim() || null,
      pelanggan_kota: fakturUmum?.kota || null,
      prioritas,
      ppn_snapshot: ppnFaktur ?? null,
      cart_snapshot: cart,
    });
    setCart([]); setFakturUmum(null); setPpnFaktur(null); setPencarianPelanggan(""); setLoadedParkedId(null);
    setShowParkirModal(false);
    await refreshParked();
    showMsg("success", "Keranjang diparkir");
  };

  const handleLoadParked = async (id: string) => {
    if (cart.length > 0 && !window.confirm("Ganti keranjang saat ini? Keranjang yang belum diparkir akan hilang.")) return;
    const p = await loadParkedCartAction(id);
    if (!p) return;
    setCart(p.cart_snapshot as CartItem[]);
    setPencarianPelanggan(p.pelanggan_nama_snapshot || "");
    setPrioritas(p.prioritas);
    setPpnFaktur((p.ppn_snapshot as PpnFakturData | null) ?? null);
    setLoadedParkedId(id);
    showMsg("success", `Keranjang "${p.label}" dimuat`);
  };

  const handleJadikanPenawaran = async (id: string) => {
    const p = await loadParkedCartAction(id);
    if (!p) return;
    const items = (p.cart_snapshot as CartItem[]).map(toQuotationItemInput);
    const r = await jadikanPenawaranAction(id, items, {
      pelanggan_id: p.pelanggan_id,
      pelanggan_nama_snapshot: p.pelanggan_nama_snapshot,
      pelanggan_kota: p.pelanggan_kota,
      kena_ppn: p.ppn_snapshot ? true : undefined,
    });
    showMsg("success", `Jadikan penawaran ${r.nomor_penawaran}. Lihat di halaman Penawaran.`);
    await refreshParked();
  };

  const handleDeleteParked = async (id: string) => {
    if (!window.confirm("Hapus keranjang tersimpan ini?")) return;
    await deleteParkedCartAction(id);
    await refreshParked();
  };

  function toQuotationItemInput(item: CartItem): QuotationItemInput {
    return {
      barang_id: item.barang_id,
      harga_satuan_id: item.harga_satuan_id || null,
      jumlah: item.jumlah,
      nama_satuan: item.nama_satuan,
      faktor_konversi: item.faktor_konversi || 1,
      harga_satuan: item.harga_satuan,
      subtotal: item.subtotalRaw,
      panjang: item.panjang ?? null,
      lebar: item.lebar ?? null,
      tipe_item: (item.tipe_item as "BARANG" | "JASA" | "MAKLON") || "BARANG",
      vendor_subkontrak_id: item.vendor_subkontrak_id || null,
      biaya_subkontrak: item.biaya_subkontrak ?? null,
      metode_bayar_vendor: (item.metode_bayar_vendor as "CASH" | "NET30") || null,
      deskripsi_pekerjaan: item.deskripsi_pekerjaan || null,
    };
  }
```

- [ ] **Step 4: Pass props ke `KeranjangPOS`** — `parkedCarts`, `onParkClick={() => setShowParkirModal(true)}`, `onLoadParked`, `onJadikanPenawaran`, `onDeleteParked`, `cartLength={cart.length}`. Di header `KeranjangPOS`, tambah tombol "Parkir" (ikon, disabled jika `cart.length === 0`) + `<DropdownKeranjangTersimpan parkedCarts={parkedCarts} .../>`.

- [ ] **Step 5: `useEffect` refresh parked saat mount**:

```ts
  useEffect(() => { refreshParked(); }, [refreshParked]);
```

- [ ] **Step 6: Setelah checkout sukses** — di `processCheckout` (cari setelah `await reload()` dan sukses), kalau `loadedParkedId` set, panggil `await markFinalAction(loadedParkedId)` + `setLoadedParkedId(null)` + `refreshParked()`.

- [ ] **Step 7: Type-check + build**

Run: `npm run type-check && npm run build`
Expected: 0 error, build sukses.

- [ ] **Step 8: Commit**

```bash
git add src/app/pos/ModalParkirKeranjang.tsx src/app/pos/DropdownKeranjangTersimpan.tsx src/app/pos/page.tsx src/components/KeranjangPOS.tsx
git commit -m "feat(pos): parkir keranjang + dropdown + jadikan penawaran"
```

---

## Task 13: Verifikasi akhir

- [ ] **Step 1: Type-check**

Run: `npm run type-check`
Expected: 0 error.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: sukses.

- [ ] **Step 3: Jest service baru + regresi**

Run: `npx jest src/lib/__tests__/keranjang-tersimpan-service.test.ts src/lib/__tests__/katalog-maklon-service.test.ts src/lib/__tests__/quotation-service.test.ts src/app/pos 2>&1 | tail -n 30`
Expected: semua PASS.

- [ ] **Step 4: Lint (husky pre-commit sudah jalan, jalankan manual juga)**

Run: `npx eslint src/app/pos src/app/katalog-maklon src/lib/services/keranjang-tersimpan-service.ts src/lib/services/katalog-maklon-service.ts --fix`
Expected: tidak ada warning baru yang aku timbulkan.

- [ ] **Step 5: Apply skema ke cloud Supabase**

Run: `npm run supabase:db:push`
Expected: migrasi ter-apply ke cloud tanpa error.

- [ ] **Step 6: Test manual di browser (jika env)**

- POS: isi cart → Parkir → dropdown muncul → Muat → cart balik.
- POS: pilih produk katalog maklon dari grid → baris muncul tanpa label "Maklon" → ikon 👁 buka rincian internal → edit vendor/biaya → simpan.
- POS: "Tambah Item Lainnya" → isi tanpa rincian internal → simpan ditolak + pesan → isi rincian → simpan sukses.
- POS: "Lihat Faktur" → preview header toko + judul "Faktur Penjualan" + nomor `INV-...` berikutnya.
- POS: Parkir → dropdown "Jadikan Penawaran" → cek di `/penawaran` muncul draf QUO baru.
- Halaman `/katalog-maklon`: CRUD → cek muncul di grid POS.

- [ ] **Step 7: Push branch**

Run: `git push -u origin feat/pos-parkir-maklon`
Expected: push sukses.

- [ ] **Step 8: Laporkan ringkasan + ajak owner review sebelum merge** (skill `finishing-a-development-branch`).

---

## Catatan implementasi

- **Bahasa Indonesia:** semua string UI, komentar, JSDoc, nama file non-framework dalam Bahasa Indonesia baku (per AGENTS.md). Komentar lama berbahasa Inggris di file yang disentuh: terjemahkan jika berdekatan dengan edit.
- **Dark mode:** tiap kelas warna butuh pasangan `dark:`. Modals pakai `ModalFormShell`. Stat-card ikon `text-white` di `bg-white/20`.
- **Icon SVG only:** pakai ikon dari `src/components/icons/` atau ikon inline `currentColor`. Tidak ada emoji sebagai ikon.
- **`useCachedData`** untuk fetch list (`"katalog-maklon"`, `"pos-init"`). `useMemo(() => data ?? [], [data])` untuk stabil array.
- **`onSuccess` item baru:** `null` updated item → parent `reload()` (iron rule 11).
- **Idempotency:** tidak ada ledger mutation baru di workstream ini (maklon HPP/finance pakai kode existing).
- **Urutan task:** 0-2 (skema) wajib duluan. Lalu 3-5 (katalog) dan 9 (Lihat Faktur) bisa paralel. 6-7 (parked cart service/api) lalu 8 (pos init). 10-11 (picker + modal) butuh 3 & 8. 12 butuh 6-8. 13 di akhir.