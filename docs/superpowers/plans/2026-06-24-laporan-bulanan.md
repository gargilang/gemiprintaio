# Laporan Manajemen Bulanan — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambahkan fitur cetak Laporan Manajemen Bulanan berbentuk dokumen A4 portrait bergaya faktur Gemiprint, dipicu dari halaman `/laporan`, terikat ke periode akuntansi yang sudah ditutup, dengan kata pembuka/penutup yang bisa diedit dan TTD direktur + manajer.

**Architecture:** Service baru `laporan-bulanan-service.ts` mengagregasi data dari `getFormalAccountingReport` + query tambahan (gaji, pembelian, hutang/piutang, pegawai). Generator HTML baru `laporan-bulanan-print.ts` mirip `faktur-print.ts` (A4 portrait, logo SVG, Bauhaus 93 + TW Cen MT). Modal UI baru `ModalLaporanBulanan.tsx` menggunakan `ModalFormShell` + `PratinjauFakturMengambang`. Nomor laporan sequential disimpan di tabel baru `laporan_bulanan`.

**Tech Stack:** Next.js 15 App Router, TypeScript, Tailwind CSS, existing `ModalFormShell`, `PratinjauFakturMengambang`, `db-unified` (Supabase + SQLite), `faktur-print.ts` pattern (popup window + `window.print()`), Bauhaus 93 + TW Cen MT fonts (sudah ada di `/assets/fonts/`).

---

## File Map

| File | Status | Tanggung Jawab |
|---|---|---|
| `supabase/migrations/20260624100000_laporan_bulanan.sql` | **Buat** | DDL Supabase untuk tabel `laporan_bulanan` |
| `database/sqlite-schema.sql` | **Ubah** | Tambah CREATE TABLE `laporan_bulanan` |
| `src/lib/db-unified.ts` | **Ubah** | Runtime CREATE TABLE `laporan_bulanan` untuk SQLite |
| `src/lib/sync-config.ts` | **Ubah** | Daftarkan `laporan_bulanan` ke sync tables |
| `src/components/icons/ContentIcons.tsx` | **Ubah** | Tambah `PrinterIcon` dan `DocumentIcon` |
| `src/lib/services/laporan-bulanan-service.ts` | **Buat** | Fetch + agregasi semua data laporan dari DB |
| `src/lib/laporan-bulanan-print.ts` | **Buat** | Generator HTML A4 portrait siap cetak |
| `src/app/laporan/actions.ts` | **Ubah** | Tambah 2 server actions: getClosedPeriods + generateLaporan |
| `src/app/laporan/ModalLaporanBulanan.tsx` | **Buat** | Modal pilih periode + edit teks + Pratinjau + Cetak |
| `src/app/laporan/page.tsx` | **Ubah** | Tambah card "Laporan Bulanan" + wire modal |

## Catatan Penting Sebelum Mulai

- **`db.queryRaw<T>(sql, params)`** mengembalikan `T[]` langsung (bukan `{ data, error }`). Semua kode yang menggunakan `queryRaw` harus menggunakan hasil langsung, contoh: `const rows = await db.queryRaw<MyType>(sql, params)`.
- **`session.uid`** adalah field yang benar dari `requireAdminOrManager()`.
- **`PrinterIcon` dan `DocumentIcon`** belum ada — harus ditambahkan di Task 1.5 sebelum Task 5 dan 6.

---

## Task 1: Skema Database

**Files:**
- Create: `supabase/migrations/20260624100000_laporan_bulanan.sql`
- Modify: `database/sqlite-schema.sql`
- Modify: `src/lib/db-unified.ts`
- Modify: `src/lib/sync-config.ts`

- [ ] **Step 1.1: Buat file migrasi Supabase**

Buat file `supabase/migrations/20260624100000_laporan_bulanan.sql` dengan konten:

```sql
-- Tabel laporan_bulanan: menyimpan riwayat laporan yang pernah digenerate
-- dan menjamin nomor laporan (LPR/YYYY/MM/XXX) bersifat sequential & unik.
CREATE TABLE IF NOT EXISTS "public"."laporan_bulanan" (
  "id"                  TEXT PRIMARY KEY,
  "nomor_laporan"       TEXT NOT NULL UNIQUE,
  "accounting_period_id" TEXT NOT NULL REFERENCES "public"."accounting_periods"("id"),
  "dibuat_oleh"         TEXT NOT NULL,
  "dibuat_pada"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  "kata_pembuka"        TEXT,
  "kata_penutup"        TEXT,
  -- Kolom sync standar
  "sync_status"         TEXT NOT NULL DEFAULT 'pending'
                        CHECK (sync_status IN ('pending','synced','conflict')),
  "last_synced_at"      TIMESTAMPTZ,
  "sync_version"        INTEGER NOT NULL DEFAULT 0,
  "updated_at_server"   TIMESTAMPTZ,
  "updated_by_device"   TEXT,
  "change_version"      INTEGER NOT NULL DEFAULT 0,
  "is_deleted"          INTEGER NOT NULL DEFAULT 0,
  "deleted_at"          TIMESTAMPTZ,
  "client_mutation_id"  TEXT
);

CREATE INDEX IF NOT EXISTS "idx_laporan_bulanan_period"
  ON "public"."laporan_bulanan" ("accounting_period_id");
CREATE INDEX IF NOT EXISTS "idx_laporan_bulanan_sync"
  ON "public"."laporan_bulanan" ("sync_status");
```

- [ ] **Step 1.2: Tambahkan CREATE TABLE ke sqlite-schema.sql**

Buka `database/sqlite-schema.sql`. Temukan baris terakhir sebelum akhir file (biasanya setelah tabel `biaya_tambahan_penjualan`). Tambahkan di baris akhir:

```sql
-- Table: laporan_bulanan
CREATE TABLE laporan_bulanan (
      id TEXT PRIMARY KEY,
      nomor_laporan TEXT NOT NULL UNIQUE,
      accounting_period_id TEXT NOT NULL REFERENCES accounting_periods(id),
      dibuat_oleh TEXT NOT NULL,
      dibuat_pada TEXT NOT NULL DEFAULT (datetime('now')),
      kata_pembuka TEXT,
      kata_penutup TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER NOT NULL DEFAULT 0,
      updated_at_server TEXT,
      updated_by_device TEXT,
      change_version INTEGER NOT NULL DEFAULT 0,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT
    );

CREATE INDEX idx_laporan_bulanan_period ON laporan_bulanan(accounting_period_id);
CREATE INDEX idx_laporan_bulanan_sync ON laporan_bulanan(sync_status);
```

- [ ] **Step 1.3: Tambahkan runtime CREATE TABLE di db-unified.ts**

Buka `src/lib/db-unified.ts`. Cari blok `CREATE TABLE IF NOT EXISTS sync_queue` (sekitar baris 1489). Tambahkan blok baru **setelah** blok sync_queue (sebelum close kurung besar fungsinya):

```typescript
    // Tabel laporan_bulanan: riwayat laporan bulanan digenerate
    db.exec(`
      CREATE TABLE IF NOT EXISTS laporan_bulanan (
        id TEXT PRIMARY KEY,
        nomor_laporan TEXT NOT NULL UNIQUE,
        accounting_period_id TEXT NOT NULL,
        dibuat_oleh TEXT NOT NULL,
        dibuat_pada TEXT NOT NULL DEFAULT (datetime('now')),
        kata_pembuka TEXT,
        kata_penutup TEXT,
        sync_status TEXT NOT NULL DEFAULT 'pending',
        last_synced_at TEXT,
        sync_version INTEGER NOT NULL DEFAULT 0,
        updated_at_server TEXT,
        updated_by_device TEXT,
        change_version INTEGER NOT NULL DEFAULT 0,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT,
        client_mutation_id TEXT
      )
    `);
```

- [ ] **Step 1.4: Daftarkan ke sync-config.ts**

Buka `src/lib/sync-config.ts`. Tambahkan setelah `PAYROLL_SYNC_TABLES`:

```typescript
export const REPORTING_SYNC_TABLES = [
  "laporan_bulanan",
] as const;
```

Dan update `ALL_SYNC_TABLES`:

```typescript
export const ALL_SYNC_TABLES = [
  ...CORE_SYNC_TABLES,
  ...BALANCE_SYNC_TABLES,
  ...MASTER_SYNC_TABLES,
  ...PAYROLL_SYNC_TABLES,
  ...REPORTING_SYNC_TABLES,
] as const;
```

- [ ] **Step 1.5: Type-check**

```bash
npm run type-check
```

Expected: 0 errors.

- [ ] **Step 1.5: Tambah dua ikon baru ke ContentIcons.tsx**

Buka `src/components/icons/ContentIcons.tsx`. Tambahkan dua komponen ikon baru di bagian akhir file, sebelum baris terakhir:

```typescript
export const PrinterIcon = ({ className = "", size = 16 }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <polyline points="6 9 6 2 18 2 18 9" />
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <rect x="6" y="14" width="12" height="8" />
  </svg>
);

export const DocumentIcon = ({ className = "", size = 16 }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);
```

- [ ] **Step 1.6: Commit**

```bash
git add supabase/migrations/20260624100000_laporan_bulanan.sql \
        database/sqlite-schema.sql \
        src/lib/db-unified.ts \
        src/lib/sync-config.ts \
        src/components/icons/ContentIcons.tsx
git commit -m "feat: tambah tabel laporan_bulanan dan ikon PrinterIcon/DocumentIcon"
```

---

## Task 2: Service Data Laporan

**Files:**
- Create: `src/lib/services/laporan-bulanan-service.ts`

- [ ] **Step 2.1: Buat service file**

Buat `src/lib/services/laporan-bulanan-service.ts`:

```typescript
"server-only";

/**
 * Service data Laporan Manajemen Bulanan.
 * Mengagregasi KPI, buku kas, hutang/piutang, inventori, dan data TTD
 * dari satu accounting_period yang sudah ditutup.
 */

import { db } from "@/lib/db-unified";
import { getFormalAccountingReport } from "@/lib/services/reports-service";

// ── Tipe data publik ────────────────────────────────────────────────────────

export interface InfoToko {
  nama_toko: string;
  slogan: string | null;
  alamat: string | null;
  telepon: string | null;
  email: string | null;
}

export interface KpiLaporan {
  omzet: number;
  jumlah_faktur_penjualan: number;
  hpp: number;
  laba_kotor: number;
  margin_kotor_persen: number;
  biaya_operasional: number;
  total_gaji: number;
  laba_bersih: number;
  margin_bersih_persen: number;
  total_pembelian: number;
  jumlah_po: number;
  nilai_inventori: number;
}

export interface SaldoHutangPiutang {
  jumlah_piutang: number;
  total_piutang: number;
  jumlah_hutang: number;
  total_hutang: number;
}

export interface BarisBukuKas {
  tanggal: string;
  kategori_label: string;
  keperluan: string;
  debit: number;
  kredit: number;
  saldo: number;
}

export interface TtdInfo {
  nama_direktur: string | null;
  nama_manajer: string | null;
}

export interface LaporanBulananData {
  nomor_laporan: string;
  periode_label: string;
  start_date: string;
  end_date: string;
  info_toko: InfoToko;
  kpi: KpiLaporan;
  hutang_piutang: SaldoHutangPiutang;
  buku_kas: BarisBukuKas[];
  saldo_akhir: number;
  ttd: TtdInfo;
  kata_pembuka: string;
  kata_penutup: string;
}

// ── Helper ──────────────────────────────────────────────────────────────────

function num(v: unknown): number {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

/** Format YYYY-MM menjadi label Bahasa Indonesia, misal "2026-06" → "Juni 2026". */
export function formatPeriodKeyLabel(periodKey: string): string {
  const [yearStr, monthStr] = periodKey.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1; // 0-indexed
  return new Date(year, month, 1).toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
  });
}

// ── Fungsi utama ────────────────────────────────────────────────────────────

/**
 * Buat nomor laporan sequential: LPR/YYYY/MM/XXX.
 * Hitung berapa laporan sudah ada untuk YYYY/MM yang sama, lalu +1.
 * CATATAN: db.queryRaw mengembalikan T[] langsung, bukan { data, error }.
 */
export async function generateNomorLaporan(periodKey: string): Promise<string> {
  const [yyyy, mm] = periodKey.split("-");
  const prefix = `LPR/${yyyy}/${mm}/`;

  const rows = await db.queryRaw<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM laporan_bulanan
     WHERE nomor_laporan LIKE ?`,
    [`${prefix}%`]
  );
  const count = num(rows[0]?.cnt ?? 0);
  const seq = String(count + 1).padStart(3, "0");
  return `${prefix}${seq}`;
}

/**
 * Simpan record laporan bulanan ke DB (idempoten berdasarkan nomor_laporan).
 * Mengembalikan nomor_laporan yang tersimpan.
 */
export async function simpanLaporanBulanan(params: {
  id: string;
  nomor_laporan: string;
  accounting_period_id: string;
  dibuat_oleh: string;
  kata_pembuka: string;
  kata_penutup: string;
}): Promise<void> {
  await db.insert("laporan_bulanan", {
    id: params.id,
    nomor_laporan: params.nomor_laporan,
    accounting_period_id: params.accounting_period_id,
    dibuat_oleh: params.dibuat_oleh,
    kata_pembuka: params.kata_pembuka,
    kata_penutup: params.kata_penutup,
    dibuat_pada: new Date().toISOString(),
  });
}

/**
 * Ambil semua data yang dibutuhkan untuk mencetak laporan bulanan.
 */
