"use client";

import { useEffect, useRef, useState } from "react";
import { PrinterIcon } from "@/components/icons/PageIcons";
import { useClickOutside } from "@/hooks/useClickOutside";
import type {
  ProductionOrder,
  ProductionItem,
} from "@/lib/services/production-service";
import { getStatusColor, getPriorityColor } from "./spk-status";
import {
  formatTampilanDimensiSpk,
  formatTampilanQtySpk,
} from "@/lib/penjualan-cetak-utils";
import {
  STATUS_ORDER,
  daftarStatusManualUntukItem,
  labelStatus,
} from "@/lib/produksi/status-produksi";

interface RollVariantOption {
  id: string;
  lebar_m: number;
  panjang_tersedia_m: number;
  average_cost_per_m2: number;
}

type ConsumptionDraft = {
  roll_variant_id: string;
  linear_used_m: string;
  catatan: string;
};

export interface SpkDetailModalProps {
  order: ProductionOrder;
  rollVariantsByItem: Record<string, RollVariantOption[]>;
  consumptionDrafts: Record<string, ConsumptionDraft>;
  onClose: () => void;
  onUpdateItemStatus: (itemId: string, newStatus: string) => void;
  onPatchDraft: (itemId: string, patch: Partial<ConsumptionDraft>) => void;
  onPostConsumption: (item: ProductionItem) => void;
  onVoidConsumption: (item: ProductionItem) => void;
  onUpdateOrderStatus: (orderId: string, newStatus: string) => void;
  onEditCustomer: () => void;
  onPrint: (order: ProductionOrder) => void | Promise<void>;
}

