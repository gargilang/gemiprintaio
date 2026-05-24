"use client";

/**
 * Halaman Aktivitas — audit log view-only.
 *
 * Menampilkan timeline event yang sensitive untuk owner percetakan:
 *   - Pembelian dibatalkan (siapa, kapan, alasan)
 *   - Penjualan dibatalkan
 *   - Adjustment stok manual
 *   - Material rusak (waste)
 *   - NSFP yang dibatalkan
 *
 * Tidak ada tombol edit/delete — audit log harus immutable.
 */

import { useEffect, useState } from "react";
import { getAuditLogAction } from "./actions";

interface AuditEvent {
  id: string;
  kind:
    | "PURCHASE_VOID"
    | "SALE_VOID"
    | "ADJUSTMENT"
    | "WASTE"
    | "NSFP_CANCEL";
  occurred_at: string;
  title: string;
  reason?: string | null;
  actor_id?: string | null;
  ref_id?: string | null;
  amount?: number | null;
  amount_label?: string | null;
}

const KIND_META: Record<
  AuditEvent["kind"],
  { label: string; color: string; icon: string }
> = {
  PURCHASE_VOID: {
    label: "Pembelian dibatalkan",
    color: "bg-rose-100 text-rose-800",
    icon: "🛒",
  },
  SALE_VOID: {
    label: "Penjualan dibatalkan",
    color: "bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200",
    icon: "💳",
  },
  ADJUSTMENT: {
    label: "Adjustment stok",
    color: "bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200",
    icon: "⚖️",
  },
  WASTE: {
    label: "Material rusak",
    color: "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200",
    icon: "🗑",
  },
  NSFP_CANCEL: {
    label: "NSFP batal",
    color: "bg-gray-200 text-gray-700 dark:text-slate-300",
    icon: "📄",
  },
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AktivitasPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterKind, setFilterKind] = useState<"ALL" | AuditEvent["kind"]>("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const rows = await getAuditLogAction({
        from: from || undefined,
        to: to || undefined,
        limit: 500,
      });
      setEvents(rows as AuditEvent[]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered =
    filterKind === "ALL" ? events : events.filter((e) => e.kind === filterKind);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-gradient-to-br from-slate-600 to-slate-700 rounded-xl">
          <svg
            className="w-8 h-8 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
            />
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-slate-100">Aktivitas</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Catatan permanen pembatalan, adjustment, dan event sensitif lainnya.
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">
              Jenis
            </label>
            <select
              value={filterKind}
              onChange={(e) => setFilterKind(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="ALL">Semua</option>
              <option value="PURCHASE_VOID">Pembelian dibatalkan</option>
              <option value="SALE_VOID">Penjualan dibatalkan</option>
              <option value="ADJUSTMENT">Adjustment stok</option>
              <option value="WASTE">Material rusak</option>
              <option value="NSFP_CANCEL">NSFP batal</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">
              Dari tanggal
            </label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">
              Sampai tanggal
            </label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={load}
              className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 w-full"
            >
              Terapkan filter
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-500 dark:text-slate-400">
          {filtered.length} event{from || to ? " dalam rentang tanggal" : ""}
        </p>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800">
        {loading ? (
          <div className="text-gray-500 dark:text-slate-400 py-12 text-center">Memuat aktivitas...</div>
        ) : filtered.length === 0 ? (
          <div className="text-gray-400 py-12 text-center">
            Tidak ada event dalam rentang ini.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filtered.map((event) => {
              const meta = KIND_META[event.kind];
              return (
                <li key={event.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-start gap-3">
                    <div className="text-2xl flex-shrink-0" aria-hidden>
                      {meta.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${meta.color}`}
                        >
                          {meta.label}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-slate-400">
                          {formatDateTime(event.occurred_at)}
                        </span>
                        {event.actor_id && (
                          <span className="text-xs text-gray-400">
                            oleh {event.actor_id}
                          </span>
                        )}
                      </div>
                      <p className="font-medium text-gray-800 dark:text-slate-100 mt-1 truncate">
                        {event.title}
                      </p>
                      {event.amount_label && (
                        <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                          {event.amount_label}
                          {event.amount != null &&
                          (event.kind === "PURCHASE_VOID" ||
                            event.kind === "SALE_VOID")
                            ? `: Rp ${Number(event.amount).toLocaleString("id-ID")}`
                            : ""}
                        </p>
                      )}
                      {event.reason && (
                        <p className="text-sm text-gray-600 dark:text-slate-300 mt-1 italic border-l-4 border-gray-200 dark:border-slate-800 pl-3">
                          “{event.reason}”
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
