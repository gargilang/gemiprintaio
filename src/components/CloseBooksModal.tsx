"use client";

import { useState, useEffect, useRef } from "react";
import { useClickOutside } from "@/hooks/useClickOutside";
import { getTodayJakarta } from "@/lib/date-utils";

interface CloseBooksModalProps {
  show: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CloseBooksModal({
  show,
  onClose,
  onSuccess,
}: CloseBooksModalProps) {
  const [startDate, setStartDate] = useState(
    getTodayJakarta().substring(0, 8) + "01"
  );
  const [endDate, setEndDate] = useState(getTodayJakarta());
  const [label, setLabel] = useState("");
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState("");

  // Click outside to close modal (only when not closing)
  const modalRef = useRef<HTMLDivElement>(null);
  useClickOutside(modalRef, () => !closing && handleClose(), show && !closing);

  // Handle ESC key to close modal
  useEffect(() => {
    if (!show || closing) return;

    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };

    window.addEventListener("keydown", handleEscKey);
    return () => window.removeEventListener("keydown", handleEscKey);
  }, [show, closing]);

  if (!show) return null;

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
      const res = await fetch("/api/cashbook/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate, label }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Gagal tutup buku");
      }

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
    setClosing(false);
    setError("");
    onClose();
  };

  // Auto-generate label based on month
  const handleEndDateChange = (date: string) => {
    setEndDate(date);
    if (date) {
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
      if (!label) {
        setLabel(suggestedLabel);
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
      <div
        ref={modalRef}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in duration-200"
      >
        <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-orange-500 to-pink-600 rounded-t-2xl">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <svg
              className="w-6 h-6"
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
            Tutup Buku
          </h3>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Info Box */}
          <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-4 text-sm text-orange-800">
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
              "Pilih Arsip Bulan".
            </p>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-[#0a1b3d] mb-2">
                Tanggal Mulai
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={closing}
                required
                className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-600 focus:border-pink-600 transition"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#0a1b3d] mb-2">
                Tanggal Akhir
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => handleEndDateChange(e.target.value)}
                disabled={closing}
                required
                className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-600 focus:border-pink-600 transition"
              />
            </div>
          </div>

          {/* Label */}
          <div>
            <label className="block text-sm font-semibold text-[#0a1b3d] mb-2">
              Label Arsip
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              disabled={closing}
              placeholder="Contoh: Oktober 2025"
              required
              className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-600 focus:border-pink-600 transition"
            />
            <p className="mt-1 text-xs text-gray-500">
              Label untuk mengidentifikasi periode arsip.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border-2 border-red-200 rounded-xl p-3 text-sm text-red-800 font-medium">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={closing}
              className="flex-1 px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-100 transition-all font-semibold disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={closing}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-orange-500 to-pink-600 text-white rounded-xl font-semibold hover:from-orange-600 hover:to-pink-700 hover:shadow-lg transition-all duration-300 disabled:opacity-50"
            >
              {closing ? "Menutup Buku..." : "Arsipkan & Tutup Buku"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
