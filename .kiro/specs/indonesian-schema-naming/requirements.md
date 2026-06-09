# Requirements Document

## Introduction

This feature is a structured refactor of the gemiprintaio finance/print-shop application to finish an
earlier Indonesian-localization effort that left several English-named database objects behind. The
refactor has two goals:

1. **Primary — Rename English database tables (and their related indexes, FK references, type rows,
   service code, and tests) to Indonesian**, keeping the rename consistent across every storage
   backend and code surface (Supabase Postgres, standalone SQLite schema, the SQLite runtime migration
   runner, TypeScript services/types, and Jest tests). Existing data must be preserved.

2. **Secondary — Remove now-unused dead code and placeholder columns** rather than leaving them as
   stubs: two stray scope-creep lines in `createCashBookEntry`, and the dormant
   `bagi_hasil_slot_1/2/3` + `kasbon_slot_1/2/3` placeholder formula keys.

A cross-cutting UI consistency goal accompanies the `business_actors → pegawai` rename: all
user-facing "Pengurus" labels are normalized to "Pegawai" so the domain vocabulary matches the new
table name.

The refactor operates under hard project constraints: Supabase migrations already applied to cloud are
**immutable** (schema changes must go through new forward `ALTER TABLE ... RENAME` migrations, never
edits to historical migration files), edits must preserve existing line endings (the repo uses
`core.autocrlf=true`), and the project's standard verification gates must pass before completion.

## Glossary

- **System**: The gemiprintaio application as a whole across all three storage backends.
- **Rename_Migration**: A new forward Supabase migration file that performs `ALTER TABLE ... RENAME TO`
  (and related `ALTER INDEX`/constraint renames) to rename an object without data loss.
- **Supabase_Schema**: The consolidated declarative schema file `supabase/schema.sql`.
- **Supabase_Migrations**: The timestamped forward migration files under `supabase/migrations/*.sql`.
- **SQLite_Schema**: The fresh-install standalone schema template `database/sqlite-schema.sql`.
- **SQLite_Migration_Runner**: The runtime migration code `src/lib/db-sqlite-migrations.ts` that brings
  existing local SQLite installs up to date on application start.
- **SQLite_Table_Order**: The dependency-ordered table list in `src/lib/db-sqlite.ts` used for
  create/sync ordering (FK-safe).
- **Service_Layer**: TypeScript service modules under `src/lib/services/*` and supporting libs under
  `src/lib/*` that read/write the affected tables.
- **Type_Row**: A TypeScript interface representing a database row (e.g. `BusinessActorRow`,
  `RawBusinessActorRow`).
- **Test_Suite**: The Jest test files under `src/lib/__tests__/*` (and any other `*.test.ts(x)`).
- **Renamed_Object**: Any English-named table, index, or FK constraint targeted by this refactor.
- **Rename_Mapping**: The authoritative table of old-name → new-name pairs defined in Requirement 1.
- **Slot_Placeholder**: The dormant `bagi_hasil_slot_1/2/3` and `kasbon_slot_1/2/3` formula keys /
  source columns defined in `src/lib/profit-share-config.ts` and `src/lib/finance-slot-labels.ts`.
- **Pengurus_Label**: Any user-facing UI string, route segment, tab id, or component identifier that
  uses the word "Pengurus" to refer to a business actor.
- **EOL**: End-of-line byte sequence of a file (`CRLF` or `LF`).
- **Verification_Gates**: The mandatory checks — `npm run type-check`, `npm run build`, `npx jest`, and
  ESLint cleanliness on changed files.

## Rename Mapping (authoritative)

| Old name (English) | New name (Indonesian) | Kind | Disposition |
| --- | --- | --- | --- |
| `business_actors` | `pegawai` | table | rename |
| `actor_roles` | `peran_pegawai` | table | rename |
| `transaction_computed` | `transaksi_terhitung` | table | rename |
| `transaction_overrides` | `transaksi_penggantian` | table | rename |
| `cashbook_formula` | `rumus_buku_kas` | table | rename |
| `cashbook_partner` | — | table | **drop (legacy, superseded)** |
| `finance_participants` | — | table | **drop (legacy, superseded)** |
| `bagi_hasil_slot_1/2/3`, `kasbon_slot_1/2/3` | — | formula keys / source columns | **remove (dormant placeholders)** |

