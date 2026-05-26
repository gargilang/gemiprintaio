"use client";

/**
 * Modal for overriding the price of a single cart line.
 *
 * Two modes:
 *  - "harga": user edits harga_satuan (per-unit price). Subtotal recalculates.
 *  - "subtotal": user edits the final subtotal directly. harga_satuan is
 *    derived as subtotal / jumlah (display-only).
 *
 * Reset button restores the original catalog price (harga_satuan_original).
 */

import { useEffect, useMemo, useState } from "react";
import ModalFormShell from "@/components/ModalFormShell";

export interface EditPriceModalProps {
  show: boolean;
  itemName: string;
  jumlah: number;
  /** Catalog price (the price before any override). Used for Reset. */
  hargaOriginal: number;
  /** Current effective price (may already be overridden). */
  hargaCurrent: number;
  onClose: () => void;
  /**
   * Save handler. Pass the new harga_satuan; subtotal is derived elsewhere.
   * If `useOriginal` is true, caller should clear the override marker.
   */
  onSave: (newHargaSatuan: number, useOriginal: boolean) => void;
}

type EditMode = "harga" | "subtotal";

function parseNumber(s: string): number {
  const n = parseFloat(s);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export default function EditPriceModal({
  show,
  itemName,
  jumlah,
  hargaOriginal,
  hargaCurrent,
  onClose,
  onSave,
}: EditPriceModalProps) {
  const [mode, setMode] = useState<EditMode>("harga");
  const [hargaStr, setHargaStr] = useState("");
  const [subtotalStr, setSubtotalStr] = useState("");

  useEffect(() => {
    if (!show) return;
    setMode("harga");
    setHargaStr(String(Math.round(hargaCurrent)));
    setSubtotalStr(String(Math.round(hargaCurrent * jumlah)));
  }, [show, hargaCurrent, jumlah]);

  // Derived: when mode === "harga", subtotal = harga * jumlah
  // when mode === "subtotal", harga = subtotal / jumlah
  const computed = useMemo(() => {
    if (mode === "harga") {
      const harga = parseNumber(hargaStr);
      return { harga, subtotal: harga * jumlah };
    }
    const subtotal = parseNumber(subtotalStr);
    const harga = jumlah > 0 ? subtotal / jumlah : 0;
    return { harga, subtotal };
  }, [mode, hargaStr, subtotalStr, jumlah]);

  const isOverridden = Math.abs(computed.harga - hargaOriginal) > 0.0001;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (computed.harga <= 0) return;
    onSave(computed.harga, !isOverridden);
  };

  const handleReset = () => {
    onSave(hargaOriginal, true);
  };

  return (
    <ModalFormShell
      open={show}
      onClose={onClose}
      maxWidthClass="max-w-md"
      backdropClassName="bg-black/50 backdrop-blur-sm"
      header={
        <div className="bg-gradient-to-r from-[#0a1b3d] to-[#2266ff] px-5 py-3 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-white truncate">
              Edit Harga
            </h2>
            <p className="text-xs text-white/80 truncate">{itemName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-white/20 rounded-lg transition-all shrink-0"
            aria-label="Tutup"
          >
            <svg
              className="w-5 h-5 text-white"
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
        <div className="bg-gray-50 dark:bg-slate-800 px-5 py-3 border-t border-gray-200 dark:border-slate-700 shrink-0 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleReset}
            className="text-xs font-semibold text-gray-600 dark:text-slate-400 hover:text-[#00afef] transition-colors underline"
          >
            Reset ke harga normal
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 bg-white dark:bg-slate-900 border-2 border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors font-semibold text-sm"
            >
              Batal
            </button>
            <button
              type="submit"
              form="edit-price-form"
              disabled={computed.harga <= 0}
              className="px-4 py-1.5 bg-gradient-to-r from-[#0a1b3d] to-[#2266ff] text-white rounded-lg hover:from-[#0a1b3d]/90 hover:to-[#2266ff]/90 transition-all font-semibold text-sm disabled:opacity-50"
            >
              Simpan
            </button>
          </div>
        </div>
      }
    >
      <form
        id="edit-price-form"
        onSubmit={handleSubmit}
        className="p-5 space-y-4"
      >
        {/* ── Mode toggle ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode("harga")}
            className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all border-2 ${
              mode === "harga"
                ? "bg-[#00afef] text-white border-[#00afef]"
                : "bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700"
            }`}
          >
            Edit harga / satuan
          </button>
          <button
            type="button"
            onClick={() => setMode("subtotal")}
            className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all border-2 ${
              mode === "subtotal"
                ? "bg-[#00afef] text-white border-[#00afef]"
                : "bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700"
            }`}
          >
            Edit subtotal final
          </button>
        </div>

        {/* ── Inputs ───────────────────────────────────────────────────────── */}
        {mode === "harga" ? (
          <>
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5">
                Harga / Satuan (Rp){" "}
                <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="100"
                min="0"
                value={hargaStr}
                onChange={(e) => setHargaStr(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 border-2 border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:border-[#00afef] font-bold"
                autoFocus
              />
              <p className="text-[10px] text-gray-500 dark:text-slate-400 mt-1">
                Harga normal: Rp {hargaOriginal.toLocaleString("id-ID")}
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 dark:bg-slate-800/60 px-3 py-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-slate-400">
                  Jumlah:
                </span>
                <span className="font-semibold text-gray-800 dark:text-slate-200">
                  {jumlah}
                </span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-gray-600 dark:text-slate-400">
                  Subtotal (otomatis):
                </span>
                <span className="font-bold text-[#00afef]">
                  Rp {Math.round(computed.subtotal).toLocaleString("id-ID")}
                </span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5">
                Subtotal Final (Rp){" "}
                <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="1000"
                min="0"
                value={subtotalStr}
                onChange={(e) => setSubtotalStr(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 border-2 border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:border-[#00afef] font-bold"
                autoFocus
              />
              <p className="text-[10px] text-gray-500 dark:text-slate-400 mt-1">
                Subtotal normal: Rp{" "}
                {(hargaOriginal * jumlah).toLocaleString("id-ID")}
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 dark:bg-slate-800/60 px-3 py-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-slate-400">
                  Jumlah:
                </span>
                <span className="font-semibold text-gray-800 dark:text-slate-200">
                  {jumlah}
                </span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-gray-600 dark:text-slate-400">
                  Harga / Satuan (otomatis):
                </span>
                <span className="font-bold text-[#00afef]">
                  Rp {Math.round(computed.harga).toLocaleString("id-ID")}
                </span>
              </div>
            </div>
          </>
        )}

        {isOverridden && (
          <div className="rounded-lg border-2 border-amber-300 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
            Harga ini berbeda dari harga catalog (Rp{" "}
            {hargaOriginal.toLocaleString("id-ID")}). Override akan tersimpan
            di transaksi.
          </div>
        )}
      </form>
    </ModalFormShell>
  );
}
