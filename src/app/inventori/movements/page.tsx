"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useCachedData } from "@/lib/use-cached-data";
import { sembunyikanPlaceholderBarang } from "@/lib/barang-placeholder";
import { MovementLedgerIcon } from "@/components/icons/PageIcons";
import { getMovementLedgerAction } from "./actions";
import { formatQtyMutasi, formatSaldoMutasi } from "@/lib/format-dimensi";
import type { InventoryMovementType } from "@/lib/services/inventory-service";

const movementTypes: Array<"" | InventoryMovementType> = [
  "",
  "OPENING_BALANCE",
  "PURCHASE_RECEIPT",
  "SALE_ISSUE",
  "SALE_VOID",
  "SALE_RETURN",
  "PURCHASE_VOID",
  "PURCHASE_RETURN",
  "ADJUSTMENT",
  "WASTE",
];

const money = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

type Filters = {
  barang_id: string;
  movement_type: "" | InventoryMovementType;
  source_type: string;
  reference: string;
  date_from: string;
  date_to: string;
};

const initialFilters: Filters = {
  barang_id: "",
  movement_type: "",
  source_type: "",
  reference: "",
  date_from: "",
  date_to: "",
};

const initialPayload = { movements: [] as any[], materials: [] as any[] };

function sourceLink(row: any): string | null {
  const id = row.source_id;
  if (!id) return null;
  switch ((row.source_type || "").toUpperCase()) {
    case "SALE":
      return `/pos?invoice=${id}`;
    case "PURCHASE":
      return `/pembelian?id=${id}`;
    case "SALE_RETURN":
      return `/retur-penjualan#${id}`;
    case "PURCHASE_RETURN":
      return `/retur-pembelian#${id}`;
    case "STOCK_OPNAME":
      return `/inventori/opname#${id}`;
    case "ADJUSTMENT":
    case "WASTE":
      return `/inventori/adjustments#${id}`;
    default:
      return null;
  }
}

