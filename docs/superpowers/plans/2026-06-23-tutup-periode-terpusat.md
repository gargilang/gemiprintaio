# Tutup Periode Terpusat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy cashbook archive/import workflow with one centralized month-close workflow based on `accounting_periods`, while keeping historical transactions available through date-range reports.

**Architecture:** Keep `Tutup Periode` as the accounting lock and remove UI/API/service entry points that write or read `label_arsip`/`diarsipkan_pada` as a user workflow. Make `Keuangan` a current-month workspace by filtering the active cashbook endpoint to the current Jakarta month, and make `Laporan Kas` the official historical cash report.

**Tech Stack:** Next.js App Router, React client pages, server actions, API routes, TypeScript, Jest, unified data layer (`db-unified`), Supabase/SQLite dual backend.

---

## File Structure

Modify:

- `src/lib/date-utils.ts` - add reusable Jakarta current-month range helper.
- `src/lib/__tests__/date-utils.test.ts` - add unit tests for the helper.
- `src/lib/server-data-supabase.ts` - replace Supabase active cashbook helper with current-month helper.
- `src/app/api/keuangan/cash-book/route.ts` - filter SQLite and Supabase cashbook lists to current Jakarta month.
- `src/app/keuangan/page.tsx` - remove archive/import state, handlers, buttons, modal mounts, and imports.
- `src/app/keuangan/actions.ts` - remove archive/import server actions and imports.
- `src/app/laporan/page.tsx` - remove `Arsip Kas` report type and archive state/UI.
- `src/app/laporan/actions.ts` - remove `getArchivedPeriodsAction`.
- `src/lib/services/reports-service.ts` - remove archive-only report functions and types.
- `src/lib/services/finance-service.ts` - remove CSV import parser and helper if no references remain.
- `src/app/pengaturan/PeriodCloseTab.tsx` - update copy to make `Tutup Periode` the central close workflow.

Delete:

- `src/components/ModalTutupBuku.tsx`
- `src/components/ModalPilihBulan.tsx`
- `src/components/ModalImporCsv.tsx`
- `src/app/api/cashbook/archive/route.ts`
- `src/app/api/cashbook/archive/[label]/route.ts`
- `src/app/api/cashbook/archive/by-time/route.ts`
- `src/app/api/cashbook/archive/restore/route.ts`
- `src/app/api/cashbook/import/route.ts`
- `src/app/api/laporan/financial/route.ts`
- `src/app/laporan/financial/print/page.tsx`

Do not change schema in this plan. Keep `label_arsip` and `diarsipkan_pada` columns in the database because they are already deployed contract.

---

### Task 1: Add Current Jakarta Month Helper

**Files:**
- Modify: `src/lib/date-utils.ts`
- Create: `src/lib/__tests__/date-utils.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/date-utils.test.ts`:

```ts
import { getCurrentMonthRangeJakarta } from "@/lib/date-utils";

describe("getCurrentMonthRangeJakarta", () => {
  it("mengembalikan rentang bulan Jakarta dari tanggal referensi", () => {
    expect(getCurrentMonthRangeJakarta(new Date("2026-06-22T20:00:00.000Z"))).toEqual({
      startDate: "2026-06-01",
      endDate: "2026-06-30",
    });
  });

  it("menghormati perpindahan hari di zona waktu Jakarta", () => {
    expect(getCurrentMonthRangeJakarta(new Date("2026-02-28T18:00:00.000Z"))).toEqual({
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx jest src/lib/__tests__/date-utils.test.ts
```

Expected: FAIL with `getCurrentMonthRangeJakarta` not exported.

- [ ] **Step 3: Add the helper**

Append this function to `src/lib/date-utils.ts` after `getMonthRange`:

