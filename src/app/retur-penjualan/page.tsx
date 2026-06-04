"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useCachedData } from "@/lib/use-cached-data";
import { SalesReturnIcon } from "@/components/icons/PageIcons";
import { createSalesReturnAction, getSalesReturnInitAction } from "./actions";

const money = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const initial = { sales: [], returns: [] };

export default function SalesReturnsPage() {
  const { data: rawData, isLoading, mutate } = useCachedData<any>(
    "sales-returns-init",
    getSalesReturnInitAction
  );
  const data = rawData ?? initial;
  const loading = isLoading && !rawData;
  const reload = async () => {
    await mutate();
  };
  const [saleId, setSaleId] = useState("");
  const [qtyByItem, setQtyByItem] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const sale = useMemo(
    () => data.sales.find((row: any) => row.id === saleId),
    [data.sales, saleId]
  );

  async function submit() {
    const lines = Object.entries(qtyByItem)
      .map(([item_penjualan_id, qty]) => ({ item_penjualan_id, qty: Number(qty || 0) }))
      .filter((line) => line.qty > 0);
    if (!saleId || lines.length === 0 || !reason.trim()) {
      return setNotice("Pilih faktur, qty, dan alasan retur.");
    }
    if (!window.confirm(
      `Posting retur penjualan?\nIni akan: stok kembali, piutang dikurangi, refund kas (kalau faktur sudah terbayar).`
    )) return;
    setSaving(true);
    try {
      await createSalesReturnAction({ sale_id: saleId, reason, items: lines });
      setQtyByItem({});
      setReason("");
      setNotice("Retur penjualan diposting.");
      await reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Gagal retur penjualan");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Title Card */}
      <div className="bg-gradient-to-br from-rose-500 to-pink-600 rounded-2xl shadow-lg p-6 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <SalesReturnIcon size={28} className="text-white" />
            <div>
              <h2 className="text-2xl font-bold uppercase tracking-wide">Retur Penjualan</h2>
              <p className="text-white/90 text-sm">Stok kembali, piutang/refund dihitung otomatis, HPP dibalik.</p>
            </div>
          </div>
          {notice ? <div className="rounded-md bg-white/20 px-3 py-2 text-sm text-white">{notice}</div> : null}
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-[460px_1fr]">
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-slate-800 dark:text-slate-100">Buat Retur</h2>
          <div className="space-y-3">
            <select className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-2" value={saleId} onChange={(e) => { setSaleId(e.target.value); setQtyByItem({}); }} disabled={saving}>
              <option value="">Pilih faktur</option>
              {data.sales.map((saleRow: any) => (
                <option key={saleRow.id} value={saleRow.id}>{saleRow.nomor_faktur} - {money(saleRow.total_jumlah)}</option>
              ))}
            </select>
            {sale ? (
              <div className="space-y-2">
                {(sale.items || []).map((item: any) => (
                  <div key={item.id} className="grid grid-cols-[1fr_80px_90px] gap-2 rounded-md bg-slate-50 dark:bg-slate-800 p-2 text-sm">
                    <span className="truncate text-slate-800 dark:text-slate-100">{item.barang_nama || item.barang_id}</span>
                    <span className="text-slate-600 dark:text-slate-300">{item.jumlah} {item.nama_satuan}</span>
                    <input className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 p-1" type="number" min="0" max={item.jumlah} value={qtyByItem[item.id] || ""} onChange={(e) => setQtyByItem((prev) => ({ ...prev, [item.id]: Number(e.target.value) }))} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-slate-300 dark:border-slate-600 p-3 text-center text-xs text-slate-500 dark:text-slate-400">Pilih faktur untuk lihat item.</div>
            )}
            <textarea className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 p-2" placeholder="Alasan retur (wajib)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <button disabled={saving} className="w-full rounded-md bg-rose-600 px-4 py-2 font-medium text-white disabled:opacity-60 hover:bg-rose-700 transition-colors" onClick={submit}>Posting Retur</button>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-left text-slate-600 dark:text-slate-300">
              <tr><th className="p-3">Nomor</th><th className="p-3">Faktur</th><th className="p-3 text-right">Retur</th><th className="p-3 text-right">Piutang ↓</th><th className="p-3 text-right">Refund</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="p-4 text-slate-500 dark:text-slate-400" colSpan={5}>Memuat...</td></tr>
              ) : data.returns.length === 0 ? (
                <tr><td className="p-4 text-slate-500 dark:text-slate-400" colSpan={5}>Belum ada retur penjualan.</td></tr>
              ) : data.returns.map((retur: any) => (
                <tr key={retur.id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-800/60 text-slate-800 dark:text-slate-200">
                  <td className="p-3 font-medium">{retur.nomor_retur}</td>
                  <td className="p-3">
                    {retur.source?.id ? (
                      <Link className="text-cyan-600 dark:text-cyan-400 underline-offset-2 hover:underline" href={`/pos?invoice=${retur.source.id}`}>
                        {retur.source.nomor_faktur || retur.penjualan_id}
                      </Link>
                    ) : retur.penjualan_id}
                  </td>
                  <td className="p-3 text-right">{money(retur.total_retur)}</td>
                  <td className="p-3 text-right">{money(retur.receivable_reduction)}</td>
                  <td className="p-3 text-right">{money(retur.refund_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