Index and constraint names that embed an old table name (e.g. `idx_business_actors_role`,
`idx_actor_roles_group`, `idx_cashbook_formula_key`, `idx_tc_*`, `idx_to_*`) are renamed to match the
new table names for consistency.

## Requirements

### Requirement 1: Authoritative rename mapping

**User Story:** As a maintainer, I want a single authoritative mapping of every English object to its
Indonesian replacement, so that the rename is applied consistently across all surfaces.

#### Acceptance Criteria

1. THE System SHALL rename `business_actors` to `pegawai`.
2. THE System SHALL rename `actor_roles` to `peran_pegawai`.
3. THE System SHALL rename `transaction_computed` to `transaksi_terhitung`.
4. THE System SHALL rename `transaction_overrides` to `transaksi_penggantian`.
5. THE System SHALL rename `cashbook_formula` to `rumus_buku_kas`.
6. THE System SHALL remove the legacy table `cashbook_partner`.
7. THE System SHALL remove the legacy table `finance_participants`.
8. WHERE an index or constraint name embeds a Renamed_Object name, THE System SHALL rename that index
   or constraint to use the corresponding Indonesian name from the Rename_Mapping.
9. THE System SHALL leave indexes and constraints that do not embed a Renamed_Object name unchanged.
10. THE System SHALL apply the Rename_Mapping identically across Supabase_Schema, Supabase_Migrations,
   SQLite_Schema, SQLite_Migration_Runner, SQLite_Table_Order, Service_Layer, Type_Row definitions, and
   the Test_Suite.

### Requirement 2: Supabase forward migration (immutability-safe)

**User Story:** As a maintainer, I want the Supabase rename delivered through new forward migrations, so
that already-applied cloud migrations stay immutable and no historical migration file is edited.

#### Acceptance Criteria

1. THE System SHALL implement the Postgres rename in one or more new Rename_Migration files with a
   timestamp later than every existing file in Supabase_Migrations.
2. THE System SHALL NOT modify any Supabase_Migrations file that has already been applied to cloud.
   Migration files that have not yet been applied to cloud MAY be modified.
3. THE Rename_Migration SHALL use `ALTER TABLE <old> RENAME TO <new>` for each renamed table so that
   existing rows are preserved.
4. WHERE a renamed table has dependent indexes or constraints, THE Rename_Migration SHALL rename them
   using guarded statements (for example `IF EXISTS` checks) so that the migration succeeds whether or
   not the object is present.
5. THE Rename_Migration SHALL drop `cashbook_partner` and `finance_participants` only after confirming
   no foreign-key dependency from a retained table references them.
6. WHEN the Rename_Migration is applied to a database that has already been renamed, THE
   Rename_Migration SHALL complete without error (idempotent / guarded execution).

### Requirement 3: Supabase consolidated schema consistency

**User Story:** As a maintainer, I want `supabase/schema.sql` to reflect the Indonesian names, so that a
fresh provision from the consolidated schema matches the migrated cloud state.

#### Acceptance Criteria

1. THE System SHALL update Supabase_Schema so that every `CREATE TABLE`, `CREATE INDEX`, FK
   `REFERENCES`, and RLS policy statement uses the Indonesian name from the Rename_Mapping.
2. THE System SHALL remove the `CREATE TABLE` and related statements for `cashbook_partner` and
   `finance_participants` from Supabase_Schema.
3. THE System SHALL update every FK in Supabase_Schema that references a renamed table (for example
   `komponen_kompensasi.actor_id`, `proses_gaji`/`hasil_gaji.actor_id`, `pinjaman_karyawan.actor_id`,
   and `rumus_buku_kas.actor_id`) to reference the new table name.

### Requirement 4: SQLite fresh-install schema consistency

