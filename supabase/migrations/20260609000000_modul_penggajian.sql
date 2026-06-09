-- ════════════════════════════════════════════════════════════════════════════
-- Migrasi: modul_penggajian
-- Tujuan: Memisahkan tiga konsep akuntansi yang selama ini tercampur di gemiprint:
--   1. Beban Gaji        → biaya (mengurangi laba).
--   2. Pinjaman Karyawan → piutang (kasbon, BUKAN biaya).
--   3. Bagi Hasil        → distribusi laba (tetap di business_actors lama).
--
-- Empat tabel baru, semua additive (tidak menghapus/menyentuh tabel lama):
--   - komponen_kompensasi : definisi berulang komponen gaji per karyawan.
--   - proses_gaji         : proses penggajian berkala (header).
--   - slip_gaji        : slip gaji per karyawan dalam satu run.
--   - pinjaman_karyawan   : ledger kasbon/pinjaman (saldo = piutang berjalan).
--
-- Mengikuti pola business_actors_v2: RLS + policy anon_full_access, 9 kolom sync.
-- Migrasi ini immutable setelah diterapkan ke cloud — perubahan lanjutan harus
-- lewat migrasi baru.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. komponen_kompensasi ──────────────────────────────────────────────────
-- Definisi komponen gaji yang berulang per karyawan. Contoh:
--   marketing = GAJI_POKOK (TETAP) + KOMISI (PERSEN 5% dari omzet)
--   cahaya    = GAJI_POKOK (TETAP) saja
-- metode TETAP  → pakai kolom `nominal`.
-- metode PERSEN → pakai `persen` + `sumber_formula_key` (mis. 'omzet').
CREATE TABLE IF NOT EXISTS komponen_kompensasi (
  id                  TEXT PRIMARY KEY,
  actor_id            TEXT NOT NULL REFERENCES business_actors(id) ON DELETE CASCADE,
  tipe                TEXT NOT NULL
                        CHECK (tipe IN ('GAJI_POKOK','TUNJANGAN','KOMISI','BONUS')),
  nama                TEXT NOT NULL,
  metode              TEXT NOT NULL DEFAULT 'TETAP'
                        CHECK (metode IN ('TETAP','PERSEN')),
  nominal             NUMERIC NOT NULL DEFAULT 0,
  persen              NUMERIC NOT NULL DEFAULT 0,
  sumber_formula_key  TEXT,
  aktif_status        INTEGER NOT NULL DEFAULT 1,
  urutan_tampilan     INTEGER NOT NULL DEFAULT 0,
  catatan             TEXT,
  dibuat_pada         TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada     TIMESTAMPTZ DEFAULT NOW(),
  -- 9 kolom sync v2
  sync_status         TEXT DEFAULT 'pending'
                        CHECK (sync_status IN ('pending','synced','conflict')),
  last_synced_at      TIMESTAMPTZ,
  sync_version        INTEGER DEFAULT 1,
  updated_at_server   TIMESTAMPTZ,
  updated_by_device   TEXT DEFAULT 'server',
  change_version      INTEGER DEFAULT 0,
  is_deleted          INTEGER NOT NULL DEFAULT 0,
  deleted_at          TIMESTAMPTZ,
  client_mutation_id  TEXT
);

CREATE INDEX IF NOT EXISTS idx_komponen_kompensasi_actor   ON komponen_kompensasi(actor_id);
CREATE INDEX IF NOT EXISTS idx_komponen_kompensasi_aktif   ON komponen_kompensasi(aktif_status);
CREATE INDEX IF NOT EXISTS idx_komponen_kompensasi_sync    ON komponen_kompensasi(sync_status);

-- ── 2. proses_gaji ──────────────────────────────────────────────────────────
-- Header proses penggajian satu periode. status DRAFT → DIBAYAR → VOIDED.
CREATE TABLE IF NOT EXISTS proses_gaji (
  id                       TEXT PRIMARY KEY,
  periode                  TEXT NOT NULL,
  tanggal_bayar            DATE,
  status                   TEXT NOT NULL DEFAULT 'DRAFT'
                             CHECK (status IN ('DRAFT','DIBAYAR','VOIDED')),
  metode_bayar             TEXT NOT NULL DEFAULT 'CASH'
                             CHECK (metode_bayar IN ('CASH','TRANSFER')),
  total_bruto              NUMERIC NOT NULL DEFAULT 0,
  total_potongan_kasbon    NUMERIC NOT NULL DEFAULT 0,
  total_neto               NUMERIC NOT NULL DEFAULT 0,
  catatan                  TEXT,
  dibuat_oleh              TEXT,
  voided_at                TIMESTAMPTZ,
  voided_by                TEXT,
  dibuat_pada              TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada          TIMESTAMPTZ DEFAULT NOW(),
  sync_status              TEXT DEFAULT 'pending'
                             CHECK (sync_status IN ('pending','synced','conflict')),
  last_synced_at           TIMESTAMPTZ,
  sync_version             INTEGER DEFAULT 1,
  updated_at_server        TIMESTAMPTZ,
  updated_by_device        TEXT DEFAULT 'server',
  change_version           INTEGER DEFAULT 0,
  is_deleted               INTEGER NOT NULL DEFAULT 0,
  deleted_at               TIMESTAMPTZ,
  client_mutation_id       TEXT
);

