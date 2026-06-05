"use client";

import { useState } from "react";
import { createWasteMovementAction } from "./actions";

/** Material minimal yang dibutuhkan modal catat-rusak. */
export interface MaterialRusak {
  id: string;
  nama: string;
  satuan_dasar: string;
  jumlah_stok: number;
}

interface Props {
  material: MaterialRusak;
  onClose: () => void;
  /** Dipanggil setelah waste tersimpan; parent me-reload daftar. */
  onSuccess: () => void | Promise<void>;
  showNotification: (type: "success" | "error", message: string) => void;
}

/**
 * Modal "Catat Material Rusak" — mencatat WASTE di ledger stok (mengurangi
 * stok dengan nilai average cost saat ini). Diekstrak dari barang/page.tsx
 * (U-I1) supaya state form-nya terisolasi dan tidak membebani page induk.
 */
export default function ModalCatatRusak({
  material,
  onClose,
  onSuccess,
  showNotification,
}: Props) {
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const qtyNum = Number(qty);
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      showNotification("error", "Jumlah barang rusak harus lebih dari 0");
      return;
    }
    if (!reason.trim()) {
      showNotification("error", "Alasan/keterangan wajib diisi");
      return;
    }
    setSaving(true);
    try {
      await createWasteMovementAction({
        barang_id: material.id,
        qty: qtyNum,
        reason: reason.trim(),
      });
      await onSuccess();
      onClose();
      showNotification("success", "Barang rusak berhasil dicatat");
    } catch (error: any) {
      console.error("Error creating waste:", error);
      showNotification(
        "error",
        error.message || "Gagal menyimpan catatan barang rusak"
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
        <h3 className="text-lg font-bold text-rose-700">Catat Material Rusak</h3>
        <p className="text-sm text-gray-600 dark:text-slate-300">
          Tercatat sebagai <span className="font-mono">WASTE</span> di riwayat
          stok. Mengurangi{" "}
          <span className="font-semibold">{material.nama}</span> dari stok dengan
          nilai average cost saat ini.
        </p>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
            Jumlah rusak (satuan: {material.satuan_dasar})
          </label>
          <input
            type="number"
            step="0.01"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="Contoh: 5"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            autoFocus
          />
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
            Stok saat ini:{" "}
            {Number(material.jumlah_stok || 0).toLocaleString("id-ID")}{" "}
            {material.satuan_dasar}
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
            Alasan / keterangan <span className="text-red-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Misprint mesin Eco-Solvent, batch BCD123 — tinta luntur, dll."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-slate-300 hover:bg-gray-200 rounded-lg"
          >
            Batal
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-50"
          >
            {saving ? "Menyimpan..." : "Catat sebagai Waste"}
          </button>
        </div>
      </div>
    </div>
  );
}
