"use client";

/**
 * Surat Jalan list table.
 *
 * Shows: nomor SJ, tanggal, penerima, ref invoice (if any), status badge, aksi.
 * Click row to expand and see items. Status flow buttons:
 *   DRAFT → TERKIRIM → DITERIMA (each step is one click)
 *   DRAFT can be edited / deleted; TERKIRIM/DITERIMA are read-only.
 */

import React, { useState } from "react";
import type {
  SuratJalan,
  SuratJalanStatus,
} from "@/lib/services/surat-jalan-service";
import { TrashIcon } from "./icons/ContentIcons";

interface SuratJalanTableProps {
  data: SuratJalan[];
  loading: boolean;
  onPreview: (sj: SuratJalan) => void;
  onPrint: (sj: SuratJalan) => void;
  onEdit: (sj: SuratJalan) => void;
  onDelete: (sj: SuratJalan) => void;
  onAdvanceStatus: (sj: SuratJalan, next: SuratJalanStatus) => void;
}

function formatDate(dateStr: string) {
  if (!dateStr) return "-";
  // Handle YYYY-MM-DD as local
  const onlyDate = /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
  if (onlyDate) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }
  return new Date(dateStr).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: SuratJalanStatus }) {
  const styles: Record<SuratJalanStatus, string> = {
    DRAFT:
      "bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 border-gray-300 dark:border-slate-600",
    TERKIRIM:
      "bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-800/50",
    DITERIMA:
      "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 border-green-300 dark:border-green-800/50",
    BATAL:
      "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-300 dark:border-red-800/50",
  };
  return (
    <span
      className={`inline-block px-2 py-1 rounded-lg text-xs font-semibold border ${styles[status]}`}
    >
      {status}
    </span>
  );
}

export default function SuratJalanTable({
  data,
  loading,
  onPreview,
  onPrint,
  onEdit,
  onDelete,
  onAdvanceStatus,
}: SuratJalanTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filtered = data.filter((sj) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      sj.nomor_sj.toLowerCase().includes(q) ||
      sj.pelanggan_nama?.toLowerCase().includes(q) ||
      sj.nomor_invoice?.toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#00afef]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 max-w-md">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nomor SJ, penerima, atau ref invoice..."
            className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00afef] dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500 dark:text-slate-400">Total</div>
          <div className="text-lg font-bold text-gray-800 dark:text-slate-100">
            {filtered.length} SJ
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700">
          <p className="text-gray-600 dark:text-slate-300 font-semibold">
            Belum ada surat jalan
          </p>
          <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">
            Buat surat jalan baru atau dari riwayat penjualan
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 dark:border-slate-700 rounded-lg max-h-[700px] overflow-y-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-[#00afef] to-[#2266ff] text-white">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold">No. SJ</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">Tanggal</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">Penerima</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">Ref. Invoice</th>
                <th className="px-4 py-3 text-center text-xs font-semibold">Item</th>
                <th className="px-4 py-3 text-center text-xs font-semibold">Status</th>
                <th className="px-4 py-3 text-center text-xs font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((sj, idx) => (
                <React.Fragment key={sj.id}>
                  <tr
                    onClick={() => setExpandedId(expandedId === sj.id ? null : sj.id)}
                    className={`border-b border-gray-200 dark:border-slate-700 hover:bg-cyan-50 dark:hover:bg-slate-800/50 transition-all cursor-pointer ${
                      idx % 2 === 0 ? "bg-white dark:bg-slate-900" : "bg-gray-50 dark:bg-slate-800/40"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-bold text-gray-800 dark:text-slate-100">
                        {sj.nomor_sj}
                      </div>
                      {sj.dibuat_oleh_nama && (
                        <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                          oleh: {sj.dibuat_oleh_nama}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">
                      {formatDate(sj.tanggal)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-800 dark:text-slate-100 font-semibold">
                        {sj.pelanggan_nama || (
                          <span className="text-gray-400 italic">—</span>
                        )}
                      </div>
                      {sj.pelanggan_alamat && (
                        <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5 truncate max-w-xs">
                          {sj.pelanggan_alamat}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">
                      {sj.nomor_invoice || (
                        <span className="text-gray-400 italic">manual</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-block px-2 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded text-xs font-semibold">
                        {sj.items?.length ?? 0} item
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={sj.status} />
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1.5 flex-wrap">
                        <button
                          onClick={() => onPreview(sj)}
                          className="p-2 text-indigo-600 dark:text-indigo-300 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-colors"
                          title="Preview surat jalan"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => onPrint(sj)}
                          className="p-2 text-blue-600 dark:text-blue-300 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-colors"
                          title="Cetak"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                          </svg>
                        </button>
                        {sj.status === "DRAFT" && (
                          <>
                            <button
                              onClick={() => onEdit(sj)}
                              className="p-2 text-amber-600 dark:text-amber-300 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-colors"
                              title="Edit"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => onAdvanceStatus(sj, "TERKIRIM")}
                              className="px-2 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold rounded transition-colors"
                              title="Tandai sudah terkirim"
                            >
                              Kirim →
                            </button>
                          </>
                        )}
                        {sj.status === "TERKIRIM" && (
                          <button
                            onClick={() => onAdvanceStatus(sj, "DITERIMA")}
                            className="px-2 py-1.5 bg-green-500 hover:bg-green-600 text-white text-[10px] font-bold rounded transition-colors"
                            title="Tandai sudah diterima"
                          >
                            Terima ✓
                          </button>
                        )}
                        {sj.status === "DRAFT" && (
                          <button
                            onClick={() => onDelete(sj)}
                            className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                            title="Hapus"
                          >
                            <TrashIcon size={16} className="text-red-500" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {expandedId === sj.id && sj.items && sj.items.length > 0 && (
                    <tr className="bg-gradient-to-r from-cyan-50/50 to-blue-50/50 dark:from-slate-800/40 dark:to-slate-800/40">
                      <td colSpan={7} className="px-4 py-3">
                        <div className="text-xs">
                          <div className="font-semibold text-gray-700 dark:text-slate-300 mb-2">
                            Detail Item:
                          </div>
                          <div className="space-y-1">
                            {sj.items.map((item, i) => (
                              <div
                                key={i}
                                className="flex items-center justify-between py-1 px-2 bg-white dark:bg-slate-900/60 rounded"
                              >
                                <div className="flex-1">
                                  <span className="font-semibold text-gray-800 dark:text-slate-100">
                                    {i + 1}. {item.nama_barang}
                                  </span>
                                  {item.keterangan && (
                                    <span className="text-gray-500 dark:text-slate-400 ml-2">
                                      ({item.keterangan})
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 text-gray-700 dark:text-slate-300">
                                  {item.ukuran && (
                                    <span>
                                      Ukuran:{" "}
                                      <span className="font-semibold">{item.ukuran}</span>
                                    </span>
                                  )}
                                  <span>
                                    Qty:{" "}
                                    <span className="font-semibold">
                                      {item.qty}
                                      {item.satuan ? ` ${item.satuan}` : ""}
                                    </span>
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                          {sj.catatan && (
                            <div className="mt-2 text-gray-600 dark:text-slate-400">
                              <span className="font-semibold">Catatan:</span>{" "}
                              {sj.catatan}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
