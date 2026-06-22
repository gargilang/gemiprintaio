# Fix Potong Bagi Hasil — Critical Issues Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two critical issues in the Potong Bagi Hasil feature: (1) CHECK constraint blocks `POTONG_BAGI_HASIL` inserts on both Postgres and SQLite, (2) single-debit accounting inflates `saldo`/`kas` — must use double-entry (LABA kredit + PINJAMAN_KARYAWAN debit).

**Architecture:** Add a new Postgres migration to drop/recreate the CHECK constraint with the new enum value. For SQLite, add a table-rebuild migration in `db-sqlite-migrations.ts` (SQLite cannot ALTER CHECK in place — must rename, recreate, copy, drop). Rewrite `potongBagiHasil` to post TWO `keuangan` rows (LABA kredit + PINJAMAN_KARYAWAN debit) instead of one. Update `batalkanPotongBagiHasil` to reverse both rows. Add server-side validation (`jumlah <= saldo`). Fix slug mismatch. Fix useEffect deps. Add tests.

**Tech Stack:** Next.js, Supabase Postgres, better-sqlite3, Zod, Jest

---

### Task 1: Postgres migration — add `POTONG_BAGI_HASIL` to CHECK constraint

**Files:**
- Create: `supabase/migrations/20260623000000_pinjaman_jenis_potong_bagi_hasil.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Tambah nilai 'POTONG_BAGI_HASIL' ke CHECK constraint kolom jenis.
-- Dipakai saat pengurus melunasi kasbon dengan bagi hasilnya (netting, tanpa kas fisik).
ALTER TABLE pinjaman_karyawan DROP CONSTRAINT IF EXISTS pinjaman_karyawan_jenis_check;
ALTER TABLE pinjaman_karyawan ADD CONSTRAINT pinjaman_karyawan_jenis_check
  CHECK (jenis = ANY (ARRAY['TARIK'::text, 'POTONG_GAJI'::text, 'BAYAR_TUNAI'::text, 'POTONG_BAGI_HASIL'::text]));
```

- [ ] **Step 2: Push migration to cloud**

Run: `npm run supabase:db:push`
Expected: migration applies successfully

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260623000000_pinjaman_jenis_potong_bagi_hasil.sql
git commit -m "feat: migrasi CHECK constraint pinjaman_karyawan untuk POTONG_BAGI_HASIL"
```

---

### Task 2: SQLite schema + runtime migration — rebuild table with new CHECK

**Files:**
- Modify: `database/sqlite-schema.sql` (line ~1291)
- Modify: `src/lib/db-sqlite-migrations.ts` (add rebuild function + call it in `ensureServerSQLiteSyncV2Schema`)

- [ ] **Step 1: Update sqlite-schema.sql CHECK constraint**

In `database/sqlite-schema.sql`, change line:
```sql
jenis TEXT NOT NULL CHECK(jenis IN ('TARIK','POTONG_GAJI','BAYAR_TUNAI')),
```
to:
```sql
jenis TEXT NOT NULL CHECK(jenis IN ('TARIK','POTONG_GAJI','BAYAR_TUNAI','POTONG_BAGI_HASIL')),
```

- [ ] **Step 2: Update the CREATE TABLE in db-sqlite-migrations.ts**

In `src/lib/db-sqlite-migrations.ts`, the `ensureServerSQLiteSyncV2Schema` function has a `CREATE TABLE IF NOT EXISTS pinjaman_karyawan` at line ~2059. Update the CHECK constraint there too:
```sql
jenis TEXT NOT NULL CHECK(jenis IN ('TARIK','POTONG_GAJI','BAYAR_TUNAI','POTONG_BAGI_HASIL')),
```

- [ ] **Step 3: Add rebuild function for existing SQLite installs**

Add a new function `migratePinjamanKaryawanJenisConstraint` in `src/lib/db-sqlite-migrations.ts` (before `ensureServerSQLiteSyncV2Schema`). This rebuilds the table for existing installs where the old CHECK doesn't include `POTONG_BAGI_HASIL`. Pattern: check `sqlite_master` for old constraint, if found, rebuild table.

```typescript
/**
 * Rebuild pinjaman_karyawan untuk menambah 'POTONG_BAGI_HASIL' ke CHECK constraint.
 * SQLite tidak bisa ALTER CHECK in-place → rename, recreate, copy, drop, rename.
 * Hanya berjalan bila tabel lama (tanpa POTONG_BAGI_HASIL) terdeteksi.
 */
