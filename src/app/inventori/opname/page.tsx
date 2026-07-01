"use client";

import { useEffect, useMemo, useState } from "react";
import { useCachedData } from "@/lib/use-cached-data";
import { StockOpnameIcon } from "@/components/icons/PageIcons";
import {
  cancelStockOpnameAction,
  createStockOpnameAction,
  getStockOpnamesAction,
  postStockOpnameAction,
  updateStockOpnameCountsAction,
} from "./actions";

export default function StockOpnamePage() {
  const {
    data: sessionsData,
    isLoading,
    mutate,
  } = useCachedData<any[]>("stock-opname-list", getStockOpnamesAction);
  const sessions = useMemo(() => sessionsData ?? [], [sessionsData]);
  const loading = isLoading && !sessionsData;
  const reload = async () => {
    await mutate();
  };
  const [selectedId, setSelectedId] = useState("");
  const [counts, setCounts] = useState<
    Record<string, { qty?: number; linear_m?: number }>
  >({});
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!selectedId && sessions[0]) setSelectedId(sessions[0].id);
  }, [sessions, selectedId]);

  const selected = useMemo(
    () => sessions.find((session) => session.id === selectedId),
    [sessions, selectedId],
  );

  useEffect(() => {
    if (!selected) return;
    setCounts((prev) => {
      const next: Record<string, { qty?: number; linear_m?: number }> = {};
      let differs = false;
      for (const item of selected.items || []) {
        const isRoll = !!item.roll_variant_id;
        const value = isRoll
          ? {
              linear_m: Number(
                item.counted_linear_m ?? item.system_linear_m ?? 0,
              ),
            }
          : { qty: Number(item.counted_qty ?? item.system_qty ?? 0) };
        next[item.id] = value;
        if (JSON.stringify(prev[item.id]) !== JSON.stringify(value))
          differs = true;
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
      setNotice(
        error instanceof Error ? error.message : "Gagal membuat opname",
      );
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
        Object.entries(counts).map(([stock_opname_item_id, val]) => ({
          stock_opname_item_id,
          counted_qty: val.qty,
          counted_linear_m: val.linear_m,
        })),
      );
      setNotice("Hitungan fisik tersimpan.");
      await reload();
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Gagal simpan hitungan",
      );
    } finally {
      setSaving(false);
    }
  }

  async function post() {
    if (!selected) return;
    if (
      !window.confirm(
        `Posting stock opname ${selected.nomor_opname}?\nDelta akan menjadi mutasi ADJUSTMENT dan stok di sistem akan diupdate. Item dengan delta nol tidak akan membuat mutasi.`,
      )
    )
      return;
    setSaving(true);
    try {
      await updateStockOpnameCountsAction(
        selected.id,
        Object.entries(counts).map(([stock_opname_item_id, val]) => ({
          stock_opname_item_id,
          counted_qty: val.qty,
          counted_linear_m: val.linear_m,
        })),
      );
      await postStockOpnameAction(selected.id);
      setNotice("Stock opname diposting.");
      await reload();
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Gagal posting opname",
      );
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
      {/* Kartu judul */}
      <div className="bg-gradient-to-br from-lime-500 to-emerald-600 rounded-2xl shadow-lg p-6 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <StockOpnameIcon size={28} className="text-white" />
            <div>
              <h2 className="text-2xl font-bold uppercase tracking-wide">
                Opname Stok
              </h2>
              <p className="text-white/90 text-sm">
                Snapshot stok sistem, input fisik, pratinjau selisih, lalu
                posting penyesuaian.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {notice ? (
              <div className="rounded-md bg-white/20 px-3 py-2 text-sm text-white">
                {notice}
              </div>
            ) : null}
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
              <div className="p-3 text-sm text-slate-500 dark:text-slate-400">
                Memuat...
              </div>
            ) : sessions.length === 0 ? (
              <div className="p-3 text-sm text-slate-500 dark:text-slate-400">
                Belum ada sesi opname.
              </div>
            ) : (
              sessions.map((session) => (
                <button
                  key={session.id}
                  className={`w-full rounded-md border p-3 text-left text-sm transition-colors ${
                    session.id === selectedId
                      ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 dark:border-emerald-500"
                      : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`}
                  onClick={() => setSelectedId(session.id)}
                >
                  <div className="font-semibold text-slate-800 dark:text-slate-100">
                    {session.nomor_opname}
                  </div>
                  <div className="text-slate-500 dark:text-slate-400">
                    {session.status} - {session.tanggal}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
          {selected ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-700 p-4">
                <div>
                  <div className="font-semibold text-slate-800 dark:text-slate-100">
                    {selected.nomor_opname}
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">
                    Status {selected.status} - delta qty{" "}
                    {selected.total_delta_qty || 0}
                  </div>
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
                      <th className="p-3 text-right">Fisik (m² atau unit)</th>
                      <th className="p-3 text-right">Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      // Kelompokkan: non-roll tampil langsung, roll dikelompokkan per barang_id.
                      const items: any[] = selected.items || [];
                      const nonRoll = items.filter(
                        (item: any) => !item.roll_variant_id,
                      );
                      const rollByBarang = new Map<string, any[]>();
                      for (const item of items.filter(
                        (i: any) => i.roll_variant_id,
                      )) {
                        const list = rollByBarang.get(item.barang_id) || [];
                        list.push(item);
                        rollByBarang.set(item.barang_id, list);
                      }

                      const rows: React.ReactElement[] = [];

                      // Tampilkan barang dimensi dulu (per group)
                      for (const [barangId, variantItems] of rollByBarang) {
                        const totalSistem = variantItems.reduce(
                          (sum: number, i: any) =>
                            sum + Number(i.system_qty || 0),
                          0,
                        );
                        rows.push(
                          <tr
                            key={`group-${barangId}`}
                            className="bg-emerald-50/50 dark:bg-emerald-900/10 border-t border-slate-200 dark:border-slate-700"
                          >
                            <td
                              className="p-3 font-semibold text-emerald-800 dark:text-emerald-300"
                              colSpan={4}
                            >
                              {variantItems[0].barang_nama || barangId}
                              <span className="ml-2 text-xs font-normal text-emerald-600 dark:text-emerald-400">
                                ({totalSistem.toFixed(2)} m² sistem)
                              </span>
                            </td>
                          </tr>,
                        );

                        for (const item of variantItems) {
                          const countVal = counts[item.id] ?? {
                            linear_m: Number(item.system_linear_m ?? 0),
                          };
                          const countedLinear = countVal.linear_m ?? 0;
                          const countedQty =
                            countedLinear * Number(item.roll_width_m);
                          const delta =
                            countedQty - Number(item.system_qty || 0);

                          rows.push(
                            <tr
                              key={item.id}
                              className="border-t border-slate-100 dark:border-slate-800 text-slate-800 dark:text-slate-200"
                            >
                              <td className="p-3 pl-8 text-sm text-slate-500 dark:text-slate-400">
                                ↳ Lebar {Number(item.roll_width_m).toFixed(2)} m
                              </td>
                              <td className="p-3 text-right tabular-nums text-sm">
                                {Number(item.system_linear_m ?? 0).toFixed(2)} m
                                <span className="ml-1 text-xs text-slate-400">
                                  (= {Number(item.system_qty || 0).toFixed(2)}{" "}
                                  m²)
                                </span>
                              </td>
                              <td className="p-3 text-right">
                                <input
                                  disabled={
                                    saving || selected.status !== "DRAFT"
                                  }
                                  className="w-28 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-1 text-right text-sm"
                                  type="number"
                                  step="0.01"
                                  value={countedLinear}
                                  onChange={(e) =>
                                    setCounts((prev) => ({
                                      ...prev,
                                      [item.id]: {
                                        linear_m: Number(e.target.value),
                                      },
                                    }))
                                  }
                                />
                                <span className="ml-1 text-xs text-slate-400">
                                  m
                                </span>
                              </td>
                              <td
                                className={`p-3 text-right tabular-nums text-sm ${
                                  delta === 0
                                    ? "text-slate-400 dark:text-slate-500"
                                    : delta < 0
                                      ? "text-rose-600 dark:text-rose-400"
                                      : "text-emerald-600 dark:text-emerald-400"
                                }`}
                              >
                                {delta === 0
                                  ? "\u2014"
                                  : `${delta > 0 ? "+" : ""}${delta.toFixed(2)} m²`}
                              </td>
                            </tr>,
                          );
                        }
                      }

                      // Tampilkan barang non-dimensi
                      for (const item of nonRoll) {
                        const countVal = counts[item.id] ?? {
                          qty: Number(item.system_qty || 0),
                        };
                        const counted = countVal.qty ?? 0;
                        const delta = counted - Number(item.system_qty || 0);

                        rows.push(
                          <tr
                            key={item.id}
                            className="border-t border-slate-100 dark:border-slate-800 text-slate-800 dark:text-slate-200"
                          >
                            <td className="p-3">
                              <span>{item.barang_nama || item.barang_id}</span>
                              {Number(item.butuh_dimensi_status) === 1 &&
                                !item.roll_variant_id && (
                                  <span className="ml-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                                    (dimensi)
                                  </span>
                                )}
                            </td>
                            <td className="p-3 text-right tabular-nums">
                              {Number(item.butuh_dimensi_status) === 1
                                ? `${Number(item.system_qty || 0).toFixed(2)} m²`
                                : String(item.system_qty ?? 0)}
                            </td>
                            <td className="p-3 text-right">
                              <input
                                disabled={saving || selected.status !== "DRAFT"}
                                className="w-28 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-1 text-right"
                                type="number"
                                value={counted}
                                onChange={(e) =>
                                  setCounts((prev) => ({
                                    ...prev,
                                    [item.id]: {
                                      qty: Number(e.target.value),
                                    },
                                  }))
                                }
                              />
                            </td>
                            <td
                              className={`p-3 text-right tabular-nums ${
                                delta === 0
                                  ? "text-slate-400 dark:text-slate-500"
                                  : delta < 0
                                    ? "text-rose-600 dark:text-rose-400"
                                    : "text-emerald-600 dark:text-emerald-400"
                              }`}
                            >
                              {delta}
                            </td>
                          </tr>,
                        );
                      }

                      return rows;
                    })()}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="p-6 text-sm text-slate-500 dark:text-slate-400">
              Pilih sesi opname atau klik &ldquo;Sesi Baru&rdquo; untuk memulai.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
