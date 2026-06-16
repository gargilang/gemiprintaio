# gemiprint — Agent Rules

> Working guide for all AI coding agents (Zed, OpenCode, Codex, Kiro, Cursor, Claude, etc.).
> This file is tool-neutral: use whatever tools you have (file editing, terminal, search,
> browser) to reach the goals below. It is a generic conversion of
> `.cursor/rules/project-context.mdc`.

## Owner context

- The owner is **not a programmer**. Trust technical decisions to the agent.
- Internal app, ~2-5 users. Priorities: fast, stable, fits business needs, reasonable security (not enterprise hardening).

## Workflow

- Treat each request as a **goal to finish end-to-end**, not just a question to answer. Implement UI + logic + data, fix compile errors you introduce, then verify.
- Don't pause for unnecessary check-ins ("should I continue?"). Proceed unless truly blocked.
- Pick reasonable defaults for small ambiguities; note assumptions in the final summary.
- **Stop and ask only if:** deleting production data / wiping the DB, changing domain/DNS/billing, money or access rules that can't be inferred on your own, or changes that are hard to roll back.

## Scale effort to task size

Some agents have extra skills/workflows (brainstorming, planning, structured execution, TDD, systematic debugging, code review). These raise quality but cost tokens, so match them to task size.

**Big / complex tasks** (new feature across many files, architectural change, ambiguous or multi-step request, risky refactor): use a structured approach even if not asked.
- Intent/design still unclear → brainstorm first.
- Confirmed multi-step work → write a plan, then execute it.
- Bug / failing test / unexpected behavior → systematic debugging before proposing a fix.
- New feature/bugfix → use test-driven development when a suitable test framework exists.
- Before merging large work → request/perform a code review.

**Small / clear tasks** (rename, swap a logo/asset, edit text, change one file, simple question): just do it. Don't run brainstorm/plan/review for trivial tasks — that wastes tokens.

## Agent skills (`.agents/skills/`)

Reusable skills live in `.agents/skills/` (project-local, committed to git) and are picked up by any agent that supports the `SKILL.md` format — Zed, Kiro, OpenCode, Claude, etc. Each skill is a folder with a `SKILL.md` (frontmatter `name` + `description`) plus optional `references/` and `scripts/`.

**How skills get triggered:** a skill is NOT a slash command. The agent reads each skill's `description` and invokes the matching skill via its skill tool when a request fits. So you trigger brainstorming by saying "help me brainstorm feature X" — not by typing `/brainstorming`. (Exception: `graphify` also honors an explicit `/graphify` typed by the user.)

Installed skills:

- **superpowers** (from github.com/obra/superpowers) — workflow skills: `brainstorming`, `writing-plans`, `executing-plans`, `subagent-driven-development`, `dispatching-parallel-agents`, `test-driven-development`, `systematic-debugging`, `requesting-code-review`, `receiving-code-review`, `verification-before-completion`, `using-git-worktrees`, `finishing-a-development-branch`, `writing-skills`, `using-superpowers`. These are the structured workflows referenced in "Scale effort to task size" above. Scale them to task size — skip them for trivial tasks.
- **graphify** (from github.com/safishamsi/graphify) — knowledge-graph query/build over the codebase. See the `## graphify` section below.
- **supabase**, **supabase-postgres-best-practices** — Supabase + Postgres guidance.

These skills are meant to be used **by default** to keep agents efficient: prefer `graphify` for codebase questions, and reach for the superpowers workflow skills on non-trivial work. They cost tokens, so match them to task size per the rules above.

## Tools and access (use without asking)

- Browser (GitHub, Supabase, Vercel, GoDaddy — assume already logged in if available).
- Terminal / CLI: Next.js, Flutter, `gh`, Supabase CLI, Vercel CLI, SQLite.
- Read code, run commands, check deploys/logs, test in the browser.

## Git and deploy

- Commit verified changes. Push to `main` → Vercel auto-deploys.
- **Only commit when the owner asks** (or clearly implies it). Clear commit messages.
- Never commit secrets (`.env.local`, keys, certs). Never `git push --force` to `main`. Don't amend already-pushed commits unless asked.
- DB migrations: after pushing schema changes, run `npm run supabase:db:push` to apply them to the cloud.

## Architecture (one app, three storage backends)

