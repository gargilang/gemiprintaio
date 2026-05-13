-- Migration: add_rls_policies_anon_access
--
-- Context: The desktop app previously required the Supabase service_role key
-- to be embedded in the binary because no RLS policies existed (RLS was enabled
-- but every table had zero policies → all anon requests blocked).
--
-- Fix: grant the minimum access required so the public anon key is sufficient:
--   • profil   → SELECT only (login check; INSERT/UPDATE/DELETE removed from anon)
--   • all other tables → full anon access (internal app, all users trusted)
--
-- The service_role key stays server-side only (Vercel environment variable).

-- ── profil: read-only for anon (used for login) ───────────────────────────────
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON profil FROM anon;

CREATE POLICY anon_login_read ON profil
  FOR SELECT TO anon
  USING (true);

-- ── business / sync tables: full anon access ─────────────────────────────────
CREATE POLICY anon_full_access ON accounting_posting_rules  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_full_access ON audit_log                 FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_full_access ON barang                    FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_full_access ON chart_of_accounts         FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_full_access ON companies                 FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_full_access ON device_registry           FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_full_access ON finance_category_definitions FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_full_access ON finance_metric_mappings   FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_full_access ON finance_participants      FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_full_access ON fiscal_periods            FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_full_access ON harga_barang_satuan       FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_full_access ON hutang_pembelian          FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_full_access ON item_finishing            FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_full_access ON item_pembelian            FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_full_access ON item_penjualan            FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_full_access ON item_produksi             FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_full_access ON journal_entries           FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_full_access ON journal_entry_lines       FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_full_access ON kategori_barang           FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_full_access ON keuangan                  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_full_access ON kredensial                FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_full_access ON opsi_finishing            FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_full_access ON order_produksi            FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_full_access ON pelanggan                 FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_full_access ON pelunasan_hutang          FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_full_access ON pelunasan_piutang         FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_full_access ON pembelian                 FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_full_access ON penjualan                 FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_full_access ON piutang_penjualan         FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_full_access ON satuan_barang             FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_full_access ON spesifikasi_cepat_barang  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_full_access ON subkategori_barang        FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_full_access ON sync_conflicts            FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_full_access ON sync_mutation_registry    FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_full_access ON vendor                    FOR ALL TO anon USING (true) WITH CHECK (true);