**User Story:** As a maintainer, I want `database/sqlite-schema.sql` to use the Indonesian names, so
that a fresh local/desktop install creates correctly named tables.

#### Acceptance Criteria

1. THE System SHALL update SQLite_Schema so that every `CREATE TABLE`, `CREATE INDEX`, and FK
   `REFERENCES` statement uses the Indonesian name from the Rename_Mapping.
2. THE System SHALL remove the definitions for `cashbook_partner` and `finance_participants` from
   SQLite_Schema.

### Requirement 5: SQLite runtime migration of existing installs

**User Story:** As an existing desktop/SQLite user, I want my local database renamed on application
start, so that my existing data continues to work after the update without manual intervention.

#### Acceptance Criteria

1. WHEN the SQLite_Migration_Runner executes against a local database containing an old-named table,
   THE SQLite_Migration_Runner SHALL rename that table to its Indonesian name while preserving all
   existing rows.
2. IF a local database already contains the Indonesian-named table, THEN THE SQLite_Migration_Runner
   SHALL skip the rename for that table without raising an error.
3. WHEN the SQLite_Migration_Runner renames a table that has dependent indexes, THE
   SQLite_Migration_Runner SHALL recreate those indexes under the Indonesian names.
4. THE System SHALL update SQLite_Table_Order in `src/lib/db-sqlite.ts` to list the Indonesian table
   names in an order that satisfies foreign-key dependencies (`peran_pegawai` before `pegawai`).
5. WHEN the SQLite_Migration_Runner completes against a fresh install created from the updated
   SQLite_Schema, THE SQLite_Migration_Runner SHALL make no further rename changes.

### Requirement 6: Service-layer and type consistency

**User Story:** As a developer, I want all TypeScript services and types to reference the Indonesian
table names, so that the application reads and writes the renamed tables correctly.

#### Acceptance Criteria

1. THE System SHALL update every Service_Layer call that names a renamed table — including
   `db.query`/`db.queryOne`/`db.insert`/`db.update`/`db.delete` calls and Supabase `.from("...")`
   calls — to use the Indonesian name from the Rename_Mapping.
2. THE System SHALL update Type_Row interface names and their usages so that they describe the renamed
   entities consistently (for example a row type for `pegawai`).
3. THE System SHALL update any `tableExists` / runtime table-presence checks that reference a renamed
   table to use the Indonesian name.
4. IF a Supabase query targets a renamed table and the table does not exist on a given backend, THEN
   THE Service_Layer SHALL preserve its existing graceful-degradation behavior (the existing
   "does not exist" handling) using the new table name.

### Requirement 7: Test-suite consistency

**User Story:** As a developer, I want all tests to reference the Indonesian table names, so that the
Test_Suite continues to validate behavior after the rename.

#### Acceptance Criteria

1. THE System SHALL update every Test_Suite reference to a renamed table (for example
   `mockTable("business_actors")`) to use the Indonesian name from the Rename_Mapping.
2. WHEN the Test_Suite runs after the rename, THE Test_Suite SHALL pass with no failures attributable
   to table naming.

### Requirement 8: Data preservation

**User Story:** As the business owner, I want all existing finance data preserved through the rename, so
that no records are lost.

#### Acceptance Criteria

1. WHEN a renamed table contains rows before the rename, THE System SHALL retain those rows unchanged
   after the rename, except for objects explicitly scheduled for removal in the Rename_Mapping.
2. THE System SHALL perform table renames via `RENAME`-style operations rather than drop-and-recreate
   for any table that is retained.
3. WHERE the storage engine cannot perform an atomic rename or a complex schema change requires it,
   THE System SHALL use a drop-and-recreate approach that copies all existing rows into the
   recreated table so that no data is lost.
4. IF a table scheduled for removal (`cashbook_partner`, `finance_participants`) contains rows, THEN
   THE System SHALL confirm with the maintainer before dropping it.

### Requirement 9: Dead-code removal in createCashBookEntry

**User Story:** As a maintainer, I want the two stray scope-creep lines removed from
`createCashBookEntry`, so that the function returns to its intended minimal behavior.