- **Web** (`app.gemiprint.com`, Vercel): React + Next.js API routes → Supabase Postgres via the service-role key. The service-role client is in `src/lib/supabase-admin.ts` (marked `server-only`); the anon client + `SYNC_TABLES` are in `src/lib/supabase.ts`. Never import `getSupabaseAdmin` from client code.
- **Desktop** (Tauri + Next standalone): local SQLite via `better-sqlite3`, offline-first, optional sync to Supabase. Entry: `src-tauri/src/main.rs`; sync engine: `src-tauri/src/sync.rs`.
- **Mobile / mobile-web** (Flutter): talks only to the Next.js API.
- **Unified data layer:** `src/lib/db-unified.ts`. Use `db.query/queryOne/insert/update/delete/transaction`. **Never import the Supabase or SQLite client directly from feature code.**
- **Runtime:** Node.js 22 + npm. Stay on it.

### File map by concern

- DB access (all backends): `src/lib/db-unified.ts`
- Stock movement + roll conversion: `src/lib/services/inventory-service.ts` (`postInventoryMovement`, `convertRollVariant`)
- Cashbook + AVCO: `src/lib/services/finance-service.ts`
- Auth guards: `src/lib/auth-guard-server.ts` (error type in `src/lib/auth-guard-error.ts`)
- Zod input schemas: `src/lib/schemas/` · friendly PG errors: `src/lib/pg-error.ts`
- Feature flags: `src/lib/feature-flags.ts` · retry/coalesce helpers: `src/lib/retry-utils.ts`, `src/lib/coalesce.ts`
- Record normalization (boolean allowlist): `src/lib/normalize-record.ts` · payload hash: `src/lib/payload-hash-util.ts`
- Structured logging: `src/lib/log.ts` · modal focus trap: `src/components/useFocusTrap.ts`
- Period close: `src/lib/services/accounting-periods-service.ts`
- PPN helpers: `src/lib/ppn-helpers.ts`; roll billing: `src/lib/roll-size-utils.ts`
- Cache hook: `src/lib/use-cached-data.ts`; sync table list: `src/lib/sync-config.ts`
- Menu + breadcrumb: `src/components/menuConfig.tsx`

## Language standard (Indonesia-first)

The whole app is normalized to Bahasa Indonesia. All application-owned artifacts use Bahasa Indonesia: UI strings, route folders, API routes, component names, comments/JSDoc, internal docs, internal scripts, and new DB tables/columns.

**English is allowed only for** framework/library/protocol terms and fixed names: `src`, `page.tsx`, `route.ts`, React props, SQL keywords, npm package names, built-in types (`string`, `Promise`, `Record`, ...), generated/vendor code, and migrations already applied to the cloud.