CREATE INDEX IF NOT EXISTS idx_proses_gaji_status   ON proses_gaji(status);
CREATE INDEX IF NOT EXISTS idx_proses_gaji_periode  ON proses_gaji(periode);
CREATE INDEX IF NOT EXISTS idx_proses_gaji_sync     ON proses_gaji(sync_status);

-- ── 3. slip_gaji ─────────────────────────────────────────────────────────
-- Satu slip per karyawan per run. neto = bruto - potongan_kasbon.
-- komponen_snapshot menyimpan rincian komponen (JSON) untuk audit + cetak slip.
CREATE TABLE IF NOT EXISTS slip_gaji (
  id                   TEXT PRIMARY KEY,
  proses_gaji_id       TEXT NOT NULL REFERENCES proses_gaji(id) ON DELETE CASCADE,
  actor_id             TEXT NOT NULL REFERENCES business_actors(id) ON DELETE CASCADE,
  bruto                NUMERIC NOT NULL DEFAULT 0,
  potongan_kasbon      NUMERIC NOT NULL DEFAULT 0,
  neto                 NUMERIC NOT NULL DEFAULT 0,
  status               TEXT NOT NULL DEFAULT 'DRAFT'
                         CHECK (status IN ('DRAFT','DIBAYAR','VOIDED')),
  metode_bayar         TEXT NOT NULL DEFAULT 'CASH'
                         CHECK (metode_bayar IN ('CASH','TRANSFER')),
  keuangan_ref_id      TEXT,
  komponen_snapshot    JSONB,
  catatan              TEXT,
  dibuat_pada          TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada      TIMESTAMPTZ DEFAULT NOW(),
  sync_status          TEXT DEFAULT 'pending'
                         CHECK (sync_status IN ('pending','synced','conflict')),
  last_synced_at       TIMESTAMPTZ,
  sync_version         INTEGER DEFAULT 1,
  updated_at_server    TIMESTAMPTZ,
  updated_by_device    TEXT DEFAULT 'server',
  change_version       INTEGER DEFAULT 0,
  is_deleted           INTEGER NOT NULL DEFAULT 0,
  deleted_at           TIMESTAMPTZ,
  client_mutation_id   TEXT
);

CREATE INDEX IF NOT EXISTS idx_slip_gaji_run    ON slip_gaji(proses_gaji_id);
CREATE INDEX IF NOT EXISTS idx_slip_gaji_actor  ON slip_gaji(actor_id);
CREATE INDEX IF NOT EXISTS idx_slip_gaji_status ON slip_gaji(status);
CREATE INDEX IF NOT EXISTS idx_slip_gaji_sync   ON slip_gaji(sync_status);

-- ── 4. pinjaman_karyawan ────────────────────────────────────────────────────
-- Ledger kasbon sebagai PIUTANG (bukan biaya). Saldo seorang karyawan =
--   Σ(TARIK) − Σ(POTONG_GAJI) − Σ(BAYAR_TUNAI).
-- jenis:
--   TARIK       → karyawan ambil kasbon, menaikkan saldo pinjaman (kas keluar).
--   POTONG_GAJI → dipotong saat proses gaji, menurunkan saldo (tidak ada kas keluar).
--   BAYAR_TUNAI → karyawan kembalikan tunai, menurunkan saldo (kas masuk).
CREATE TABLE IF NOT EXISTS pinjaman_karyawan (
  id                   TEXT PRIMARY KEY,
  actor_id             TEXT NOT NULL REFERENCES business_actors(id) ON DELETE CASCADE,
  tanggal              DATE NOT NULL DEFAULT CURRENT_DATE,
  jumlah               NUMERIC NOT NULL DEFAULT 0,
  jenis                TEXT NOT NULL
                         CHECK (jenis IN ('TARIK','POTONG_GAJI','BAYAR_TUNAI')),
  keterangan           TEXT,
  keuangan_ref_id      TEXT,
  proses_gaji_id       TEXT REFERENCES proses_gaji(id) ON DELETE SET NULL,
  dibuat_oleh          TEXT,
  dibuat_pada          TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada      TIMESTAMPTZ DEFAULT NOW(),
  sync_status          TEXT DEFAULT 'pending'
                         CHECK (sync_status IN ('pending','synced','conflict')),
  last_synced_at       TIMESTAMPTZ,
  sync_version         INTEGER DEFAULT 1,
  updated_at_server    TIMESTAMPTZ,
  updated_by_device    TEXT DEFAULT 'server',
  change_version       INTEGER DEFAULT 0,
  is_deleted           INTEGER NOT NULL DEFAULT 0,
  deleted_at           TIMESTAMPTZ,
  client_mutation_id   TEXT
);