```ts
/**
 * Ambil rentang bulan berjalan menurut zona waktu Jakarta.
 * Dipakai supaya halaman kerja harian tidak bergantung pada timezone browser/server.
 */
export function getCurrentMonthRangeJakarta(referenceDate: Date = new Date()): {
  startDate: string;
  endDate: string;
} {
  const jakartaDate = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: JAKARTA_TIMEZONE,
  }).format(referenceDate);

  const [year, month] = jakartaDate.split("-").map(Number);
  return getMonthRange(year, month);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npx jest src/lib/__tests__/date-utils.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/date-utils.ts src/lib/__tests__/date-utils.test.ts
git commit -m "$(cat <<'EOF'
test: add Jakarta current month helper

EOF
)"
```

---

### Task 2: Make Keuangan Load Current Month Only

**Files:**
- Modify: `src/lib/server-data-supabase.ts`
- Modify: `src/app/api/keuangan/cash-book/route.ts`

- [ ] **Step 1: Update the Supabase helper**

In `src/lib/server-data-supabase.ts`, add the import:

```ts
import { getCurrentMonthRangeJakarta } from "@/lib/date-utils";
```

Replace `fetchKeuanganCashBookListActive` with:

```ts
export async function fetchKeuanganCashBookListCurrentMonth(): Promise<
  Record<string, unknown>[]
> {
  const sb = clientOrNull();
  if (!sb) return [];
  const { startDate, endDate } = getCurrentMonthRangeJakarta();
  const { data, error } = await sb
    .from("keuangan")
    .select("*")
    .gte("tanggal", startDate)
    .lte("tanggal", endDate)
    .or("status_transaksi.is.null,status_transaksi.neq.VOIDED")
    .order("urutan_tampilan", { ascending: false })
    .order("dibuat_pada", { ascending: false });
  if (error) throw error;
  return (data as Record<string, unknown>[]) || [];
}
```

- [ ] **Step 2: Update the cashbook API route**

In `src/app/api/keuangan/cash-book/route.ts`, replace:

```ts
import { fetchKeuanganCashBookListActive } from "@/lib/server-data-supabase";
```

with:

```ts
import { getCurrentMonthRangeJakarta } from "@/lib/date-utils";
import { fetchKeuanganCashBookListCurrentMonth } from "@/lib/server-data-supabase";
```

Inside `GET`, add the range at the start of the `try` block:

```ts
const activePeriod = getCurrentMonthRangeJakarta();
```

Replace the Supabase call:

```ts
fetchKeuanganCashBookListActive(),
```

with:

```ts
fetchKeuanganCashBookListCurrentMonth(),
```

Replace the SQLite query with:

```ts
const cashBooks =
  (await db.queryRaw(
    `SELECT * FROM keuangan
     WHERE tanggal >= ? AND tanggal <= ?
       AND COALESCE(status_transaksi, 'POSTED') <> 'VOIDED'
     ORDER BY urutan_tampilan DESC, dibuat_pada DESC`,
    [activePeriod.startDate, activePeriod.endDate],
  )) || [];
```

Return `activePeriod` in both JSON responses:

```ts
return NextResponse.json({
  cashBooks: cashBooksWithDeletable,
  systemMetrics,
  activePeriod,
});
```

- [ ] **Step 3: Run type-check**

Run:

```bash
npm run type-check
```

Expected: PASS. If it fails because of the renamed helper, replace all remaining `fetchKeuanganCashBookListActive` imports with `fetchKeuanganCashBookListCurrentMonth`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/server-data-supabase.ts src/app/api/keuangan/cash-book/route.ts
git commit -m "$(cat <<'EOF'
feat: show current month cashbook by default

