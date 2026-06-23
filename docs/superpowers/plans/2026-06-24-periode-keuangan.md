# Periode Keuangan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tag setiap baris `keuangan` ke satu `accounting_periods` (FK `periode_id`) sehingga cashbook list, kartu Omzet/Biaya, dan Bagi Hasil di halaman Keuangan menampilkan data periode aktif — bukan akumulasi sepanjang masa.

**Architecture:** Tambah kolom nullable `periode_id TEXT REFERENCES accounting_periods(id)` ke `keuangan`; backfill 48 baris Mei 2026 ke periode baru; `createCashBookEntry` auto-tag ke periode OPEN saat ini; kartu Omzet/Biaya dihitung langsung via SQL SUM (bukan running total `transaksi_terhitung`); Saldo tetap kumulatif global. Spec: `docs/superpowers/specs/2026-06-24-periode-keuangan-design.md`.

**Tech Stack:** Next.js 15, TypeScript, Supabase Postgres, better-sqlite3, Flutter/Dart, Jest (node project), Tailwind CSS

---

## File Map

| File | Action | Tanggung Jawab |
|------|--------|----------------|
| `supabase/migrations/20260624000000_keuangan_periode_id.sql` | CREATE | Tambah kolom + backfill Mei 2026 |
| `database/sqlite-schema.sql` | MODIFY | Tambah `periode_id` ke definisi tabel keuangan |
| `src/lib/db-sqlite-migrations.ts` | MODIFY | Runtime ALTER TABLE untuk instalasi SQLite yang sudah ada |
| `src/lib/services/accounting-periods-service.ts` | MODIFY | Tambah `getOrCreateOpenPeriod()` + `formatPeriodLabel()` |
| `src/lib/services/periode-metrics-service.ts` | CREATE | `computePeriodMetrics(periodeId)` — agregasi Omzet/Biaya/Laba |
| `src/lib/__tests__/periode-metrics-service.test.ts` | CREATE | Test agregasi periode |
| `src/lib/__tests__/accounting-periods-service.test.ts` | CREATE | Test `getOrCreateOpenPeriod` |
| `src/lib/services/finance-service.ts` | MODIFY | Auto-tag `periode_id` di `createCashBookEntry` |
| `src/lib/server-data-supabase.ts` | MODIFY | Tambah `fetchKeuanganCashBookByPeriod(periodeId)` |
| `src/app/api/keuangan/cash-book/route.ts` | MODIFY | Gunakan filter `periode_id`; ganti systemMetrics Omzet/Biaya ke period-scoped; tambah `periodeLabel` |
| `src/app/api/keuangan/summary-v2/route.ts` | MODIFY | Inject period-scoped values ke formula evaluator Bagi Hasil |
| `src/app/keuangan/page.tsx` | MODIFY | Tampilkan label periode di header |
| `flutter/lib/features/finance/finance_page.dart` | MODIFY | Tampilkan label periode di atas kartu summary |

---

## Task 1: Migrasi Skema DB

**Files:**
- Create: `supabase/migrations/20260624000000_keuangan_periode_id.sql`
- Modify: `database/sqlite-schema.sql` (baris 708–734)
- Modify: `src/lib/db-sqlite-migrations.ts` (sekitar baris 975–992)

- [ ] **Step 1: Buat file migrasi Supabase**

```sql
-- supabase/migrations/20260624000000_keuangan_periode_id.sql
-- Tambah kolom periode_id ke keuangan + backfill data Mei 2026.
-- Migrasi bersifat idempotent (IF NOT EXISTS + ON CONFLICT DO NOTHING).

ALTER TABLE keuangan
  ADD COLUMN IF NOT EXISTS periode_id TEXT REFERENCES accounting_periods(id);

-- Buat periode Mei 2026 untuk backfill (accounting_periods masih kosong saat ini).
-- ON CONFLICT DO NOTHING supaya migrasi aman bila dijalankan ulang.
INSERT INTO accounting_periods (
  id, period_key, start_date, end_date, status,
  dibuat_pada, diperbarui_pada
)
VALUES (
  gen_random_uuid()::text,
  '2026-05',
  '2026-05-01',
  '2026-05-31',
  'OPEN',
  now(),
  now()
)
ON CONFLICT (period_key) DO NOTHING;

-- Backfill: tag semua transaksi Mei 2026 ke periode yang baru dibuat.
UPDATE keuangan
SET periode_id = (
  SELECT id FROM accounting_periods WHERE period_key = '2026-05'
)
WHERE tanggal BETWEEN '2026-05-01' AND '2026-05-31'
  AND periode_id IS NULL;

-- Index untuk performa query filter per periode.
CREATE INDEX IF NOT EXISTS idx_keuangan_periode_id ON keuangan(periode_id);
```

- [ ] **Step 2: Update `database/sqlite-schema.sql` — tambah kolom ke tabel keuangan**

Temukan baris yang mengakhiri tabel keuangan (baris 734):
```sql
    status_transaksi TEXT NOT NULL DEFAULT 'POSTED' CHECK(...), voided_at TEXT, voided_by TEXT, void_reason TEXT, sync_status TEXT DEFAULT 'pending' CHECK(...), last_synced_at TEXT, sync_version INTEGER DEFAULT 1);
```

Ganti dengan (tambah `periode_id` sebelum penutup `)`):
```sql
    status_transaksi TEXT NOT NULL DEFAULT 'POSTED' CHECK(status_transaksi IN ('POSTED','VOIDED')), voided_at TEXT, voided_by TEXT, void_reason TEXT, sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')), last_synced_at TEXT, sync_version INTEGER DEFAULT 1,
    periode_id TEXT REFERENCES accounting_periods(id));
```

