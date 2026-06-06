"use client";

import PilihanCari from "../PilihanCari";
import { PlusIcon, TrashIcon } from "../icons/ContentIcons";
import { type Material, type PurchaseItem, isDimensionalMaterial } from "./types";
import { sumBatchRolls } from "./split-utils";

// Satu baris item di FormulirPembelian. Diekstrak (Fase 6 B4).
// Komponen props-only: induk pegang daftar item + handler-nya.

export interface BarisItemPembelianProps {
  item: PurchaseItem;
  index: number;
  materials: Material[];
  /** True bila hanya tersisa satu item (tombol hapus dinonaktifkan). */
  isOnly: boolean;
  onItemChange: (index: number, field: keyof PurchaseItem, value: unknown) => void;
  onAddItem: () => void;
  onRemoveItem: (index: number) => void;
  onOpenSplit: (index: number) => void;
}

export default function BarisItemPembelian({
  item,
  index,
  materials,
  isOnly,
  onItemChange,
  onAddItem,
  onRemoveItem,
  onOpenSplit,
}: BarisItemPembelianProps) {
  const selectedMaterial = materials.find((m) => m.id === item.id_barang);
  const subtotal = item.jumlah * item.harga_beli;
  const isDimensional = isDimensionalMaterial(selectedMaterial);

  return (
    <tr
      className={`border-b ${
        index % 2 === 0 ? "bg-white dark:bg-slate-900" : "bg-gray-50 dark:bg-slate-800"
      }`}
    >
      <td className="px-3 py-2 align-top">
        <PilihanCari
          options={materials.map((m) => ({
            value: m.id,
            label: m.nama,
          }))}
          value={item.id_barang}
          onChange={(value) =>
            onItemChange(index, "id_barang", value)
          }
          placeholder="Cari barang..."
          emptyText="Tidak ada barang"
          inputClassName="!px-2 !py-1 !h-[30px] text-sm"
        />
        {isDimensional && (
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
            Barang dimensi · stok dalam m²
          </p>
        )}
      </td>
      <td className="px-3 py-2 align-top">
        <select
          value={item.id_satuan}
          onChange={(e) =>
            onItemChange(index, "id_satuan", e.target.value)
          }
          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 h-[30px] dark:bg-slate-800 dark:text-slate-100"
          disabled={!item.id_barang}
          required
        >
          <option value="" disabled hidden>Satuan</option>
          {selectedMaterial?.unit_prices.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.nama_satuan}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2 align-top">
        {isDimensional ? (
          <div className="space-y-1">
            <div className="flex items-center justify-center gap-1">
              <input
                type="number"
                value={item.jumlah_roll ?? 1}
                onChange={(e) =>
                  onItemChange(
                    index,
                    "jumlah_roll",
                    e.target.value === ""
                      ? 1
                      : Math.max(
                          1,
                          Math.round(
                            parseFloat(e.target.value) || 1
                          )
                        )
                  )
                }
                min="1"
                step="1"
                inputMode="numeric"
                placeholder="Qty"
                title="Jumlah roll dengan dimensi yang sama"
                className="w-12 px-1 py-1 h-[30px] text-sm text-center border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800 dark:text-slate-100"
                required
              />
              <span className="text-xs text-gray-500 dark:text-slate-400">roll</span>
              <span className="text-xs text-gray-500 dark:text-slate-400 ml-0.5">·</span>
              <input
                type="number"
                value={item.lebar ?? ""}
                onChange={(e) =>
                  onItemChange(
                    index,
                    "lebar",
                    e.target.value === ""
                      ? null
                      : parseFloat(e.target.value) || 0
                  )
                }
                min="0"
                max="999"
                step="any"
                inputMode="decimal"
                placeholder="L"
                title="Lebar roll (m)"
                className="w-14 px-1 py-1 h-[30px] text-sm text-center border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800 dark:text-slate-100"
                required
              />
              <span className="text-xs text-gray-500 dark:text-slate-400">×</span>
              <input
                type="number"
                value={item.panjang ?? ""}
                onChange={(e) =>
                  onItemChange(
                    index,
                    "panjang",
                    e.target.value === ""
                      ? null
                      : parseFloat(e.target.value) || 0
                  )
                }
                min="0"
                max="9999"
                step="any"
                inputMode="decimal"
                placeholder="P"
                title="Panjang per roll (m)"
                className="w-14 px-1 py-1 h-[30px] text-sm text-center border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800 dark:text-slate-100"
                required
              />
            </div>
            <p className="text-[11px] text-gray-500 dark:text-slate-400 text-center">
              {(item.jumlah_roll ?? 1) > 1 ? `${item.jumlah_roll} × ` : ""}
              L × P = {item.jumlah.toLocaleString("id-ID")} m²
            </p>
            {item.split_enabled && (item.split_batches?.length ?? 0) > 0 ? (
              (() => {
                const qty = Math.max(
                  1,
                  Math.round(Number(item.jumlah_roll) || 1)
                );
                const used = sumBatchRolls(item.split_batches);
                return (
                  <div className="flex items-center justify-center gap-1 text-[10px] text-purple-700 dark:text-purple-300">
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z"
                      />
                    </svg>
                    <span>
                      {used}/{qty} roll dipotong ·{" "}
                      {item.split_batches!.length} pola
                    </span>
                  </div>
                );
              })()
            ) : null}
          </div>
        ) : (
          <input
            type="number"
            value={item.jumlah}
            onChange={(e) =>
              onItemChange(
                index,
                "jumlah",
                parseFloat(e.target.value) || 0
              )
            }
            onKeyDown={(e) => {
              if (e.key !== "ArrowUp" && e.key !== "ArrowDown") {
                return;
              }
              e.preventDefault();
              const delta = e.key === "ArrowUp" ? 1 : -1;
              const next = Math.max(0, (item.jumlah || 0) + delta);
              onItemChange(index, "jumlah", next);
            }}
            min="0"
            step="any"
            inputMode="decimal"
            className="w-full px-2 py-1 h-[30px] text-sm text-center border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800 dark:text-slate-100"
            required
          />
        )}
      </td>
      <td className="px-3 py-2 align-top">
        <input
          type="number"
          value={item.harga_beli}
          onChange={(e) =>
            onItemChange(
              index,
              "harga_beli",
              parseFloat(e.target.value) || 0
            )
          }
          min="0"
          step="any"
          title={
            isDimensional
              ? "Harga per m²"
              : "Harga per satuan"
          }
          className="w-full px-2 py-1 h-[30px] text-sm text-right border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800 dark:text-slate-100"
          required
        />
        {isDimensional && (
          <p className="text-[11px] text-gray-500 dark:text-slate-400 text-right mt-0.5">
            per m²
          </p>
        )}
      </td>
      <td className="px-3 py-2 align-top text-right text-sm font-semibold text-gray-800 dark:text-slate-100 whitespace-nowrap">
        Rp {subtotal.toLocaleString("id-ID")}
      </td>
      <td className="px-3 py-2 align-top text-center">
        <div className="flex items-center justify-center gap-1">
          {isDimensional && (
            <button
              type="button"
              onClick={() => onOpenSplit(index)}
              disabled={
                !Number(item.lebar) ||
                !Number(item.panjang) ||
                !Number(item.jumlah_roll)
              }
              className={`p-2 rounded-lg transition-colors ${
                item.split_enabled &&
                (item.split_batches?.length ?? 0) > 0
                  ? "text-purple-600 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40 hover:bg-purple-100 dark:hover:bg-purple-900/40"
                  : "text-purple-600 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-white/10"
              } disabled:opacity-30 disabled:cursor-not-allowed`}
              title={
                !Number(item.lebar) || !Number(item.panjang)
                  ? "Isi lebar & panjang dulu"
                  : "Atur potongan roll"
              }
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z"
                />
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={onAddItem}
            className="p-2 text-indigo-600 dark:text-indigo-300 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-colors"
            title="Tambah Item (tekan +)"
          >
            <PlusIcon size={20} />
          </button>
          <button
            type="button"
            onClick={() => onRemoveItem(index)}
            disabled={isOnly}
            className={`p-2 rounded-lg transition-colors ${
              isOnly
                ? "text-gray-400 cursor-not-allowed"
                : "text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
            }`}
            title="Hapus Item (tekan -)"
          >
            <TrashIcon size={20} />
          </button>
        </div>
      </td>
    </tr>
  );
}