EOF
)"
```

---

### Task 3: Remove Legacy Archive and CSV Controls from Keuangan

**Files:**
- Modify: `src/app/keuangan/page.tsx`
- Modify: `src/app/keuangan/actions.ts`
- Delete: `src/components/ModalTutupBuku.tsx`
- Delete: `src/components/ModalPilihBulan.tsx`
- Delete: `src/components/ModalImporCsv.tsx`

- [ ] **Step 1: Remove unused imports from Keuangan page**

In `src/app/keuangan/page.tsx`, remove these imports:

```ts
import ModalImporCsv from "@/components/ModalImporCsv";
import ModalTutupBuku from "@/components/ModalTutupBuku";
import ModalPilihBulan from "@/components/ModalPilihBulan";
```

Replace the actions import with:

```ts
import {
  getDebtsAction,
  getReceivablesAction,
  deleteAllCashbookAction,
  deleteCashBookEntryAction,
  createCashBookEntryAction,
} from "./actions";
```

- [ ] **Step 2: Remove archive/import state**

Delete these state/ref blocks from `src/app/keuangan/page.tsx`:

```ts
const viewingArchiveRef = useRef<string | null>(null);
const [showImportModal, setShowImportModal] = useState(false);
const [showCloseBooksModal, setShowCloseBooksModal] = useState(false);
const [showSelectMonthModal, setShowSelectMonthModal] = useState(false);
const [viewingArchive, setViewingArchive] = useState<string | null>(null);
const [currentArchiveInfo, setCurrentArchiveInfo] = useState<{
  label: string;
  archived_at: string;
} | null>(null);
```

Delete the effect that syncs `viewingArchiveRef`.

Replace the cache mirror in `setCashBooks`:

```ts
if (!viewingArchiveRef.current) {
  swr.mutate(CASHBOOKS_CACHE_KEY, resolved, { revalidate: false });
}
```

with:

```ts
swr.mutate(CASHBOOKS_CACHE_KEY, resolved, { revalidate: false });
```

- [ ] **Step 3: Simplify summary and loading**

Replace:

```ts
const latest = viewingArchive
  ? cashBooks[cashBooks.length - 1]
  : cashBooks[0];