Tambahkan index setelah blok index keuangan yang sudah ada (baris 736–738):
```sql
CREATE INDEX idx_keuangan_periode_id ON keuangan(periode_id);
```

- [ ] **Step 3: Tambah runtime ALTER TABLE di `src/lib/db-sqlite-migrations.ts`**

Di dalam array `hardeningCols` (sekitar baris 975), tambahkan entri baru:

```typescript
{ table: "keuangan", column: "periode_id", ddl: "ALTER TABLE keuangan ADD COLUMN periode_id TEXT REFERENCES accounting_periods(id)" },
```

Sehingga blok menjadi:
```typescript
const hardeningCols: Array<{ table: string; column: string; ddl: string }> = [
  { table: "inventory_movements", column: "location_id", ddl: "ALTER TABLE inventory_movements ADD COLUMN location_id TEXT DEFAULT 'main'" },
  { table: "barang", column: "default_location_id", ddl: "ALTER TABLE barang ADD COLUMN default_location_id TEXT DEFAULT 'main'" },
  { table: "keuangan", column: "reference_type", ddl: "ALTER TABLE keuangan ADD COLUMN reference_type TEXT" },
  { table: "keuangan", column: "reference_id", ddl: "ALTER TABLE keuangan ADD COLUMN reference_id TEXT" },
  { table: "keuangan", column: "periode_id", ddl: "ALTER TABLE keuangan ADD COLUMN periode_id TEXT REFERENCES accounting_periods(id)" },
];
```

- [ ] **Step 4: Verifikasi type-check**

```bash
cd /home/gemi/Projects/gemiprintaio && npm run type-check
```

Expected: 0 errors.

- [ ] **Step 5: Jalankan migrasi ke Supabase cloud**

```bash
cd /home/gemi/Projects/gemiprintaio && npm run supabase:db:push
```

Expected: migration `20260624000000_keuangan_periode_id` applied successfully.

- [ ] **Step 6: Verifikasi data di cloud**

```bash
node -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function main() {
  const { count } = await sb.from('keuangan').select('*', { count: 'exact', head: true }).not('periode_id', 'is', null);
  console.log('Rows dengan periode_id:', count);
  const { data: periods } = await sb.from('accounting_periods').select('id, period_key, status');
  console.log('accounting_periods:', JSON.stringify(periods));
}
main().catch(console.error);
" 
```

Expected output:
```
Rows dengan periode_id: 48
accounting_periods: [{"id":"...","period_key":"2026-05","status":"OPEN"}]
```

- [ ] **Step 7: Commit**

```bash
cd /home/gemi/Projects/gemiprintaio && git add supabase/migrations/20260624000000_keuangan_periode_id.sql database/sqlite-schema.sql src/lib/db-sqlite-migrations.ts
git commit -m "feat: tambah kolom periode_id ke keuangan + backfill Mei 2026"
```

---

## Task 2: Service `getOrCreateOpenPeriod` + `formatPeriodLabel`

**Files:**
- Modify: `src/lib/services/accounting-periods-service.ts`
- Create: `src/lib/__tests__/accounting-periods-service.test.ts`

- [ ] **Step 1: Tulis test yang gagal**

Buat file `src/lib/__tests__/accounting-periods-service.test.ts`:

```typescript
/**
 * Test getOrCreateOpenPeriod dan formatPeriodLabel.
 */

import { resetMockDb, mockTable } from "./helpers/mock-db";

jest.mock("@/lib/db-unified", () => {
  const real = jest.requireActual(
    "./helpers/mock-db"
  ) as typeof import("./helpers/mock-db");
  return {
    db: real.__mock.db,
    generateId: real.__mock.generateId,
    getCurrentTimestamp: real.__mock.getCurrentTimestamp,
    getServerSupabaseClient: () => null,
  };
});

import {
  getOrCreateOpenPeriod,
  formatPeriodLabel,
} from "../services/accounting-periods-service";

beforeEach(() => {
  resetMockDb();
});

describe("formatPeriodLabel", () => {
  it("mengkonversi '2026-05' menjadi 'Mei 2026'", () => {
    expect(formatPeriodLabel("2026-05")).toBe("Mei 2026");
  });
  it("mengkonversi '2026-01' menjadi 'Januari 2026'", () => {
    expect(formatPeriodLabel("2026-01")).toBe("Januari 2026");
  });
  it("mengkonversi '2026-12' menjadi 'Desember 2026'", () => {
    expect(formatPeriodLabel("2026-12")).toBe("Desember 2026");
  });
});

describe("getOrCreateOpenPeriod", () => {
  it("mengembalikan periode OPEN yang sudah ada", async () => {
    mockTable("accounting_periods").set("p-mei", {
      id: "p-mei",
      period_key: "2026-05",
      start_date: "2026-05-01",
      end_date: "2026-05-31",
      status: "OPEN",
    });

    const result = await getOrCreateOpenPeriod();
    expect(result.id).toBe("p-mei");
    expect(result.status).toBe("OPEN");
  });

  it("tidak mengembalikan periode CLOSED", async () => {
    mockTable("accounting_periods").set("p-mei", {
      id: "p-mei",
      period_key: "2026-05",
      start_date: "2026-05-01",
      end_date: "2026-05-31",
      status: "CLOSED",
    });

    // Tidak ada periode OPEN — harus buat yang baru untuk bulan berjalan
    const result = await getOrCreateOpenPeriod();
    expect(result.status).toBe("OPEN");
    expect(result.id).not.toBe("p-mei");
  });

  it("membuat periode baru bila tidak ada yang OPEN", async () => {
    // DB kosong
    const result = await getOrCreateOpenPeriod();
    expect(result.status).toBe("OPEN");
    expect(result.period_key).toMatch(/^\d{4}-\d{2}$/);
  });

  it("mengembalikan periode OPEN terbaru bila ada lebih dari satu OPEN", async () => {
    mockTable("accounting_periods").set("p-apr", {
      id: "p-apr", period_key: "2026-04", start_date: "2026-04-01",
      end_date: "2026-04-30", status: "OPEN",
    });
    mockTable("accounting_periods").set("p-mei", {
      id: "p-mei", period_key: "2026-05", start_date: "2026-05-01",
      end_date: "2026-05-31", status: "OPEN",
    });

    const result = await getOrCreateOpenPeriod();
    expect(result.id).toBe("p-mei"); // terbaru dari period_key DESC
  });
});
```

