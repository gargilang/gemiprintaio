"use client";

import { useState, useMemo } from "react";
import InputDimensiRoll, { type RollInputVal } from "@/components/InputDimensiRoll";
import { createInventoryAdjustmentAction } from "./actions";

export interface MaterialAdjust {
  id: string;
  nama: string;
  satuan_dasar: string;
  jumlah_stok: number;
  butuh_dimensi_status: number | boolean;
  roll_variants?: Array<{ id: string; lebar_m: number; panjang_tersedia_m: number; aktif_status?: number }>;
}

interface Props {
  material: MaterialAdjust;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
  showNotification: (type: "success" | "error", message: string) => void;
}

/**
 * Modal Adjustment Stok — mencatat ADJUSTMENT di ledger.
 * Untuk barang dimensi: input roll (pilih lebar + panjang meter).
 * Diekstrak dari barang/page.tsx agar state form terisolasi.
 */
export default function ModalAdjustStok({
  material,
  onClose,
  onSuccess,
  showNotification,
}: Props) {
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [rollInput, setRollInput] = useState<RollInputVal | null>(null);
  const [saving, setSaving] = useState(false);

  const isDimensi = Number(material.butuh_dimensi_status) === 1;
  const rollVariants = useMemo(
    () =>
      isDimensi
        ? (material.roll_variants ?? []).filter((v) => Number(v.aktif_status ?? 1) !== 0)
        : [],
    [isDimensi, material.roll_variants]
  );

  const submit = async () => {
    if (!adjustReason.trim()) {
      showNotification("error", "Alasan adjustment wajib diisi");
      return;
    }

    setSaving(true);
    try {
      if (isDimensi) {
        if (!rollInput) {
          showNotification("error", "Pilih variant roll dan isi panjang");
          return;
        }
        await createInventoryAdjustmentAction({
          barang_id: material.id,
          qty_delta: rollInput.qty_m2,
          reason: adjustReason.trim(),
          roll_variant_id: rollInput.roll_variant_id,
          roll_width_m: rollInput.lebar_m,
          linear_delta_m: rollInput.panjang_m,
        });
      } else {
        const qty = Number(adjustQty);
        if (!Number.isFinite(qty) || qty === 0) {
          showNotification("error", "Qty adjustment tidak boleh 0");
          return;
        }
        await createInventoryAdjustmentAction({
          barang_id: material.id,
          qty_delta: qty,
          reason: adjustReason.trim(),
        });
      }

      await onSuccess();
      onClose();
      showNotification("success", "Adjustment stok berhasil disimpan");
    } catch (error: any) {
      showNotification("error", error.message || "Gagal menyimpan adjustment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
            Adjustment Stok
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">{material.nama}</p>
        </div>
        <div className="p-6 space-y-4">
          {isDimensi ? (
            <InputDimensiRoll
              variants={rollVariants}
              onChange={setRollInput}
              disabled={saving}
              mode="adjustment"
            />
          ) : (
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Qty Delta
              </label>
              <input
                type="number"
                value={adjustQty}
                onChange={(e) => setAdjustQty(e.target.value)}
                disabled={saving}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="Contoh: -2 atau 10"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Alasan <span className="text-rose-500">*</span>
            </label>
            <textarea
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
              disabled={saving}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
              rows={3}
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            Batal
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </div>
    </div>
  );
}
