"use client";

/**
 * Tab "Tutup Periode" di Settings — kelola accounting_periods.
 *
 * Saat owner percetakan tutup periode (mis. setelah lapor pajak), semua RPC
 * void/adjustment/waste/retur akan menolak transaksi yang tanggalnya jatuh
 * di periode CLOSED. Ini melindungi data laporan periode yang sudah
 * di-finalize.
 */

import { useEffect, useState } from "react";
import {
  listAccountingPeriodsAction,
  closePeriodAction,
  reopenPeriodAction,
} from "./period-actions";

interface Period {
  id: string;
  period_key: string;
  start_date: string;
  end_date: string;
  status: "OPEN" | "CLOSED";
  closed_at?: string | null;
  closed_by?: string | null;
  catatan?: string | null;
}

const MONTHS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

export default function PeriodCloseTab() {
  const today = new Date();
  const [periods, setPeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [catatan, setCatatan] = useState("");
  const [notice, setNotice] = useState<{
    kind: "success" | "error";
    msg: string;
  } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const rows = await listAccountingPeriodsAction();
      setPeriods(rows as Period[]);
    } catch (e: any) {
      setNotice({ kind: "error", msg: e?.message || "Gagal memuat periode" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const showMsg = (kind: "success" | "error", msg: string) => {
    setNotice({ kind, msg });
    setTimeout(() => setNotice(null), 4000);
  };

  const handleClose = async () => {
    if (
      !confirm(
        `Tutup periode ${MONTHS[month - 1]} ${year}? Setelah ditutup, void/adjustment/waste tidak boleh lagi di tanggal periode ini.`
      )
    )
      return;
    try {
      await closePeriodAction({
        year,
        month,
        catatan: catatan.trim() || null,
      });
      showMsg("success", "Periode berhasil ditutup");
      setCatatan("");
      await load();
    } catch (e: any) {
      showMsg("error", e?.message || "Gagal menutup periode");
    }
  };

  const handleReopen = async (period: Period) => {
    const alasan = prompt(
      `Alasan buka kembali periode ${period.period_key} (akan tercatat permanen):`
    );
    if (!alasan?.trim()) return;
    try {
      const [y, m] = period.period_key.split("-").map(Number);
      await reopenPeriodAction({ year: y, month: m, alasan: alasan.trim() });
      showMsg("success", `Periode ${period.period_key} dibuka kembali`);
      await load();
    } catch (e: any) {
      showMsg("error", e?.message || "Gagal membuka kembali periode");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
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
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-slate-100">Tutup Periode</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Setelah periode ditutup, transaksi di tanggal periode itu tidak
            bisa di-void / adjust / waste lagi. Pakai ini setelah lapor pajak
            atau finalisasi laporan bulanan.
          </p>
        </div>
      </div>

      {notice && (
        <div
          className={`px-4 py-3 rounded-lg text-sm ${
            notice.kind === "success"
              ? "bg-green-50 dark:bg-slate-800 text-green-700 border border-green-200 dark:border-slate-700"
              : "bg-red-50 dark:bg-red-950/40 text-red-700 border border-red-200 dark:border-red-800/50"
          }`}
        >
          {notice.msg}
        </div>
      )}

      <section className="bg-gray-50 dark:bg-slate-800 rounded-xl p-6 border-2 border-gray-200 dark:border-slate-800 space-y-4">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100">
          Tutup periode baru
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">
              Bulan
            </label>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">
              Tahun
            </label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">
              Catatan (opsional)
            </label>
            <input
              type="text"
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
              placeholder="Misal: SPT Masa PPN bulan ini sudah lapor"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800"
        >
          Tutup periode {MONTHS[month - 1]} {year}
        </button>
      </section>

      <section className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100 px-4 py-3 border-b border-gray-200 dark:border-slate-800">
          Riwayat Periode
        </h3>
        {loading ? (
          <div className="text-center py-8 text-gray-500 dark:text-slate-400">
            Memuat periode...
          </div>
        ) : periods.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            Belum ada periode tercatat. Sistem akan auto-create saat Anda
            menutup periode pertama.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {periods.map((p) => (
              <li
                key={p.id}
                className="px-4 py-3 flex items-center justify-between"
              >
                <div>
                  <div className="font-medium text-gray-800 dark:text-slate-100">
                    {p.period_key}
                    <span
                      className={`ml-2 inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        p.status === "CLOSED"
                          ? "bg-gray-200 text-gray-700 dark:text-slate-300"
                          : "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200"
                      }`}
                    >
                      {p.status}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                    {p.start_date} → {p.end_date}
                    {p.closed_at && (
                      <>
                        {" · ditutup "}
                        {new Date(p.closed_at).toLocaleString("id-ID")}
                      </>
                    )}
                  </div>
                  {p.catatan && (
                    <div className="text-xs italic text-gray-600 dark:text-slate-300 mt-1">
                      “{p.catatan}”
                    </div>
                  )}
                </div>
                {p.status === "CLOSED" && (
                  <button
                    type="button"
                    onClick={() => handleReopen(p)}
                    className="text-xs px-3 py-1 rounded border border-amber-500 text-amber-700 dark:text-amber-300 hover:bg-slate-50 dark:hover:bg-white/5 dark:bg-slate-800"
                  >
                    Buka kembali
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
