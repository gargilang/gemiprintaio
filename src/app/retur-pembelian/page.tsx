"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useCachedData } from "@/lib/use-cached-data";
import { PurchaseReturnIcon } from "@/components/icons/PageIcons";
import {
  createPurchaseReturnAction,
  getPurchaseReturnInitAction,
} from "./actions";

const money = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const initial = { purchases: [], returns: [] };

export default function PurchaseReturnsPage() {
  const {
    data: rawData,
    isLoading,
    mutate,
  } = useCachedData<any>("purchase-returns-init", getPurchaseReturnInitAction);
  const data = rawData ?? initial;
  const loading = isLoading && !rawData;
  const reload = async () => {
    await mutate();
  };
  const [purchaseId, setPurchaseId] = useState("");
  const [qtyByItem, setQtyByItem] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const purchase = useMemo(
    () => data.purchases.find((row: any) => row.id === purchaseId),
    [data.purchases, purchaseId],
  );

  async function submit() {
    const lines = Object.entries(qtyByItem)
      .map(([item_pembelian_id, qty]) => ({
        item_pembelian_id,
        qty: Number(qty || 0),
      }))
      .filter((line) => line.qty > 0);
    if (!purchaseId || lines.length === 0 || !reason.trim()) {
      return setNotice("Pilih pembelian, qty, dan alasan retur.");
    }
    if (
      !window.confirm(
        `Posting retur pembelian?\nIni akan: stok keluar, hutang dikurangi, refund vendor (jika sudah terbayar).`,
      )
    )
      return;
    setSaving(true);
    try {
      await createPurchaseReturnAction({
        purchase_id: purchaseId,
        reason,
        items: lines,
      });
      setQtyByItem({});
      setReason("");
      setNotice("Retur pembelian diposting.");
      await reload();
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Gagal retur pembelian",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Title Card */}
      <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl shadow-lg p-6 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <PurchaseReturnIcon size={28} className="text-white" />
            <div>
              <h2 className="text-2xl font-bold uppercase tracking-wide">
                Retur Pembelian
              </h2>
              <p className="text-white/90 text-base">
                Stok keluar, hutang dikurangi dulu, refund vendor dicatat ke
                kas.
              </p>
            </div>
          </div>
          {notice ? (
            <div className="rounded-md bg-white/20 px-3 py-2 text-base text-white">
              {notice}
            </div>
          ) : null}
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-[460px_1fr]">
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-slate-800 dark:text-slate-100">
            Buat Retur
          </h2>
          <div className="space-y-3">
            <select
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-2"
              value={purchaseId}
              onChange={(e) => {
                setPurchaseId(e.target.value);
                setQtyByItem({});
              }}
              disabled={saving}
            >
              <option value="">Pilih pembelian</option>
              {data.purchases.map((row: any) => (
                <option key={row.id} value={row.id}>
                  {row.nomor_pembelian || row.nomor_faktur} -{" "}
                  {money(row.total_harga || row.total_jumlah)}
                </option>
              ))}
            </select>
            {purchase ? (
              <div className="space-y-2">
                {(purchase.items || []).map((item: any) => (
                  <div
                    key={item.id}
                    className="grid grid-cols-[1fr_80px_90px] gap-2 rounded-md bg-slate-50 dark:bg-slate-800 p-2 text-base"
                  >
                    <span className="truncate text-slate-800 dark:text-slate-100">
                      {item.nama_barang || item.barang_id}
                    </span>
                    <span className="text-slate-600 dark:text-slate-300">
                      {item.jumlah} {item.nama_satuan}
                    </span>
                    <input
                      className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 p-1"
                      type="number"
                      min="0"
                      max={item.jumlah}
                      value={qtyByItem[item.id] || ""}
                      onChange={(e) =>
                        setQtyByItem((prev) => ({
                          ...prev,
                          [item.id]: Number(e.target.value),
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-slate-300 dark:border-slate-600 p-3 text-center text-sm text-slate-500 dark:text-slate-400">
                Pilih pembelian untuk lihat item.
              </div>
            )}
            <textarea
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 p-2"
              placeholder="Alasan retur (wajib)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <button
              disabled={saving}
              className="w-full rounded-md bg-amber-600 px-4 py-2.5 font-medium text-white disabled:opacity-60 hover:bg-amber-700 transition-colors"
              onClick={submit}
            >
              Posting Retur
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
          <table className="w-full text-base">
            <thead className="bg-slate-50 dark:bg-slate-800 text-left text-slate-600 dark:text-slate-300">
              <tr>
                <th className="p-3">Nomor</th>
                <th className="p-3">Pembelian</th>
                <th className="p-3 text-right">Retur</th>
                <th className="p-3 text-right">Hutang ↓</th>
                <th className="p-3 text-right">Refund</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    className="p-4 text-slate-500 dark:text-slate-400"
                    colSpan={5}
                  >
                    Memuat...
                  </td>
                </tr>
              ) : data.returns.length === 0 ? (
                <tr>
                  <td
                    className="p-4 text-slate-500 dark:text-slate-400"
                    colSpan={5}
                  >
                    Belum ada retur pembelian.
                  </td>
                </tr>
              ) : (
                data.returns.map((retur: any) => (
                  <tr
                    key={retur.id}
                    className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-800/60 text-slate-800 dark:text-slate-200"
                  >
                    <td className="p-3 font-medium">{retur.nomor_retur}</td>
                    <td className="p-3">
                      {retur.source?.id ? (
                        <Link
                          className="text-cyan-600 dark:text-cyan-400 underline-offset-2 hover:underline"
                          href={`/pembelian?id=${retur.source.id}`}
                        >
                          {retur.source.nomor_pembelian ||
                            retur.source.nomor_faktur ||
                            retur.pembelian_id}
                        </Link>
                      ) : (
                        retur.pembelian_id
                      )}
                    </td>
                    <td className="p-3 text-right">
                      {money(retur.total_retur)}
                    </td>
                    <td className="p-3 text-right">
                      {money(retur.debt_reduction)}
                    </td>
                    <td className="p-3 text-right">
                      {money(retur.refund_amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
