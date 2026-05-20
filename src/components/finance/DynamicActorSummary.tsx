"use client";

/**
 * Per-person finance summary from Kelola Orang — one row per person.
 * Only shows business_actors that have linked formulas (actor_id set).
 * Legacy orphan formulas (no actor_id) are not shown here.
 */

import { useEffect, useState } from "react";

interface ActorRow {
  actorId: string;
  displayName: string;
  roleLabel: string;
  profitShare: number | null;
  cashAdvance: number | null;
  bonus: number | null;
  displayOrder: number;
}

interface SummaryV2Response {
  month: string | null;
  actorRows: ActorRow[];
  legacyOrphanFormulas: number;
}

interface Props {
  month?: string;
  formatRupiah: (n: number) => string;
  refreshKey?: string | number;
  /** Called after each fetch with the number of legacy orphan formulas. */
  onLegacyCount?: (count: number) => void;
}

function CellValue({
  value,
  formatRupiah,
  tone,
}: {
  value: number | null;
  formatRupiah: (n: number) => string;
  tone: "amber" | "violet" | "emerald";
}) {
  if (value === null) {
    return <span className="text-gray-300 text-sm">—</span>;
  }
  const toneClass =
    tone === "amber"
      ? "text-amber-800"
      : tone === "violet"
        ? "text-violet-800"
        : "text-emerald-800";
  return (
    <span className={`font-bold tabular-nums text-sm ${toneClass}`}>
      {formatRupiah(value)}
    </span>
  );
}

export default function DynamicActorSummary({
  month,
  formatRupiah,
  refreshKey,
  onLegacyCount,
}: Props) {
  const [data, setData] = useState<SummaryV2Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const url = `/api/finance/summary-v2${month ? `?month=${encodeURIComponent(month)}` : ""}`;
    fetch(url)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body?.error || "Gagal memuat ringkasan");
        if (!cancelled) {
          setData(body as SummaryV2Response);
          onLegacyCount?.((body as SummaryV2Response).legacyOrphanFormulas ?? 0);
        }
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [month, refreshKey]);

  if (loading) {
    return (
      <div className="mb-6 bg-white rounded-xl shadow-sm border border-gray-200 px-4 py-3 text-sm text-gray-500">
        Memuat ringkasan orang…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mb-6 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-700">
        Gagal memuat ringkasan: {error}
      </div>
    );
  }

  const rows = data?.actorRows ?? [];
  const legacyCount = data?.legacyOrphanFormulas ?? 0;

  if (rows.length === 0) {
    return (
      <div className="mb-6 space-y-2">
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800 flex flex-wrap items-center justify-between gap-2">
          <span>
            Belum ada orang di <strong>Kelola Orang</strong> dengan bagi hasil,
            kasbon, atau bonus aktif. Tambah orang di sana — satu baris di sini
            menampilkan semua angkanya sekaligus.
          </span>
          <a
            href="/kelola-orang"
            className="text-blue-700 hover:text-blue-900 font-semibold underline whitespace-nowrap"
          >
            Buka Kelola Orang →
          </a>
        </div>
        {legacyCount > 0 && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Ada {legacyCount} rumus lama dari sistem sebelumnya yang masih aktif
            di bar <strong>Bagi Hasil / Kasbon</strong> di bawah.
            Itu bukan dari Kelola Orang — setelah Anda menambah orang di sana,
            baris ini menggantikan tampilan terpisah per kategori.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mb-6 space-y-2">
      <div className="rounded-xl border-2 border-slate-200 overflow-hidden bg-white shadow-sm">
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-bold text-slate-800">
            Ringkasan per orang
            <span className="ml-2 text-xs font-normal text-slate-500">
              ({rows.length} orang)
            </span>
          </h3>
          <a
            href="/kelola-orang"
            className="text-xs text-blue-600 hover:text-blue-800 font-semibold"
          >
            Kelola Orang →
          </a>
        </div>

        {/* Header — desktop */}
        <div className="hidden md:grid md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3 px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-500 border-b border-gray-100 bg-gray-50/80">
          <span>Nama</span>
          <span>Jabatan</span>
          <span className="text-right text-amber-700">Bagi hasil</span>
          <span className="text-right text-violet-700">Kasbon</span>
          <span className="text-right text-emerald-700">Bonus</span>
        </div>

        <ul className="divide-y divide-gray-100">
          {rows.map((row) => (
            <li
              key={row.actorId}
              className="px-4 py-3 hover:bg-slate-50/80 transition-colors md:grid md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] md:gap-3 md:items-center"
            >
              <div className="font-semibold text-gray-900 truncate">
                {row.displayName}
              </div>
              <div className="text-xs text-gray-500 mt-0.5 md:mt-0 truncate">
                {row.roleLabel}
              </div>
              <div className="mt-2 md:mt-0 flex items-center justify-between md:justify-end gap-2">
                <span className="text-xs text-gray-400 md:hidden">Bagi hasil</span>
                <CellValue
                  value={row.profitShare}
                  formatRupiah={formatRupiah}
                  tone="amber"
                />
              </div>
              <div className="mt-1 md:mt-0 flex items-center justify-between md:justify-end gap-2">
                <span className="text-xs text-gray-400 md:hidden">Kasbon</span>
                <CellValue
                  value={row.cashAdvance}
                  formatRupiah={formatRupiah}
                  tone="violet"
                />
              </div>
              <div className="mt-1 md:mt-0 flex items-center justify-between md:justify-end gap-2">
                <span className="text-xs text-gray-400 md:hidden">Bonus</span>
                <CellValue
                  value={row.bonus}
                  formatRupiah={formatRupiah}
                  tone="emerald"
                />
              </div>
            </li>
          ))}
        </ul>
      </div>

        {legacyCount > 0 && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Masih ada {legacyCount} rumus lama yang belum terhubung ke orang di Kelola Orang — tampil
          di bar Bagi Hasil / Kasbon di bawah. Tambahkan orang di{" "}
          <a href="/kelola-orang" className="underline font-semibold">
            Kelola Orang
          </a>{" "}
          lalu nonaktifkan rumus lama di Kalkulasi Keuangan bila sudah tidak dipakai.
        </p>
      )}
    </div>
  );
}
