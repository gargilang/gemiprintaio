"use client";

import { useState, useMemo } from "react";
import InputDimensiRoll, {
  type RollInputVal,
} from "@/components/InputDimensiRoll";
import { createWasteMovementAction } from "./actions";

/** Material minimal yang dibutuhkan modal catat-rusak. */
export interface MaterialRusak {
  id: string;
  nama: string;
  satuan_dasar: string;
  jumlah_stok: number;
  butuh_dimensi_status?: number | boolean;
  roll_variants?: Array<{
    id: string;
    lebar_m: number;
    panjang_tersedia_m: number;
    aktif_status?: number;
  }>;
}

interface Props {
  material: MaterialRusak;
  onClose: () => void;
  /** Dipanggil setelah waste tersimpan; parent me-reload daftar. */
  onSuccess: () => void | Promise<void>;
  showNotification: (type: "success" | "error", message: string) => void;
}

/**
 * Modal "Catat Material Rusak" — mencatat WASTE di ledger stok.
 * Untuk barang dimensi: input roll (pilih lebar + panjang meter).
 */
export default function ModalCatatRusak({
  material,
  onClose,
  onSuccess,
  showNotification,
}: Props) {
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [rollInput, setRollInput] = useState<RollInputVal | null>(null);
  const [saving, setSaving] = useState(false);

  const isDimensi = Number(material.butuh_dimensi_status ?? 0) === 1;
  const rollVariants = useMemo(
    () =>
      isDimensi
        ? (material.roll_variants ?? []).filter(
            (v) => Number(v.aktif_status ?? 1) !== 0,
          )
        : [],
    [isDimensi, material.roll_variants],
  );

  const submit = async () => {
    if (!reason.trim()) {
      showNotification("error", "Alasan/keterangan wajib diisi");
      return;
    }

    setSaving(true);
    try {
      if (isDimensi) {
        if (!rollInput) {
          showNotification("error", "Pilih variant roll dan isi panjang");
          return;
        }
        await createWasteMovementAction({
          barang_id: material.id,
          qty: rollInput.qty_m2,
          reason: reason.trim(),
          roll_variant_id: rollInput.roll_variant_id,
          roll_width_m: rollInput.lebar_m,
          linear_delta_m: rollInput.panjang_m,
        });
      } else {
        const qtyNum = Number(qty);
        if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
          showNotification("error", "Jumlah barang rusak harus lebih dari 0");
          return;
        }
        await createWasteMovementAction({
          barang_id: material.id,
          qty: qtyNum,
          reason: reason.trim(),
        });
      }

      await onSuccess();
      onClose();
      showNotification("success", "Barang rusak berhasil dicatat");
    } catch (error: any) {
      showNotification(
        "error",
        error.message || "Gagal menyimpan catatan barang rusak",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
        <h3 className="text-lg font-bold text-rose-700 dark:text-rose-400">
          Catat Material Rusak
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Tercatat sebagai <span className="font-mono">WASTE</span> di riwayat
          stok. Mengurangi{" "}
          <span className="font-semibold">{material.nama}</span> dengan nilai
          average cost saat ini.
        </p>

        {isDimensi ? (
          <InputDimensiRoll
            variants={rollVariants}
            onChange={setRollInput}
            disabled={saving}
            mode="waste"
          />
        ) : (
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Jumlah rusak (satuan: {material.satuan_dasar})
            </label>
            <input
              type="number"
              step="0.01"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="Contoh: 5"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg"
              autoFocus
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Stok saat ini:{" "}
              {Number(material.jumlah_stok || 0).toLocaleString("id-ID")}{" "}
              {material.satuan_dasar}
            </p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Alasan / keterangan <span className="text-rose-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Misprint mesin Eco-Solvent, batch BCD123 — tinta luntur, dll."
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg"
          />
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            Batal
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Menyimpan..." : "Catat sebagai Waste"}
          </button>
        </div>
      </div>
    </div>
  );
}
