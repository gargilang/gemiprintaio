"use client";

/**
 * Per-person finance summary panel — fixed 3-column layout.
 *
 * Uses SWR with the persistent cache provider so data is shown instantly
 * on revisit (no spinner after first load). Revalidates in background.
 */

import { useMemo, useState } from "react";
import useSWR from "swr";

type FormulaGroup =
  | "summary"
  | "profit_share"
  | "cash_advance"
  | "bonus"
  | "custom";

interface SummaryColumn {
  formulaKey: string;
  label: string;
  group: FormulaGroup;
}

interface ActorRow {
  actorId: string | null;
  displayName: string;
  roleLabel: string;
  metrics: Record<string, number | null>;
  displayOrder: number;
  isGlobal: boolean;
}

interface SummaryV2Response {
  month: string | null;
  columns: SummaryColumn[];
  rows: ActorRow[];
  legacyOrphanFormulas: number;
}

interface Props {
  month?: string;
  formatRupiah: (n: number) => string;
  refreshKey?: string | number;
  onOpenPeopleSettings?: () => void;
}

async function fetchSummary(url: string): Promise<SummaryV2Response> {
  const r = await fetch(url);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body?.error || "Gagal memuat ringkasan");
  return body as SummaryV2Response;
}

function sumGroup(
  metrics: Record<string, number | null>,
  columns: SummaryColumn[],
  group: FormulaGroup
): number | null {
  const keys = columns.filter((c) => c.group === group).map((c) => c.formulaKey);
  if (keys.length === 0) return null;
  const hasAny = keys.some((k) => metrics[k] !== undefined && metrics[k] !== null);
  if (!hasAny) return null;
  return keys.reduce((sum, k) => sum + (metrics[k] ?? 0), 0);
}

function CellValue({
  value,
  formatRupiah,
  tone,
}: {
  value: number | null;
  formatRupiah: (n: number) => string;
  tone: string;
}) {
  if (value === null) return <span className="text-gray-300 text-sm">—</span>;
  return <span className={`font-bold tabular-nums text-sm ${tone}`}>{formatRupiah(value)}</span>;
}

