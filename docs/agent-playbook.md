# Agent Playbook — gemiprint

This playbook captures **specific patterns** of this codebase that an AI agent must follow. It complements [`.cursorrules`](../.cursorrules) which has the iron rules summary.

The owner is **non-technical**. He asks for outcomes ("add auto-PO", "add stock opname page") and trusts the agent to fill in technical details. The patterns below are the ones the owner has implicitly come to expect — they were learned by trial and error and **must not be forgotten** on subsequent features.

---

## Table of contents

1. [Architecture overview](#architecture-overview)
2. [Caching pattern (SWR via useCachedData)](#caching-pattern)
3. [Database change pattern (3-way sync)](#database-change-pattern)
4. [Inventory ledger model](#inventory-ledger-model)
5. [Roll inventory model (dimensional materials)](#roll-inventory-model)
6. [Money flow & cashbook traceability](#money-flow)
7. [Auth guards on server actions](#auth-guards)
8. [Modal UX consistency](#modal-ux)
9. [Period-closed guard](#period-closed-guard)
10. [Sync columns & sync-config](#sync-columns)
11. [Idempotent ledger IDs](#idempotent-ledger-ids)
12. [Verification before done](#verification)
13. [Default reasoning when ambiguous](#default-reasoning)

---

## Architecture overview

The app runs on three storage backends from the same Next.js code:

- **Web** at `app.gemiprint.com` runs against Supabase Postgres directly.
- **Tauri desktop** runs against local SQLite via `better-sqlite3`, with optional sync to Supabase.
- **Flutter mobile** uses the Next.js API only.

The unified data layer is [src/lib/db-unified.ts](../src/lib/db-unified.ts). Use `db.query`, `db.queryOne`, `db.insert`, `db.update`, `db.delete`, and `db.transaction`. **Do not import the Supabase or SQLite client directly from feature code.**

Schemas exist in three places that must stay in sync:

- [supabase/migrations/](../supabase/migrations/) — append-only history applied to cloud Postgres.
- [database/sqlite-schema.sql](../database/sqlite-schema.sql) — fresh-install template for local SQLite.
- [src/lib/db-unified.ts](../src/lib/db-unified.ts) — runtime `ALTER TABLE` checks for existing local SQLite installs.

---

## Caching pattern

**Iron rule: every page that fetches data must use `useCachedData`, never `useAsyncData`.**

`useAsyncData` (in [src/hooks/use-async-data.ts](../src/hooks/use-async-data.ts)) fetches every mount with no cache. It exists for legacy and one-off cases.

`useCachedData` (in [src/lib/use-cached-data.ts](../src/lib/use-cached-data.ts)) wraps SWR. It paints from cache instantly, revalidates in the background, and persists to localStorage via the SWR provider.

Reference implementations: [src/app/materials/page.tsx](../src/app/materials/page.tsx), [src/app/vendors/page.tsx](../src/app/vendors/page.tsx), [src/app/customers/page.tsx](../src/app/customers/page.tsx).

Standard shape:

```ts
const { data: rawData, isLoading, mutate } = useCachedData<any>(
  "stable-cache-key",
  getInitDataAction
);
const data = rawData ?? initial;
const loading = isLoading && !rawData;
const reload = async () => { await mutate(); };
```

Cache key rules:
- Stable strings, globally unique per logical dataset.
- Filter-dependent data needs filters in the key: `` `movement-ledger:${JSON.stringify(filters)}` ``.
- Use `useInvalidate("key")` from `useCachedData` to bust cache after mutations from another page.

After mutation: `await mutate()` revalidates. For optimistic updates, pass new data to `mutate(newData, { revalidate: false })`.

---

## Database change pattern

Adding a column or table requires changes in **three places**:

### 1. Postgres migration

Create `supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql`. Use `IF NOT EXISTS` and provide defaults so existing rows stay valid:

```sql
ALTER TABLE item_pembelian
  ADD COLUMN IF NOT EXISTS jumlah_roll INTEGER NOT NULL DEFAULT 1
  CHECK(jumlah_roll >= 1);
```

**Migrations already applied to the cloud are immutable.** If a behavior change is needed, write a new migration with a newer timestamp. Editing an old migration file is a no-op on the cloud and creates skew.

### 2. SQLite schema template

Mirror the change in [database/sqlite-schema.sql](../database/sqlite-schema.sql). This is for fresh installs.

### 3. SQLite runtime migration

Add an `ALTER TABLE` block in [src/lib/db-unified.ts](../src/lib/db-unified.ts) under the `runMigrations` flow:

```ts
if (!ipCols.includes("jumlah_roll")) {
  db.exec(
    `ALTER TABLE item_pembelian ADD COLUMN jumlah_roll INTEGER NOT NULL DEFAULT 1`
  );
}
```

This handles existing local SQLite databases on Tauri installs that already have the table.

### Cloud sync

After writing migrations locally:

```bash
npx supabase migration list   # see what is missing on remote
npm run supabase:db:push      # apply
```

The CLI authenticates via `supabase/.temp/linked-project.json` (set by `npm run supabase:link`). It does not read `.env.local`.

---

## Inventory ledger model

`barang.jumlah_stok` and `barang.average_cost_per_base_unit` are **derived** from `inventory_movements`. They are caches.

**Iron rule: never write to `barang.jumlah_stok` directly.** Always go through [postInventoryMovement](../src/lib/services/inventory-service.ts) which:

- Validates that stock will not go negative.
- Computes new AVCO using the moving-average formula.
- Writes the movement row first, then updates `barang` cache columns.
- Updates `harga_barang_satuan.harga_beli` so unit prices stay aligned with cost.
- For roll variants, also updates `barang_roll_variants.panjang_tersedia_m` via `linear_delta_m`.

Movement types:

- `OPENING_BALANCE` — only at first install.
- `PURCHASE_RECEIPT` — adds stock at vendor cost.
- `SALE_ISSUE` — subtracts stock at AVCO; does not revalue.
- `SALE_VOID` / `SALE_RETURN` — reverses a `SALE_ISSUE` at original cost.
- `PURCHASE_VOID` / `PURCHASE_RETURN` — reverses a `PURCHASE_RECEIPT`; throws friendly error if stock already consumed.
- `ADJUSTMENT` — manual stock correction; revalues AVCO.
- `WASTE` / `PRODUCTION_WASTE` — subtracts at AVCO; does not revalue.
- `ROLL_CONVERSION_OUT` / `ROLL_CONVERSION_IN` — paired entries when one roll width is cut into multiple widths. Cost is preserved (neutral).
- `PRODUCTION_ISSUE` — material consumed by production line.

**Idempotent IDs** — derive from the source line so retries don't duplicate:

- `mov-${itemId}` for purchase receipt items.
- `void-${original.id}` for void reversals.
- `${conversionId}-out` / `${conversionId}-in-${i}` for conversions.

To rebuild stock from the ledger (after manual SQL fixes or recovery): call `rebuildInventoryBalance(barangId)`.

---

## Roll inventory model

Materials with `butuh_dimensi_status = 1` (Flexi, Banner, etc.) sell by area but stock physically as rolls of fixed width × variable length.

### Data model

- `barang.jumlah_stok` is total m² across all rolls (kept in sync but not authoritative).
- `barang_roll_variants` rows hold `(barang_id, lebar_m, panjang_tersedia_m, average_cost_per_m2)` per width. The same `barang_id` can have multiple rows, one per physical width.
- `inventory_movements.roll_variant_id`, `roll_width_m`, and `linear_delta_m` link area movements to specific rolls.

### Purchase form input convention

Order matters: **Lebar × Panjang** (printing convention). A purchase line carries:

- `jumlah_roll` (qty of rolls with same dimensions, default 1)
- `lebar` (roll width m)
- `panjang` (length per roll m)
- `jumlah` = `jumlah_roll × panjang × lebar` (m², derived)

`linear_delta_m` posted to ledger = `jumlah_roll × panjang`. Width is fixed for the variant.

### Roll cutting (split_batches)

A purchase line can carry `split_batches: { roll_count, targets[] }[]`. Each batch represents N rolls cut with the same pattern. After receipt, the service loops batches and calls `convertRollVariant` per batch. Roll counts must sum to `≤ jumlah_roll`; the rest stay uncut.

`convertRollVariant` is **value-neutral**: it posts `ROLL_CONVERSION_OUT` (negative area) and one or more `ROLL_CONVERSION_IN` (positive area), both at the source's AVCO. Total area, total cost, and `barang.jumlah_stok` do not change.

### Cutting after the fact

Outside of purchase, roll cutting happens from the materials page (emerald scissors button on dimensional items). UI is multi-pattern, same shape as the purchase form modal.

### Sale-side (POS)

POS prints on a roll. The cost basis follows roll variant AVCO, not the order dimensions. Billing dimensions can be rounded to a "billable" size — see [src/lib/roll-size-utils.ts](../src/lib/roll-size-utils.ts).

---

## Money flow

Every cashbook entry in `keuangan` that originates from a transaction must carry a `[REF:<id>]` token in `keperluan`. Void/revert paths search by this token to find paired entries.

```ts
const keperluan = `Pembelian ${nomorFaktur} - ${vendorName} [REF:${purchaseId}]`;
```

Hutang/piutang updates flow through dedicated services (`payDebt`, `revertDebtPayment`) which keep `keuangan.kredit/debit`, `hutang.sisa_hutang`, and `pembelian.jumlah_dibayar` in lock-step. **Do not update these tables piecemeal.**

CASH purchases create the `keuangan` entry immediately. NET30/COD purchases create a `hutang` row and only post to `keuangan` when paid.

---

## Auth guards

Server actions that mutate must be wrapped:

```ts
import { requireAdminOrManager } from "@/lib/auth-guard-server";

export async function someMutationAction(input: Foo) {
  const session = await requireAdminOrManager();
  return doMutation({ ...input, dibuat_oleh: session.uid });
}
```

Available guards in [src/lib/auth-guard-server.ts](../src/lib/auth-guard-server.ts):

- `requireSession()` — any logged-in user.
- `requireAdminOrManager()` — admin or manager role.
- `requireProductionInventoryRole()` — admin, manager, production, or warehouse staff.
- `requireAdminManagerOrSelf(userId)` — for "user can act on themselves" cases.

Read actions can be ungated. Always pass `session.uid` as `dibuat_oleh` so the audit trail is populated.

---

## Modal UX

Every modal in the app must support:

1. **ESC key** closes — registered in a `useEffect` keydown handler.
2. **Backdrop click** closes — `onClick` on the backdrop with `if (e.target === e.currentTarget)` guard.
3. **X button** in the header.
4. **Primary action** is the rightmost button in the footer with brand color.
5. **Cancel** is to the left of primary, neutral color.
6. **Disabled state** during async ops with text like "Menyimpan...".

Theme colors signal domain:

- **Emerald** — material/inventory/barang scope (e.g. roll conversion from materials page).
- **Purple** — purchase-transaction scope (e.g. roll split during receipt).
- **Indigo** — generic neutral / default actions.
- **Amber** — warnings, manual buckets, vendor-less items.
- **Rose** — destructive (waste, delete, hard removes).

Reference: [src/app/materials/page.tsx](../src/app/materials/page.tsx) (emerald roll modal), [src/components/PurchaseForm.tsx](../src/components/PurchaseForm.tsx) (purple split modal).

---

## Period-closed guard

Mutations that accept a `tanggal` field must respect closed accounting periods. `postInventoryMovement` already calls `isDateInClosedPeriod(tanggal)` and throws a friendly error.

When writing new mutation flows that have a date input, mirror the same check. Do not silently bypass — the user must see "Tanggal X jatuh di periode yang sudah ditutup" and be redirected to use a reversing entry in the current period.

---

## Sync columns

Every table that participates in offline/sync (which is almost all of them) needs:

```sql
sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
last_synced_at TIMESTAMPTZ,
sync_version INTEGER DEFAULT 1,
updated_at_server TIMESTAMPTZ,
updated_by_device TEXT DEFAULT 'server',
change_version INTEGER DEFAULT 1,
is_deleted INTEGER NOT NULL DEFAULT 0,
deleted_at TIMESTAMPTZ,
client_mutation_id TEXT
```

Pattern visible on every table in [supabase/schema.sql](../supabase/schema.sql).

Also register the table name in [src/lib/sync-config.ts](../src/lib/sync-config.ts) so the sync engine knows about it.

---

## Idempotent ledger IDs

Inventory movements that are tied to a source document use predictable IDs:

| Operation | ID format |
|---|---|
| Purchase receipt item | `mov-${purchaseItemId}` |
| Purchase void/return | `void-${originalMovementId}` or `ret-${itemId}-${Date.now()}` |
| Roll conversion out | `${conversionId}-out` |
| Roll conversion in (per target) | `${conversionId}-in-${i}` |
| Sale issue | `mov-${saleItemId}` |
| Sale void/return | `void-${originalMovementId}` |
| Adjustment / Waste | `generateId()` (no source line) |

This makes void/revert lookups deterministic (`SELECT WHERE id = 'mov-...'`) and prevents duplicates if a transaction is retried.

When adding a new movement-producing flow, follow the same convention.

---

## Verification

Before declaring a feature done, in this order:

1. `npm run type-check` — must pass with zero errors.
2. `npm run build` — must complete. Pre-existing lint warnings (e.g. `react-hooks/exhaustive-deps` from before your change) are not blockers.
3. `npx jest <relevant test files>` — at minimum, run tests whose subject area you touched. Most service-level changes have tests in [src/lib/__tests__/](../src/lib/__tests__/).

If any of these fail because of your change, fix before declaring done. The owner explicitly expects this loop on every task — see `.cursorrules` "Verification before done".

For UI-only changes that don't touch services, skipping jest is acceptable, but type-check + build still required.

---

## Default reasoning

The owner is non-technical and trusts agent judgment. When facing an ambiguous detail:

- Pick the option that **matches existing patterns** in the codebase (search first, then decide).
- Pick the option that **minimizes new infrastructure** — small internal app, avoid new abstractions without clear benefit.
- Pick the option that **errs on user safety** for destructive ops (confirm dialog, descriptive error message).
- Pick the option that **respects existing column/table semantics** rather than introducing parallel concepts.

Document non-obvious choices in the final summary so the owner can reverse them if needed.

**Block only if** the choice meaningfully affects: money flow, access control, schema migration on already-deployed cloud, or business rules the owner has expressed strong preferences about.

---

## Quick reference: file map by concern

| Concern | File |
|---|---|
| Database access (all backends) | [src/lib/db-unified.ts](../src/lib/db-unified.ts) |
| Stock movements | [src/lib/services/inventory-service.ts](../src/lib/services/inventory-service.ts) |
| Roll conversion | `convertRollVariant` in inventory-service |
| Auth guards | [src/lib/auth-guard-server.ts](../src/lib/auth-guard-server.ts) |
| Cashbook + AVCO computation | [src/lib/services/finance-service.ts](../src/lib/services/finance-service.ts) |
| Period close | [src/lib/services/accounting-periods-service.ts](../src/lib/services/accounting-periods-service.ts) |
| PPN helpers | [src/lib/ppn-helpers.ts](../src/lib/ppn-helpers.ts) |
| Document numbering | [src/lib/services/document-number-service.ts](../src/lib/services/document-number-service.ts) |
| Cache hook | [src/lib/use-cached-data.ts](../src/lib/use-cached-data.ts) |
| Roll size billing helpers | [src/lib/roll-size-utils.ts](../src/lib/roll-size-utils.ts) |
| Sync table list | [src/lib/sync-config.ts](../src/lib/sync-config.ts) |

---

## Anti-patterns observed in the wild

These were seen on the project and corrected after — do not repeat:

1. **`useAsyncData` on a list/init page.** Always migrate to `useCachedData`.
2. **Modifying an old migration file** instead of writing a new one. The cloud already applied the old one; edits do nothing in cloud.
3. **Computing `jumlah` as `panjang × lebar`** for dimensional barang. Correct formula is `jumlah_roll × panjang × lebar`.
4. **Inventory math via `db.update("barang", id, { jumlah_stok: ... })`.** Always go through `postInventoryMovement`.
5. **Pricing a sale by order dimensions when stock is rolls.** Bill by roll-aligned dimensions, see roll-size-utils.
6. **Modal without ESC, X, or backdrop close.** All three are required for consistency.
7. **Server action mutation without auth guard.** Wrap with `requireAdminOrManager` (or appropriate role).
8. **Generated IDs that are random when they could be derived from source.** Use idempotent IDs for ledger entries.
9. **Single `inputmode` digit roll qty allowing decimals.** Rolls are physical objects, qty must be `Math.round` and `>= 1`.
10. **Hard-coded vendor or warehouse assumption.** All barang flows must work for items without a vendor (auto-PO) or without a roll variant (non-dimensional).