CREATE INDEX IF NOT EXISTS idx_pinjaman_karyawan_actor  ON pinjaman_karyawan(actor_id);
CREATE INDEX IF NOT EXISTS idx_pinjaman_karyawan_jenis  ON pinjaman_karyawan(jenis);
CREATE INDEX IF NOT EXISTS idx_pinjaman_karyawan_run    ON pinjaman_karyawan(proses_gaji_id);
CREATE INDEX IF NOT EXISTS idx_pinjaman_karyawan_sync   ON pinjaman_karyawan(sync_status);

-- ── RLS policies (mirror pola anon_full_access dari business_actors_v2) ──────
-- App internal, semua pengguna terpercaya; service_role hanya server-side.
ALTER TABLE komponen_kompensasi ENABLE ROW LEVEL SECURITY;
ALTER TABLE proses_gaji         ENABLE ROW LEVEL SECURITY;
ALTER TABLE slip_gaji        ENABLE ROW LEVEL SECURITY;
ALTER TABLE pinjaman_karyawan   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS anon_full_access ON komponen_kompensasi;
CREATE POLICY anon_full_access ON komponen_kompensasi FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS anon_full_access ON proses_gaji;
CREATE POLICY anon_full_access ON proses_gaji FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS anon_full_access ON slip_gaji;
CREATE POLICY anon_full_access ON slip_gaji FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS anon_full_access ON pinjaman_karyawan;
CREATE POLICY anon_full_access ON pinjaman_karyawan FOR ALL TO anon USING (true) WITH CHECK (true);

-- service_role full access (mirror pola surat_jalan).
DROP POLICY IF EXISTS "Service role full access" ON komponen_kompensasi;
CREATE POLICY "Service role full access" ON komponen_kompensasi FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON proses_gaji;
CREATE POLICY "Service role full access" ON proses_gaji FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON slip_gaji;
CREATE POLICY "Service role full access" ON slip_gaji FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON pinjaman_karyawan;
CREATE POLICY "Service role full access" ON pinjaman_karyawan FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Beban gaji ikut mengurangi laba ─────────────────────────────────────────
-- Kolom buku kas `biaya_operasional` (column_key H) sebelumnya hanya akumulasi
-- BIAYA + TABUNGAN. Tambahkan GAJI supaya beban gaji (bruto) mengurangi laba —
-- ini koreksi inti yang diminta owner. PINJAMAN_KARYAWAN sengaja TIDAK masuk
-- sini (kasbon = piutang, netral terhadap laba).
UPDATE cashbook_formula
SET ast = '{"type":"if","cond":{"type":"binaryOp","op":"=","left":{"type":"row"},"right":{"type":"literal","value":2}},"then":{"type":"if","cond":{"type":"or","left":{"type":"or","left":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"BIAYA"}},"right":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"TABUNGAN"}}},"right":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"GAJI"}}},"then":{"type":"columnRef","column":"E"},"else":{"type":"literal","value":0}},"else":{"type":"if","cond":{"type":"or","left":{"type":"or","left":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"BIAYA"}},"right":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"TABUNGAN"}}},"right":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"GAJI"}}},"then":{"type":"binaryOp","op":"+","left":{"type":"prevOutput","column":"H"},"right":{"type":"columnRef","column":"E"}},"else":{"type":"prevOutput","column":"H"}}}'::jsonb,
    description = 'Akumulasi BIAYA + TABUNGAN + GAJI (beban gaji ikut mengurangi laba).'
WHERE column_key = 'H' OR db_column = 'biaya_operasional' OR formula_key = 'biaya_operasional';