export async function getLaporanBulananData(params: {
  accounting_period_id: string;
  nomor_laporan: string;
  kata_pembuka: string;
  kata_penutup: string;
}): Promise<LaporanBulananData> {
  // ── 1. Info periode ──────────────────────────────────────────────────────
  const periodRes = await db.queryOne<{
    id: string;
    period_key: string;
    start_date: string;
    end_date: string;
    status: string;
  }>("accounting_periods", { where: { id: params.accounting_period_id } });

  if (periodRes.error) throw periodRes.error;
  if (!periodRes.data) throw new Error("Periode tidak ditemukan.");
  if (periodRes.data.status !== "CLOSED") {
    throw new Error("Hanya periode yang sudah ditutup yang bisa dicetak laporannya.");
  }

  const period = periodRes.data;
  const { start_date, end_date, period_key } = period;

  // ── 2. Pakai getFormalAccountingReport untuk KPI utama ───────────────────
  const formal = await getFormalAccountingReport({ startDate: start_date, endDate: end_date });

  // CATATAN: db.queryRaw mengembalikan T[] langsung (bukan { data, error }).

  // ── 3. Total gaji dari keuangan (kategori_transaksi = 'GAJI') ────────────
  const gajiRows = await db.queryRaw<{ total: number }>(
    `SELECT COALESCE(SUM(kredit), 0) AS total
     FROM keuangan
     WHERE status_transaksi = 'POSTED'
       AND kategori_transaksi = 'GAJI'
       AND tanggal BETWEEN ? AND ?`,
    [start_date, end_date]
  );
  const totalGaji = num(gajiRows[0]?.total ?? 0);

  // ── 4. Total pembelian dan jumlah PO ─────────────────────────────────────
  const pembelianRows = await db.queryRaw<{ total: number; cnt: number }>(
    `SELECT COALESCE(SUM(total_jumlah), 0) AS total, COUNT(*) AS cnt
     FROM pembelian
     WHERE status_transaksi = 'POSTED'
       AND tanggal BETWEEN ? AND ?`,
    [start_date, end_date]
  );
  const totalPembelian = num(pembelianRows[0]?.total ?? 0);
  const jumlahPO = num(pembelianRows[0]?.cnt ?? 0);

  // ── 5. Piutang outstanding (sisa_piutang > 0) ─────────────────────────────
  const piutangRows = await db.queryRaw<{ cnt: number; total: number }>(
    `SELECT COUNT(*) AS cnt, COALESCE(SUM(sisa_piutang), 0) AS total
     FROM piutang_penjualan
     WHERE sisa_piutang > 0`,
    []
  );
  // Hutang outstanding (sisa_hutang > 0)
  const hutangRows = await db.queryRaw<{ cnt: number; total: number }>(
    `SELECT COUNT(*) AS cnt, COALESCE(SUM(sisa_hutang), 0) AS total
     FROM hutang_pembelian
     WHERE sisa_hutang > 0`,
    []
  );

  // ── 6. Nilai inventori (snapshot saat generate) ──────────────────────────
  const inventoriRows = await db.queryRaw<{ nilai: number }>(
    `SELECT COALESCE(SUM(jumlah_stok * average_cost_per_base_unit), 0) AS nilai
     FROM barang
     WHERE lacak_inventori_status != 0`,
    []
  );
  const nilaiInventori = num(inventoriRows[0]?.nilai ?? 0);

  // ── 7. Nama TTD dari pegawai + peran_pegawai ──────────────────────────────
  const pegawaiList = await db.queryRaw<{ display_name: string; role_label: string }>(
    `SELECT p.display_name, r.role_label
     FROM pegawai p
     JOIN peran_pegawai r ON p.role_code = r.role_code
     WHERE p.is_active = 1`,
    []
  );
  const findRole = (keyword: string) =>
    pegawaiList.find((p) =>
      p.role_label.toLowerCase().includes(keyword.toLowerCase())
    )?.display_name ?? null;

  const ttd: TtdInfo = {
    nama_direktur: findRole("direktur"),
    nama_manajer: findRole("manajer") ?? findRole("manager"),
  };

  // ── 8. Pengaturan toko ────────────────────────────────────────────────────
  const tokoRes = await db.queryOne<{
    nama_toko: string;
    slogan: string | null;
    alamat: string | null;
    telepon: string | null;
    email: string | null;
  }>("pengaturan_toko", { where: { id: "default" } });
  const toko = tokoRes.data;

  // ── 9. Buku kas rincian (halaman 2+) ─────────────────────────────────────
  const kasRows = await db.queryRaw<{
    tanggal: string;
    kategori_transaksi: string;
    keperluan: string | null;
    debit: number;
    kredit: number;
    saldo: number;
  }>(
    `SELECT tanggal, kategori_transaksi, keperluan, debit, kredit, saldo
     FROM keuangan
     WHERE status_transaksi = 'POSTED'
       AND tanggal BETWEEN ? AND ?
     ORDER BY tanggal ASC, dibuat_pada ASC`,
    [start_date, end_date]
  );

  // Ambil label kategori dari finance_category_definitions
  const catDefs = await db.queryRaw<{ category_code: string; display_name: string }>(
    `SELECT category_code, display_name FROM finance_category_definitions`,
    []
  );
  const catMap = new Map(catDefs.map((c) => [c.category_code, c.display_name]));

  const bukuKas: BarisBukuKas[] = kasRows.map((row) => ({
    tanggal: row.tanggal,
    kategori_label: catMap.get(row.kategori_transaksi) ?? row.kategori_transaksi,
    keperluan: row.keperluan ?? "",
    debit: num(row.debit),
    kredit: num(row.kredit),
    saldo: num(row.saldo),
  }));

  const saldoAkhir = bukuKas.length > 0 ? bukuKas[bukuKas.length - 1].saldo : 0;

  // ── 10. Susun KPI ─────────────────────────────────────────────────────────
  const omzet = formal.profitLoss.revenue;
  const hpp = formal.profitLoss.cogs;
  const labaKotor = formal.profitLoss.grossProfit;
  const marginKotor =
    omzet > 0 ? Math.round((labaKotor / omzet) * 10000) / 100 : 0;
  const biayaOps = formal.profitLoss.operationalExpenses;
  const labaBersih = formal.profitLoss.netProfit;
  const marginBersih =
    omzet > 0 ? Math.round((labaBersih / omzet) * 10000) / 100 : 0;

  const kpi: KpiLaporan = {
    omzet,
    jumlah_faktur_penjualan: formal.profitLoss.salesCount,
    hpp,
    laba_kotor: labaKotor,
    margin_kotor_persen: marginKotor,
    biaya_operasional: biayaOps,
    total_gaji: totalGaji,
    laba_bersih: labaBersih,
    margin_bersih_persen: marginBersih,
    total_pembelian: totalPembelian,
    jumlah_po: jumlahPO,
    nilai_inventori: nilaiInventori,
  };

  return {
    nomor_laporan: params.nomor_laporan,
    periode_label: formatPeriodKeyLabel(period_key),
    start_date,
    end_date,
    info_toko: {
      nama_toko: toko?.nama_toko ?? "gemiprint",
      slogan: toko?.slogan ?? null,
      alamat: toko?.alamat ?? null,
      telepon: toko?.telepon ?? null,
      email: toko?.email ?? null,
    },
    kpi,
    hutang_piutang: {
      jumlah_piutang: num(piutangRows[0]?.cnt ?? 0),
      total_piutang: num(piutangRows[0]?.total ?? 0),
      jumlah_hutang: num(hutangRows[0]?.cnt ?? 0),
      total_hutang: num(hutangRows[0]?.total ?? 0),
    },
    buku_kas: bukuKas,
    saldo_akhir: saldoAkhir,
    ttd,
    kata_pembuka: params.kata_pembuka,
    kata_penutup: params.kata_penutup,
  };
}
```

- [ ] **Step 2.2: Konfirmasi signature `db.queryRaw`**

```bash
grep -n "async queryRaw" src/lib/db-unified.ts
```

Expected output: `async queryRaw<T = any>(sql: string, params: any[] = []): Promise<T[]>`

Penting: return type adalah `T[]` langsung, BUKAN `{ data: T[], error: any }`. Kode service di Step 2.1 sudah menggunakan pola yang benar.

- [ ] **Step 2.3: Type-check**

```bash
npm run type-check
```

Expected: 0 errors.

- [ ] **Step 2.4: Commit**

```bash
git add src/lib/services/laporan-bulanan-service.ts
git commit -m "feat: tambah service agregasi data laporan manajemen bulanan"
```

---

## Task 3: HTML Generator

**Files:**
- Create: `src/lib/laporan-bulanan-print.ts`

- [ ] **Step 3.1: Buat generator HTML**

Buat file `src/lib/laporan-bulanan-print.ts`. File ini mirip `faktur-print.ts` tapi portrait A4:

```typescript
/**
 * Generator HTML Laporan Manajemen Bulanan A4 portrait.
 * Desain konsisten dengan faktur Gemiprint: logo SVG, Bauhaus 93 italic,
 * TW Cen MT, palette navy #0a1b3d + cyan #00AFEF.
 * Output: HTML standalone, bisa dibuka di popup/iframe → window.print().
 */

import {
  formatJakartaDate,
  formatRupiahPlain,
} from "@/lib/format-id";
import type { LaporanBulananData } from "@/lib/services/laporan-bulanan-service";

// Logo SVG paths — sama persis dengan faktur-print.ts
const LOGO_SVG_PATHS = `
  <path fill-rule="evenodd" clip-rule="evenodd" d="M11.1519 0.00085052H29.1766C38.4569 0.00085052 42.4009 44.1129 24.9542 44.1006H9.98877C27.0196 43.0487 25.6697 -0.221045 11.1484 0.00085052H11.1519Z" fill="#0a1b3d"/>
  <path fill-rule="evenodd" clip-rule="evenodd" d="M9.08292 1.29121C-0.976261 1.29121 -2.18167 22.7863 3.02062 29.2213C4.54324 31.1074 5.59357 31.054 7.54972 30.1171C9.44595 29.209 11.0496 27.4215 11.395 24.0725C11.885 18.6237 9.79841 16.7993 6.86595 13.5119H14.5707C15.0042 11.1574 15.7197 8.8932 16.6925 6.9701C14.9267 3.54304 12.3714 1.31176 9.07587 1.31176V1.29943L9.08292 1.29121Z" fill="#00AFEF"/>
  <path fill-rule="evenodd" clip-rule="evenodd" d="M7.17259 43.4268C2.76685 43.02 1.19136 40.7312 0.377177 36.396L16.9181 36.2028C14.8139 40.2052 11.3633 43.0118 7.17259 43.4268Z" fill="#00AFEF"/>
  <path fill-rule="evenodd" clip-rule="evenodd" d="M10.4293 14.868C14.5284 18.3608 14.3733 28.8885 9.61513 30.7582C9.31554 30.8773 8.32513 31.0088 8.66349 31.0088L10.4399 31.0129H19.0011C20.2488 27.7831 20.3757 18.8744 19.5756 14.868H10.4293Z" fill="#00AFEF"/>
`;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function rp(n: number): string {
  return formatRupiahPlain(n);
}