#### Acceptance Criteria

1. THE System SHALL remove the `reference_type` assignment line from the entry object in
   `createCashBookEntry` (`src/lib/services/finance-service.ts`).
2. THE System SHALL remove the `reference_id` assignment line from the entry object in
   `createCashBookEntry`.
3. WHEN `createCashBookEntry` is invoked after removal, THE System SHALL insert a `keuangan` entry that
   matches the function's pre-scope-creep behavior.
4. IF the `keuangan` table or other code paths require `reference_type`/`reference_id` to be set, THEN
   THE System SHALL allow `keuangan` entry creation to fail rather than substitute placeholder values,
   and SHALL confirm no remaining reader depends on `createCashBookEntry` setting those fields before
   removal.

### Requirement 10: Slot-placeholder removal

**User Story:** As a maintainer, I want the dormant slot placeholder columns/formula keys removed, so
that unused stubs no longer clutter the schema and config.

#### Acceptance Criteria

1. THE System SHALL remove the `bagi_hasil_slot_1`, `bagi_hasil_slot_2`, and `bagi_hasil_slot_3`
   definitions from `src/lib/profit-share-config.ts`.
2. THE System SHALL remove the `kasbon_slot_1`, `kasbon_slot_2`, and `kasbon_slot_3` definitions from
   `src/lib/profit-share-config.ts`.
3. THE System SHALL remove the corresponding Slot_Placeholder label entries from
   `src/lib/finance-slot-labels.ts`.
4. THE System SHALL update or remove any code that consumes the removed Slot_Placeholder definitions so
   that the application compiles and behaves correctly.
5. WHERE removing a Slot_Placeholder would alter a backend schema object that is already applied to
   cloud, THE System SHALL handle the change through a new forward migration rather than editing an
   applied migration.

### Requirement 11: UI label normalization (Pengurus → Pegawai)

**User Story:** As the business owner, I want every user-facing "Pengurus" label changed to "Pegawai",
so that the UI vocabulary is consistent with the renamed `pegawai` table.

#### Acceptance Criteria

1. THE System SHALL replace user-facing occurrences of the word "Pengurus" with "Pegawai" in
   application UI strings (page text, tab labels, button titles, ARIA labels, and notifications),
   and SHALL NOT alter occurrences inside already-applied Supabase_Migrations comments.
2. THE System SHALL keep the meaning and surrounding sentence structure intact when replacing
   Pengurus_Label text.
3. WHERE a Pengurus_Label is also used as a route segment, tab identifier, or component name, THE
   System SHALL decide per item whether to rename the identifier or keep it, and SHALL preserve any
   existing redirect/bookmark compatibility for renamed routes.
4. THE System SHALL leave occurrences of "pengurus" inside already-applied Supabase_Migrations comments
   unchanged (those files are immutable).

### Requirement 12: Line-ending (EOL) preservation

**User Story:** As a maintainer, I want edits to preserve each file's existing line endings, so that
diffs stay small and free of EOL churn under `core.autocrlf=true`.

#### Acceptance Criteria

1. WHEN the System edits an existing file, THE System SHALL preserve that file's existing EOL sequence.
2. THE System SHALL NOT introduce EOL-only changes to lines that are otherwise unmodified.
3. WHEN the System creates a new file, THE System SHALL use the most common EOL sequence among sibling
   files of the same type in the same directory, and SHALL fall back to `LF` when there is a tie.

### Requirement 13: Verification gates

**User Story:** As a maintainer, I want the standard verification gates to pass before the refactor is
considered done, so that the rename introduces no regressions.

#### Acceptance Criteria

1. WHEN the refactor is complete, THE System SHALL produce zero errors from `npm run type-check`.
2. WHEN the refactor is complete, THE System SHALL produce a successful `npm run build`.
3. WHEN the refactor is complete, THE System SHALL produce a passing `npx jest` run with no failures.
4. THE System SHALL produce no new ESLint warnings or errors on files changed by this refactor.
5. IF any Verification_Gate fails, THEN THE System SHALL resolve the failure before declaring the
   refactor complete.
