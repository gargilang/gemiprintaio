"use client";

import type { RefObject } from "react";
import type { KategoriTransaksi } from "@/types/database";
import ModalFormShell from "@/components/ModalFormShell";
import { parseLocalizedAmount } from "@/lib/format-id";
import { PencilIcon } from "@/components/icons/ContentIcons";

// Modal tambah/edit transaksi buku kas. Diekstrak dari page.tsx (Fase 6 C1 step 2).
// Murni presentational: induk pegang state form + submit (jalur uang tetap di induk).

export interface CashBookFormData {
  tanggal: string;
  kategori_transaksi: KategoriTransaksi;
  debit: string;
  kredit: string;
  keperluan: string;
  catatan: string;
}

export interface ModalTransaksiKeuanganProps {
  open: boolean;
  /** True saat mengedit transaksi yang sudah ada (mengubah judul modal). */
  isEditing: boolean;
  formData: CashBookFormData;
  setFormData: (data: CashBookFormData) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onDebitChange: (value: string) => void;
  onKreditChange: (value: string) => void;
  debitInputRef: RefObject<HTMLInputElement | null>;
  formatRupiah: (amount: number) => string;
  kategoriOptions: string[];
  kategoriLabelMap: Map<string, string>;
}

export default function ModalTransaksiKeuangan({
  open,
  isEditing,
  formData,
  setFormData,
  onClose,
  onSubmit,
  onDebitChange,
  onKreditChange,
  debitInputRef,
  formatRupiah,
  kategoriOptions,
  kategoriLabelMap,
}: ModalTransaksiKeuanganProps) {
  return (
    <ModalFormShell
      open={open}
      onClose={onClose}
      maxWidthClass="max-w-md"
      header={
        <div className="p-6 border-b border-gray-200 dark:border-slate-800 bg-gradient-to-r from-orange-500 to-pink-600 flex items-center justify-between shrink-0 gap-3 rounded-t-2xl">
          <h3 className="text-xl font-bold text-white min-w-0 flex items-center gap-2">
            {isEditing && <PencilIcon size={20} className="text-white" />}
            {isEditing ? "Edit Transaksi" : "Tambah Transaksi Baru"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors shrink-0"
            aria-label="Tutup"
          >
            <svg
              className="w-6 h-6 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      }
      footer={
        <div className="bg-gray-50 dark:bg-slate-800 px-6 py-4 flex items-center justify-end gap-3 border-t border-gray-200 dark:border-slate-800 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 bg-white dark:bg-slate-900 border-2 border-gray-300 text-gray-700 dark:text-slate-300 rounded-lg font-semibold hover:bg-gray-100 transition"
            tabIndex={8}
          >
            Batal
          </button>
          <button
            type="submit"
            form="finance-cashbook-form"
            className="px-6 py-2 bg-gradient-to-r from-orange-500 to-pink-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all duration-300"
            tabIndex={7}
          >
            Simpan
          </button>
        </div>
      }
    >
      <form
        id="finance-cashbook-form"
        onSubmit={onSubmit}
        className="p-6 space-y-4"
      >
        <div>
          <label className="block text-sm font-semibold text-[#0a1b3d] dark:text-slate-100 mb-2">
            Tanggal
          </label>
          <input
            type="date"
            value={formData.tanggal}
            onChange={(e) =>
              setFormData({ ...formData, tanggal: e.target.value })
            }
            required
            className="w-full px-4 py-2 border-2 border-gray-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-600 focus:border-pink-600 transition dark:bg-slate-800 dark:text-slate-100"
            tabIndex={5}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-[#0a1b3d] dark:text-slate-100 mb-2">
              Debit (Masuk)
            </label>
            <input
              ref={debitInputRef}
              type="text"
              value={formData.debit}
              onChange={(e) => onDebitChange(e.target.value)}
              disabled={!!formData.kredit}
              className="w-full px-4 py-2 border-2 border-gray-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-green-400 transition disabled:bg-gray-100 disabled:cursor-not-allowed dark:bg-slate-800 dark:text-slate-100"
              placeholder="0"
              tabIndex={1}
            />
            {formData.debit && (
              <p className="text-xs text-green-600 mt-1">
                {formatRupiah(parseLocalizedAmount(formData.debit))}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-[#0a1b3d] dark:text-slate-100 mb-2">
              Kredit (Keluar)
            </label>
            <input
              type="text"
              value={formData.kredit}
              onChange={(e) => onKreditChange(e.target.value)}
              disabled={!!formData.debit}
              className="w-full px-4 py-2 border-2 border-gray-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-red-400 transition disabled:bg-gray-100 disabled:cursor-not-allowed dark:bg-slate-800 dark:text-slate-100"
              placeholder="0"
              tabIndex={2}
            />
            {formData.kredit && (
              <p className="text-xs text-red-600 mt-1">
                {formatRupiah(parseLocalizedAmount(formData.kredit))}
              </p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-[#0a1b3d] dark:text-slate-100 mb-2">
            Kategori
          </label>
          <select
            value={formData.kategori_transaksi}
            onChange={(e) =>
              setFormData({
                ...formData,
                kategori_transaksi: e.target.value as KategoriTransaksi,
              })
            }
            className="w-full px-4 py-2 border-2 border-gray-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-600 focus:border-pink-600 transition dark:bg-slate-800 dark:text-slate-100"
            tabIndex={3}
          >
            {kategoriOptions.map((kat) => (
              <option key={kat} value={kat}>
                {kategoriLabelMap.get(kat) || kat}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-[#0a1b3d] dark:text-slate-100 mb-2">
            Keperluan
          </label>
          <input
            type="text"
            value={formData.keperluan}
            onChange={(e) =>
              setFormData({ ...formData, keperluan: e.target.value })
            }
            className="w-full px-4 py-2 border-2 border-gray-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-600 focus:border-pink-600 transition dark:bg-slate-800 dark:text-slate-100"
            placeholder="Deskripsi transaksi..."
            tabIndex={4}
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-[#0a1b3d] dark:text-slate-100 mb-2">
            Catatan (Opsional)
          </label>
          <textarea
            value={formData.catatan}
            onChange={(e) =>
              setFormData({ ...formData, catatan: e.target.value })
            }
            rows={3}
            className="w-full px-4 py-2 border-2 border-gray-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-600 focus:border-pink-600 transition resize-none dark:bg-slate-800 dark:text-slate-100"
            placeholder="Catatan tambahan..."
            tabIndex={6}
          />
        </div>
      </form>
    </ModalFormShell>
  );
}