```

with:

```ts
const latest = cashBooks[0];
```

Remove `viewingArchive` from the dependency array of `summaryData`.

In the Escape key handler, remove this branch:

```ts
else if (showImportModal) setShowImportModal(false);
```

- [ ] **Step 4: Simplify `loadCashBooks`**

Replace `loadCashBooks` with:

```ts
const loadCashBooks = async () => {
  try {
    const res = await fetch("/api/keuangan/cash-book", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Gagal memuat data");
    setCashBooks(data.cashBooks || []);
    loadHutangData();
    loadPiutangData();
  } catch (err) {
    console.error("Gagal memuat cash books:", err);
    showMsg("error", "Tidak bisa memuat data buku keuangan dari database.");
  }
};
```

- [ ] **Step 5: Delete legacy handlers**

Delete the entire function declarations named:

- `handleImportSuccess`
- `handleCloseBooksSuccess`
- `handleSelectArchive`
- `handleRestoreArchive`

- [ ] **Step 6: Update header and toolbar copy**

Replace the header subtitle block:

```tsx
<p className="text-white/90 text-sm">
  {viewingArchive
    ? `Melihat Arsip: ${viewingArchive}`
    : "Kelola transaksi dan buku kas perusahaan"}
</p>
```

with:

```tsx
<p className="text-white/90 text-sm">
  Area kerja buku kas bulan berjalan. Riwayat bulan lama tersedia di Laporan.
</p>
```

Replace:

```tsx
{!viewingArchive && (
  <button
```

around the "Tambah Transaksi" button with:

```tsx
<button
```

and remove the matching closing conditional wrapper.

Delete the toolbar button blocks for:

```tsx
Tutup Buku
Pilih Arsip Bulan
Impor CSV
Restore Arsip
Kembali ke Aktif
```

Replace the right-side count block:

```tsx
{viewingArchive ? (
  <>
    <BoxIcon size={16} className="text-gray-600 dark:text-slate-300" />{" "}
    {viewingArchive} ({filteredCashBooks.length} Transaksi)
  </>
) : (
  <>{filteredCashBooks.length} Transaksi Aktif</>
)}
```

with:

```tsx
<>{filteredCashBooks.length} Transaksi Bulan Ini</>
```

Replace:

```tsx
<CashBookRow
  key={cb.id}
  cashBook={cb}
  index={idx}
  viewingArchive={!!viewingArchive}
```

with:

```tsx
<CashBookRow
  key={cb.id}
  cashBook={cb}
  index={idx}
  viewingArchive={false}
```

- [ ] **Step 7: Remove legacy modal mounts**

Delete the JSX blocks that mount `ModalImporCsv`, `ModalTutupBuku`, and `ModalPilihBulan` from the bottom of `src/app/keuangan/page.tsx`.

- [ ] **Step 8: Remove archive/import actions**

In `src/app/keuangan/actions.ts`, remove these imports:

```ts
import { importCashbookFromCSV } from "@/lib/services/finance-service";
import {
  restoreArchivedTransactions,
  getArchivedPeriods,
  archiveCashbook,
} from "@/lib/services/reports-service";
```

Delete these exported actions:

```ts
restoreArchivedTransactionsAction
importCashbookFromCSVAction
getArchivedPeriodsAction
archiveCashbookAction
```

- [ ] **Step 9: Delete the modal files**

Delete:

```bash
rm "src/components/ModalTutupBuku.tsx" "src/components/ModalPilihBulan.tsx" "src/components/ModalImporCsv.tsx"
```

- [ ] **Step 10: Run type-check**

Run:

```bash
npm run type-check
```

Expected: PASS. If it fails because of remaining archive/import identifiers in `src/app/keuangan/page.tsx`, remove those identifiers and rerun.

- [ ] **Step 11: Commit**

```bash
git add src/app/keuangan/page.tsx src/app/keuangan/actions.ts src/components/ModalTutupBuku.tsx src/components/ModalPilihBulan.tsx src/components/ModalImporCsv.tsx
git commit -m "$(cat <<'EOF'
refactor: retire legacy cashbook archive controls

EOF
)"
```

---

### Task 4: Remove Arsip Kas from Laporan

**Files:**
- Modify: `src/app/laporan/page.tsx`
- Modify: `src/app/laporan/actions.ts`
- Delete: `src/app/laporan/financial/print/page.tsx`

- [ ] **Step 1: Remove archive imports and types**

In `src/app/laporan/page.tsx`, replace:

```ts
import {
  getArchivedPeriodsAction,
  getFormalAccountingReportAction,
} from "./actions";
```

with:

```ts
import { getFormalAccountingReportAction } from "./actions";
```

Delete the `Archive` interface.

Replace `ReportType` with:

```ts
type ReportType =
  | "cash"
  | "profit-loss"
  | "inventory"
  | "pos"
  | "receivables";
```

- [ ] **Step 2: Remove archive state and handlers**

Delete the archive-only declarations:

- the `useCachedData<Archive[]>` block that declares `archivesData`, `loadingArchives`, and `mutateArchives`
- `const archives = archivesData ?? []`
- `const [selectedArchive, setSelectedArchive] = useState<Archive | null>(null)`
- `const [generatingPDF, setGeneratingPDF] = useState(false)`
- the entire `loadArchives` function
- the entire `handleGenerateFinancialReport` function

After deleting the archive SWR block, no `useCachedData` call should remain in `src/app/laporan/page.tsx`. Remove this import:

```ts
import { useCachedData } from "@/lib/use-cached-data";
```

- [ ] **Step 3: Remove the Arsip Kas card**

Delete this object from `reportTypes`:

```ts
{
  id: "financial" as ReportType,
  icon: <CoinIcon size={32} />,
  title: "Arsip Kas",
  description: "Ringkasan transaksi dari arsip tutup buku",
  available: true,
},
```

Change the grid class from six columns to five columns:

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
```

- [ ] **Step 4: Remove the archive report section**

Delete the entire JSX conditional block that starts with `selectedReportType === "financial"` and renders the archive selection plus print action.

Replace:

```tsx
{selectedReportType !== "financial" && (
  <FormalReportPanel
```

with:

```tsx
<FormalReportPanel
```

and remove the matching closing conditional wrapper.

Change `FormalReportPanel` prop type:

```ts
selectedReportType: ReportType;
```

- [ ] **Step 5: Remove archive action**

In `src/app/laporan/actions.ts`, replace the imports with:

```ts
import { getFormalAccountingReport } from "@/lib/services/reports-service";
```

Delete the entire exported function named `getArchivedPeriodsAction`.

- [ ] **Step 6: Delete the archive print page**

Delete:

```bash
rm "src/app/laporan/financial/print/page.tsx"
```

- [ ] **Step 7: Run type-check**

Run:

```bash
npm run type-check
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/app/laporan/page.tsx src/app/laporan/actions.ts src/app/laporan/financial/print/page.tsx
git commit -m "$(cat <<'EOF'
refactor: remove archive cash report

EOF
)"
```

---

### Task 5: Remove Legacy Archive and Import Backend

**Files:**
- Modify: `src/lib/services/reports-service.ts`
- Modify: `src/lib/services/finance-service.ts`
- Modify: `src/lib/server-data-supabase.ts`
- Delete: `src/app/api/cashbook/archive/route.ts`
- Delete: `src/app/api/cashbook/archive/[label]/route.ts`
- Delete: `src/app/api/cashbook/archive/by-time/route.ts`
- Delete: `src/app/api/cashbook/archive/restore/route.ts`
- Delete: `src/app/api/cashbook/import/route.ts`
- Delete: `src/app/api/laporan/financial/route.ts`

- [ ] **Step 1: Delete archive/import API routes**

Run:

```bash
rm "src/app/api/cashbook/archive/route.ts" \
  "src/app/api/cashbook/archive/[label]/route.ts" \
  "src/app/api/cashbook/archive/by-time/route.ts" \
  "src/app/api/cashbook/archive/restore/route.ts" \
  "src/app/api/cashbook/import/route.ts" \
  "src/app/api/laporan/financial/route.ts"
```

- [ ] **Step 2: Remove archive helpers from Supabase direct data file**

In `src/lib/server-data-supabase.ts`, delete these functions:

```ts
fetchKeuanganByArchiveLabel
fetchKeuanganByArchiveLabelAndTime
```

Keep `deleteKeuanganWhereNotArchived` because `deleteAllCashbook` still uses it.

- [ ] **Step 3: Remove archive report code**

In `src/lib/services/reports-service.ts`, delete these complete declarations:

- `export interface Archive`
- `export interface FinancialReport`
- `export async function getArchivedPeriods`
- `export async function archiveCashbook`
- `export async function getFinancialReport`
- `export async function restoreArchivedTransactions`

Keep `FormalAccountingReport` and `getFormalAccountingReport`.

- [ ] **Step 4: Remove CSV import code**

In `src/lib/services/finance-service.ts`, delete the CSV import section declarations:

- `const ALLOWED_CATEGORIES`
- `function normalizeCategory`
- `function toNumber`
- `function parseDate`
- `export async function importCashbookFromCSV`

Do not remove `deleteAllCashbook`, `nextUrutanTampilanKeuangan`, or recalculation helpers.

- [ ] **Step 5: Search for remaining references**

Run:

```bash
rg "archiveCashbook|getArchivedPeriods|restoreArchivedTransactions|getFinancialReport|importCashbookFromCSV|ModalTutupBuku|ModalPilihBulan|ModalImporCsv|cashbook/archive|cashbook/import|laporan/financial" src
```

Expected: no matches.

- [ ] **Step 6: Run type-check**

Run:

```bash
npm run type-check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/services/reports-service.ts src/lib/services/finance-service.ts src/lib/server-data-supabase.ts src/app/api/cashbook src/app/api/laporan/financial
git commit -m "$(cat <<'EOF'
refactor: remove legacy cashbook archive backend

EOF
)"
```

---

### Task 6: Clarify Tutup Periode as the Central Close Workflow

**Files:**
- Modify: `src/app/pengaturan/PeriodCloseTab.tsx`

- [ ] **Step 1: Update page copy**

Replace the subtitle under `Tutup Periode` with:

```tsx
<p className="text-sm text-gray-500 dark:text-slate-400">
  Tutup periode adalah workflow resmi untuk finalisasi bulan. Data lama tetap
  terlihat di Laporan, tetapi transaksi di bulan tertutup tidak bisa diubah
  tanpa membuka kembali periode.
</p>
```

Replace the confirmation message with:

```ts
`Tutup periode ${MONTHS[month - 1]} ${year}? Setelah ditutup, transaksi bertanggal bulan ini tidak bisa diubah/void/adjust tanpa membuka kembali periode. Data tetap bisa dilihat di Laporan.`
```

- [ ] **Step 2: Add a guidance box**

Add this block above the "Tutup periode baru" section:

```tsx
<section className="bg-indigo-50 dark:bg-indigo-950/30 rounded-xl p-4 border border-indigo-200 dark:border-indigo-800/50">
  <h3 className="font-semibold text-indigo-900 dark:text-indigo-100 mb-2">
    Alur tutup bulan
  </h3>
  <ol className="list-decimal list-inside space-y-1 text-sm text-indigo-800 dark:text-indigo-200">
    <li>Cek Laporan Kas, Laba Rugi, Margin Penjualan, dan Hutang & Piutang.</li>
    <li>Pastikan transaksi bulan tersebut sudah benar.</li>
    <li>Tutup periode untuk mengunci perubahan di bulan itu.</li>
    <li>Jika perlu koreksi, buka kembali periode dengan alasan.</li>
  </ol>
</section>
```

- [ ] **Step 3: Fix dark mode classes on controls touched in the section**

Use these classes on the month select, year input, and catatan input:

```tsx
className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100"
```

Use this class on the close button:

```tsx
className="px-4 py-2 bg-slate-700 dark:bg-slate-600 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-slate-500 disabled:opacity-50"
```

- [ ] **Step 4: Run type-check**

Run:

```bash
npm run type-check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/pengaturan/PeriodCloseTab.tsx
git commit -m "$(cat <<'EOF'
feat: clarify centralized period close workflow

EOF
)"
```

---

### Task 7: Final Verification and Cleanup

**Files:**
- Review all modified/deleted files from Tasks 1-6.

- [ ] **Step 1: Search for removed labels and routes**

Run:

```bash
rg "Tutup Buku|Pilih Arsip Bulan|Impor CSV|Restore Arsip|Arsip Kas|cashbook/archive|cashbook/import|laporan/financial" src
```

Expected: no matches in application code.

- [ ] **Step 2: Search for legacy archive functions**

Run:

```bash
rg "archiveCashbook|getArchivedPeriods|restoreArchivedTransactions|getFinancialReport|importCashbookFromCSV|fetchKeuanganByArchiveLabel" src
```

Expected: no matches.

- [ ] **Step 3: Run focused tests**

Run:

```bash
npx jest src/lib/__tests__/date-utils.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run mandatory verification**

Run:

```bash
npm run type-check
npm run build
```

Expected: both commands pass with zero new errors.

- [ ] **Step 5: Inspect git diff**

Run:

```bash
git status --short
git diff --stat
```

Expected: only files from this plan are changed or deleted.

- [ ] **Step 6: Final commit if verification changed files**

If verification or cleanup changed files after the previous task commits, stage tracked changes under `src` and `docs`:

```bash
git add -u src docs
git commit -m "$(cat <<'EOF'
chore: finish centralized period close cleanup

EOF
)"
```

If there are no remaining changes from this plan, do not create an empty commit.
