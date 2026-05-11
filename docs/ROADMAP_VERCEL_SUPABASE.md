# Roadmap: Web production Supabase-only (Vercel-ready)

Target: browser → Next.js API → Supabase Postgres; **no reliance** on `database/gemiprint.db` on the server. Tauri keeps SQLite + sync unchanged.

---

## Phase A — Core adapter & cashbook (done in repo)

| Step | Topic | Status |
|------|--------|--------|
| A1 | Export `getServerSupabaseClient()` from `db-unified` for direct PostgREST use | Done |
| A2 | Add `server-data-supabase.ts` — keuangan list/archive/delete/max order, FK checks, counts | Done |
| A3 | Extract shared rules to `cashbook-recalc-logic.ts`; refactor `calculate-cashbook.ts` | Done |
| A4 | `recalculateCashbookViaSupabase()` + wire `recalculateCashbookIfAvailable()` | Done |
| A5 | `finance-service`: max `urutan_tampilan`, `deleteAllCashbook`, CSV import order via Supabase when configured | Done |
| A6 | `reports-service`: archives + financial report + restore via Supabase | Done |
| A7 | `finance-config-service`: metric join + display_order max + unlink participant via Supabase | Done |
| A8 | `duplicate-check.ts` — duplicate rows & FK presence with SQLite fallback | Done |
| A9 | API routes: finance cash-book GET, cashbook archive routes, customers, vendors, materials, master duplicates | Done |
| A10 | `master-service` counts; `finishing-options`, `purchases-service`, `materials-service` helpers | Done |
| A11 | Document `GEMIPRINT_SKIP_SERVER_SQLITE_MIRROR` in `.env.example` | Done |

---

## Phase B — Hardening (next for you)

| Step | Topic | Notes |
|------|--------|--------|
| B1 | **Deploy smoke test** | Deploy preview on Vercel + hit `/api/finance/cash-book`, login, one master POST |
| B2 | **`GEMIPRINT_SKIP_SERVER_SQLITE_MIRROR=1`** on production web | Avoids useless SQLite mirror writes when Supabase succeeds |
| B3 | **`processSyncQueue` / server SQLite queue** | On pure serverless, queue in local SQLite file is useless; consider queue-in-Supabase or client-only queue |
| B4 | **`purchases-service` recalculate helper** | Still only runs `calculate-cashbook` when native SQLite exists; align with `finance-service.recalculateCashbookIfAvailable` if purchases should update cashbook on web |
| B5 | **Remove dead code** | `sync-service.ts` / legacy `db.ts` consumers — audit and delete if unused |
| B6 | **Postgres RPC** (optional) | Replace remaining **fallback** `queryRaw` paths with RPC only if you drop local SQLite dev entirely |

---

## Phase C — Product / compliance

| Step | Topic |
|------|--------|
| C1 | RLS policies & service role usage audit (Supabase skill) |
| C2 | E2E tests against real Supabase project |
| C3 | Reports edge cases (large `keuangan` archive pagination) |

---

## Environment checklist (web)

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server routes)
- `GEMIPRINT_SKIP_SERVER_SQLITE_MIRROR=1` (recommended on Vercel)
- `WEB_SERVER_MEDIATED_ONLY=1` (default in `sync-config`)

---

## References

- Pure cashbook math: `src/lib/cashbook-recalc-logic.ts`
- Server reads/writes: `src/lib/server-data-supabase.ts`
- Duplicate checks: `src/lib/duplicate-check.ts`