function pct(n: number): string {
  return `${n.toFixed(2)}%`;
}

export function generateLaporanBulananHTML(data: LaporanBulananData): string {
  const { info_toko, kpi, hutang_piutang, buku_kas, saldo_akhir, ttd } = data;

  const tokoNama = esc(info_toko.nama_toko);
  const tokoAlamat = info_toko.alamat
    ? esc(info_toko.alamat).replace(/\n/g, "<br>")
    : "";
  const tokoTelepon = info_toko.telepon ? esc(info_toko.telepon) : "";
  const tokoEmail = info_toko.email ? esc(info_toko.email) : "";
  const slogan = info_toko.slogan
    ? esc(info_toko.slogan)
    : "Digital Printing &amp; Advertising";

  const tanggalCetak = formatJakartaDate(data.end_date);
  const kotaTanggal = `Bekasi, ${tanggalCetak}`;

  const namaDirektur = ttd.nama_direktur ? esc(ttd.nama_direktur) : "";
  const namaManajer = ttd.nama_manajer ? esc(ttd.nama_manajer) : "";

  // Baris buku kas
  const kasRows = buku_kas
    .map(
      (row, i) => `
    <tr class="${i % 2 === 0 ? "row-even" : "row-odd"}">
      <td>${esc(formatJakartaDate(row.tanggal))}</td>
      <td>${esc(row.kategori_label)}</td>
      <td class="col-keperluan">${esc(row.keperluan)}</td>
      <td class="num">${row.debit > 0 ? rp(row.debit) : "—"}</td>
      <td class="num">${row.kredit > 0 ? rp(row.kredit) : "—"}</td>
      <td class="num">${rp(row.saldo)}</td>
    </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Laporan Manajemen Bulanan — ${esc(data.periode_label)}</title>
  <style>
    @font-face {
      font-family: 'Bauhaus 93';
      src: url('/assets/fonts/BAUHS93.ttf') format('truetype');
      font-weight: normal;
      font-style: normal;
    }
    @font-face {
      font-family: 'TW Cen MT';
      src: url('/assets/fonts/Tw Cen MT.ttf') format('truetype');
      font-weight: normal;
      font-style: normal;
    }
    @font-face {
      font-family: 'TW Cen MT';
      src: url('/assets/fonts/TwCenMTStdBold.otf') format('opentype');
      font-weight: bold;
      font-style: normal;
    }

    @page { size: A4 portrait; margin: 12mm; }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    html, body {
      font-family: 'TW Cen MT', Arial, sans-serif;
      color: #0a1b3d;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      background: #fff;
    }
    body {
      width: 186mm;
      margin: 0 auto;
      font-size: 9.5pt;
      line-height: 1.3;
    }

    /* Watermark */
    body::before {
      content: "";
      position: fixed;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      width: 110mm; height: 110mm;
      opacity: 0.045;
      pointer-events: none;
      z-index: 0;
      background: url("data:image/svg+xml,%3Csvg viewBox='0 0 38 45' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M11.1519 0.00085052H29.1766C38.4569 0.00085052 42.4009 44.1129 24.9542 44.1006H9.98877C27.0196 43.0487 25.6697 -0.221045 11.1484 0.00085052H11.1519Z' fill='%230a1b3d'/%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M9.08292 1.29121C-0.976261 1.29121 -2.18167 22.7863 3.02062 29.2213C4.54324 31.1074 5.59357 31.054 7.54972 30.1171C9.44595 29.209 11.0496 27.4215 11.395 24.0725C11.885 18.6237 9.79841 16.7993 6.86595 13.5119H14.5707C15.0042 11.1574 15.7197 8.8932 16.6925 6.9701C14.9267 3.54304 12.3714 1.31176 9.07587 1.31176V1.29943L9.08292 1.29121Z' fill='%2300AFEF'/%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M7.17259 43.4268C2.76685 43.02 1.19136 40.7312 0.377177 36.396L16.9181 36.2028C14.8139 40.2052 11.3633 43.0118 7.17259 43.4268Z' fill='%2300AFEF'/%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M10.4293 14.868C14.5284 18.3608 14.3733 28.8885 9.61513 30.7582C9.31554 30.8773 8.32513 31.0088 8.66349 31.0088L10.4399 31.0129H19.0011C20.2488 27.7831 20.3757 18.8744 19.5756 14.868H10.4293Z' fill='%2300AFEF'/%3E%3C/svg%3E") center/contain no-repeat;
    }

    /* ── KOP SURAT ── */
    .kop {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      padding-bottom: 6px;
      border-bottom: 2px solid #0a1b3d;
      margin-bottom: 10px;
      position: relative;
      z-index: 1;
    }
    .brand { display: flex; align-items: center; gap: 10px; }
    .brand-logo { display: flex; flex-direction: column; align-items: center; gap: 2px; }
    .brand-logo svg { width: 36px; height: 43px; }
    .brand-wordmark {
      font-family: 'Bauhaus 93', serif;
      font-size: 24pt;
      font-style: italic;
      line-height: 1;
      letter-spacing: -1px;
    }
    .brand-wordmark .gemi { color: #00AFEF; }
    .brand-wordmark .print { color: #0a1b3d; }
    .brand-sub { font-size: 7.5pt; color: #555; margin-top: 2px; }
    .brand-address {
      border-left: 1px solid #c8dce8;
      padding-left: 10px;
      font-size: 8pt;
      color: #0a1b3d;
      line-height: 1.45;
    }
    .brand-address span { color: #555; display: block; }

    /* ── IDENTITAS DOKUMEN ── */
    .doc-header {
      text-align: center;
      margin-bottom: 8px;
      position: relative;
      z-index: 1;
    }
    .doc-title {
      font-size: 13pt;
      font-weight: bold;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: #0a1b3d;
    }
    .doc-periode {
      font-size: 10pt;
      font-weight: bold;
      color: #00AFEF;
      margin-top: 2px;
    }
    .doc-nomor {
      font-size: 8pt;
      color: #555;
      margin-top: 1px;
    }

    /* ── PARAGRAF ── */
    .paragraf {
      font-size: 9pt;
      line-height: 1.6;
      text-align: justify;
      margin-bottom: 10px;
      position: relative;
      z-index: 1;
    }
    .paragraf p { margin-bottom: 4px; }

    /* ── TABEL RINGKASAN KPI ── */
    .section-title {
      font-size: 9pt;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: #00AFEF;
      border-bottom: 1px solid #c8dce8;
      padding-bottom: 2px;
      margin-bottom: 5px;
      margin-top: 10px;
      position: relative;
      z-index: 1;
    }
    table.ringkasan {
      width: 100%;
      border-collapse: collapse;
      font-size: 9pt;
      margin-bottom: 8px;
      position: relative;
      z-index: 1;
    }
    table.ringkasan td {
      padding: 3.5px 6px;
      border: 1px solid #d0e4f0;
    }
    table.ringkasan .no { width: 6%; text-align: center; color: #555; }
    table.ringkasan .uraian { width: 56%; }
    table.ringkasan .nilai { width: 38%; text-align: right; font-weight: bold; }
    table.ringkasan tr:nth-child(even) td { background: #f0f8ff; }
    table.ringkasan .row-laba td { background: #e8f5e9 !important; font-weight: bold; }
    table.ringkasan .row-separator td {
      border-top: 2px solid #0a1b3d;
      background: #cfeafa;
      font-weight: bold;
    }
    table.ringkasan thead th {
      background: #0a1b3d;
      color: #fff;
      padding: 4px 6px;
      font-size: 8.5pt;
      text-align: left;
      font-weight: bold;
    }
    table.ringkasan thead th.nilai { text-align: right; }

    /* ── TABEL HUTANG PIUTANG ── */
    table.hutang-piutang {
      width: 100%;
      border-collapse: collapse;
      font-size: 9pt;
      margin-bottom: 8px;
      position: relative;
      z-index: 1;
    }
    table.hutang-piutang thead th {
      background: #0a1b3d;
      color: #fff;
      padding: 4px 6px;
      font-size: 8.5pt;
      text-align: left;
    }
    table.hutang-piutang thead th.num { text-align: right; }
    table.hutang-piutang td {
      padding: 3.5px 6px;
      border: 1px solid #d0e4f0;
    }
    table.hutang-piutang td.num { text-align: right; font-weight: bold; }

    /* ── TTD ── */
    .ttd-block {
      margin-top: 16px;
      display: flex;
      justify-content: space-between;
      position: relative;
      z-index: 1;
    }
    .ttd-col {
      width: 45%;
      font-size: 8.5pt;
      line-height: 1.4;
    }
    .ttd-col .ttd-kota { color: #555; margin-bottom: 6px; }
    .ttd-col .ttd-jabatan { font-weight: bold; margin-bottom: 36px; }
    .ttd-col .ttd-garis {
      border-top: 1px solid #0a1b3d;
      padding-top: 3px;
      font-weight: bold;
    }

    /* ── HALAMAN 2+: BUKU KAS ── */
    .page-break { page-break-before: always; }
    .kas-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      border-bottom: 2px solid #0a1b3d;
      padding-bottom: 4px;
      margin-bottom: 8px;
      position: relative;
      z-index: 1;
    }
    .kas-header .kas-toko { font-weight: bold; font-size: 10pt; }
    .kas-header .kas-meta { font-size: 8pt; color: #555; text-align: right; }

    table.kas {
      width: 100%;
      border-collapse: collapse;
      font-size: 8pt;
      position: relative;
      z-index: 1;
    }
    table.kas thead th {
      background: #0a1b3d;
      color: #fff;
      padding: 4px 5px;
      text-align: left;
      font-size: 8pt;
    }
    table.kas thead th.num { text-align: right; }
    table.kas td {
      padding: 3px 5px;
      border-bottom: 1px solid #e8eef4;
      vertical-align: top;
    }
    table.kas td.num { text-align: right; white-space: nowrap; }
    table.kas td.col-keperluan { max-width: 55mm; word-break: break-word; }
    table.kas .row-even td { background: #fff; }
    table.kas .row-odd td { background: #f5f9fc; }
    table.kas .row-saldo-akhir td {
      background: #cfeafa;
      font-weight: bold;
      border-top: 2px solid #0a1b3d;
    }

    /* Toolbar (hanya layar, disembunyikan saat cetak) */
    .toolbar {
      position: fixed;
      top: 12px; right: 12px;
      z-index: 999;
    }
    .btn-print {
      background: #0a1b3d;
      color: #fff;
      border: none;
      padding: 8px 18px;
      font-family: 'TW Cen MT', Arial, sans-serif;
      font-size: 10pt;
      font-weight: bold;
      border-radius: 6px;
      cursor: pointer;
      letter-spacing: 0.3px;
    }
    .btn-print:hover { background: #00AFEF; }

    @media print {
      .toolbar { display: none !important; }
      body { width: auto; margin: 0; }
    }
  </style>
</head>
<body>

<div class="toolbar">
  <button class="btn-print" onclick="window.print()">Cetak / Unduh PDF</button>
</div>

<!-- ══════════════ HALAMAN 1: RINGKASAN EKSEKUTIF ══════════════ -->

<!-- Kop Surat -->
<div class="kop">
  <div class="brand">
    <div class="brand-logo">
      <svg viewBox="0 0 38 45" xmlns="http://www.w3.org/2000/svg">${LOGO_SVG_PATHS}</svg>
      <div class="brand-wordmark">
        <span class="gemi">gemi</span><span class="print">print</span>
      </div>
      <div class="brand-sub">${slogan}</div>
    </div>
  </div>
  <div class="brand-address">
    ${tokoAlamat ? `<span>${tokoAlamat}</span>` : ""}
    ${tokoTelepon ? `<span>Telp: ${tokoTelepon}</span>` : ""}
    ${tokoEmail ? `<span>${tokoEmail}</span>` : ""}
  </div>
</div>

<!-- Identitas Dokumen -->
<div class="doc-header">
  <div class="doc-title">Laporan Manajemen Bulanan</div>
  <div class="doc-periode">${esc(data.periode_label)}</div>
  <div class="doc-nomor">No. ${esc(data.nomor_laporan)}</div>
</div>

<!-- Kata Pembuka -->
<div class="paragraf">
${data.kata_pembuka
  .split("\n")
  .map((line) => (line.trim() ? `<p>${esc(line)}</p>` : "<p>&nbsp;</p>"))
  .join("")}
</div>

<!-- Ringkasan KPI -->
<div class="section-title">Ringkasan Kinerja</div>
<table class="ringkasan">
  <thead>
    <tr>
      <th class="no">No.</th>
      <th>Uraian</th>
      <th class="nilai">Nilai</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td class="no">1</td>
      <td>Omzet Penjualan</td>
      <td class="nilai">${rp(kpi.omzet)} <span style="font-weight:normal;font-size:8pt;color:#555">(${kpi.jumlah_faktur_penjualan} faktur)</span></td>
    </tr>
    <tr>
      <td class="no">2</td>
      <td>Harga Pokok Penjualan (HPP)</td>
      <td class="nilai">${rp(kpi.hpp)}</td>
    </tr>
    <tr>
      <td class="no">3</td>
      <td>Laba Kotor</td>
      <td class="nilai">${rp(kpi.laba_kotor)} <span style="font-weight:normal;font-size:8pt;color:#555">(${pct(kpi.margin_kotor_persen)})</span></td>
    </tr>
    <tr>
      <td class="no">4</td>
      <td>Biaya Operasional</td>
      <td class="nilai">${rp(kpi.biaya_operasional)}</td>
    </tr>
    <tr>
      <td class="no">5</td>
      <td>Total Gaji Dibayar</td>
      <td class="nilai">${rp(kpi.total_gaji)}</td>
    </tr>
    <tr class="row-laba">
      <td class="no">6</td>
      <td>Laba Bersih</td>
      <td class="nilai">${rp(kpi.laba_bersih)} <span style="font-weight:normal;font-size:8pt">(${pct(kpi.margin_bersih_persen)})</span></td>
    </tr>
    <tr>
      <td class="no">7</td>
      <td>Total Pembelian</td>
      <td class="nilai">${rp(kpi.total_pembelian)} <span style="font-weight:normal;font-size:8pt;color:#555">(${kpi.jumlah_po} PO)</span></td>
    </tr>
    <tr>
      <td class="no">8</td>
      <td>Nilai Inventori Akhir Periode</td>
      <td class="nilai">${rp(kpi.nilai_inventori)}</td>
    </tr>
  </tbody>
</table>

<!-- Hutang & Piutang -->
<div class="section-title">Posisi Hutang &amp; Piutang</div>
<table class="hutang-piutang">
  <thead>
    <tr>
      <th>Uraian</th>
      <th class="num">Jumlah Dokumen</th>
      <th class="num">Total Outstanding</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Piutang Pelanggan (belum lunas)</td>
      <td class="num">${hutang_piutang.jumlah_piutang} faktur</td>
      <td class="num">${rp(hutang_piutang.total_piutang)}</td>
    </tr>
    <tr>
      <td>Hutang Vendor (belum lunas)</td>
      <td class="num">${hutang_piutang.jumlah_hutang} tagihan</td>
      <td class="num">${rp(hutang_piutang.total_hutang)}</td>
    </tr>
  </tbody>
</table>

<!-- Kata Penutup -->
<div class="paragraf" style="margin-top:10px">
${data.kata_penutup
  .split("\n")
  .map((line) => (line.trim() ? `<p>${esc(line)}</p>` : "<p>&nbsp;</p>"))
  .join("")}
</div>

<!-- TTD -->
<div class="ttd-block">
  <div class="ttd-col">
    <div class="ttd-kota">${esc(kotaTanggal)}</div>
    <div class="ttd-jabatan">Direktur,</div>
    <div class="ttd-garis">${namaDirektur || "________________________"}</div>
  </div>
  <div class="ttd-col" style="text-align:right">
    <div class="ttd-kota">&nbsp;</div>
    <div class="ttd-jabatan">Manajer,</div>
    <div class="ttd-garis">${namaManajer || "________________________"}</div>
  </div>
</div>

<!-- ══════════════ HALAMAN 2+: RIWAYAT BUKU KAS ══════════════ -->
<div class="page-break">
  <div class="kas-header">
    <div class="kas-toko">${tokoNama} — Riwayat Buku Kas</div>
    <div class="kas-meta">
      Periode: ${esc(data.periode_label)}<br>
      No. Laporan: ${esc(data.nomor_laporan)}
    </div>
  </div>
  <table class="kas">
    <thead>
      <tr>
        <th>Tanggal</th>
        <th>Kategori</th>
        <th>Keterangan</th>
        <th class="num">Debit</th>
        <th class="num">Kredit</th>
        <th class="num">Saldo</th>
      </tr>
    </thead>
    <tbody>
      ${kasRows || '<tr><td colspan="6" style="text-align:center;color:#888;padding:12px">Tidak ada transaksi dalam periode ini.</td></tr>'}
      <tr class="row-saldo-akhir">
        <td colspan="5">SALDO AKHIR PERIODE</td>
        <td class="num">${rp(saldo_akhir)}</td>
      </tr>
    </tbody>
  </table>
</div>

</body>
</html>`;
}

/**
 * Buka popup window dan trigger print dialog.
 * Mengikuti pola yang sama dengan printFaktur di faktur-print.ts.
 */
export function printLaporanBulanan(html: string): boolean {
  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.addEventListener("load", () => {
      printWindow.print();
    });
    return true;
  }

  // Fallback: iframe tersembunyi
  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "Cetak laporan bulanan");
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none";
  document.body.appendChild(iframe);

  const frameWindow = iframe.contentWindow;
  if (!frameWindow) {
    document.body.removeChild(iframe);
    return false;
  }

  frameWindow.document.write(html);
  frameWindow.document.close();
  frameWindow.addEventListener("load", () => {
    frameWindow.print();
  });

  setTimeout(() => {
    if (iframe.parentNode) document.body.removeChild(iframe);
  }, 120_000);

  return true;
}
```

- [ ] **Step 3.2: Type-check**

```bash
npm run type-check
```

Expected: 0 errors.

- [ ] **Step 3.3: Commit**

```bash
git add src/lib/laporan-bulanan-print.ts
git commit -m "feat: tambah generator HTML laporan manajemen bulanan A4 portrait"
```

---

## Task 4: Server Actions

**Files:**
- Modify: `src/app/laporan/actions.ts`

- [ ] **Step 4.1: Tambah tiga server actions ke actions.ts**

Buka `src/app/laporan/actions.ts`. Saat ini file berisi satu action `getFormalAccountingReportAction`. Ganti seluruh isi file dengan:

```typescript
"use server";

