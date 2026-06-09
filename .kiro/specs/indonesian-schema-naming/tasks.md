# Implementation Plan: Indonesian Schema Naming

## Overview

This plan implements a coordinated, data-preserving rename of five English-named database objects to
Indonesian, removes two superseded legacy tables (`cashbook_partner`, `finance_participants`) and the
dormant slot placeholders, removes two scope-creep lines in `createCashBookEntry`, and normalizes
user-facing "Pengurus" labels to "Pegawai".

The work is sequenced backend-first so later surfaces build on the names established earlier:
authoritative mapping reference → Supabase forward migration → consolidated/standalone schemas →
SQLite runtime runner + table order → service layer + types → dead-code/slot removal → UI labels →
tests → final verification gates. Each task preserves existing EOL sequences (Requirement 12) and
performs renames via `RENAME`-style operations to preserve data (Requirement 8).

Per the design's Testing Strategy, property-based testing does not apply (this is an IaC/identifier
rename refactor with no universal "for all inputs" properties), so the plan uses targeted
example/integration checks and the existing Jest suite only — no property-test tasks.

## Tasks

- [x] 1. Establish the rename reference and audit current usages
  - Re-read the authoritative Rename_Mapping and index/constraint derivation tables in `design.md` and
    keep them as the single source of truth for every later task.
  - Run a repository-wide search for each old name (`business_actors`, `actor_roles`,
    `transaction_computed`, `transaction_overrides`, `cashbook_formula`, `cashbook_partner`,
    `finance_participants`) and the index/constraint names, recording every file and line that must
    change (separating immutable applied-migration history from editable surfaces).
  - Confirm the latest existing migration timestamp (`20260610000000_drop_legacy_person_columns.sql`)
    so the new forward migration name sorts last.
  - Verify the EOL convention of `supabase/migrations/*.sql` siblings to choose the new file's EOL.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 12.3_

- [x] 2. Create the Supabase forward rename migration
  - [x] 2.1 Author guarded table + index + constraint renames
    - Create `supabase/migrations/20260611000000_rename_english_tables_to_indonesian.sql`.
    - For each of the five tables, wrap `ALTER TABLE <old> RENAME TO <new>` in a `DO $$ ... $$`
      existence guard (old exists AND new does not exist) so it is idempotent.
    - Rename dependent indexes via `ALTER INDEX IF EXISTS <old> RENAME TO <new>` and constraints via
      guarded `ALTER TABLE ... RENAME CONSTRAINT`, using the design's index/constraint derivation table.
    - Do NOT edit any already-applied historical migration file.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6, 1.8, 12.1_
  - [x] 2.2 Resolve the `finance_participants` FK and drop legacy tables safely
    - Drop the `finance_metric_mappings_participant_id_fkey` constraint with a guarded statement
      before dropping `finance_participants` (retain the `participant_id` column).
    - Add a row-count guard (`SELECT COUNT(*)` with a `RAISE EXCEPTION` / clearly-commented manual
      confirmation gate) before `DROP TABLE IF EXISTS cashbook_partner` and
      `DROP TABLE IF EXISTS finance_participants`, so a non-empty table is never dropped silently.
    - _Requirements: 2.5, 1.6, 1.7, 8.4_
  - [x] 2.3 Verify migration idempotency
    - Apply the forward migration twice against a local Postgres/Supabase instance and assert the
      second run completes without error and the data is unchanged.
    - _Requirements: 2.6, 8.1, 8.2_

- [x] 3. Update the Supabase consolidated schema (`supabase/schema.sql`)
  - Rename every `CREATE TABLE`, `CREATE INDEX`, FK `REFERENCES`, and RLS policy statement for the five
    renamed tables to the Indonesian names.
  - Remove the `CREATE TABLE`/index/RLS statements for `cashbook_partner` and `finance_participants`,
    and drop the `FOREIGN KEY (participant_id) REFERENCES finance_participants` clause from
    `finance_metric_mappings`.
  - Update FKs that reference renamed tables (`komponen_kompensasi.actor_id`,
    `proses_gaji`/`slip_gaji.actor_id`, `pinjaman_karyawan.actor_id`, `rumus_buku_kas.actor_id`) to the
    new table name.
  - Preserve the file's existing EOL sequence and avoid EOL-only diffs.
  - _Requirements: 3.1, 3.2, 3.3, 1.8, 12.1, 12.2_

