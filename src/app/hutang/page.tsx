"use client";

import { useMemo, useState } from "react";
import { useCachedData } from "@/lib/use-cached-data";
import { DebtIcon } from "@/components/icons/PageIcons";
import { getDebtsAction, payDebtAction, revertDebtPaymentAction } from "./actions";

const money = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

export default function HutangPage() {
  const { data: debtsData, isLoading, mutate } = useCachedData<any[]>(
    "hutang-list",
    getDebtsAction
  );
  const debts = useMemo(() => debtsData ?? [], [debtsData]);
  const loading = isLoading && !debtsData;
  const reload = async () => {
    await mutate();
  };
  const [vendor, setVendor] = useState("");
  const [status, setStatus] = useState("");
  const [amountByDebt, setAmountByDebt] = useState<Record<string, number>>({});
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(
    () =>
      debts.filter((debt) => {
        if (vendor && !String(debt.vendor_name || "").toLowerCase().includes(vendor.toLowerCase())) return false;
        if (status && debt.status_pembayaran !== status) return false;
        return true;
      }),
    [debts, vendor, status]
  );

  async function pay(debt: any) {
    const amount = Number(amountByDebt[debt.id] || 0);
    if (amount <= 0) return setNotice("Nominal bayar harus lebih dari 0.");
    setSaving(true);
    try {
      await payDebtAction({
        purchase_id: debt.id,
        jumlah_bayar: amount,
        tanggal_bayar: new Date().toISOString().slice(0, 10),
        metode_pembayaran: "CASH",
      });
      setAmountByDebt((prev) => ({ ...prev, [debt.id]: 0 }));
      setNotice("Pembayaran hutang tersimpan.");
      await reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Gagal bayar hutang");
    } finally {
      setSaving(false);
    }
  }

  async function revert(debt: any) {
    if (!window.confirm(
      `Revert pembayaran ${debt.nomor_pembelian || debt.nomor_faktur}?\nIni akan menghapus pelunasan dan kembalikan saldo hutang.`
    )) return;
    setSaving(true);
    try {
      await revertDebtPaymentAction(debt.id);
      setNotice("Pembayaran hutang direvert.");
      await reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Gagal revert");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Title Card */}
      <div className="bg-gradient-to-br from-rose-500 to-orange-500 rounded-2xl shadow-lg p-6 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <DebtIcon size={28} className="text-white" />
            <div>
              <h2 className="text-2xl font-bold uppercase tracking-wide">Hutang</h2>
              <p className="text-white/90 text-sm">Daftar payable vendor, pembayaran, dan revert pembayaran.</p>
            </div>
          </div>
          {notice ? <div className="rounded-md bg-white/20 px-3 py-2 text-sm text-white">{notice}</div> : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 shadow-sm">
        <input className="rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 p-2" placeholder="Filter vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} />
        <select className="rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-2" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Semua status</option>
          <option value="HUTANG">HUTANG</option>
          <option value="SEBAGIAN">SEBAGIAN</option>
        </select>
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800 text-left text-slate-600 dark:text-slate-300">
            <tr><th className="p-3">Pembelian</th><th className="p-3">Vendor</th><th className="p-3">Status</th><th className="p-3 text-right">Sisa</th><th className="p-3">Bayar</th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="p-4 text-slate-500 dark:text-slate-400" colSpan={5}>Memuat...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td className="p-4 text-slate-500 dark:text-slate-400" colSpan={5}>{debts.length === 0 ? "Belum ada hutang." : "Tidak ada hasil yang cocok."}</td></tr>
            ) : filtered.map((debt) => (
              <tr key={debt.id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-800/60 text-slate-800 dark:text-slate-200">
                <td className="p-3 font-medium">{debt.nomor_pembelian || debt.nomor_faktur}</td>
                <td className="p-3">{debt.vendor_name || "-"}</td>
                <td className="p-3">{debt.status_pembayaran}</td>
                <td className="p-3 text-right">{money(debt.sisa_hutang)}</td>
                <td className="flex flex-wrap gap-2 p-3">
                  <input className="w-32 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-1" type="number" min="0" value={amountByDebt[debt.id] || ""} onChange={(e) => setAmountByDebt((prev) => ({ ...prev, [debt.id]: Number(e.target.value) }))} />
                  <button disabled={saving} className="rounded bg-emerald-600 px-2 py-1 text-white disabled:opacity-50 hover:bg-emerald-700 transition-colors" onClick={() => pay(debt)}>Bayar</button>
                  <button disabled={saving} className="rounded border border-slate-300 dark:border-slate-600 px-2 py-1 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors" onClick={() => revert(debt)}>Revert</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