export default function MovementLedgerPage() {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [pendingFilters, setPendingFilters] = useState<Filters>(initialFilters);

  const cacheKey = `movement-ledger:${JSON.stringify(filters)}`;
  const {
    data: rawData,
    isLoading,
    mutate,
  } = useCachedData<any>(cacheKey, () =>
    getMovementLedgerAction({
      ...filters,
      barang_id: filters.barang_id || undefined,
      movement_type: filters.movement_type || undefined,
      source_type: filters.source_type || undefined,
      reference: filters.reference || undefined,
      date_from: filters.date_from || undefined,
      date_to: filters.date_to || undefined,
    }),
  );
  const data = rawData ?? initialPayload;
  const loading = isLoading && !rawData;
  const reload = async () => {
    await mutate();
  };

  function applyFilters() {
    setFilters(pendingFilters);
  }

  function resetFilters() {
    setPendingFilters(initialFilters);
    setFilters(initialFilters);
  }

  const totalDelta = useMemo(
    () =>
      data.movements.reduce(
        (sum: number, row: any) => sum + Number(row.qty_delta || 0),
        0,
      ),
    [data.movements],
  );
  const totalValue = useMemo(
    () =>
      data.movements.reduce(
        (sum: number, row: any) => sum + Number(row.value_delta || 0),
        0,
      ),
    [data.movements],
  );

  function exportCsv() {
    if (data.movements.length === 0) return;
    const header = [
      "tanggal",
      "barang",
      "movement_type",
      "qty_delta",
      "qty_after",
      "running_balance",
      "roll_width_m",
      "linear_delta_m",
      "unit_cost",
      "value_delta",
      "source_type",
      "source_id",
      "catatan",
    ];
    const escape = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [header.join(",")];
    for (const row of data.movements as any[]) {
      lines.push(
        [
          row.tanggal,
          row.barang_nama,
          row.movement_type,
          row.qty_delta,
          row.qty_after,
          row.running_balance,
          row.roll_width_m ?? "",
          row.linear_delta_m ?? "",
          row.unit_cost,
          row.value_delta,
          row.source_type,
          row.source_id,
          row.catatan,
        ]
          .map(escape)
          .join(","),
      );
    }
    const blob = new Blob([lines.join("\r\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `movement-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Kartu judul */}
      <div className="bg-gradient-to-br from-slate-600 to-slate-800 rounded-2xl shadow-lg p-6 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MovementLedgerIcon size={28} className="text-white" />
            <div>
              <h2 className="text-2xl font-bold uppercase tracking-wide">
                Riwayat Mutasi Stok
              </h2>
              <p className="text-white/90 text-base">
                Ledger stok global dengan filter tanggal, barang, tipe mutasi,
                dan referensi.
              </p>
            </div>
          </div>
          <button
            className="rounded bg-emerald-500 hover:bg-emerald-600 px-3 py-1.5 text-white text-base transition-colors"
            onClick={exportCsv}
            disabled={data.movements.length === 0}
          >
            Ekspor CSV
          </button>
        </div>
      </div>
      <div className="grid gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 shadow-sm md:grid-cols-6">
        <input
          className="rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-2"
          type="date"
          value={pendingFilters.date_from}
          onChange={(e) =>
            setPendingFilters((prev) => ({
              ...prev,
              date_from: e.target.value,
            }))
          }
        />
        <input
          className="rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-2"
          type="date"
          value={pendingFilters.date_to}
          onChange={(e) =>
            setPendingFilters((prev) => ({ ...prev, date_to: e.target.value }))
          }
        />
        <select
          className="rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-2"
          value={pendingFilters.barang_id}
          onChange={(e) =>
            setPendingFilters((prev) => ({
              ...prev,
              barang_id: e.target.value,
            }))
          }
        >
          <option value="">Semua barang</option>
          {sembunyikanPlaceholderBarang(data.materials).map((material: any) => (
            <option key={material.id} value={material.id}>
              {material.nama}
            </option>
          ))}
        </select>
        <select
          className="rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-2"
          value={pendingFilters.movement_type}
          onChange={(e) =>
            setPendingFilters((prev) => ({
              ...prev,
              movement_type: e.target.value as "" | InventoryMovementType,
            }))
          }
        >
          {movementTypes.map((type) => (
            <option key={type || "all"} value={type}>
              {type || "Semua tipe"}
            </option>
          ))}
        </select>
        <input
          className="rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 p-2"
          placeholder="Source type"
          value={pendingFilters.source_type}
          onChange={(e) =>
            setPendingFilters((prev) => ({
              ...prev,
              source_type: e.target.value,
            }))
          }
        />
        <div className="flex gap-2">
          <button
            className="flex-1 rounded-md bg-slate-900 dark:bg-slate-700 px-4 py-2.5 text-white hover:bg-slate-800 dark:hover:bg-slate-600 transition-colors"
            onClick={applyFilters}
          >
            Filter
          </button>
          <button
            className="rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2.5 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            onClick={resetFilters}
          >
            Reset
          </button>
        </div>
        <input
          className="rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 p-2 md:col-span-6"
          placeholder="Cari reference, source id, catatan"
          value={pendingFilters.reference}
          onChange={(e) =>
            setPendingFilters((prev) => ({
              ...prev,
              reference: e.target.value,
            }))
          }
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-base shadow-sm">
        <div>
          <span className="text-slate-500 dark:text-slate-400">
            Total baris
          </span>{" "}
          <span className="font-semibold text-slate-800 dark:text-slate-100">
            {data.movements.length}
          </span>
          <span className="mx-3 text-slate-300 dark:text-slate-600">|</span>
          <span className="text-slate-500 dark:text-slate-400">
            Net qty
          </span>{" "}
          <span
            className={`font-semibold ${totalDelta < 0 ? "text-rose-600 dark:text-rose-400" : totalDelta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-slate-800 dark:text-slate-100"}`}
          >
            {totalDelta}
          </span>
          <span className="mx-3 text-slate-300 dark:text-slate-600">|</span>
          <span className="text-slate-500 dark:text-slate-400">
            Net nilai
          </span>{" "}
          <span className="font-semibold text-slate-800 dark:text-slate-100">
            {money(totalValue)}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            className="rounded border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            onClick={() => reload()}
          >
            Muat Ulang
          </button>
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
        <table className="w-full text-base">
          <thead className="bg-slate-50 dark:bg-slate-800 text-left text-slate-600 dark:text-slate-300">
            <tr>
              <th className="p-3">Tanggal</th>
              <th className="p-3">Barang</th>
              <th className="p-3 text-right">Qty / Delta</th>
              <th className="p-3 text-right">Saldo</th>
              <th className="p-3 text-right">Nilai</th>
              <th className="p-3">Sumber</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  className="p-4 text-slate-500 dark:text-slate-400"
                  colSpan={6}
                >
                  Memuat...
                </td>
              </tr>
            ) : data.movements.length === 0 ? (
              <tr>
                <td
                  className="p-4 text-slate-500 dark:text-slate-400"
                  colSpan={6}
                >
                  Tidak ada mutasi yang cocok.
                </td>
              </tr>
            ) : (
              (data.movements as any[]).map((row) => {
                const link = sourceLink(row);
                return (
                  <tr
                    key={row.id}
                    className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-800/60 text-slate-800 dark:text-slate-200"
                  >
                    <td className="p-3">{row.tanggal}</td>
                    <td className="p-3">{row.barang_nama}</td>
                    <td
                      className={`p-3 text-right tabular-nums ${Number(row.qty_delta || 0) < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}
                    >
                      {formatQtyMutasi(row)}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {formatSaldoMutasi(
                        Number(row.running_balance ?? row.qty_after ?? 0),
                        Number(row.butuh_dimensi_status) === 1,
                      )}
                    </td>
                    <td className="p-3 text-right">{money(row.value_delta)}</td>
                    <td className="p-3 text-sm">
                      <div className="font-medium">
                        {link ? (
                          <Link
                            className="text-cyan-600 dark:text-cyan-400 underline-offset-2 hover:underline"
                            href={link}
                          >
                            {row.source_type || "-"}
                          </Link>
                        ) : (
                          row.source_type || "-"
                        )}
                      </div>
                      <div className="text-slate-500 dark:text-slate-400">
                        {row.source_id}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
