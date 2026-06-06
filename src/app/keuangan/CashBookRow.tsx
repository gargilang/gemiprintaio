"use client";

import { memo } from "react";
import type { CashBook, KategoriTransaksi } from "@/types/database";
import { stripReferenceId, type KategoriColor } from "./keuangan-utils";

// Baris tabel buku kas (memoized) — diekstrak dari page.tsx (Fase 6 C1).
// Murni presentational: semua data + handler datang lewat props.

export interface CashBookRowProps {
  cashBook: CashBook;
  index: number;
  viewingArchive: boolean;
  formatRupiah: (amount: number) => string;
  formatDateJakarta: (date: string) => string;
  getKategoriColor: (kategori: KategoriTransaksi) => KategoriColor;
  onEdit: (cb: CashBook) => void;
  onEditManual: (cb: CashBook) => void;
  onDelete: (cb: CashBook) => void;
}

const CashBookRow = memo(function CashBookRow({
  cashBook,
  index,
  viewingArchive,
  formatRupiah,
  formatDateJakarta,
  getKategoriColor,
  onEdit,
  onEditManual,
  onDelete,
}: CashBookRowProps) {
  const kategoriColor = getKategoriColor(cashBook.kategori_transaksi);

  return (
    <tr
      className={`
        hover:bg-orange-50 transition-all cursor-default
        ${index % 2 === 0 ? "bg-white dark:bg-slate-900" : "bg-gray-50 dark:bg-slate-800"}
      `}
    >
      <td className="px-3 py-3 text-sm text-gray-700 dark:text-slate-300 whitespace-nowrap">
        {formatDateJakarta(cashBook.tanggal)}
      </td>
      <td className="px-3 py-3">
        <span
          className={`inline-block px-2 py-1 text-xs font-semibold rounded-lg border ${kategoriColor.bg} ${kategoriColor.text} ${kategoriColor.border}`}
        >
          {cashBook.kategori_transaksi}
        </span>
      </td>
      <td className="px-3 py-3 text-sm text-right font-semibold">
        {cashBook.debit > 0 ? (
          <span className="text-green-600">
            +{formatRupiah(cashBook.debit)}
          </span>
        ) : cashBook.kredit > 0 ? (
          <span className="text-red-600">
            -{formatRupiah(cashBook.kredit)}
          </span>
        ) : (
          <span className="text-gray-400">-</span>
        )}
      </td>
      <td className="px-3 py-3 text-sm text-gray-700 dark:text-slate-300 max-w-xs truncate">
        {stripReferenceId(cashBook.keperluan) || "-"}
      </td>
      <td className="px-3 py-3 text-sm text-right font-bold text-pink-600">
        {formatRupiah(cashBook.saldo)}
      </td>
      <td className="px-3 py-3 text-center">
        <div className="flex gap-2 justify-center">
          {!viewingArchive ? (
            <>
              <button
                onClick={() => onEdit(cashBook)}
                className="p-2 text-pink-600 hover:bg-slate-100 dark:hover:bg-white/10 dark:bg-slate-800 rounded-lg transition-colors inline-flex items-center justify-center"
                title="Edit Transaksi"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
              </button>
              <button
                onClick={() => onEditManual(cashBook)}
                className="p-2 text-orange-600 dark:text-orange-300 hover:bg-slate-100 dark:hover:bg-white/10 dark:bg-slate-800 rounded-lg transition-colors inline-flex items-center justify-center"
                title="Edit Manual (Timpa)"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                  />
                </svg>
              </button>
              <button
                onClick={() => onDelete(cashBook)}
                className="p-2 text-red-600 hover:bg-red-50 dark:bg-red-950/40 rounded-lg transition-colors inline-flex items-center justify-center"
                title="Hapus"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </>
          ) : (
            <span className="text-gray-400 text-sm italic">Hanya baca</span>
          )}
        </div>
      </td>
    </tr>
  );
});

export default CashBookRow;