export default function DynamicActorSummary({
  month,
  formatRupiah,
  refreshKey,
  onOpenPeopleSettings,
}: Props) {
  const [collapsed, setCollapsed] = useState(true);

  const url = `/api/finance/summary-v2${month ? `?month=${encodeURIComponent(month)}` : ""}`;
  // Use a stable SWR key based only on the URL + explicit refresh tick.
  // Avoid embedding lastCashBookLoadAt here — that changes on every cashbook
  // reload and would bust the cache unnecessarily, causing a visible spinner
  // on every transaction add/edit. refreshKey (actorSummaryTick) only
  // increments when actor/formula settings actually change.
  const swrKey = refreshKey != null && refreshKey !== "" && refreshKey !== 0
    ? `${url}__r${refreshKey}`
    : url;

  const { data, error, isLoading } = useSWR<SummaryV2Response>(
    swrKey,
    () => fetchSummary(url),
    { keepPreviousData: true }
  );

  const hasGroup = useMemo(() => {
    const cols = data?.columns ?? [];
    return {
      profit_share: cols.some((c) => c.group === "profit_share"),
      cash_advance: cols.some((c) => c.group === "cash_advance"),
      bonus: cols.some((c) => c.group === "bonus"),
    };
  }, [data]);

  if (isLoading && !data) {
    return (
      <div className="mb-6 bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-800 px-4 py-3 text-sm text-gray-500 dark:text-slate-400">
        Memuat ringkasan pengurus…
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mb-6 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-700">
        Gagal memuat ringkasan: {(error as Error).message}
      </div>
    );
  }

  const rows = data?.rows ?? [];
  const columns = data?.columns ?? [];
  const legacyCount = data?.legacyOrphanFormulas ?? 0;
  const actorRows = rows.filter((r) => !r.isGlobal);

  if (actorRows.length === 0) {
    return (
      <div className="mb-6 space-y-2">
        <div className="bg-blue-50 dark:bg-slate-800 border border-blue-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-blue-800 dark:text-blue-200 flex flex-wrap items-center justify-between gap-2">
          <span>
            Belum ada pengurus terdaftar. Tambah di{" "}
            <strong>Pengaturan → Pengurus</strong>, lalu centang bagi hasil, kasbon,
            atau bonus agar angka muncul di kolom di bawah.
          </span>
          {onOpenPeopleSettings && (
            <button
              type="button"
              onClick={onOpenPeopleSettings}
              className="text-blue-700 dark:text-blue-300 hover:text-blue-900 font-semibold underline whitespace-nowrap"
            >
              Buka Pengaturan → Pengurus
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6 space-y-2">
      <div className="rounded-xl border-2 border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
        <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            <svg
              className={`w-4 h-4 text-slate-500 transition-transform ${collapsed ? "-rotate-90" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            Pengurus Usaha
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
              ({actorRows.length} pengurus)
            </span>
          </button>
          {onOpenPeopleSettings && (
            <button
              type="button"
              onClick={onOpenPeopleSettings}
              className="p-1.5 rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
              title="Pengaturan → Pengurus"
              aria-label="Pengaturan Pengurus"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          )}
        </div>

        {!collapsed && (
          <div
            className="overflow-x-auto overflow-y-auto"
            style={{
              maxHeight: actorRows.length > 5 ? "320px" : undefined,
              scrollBehavior: "smooth",
            }}
          >
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-slate-800/80 text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-2 text-left">Nama</th>
                  <th className="px-4 py-2 text-left">Jabatan</th>
                  {hasGroup.profit_share && (
                    <th className="px-4 py-2 text-right text-amber-700 dark:text-amber-300">Bagi Hasil</th>
                  )}
                  {hasGroup.cash_advance && (
                    <th className="px-4 py-2 text-right text-violet-700 dark:text-violet-300">Kasbon</th>
                  )}
                  {hasGroup.bonus && (
                    <th className="px-4 py-2 text-right text-emerald-700 dark:text-emerald-300">Bonus</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {actorRows.map((row) => {
                  const ps = sumGroup(row.metrics, columns, "profit_share");
                  const ca = sumGroup(row.metrics, columns, "cash_advance");
                  const bn = sumGroup(row.metrics, columns, "bonus");
                  const noMetrics = ps === null && ca === null && bn === null;
                  return (
                    <tr
                      key={row.actorId ?? row.displayName}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition-colors"
                    >
                      <td className="px-4 py-3 align-top min-w-0">
                        <div className="font-semibold text-gray-900 dark:text-slate-100 truncate">{row.displayName}</div>
                        {noMetrics && (
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Belum ada rumus — edit di Pengaturan → Pengurus
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top text-xs text-gray-500 dark:text-slate-400 truncate">
                        {row.roleLabel}
                      </td>
                      {hasGroup.profit_share && (
                        <td className="px-4 py-3 align-top text-right whitespace-nowrap">
                          <CellValue value={ps} formatRupiah={formatRupiah} tone="text-amber-800 dark:text-amber-200" />
                        </td>
                      )}
                      {hasGroup.cash_advance && (
                        <td className="px-4 py-3 align-top text-right whitespace-nowrap">
                          <CellValue value={ca} formatRupiah={formatRupiah} tone="text-violet-800 dark:text-violet-200" />
                        </td>
                      )}
                      {hasGroup.bonus && (
                        <td className="px-4 py-3 align-top text-right whitespace-nowrap">
                          <CellValue value={bn} formatRupiah={formatRupiah} tone="text-emerald-800 dark:text-emerald-200" />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {legacyCount > 0 && (
        <p className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-slate-800 border border-amber-200 dark:border-amber-800/50 rounded-lg px-3 py-2">
          {legacyCount} rumus lama masih aktif di belakang layar. Kelola pengurus di{" "}
          {onOpenPeopleSettings ? (
            <button type="button" onClick={onOpenPeopleSettings} className="underline font-semibold">
              Pengaturan → Pengurus
            </button>
          ) : (
            <strong>Pengaturan → Pengurus</strong>
          )}
          , lalu nonaktifkan sisa rumus lama di Pengaturan → Kolom bila sudah tidak dipakai.
        </p>
      )}
    </div>
  );
}
