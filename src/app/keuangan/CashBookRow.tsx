"use client";

import { memo } from "react";
import type { CashBook, KategoriTransaksi } from "@/types/database";
import {
  stripReferenceId,
  humanizeKategoriKode,
  adalahKategoriNonKas,
  type KategoriColor,
} from "./keuangan-utils";
import MenuAksi from "@/components/MenuAksi";

// Baris tabel buku kas (memoized) — diekstrak dari page.tsx (Fase 6 C1).
// Murni presentational: semua data + handler datang lewat props.

export interface CashBookRowProps {
  cashBook: CashBook;
  index: number;
  viewingArchive: boolean;
  formatRupiah: (amount: number) => string;
  formatDateJakarta: (date: string) => string;
  getKategoriColor: (kategori: KategoriTransaksi) => KategoriColor;
  /** Peta kode kategori → label ramah manusia (dari konfigurasi keuangan). */
  kategoriLabelMap?: Map<string, string>;
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
  kategoriLabelMap,
  onEdit,
  onEditManual,
  onDelete,
}: CashBookRowProps) {
  const kategoriColor = getKategoriColor(cashBook.kategori_transaksi);
  const transaksiNonKas = adalahKategoriNonKas(cashBook.kategori_transaksi);
  // Tampilkan label ramah manusia (tanpa underscore), bukan kode mentah.
  // Prioritas: display_name dari konfigurasi → humanize kode sebagai fallback.
  const kategoriLabel =
    kategoriLabelMap?.get(cashBook.kategori_transaksi) ||
    humanizeKategoriKode(cashBook.kategori_transaksi);

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
          title={cashBook.kategori_transaksi}
        >
          {kategoriLabel}
        </span>
      </td>
      <td className="px-3 py-3 text-sm text-right font-semibold">
        {transaksiNonKas ? (
          <span
            className="inline-flex flex-col items-end text-slate-700 dark:text-slate-200"
            title="Jurnal perhitungan laba; tidak mengurangi saldo kas"
          >
            <span>{formatRupiah(cashBook.kredit || cashBook.debit)}</span>
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
              Non-kas
            </span>
          </span>
        ) : cashBook.debit > 0 ? (
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
        {!viewingArchive ? (
          <MenuAksi
            labelMenu="Aksi transaksi"
            aksi={[
              {
                label: "Edit Transaksi",
                judul: "Edit Transaksi",
                onClick: () => onEdit(cashBook),
                ikon: (
                  <svg
                    className="w-5 h-5 text-pink-600"
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
                ),
              },
              {
                label: "Edit Manual (Timpa)",
                judul: "Edit Manual (Timpa)",
                onClick: () => onEditManual(cashBook),
                ikon: (
                  <svg
                    className="w-5 h-5 text-orange-600 dark:text-orange-300"
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
                ),
              },
              {
                label: "Hapus",
                judul: "Hapus",
                varian: "bahaya",
                onClick: () => onDelete(cashBook),
                ikon: (
                  <svg
                    className="w-5 h-5 text-red-600"
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
                ),
              },
            ]}
          />
        ) : (
          <span className="text-gray-400 text-sm italic">Hanya baca</span>
        )}
      </td>
    </tr>
  );
});

export default CashBookRow;