- [x] 4. Update the SQLite fresh-install schema (`database/sqlite-schema.sql`)
  - Rename every `CREATE TABLE`, `CREATE INDEX`, and FK `REFERENCES` statement for the five renamed
    tables to the Indonesian names.
  - Remove the `cashbook_partner` and `finance_participants` definitions and update/remove the
    `finance_metric_mappings.participant_id` FK accordingly.
  - Preserve the file's existing EOL sequence and avoid EOL-only diffs.
  - _Requirements: 4.1, 4.2, 1.8, 12.1, 12.2_

- [x] 5. Checkpoint - schema surfaces consistent
  - Ensure all tests pass, ask the user if questions arise. Confirm the non-empty-table drop decision
    for `cashbook_partner`/`finance_participants` with the maintainer before proceeding.

- [x] 6. Implement the SQLite runtime migration runner
  - [x] 6.1 Add `migrateEnglishTablesToIndonesian(db)`
    - Implement a new exported function in `src/lib/db-sqlite-migrations.ts` that, per mapping pair,
      skips when the new table exists (already migrated) or the old table is absent (fresh install),
      otherwise renames inside a transaction with `foreign_keys = OFF`, drops old-named indexes, and
      recreates Indonesian-named indexes, with `ROLLBACK` on exception.
    - Invoke it from `ensureServerSQLiteSyncV2Schema` BEFORE the existing `ensure*`/`migrate*` helpers
      run, so subsequent bootstrap statements operate on the renamed tables.
    - _Requirements: 5.1, 5.2, 5.3, 5.5, 8.1, 8.2, 8.3_
  - [x] 6.2 Rename bootstrap blocks and remove legacy create/seed code
    - Update the `CREATE TABLE IF NOT EXISTS` bootstrap blocks for the five tables to Indonesian names.
    - Remove the `cashbook_partner`/`finance_participants` create + seed/delete statements (including
      the `DELETE FROM cashbook_partner` cleanup and `finance_participants` backfills).
    - Update `migrateCashbookFormulaDbColumnNullable` to target `rumus_buku_kas` (table name, index
      names, `_v2` temp-table flow, and its `sqlite_master` guard query).
    - _Requirements: 5.1, 1.6, 1.7, 1.10_
  - [x] 6.3 Write an integration test for the SQLite rename behavior
    - Seed a temporary SQLite DB with an old-named table and sample rows, run
      `ensureServerSQLiteSyncV2Schema`, and assert the Indonesian table exists, the old name is gone,
      all rows are present, and Indonesian-named indexes exist; assert a second run is a no-op.
    - _Requirements: 5.1, 5.2, 5.3, 5.5, 8.1_

- [ ] 7. Update the SQLite FK-ordered table list (`src/lib/db-sqlite.ts`)
  - Update `SYNC_V2_TABLES`: replace `actor_roles`→`peran_pegawai` and `business_actors`→`pegawai`,
    remove `finance_participants`, keeping `peran_pegawai` before `pegawai` for FK safety.
  - Confirm the `db-unified.ts` pull loop over `SYNC_V2_TABLES` needs no further change.
  - _Requirements: 5.4, 1.10_

- [ ] 8. Update the service layer and Type_Row definitions
  - [ ] 8.1 Substitute table-name literals in raw-SQL/db calls
    - Update `db.query`/`db.queryOne`/`db.insert`/`db.update`/`db.delete` first-argument literals and
      raw SQL across the affected services (`transaction-computed-service.ts`, `finance-service.ts`,
      `cashbook-formula-service.ts`, `finance-config-service.ts`, and others) to the Indonesian names.
    - Update any `tableExists`/runtime presence checks that reference a renamed table.
    - _Requirements: 6.1, 6.3, 1.10_
  - [ ] 8.2 Update Supabase `.from("...")` calls and preserve graceful degradation
    - Update every `.from("...")` reference to a renamed table to the Indonesian name.
    - Keep the existing `"does not exist"`/`"schema cache"` graceful-degradation handling, keyed on the
      new table names.
    - _Requirements: 6.1, 6.4_
  - [ ] 8.3 Rename Type_Row interfaces and all usages
    - Rename `BusinessActorRow` → `PegawaiRow`, `RawBusinessActorRow` → `RawPegawaiRow`, and the
      role row types as applicable, updating all usages consistently via symbol rename.
    - _Requirements: 6.2_
  - [ ] 8.4 Handle service code that reads/writes `finance_participants`
    - Update or remove the `finance_participants` reads/writes in `finance-config-service.ts` and
      `cashbook-config-sync.ts` so the code compiles and behaves correctly after the table is dropped.
    - _Requirements: 6.1, 1.7_

