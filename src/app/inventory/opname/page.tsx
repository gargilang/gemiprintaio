"use client";

import { useEffect, useMemo, useState } from "react";
import { useAsyncData } from "@/hooks/use-async-data";
import { StockOpnameIcon } from "@/components/icons/PageIcons";
import {
  cancelStockOpnameAction,
  createStockOpnameAction,
  getStockOpnamesAction,
  postStockOpnameAction,
  updateStockOpnameCountsAction,
} from "./actions";

export default function StockOpnamePage() {
  const { data: sessions, loading, reload } = useAsyncData<any[]>(
    () => getStockOpnamesAction(),
    []
  );
  const [selectedId, setSelectedId] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!selectedId && sessions[0]) setSelectedId(sessions[0].id);
  }, [sessions, selectedId]);

  const selected = useMemo(
    () => sessions.find((session) => session.id === selectedId),
    [sessions, selectedId]
  );

  useEffect(() => {
    if (!selected) return;
    setCounts((prev) => {
      const next: Record<string, number> = {};
      let differs = false;
      for (const item of selected.items || []) {
        const value = Number(item.counted_qty ?? item.system_qty ?? 0);
        next[item.id] = value;
        if (prev[item.id] !== value) differs = true;
      }
      const prevKeys = Object.keys(prev);
      if (!differs && prevKeys.length === Object.keys(next).length) return prev;
      return next;
    });
  }, [selected]);

  async function createSession() {
    setSaving(true);
    try {
      const result = await createStockOpnameAction({});
      setNotice("Sesi opname dibuat.");
      setSelectedId(result.id);
      await reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Gagal membuat opname");
    } finally {
      setSaving(false);
    }
  }

  async function saveCounts(idOverride?: string) {
    const id = idOverride || selected?.id;
    if (!id) return;
    setSaving(true);
    try {
      await updateStockOpnameCountsAction(
        id,
        Object.entries(counts).map(([stock_opname_item_id, counted_qty]) => ({
          stock_opname_item_id,
          counted_qty,
        }))
      );
      setNotice("Hitungan fisik tersimpan.");
      await reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Gagal simpan hitungan");
    } finally {
      setSaving(false);
    }
  }

  async function post() {
    if (!selected) return;
    if (!window.confirm(
      `Posting stock opname ${selected.nomor_opname}?\nDelta akan menjadi mutasi ADJUSTMENT dan stok di sistem akan diupdate. Item dengan delta nol tidak akan membuat mutasi.`
    )) return;
    setSaving(true);
    try {
      await updateStockOpnameCountsAction(
        selected.id,
        Object.entries(counts).map(([stock_opname_item_id, counted_qty]) => ({
          stock_opname_item_id,
          counted_qty,
        }))
      );
      await postStockOpnameAction(selected.id);
      setNotice("Stock opname diposting.");
      await reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Gagal posting opname");
    } finally {
      setSaving(false);
    }
  }

  async function cancel() {
    if (!selected) return;
    if (!window.confirm(`Batalkan opname ${selected.nomor_opname}?`)) return;
    setSaving(true);
    try {
      await cancelStockOpnameAction(selected.id);
      setNotice("Sesi opname dibatalkan.");
      await reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Gagal batal opname");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Title Card */}
      <div className="bg-gradient-to-br from-lime-500 to-emerald-600 rounded-2xl shadow-lg p-6 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <StockOpnameIcon size={28} className="text-white" />
            <div>
              <h2 className="text-2xl font-bold uppercase tracking-wide">Stock Opname</h2>
              <p className="text-white/90 text-sm">Snapshot stok sistem, input fisik, preview delta, lalu posting adjustment.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {notice ? <div className="rounded-md bg-white/20 px-3 py-2 text-sm text-white">{notice}</div> : null}
            <button
              disabled={saving}
              className="rounded-md bg-white/20 hover:bg-white/30 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 transition-colors"
              onClick={createSession}
            >
              + Sesi Baru
            </button>
          </div>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 shadow-sm">
          <div className="space-y-2">
            {loading ? (
              <div className="p-3 text-sm text-slate-500 dark:text-slate-400">Memuat...</div>
            ) : sessions.length === 0 ? (
              <div className="p-3 text-sm text-slate-500 dark:text-slate-400">Belum ada sesi opname.</div>
            ) : sessions.map((session) => (
              <button
                key={session.id}
                className={`w-full rounded-md border p-3 text-left text-sm transition-colors ${
                  session.id === selectedId
                    ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 dark:border-emerald-500"
                    : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                }`}
                onClick={() => setSelectedId(session.id)}
              >
                <div className="font-semibold text-slate-800 dark:text-slate-100">{session.nomor_opname}</div>
                <div className="text-slate-500 dark:text-slate-400">{session.status} - {session.tanggal}</div>
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
          {selected ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-700 p-4">
                <div>
                  <div className="font-semibold text-slate-800 dark:text-slate-100">{selected.nomor_opname}</div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">Status {selected.status} - delta qty {selected.total_delta_qty || 0}</div>
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={saving || selected.status !== "DRAFT"}
                    className="rounded border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
                    onClick={() => saveCounts()}
                  >
                    Simpan
                  </button>
                  <button
                    disabled={saving || selected.status !== "DRAFT"}
                    className="rounded bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-50 hover:bg-emerald-700 transition-colors"
                    onClick={post}
                  >
                    Posting
                  </button>
                  <button
                    disabled={saving || selected.status !== "DRAFT"}
                    className="rounded border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
                    onClick={cancel}
                  >
                    Batal
                  </button>
                </div>
              </div>
              <div className="max-h-[70vh] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 text-left text-slate-600 dark:text-slate-300">
                    <tr>
                      <th className="p-3">Barang</th>
                      <th className="p-3 text-right">Sistem</th>
                      <th className="p-3 text-right">Fisik</th>
                      <th className="p-3 text-right">Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selected.items || []).map((item: any) => {
                      const counted = counts[item.id] ?? Number(item.system_qty || 0);
                      const delta = counted - Number(item.system_qty || 0);
                      return (
                        <tr key={item.id} className="border-t border-slate-100 dark:border-slate-800 text-slate-800 dark:text-slate-200">
                          <td className="p-3">{item.barang_nama || item.barang_id}</td>
                          <td className="p-3 text-right">{item.system_qty}</td>
                          <td className="p-3 text-right">
                            <input
                              disabled={saving || selected.status !== "DRAFT"}
                              className="w-28 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-1 text-right"
                              type="number"
                              value={counted}
                              onChange={(e) => setCounts((prev) => ({ ...prev, [item.id]: Number(e.target.value) }))}
                            />
                          </td>
                          <td className={`p-3 text-right ${delta === 0 ? "text-slate-400 dark:text-slate-500" : delta < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>{delta}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="p-6 text-sm text-slate-500 dark:text-slate-400">Pilih sesi opname atau klik &ldquo;Sesi Baru&rdquo; untuk memulai.</div>
          )}
        </div>
      </div>
    </div>
  );
}
