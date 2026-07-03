"use client";

/**
 * Laporan PPN Bulanan — output untuk dasar input ke Coretax DJP.
 *
 * Menampilkan dua section:
 *   1. PPN keluaran (penjualan kena PPN) dengan kolom NSFP dan NPWP pelanggan.
 *   2. PPN masukan (pembelian kena PPN) dengan kolom faktur pajak vendor dan
 *      flag dapat_dikreditkan.
 *
 * Ringkasan: total DPP/PPN keluaran, total PPN masukan kreditable, dan
 * PPN terhutang (kurang/lebih bayar).
 *
 * Catatan: ini bukan e-faktur. NSFP harus tetap di-input ke Coretax sendiri.
 * Halaman ini hanya audit/cross-check supaya angka di Coretax cocok dengan
 * data toko.
 */

import { useEffect, useMemo, useState } from "react";
import { getPpnReportAction } from "@/app/laporan-ppn/actions";
import { formatNpwp } from "@/lib/ppn-helpers";

interface KeluaranRow {
  penjualan_id: string;
  nomor_faktur: string;
  tanggal_faktur_pajak: string | null;
  tanggal_transaksi: string;
  nsfp: string | null;
  pelanggan_nama: string | null;
  pelanggan_npwp: string | null;
  dpp_total: number;
  ppn_total: number;
  total_jumlah: number;
  status_transaksi: string;
}

interface MasukanRow {
  pembelian_id: string;
  nomor_pembelian: string | null;
  nomor_faktur_pajak_vendor: string | null;
  tanggal_faktur_pajak: string | null;
  tanggal_transaksi: string;
  vendor_nama: string | null;
  vendor_npwp: string | null;
  dpp_total: number;
  ppn_total: number;
  total_jumlah: number;
  dapat_dikreditkan: number;
}

