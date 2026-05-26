"use client";

import { useState, useRef } from "react";
import ModalFormShell from "@/components/ModalFormShell";
import { getTodayJakarta } from "@/lib/date-utils";

interface CloseBooksModalProps {
  show: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onArchiveCashbook: (data: {
    startDate: string;
    endDate: string;
    label: string;
  }) => Promise<any>;
}

export default function CloseBooksModal({
  show,
  onClose,
  onSuccess,
  onArchiveCashbook,
}: CloseBooksModalProps) {
  const [startDate, setStartDate] = useState(
    getTodayJakarta().substring(0, 8) + "01"
  );
  const [endDate, setEndDate] = useState(getTodayJakarta());
  const [label, setLabel] = useState("");
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState("");
  const labelTouchedRef = useRef(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!label.trim()) {
      setError("Label harus diisi (contoh: Oktober 2025)");
      return;
    }

    if (startDate > endDate) {
      setError("Tanggal mulai tidak boleh lebih besar dari tanggal akhir");
      return;
    }

    setClosing(true);
    setError("");

    try {
      await onArchiveCashbook({ startDate, endDate, label });

      onSuccess();
      handleClose();
    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan");
      setClosing(false);
    }
  };

  const handleClose = () => {
    setStartDate(getTodayJakarta().substring(0, 8) + "01");
    setEndDate(getTodayJakarta());
    setLabel("");
    labelTouchedRef.current = false;
    setClosing(false);
    setError("");
    onClose();
  };

  const handleEndDateChange = (date: string) => {
    setEndDate(date);
    if (date && !labelTouchedRef.current) {
      const d = new Date(date);
      const monthNames = [
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
      const suggestedLabel = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
      setLabel(suggestedLabel);
    }
  };

  const dismissDisabled = closing;

  return (
    <ModalFormShell
      open={show}
      onClose={handleClose}
      allowDismiss={!dismissDisabled}
      maxWidthClass="max-w-md"
      zIndexClass="z-[60]"
      backdropClassName="bg-black/60"
      header={
        <div className="p-6 border-b border-gray-200 dark:border-slate-800 bg-gradient-to-r from-orange-500 to-pink-600 shrink-0 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-2 bg-white/20 dark:bg-slate-900/20 rounded-lg shrink-0">
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
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white truncate">Tutup Buku</h3>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={dismissDisabled}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors shrink-0 disabled:opacity-50"
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
            onClick={handleClose}
            disabled={dismissDisabled}
            className="px-6 py-2 bg-white dark:bg-slate-900 border-2 border-gray-300 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-100 transition-colors font-semibold disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="submit"
            form="close-books-form"
            disabled={dismissDisabled}
            className="px-6 py-2 bg-gradient-to-r from-orange-500 to-pink-600 text-white rounded-lg font-semibold hover:from-orange-600 hover:to-pink-700 hover:shadow-lg transition-all duration-300 disabled:opacity-50"
          >
            {closing ? "Menutup Buku..." : "Simpan"}
          </button>
        </div>
      }
    >
      <form
        id="close-books-form"
        onSubmit={handleSubmit}
        className="p-6 space-y-4"
      >
        <div className="bg-orange-50 dark:bg-slate-800 border-2 border-orange-200 dark:border-orange-800/50 rounded-xl p-4 text-sm text-orange-800 dark:text-orange-200">
          <div className="font-bold mb-1 flex items-center gap-2">
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Tentang Tutup Buku
          </div>
          <p>
            Transaksi dalam rentang tanggal yang dipilih akan diarsipkan dan
            dihapus dari tampilan utama. Anda dapat melihatnya lagi dari menu
            &quot;Pilih Arsip Bulan&quot;.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-[#0a1b3d] dark:text-slate-100 mb-2">
              Tanggal Mulai
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              disabled={closing}
              required
              className="w-full px-4 py-2 border-2 border-gray-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-600 focus:border-pink-600 transition dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-[#0a1b3d] dark:text-slate-100 mb-2">
              Tanggal Akhir
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => handleEndDateChange(e.target.value)}
              disabled={closing}
              required
              className="w-full px-4 py-2 border-2 border-gray-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-600 focus:border-pink-600 transition dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-[#0a1b3d] dark:text-slate-100 mb-2">
            Label Arsip
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => {
              labelTouchedRef.current = true;
              setLabel(e.target.value);
            }}
            disabled={closing}
            placeholder="Contoh: Oktober 2025"
            required
            className="w-full px-4 py-2 border-2 border-gray-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-600 focus:border-pink-600 transition dark:bg-slate-800 dark:text-slate-100"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
            Label untuk mengidentifikasi periode arsip.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-950/40 border-2 border-red-200 dark:border-red-800/50 rounded-xl p-3 text-sm text-red-800 dark:text-red-200 font-medium">
            {error}
          </div>
        )}
      </form>
    </ModalFormShell>
  );
}