/**
 * Server Actions untuk halaman Laporan.
 */

import { getFormalAccountingReport } from "@/lib/services/reports-service";
import {
  getLaporanBulananData,
  generateNomorLaporan,
  simpanLaporanBulanan,
  type LaporanBulananData,
} from "@/lib/services/laporan-bulanan-service";
import { generateLaporanBulananHTML } from "@/lib/laporan-bulanan-print";
import { requireAdminOrManager } from "@/lib/auth-guard-server";
import { AuthGuardError } from "@/lib/auth-guard-error";
import { db } from "@/lib/db-unified";
import { randomUUID } from "crypto";

// ── Action yang sudah ada ────────────────────────────────────────────────────

export async function getFormalAccountingReportAction(data: {
  startDate: string;
  endDate: string;
}) {
  try {
    return await getFormalAccountingReport(data);
  } catch (error) {
    console.error("Error in getFormalAccountingReportAction:", error);
    throw error;
  }
}

// ── Actions baru: Laporan Bulanan ────────────────────────────────────────────

/**
 * Ambil daftar accounting_periods yang sudah CLOSED, diurutkan terbaru dulu.
 * Digunakan untuk mengisi dropdown pilih periode di modal.
 */
export async function getClosedAccountingPeriodsAction(): Promise<
  Array<{ id: string; period_key: string; start_date: string; end_date: string }>