**Conventions still in force (don't regress):**

- New comments/JSDoc in touched application code must be in Bahasa Indonesia. When you touch a nearby English comment, translate it (keep the edit scoped). Don't translate framework/generated/vendor comments.
- Use standard (baku) spelling, not half-English: Impor (not Import), Ekspor (not Export), Unggah (not Upload), Unduh (not Download), Muat Ulang (not Refresh), Pratinjau (not Preview), Penggantian (not Override), Bawaan / Utama (not Default), Buat (not Generate), Draf (not Draft), Jendela (not Window), Faktur (not Invoice), Pelanggan Umum (not Walk-in), Manajer/Staf (not Manager/Staff).
- Don't abbreviate operational menu labels: "PO" → "Pesanan Pembelian", "SJ" → "Surat Jalan". "SPK", "PPN", "NSFP", "POS", "maklon", "finishing", "Vendor" stay (standard operational terms).
- Don't add new bilingual (i18n) toggles for the internal UI. Existing exception: the AI design-brief generator in `src/app/produksi/ai-prompt/page.tsx` (consumed by outside vendors).
- Glossary: Dashboard→Beranda, Customer→Pelanggan, Material→Barang, Purchase→Pembelian, Sale→Penjualan, Inventory→Inventori, Finance→Keuangan, Reports→Laporan, Settings→Pengaturan, User→Pengguna, Production→Produksi.

**Deployed-contract safety:** never casually rename an already-deployed DB column / API path. Create a new (additive) migration or a compat alias, migrate consumers, verify, then remove the old one. A DB rename must stay in sync across the Supabase migration, `database/sqlite-schema.sql`, the runtime ALTER in `src/lib/db-unified.ts`, `src/lib/sync-config.ts`, services, web, Tauri, and Flutter.

**Settled exceptions (intentionally kept in English):**
- File names under `src/lib/services/*-service.ts` and `src/lib/*.ts` may stay English (read by programmers; renaming churns every import with no user value).
- Legacy English DB tables (`inventory_movements`, `purchase_orders`, `stock_opnames`, `barang_roll_variants`, `accounting_periods`, ...) stay — renaming tables is high-risk (many FKs) for low value. New tables/columns must be in Bahasa Indonesia.
- Legacy API folders under `src/app/api/` (e.g. `/api/customers`) are kept as thin re-export shims pointing at the Indonesian routes (`/api/pelanggan`) until Flutter/Tauri migrate. Legacy web routes (`/customers`, `/dashboard`, ...) 301-redirect to the Indonesian routes via `next.config.ts`.

## Iron rules — data & money (apply without being asked)

The owner won't remember to ask; enforce these by default.

1. **Fetch data → `useCachedData` (SWR), not `useAsyncData`.** Instant paint from cache + background revalidate. Stable cache key per dataset (e.g. `"pelanggan"`, or `` `movement-ledger:${JSON.stringify(filters)}` ``). Bust cache across pages via `useInvalidate("key")`. Reference: `src/app/barang/page.tsx`, `src/app/vendors/page.tsx`.
2. **Schema change → THREE places in sync:** (a) a new `supabase/migrations/<timestamp>_<name>.sql` (additive, `IF NOT EXISTS`, defaults); (b) the fresh-install template `database/sqlite-schema.sql`; (c) a runtime `ALTER TABLE ADD COLUMN` in `src/lib/db-unified.ts` so existing SQLite installs migrate on start. Migrations already in the cloud are immutable — write a new one.
3. **Inventory mutation → `inventory-service.postInventoryMovement`, not raw `db.update("barang", { jumlah_stok })`.** The `inventory_movements` ledger is the source of truth for stock + AVCO. Cut rolls with `convertRollVariant`. Rebuild via `rebuildInventoryBalance(barangId)`.
4. **Money/cashbook mutation → `keuangan` with a `[REF:<id>]` token in `keperluan`.** Void/revert looks for this token. Payables/receivables flow through `payDebt` / `revertDebtPayment`; keep `keuangan`, `hutang.sisa_hutang`, `pembelian.jumlah_dibayar` lock-step. CASH posts to `keuangan` directly; NET30/COD creates a `hutang` row and only posts when paid.
5. **Mutating server action → wrap in an auth guard** (`src/lib/auth-guard-server.ts`: `requireSession`, `requireAdminOrManager`, `requireProductionInventoryRole`, `requireAdminManagerOrSelf`). Pass `session.uid` as `dibuat_oleh`. Read actions may skip the guard.
6. **Roll/dimensional goods (`butuh_dimensi_status = 1`):** `jumlah` (m²) = `jumlah_roll × panjang × lebar` (not just `panjang × lebar`). Decrement uses roll-width-aligned length via `barang_roll_variants` + `linear_delta_m`. Conversions are atomic + AVCO-neutral. Input order is **Width × Length** (Lebar × Panjang). Roll qty is an integer ≥ 1.
7. **Closed-period guard on dated mutations.** Anything that accepts a `tanggal` must check `accounting-periods-service.isDateInClosedPeriod`. Throw a friendly error pointing to the open period; never silently bypass.
8. **Sync columns on every new synced table:** `sync_status, last_synced_at, sync_version, updated_at_server, updated_by_device, change_version, is_deleted, deleted_at, client_mutation_id`. Register it in `src/lib/sync-config.ts`.
9. **Idempotent ledger IDs derived from the source row:** `mov-${itemId}`, `void-${originalMovementId}`, `${conversionId}-out` / `${conversionId}-in-${i}`. Deterministic and retry-safe.
10. **Verify before "done" (mandatory):** `npm run type-check` (0 errors) → `npm run build` → `npx jest <relevant test>` for touched services (`src/lib/__tests__/`). Jest runs two projects: `node` (services + API route tests under `src/app/**/__tests__/*.test.ts`) and `jsdom` (component tests `*.test.tsx`). UI-only changes may skip jest but still need type-check + build. New lint warnings you introduce must be fixed. CI (`.github/workflows/ci.yml`) re-runs lint + type-check + test + build + `check:versions` on every PR; a husky pre-commit hook runs `lint-staged` (eslint --fix) on staged files.
11. **`onSuccess` for a newly created item passes `null` as the updated item**, so the parent does a full `reload()` instead of `updateInState` (which would never append the new row).
12. **Seed/default SQL:** verify column names against the actual migrations (e.g. the `pengaturan_toko` bank fields are `bank_nama`, `bank_nomor`, `bank_atas_nama`). Default settings rows use `ON CONFLICT DO UPDATE SET`, not `DO NOTHING`, so `supabase:local:reset` restores defaults.
13. **Finance categories:** show `display_name` as the primary label; `category_code` is secondary (small, monospace, amber, quoted). In `ExpressionAssistant`, the suggestion `label` = display name, `hint` = `kode: ${code}`, `insert` = `"${code}"`.
14. **Every mutating API route/server action MUST be role-guarded.** Use `requireSession` / `requireAdminOrManager` / `requireProductionInventoryRole` / `requireAdminManagerOrSelf` from `src/lib/auth-guard-server.ts`, and handle `AuthGuardError` in the catch (return its `.status`). Reads may skip the guard. Never trust a client-sent `x-session-uid`; derive identity from the guard's `session.uid` (middleware sets the header from the verified JWT). Don't regress this — Phase 1 closed privilege-escalation holes here.
15. **Validate hot-path mutation input with Zod** (`src/lib/schemas/`: `pos.ts`, `pembelian.ts`, `inventori.ts`). Use `z.coerce.number().finite()` for money/qty (rejects NaN, accepts numeric strings from Flutter), `.passthrough()` so no payload field is silently dropped, and `safeParse` → 422 on failure. Match enums to real values (payment methods: `CASH/TRANSFER/QRIS/DEBIT/DOWN_PAYMENT/NET30`).
16. **Surface DB errors via `friendlyPgError(e, table)`** (`src/lib/pg-error.ts`) instead of throwing raw PostgREST messages at the UI (avoids leaking constraint names + unfriendly English). The `payload_hash` for the mutation registry uses real SHA-256 via `hashPayload` (`src/lib/payload-hash-util.ts`), not `JSON.stringify(x).length`.
17. **Composite mutation atomicity (createSale/createPurchase):** the Postgres RPC path (`create_sale_with_inventory`, `create_purchase_with_inventory`) is **opt-in** via `usePgCompositeRpc()` (`src/lib/feature-flags.ts`, env `USE_PG_COMPOSITE_RPC=1`, default OFF). The default non-RPC path MUST keep compensating cleanup in the catch (`compensateFailedSale` / `compensateFailedPurchase`) — reverse inventory via `rebuildInventoryBalance`, delete `[REF:id]` keuangan rows, release the NSFP, delete the header (FK cascade). Invoice/PO number collisions retry via `withDuplicateNumberRetry` (`src/lib/retry-utils.ts`). The sale RPC needs migration `20260605000000` (column `nomor_faktur`) applied before it can be enabled.
18. **`normalizeRecord` boolean conversion uses an explicit allowlist** (`src/lib/normalize-record.ts`), not a loose `key.includes("status")` heuristic — enum fields like `status_pembayaran`, `void_status_kode`, `roll_inventory_status`, `sync_status` are NOT booleans and must not be coerced to true/false.
19. **Avoid N+1 in read paths.** For list endpoints, fetch related tables once and join in memory (Supabase: `.in("fk", ids)`; SQLite fallback: load bounded tables once). Reference: `getSales`, `getProductionOrders`. Heavy recalcs (`recalculateCashbookIfAvailable`) are coalesced via `createCoalescedRunner` (`src/lib/coalesce.ts`) — call freely; concurrent calls collapse into one.
20. **Startup secrets fail-fast:** `SESSION_SECRET` must be ≥32 chars and `PASSWORD_ENC_SECRET` must be set in production (`src/lib/session.ts`, `src/lib/crypto.ts` throw otherwise — intentional). JWT TTL is 24h. The credential vault uses a per-record salt (AES-256-GCM) with a legacy-format decrypt fallback. Raw SQL identifier interpolation (`db-unified.ts`, Tauri `main.rs`) must pass the `^[a-z_][a-z0-9_]*$` allowlist.

## Code navigation — pick the cheapest tool (token economy)

You have grep/file-search and file reads. No tool is mandatory. Pick whichever reaches the answer with the **fewest tokens** for the task at hand. Don't grep-chain ten files when one targeted read is enough.

Rough guide (use judgment, not dogma):

- **Local / known target** (rename a string, swap a logo/asset, edit one known file, find an exact symbol): grep/file-search/read is usually cheapest. Go straight to it.
- **Relational / impact / architecture** ("what calls X and what breaks if I change it", "trace the flow from POS to the cashbook", "which files touch this column"): start with a targeted search, then read the key files. If the repo has a knowledge graph (e.g. `graphify-out/`), it can return a small subgraph instead of many full-file reads — use it when available and cheapest.
- **Mixed**: a quick search to localize, then a targeted read/grep to confirm the exact line, is often the cheapest combined path.

## Iron rules — icons (SVG only, never emoji)

This app uses explicit SVG icon components. **Never use an emoji as an icon** (no 🎂, ✅, 🚀, 📦, etc.) in the UI, JSX, labels, buttons, headings, toasts, or stat cards.

- Reuse an existing icon from `src/components/icons/`: `PageIcons.tsx` (page titles + navigation) and `ContentIcons.tsx` (content/category/badge icons).
- If no suitable icon exists, add a new SVG component to the right file following the existing pattern: `({ className = "", size = N }: IconProps)`, `viewBox="0 0 24 24"`, strokes/fills via `currentColor` so it inherits text color and pairs with dark mode.
- Import the component (e.g. `import { PersonIcon } from "@/components/icons/ContentIcons"`); don't inline raw `<svg>` blobs in feature pages when a reusable component fits.
- Emoji in non-icon contexts (e.g. owner-facing chat text) is not the target of this rule — this rule is about icons rendered in the product UI.

## Iron rules — new page / UI shape

- The page root is `<div className="space-y-6">`, **not** a second `<main>` (the shell already provides `<main>` with padding).
- Every page opens with a gradient title card: `<div className="bg-gradient-to-br from-X to-Y rounded-2xl shadow-lg p-6 text-white">` with an icon, uppercase title, and subtitle. Reference: `src/app/keuangan/page.tsx`, `src/app/surat-jalan/page.tsx`.
- **Dark mode is mandatory on every element.** Every color class needs a `dark:` pair (`bg-white dark:bg-slate-900`, `text-slate-800 dark:text-slate-100`, `border-slate-200 dark:border-slate-700`). Watch out for invalid tokens like `dark:bg-slate-8000`.
- Stat-card icons use `text-white` on a `bg-white/20 rounded-lg` patch — not the same color as the card gradient (otherwise the icon is invisible).
- Badges/numbers with white text need a solid shade (`bg-emerald-500`), not `-50` (near-white, unreadable).
- **Modals:** ESC to close, click backdrop to close (`if (e.target === e.currentTarget)`), X button in the header, primary action far right with the brand color, cancel to its left, disabled state while async ("Menyimpan..."). Theme color per domain: emerald = goods/inventory, purple = purchasing, indigo = neutral, amber = warning/manual, rose = destructive. Reference shells: `src/components/ModalFormShell.tsx`, `src/components/DialogKonfirmasi.tsx`.
- **`ModalFormShell` is the recommended modal scaffold** — it already provides Escape (respecting `allowDismiss`), backdrop dismiss, and focus trap + focus restore. For a modal that can't use the shell, call `useFocusTrap(ref, isOpen)` (`src/components/useFocusTrap.ts`) directly; it traps Tab only (Escape stays with the host).
- **Error/loading boundaries:** each route area should have an `error.tsx` (client component, Bahasa Indonesia message + a "Coba Lagi" reset) and, where fetching is heavy, a `loading.tsx`. The root `src/app/error.tsx`, `loading.tsx`, `not-found.tsx` already exist; add area-specific `error.tsx` for new critical sections.
- **Combobox/dropdown a11y:** the input gets `role="combobox"` + `aria-expanded`/`aria-controls`/`aria-activedescendant`; the option list gets `role="listbox"` with a stable id; options get `role="option"` + `aria-selected` and NO per-option `tabIndex` (keyboard nav lives on the input). Reference: `src/components/PilihanCari.tsx`.
- **Stabilize SWR-derived arrays:** `const items = useMemo(() => data ?? [], [data])` — a bare `data ?? []` creates a new reference every render and breaks downstream `useMemo`/`useEffect` dependencies (react-hooks/exhaustive-deps).
- **Large client pages:** extract modals/sections into focused files with explicit props (`{ entity, onClose, onSuccess, showNotification }`); the modal owns its own form state + submit, and `onSuccess` triggers the parent's `reload()`. Map shared state BEFORE extracting — don't extract JSX blindly (naive extraction causes prop-drilling). Reference: `src/app/barang/ModalCatatRusak.tsx`, `src/app/pengguna/FormPenggunaModal.tsx`.

## When ambiguous

Pick the option that: matches existing patterns (search first), minimizes new infrastructure, errs toward user safety on destructive operations, and respects existing column/table semantics. Document non-obvious choices in the final summary.

## Setup references (owner-maintained, do not delete)

- `docs/SETUP.md` — fresh-machine developer setup.
- `docs/supabase-local-development.md` — local Supabase workflow.
- `docs/migrasi-singapura-dan-perbaikan.md` — DB migration to Singapore, migration collapse, Vercel configuration, and improvement candidates (SQLite/N+1).

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, invoke the `skill` tool with `skill: "graphify"` before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
