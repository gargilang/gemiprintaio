"use client";

import { useState } from "react";
import { useCachedData } from "@/lib/use-cached-data";
import { sembunyikanPlaceholderBarang } from "@/lib/barang-placeholder";
import { StockAdjustmentIcon } from "@/components/icons/PageIcons";
import {
  createInventoryAdjustmentAction,
  createWasteMovementAction,
  getAdjustmentInitAction,
} from "./actions";

const initial = { materials: [], movements: [] };

export default function StockAdjustmentsPage() {
  const { data: rawData, isLoading, mutate } = useCachedData<any>(
    "stock-adjustments-init",
    getAdjustmentInitAction
  );
  const data = rawData ?? initial;
  const loading = isLoading && !rawData;
  const reload = async () => {
    await mutate();
  };
  const [barangId, setBarangId] = useState("");
  const [mode, setMode] = useState<"ADJUSTMENT" | "WASTE">("ADJUSTMENT");
  const [adjReason, setAdjReason] = useState<"MANUAL" | "WASTE" | "CORRECTION">("MANUAL");
  const [qty, setQty] = useState(0);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!barangId || !qty || !reason.trim()) return setNotice("Barang, qty, dan alasan wajib diisi.");
    setSaving(true);
    try {
      if (mode === "WASTE") {
        await createWasteMovementAction({ barang_id: barangId, qty: Math.abs(qty), reason });
      } else {
        await createInventoryAdjustmentAction({
          barang_id: barangId,
          qty_delta: qty,
          reason,
          adjustment_reason: adjReason,
        });
      }
      setQty(0);
      setReason("");
      setNotice("Mutasi stok tersimpan.");
      await reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Gagal adjustment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Kartu judul */}
      <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl shadow-lg p-6 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <StockAdjustmentIcon size={28} className="text-white" />
            <div>
              <h2 className="text-2xl font-bold uppercase tracking-wide">Penyesuaian Stok</h2>
              <p className="text-white/90 text-sm">Penyesuaian manual, koreksi, dan barang rusak dengan riwayat audit.</p>
            </div>
          </div>
          {notice ? <div className="rounded-md bg-white/20 px-3 py-2 text-sm text-white">{notice}</div> : null}
        </div>
      </div>
      <section className="grid gap-4 lg:grid-cols-[420px_1fr]">
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-slate-800 dark:text-slate-100">Input Penyesuaian</h2>
          <div className="space-y-3">
            <select
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-2"
              value={mode}
              onChange={(e) => setMode(e.target.value as "ADJUSTMENT" | "WASTE")}
              disabled={saving}
            >
              <option value="ADJUSTMENT">Adjustment</option>
              <option value="WASTE">Waste</option>
            </select>
            {mode === "ADJUSTMENT" ? (
              <select
                className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-2"
                value={adjReason}
                onChange={(e) => setAdjReason(e.target.value as any)}
                disabled={saving}
              >
                <option value="MANUAL">MANUAL — penyesuaian biasa</option>
                <option value="CORRECTION">CORRECTION — perbaiki kesalahan input</option>
                <option value="WASTE">WASTE — tagged sebagai waste</option>
              </select>
            ) : null}
            <select
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-2"
              value={barangId}
              onChange={(e) => setBarangId(e.target.value)}
              disabled={saving}
            >
              <option value="">Pilih barang</option>
              {sembunyikanPlaceholderBarang(data.materials).map((m: any) => (
                <option key={m.id} value={m.id}>{m.nama} - stok {m.jumlah_stok || 0}</option>
              ))}
            </select>
            <input
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 p-2"
              type="number"
              value={qty || ""}
              onChange={(e) => setQty(Number(e.target.value))}
              placeholder={mode === "WASTE" ? "Qty waste (akan dikurangi)" : "Delta stok (+/-)"}
            />
            <textarea
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 p-2"
              placeholder="Alasan / catatan (wajib)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <button
              disabled={saving}
              className="w-full rounded-md bg-emerald-600 px-4 py-2 font-medium text-white disabled:opacity-60 hover:bg-emerald-700 transition-colors"
              onClick={submit}
            >
              Posting
            </button>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-left text-slate-600 dark:text-slate-300">
              <tr>
                <th className="p-3">Tanggal</th>
                <th className="p-3">Tipe</th>
                <th className="p-3">Barang</th>
                <th className="p-3 text-right">Delta</th>
                <th className="p-3">Catatan</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="p-4 text-slate-500 dark:text-slate-400" colSpan={5}>Memuat...</td></tr>
              ) : data.movements.length === 0 ? (
                <tr><td className="p-4 text-slate-500 dark:text-slate-400" colSpan={5}>Belum ada mutasi adjustment / waste.</td></tr>
              ) : data.movements.map((movement: any) => {
                const material = data.materials.find((m: any) => m.id === movement.barang_id);
                return (
                  <tr key={movement.id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-800/60 text-slate-800 dark:text-slate-200">
                    <td className="p-3">{movement.tanggal}</td>
                    <td className="p-3">{movement.movement_type}</td>
                    <td className="p-3">{material?.nama || movement.barang_id}</td>
                    <td className={`p-3 text-right ${movement.qty_delta < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>{movement.qty_delta}</td>
                    <td className="p-3">{movement.catatan}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