> {
  try {
    await requireAdminOrManager();
    // db.queryRaw mengembalikan T[] langsung (bukan { data, error })
    return await db.queryRaw<{
      id: string;
      period_key: string;
      start_date: string;
      end_date: string;
    }>(
      `SELECT id, period_key, start_date, end_date
       FROM accounting_periods
       WHERE status = 'CLOSED'
       ORDER BY start_date DESC`,
      []
    );
  } catch (err) {
    if (err instanceof AuthGuardError) throw err;
    console.error("getClosedAccountingPeriodsAction error:", err);
    throw err;
  }
}

/**
 * Generate HTML laporan bulanan dan simpan record ke DB.
 * Mengembalikan HTML string siap cetak.
 */
export async function generateLaporanBulananAction(params: {
  accounting_period_id: string;
  kata_pembuka: string;
  kata_penutup: string;
}): Promise<string> {
  try {
    const session = await requireAdminOrManager();

    // Ambil info periode untuk period_key
    const periodRes = await db.queryOne<{ period_key: string; status: string }>(
      "accounting_periods",
      { where: { id: params.accounting_period_id } }
    );
    if (periodRes.error) throw periodRes.error;
    if (!periodRes.data) throw new Error("Periode tidak ditemukan.");
    if (periodRes.data.status !== "CLOSED") {
      throw new Error("Hanya periode yang sudah ditutup yang bisa dicetak.");
    }

    const nomorLaporan = await generateNomorLaporan(periodRes.data.period_key);

    const laporanData: LaporanBulananData = await getLaporanBulananData({
      accounting_period_id: params.accounting_period_id,
      nomor_laporan: nomorLaporan,
      kata_pembuka: params.kata_pembuka,
      kata_penutup: params.kata_penutup,
    });

    // Simpan riwayat laporan ke DB
    await simpanLaporanBulanan({
      id: randomUUID(),
      nomor_laporan: nomorLaporan,
      accounting_period_id: params.accounting_period_id,
      dibuat_oleh: session.uid,
      kata_pembuka: params.kata_pembuka,
      kata_penutup: params.kata_penutup,
    });

    return generateLaporanBulananHTML(laporanData);
  } catch (err) {
    if (err instanceof AuthGuardError) throw err;
    console.error("generateLaporanBulananAction error:", err);
    throw err;
  }
}
```

- [ ] **Step 4.2: Type-check**

```bash
npm run type-check
```

Expected: 0 errors. Kalau ada error terkait `session.uid`, cek nilai field yang tersedia dari `requireAdminOrManager()` — mungkin `session.id` atau `session.userId`. Sesuaikan.

- [ ] **Step 4.3: Commit**

```bash
git add src/app/laporan/actions.ts
git commit -m "feat: tambah server actions untuk laporan bulanan"
```

---

## Task 5: Modal UI

**Files:**
- Create: `src/app/laporan/ModalLaporanBulanan.tsx`

- [ ] **Step 5.1: Buat teks standar helper**

Di bagian atas `ModalLaporanBulanan.tsx`, definisikan fungsi pembuat teks standar:

```typescript
function kataPembukaDefault(namaToko: string, periodeLabel: string): string {
  return `Dengan hormat,

Bersama laporan ini kami sampaikan ringkasan kinerja keuangan dan operasional ${namaToko} untuk periode ${periodeLabel}. Laporan ini disusun berdasarkan data transaksi yang telah diverifikasi oleh manajemen.`;
}