- [ ] **Step 2: Jalankan test — harus FAIL**

```bash
cd /home/gemi/Projects/gemiprintaio && npx jest src/lib/__tests__/accounting-periods-service.test.ts --testProject node --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `getOrCreateOpenPeriod` and `formatPeriodLabel` not found.

- [ ] **Step 3: Implementasi di `accounting-periods-service.ts`**

Tambahkan kode berikut di akhir file `src/lib/services/accounting-periods-service.ts` (setelah fungsi `isDateInClosedPeriod`):

```typescript
/** Nama bulan dalam Bahasa Indonesia — index 1-based (indeks 0 = string kosong). */
const NAMA_BULAN = [
  "", "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/**
 * Format period_key (YYYY-MM) menjadi label ramah manusia.
 * Contoh: "2026-05" → "Mei 2026".
 */
export function formatPeriodLabel(periodKey: string): string {
  const [year, month] = periodKey.split("-").map(Number);
  return `${NAMA_BULAN[month] ?? String(month)} ${year}`;
}

/**
 * Cari periode yang saat ini berstatus OPEN.
 * Bila ada lebih dari satu OPEN (kondisi tak normal), kembalikan yang paling baru.
 * Bila tidak ada periode OPEN sama sekali, buat periode baru untuk bulan berjalan
 * menurut timezone Jakarta.
 */
export async function getOrCreateOpenPeriod(): Promise<AccountingPeriod> {
  const result = await db.query<AccountingPeriod>("accounting_periods", {
    where: { status: "OPEN" },
    orderBy: { column: "period_key", ascending: false },
    limit: 1,
  });
  if (result.error) throw result.error;
  if (result.data?.length) return result.data[0];

  // Tidak ada periode OPEN — buat untuk bulan berjalan (timezone Jakarta).
  const jakartaDate = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(new Date());
  const [year, month] = jakartaDate.split("-").map(Number);
  return getOrCreatePeriod(year, month);
}
```

- [ ] **Step 4: Jalankan test — harus PASS**

```bash
cd /home/gemi/Projects/gemiprintaio && npx jest src/lib/__tests__/accounting-periods-service.test.ts --testProject node --no-coverage 2>&1 | tail -20
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Type-check**

```bash
npm run type-check
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/accounting-periods-service.ts src/lib/__tests__/accounting-periods-service.test.ts
git commit -m "feat: tambah getOrCreateOpenPeriod dan formatPeriodLabel"
```

---

## Task 3: Service `computePeriodMetrics`

**Files:**
- Create: `src/lib/services/periode-metrics-service.ts`
- Create: `src/lib/__tests__/periode-metrics-service.test.ts`

- [ ] **Step 1: Tulis test yang gagal**

Buat `src/lib/__tests__/periode-metrics-service.test.ts`:

```typescript
/**
 * Test agregasi metrik periode langsung dari tabel keuangan.
 *
 * Logika berdasarkan formula AST di src/lib/ast/defaults.ts:
 *   Omzet        : debit  bila kategori OMZET / PIUTANG;
 *                  -kredit bila RETUR_PENJUALAN / RETUR_PENJUALAN_NONCASH.
 *   Biaya Ops    : kredit bila kategori BIAYA / TABUNGAN / GAJI.
 *   Biaya Bahan  : kredit bila HPP; -debit bila RETUR_HPP.
 *   Laba Bersih  : omzet − biaya_operasional − biaya_bahan.
 *   Baris VOIDED : tidak dihitung.
 */

import { resetMockDb, mockTable } from "./helpers/mock-db";

jest.mock("@/lib/db-unified", () => {
  const real = jest.requireActual(
    "./helpers/mock-db"
  ) as typeof import("./helpers/mock-db");
  return {
    db: real.__mock.db,
    generateId: real.__mock.generateId,
    getCurrentTimestamp: real.__mock.getCurrentTimestamp,
    getServerSupabaseClient: () => null,
  };
});

import { computePeriodMetrics } from "../services/periode-metrics-service";

const PERIODE_ID = "periode-mei-2026";

function seedRow(
  id: string,
  opts: {
    kategori: string;
    debit?: number;
    kredit?: number;
    voided?: boolean;
    periodeId?: string;
  }
) {
  mockTable("keuangan").set(id, {
    id,
    periode_id: opts.periodeId ?? PERIODE_ID,
    kategori_transaksi: opts.kategori,
    debit: opts.debit ?? 0,
    kredit: opts.kredit ?? 0,
    status_transaksi: opts.voided ? "VOIDED" : "POSTED",
    tanggal: "2026-05-01",
  });
}

beforeEach(() => {
  resetMockDb();
});

describe("computePeriodMetrics", () => {
  it("mengembalikan nol bila tidak ada transaksi", async () => {
    const m = await computePeriodMetrics(PERIODE_ID);
    expect(m).toEqual({ omzet: 0, biaya_operasional: 0, biaya_bahan: 0, laba_bersih: 0 });
  });

  it("menghitung omzet dari kategori OMZET", async () => {
    seedRow("k1", { kategori: "OMZET", debit: 5_000_000 });
    const m = await computePeriodMetrics(PERIODE_ID);
    expect(m.omzet).toBe(5_000_000);
    expect(m.laba_bersih).toBe(5_000_000);
  });

  it("menghitung omzet dari kategori PIUTANG", async () => {
    seedRow("k1", { kategori: "PIUTANG", debit: 3_000_000 });
    const m = await computePeriodMetrics(PERIODE_ID);
    expect(m.omzet).toBe(3_000_000);
  });

  it("mengurangi omzet untuk RETUR_PENJUALAN (kredit)", async () => {
    seedRow("k1", { kategori: "OMZET", debit: 5_000_000 });
    seedRow("k2", { kategori: "RETUR_PENJUALAN", kredit: 1_000_000 });
    const m = await computePeriodMetrics(PERIODE_ID);
    expect(m.omzet).toBe(4_000_000);
  });

  it("menghitung biaya_operasional dari BIAYA", async () => {
    seedRow("k1", { kategori: "BIAYA", kredit: 2_000_000 });
    const m = await computePeriodMetrics(PERIODE_ID);
    expect(m.biaya_operasional).toBe(2_000_000);
  });

  it("menghitung biaya_operasional dari TABUNGAN dan GAJI", async () => {
    seedRow("k1", { kategori: "TABUNGAN", kredit: 500_000 });
    seedRow("k2", { kategori: "GAJI", kredit: 3_000_000 });
    const m = await computePeriodMetrics(PERIODE_ID);
    expect(m.biaya_operasional).toBe(3_500_000);
  });

  it("menghitung biaya_bahan dari HPP", async () => {
    seedRow("k1", { kategori: "HPP", kredit: 1_500_000 });
    const m = await computePeriodMetrics(PERIODE_ID);
    expect(m.biaya_bahan).toBe(1_500_000);
  });

  it("mengurangi biaya_bahan untuk RETUR_HPP (debit)", async () => {
    seedRow("k1", { kategori: "HPP", kredit: 1_500_000 });
    seedRow("k2", { kategori: "RETUR_HPP", debit: 500_000 });
    const m = await computePeriodMetrics(PERIODE_ID);
    expect(m.biaya_bahan).toBe(1_000_000);
  });

  it("menghitung laba_bersih = omzet - biaya_ops - biaya_bahan", async () => {
    seedRow("k1", { kategori: "OMZET", debit: 10_000_000 });
    seedRow("k2", { kategori: "BIAYA", kredit: 2_000_000 });
    seedRow("k3", { kategori: "HPP", kredit: 3_000_000 });
    const m = await computePeriodMetrics(PERIODE_ID);
    expect(m.omzet).toBe(10_000_000);
    expect(m.biaya_operasional).toBe(2_000_000);
    expect(m.biaya_bahan).toBe(3_000_000);
    expect(m.laba_bersih).toBe(5_000_000);
  });

  it("mengabaikan transaksi VOIDED", async () => {
    seedRow("k1", { kategori: "OMZET", debit: 5_000_000 });
    seedRow("k2", { kategori: "OMZET", debit: 2_000_000, voided: true });
    const m = await computePeriodMetrics(PERIODE_ID);
    expect(m.omzet).toBe(5_000_000); // k2 tidak terhitung
  });

  it("mengabaikan transaksi dari periode lain", async () => {
    seedRow("k1", { kategori: "OMZET", debit: 5_000_000 });
    seedRow("k2", { kategori: "OMZET", debit: 2_000_000, periodeId: "periode-lain" });
    const m = await computePeriodMetrics(PERIODE_ID);
    expect(m.omzet).toBe(5_000_000); // k2 tidak masuk
  });

  it("tidak menghitung KAS, PINJAMAN_KARYAWAN, INVESTOR ke metrik", async () => {
    seedRow("k1", { kategori: "KAS", debit: 10_000_000 });
    seedRow("k2", { kategori: "PINJAMAN_KARYAWAN", kredit: 500_000 });
    seedRow("k3", { kategori: "INVESTOR", debit: 5_000_000 });
    const m = await computePeriodMetrics(PERIODE_ID);
    expect(m.omzet).toBe(0);
    expect(m.biaya_operasional).toBe(0);
    expect(m.biaya_bahan).toBe(0);
  });
});
```

- [ ] **Step 2: Jalankan test — harus FAIL**

```bash
cd /home/gemi/Projects/gemiprintaio && npx jest src/lib/__tests__/periode-metrics-service.test.ts --testProject node --no-coverage 2>&1 | tail -20
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implementasi `src/lib/services/periode-metrics-service.ts`**

```typescript
/**
 * Hitung metrik keuangan (Omzet, Biaya, Laba) langsung dari tabel keuangan
 * untuk satu periode tertentu.
 *
 * BERBEDA dari transaksi_terhitung (running total kumulatif): fungsi ini
 * mengembalikan total INKREMENTAL untuk periode yang dipilih, sehingga
 * nilai reset ke 0 setelah tutup periode.
 *
 * Logika berdasarkan formula AST di src/lib/ast/defaults.ts:
 *   Omzet        : debit  bila kategori OMZET / PIUTANG;
 *                  -kredit bila RETUR_PENJUALAN / RETUR_PENJUALAN_NONCASH.
 *   Biaya Ops    : kredit bila kategori BIAYA / TABUNGAN / GAJI.
 *   Biaya Bahan  : kredit bila HPP; -debit bila RETUR_HPP.
 *   Laba Bersih  : Omzet − (Biaya Ops + Biaya Bahan).
 *   Saldo        : TIDAK dihitung di sini — tetap dari running total global.
 */

import "server-only";

import { db, getServerSupabaseClient } from "@/lib/db-unified";

export interface PeriodMetrics {
  omzet: number;
  biaya_operasional: number;
  biaya_bahan: number;
  laba_bersih: number;
}

const ZERO_METRICS: PeriodMetrics = {
  omzet: 0,
  biaya_operasional: 0,
  biaya_bahan: 0,
  laba_bersih: 0,
};

/** Kategori yang berkontribusi ke omzet (positif = debit, negatif = kredit). */
const KATEGORI_OMZET_POSITIF = new Set(["OMZET", "PIUTANG"]);
const KATEGORI_OMZET_NEGATIF = new Set(["RETUR_PENJUALAN", "RETUR_PENJUALAN_NONCASH"]);

/** Kategori yang berkontribusi ke biaya operasional (kredit). */
const KATEGORI_BIAYA_OPS = new Set(["BIAYA", "TABUNGAN", "GAJI"]);

function aggregateRows(
  rows: Array<{ kategori_transaksi: string; debit: number; kredit: number }>
): PeriodMetrics {
  let omzet = 0;
  let biaya_operasional = 0;
  let biaya_bahan = 0;

  for (const row of rows) {
    const kat = row.kategori_transaksi;
    const debit = Number(row.debit) || 0;
    const kredit = Number(row.kredit) || 0;

    if (KATEGORI_OMZET_POSITIF.has(kat)) {
      omzet += debit;
    } else if (KATEGORI_OMZET_NEGATIF.has(kat)) {
      omzet -= kredit;
    } else if (KATEGORI_BIAYA_OPS.has(kat)) {
      biaya_operasional += kredit;
    } else if (kat === "HPP") {
      biaya_bahan += kredit;
    } else if (kat === "RETUR_HPP") {
      biaya_bahan -= debit;
    }
  }

  return {
    omzet,
    biaya_operasional,
    biaya_bahan,
    laba_bersih: omzet - biaya_operasional - biaya_bahan,
  };
}

/**
 * Hitung metrik Omzet, Biaya Operasional, Biaya Bahan, dan Laba Bersih
 * untuk satu periode — tanpa ikutsertakan running total dari periode sebelumnya.
 */
export async function computePeriodMetrics(
  periodeId: string
): Promise<PeriodMetrics> {
  try {
    const sb = getServerSupabaseClient();

    if (sb) {
      const { data, error } = await sb
        .from("keuangan")
        .select("kategori_transaksi, debit, kredit")
        .eq("periode_id", periodeId)
        .or("status_transaksi.is.null,status_transaksi.neq.VOIDED");

      if (error) {
        console.warn("[computePeriodMetrics] Supabase error:", error.message);
        return ZERO_METRICS;
      }

      return aggregateRows(
        (data ?? []) as Array<{ kategori_transaksi: string; debit: number; kredit: number }>
      );
    }

    // SQLite path: gunakan db.query (kompatibel dengan mock-db di test).
    const result = await db.query<{
      kategori_transaksi: string;
      debit: number;
      kredit: number;
      status_transaksi?: string;
    }>("keuangan", {
      where: { periode_id: periodeId },
    });

    const rows = (result.data ?? []).filter(
      (r) => r.status_transaksi !== "VOIDED"
    );

    return aggregateRows(rows);
  } catch (err) {
    console.warn("[computePeriodMetrics] Error:", err);
    return ZERO_METRICS;
  }
}
```

- [ ] **Step 4: Jalankan test — harus PASS**

```bash
cd /home/gemi/Projects/gemiprintaio && npx jest src/lib/__tests__/periode-metrics-service.test.ts --testProject node --no-coverage 2>&1 | tail -20
```

Expected: PASS, 11 tests.

- [ ] **Step 5: Type-check**

```bash
npm run type-check
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/periode-metrics-service.ts src/lib/__tests__/periode-metrics-service.test.ts
git commit -m "feat: tambah computePeriodMetrics untuk kalkulasi Omzet/Biaya per periode"
```

---

## Task 4: Auto-tag `periode_id` di `createCashBookEntry` + Query Helper

**Files:**
- Modify: `src/lib/services/finance-service.ts` (fungsi `createCashBookEntry`, sekitar baris 94–148)
- Modify: `src/lib/server-data-supabase.ts` (tambah `fetchKeuanganCashBookByPeriod`)

- [ ] **Step 1: Update `createCashBookEntry` di `finance-service.ts`**

Tambahkan import di bagian atas `finance-service.ts` (setelah import yang sudah ada):

```typescript
import { getOrCreateOpenPeriod } from "@/lib/services/accounting-periods-service";
```

Kemudian di dalam fungsi `createCashBookEntry`, tambahkan `periode_id` ke objek `entry`. Temukan blok:

```typescript
  const entry = {
    id,
    tanggal: data.tanggal,
    kategori_transaksi: data.kategori_transaksi,
    debit,
    kredit,
    keperluan: data.keperluan ?? "",
    catatan: data.catatan ?? "",
    urutan_tampilan: nextOrder,
    dibuat_oleh: data.dibuat_oleh ?? "",
    dibuat_pada: now,
    diperbarui_pada: now,
    omzet: 0,
    biaya_operasional: 0,
    biaya_bahan: 0,
    saldo: 0,
    laba_bersih: 0,
  };
```

Ganti dengan:

```typescript
  // Ambil (atau buat) periode OPEN saat ini untuk men-tag transaksi ini.
  // Bila gagal (mis. race condition saat startup), tetap lanjut tanpa periode_id
  // supaya transaksi tidak hilang — periode_id nullable.
  let periodeId: string | undefined;
  try {
    const periode = await getOrCreateOpenPeriod();
    periodeId = periode.id;
  } catch (e) {
    console.warn("[createCashBookEntry] Gagal mengambil periode aktif:", e);
  }

  const entry = {
    id,
    tanggal: data.tanggal,
    kategori_transaksi: data.kategori_transaksi,
    debit,
    kredit,
    keperluan: data.keperluan ?? "",
    catatan: data.catatan ?? "",
    urutan_tampilan: nextOrder,
    dibuat_oleh: data.dibuat_oleh ?? "",
    dibuat_pada: now,
    diperbarui_pada: now,
    omzet: 0,
    biaya_operasional: 0,
    biaya_bahan: 0,
    saldo: 0,
    laba_bersih: 0,
    periode_id: periodeId ?? null,
  };
```

- [ ] **Step 2: Tambah `fetchKeuanganCashBookByPeriod` di `server-data-supabase.ts`**

Tambahkan fungsi baru setelah `fetchKeuanganCashBookListCurrentMonth`:

```typescript
/**
 * Ambil semua entri buku kas untuk periode tertentu (filter by periode_id).
 * Menggantikan filter tanggal kalender yang dipakai sebelumnya.
 */
export async function fetchKeuanganCashBookByPeriod(
  periodeId: string
): Promise<Record<string, unknown>[]> {
  const sb = clientOrNull();
  if (!sb) return [];
  const { data, error } = await sb
    .from("keuangan")
    .select("*")
    .eq("periode_id", periodeId)
    .or("status_transaksi.is.null,status_transaksi.neq.VOIDED")
    .order("urutan_tampilan", { ascending: false })
    .order("dibuat_pada", { ascending: false });
  if (error) throw error;
  return (data as Record<string, unknown>[]) || [];
}
```

- [ ] **Step 3: Type-check**

```bash
npm run type-check
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/services/finance-service.ts src/lib/server-data-supabase.ts
git commit -m "feat: auto-tag periode_id saat createCashBookEntry + helper fetchByPeriod"
```

---

## Task 5: Update API Routes (cash-book + summary-v2)

**Files:**
- Modify: `src/app/api/keuangan/cash-book/route.ts`
- Modify: `src/app/api/keuangan/summary-v2/route.ts`

- [ ] **Step 1: Update `cash-book/route.ts` — filter by `periode_id` + period-scoped metrics**

Ganti seluruh isi fungsi `GET` di `src/app/api/keuangan/cash-book/route.ts` dengan:

```typescript
export async function GET() {
  try {
    const { getOrCreateOpenPeriod, formatPeriodLabel } = await import(
      "@/lib/services/accounting-periods-service"
    );
    const { computePeriodMetrics } = await import(
      "@/lib/services/periode-metrics-service"
    );

    // Dapatkan periode aktif (OPEN). Bila tidak ada, buat otomatis.
    const currentPeriod = await getOrCreateOpenPeriod();
    const periodeLabel = formatPeriodLabel(currentPeriod.period_key);

    if (getServerSupabaseClient()) {
      const [cashBooks, latestMap, periodMetrics] = await Promise.all([
        fetchKeuanganCashBookByPeriod(currentPeriod.id),
        getLatestPerFormulaKey(), // saldo, modal_kas, saldo_kasbon, kas tetap global
        computePeriodMetrics(currentPeriod.id),
      ]);

      const systemMetrics = {
        // Metrik periode: reset setiap tutup periode
        omzet: periodMetrics.omzet,
        biaya_operasional: periodMetrics.biaya_operasional,
        biaya_bahan: periodMetrics.biaya_bahan,
        laba_bersih: periodMetrics.laba_bersih,
        // Metrik global: tidak reset (kas fisik tidak hilang saat tutup buku)
        saldo: latestMap.saldo ?? 0,
        modal_kas: latestMap.modal_kas ?? 0,
        saldo_kasbon: latestMap.saldo_kasbon ?? 0,
        kas: latestMap.kas ?? 0,
      };

      const cashBooksWithDeletable = cashBooks.map(
        (row: Record<string, unknown>) => ({
          ...row,
          dapat_dihapus: canDeleteCashBookEntry({
            reference_type: (row.reference_type as string) ?? null,
            keperluan: (row.keperluan as string) ?? null,
          }),
        }),
      );

      return NextResponse.json({
        cashBooks: cashBooksWithDeletable,
        systemMetrics,
        periodeLabel,
        periodeId: currentPeriod.id,
        activePeriod: {
          startDate: currentPeriod.start_date,
          endDate: currentPeriod.end_date,
        },
      });
    }

    // SQLite fallback
    const cashBooks =
      (await db.queryRaw(
        `SELECT * FROM keuangan
         WHERE periode_id = ?
           AND COALESCE(status_transaksi, 'POSTED') <> 'VOIDED'
         ORDER BY urutan_tampilan DESC, dibuat_pada DESC`,
        [currentPeriod.id],
      )) || [];

    const [latestMap, periodMetrics] = await Promise.all([
      getLatestPerFormulaKey(),
      computePeriodMetrics(currentPeriod.id),
    ]);

    const systemMetrics = {
      omzet: periodMetrics.omzet,
      biaya_operasional: periodMetrics.biaya_operasional,
      biaya_bahan: periodMetrics.biaya_bahan,
      laba_bersih: periodMetrics.laba_bersih,
      saldo: latestMap.saldo ?? 0,
      modal_kas: latestMap.modal_kas ?? 0,
      saldo_kasbon: latestMap.saldo_kasbon ?? 0,
      kas: latestMap.kas ?? 0,
    };

    const cashBooksWithDeletable = (cashBooks as Record<string, unknown>[]).map(
      (row) => ({
        ...row,
        dapat_dihapus: canDeleteCashBookEntry({
          reference_type: (row.reference_type as string) ?? null,
          keperluan: (row.keperluan as string) ?? null,
        }),
      }),
    );

    return NextResponse.json({
      cashBooks: cashBooksWithDeletable,
      systemMetrics,
      periodeLabel,
      periodeId: currentPeriod.id,
      activePeriod: {
        startDate: currentPeriod.start_date,
        endDate: currentPeriod.end_date,
      },
    });
  } catch (error) {
    console.error("GET /api/keuangan/cash-book error:", error);
    return NextResponse.json(
      { error: "Gagal memuat data keuangan" },
      { status: 500 },
    );
  }
}
```

Tambahkan import `fetchKeuanganCashBookByPeriod` ke bagian atas file (di samping `fetchKeuanganCashBookListCurrentMonth`):

```typescript
import {
  fetchKeuanganCashBookByPeriod,
  getMaxUrutanTampilanKeuangan,
  deleteKeuanganWhereNotArchived,
} from "@/lib/server-data-supabase";
```

(Hapus import `fetchKeuanganCashBookListCurrentMonth` karena tidak lagi dipakai di GET, tapi pastikan tidak dipakai di fungsi lain lebih dulu.)

Hapus juga import `getCurrentMonthRangeJakarta` karena tidak lagi dipakai:

Ganti:
```typescript
import { getCurrentMonthRangeJakarta } from "@/lib/date-utils";
```
Dengan tidak ada (hapus baris ini, atau pertahankan kalau masih dipakai di POST).

- [ ] **Step 2: Update `summary-v2/route.ts` — inject period-scoped metrics ke formula evaluator**

Di dalam fungsi `GET` di `src/app/api/keuangan/summary-v2/route.ts`, modifikasi bagian setelah seed (step 2 di kode existing):

Tambahkan import di bagian atas file:
```typescript
import { getOrCreateOpenPeriod } from "@/lib/services/accounting-periods-service";
import { computePeriodMetrics } from "@/lib/services/periode-metrics-service";
```

Ganti blok `Promise.all` (step 2 kode existing) dari:
```typescript
    const [actors, roles, formulas, latestMap] = await Promise.all([
      listBusinessActors({ includeInactive: false }),
      listActorRoles(),
      listFormulasRaw(),
      getLatestPerFormulaKey(month),
    ]);
```

Menjadi:
```typescript
    // Bila tidak ada filter bulan, gunakan periode aktif (period-scoped metrics).
    // Bila ada filter bulan (tampilan historis), tetap gunakan running total kumulatif.
    const currentPeriod = month ? null : await getOrCreateOpenPeriod().catch(() => null);

    const [actors, roles, formulas, latestMap, periodMetrics] = await Promise.all([
      listBusinessActors({ includeInactive: false }),
      listActorRoles(),
      listFormulasRaw(),
      getLatestPerFormulaKey(month),
      currentPeriod ? computePeriodMetrics(currentPeriod.id) : Promise.resolve(null),
    ]);

    // Inject period-scoped omzet/biaya/laba ke latestMap supaya formula Bagi Hasil
    // mengevaluasi berdasarkan periode aktif, bukan akumulasi sepanjang masa.
    if (periodMetrics) {
      latestMap.omzet = periodMetrics.omzet;
      latestMap.biaya_operasional = periodMetrics.biaya_operasional;
      latestMap.biaya_bahan = periodMetrics.biaya_bahan;
      latestMap.laba_bersih = periodMetrics.laba_bersih;
    }
```

Ganti blok `systemMetrics` di bagian return dari:
```typescript
    const systemMetrics = {
      omzet: latestMap.omzet ?? 0,
      biaya_operasional: latestMap.biaya_operasional ?? 0,
      biaya_bahan: latestMap.biaya_bahan ?? 0,
      saldo: latestMap.saldo ?? 0,
      laba_bersih: latestMap.laba_bersih ?? 0,
      modal_kas: latestMap.modal_kas ?? 0,
      saldo_kasbon: latestMap.saldo_kasbon ?? 0,
      kas: latestMap.kas ?? 0,
    };
```

Menjadi:
```typescript
    // latestMap.omzet/biaya/laba sudah di-override dengan period-scoped values di atas.
    const systemMetrics = {
      omzet: latestMap.omzet ?? 0,
      biaya_operasional: latestMap.biaya_operasional ?? 0,
      biaya_bahan: latestMap.biaya_bahan ?? 0,
      laba_bersih: latestMap.laba_bersih ?? 0,
      saldo: latestMap.saldo ?? 0,        // tetap global/kumulatif
      modal_kas: latestMap.modal_kas ?? 0,
      saldo_kasbon: latestMap.saldo_kasbon ?? 0,
      kas: latestMap.kas ?? 0,
    };
```

- [ ] **Step 3: Type-check dan build**

```bash
npm run type-check && npm run build 2>&1 | tail -30
```

Expected: 0 type errors, build succeeds.

- [ ] **Step 4: Smoke test API secara langsung**

Pastikan dev server berjalan, lalu:
```bash
# Jalankan dev server di terminal terpisah bila belum jalan:
# npm run dev

curl -s http://localhost:3000/api/keuangan/cash-book \
  -H "Cookie: session=<token-valid>" | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print('cashBooks:', len(d.get('cashBooks',[])), '| periodeLabel:', d.get('periodeLabel') , '| omzet:', d.get('systemMetrics',{}).get('omzet'))"
```

Expected: `cashBooks: 48 | periodeLabel: Mei 2026 | omzet: <angka sesuai data>`

- [ ] **Step 5: Commit**

```bash
git add src/app/api/keuangan/cash-book/route.ts src/app/api/keuangan/summary-v2/route.ts
git commit -m "feat: API keuangan filter by periode_id + period-scoped Omzet/Biaya/Bagi Hasil"
```

---

## Task 6: Label Periode di UI Web + Flutter

**Files:**
- Modify: `src/app/keuangan/page.tsx`
- Modify: `flutter/lib/features/finance/finance_page.dart`

- [ ] **Step 1: Update `keuangan/page.tsx` — state + tampilan label**

Tambahkan state `periodeLabel` di dalam komponen `FinancePage` (setelah deklarasi state yang ada, sekitar baris 116):

```typescript
const [periodeLabel, setPeriodeLabel] = useState("Periode Aktif");
```

Di dalam fungsi `loadCashBooks`, setelah `setCashBooks(data.cashBooks || [])`, tambahkan:
```typescript
if (data.periodeLabel) {
  setPeriodeLabel(data.periodeLabel as string);
}
```

Ganti subtitle di header (sekitar baris 838–840):
```typescript
// SEBELUM:
<p className="text-white/90 text-sm">
  Area kerja buku kas bulan berjalan. Riwayat bulan lama tersedia di Laporan.
</p>

// SESUDAH:
<p className="text-white/90 text-sm">
  Area kerja buku kas — <span className="font-semibold">{periodeLabel}</span>.{" "}
  Riwayat tersedia di Laporan.
</p>
```

Ganti label hitungan transaksi di toolbar (sekitar baris 1103–1105):
```typescript
// SEBELUM:
<>{filteredCashBooks.length} Transaksi Bulan Ini</>

// SESUDAH:
<>{filteredCashBooks.length} Transaksi {periodeLabel}</>
```

- [ ] **Step 2: Update `flutter/lib/features/finance/finance_page.dart` — state + tampilan**

Tambahkan field `_periodeLabel` di state class (setelah `bool _isLoading = true;`, sekitar baris 32):

```dart
String _periodeLabel = '';
```

Di dalam `_loadData`, setelah baris `_entries = list.map(...)`, tambahkan:
```dart
_periodeLabel = (data['periodeLabel'] as String?) ?? '';
```

Sehingga blok setState menjadi (tambahkan `_periodeLabel` ke dalam setState):
```dart
setState(() {
  _entries = list
      .map((j) => CashBookEntry.fromJson(j as Map<String, dynamic>))
      .toList();
  _systemMetrics = data['systemMetrics'] is Map<String, dynamic>
      ? data['systemMetrics'] as Map<String, dynamic>
      : {};
  _periodeLabel = (data['periodeLabel'] as String?) ?? '';
  // ... rest of setState unchanged
```

Di dalam `build()`, di `SliverToBoxAdapter` (setelah `const SizedBox(height: 8)`, sekitar baris 607), tambahkan label periode:

```dart
SliverToBoxAdapter(
  child: Column(
    children: [
      const SizedBox(height: 8),
      if (_periodeLabel.isNotEmpty)
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
          child: Align(
            alignment: Alignment.centerLeft,
            child: Text(
              _periodeLabel,
              style: TextStyle(
                fontSize: 11,
                color: Colors.grey.shade500,
                fontWeight: FontWeight.w500,
                letterSpacing: 0.2,
              ),
            ),
          ),
        ),
      _buildSummaryCards(),
    ],
  ),
),
```

- [ ] **Step 3: Type-check + build**

```bash
npm run type-check && npm run build 2>&1 | tail -20
```

Expected: 0 errors, build succeeds.

- [ ] **Step 4: Jalankan semua test yang relevan**

```bash
npx jest src/lib/__tests__/accounting-periods-service.test.ts src/lib/__tests__/periode-metrics-service.test.ts src/lib/__tests__/finance-api.test.ts --testProject node --no-coverage 2>&1 | tail -20
```

Expected: semua PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/keuangan/page.tsx flutter/lib/features/finance/finance_page.dart
git commit -m "feat: tampilkan label periode aktif di header Keuangan (web + Flutter)"
```

---

## Verifikasi Akhir

- [ ] **Full type-check dan build**

```bash
npm run type-check && npm run build
```

Expected: 0 errors, no warnings baru.

- [ ] **Full test suite**

```bash
npx jest --testProject node --no-coverage 2>&1 | tail -30
```

Expected: semua PASS, tidak ada regresi.

- [ ] **Manual smoke test alur tutup periode**

1. Buka halaman Keuangan — verifikasi menampilkan 48 transaksi Mei 2026 dengan label "Mei 2026"
2. Kartu Total Omzet dan Total Biaya menampilkan nilai yang sesuai data Mei
3. Buka Pengaturan → Umum → Tutup Periode Mei → konfirmasi
4. Halaman Keuangan sekarang kosong (0 transaksi) dengan label bulan baru (Juni 2026)
5. Tambah satu transaksi baru → muncul dengan label "Juni 2026"
6. Kartu Total Omzet menampilkan nilai baru saja (bukan akumulasi dari Mei)

- [ ] **Commit final (bila ada perubahan)**

```bash
git push origin main
```