interface Report {
  keluaran: KeluaranRow[];
  masukan: MasukanRow[];
  total_dpp_keluaran: number;
  total_ppn_keluaran: number;
  total_dpp_masukan: number;
  total_ppn_masukan: number;
  total_ppn_masukan_kreditable: number;
  ppn_terhutang: number;
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

function fmt(n: number): string {
  return Number(n).toLocaleString("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export default function LaporanPpnPanel() {
  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPpnReportAction({ year, month });
      setReport(data as Report);
    } catch (e: any) {
      setError(e?.message || "Gagal memuat laporan PPN");
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportCsv = () => {
    if (!report) return;
    const rows: string[] = [];
    rows.push(
      [
        "Section",
        "Tanggal Faktur Pajak",
        "Tanggal Transaksi",
        "NSFP / No. Faktur Pajak Vendor",
        "Nomor Faktur / Pembelian",
        "Nama Lawan Transaksi",
        "NPWP Lawan",
        "DPP",
        "PPN",
        "Total",
        "Catatan",
      ]
        .map((c) => `"${c}"`)
        .join(",")
    );
    for (const r of report.keluaran) {
      rows.push(
        [
          "KELUARAN",
          r.tanggal_faktur_pajak || "",
          r.tanggal_transaksi,
          r.nsfp || "",
          r.nomor_faktur,
          r.pelanggan_nama || "",
          r.pelanggan_npwp || "",
          r.dpp_total,
          r.ppn_total,
          r.total_jumlah,
          r.status_transaksi,
        ]
          .map((c) => `"${String(c).replace(/"/g, '""')}"`)
          .join(",")
      );
    }
    for (const r of report.masukan) {
      rows.push(
        [
          "MASUKAN",
          r.tanggal_faktur_pajak || "",
          r.tanggal_transaksi,
          r.nomor_faktur_pajak_vendor || "",
          r.nomor_pembelian || "",
          r.vendor_nama || "",
          r.vendor_npwp || "",
          r.dpp_total,
          r.ppn_total,
          r.total_jumlah,
          r.dapat_dikreditkan ? "Kreditable" : "Non-kreditable",
        ]
          .map((c) => `"${String(c).replace(/"/g, '""')}"`)
          .join(",")
      );
    }
    const blob = new Blob([rows.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `laporan-ppn-${year}-${String(month).padStart(2, "0")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl">
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
              d="M9 17v-2a4 4 0 014-4h4M9 5H4v6h5V5zm0 8H4v6h5v-6zm10-8h-5v6h5V5zm0 8h-5v6h5v-6z"
            />
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-slate-100">Laporan PPN</h1>
          <p className="text-base text-gray-500 dark:text-slate-400">
            Rekap PPN keluaran (penjualan) dan masukan (pembelian) per bulan,
            untuk cross-check ke Coretax DJP.
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-base font-medium text-gray-700 dark:text-slate-300 mb-1">
              Bulan
            </label>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg"
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-base font-medium text-gray-700 dark:text-slate-300 mb-1">
              Tahun
            </label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg"
            />
          </div>
          <button
            type="button"
            onClick={load}
            className="px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
          >
            Muat ulang
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!report}
            className="px-4 py-2.5 border border-emerald-600 text-emerald-700 dark:text-emerald-300 rounded-lg hover:bg-slate-50 dark:hover:bg-white/5 dark:bg-slate-800 disabled:opacity-50"
          >
            Ekspor CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      {loading && (
        <div className="text-gray-500 dark:text-slate-400 py-12 text-center">Memuat laporan PPN...</div>
      )}

      {report && !loading && (
        <>
          {/* Ringkasan */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <SummaryCard
              label="DPP Keluaran"
              value={report.total_dpp_keluaran}
              tone="emerald"
            />
            <SummaryCard
              label="PPN Keluaran"
              value={report.total_ppn_keluaran}
              tone="emerald"
            />
            <SummaryCard
              label="PPN Masukan kreditable"
              value={report.total_ppn_masukan_kreditable}
              tone="blue"
            />
            <SummaryCard
              label={
                report.ppn_terhutang >= 0
                  ? "PPN kurang bayar"
                  : "PPN lebih bayar"
              }
              value={Math.abs(report.ppn_terhutang)}
              tone={report.ppn_terhutang >= 0 ? "amber" : "slate"}
            />
          </div>

          {/* PPN keluaran */}
          <section className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="font-semibold text-gray-800 dark:text-slate-100">
                PPN Keluaran ({report.keluaran.length})
              </h2>
              <span className="text-base text-gray-500 dark:text-slate-400">
                Total PPN: Rp {fmt(report.total_ppn_keluaran)}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-base">
                <thead className="bg-gray-50 dark:bg-slate-800 text-base uppercase text-gray-500 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2.5 text-left">Tgl Faktur</th>
                    <th className="px-3 py-2.5 text-left">NSFP</th>
                    <th className="px-3 py-2.5 text-left">Faktur</th>
                    <th className="px-3 py-2.5 text-left">Pelanggan</th>
                    <th className="px-3 py-2.5 text-left">NPWP</th>
                    <th className="px-3 py-2.5 text-right">DPP</th>
                    <th className="px-3 py-2.5 text-right">PPN</th>
                    <th className="px-3 py-2.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {report.keluaran.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="text-center py-6 text-gray-400"
                      >
                        Tidak ada penjualan kena PPN di bulan ini.
                      </td>
                    </tr>
                  ) : (
                    report.keluaran.map((r) => (
                      <tr key={r.penjualan_id} className="border-t border-gray-100 dark:border-slate-800">
                        <td className="px-3 py-2.5">
                          {r.tanggal_faktur_pajak || r.tanggal_transaksi}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-base">{r.nsfp || "—"}</td>
                        <td className="px-3 py-2.5">{r.nomor_faktur}</td>
                        <td className="px-3 py-2.5">{r.pelanggan_nama || "—"}</td>
                        <td className="px-3 py-2.5 text-base font-mono">
                          {r.pelanggan_npwp ? formatNpwp(r.pelanggan_npwp) : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right">{fmt(r.dpp_total)}</td>
                        <td className="px-3 py-2.5 text-right">{fmt(r.ppn_total)}</td>
                        <td className="px-3 py-2.5 text-right font-medium">
                          {fmt(r.total_jumlah)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {report.keluaran.length > 0 && (
                  <tfoot className="bg-gray-50 dark:bg-slate-800 text-base font-semibold">
                    <tr>
                      <td colSpan={5} className="px-3 py-2.5 text-right">
                        Total
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {fmt(report.total_dpp_keluaran)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {fmt(report.total_ppn_keluaran)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {fmt(
                          report.total_dpp_keluaran + report.total_ppn_keluaran
                        )}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </section>

          {/* PPN masukan */}
          <section className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="font-semibold text-gray-800 dark:text-slate-100">
                PPN Masukan ({report.masukan.length})
              </h2>
              <span className="text-base text-gray-500 dark:text-slate-400">
                Kreditable: Rp {fmt(report.total_ppn_masukan_kreditable)} dari
                total Rp {fmt(report.total_ppn_masukan)}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-base">
                <thead className="bg-gray-50 dark:bg-slate-800 text-base uppercase text-gray-500 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2.5 text-left">Tgl Faktur</th>
                    <th className="px-3 py-2.5 text-left">No. Faktur Vendor</th>
                    <th className="px-3 py-2.5 text-left">No. Pembelian</th>
                    <th className="px-3 py-2.5 text-left">Vendor</th>
                    <th className="px-3 py-2.5 text-left">NPWP</th>
                    <th className="px-3 py-2.5 text-right">DPP</th>
                    <th className="px-3 py-2.5 text-right">PPN</th>
                    <th className="px-3 py-2.5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {report.masukan.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="text-center py-6 text-gray-400"
                      >
                        Tidak ada pembelian kena PPN di bulan ini.
                      </td>
                    </tr>
                  ) : (
                    report.masukan.map((r) => (
                      <tr key={r.pembelian_id} className="border-t border-gray-100 dark:border-slate-800">
                        <td className="px-3 py-2.5">
                          {r.tanggal_faktur_pajak || r.tanggal_transaksi}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-base">
                          {r.nomor_faktur_pajak_vendor || "—"}
                        </td>
                        <td className="px-3 py-2.5">{r.nomor_pembelian || "—"}</td>
                        <td className="px-3 py-2.5">{r.vendor_nama || "—"}</td>
                        <td className="px-3 py-2.5 text-base font-mono">
                          {r.vendor_npwp ? formatNpwp(r.vendor_npwp) : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right">{fmt(r.dpp_total)}</td>
                        <td className="px-3 py-2.5 text-right">{fmt(r.ppn_total)}</td>
                        <td className="px-3 py-2.5 text-center">
                          {r.dapat_dikreditkan ? (
                            <span className="inline-block px-2 py-0.5 rounded text-base bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200">
                              Kreditable
                            </span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded text-base bg-gray-200 text-gray-700 dark:text-slate-300">
                              Non-kreditable
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {report.masukan.length > 0 && (
                  <tfoot className="bg-gray-50 dark:bg-slate-800 text-base font-semibold">
                    <tr>
                      <td colSpan={5} className="px-3 py-2.5 text-right">
                        Total
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {fmt(report.total_dpp_masukan)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {fmt(report.total_ppn_masukan)}
                      </td>
                      <td className="px-3 py-2.5"></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "blue" | "amber" | "slate";
}) {
  const cls = {
    emerald: "bg-emerald-50 dark:bg-slate-800 border-emerald-200 dark:border-slate-700 text-emerald-800 dark:text-emerald-200",
    blue: "bg-blue-50 dark:bg-slate-800 border-blue-200 dark:border-slate-700 text-blue-800 dark:text-blue-200",
    amber: "bg-amber-50 dark:bg-slate-800 border-amber-200 dark:border-amber-800/50 text-amber-800 dark:text-amber-200",
    slate: "bg-slate-50 dark:bg-slate-800 border-slate-200 text-slate-800",
  }[tone];
  return (
    <div className={`rounded-xl border-2 p-4 ${cls}`}>
      <div className="text-base uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-xl font-bold mt-1">Rp {fmt(value)}</div>
    </div>
  );
}