function kataPenutupDefault(): string {
  return `Demikian laporan ini kami sampaikan. Atas perhatian dan kepercayaan Anda, kami ucapkan terima kasih.`;
}
```

- [ ] **Step 5.2: Buat file ModalLaporanBulanan.tsx**

Buat `src/app/laporan/ModalLaporanBulanan.tsx`:

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import ModalFormShell from "@/components/ModalFormShell";
import PratinjauFakturMengambang from "@/components/PratinjauFakturMengambang";
import {
  getClosedAccountingPeriodsAction,
  generateLaporanBulananAction,
} from "./actions";
import { printLaporanBulanan } from "@/lib/laporan-bulanan-print";
import { formatPeriodKeyLabel } from "@/lib/services/laporan-bulanan-service";
import { PrinterIcon } from "@/components/icons/ContentIcons";

interface ClosedPeriod {
  id: string;
  period_key: string;
  start_date: string;
  end_date: string;
}

interface Props {
  onClose: () => void;
  showNotification: (type: "success" | "error", message: string) => void;
}

function kataPembukaDefault(periodeLabel: string): string {
  return `Dengan hormat,\n\nBersama laporan ini kami sampaikan ringkasan kinerja keuangan dan operasional untuk periode ${periodeLabel}. Laporan ini disusun berdasarkan data transaksi yang telah diverifikasi oleh manajemen.`;
}

function kataPenutupDefault(): string {
  return `Demikian laporan ini kami sampaikan. Atas perhatian dan kepercayaan Anda, kami ucapkan terima kasih.`;
}

export default function ModalLaporanBulanan({ onClose, showNotification }: Props) {
  const [periods, setPeriods] = useState<ClosedPeriod[]>([]);
  const [loadingPeriods, setLoadingPeriods] = useState(true);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("");
  const [kataPembuka, setKataPembuka] = useState("");
  const [kataPenutup, setKataPenutup] = useState(kataPenutupDefault());
  const [generating, setGenerating] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Muat daftar periode yang sudah ditutup
  useEffect(() => {
    setLoadingPeriods(true);
    getClosedAccountingPeriodsAction()
      .then((data) => {
        setPeriods(data);
        if (data.length > 0) {
          setSelectedPeriodId(data[0].id);
        }
      })
      .catch(() => showNotification("error", "Gagal memuat daftar periode."))
      .finally(() => setLoadingPeriods(false));
  }, [showNotification]);

  // Update kata pembuka saat periode berubah
  useEffect(() => {
    if (!selectedPeriodId) return;
    const period = periods.find((p) => p.id === selectedPeriodId);
    if (!period) return;
    const label = formatPeriodKeyLabel(period.period_key);
    setKataPembuka(kataPembukaDefault(label));
  }, [selectedPeriodId, periods]);

  const handleGenerate = useCallback(
    async (mode: "preview" | "print") => {
      if (!selectedPeriodId) {
        showNotification("error", "Pilih periode terlebih dahulu.");
        return;
      }
      setGenerating(true);
      try {
        const html = await generateLaporanBulananAction({
          accounting_period_id: selectedPeriodId,
          kata_pembuka: kataPembuka,
          kata_penutup: kataPenutup,
        });

        if (mode === "preview") {
          setPreviewHtml(html);
          setShowPreview(true);
        } else {
          const ok = printLaporanBulanan(html);
          if (!ok) {
            showNotification(
              "error",
              "Popup diblokir browser. Izinkan popup untuk situs ini lalu coba lagi."
            );
          }
        }
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Gagal membuat laporan.";
        showNotification("error", msg);
      } finally {
        setGenerating(false);
      }
    },
    [selectedPeriodId, kataPembuka, kataPenutup, showNotification]
  );

  const selectedPeriod = periods.find((p) => p.id === selectedPeriodId);
  const periodeLabel = selectedPeriod
    ? formatPeriodKeyLabel(selectedPeriod.period_key)
    : "";

  return (
    <>
      <ModalFormShell
        title="Laporan Manajemen Bulanan"
        onClose={onClose}
        allowDismiss={!generating}
        footer={
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={generating}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
            >
              Tutup
            </button>
            <button
              type="button"
              onClick={() => handleGenerate("preview")}
              disabled={generating || !selectedPeriodId}
              className="px-4 py-2 rounded-lg border border-indigo-400 text-indigo-700 dark:text-indigo-300 text-sm font-semibold hover:bg-indigo-50 dark:hover:bg-slate-700 disabled:opacity-50"
            >
              {generating ? "Memuat..." : "Pratinjau"}
            </button>
            <button
              type="button"
              onClick={() => handleGenerate("print")}
              disabled={generating || !selectedPeriodId}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
            >
              <PrinterIcon size={16} />
              {generating ? "Memuat..." : "Cetak / PDF"}
            </button>
          </div>
        }
      >
        <div className="space-y-5 p-1">
          {/* Pilih Periode */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
              Periode Akuntansi
            </label>
            {loadingPeriods ? (
              <div className="text-sm text-slate-500 dark:text-slate-400">
                Memuat daftar periode...
              </div>
            ) : periods.length === 0 ? (
              <div className="text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 border border-amber-200 dark:border-amber-700">
                Belum ada periode yang ditutup. Tutup periode terlebih dahulu di
                halaman Pengaturan → Tutup Periode.
              </div>
            ) : (
              <select
                value={selectedPeriodId}
                onChange={(e) => setSelectedPeriodId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {formatPeriodKeyLabel(p.period_key)}
                  </option>
                ))}
              </select>
            )}
          </div>

          {selectedPeriodId && (
            <>
              {/* Kata Pembuka */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  Kata Pembuka
                </label>
                <textarea
                  value={kataPembuka}
                  onChange={(e) => setKataPembuka(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
                />
              </div>

              {/* Kata Penutup */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  Kata Penutup
                </label>
                <textarea
                  value={kataPenutup}
                  onChange={(e) => setKataPenutup(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
                />
              </div>

              {/* Info periode yang dipilih */}
              <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-lg px-4 py-3 text-sm text-indigo-800 dark:text-indigo-200">
                Laporan untuk: <strong>{periodeLabel}</strong>. Dokumen akan
                memuat ringkasan KPI, posisi hutang/piutang, dan riwayat buku
                kas selengkapnya.
              </div>
            </>
          )}
        </div>
      </ModalFormShell>

      {/* Floating Preview */}
      {previewHtml && (
        <PratinjauFakturMengambang
          open={showPreview}
          html={previewHtml}
          title={`Laporan Bulanan — ${periodeLabel}`}
          orientation="portrait"
          onClose={() => setShowPreview(false)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 5.3: Verifikasi `PrinterIcon` ada di ContentIcons**

```bash
grep -n "PrinterIcon\|Printer" src/components/icons/ContentIcons.tsx | head -5
```

Jika `PrinterIcon` tidak ada, cek ikon apa yang tersedia di `ContentIcons.tsx` dan gunakan yang paling sesuai (misalnya `DocumentIcon` atau `ClipboardIcon`). Sesuaikan import di Step 5.2.

- [ ] **Step 5.4: Type-check**

```bash
npm run type-check
```

Expected: 0 errors.

- [ ] **Step 5.5: Commit**

```bash
git add src/app/laporan/ModalLaporanBulanan.tsx
git commit -m "feat: tambah modal UI laporan manajemen bulanan"
```

---

## Task 6: Integrasi ke Halaman Laporan

**Files:**
- Modify: `src/app/laporan/page.tsx`

- [ ] **Step 6.1: Tambah state + import di page.tsx**

Buka `src/app/laporan/page.tsx`. Temukan baris `import` di bagian atas dan tambahkan:

```typescript
import ModalLaporanBulanan from "./ModalLaporanBulanan";
import { DocumentIcon } from "@/components/icons/ContentIcons";
```

(Jika `DocumentIcon` tidak ada, cek apa yang tersedia di `ContentIcons.tsx` dan pilih yang sesuai untuk "laporan/dokumen".)

- [ ] **Step 6.2: Tambah state untuk modal**

Di dalam `ReportsPage` function, setelah baris state yang sudah ada (setelah `const [loadingFormalReport, setLoadingFormalReport] = useState(false);`), tambahkan:

```typescript
const [showModalLaporan, setShowModalLaporan] = useState(false);
```

- [ ] **Step 6.3: Tambah card "Laporan Bulanan" ke array reportTypes**

Ubah `reportTypes` array di `page.tsx`. Sekarang berisi 5 item. Tambahkan satu card baru di atas array sebagai item pertama (laporan bulanan adalah fitur utama):

```typescript
// Sisipkan SEBELUM reportTypes.map()
const handleBukaModalLaporan = () => setShowModalLaporan(true);
```

Dan tambahkan section baru di dalam JSX, **sebelum** blok `{/* Report Type Selection */}`:

```tsx
{/* Laporan Manajemen Bulanan */}
<div className="mb-6">
  <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg p-6 border-2 border-indigo-100 dark:border-indigo-900/40">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="flex items-start gap-4">
        <div className="bg-indigo-100 dark:bg-indigo-900/40 rounded-xl p-3 flex-shrink-0">
          <DocumentIcon size={28} className="text-indigo-600 dark:text-indigo-300" />
        </div>
        <div>
          <h3 className="font-bold text-slate-800 dark:text-slate-100 text-lg">
            Laporan Manajemen Bulanan
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
            Dokumen resmi A4 siap cetak: ringkasan KPI, hutang/piutang, riwayat
            buku kas, dan kolom tanda tangan.
          </p>
          <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1 font-medium">
            Hanya untuk periode yang sudah ditutup
          </p>
        </div>
      </div>
      <button
        onClick={handleBukaModalLaporan}
        className="flex-shrink-0 flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors shadow"
      >
        <DocumentIcon size={16} className="text-white" />
        Buat Laporan
      </button>
    </div>
  </div>