- [ ] 9. Remove dead code in `createCashBookEntry`
  - Confirm via a search of readers that nothing depends on `createCashBookEntry` populating
    `reference_type`/`reference_id`; if the `keuangan` insert requires them, allow the function to fail
    rather than substitute placeholder values.
  - Remove the `reference_type` and `reference_id` assignment lines from the `entry` object in
    `src/lib/services/finance-service.ts`.
  - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [ ] 10. Remove dormant slot placeholders
  - [ ] 10.1 Remove slot definitions and labels
    - Remove the `bagi_hasil_slot_1/2/3` and `kasbon_slot_1/2/3` entries from `PROFIT_SHARE_SLOTS` in
      `src/lib/profit-share-config.ts` and the corresponding entries from `FINANCE_SLOT_LABELS` in
      `src/lib/finance-slot-labels.ts`.
    - _Requirements: 10.1, 10.2, 10.3, 10.5_
  - [ ] 10.2 Update consumers of the removed slot definitions
    - Update `slotForSourceColumn`, `defaultProfitSharePartners`, `findAvailableProfitShareSlot`,
      `findOrphanProfitShareSlot`, and `resolveProfitShareSlotForNewPartner` so they compile and behave
      correctly with an empty/real slot set.
    - _Requirements: 10.4_

- [ ] 11. Normalize UI labels (Pengurus → Pegawai)
  - Replace user-facing "Pengurus" occurrences (page text, tab labels, button `title`s, `aria-label`s,
    notifications) across `src/app/**` and `src/components/**` with "Pegawai", preserving sentence
    structure and meaning.
  - Apply the per-item identifier decisions from the design: keep the `PengaturanTab` `"pengurus"`
    value/state, the `TabPengurus` component name, and the `kelola-pengurus` redirect route, changing
    only their visible labels; update `DynamicActorSummary` heading/counts/hints text.
  - Leave "pengurus"/`business_actors` occurrences inside already-applied Supabase migration comments
    unchanged.
  - _Requirements: 11.1, 11.2, 11.3, 11.4_

- [ ] 12. Update the test suite to the Indonesian names
  - Update `mockTable("business_actors")` → `mockTable("pegawai")` in
    `pinjaman-karyawan-service.test.ts` and `penggajian-service.test.ts`, the `UPDATE cashbook_formula`
    regex → `rumus_buku_kas` in `return-finance.test.ts`, and any other renamed-table references in
    `*.test.ts(x)`.
  - _Requirements: 7.1, 7.2_

- [ ] 13. Final verification and mapping-consistency check
  - Run a repository-wide search for every old name and confirm matches remain ONLY inside
    already-applied Supabase migration files (never in `schema.sql`, `database/sqlite-schema.sql`,
    `src/**`, or test files).
  - Run `npm run type-check` (zero errors), `npm run build` (success), and `npx jest` (all pass), and
    confirm no new ESLint warnings/errors on changed files; resolve any failure before completion.
  - _Requirements: 1.10, 3.1, 4.1, 6.1, 7.2, 13.1, 13.2, 13.3, 13.4, 13.5_

## Notes

- Tasks marked with `*` are optional verification tasks and can be skipped for a faster path, though
  they strengthen confidence in the data-preserving rename.
- Each task references specific granular requirements for traceability.
- Property-based tests are intentionally omitted: the design's Testing Strategy establishes that this
  identifier/IaC rename refactor has no universal correctness properties; verification relies on the
  existing Jest suite plus the standard gates.
- The Supabase migration is the only new file; all other tasks edit existing files and MUST preserve
  each file's existing EOL sequence (Requirement 12).
- Tasks 5's checkpoint surfaces the non-empty-table drop confirmation (Requirement 8.4) to the
  maintainer before any destructive drop is executed.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2.1", "3", "4", "7"] },
    { "id": 2, "tasks": ["2.2", "6.1"] },
    { "id": 3, "tasks": ["2.3", "6.2"] },
    { "id": 4, "tasks": ["6.3", "8.1", "8.3", "9", "10.1", "11"] },
    { "id": 5, "tasks": ["8.2", "8.4", "10.2", "12"] },
    { "id": 6, "tasks": ["13"] }
  ]
}
```
