"use client";

import { useMemo, useState } from "react";
import ModalFormShell from "@/components/ModalFormShell";
import { PencilIcon } from "@/components/icons/ContentIcons";
import type { Vendor } from "@/lib/services/vendors-service";
import type { PendingMaklonRow } from "@/lib/services/pending-maklon-service";
import { reconcilePendingMaklonItemAction } from "./actions";

interface Props {
  item: PendingMaklonRow;
  vendors: Vendor[];
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
  showNotification: (type: "success" | "error", message: string) => void;
}

const money = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

/**
 * Modal reconcile baris maklon pending: isi vendor + biaya + metode bayar.
 * Setelah submit, action akan recompute HPP, post keuangan [REF:itemId], dan
 * buat PO maklon. Parent bertanggung jawab memuat ulang queue + invalidasi
 * cache keuangan/penjualan.
 */
export default function ModalReconcilePendingMaklon({
  item,
  vendors,
  onClose,
  onSuccess,
  showNotification,
}: Props) {
  const vendorSubkontrak = useMemo(
    () =>
      vendors.filter(
        (v) =>
          v.tipe_vendor === "SUBKONTRAKTOR" || v.tipe_vendor === "KEDUANYA",
      ),
    [vendors],
  );

  const [vendorId, setVendorId] = useState("");
  const [biaya, setBiaya] = useState<number>(0);
  const [metode, setMetode] = useState<"CASH" | "NET30" | "TRANSFER">("CASH");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorId) {
      showNotification("error", "Vendor subkontrak wajib dipilih");
      return;
    }
    if (!(biaya > 0)) {
      showNotification("error", "Biaya subkontrak harus lebih dari 0");
      return;
    }
    setSaving(true);
    try {
      await reconcilePendingMaklonItemAction(item.id, {
        vendor_subkontrak_id: vendorId,
        biaya_subkontrak: biaya,
        metode_bayar_vendor: metode,
      });
      showNotification("success", "Vendor & HPP berhasil diisi");
      await onSuccess();
      onClose();
    } catch (error: any) {
      showNotification(
        "error",
        error?.message || "Gagal menyimpan reconcile pending maklon",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalFormShell
      open
      onClose={onClose}
      allowDismiss={!saving}
      maxWidthClass="max-w-lg"
      header={
        <div className="bg-gradient-to-r from-amber-500 to-orange-600 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-white/20 rounded-lg shrink-0">
              <PencilIcon size={20} className="text-white" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-white truncate">
                Isi Vendor &amp; HPP
              </h3>
              <p className="text-white/90 text-xs truncate">
                Reconcile pending maklon — {item.nomor_faktur || "tanpa faktur"}
              </p>
            </div>
          </div>
        </div>
      }
      footer={
        <div className="px-6 py-4 bg-gray-50 dark:bg-slate-900 border-t border-gray-200 dark:border-slate-800 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-lg font-semibold text-gray-700 dark:text-slate-200 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="submit"
            form="form-reconcile-pending"
            disabled={saving}
            className="px-4 py-2 rounded-lg font-semibold text-white bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 transition-colors disabled:opacity-50"
          >
            {saving ? "Menyimpan..." : "Reconcile"}
          </button>
        </div>
      }
    >
      <form
        id="form-reconcile-pending"
        onSubmit={handleSubmit}
        className="px-6 py-5 space-y-4"
      >
        {/* Ringkasan baris */}
        <div className="rounded-lg border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800/50 p-3 space-y-1 text-sm">
          <div className="flex justify-between gap-2">
            <span className="text-gray-500 dark:text-slate-400">Pekerjaan</span>
            <span className="font-semibold text-gray-800 dark:text-slate-100 text-right">
              {item.deskripsi_pekerjaan || "—"}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-gray-500 dark:text-slate-400">Jumlah</span>
            <span className="font-semibold text-gray-800 dark:text-slate-100">
              {item.jumlah}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-gray-500 dark:text-slate-400">Harga Jual</span>
            <span className="font-semibold text-gray-800 dark:text-slate-100">
              {money(item.subtotal)}
            </span>
          </div>
        </div>

        {/* Vendor */}
        <div className="space-y-1">
          <label className="block text-sm font-semibold text-gray-700 dark:text-slate-200">
            Vendor Subkontrak
          </label>
          <select
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
            disabled={saving}
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-100"
          >
            <option value="">— Pilih vendor —</option>
            {vendorSubkontrak.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nama_perusahaan}
              </option>
            ))}
          </select>
        </div>

        {/* Biaya subkontrak */}
        <div className="space-y-1">
          <label className="block text-sm font-semibold text-gray-700 dark:text-slate-200">
            Biaya Subkontrak (total)
          </label>
          <input
            type="number"
            min={0}
            step={1}
            value={biaya || ""}
            onChange={(e) => setBiaya(Number(e.target.value) || 0)}
            disabled={saving}
            placeholder="0"
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-100"
          />
          <p className="text-xs text-gray-500 dark:text-slate-400">
            HPP total = biaya subkontrak. HPP satuan = biaya &divide; jumlah.
          </p>
        </div>

        {/* Metode bayar vendor */}
        <div className="space-y-1">
          <label className="block text-sm font-semibold text-gray-700 dark:text-slate-200">
            Metode Bayar Vendor
          </label>
          <select
            value={metode}
            onChange={(e) =>
              setMetode(e.target.value as "CASH" | "NET30" | "TRANSFER")
            }
            disabled={saving}
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-100"
          >
            <option value="CASH">CASH — Bayar langsung</option>
            <option value="TRANSFER">TRANSFER — Bank langsung</option>
            <option value="NET30">NET30 — Hutang 30 hari</option>
          </select>
        </div>
      </form>
    </ModalFormShell>
  );
}