</div>
```

- [ ] **Step 6.4: Tambah modal dan notifikasi di JSX**

Di bagian bawah return statement, sebelum `{notice && <ToastNotifikasi ...>}`, tambahkan:

```tsx
{showModalLaporan && (
  <ModalLaporanBulanan
    onClose={() => setShowModalLaporan(false)}
    showNotification={showMsg}
  />
)}
```

- [ ] **Step 6.5: Type-check**

```bash
npm run type-check
```

Expected: 0 errors.

- [ ] **Step 6.6: Build**

```bash
npm run build
```

Expected: Berhasil tanpa error. Kalau ada warning lint baru yang kamu perkenalkan, perbaiki.

- [ ] **Step 6.7: Commit**

```bash
git add src/app/laporan/page.tsx
git commit -m "feat: integrasi laporan manajemen bulanan ke halaman laporan"
```

---

## Task 7: Verifikasi Manual

- [ ] **Step 7.1: Jalankan dev server**

```bash
npm run dev
```

- [ ] **Step 7.2: Buka halaman Laporan**

Buka `http://localhost:3000/laporan`. Verifikasi:
- [ ] Card "Laporan Manajemen Bulanan" muncul di bagian atas halaman
- [ ] Tombol "Buat Laporan" dapat diklik

- [ ] **Step 7.3: Buka modal**

Klik "Buat Laporan":
- [ ] Modal muncul dengan judul "Laporan Manajemen Bulanan"
- [ ] Dropdown periode terisi (jika ada periode yang sudah ditutup) atau tampil pesan instruksi
- [ ] Textarea kata pembuka terisi otomatis saat periode dipilih
- [ ] Textarea kata penutup terisi

- [ ] **Step 7.4: Test Pratinjau**

Pilih periode yang sudah CLOSED, klik "Pratinjau":
- [ ] Floating preview muncul dalam orientasi portrait
- [ ] Kop surat tampil: logo gemiprint, wordmark Bauhaus 93, alamat
- [ ] Tabel KPI terisi dengan angka
- [ ] Kolom TTD menampilkan nama direktur dan manajer
- [ ] Halaman 2+ berisi tabel buku kas

- [ ] **Step 7.5: Test Cetak / PDF**

Klik "Cetak / PDF":
- [ ] Popup browser terbuka (atau print dialog langsung)
- [ ] Dialog print OS muncul
- [ ] "Save as PDF" menghasilkan file PDF yang tampil benar

- [ ] **Step 7.6: Verifikasi nomor laporan sequential**

Generate laporan untuk periode yang sama dua kali:
- [ ] Laporan pertama: `LPR/YYYY/MM/001`
- [ ] Laporan kedua: `LPR/YYYY/MM/002`

- [ ] **Step 7.7: Final commit**

```bash
git add -A
git commit -m "chore: verifikasi fitur laporan manajemen bulanan selesai"
```

---

## Self-Review Checklist

### Spec Coverage

| Requirement | Task |
|---|---|
| Dipicu dari `/laporan` | Task 6 |
| Terikat periode akuntansi CLOSED | Task 4 (action), Task 5 (modal) |
| A4 portrait, desain konsisten faktur | Task 3 |
| Bauhaus 93 + TW Cen MT | Task 3 |
| Logo SVG gemiprint | Task 3 |
| Nomor laporan LPR/YYYY/MM/XXX | Task 2 + Task 1 (tabel) |
| Kata pembuka/penutup editable | Task 5 |
| Tabel KPI 8 baris | Task 3 |
| Total gaji (kategori GAJI) | Task 2 |
| Hutang & piutang outstanding | Task 2 + Task 3 |
| Nilai inventori | Task 2 |
| TTD direktur + manajer dari pegawai | Task 2 + Task 3 |
| Halaman 2+ buku kas | Task 2 + Task 3 |
| Saldo akhir di buku kas | Task 2 + Task 3 |
| Cetak via window.print() | Task 3 (printLaporanBulanan) |
| Floating preview portrait | Task 5 |
| Auth guard admin/manager | Task 4 |
| Periode harus CLOSED (validasi server) | Task 2 + Task 4 |
| Tabel laporan_bulanan (migration) | Task 1 |
| Sync config terdaftar | Task 1 |

### Type Consistency

- `LaporanBulananData` didefinisikan di `laporan-bulanan-service.ts` (Task 2) dan digunakan di `laporan-bulanan-print.ts` (Task 3) dan `actions.ts` (Task 4) ✓
- `generateLaporanBulananHTML(data: LaporanBulananData)` → dipanggil dari `actions.ts` ✓
- `printLaporanBulanan(html: string)` → dipanggil dari `ModalLaporanBulanan.tsx` ✓
- `getClosedAccountingPeriodsAction()`, `generateLaporanBulananAction()` → dipakai di modal ✓
- `formatPeriodKeyLabel(periodKey: string)` → dipakai di modal ✓

### Potensi Masalah

1. **`db.queryRaw` return type**: Mengembalikan `T[]` langsung. Semua kode dalam plan sudah menggunakan pola yang benar. ✓
2. **`PrinterIcon` dan `DocumentIcon`**: Ditambahkan di Task 1 Step 1.5 sebelum digunakan di Task 5/6. ✓
3. **`session.uid`**: Sudah dikonfirmasi benar dari `requireAdminOrManager()`. ✓
4. **`is_deleted` di `piutang_penjualan`**: Query piutang di plan sudah tidak menggunakan `is_deleted`. ✓
5. **Supabase `queryRaw`**: `db.queryRaw` di lingkungan web (Supabase) mungkin menggunakan path yang berbeda. Kalau data kosong di web production, cek implementasi `queryRaw` untuk Supabase path dan tambahkan fallback query via `db.query`.