function migratePinjamanKaryawanJenisConstraint(db: any) {
  const tableSql = (
    db
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name = 'pinjaman_karyawan'")
      .get() as { sql?: string } | undefined
  )?.sql;
  if (!tableSql || tableSql.includes("'POTONG_BAGI_HASIL'")) return;

  const oldName = "pinjaman_karyawan_old_bagi_hasil";
  db.exec("PRAGMA foreign_keys = OFF;");
  db.exec("BEGIN TRANSACTION;");
  try {
    db.exec(`ALTER TABLE pinjaman_karyawan RENAME TO ${oldName};`);
    db.exec(`
      CREATE TABLE pinjaman_karyawan (
        id TEXT PRIMARY KEY,
        actor_id TEXT NOT NULL,
        tanggal TEXT NOT NULL DEFAULT (date('now')),
        jumlah REAL NOT NULL DEFAULT 0,
        jenis TEXT NOT NULL CHECK(jenis IN ('TARIK','POTONG_GAJI','BAYAR_TUNAI','POTONG_BAGI_HASIL')),
        keterangan TEXT,
        keuangan_ref_id TEXT,
        proses_gaji_id TEXT,
        dibuat_oleh TEXT,
        dibuat_pada TEXT DEFAULT (datetime('now')),
        diperbarui_pada TEXT DEFAULT (datetime('now')),
        sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
        last_synced_at TEXT,
        sync_version INTEGER DEFAULT 1,
        updated_at_server TEXT,
        updated_by_device TEXT DEFAULT 'server',
        change_version INTEGER DEFAULT 0,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT,
        client_mutation_id TEXT,
        FOREIGN KEY (actor_id) REFERENCES pegawai(id) ON DELETE CASCADE,
        FOREIGN KEY (proses_gaji_id) REFERENCES proses_gaji(id) ON DELETE SET NULL
      );
    `);
    const targetCols = (
      db.prepare("PRAGMA table_info(pinjaman_karyawan)").all() as Array<{ name: string }>
    ).map((c) => c.name);
    const oldCols = new Set(
      (
        db.prepare(`PRAGMA table_info(${oldName})`).all() as Array<{ name: string }>
      ).map((c) => c.name)
    );
    const commonCols = targetCols.filter((name) => oldCols.has(name));
    if (commonCols.length > 0) {
      db.exec(`
        INSERT INTO pinjaman_karyawan (${commonCols.join(", ")})
        SELECT ${commonCols.join(", ")}
        FROM ${oldName}
      `);
    }
    db.exec(`DROP TABLE ${oldName};`);
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  } finally {
    db.exec("PRAGMA foreign_keys = ON;");
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_pinjaman_karyawan_actor ON pinjaman_karyawan(actor_id);
    CREATE INDEX IF NOT EXISTS idx_pinjaman_karyawan_jenis ON pinjaman_karyawan(jenis);
    CREATE INDEX IF NOT EXISTS idx_pinjaman_karyawan_run ON pinjaman_karyawan(proses_gaji_id);
    CREATE INDEX IF NOT EXISTS idx_pinjaman_karyawan_sync ON pinjaman_karyawan(sync_status);
  `);
}
```

- [ ] **Step 4: Call the rebuild function in ensureServerSQLiteSyncV2Schema**

In `ensureServerSQLiteSyncV2Schema`, right after the `CREATE TABLE IF NOT EXISTS pinjaman_karyawan` block (after line ~2087, before `serverSqliteColumnsCache.clear()`), add:
```typescript
  // Rebuild pinjaman_karyawan untuk existing installs (tambah POTONG_BAGI_HASIL ke CHECK).
  migratePinjamanKaryawanJenisConstraint(db);
```

- [ ] **Step 5: Run type-check**

Run: `npm run type-check`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add database/sqlite-schema.sql src/lib/db-sqlite-migrations.ts
git commit -m "feat: SQLite schema + runtime rebuild untuk POTONG_BAGI_HASIL"
```

---

### Task 3: Rewrite `potongBagiHasil` — double-entry accounting (LABA + PINJAMAN_KARYAWAN)

**Files:**
- Modify: `src/lib/services/pinjaman-karyawan-service.ts`
- Test: `src/lib/__tests__/pinjaman-karyawan-service.test.ts`

- [ ] **Step 1: Write failing tests for potongBagiHasil**

Add these tests to `src/lib/__tests__/pinjaman-karyawan-service.test.ts`. First, add `potongBagiHasil` and `batalkanPotongBagiHasil` to the import at line 39-46:

```typescript
import {
  catatTarikPinjaman,
  bayarPinjamanTunai,
  potongBagiHasil,
  batalkanPotongBagiHasil,
  hitungSaldoPinjaman,
  hitungSaldoPinjamanBatch,
  listPinjaman,
  revertPinjaman,
} from "../services/pinjaman-karyawan-service";
```

Then add these test blocks at the end of the file (before the final closing bracket):

```typescript
describe("potongBagiHasil", () => {
  it("menolak jumlah > saldo pinjaman", async () => {
    seedActor("actor-suri");
    // Suri punya saldo 5.000.000 dari TARIK
    mockTable("pinjaman_karyawan").set("p1", {
      id: "p1",
      actor_id: "actor-suri",
      tanggal: "2026-05-01",
      jumlah: 5_000_000,
      jenis: "TARIK",
      keterangan: "Kasbon",
      keuangan_ref_id: null,
      proses_gaji_id: null,
      dibuat_oleh: null,
      is_deleted: 0,
    });
    await expect(
      potongBagiHasil({
        actorId: "actor-suri",
        jumlah: 6_000_000,
        tanggal: "2026-05-31",
        periode: "2026-05",
      })
    ).rejects.toThrow(/tidak boleh melebihi saldo/);
  });

  it("menolak tanggal di periode ditutup", async () => {
    seedActor("actor-suri");
    mockTable("pinjaman_karyawan").set("p1", {
      id: "p1",
      actor_id: "actor-suri",
      tanggal: "2026-05-01",
      jumlah: 5_000_000,
      jenis: "TARIK",
      keterangan: "Kasbon",
      keuangan_ref_id: null,
      proses_gaji_id: null,
      dibuat_oleh: null,
      is_deleted: 0,
    });
    isDateInClosedPeriodMock.mockResolvedValue(true);
    await expect(
      potongBagiHasil({
        actorId: "actor-suri",
        jumlah: 3_000_000,
        tanggal: "2026-05-31",
        periode: "2026-05",
      })
    ).rejects.toThrow(/periode akuntansi yang sudah ditutup/);
  });

  it("post double-entry: LABA kredit + PINJAMAN_KARYAWAN debit, saldo net 0", async () => {
    seedActor("actor-suri");
    mockTable("pinjaman_karyawan").set("p1", {
      id: "p1",
      actor_id: "actor-suri",
      tanggal: "2026-05-01",
      jumlah: 10_000_000,
      jenis: "TARIK",
      keterangan: "Kasbon",
      keuangan_ref_id: null,
      proses_gaji_id: null,
      dibuat_oleh: null,
      is_deleted: 0,
    });

    const result = await potongBagiHasil({
      actorId: "actor-suri",
      jumlah: 7_000_000,
      tanggal: "2026-05-31",
      periode: "2026-05",
      dibuatOleh: "admin-gemi-001",
    });

    expect(result.jenis).toBe("POTONG_BAGI_HASIL");
    expect(result.jumlah).toBe(7_000_000);

    // Harus ada 2 baris keuangan: LABA kredit + PINJAMAN_KARYAWAN debit
    const keuRows = mockTable("keuangan").all();
    const labaRow = keuRows.find((r: any) => r.kategori_transaksi === "LABA");
    const pinjamanRow = keuRows.find((r: any) => r.kategori_transaksi === "PINJAMAN_KARYAWAN");
    expect(labaRow).toBeDefined();
    expect(labaRow.debit).toBe(0);
    expect(labaRow.kredit).toBe(7_000_000);
    expect(pinjamanRow).toBeDefined();
    expect(pinjamanRow.debit).toBe(7_000_000);
    expect(pinjamanRow.kredit).toBe(0);

    // Saldo pinjaman berkurang
    const saldo = await hitungSaldoPinjaman("actor-suri");
    expect(saldo).toBe(3_000_000);
  });
});

describe("batalkanPotongBagiHasil", () => {
  it("menghapus kedua baris keuangan dan mengembalikan saldo", async () => {
    seedActor("actor-suri");
    mockTable("pinjaman_karyawan").set("p1", {
      id: "p1",
      actor_id: "actor-suri",
      tanggal: "2026-05-01",
      jumlah: 10_000_000,
      jenis: "TARIK",
      keterangan: "Kasbon",
      keuangan_ref_id: null,
      proses_gaji_id: null,
      dibuat_oleh: null,
      is_deleted: 0,
    });

    const result = await potongBagiHasil({
      actorId: "actor-suri",
      jumlah: 7_000_000,
      tanggal: "2026-05-31",
      periode: "2026-05",
    });

    await batalkanPotongBagiHasil(result.id);

    // Baris pinjaman ditandai is_deleted
    const pinjamanRow = mockTable("pinjaman_karyawan").get(result.id);
    expect(pinjamanRow.is_deleted).toBe(1);

    // Semua baris keuangan ber-[REF] dihapus
    const keuRows = mockTable("keuangan").all();
    const refRows = keuRows.filter((r: any) =>
      String(r.keperluan || "").includes(`[REF:pinjaman-${result.id}]`)
    );
    expect(refRows.length).toBe(0);

    // Saldo kembali ke 10.000.000
    const saldo = await hitungSaldoPinjaman("actor-suri");
    expect(saldo).toBe(10_000_000);
  });

  it("menolak membatalkan jenis non-POTONG_BAGI_HASIL", async () => {
    seedActor("actor-suri");
    mockTable("pinjaman_karyawan").set("p1", {
      id: "p1",
      actor_id: "actor-suri",
      tanggal: "2026-05-01",
      jumlah: 5_000_000,
      jenis: "TARIK",
      keterangan: "Kasbon",
      keuangan_ref_id: null,
      proses_gaji_id: null,
      dibuat_oleh: null,
      is_deleted: 0,
    });
    await expect(batalkanPotongBagiHasil("p1")).rejects.toThrow(
      /Hanya baris POTONG_BAGI_HASIL/
    );
  });
});

describe("revertPinjaman — penolakan POTONG_BAGI_HASIL", () => {
  it("menolak revert langsung untuk POTONG_BAGI_HASIL", async () => {
    seedActor("actor-suri");
    mockTable("pinjaman_karyawan").set("p1", {
      id: "p1",
      actor_id: "actor-suri",
      tanggal: "2026-05-31",
      jumlah: 7_000_000,
      jenis: "POTONG_BAGI_HASIL",
      keterangan: "Potong bagi hasil",
      keuangan_ref_id: "keu-1",
      proses_gaji_id: null,
      dibuat_oleh: null,
      is_deleted: 0,
    });
    await expect(revertPinjaman("p1")).rejects.toThrow(/bagi hasil/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/lib/__tests__/pinjaman-karyawan-service.test.ts --selectProjects node`
Expected: FAIL (potongBagiHasil not imported, tests fail)

- [ ] **Step 3: Rewrite `potongBagiHasil` with double-entry + saldo validation**

In `src/lib/services/pinjaman-karyawan-service.ts`, replace the existing `potongBagiHasil` function with:

```typescript
/**
 * Catat potongan bagi hasil untuk melunasi kasbon pengurus.
 * Netting — tidak ada pergerakan kas fisik. Double-entry:
 *   1. keuangan LABA kredit = jumlah  (saldo ↓, seakan bagi hasil dibayar tunai)
 *   2. keuangan PINJAMAN_KARYAWAN debit = jumlah  (saldo ↑, seakan kasbon dibayar tunai)
 * Net saldo = 0, saldo_kasbon ↓, laba_bersih tidak berubah (LABA ≠ beban).
 */
export async function potongBagiHasil(
  input: PotongBagiHasilInput
): Promise<PinjamanKaryawan> {
  if (await isDateInClosedPeriod(input.tanggal)) {
    throw new Error(
      `Tanggal ${input.tanggal} berada di periode akuntansi yang sudah ditutup. Buka periode itu dulu.`
    );
  }
  if (!(Number(input.jumlah) > 0)) {
    throw new Error("Jumlah potongan bagi hasil harus lebih dari 0.");
  }

  // Validasi server-side: jumlah tidak boleh melebihi saldo kasbon.
  const saldo = await hitungSaldoPinjaman(input.actorId);
  if (Number(input.jumlah) > saldo) {
    throw new Error(
      `Jumlah potongan bagi hasil (Rp ${Number(input.jumlah).toLocaleString("id-ID")}) tidak boleh melebihi saldo kasbon (Rp ${saldo.toLocaleString("id-ID")}).`
    );
  }

  try {
    const hasil = await db.transaction(async () => {
      const pinjamanId = generateId();
      const now = getCurrentTimestamp();
      const keterangan =
        input.keterangan?.trim() ||
        `Potongan bagi hasil periode ${input.periode}`;

      const pinjamanRow: PinjamanKaryawan = {
        id: pinjamanId,
        actor_id: input.actorId,
        tanggal: input.tanggal,
        jumlah: Number(input.jumlah),
        jenis: "POTONG_BAGI_HASIL",
        keterangan,
        keuangan_ref_id: null,
        proses_gaji_id: null,
        dibuat_oleh: input.dibuatOleh || null,
      };
      const insertRes = await db.insert("pinjaman_karyawan", pinjamanRow);
      if (insertRes.error) throw insertRes.error;

      // 1) LABA kredit — seakan bagi hasil dibayar tunai (saldo ↓).
      const labaKeuId = generateId();
      const labaRes = await db.insert("keuangan", {
        id: labaKeuId,
        tanggal: input.tanggal,
        kategori_transaksi: "LABA",
        debit: 0,
        kredit: Number(input.jumlah),
        keperluan: `${keterangan} ${refToken(pinjamanId)}`,
        catatan: `Bagi hasil periode ${input.periode}`,
        dibuat_oleh: input.dibuatOleh || null,
        urutan_tampilan: await nextKeuanganOrder(),
        reference_type: "PINJAMAN_KARYAWAN",
        reference_id: pinjamanId,
        dibuat_pada: now,
        diperbarui_pada: now,
      });
      if (labaRes.error) throw labaRes.error;

      // 2) PINJAMAN_KARYAWAN debit — seakan kasbon dibayar tunai (saldo ↑).
      const pinjamanKeuId = generateId();
      const pinjamanKeuRes = await db.insert("keuangan", {
        id: pinjamanKeuId,
        tanggal: input.tanggal,
        kategori_transaksi: "PINJAMAN_KARYAWAN",
        debit: Number(input.jumlah),
        kredit: 0,
        keperluan: `${keterangan} ${refToken(pinjamanId)}`,
        catatan: null,
        dibuat_oleh: input.dibuatOleh || null,
        urutan_tampilan: await nextKeuanganOrder(),
        reference_type: "PINJAMAN_KARYAWAN",
        reference_id: pinjamanId,
        dibuat_pada: now,
        diperbarui_pada: now,
      });
      if (pinjamanKeuRes.error) throw pinjamanKeuRes.error;

      // Tautkan baris keuangan utama ke pinjaman.
      const updRes = await db.update("pinjaman_karyawan", pinjamanId, {
        keuangan_ref_id: pinjamanKeuId,
      });
      if (updRes.error) throw updRes.error;

      return { ...pinjamanRow, keuangan_ref_id: pinjamanKeuId };
    });

    await recalculateCashbookIfAvailable();
    return hasil;
  } catch (e) {
    lemparRamah(e, "pinjaman_karyawan");
  }
}
```

- [ ] **Step 4: Update `batalkanPotongBagiHasil` to delete BOTH keuangan rows**

The existing `batalkanPotongBagiHasil` already deletes by `reference_id`, which should catch both rows. Verify it does — both LABA and PINJAMAN_KARYAWAN rows have `reference_id = pinjamanId`. No change needed if the existing implementation queries by `reference_id`. If it queries by token in `keperluan`, both rows have the same token, so it also works. Verify and proceed.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest src/lib/__tests__/pinjaman-karyawan-service.test.ts --selectProjects node`
Expected: PASS (all tests including new ones)

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/pinjaman-karyawan-service.ts src/lib/__tests__/pinjaman-karyawan-service.test.ts
git commit -m "fix: double-entry potongBagiHasil (LABA kredit + PINJAMAN_KARYAWAN debit) + saldo validation"
```

---

### Task 4: Fix ModalBagiHasil — slug mismatch + useEffect deps + Zod schema

**Files:**
- Modify: `src/app/penggajian/ModalBagiHasil.tsx`
- Modify: `src/lib/schemas/penggajian.ts` (add Zod schema)
- Modify: `src/app/penggajian/actions.ts` (use Zod in action)

- [ ] **Step 1: Add Zod schema for potong bagi hasil**

In `src/lib/schemas/penggajian.ts`, add:

```typescript
export const potongBagiHasilSchema = z.object({
  actorId: z.string().min(1),
  jumlah: z.coerce.number().finite().positive(),
  tanggal: z.string().min(1),
  periode: z.string().regex(/^\d{4}-\d{2}$/, "Periode harus format YYYY-MM"),
  keterangan: z.string().optional(),
});
export type PotongBagiHasilInput = z.infer<typeof potongBagiHasilSchema>;
```

- [ ] **Step 2: Use Zod in the server action**

In `src/app/penggajian/actions.ts`, update `potongBagiHasilAction` to validate with Zod:

```typescript
export async function potongBagiHasilAction(input: {
  actorId: string;
  jumlah: number;
  tanggal: string;
  periode: string;
  keterangan?: string;
}): Promise<void> {
  "use server";
  const session = await requireAdminOrManager();
  const parsed = potongBagiHasilSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("Data potong bagi hasil tidak valid.");
  }
  await potongBagiHasil({ ...parsed.data, dibuatOleh: session.uid });
}
```

Add the import at the top of actions.ts:
```typescript
import { potongBagiHasilSchema } from "@/lib/schemas/penggajian";
```

- [ ] **Step 3: Fix slug mismatch in ModalBagiHasil**

In `src/app/penggajian/ModalBagiHasil.tsx`, remove the local `slugify` function and import `slugifyActorName` from the service instead:

Replace the local `slugify` function (lines ~20-25) with:
```typescript
import { slugifyActorName } from "@/lib/services/business-actor-service";
```

And change `const slug = slugify(actor.nama);` to `const slug = slugifyActorName(actor.nama);`

- [ ] **Step 4: Fix useEffect deps — remove `saldo` to prevent clobbering user input**

In `src/app/penggajian/ModalBagiHasil.tsx`, change the useEffect dependency array from `[periode, formulaKey, saldo]` to `[periode, formulaKey]`. Also, only pre-fill `jumlah` if it's currently empty:

Change the pre-fill logic inside the effect from:
```typescript
if (typeof val === "number" && val > 0) {
  setJumlah(String(Math.min(saldo, val)));
}
```
to:
```typescript
if (typeof val === "number" && val > 0 && !jumlah) {
  setJumlah(String(Math.min(saldo, val)));
}
```

- [ ] **Step 5: Run type-check**

Run: `npm run type-check`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add src/app/penggajian/ModalBagiHasil.tsx src/lib/schemas/penggajian.ts src/app/penggajian/actions.ts
git commit -m "fix: slug mismatch, useEffect deps, Zod validation for potong bagi hasil"
```

---

### Task 5: Full verification — type-check + build + jest

- [ ] **Step 1: Type-check**

Run: `npm run type-check`
Expected: 0 errors

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Run all penggajian + pinjaman tests**

Run: `npx jest src/lib/__tests__/pinjaman-karyawan-service.test.ts src/lib/__tests__/penggajian-service.test.ts --selectProjects node`
Expected: All tests pass

- [ ] **Step 4: Run AST cashbook tests (verify LABA category behavior)**

Run: `npx jest src/lib/ast/__tests__/ --selectProjects node`
Expected: All tests pass (confirms LABA category doesn't affect laba_bersih)