// Modal detail SPK (info order + item + konsumsi roll + finishing). Diekstrak (Fase 6 B6).
export default function SpkDetailModal({
  order,
  rollVariantsByItem,
  consumptionDrafts,
  onClose,
  onUpdateItemStatus,
  onPatchDraft,
  onPostConsumption,
  onVoidConsumption,
  onUpdateOrderStatus,
  onEditCustomer,
  onPrint,
}: SpkDetailModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [komponenByBarang, setKomponenByBarang] = useState<
    Record<string, Array<{ qty: number; komponen_nama: string }>>
  >({});

  // Muat komponen BOM per barang saat detail SPK dibuka
  useEffect(() => {
    const items = order.items || [];
    const barangIds = [
      ...new Set(items.map((item) => item.barang_id).filter(Boolean)),
    ] as string[];
    if (barangIds.length === 0) {
      setKomponenByBarang({});
      return;
    }

    let cancelled = false;
    Promise.all(
      barangIds.map(async (barangId) => {
        const res = await fetch(
          `/api/barang-komponen?parent_barang_id=${barangId}`,
        );
        const data = await res.json();
        return [barangId, data.komponen || []] as const;
      }),
    ).then((entries) => {
      if (cancelled) return;
      const map: Record<
        string,
        Array<{ qty: number; komponen_nama: string }>
      > = {};
      for (const [bid, komponen] of entries) {
        if (komponen.length > 0) map[bid] = komponen;
      }
      setKomponenByBarang(map);
    });

    return () => {
      cancelled = true;
    };
  }, [order]);

  // Tutup saat klik di luar panel modal.
  useClickOutside(modalRef, () => onClose(), true);

  // Tutup saat tombol Escape ditekan.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div
        ref={modalRef}
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
      >
        <div className="p-6 border-b border-gray-200 dark:border-slate-800 bg-gradient-to-r from-amber-700 to-amber-900 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <PrinterIcon size={24} />
              Detail SPK - {order.nomor_spk}
            </h3>
            <button
              onClick={() => onClose()}
              className="text-white hover:bg-white/20 rounded-lg p-2 transition-colors"
            >
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 flex-1 min-h-0 overflow-y-auto">
          {/* Order Info */}
          <div className="grid grid-cols-2 gap-4 mb-6 p-4 bg-gray-50 dark:bg-slate-800 rounded-lg">
            <div>
              <div className="text-sm text-gray-600 dark:text-slate-300 mb-1">
                Faktur
              </div>
              <div className="font-semibold">{order.nomor_faktur}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600 dark:text-slate-300 mb-1">
                Pelanggan
              </div>
              <button
                type="button"
                onClick={onEditCustomer}
                className="font-semibold text-left text-amber-700 dark:text-amber-300 hover:underline"
                title="Ubah nama pelanggan"
              >
                {order.pelanggan_nama || "Pelanggan Umum"}
                <span className="ml-1 text-xs text-gray-400">(ubah)</span>
              </button>
            </div>
            <div>
              <div className="text-sm text-gray-600 dark:text-slate-300 mb-1">
                Prioritas
              </div>
              <span
                className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${getPriorityColor(
                  order.prioritas,
                )}`}
              >
                {order.prioritas}
              </span>
            </div>
            <div>
              <div className="text-sm text-gray-600 dark:text-slate-300 mb-1">
                Status
              </div>
              {order.status === "SELESAI" || order.status === "SIAP_AMBIL" ? (
                <span
                  className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border-2 ${getStatusColor(
                    order.status,
                  )}`}
                >
                  {labelStatus(order.status)}
                </span>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={order.status}
                    onChange={(e) =>
                      onUpdateOrderStatus(order.id, e.target.value)
                    }
                    className={`px-3 py-1 rounded-full text-xs font-semibold border-2 cursor-pointer ${getStatusColor(
                      order.status,
                    )}`}
                  >
                    {STATUS_ORDER.filter(
                      (s) => s !== "SELESAI" && s !== "SIAP_AMBIL",
                    ).map((s) => (
                      <option
                        key={s}
                        value={s}
                        className="bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100"
                      >
                        {labelStatus(s)}
                      </option>
                    ))}
                  </select>
                  {order.status === "PROSES" && (
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateOrderStatus(order.id, "SIAP_AMBIL")
                      }
                      className="px-3 py-1 rounded-full text-xs font-semibold border-2 border-teal-300 bg-teal-100 dark:bg-teal-900/30 text-teal-800 dark:text-teal-200 hover:bg-teal-200 dark:hover:bg-teal-900/50 cursor-pointer transition-colors"
                    >
                      Siap Diambil
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Items */}
          <div className="space-y-4">
            <h4 className="font-bold text-lg text-gray-900 dark:text-slate-100 mb-4">
              Item Produksi ({order.items?.length || 0})
            </h4>
            {(order.items || []).map((item, idx) => (
              <div
                key={item.id}
                className="border-2 border-gray-200 dark:border-slate-800 rounded-lg p-4 hover:border-amber-400 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="font-bold text-gray-900 dark:text-slate-100 mb-1">
                      {idx + 1}. {item.barang_nama}
                    </div>
                    {item.barang_id &&
                      komponenByBarang[item.barang_id]?.length > 0 && (
                        <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                          Komponen:{" "}
                          {komponenByBarang[item.barang_id]
                            .map((k) => `${k.qty} × ${k.komponen_nama}`)
                            .join(", ")}
                        </div>
                      )}
                    <div className="text-sm text-gray-600 dark:text-slate-300">
                      Jumlah: {formatTampilanQtySpk(item)}
                    </div>
                    {formatTampilanDimensiSpk(item) && (
                      <div className="text-sm text-gray-600 dark:text-slate-300">
                        Ukuran: {formatTampilanDimensiSpk(item)}
                      </div>
                    )}
                    {item.jenis_bahan && (
                      <div className="text-sm text-gray-600 dark:text-slate-300">
                        Bahan: {item.jenis_bahan}
                      </div>
                    )}
                    {item.mesin_printing && (
                      <div className="text-sm text-gray-600 dark:text-slate-300">
                        Mesin: {item.mesin_printing}
                      </div>
                    )}
                  </div>
                  {item.status === "SIAP_AMBIL" || item.status === "SELESAI" ? (
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold border-2 ${getStatusColor(
                        item.status,
                      )}`}
                    >
                      {labelStatus(item.status)}
                    </span>
                  ) : (
                    <select
                      value={item.status}
                      onChange={(e) =>
                        onUpdateItemStatus(item.id, e.target.value)
                      }
                      className={`px-3 py-1 rounded-full text-xs font-semibold border-2 cursor-pointer ${getStatusColor(
                        item.status,
                      )}`}
                    >
                      {daftarStatusManualUntukItem({
                        is_maklon: item.is_maklon,
                      }).map((s) => (
                        <option
                          key={s}
                          value={s}
                          className="bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100"
                        >
                          {labelStatus(s)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {item.roll_inventory_status === "PENDING" && (
                  <div className="mb-3 border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20 rounded-lg p-3">
                    <div className="flex flex-wrap items-end gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-amber-900 dark:text-amber-200 mb-1">
                          Roll aktual
                        </label>
                        <select
                          value={
                            consumptionDrafts[item.id]?.roll_variant_id || ""
                          }
                          onChange={(e) =>
                            onPatchDraft(item.id, {
                              roll_variant_id: e.target.value,
                            })
                          }
                          className="px-2 py-1.5 text-sm border border-amber-300 dark:border-amber-800 rounded bg-white dark:bg-slate-900 dark:text-slate-100"
                        >
                          <option value="">Pilih roll</option>
                          {(rollVariantsByItem[item.id] || []).map(
                            (variant) => (
                              <option key={variant.id} value={variant.id}>
                                {Number(variant.lebar_m).toFixed(2)}m · sisa{" "}
                                {Number(variant.panjang_tersedia_m).toFixed(2)}m
                              </option>
                            ),
                          )}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-amber-900 dark:text-amber-200 mb-1">
                          Panjang aktual
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          inputMode="decimal"
                          value={
                            consumptionDrafts[item.id]?.linear_used_m || ""
                          }
                          onChange={(e) =>
                            onPatchDraft(item.id, {
                              linear_used_m: e.target.value,
                            })
                          }
                          placeholder="Auto"
                          className="w-24 px-2 py-1.5 text-sm border border-amber-300 dark:border-amber-800 rounded bg-white dark:bg-slate-900 dark:text-slate-100"
                        />
                      </div>
                      <div className="min-w-[180px] text-xs text-amber-900 dark:text-amber-200">
                        Billing: {Number(item.jumlah || 0).toFixed(2)} m²
                        {item.recommended_roll_width_m
                          ? ` · rekomendasi ${Number(item.recommended_roll_width_m).toFixed(2)}m`
                          : ""}
                      </div>
                      <button
                        type="button"
                        onClick={() => onPostConsumption(item)}
                        className="px-3 py-1.5 text-sm font-semibold rounded bg-amber-600 text-white hover:bg-amber-700"
                      >
                        Konfirmasi Bahan
                      </button>
                    </div>
                  </div>
                )}

                {item.roll_inventory_status === "POSTED" &&
                  item.consumption && (
                    <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2 text-xs text-emerald-900 dark:text-emerald-200">
                      <span>
                        Roll {Number(item.consumption.roll_width_m).toFixed(2)}m
                        · pakai{" "}
                        {Number(item.consumption.linear_used_m).toFixed(2)}m ·
                        stok keluar{" "}
                        {Number(item.consumption.area_used_m2).toFixed(2)}m²
                      </span>
                      {Number(item.consumption.waste_area_m2) > 0 && (
                        <span>
                          Waste{" "}
                          {Number(item.consumption.waste_area_m2).toFixed(2)}m²
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => onVoidConsumption(item)}
                        className="px-2 py-1 rounded border border-emerald-300 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
                      >
                        Koreksi
                      </button>
                    </div>
                  )}

                {/* Finishing */}
                {item.finishing && item.finishing.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-slate-800">
                    <div className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">
                      Finishing:
                    </div>
                    <div className="space-y-2">
                      {item.finishing.map((fin) => (
                        <div
                          key={fin.id}
                          className="flex items-center justify-between bg-orange-50 dark:bg-slate-800 px-3 py-2 rounded-lg"
                        >
                          <div className="flex-1">
                            <span className="font-medium text-gray-900 dark:text-slate-100">
                              {fin.jenis_finishing}
                            </span>
                            {fin.keterangan && (
                              <span className="text-sm text-gray-600 dark:text-slate-300 ml-2">
                                ({fin.keterangan})
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {item.catatan_produksi && (
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-slate-800 text-sm text-gray-600 dark:text-slate-300">
                    <strong>Catatan:</strong> {item.catatan_produksi}
                  </div>
                )}
              </div>
            ))}
          </div>

          {order.catatan && (
            <div className="mt-6 p-4 bg-yellow-50 dark:bg-slate-800 border-l-4 border-yellow-400 rounded">
              <div className="font-semibold text-gray-900 dark:text-slate-100 mb-1">
                Catatan Umum:
              </div>
              <div className="text-sm text-gray-700 dark:text-slate-300">
                {order.catatan}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onClose()}
            className="px-6 py-2 bg-white dark:bg-slate-900 border-2 border-gray-300 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-100 transition-colors font-semibold"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={async () => {
              await onPrint(order);
              onClose();
            }}
            className="px-6 py-2 bg-gradient-to-r from-amber-700 to-amber-900 text-white rounded-lg hover:shadow-lg transition-all font-semibold flex items-center gap-2"
          >
            <PrinterIcon size={18} />
            Cetak SPK
          </button>
        </div>
      </div>
    </div>
  );
}
