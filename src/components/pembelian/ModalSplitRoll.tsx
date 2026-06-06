"use client";

import { useState } from "react";
import { TrashIcon } from "../icons/ContentIcons";
import { type SplitBatch, parseSplitTargets, sumBatchRolls } from "./split-utils";

// Modal pola-potong roll. Diekstrak dari FormulirPembelian (Fase 6 B4).
// Memegang draft pola-nya sendiri; induk hanya menerima hasil lewat onApply/onClear.

export interface ModalSplitRollProps {
  /** Nama barang untuk judul. */
  namaBarang?: string;
  /** Lebar roll (m) — total tiap pola harus sama dengan ini. */
  lebar: number;
  /** Panjang roll (m) untuk tampilan. */
  panjang: number;
  /** Jumlah roll fisik dengan dimensi sama. */
  jumlahRoll: number;
  /** Pola potongan yang sudah tersimpan (jadi draft awal). */
  initialBatches: SplitBatch[];
  onClose: () => void;
  /** Simpan pola valid ke item induk. */
  onApply: (batches: SplitBatch[]) => void;
  /** Hapus semua pola dari item induk. */
  onClear: () => void;
  showNotification: (type: "success" | "error", message: string) => void;
}

export default function ModalSplitRoll({
  namaBarang,
  lebar,
  panjang,
  jumlahRoll,
  initialBatches,
  onClose,
  onApply,
  onClear,
  showNotification,
}: ModalSplitRollProps) {
  const qty = Math.max(1, Math.round(Number(jumlahRoll) || 1));
  const [draft, setDraft] = useState<SplitBatch[]>(
    initialBatches.length > 0
      ? initialBatches.map((b) => ({ ...b }))
      : [{ count: qty, targets_text: "" }]
  );

  const usedRolls = sumBatchRolls(draft);
  const remaining = qty - usedRolls;

  const handleAddBatch = () => {
    const used = sumBatchRolls(draft);
    const rem = Math.max(1, qty - used);
    setDraft((prev) => [...prev, { count: rem, targets_text: "" }]);
  };

  const handleRemoveBatch = (batchIndex: number) => {
    setDraft((prev) => prev.filter((_, i) => i !== batchIndex));
  };

  const handleChange = (
    batchIndex: number,
    field: keyof SplitBatch,
    value: string
  ) => {
    setDraft((prev) => {
      const next = [...prev];
      const batch = { ...next[batchIndex] };
      if (field === "count") {
        batch.count = Math.max(0, Math.round(Number(value) || 0));
      } else {
        batch.targets_text = String(value);
      }
      next[batchIndex] = batch;
      return next;
    });
  };

  const handleSave = () => {
    const validBatches = draft
      .map((b) => ({
        count: Math.max(0, Math.round(Number(b.count) || 0)),
        targets: parseSplitTargets(b.targets_text),
        targets_text: b.targets_text,
      }))
      .filter((b) => b.count > 0 && b.targets.length > 0);

    for (const b of validBatches) {
      const sum = b.targets.reduce((acc, n) => acc + n, 0);
      if (Math.abs(sum - lebar) > 0.000001) {
        showNotification(
          "error",
          `Total lebar pola (${sum}m) harus sama dengan lebar roll (${lebar}m).`
        );
        return;
      }
    }
    const totalCount = validBatches.reduce((sum, b) => sum + b.count, 0);
    if (totalCount > qty) {
      showNotification(
        "error",
        `Total roll dipotong (${totalCount}) melebihi qty (${qty}).`
      );
      return;
    }

    onApply(validBatches.map((b) => ({ count: b.count, targets_text: b.targets_text })));
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-auto">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-purple-700 dark:text-purple-300">
              Atur Potongan Roll
            </h3>
            <p className="text-sm text-gray-600 dark:text-slate-300 mt-1">
              {namaBarang || "Item"} · {qty} roll @ {lebar}m × {panjang}m
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-white/10 rounded"
            title="Tutup"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-slate-400">
          Tiap pola = N roll dengan lebar potongan yang sama. Total lebar
          tiap pola harus sama dengan {lebar}m. Roll yang tidak masuk
          pola manapun akan dibiarkan utuh.
        </p>
        <div className="space-y-2">
          {draft.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-slate-400 italic text-center py-4">
              Belum ada pola. Klik &quot;Tambah pola&quot; di bawah.
            </p>
          ) : null}
          {draft.map((batch, bIdx) => {
            const targets = parseSplitTargets(batch.targets_text);
            const sum = targets.reduce((acc, n) => acc + n, 0);
            const valid =
              targets.length > 0 && Math.abs(sum - lebar) < 0.000001;
            return (
              <div
                key={bIdx}
                className="grid grid-cols-12 gap-2 items-start p-3 bg-purple-50/50 dark:bg-purple-950/20 rounded border border-purple-200 dark:border-purple-900/40"
              >
                <div className="col-span-2">
                  <label className="block text-[10px] text-gray-500 dark:text-slate-400 mb-0.5">
                    Roll
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={batch.count || ""}
                    onChange={(e) =>
                      handleChange(bIdx, "count", e.target.value)
                    }
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
                <div className="col-span-9">
                  <label className="block text-[10px] text-gray-500 dark:text-slate-400 mb-0.5">
                    Lebar potongan (dipisah koma)
                  </label>
                  <input
                    type="text"
                    value={batch.targets_text ?? ""}
                    onChange={(e) =>
                      handleChange(bIdx, "targets_text", e.target.value)
                    }
                    placeholder="contoh: 1.5, 1"
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <p
                    className={`text-[11px] mt-0.5 ${
                      valid
                        ? "text-emerald-600 dark:text-emerald-300"
                        : "text-amber-600 dark:text-amber-300"
                    }`}
                  >
                    {targets.length === 0
                      ? `Σ ? / ${lebar}m`
                      : `Σ ${sum}m / ${lebar}m`}
                  </p>
                </div>
                <div className="col-span-1 flex items-end justify-end h-full">
                  <button
                    type="button"
                    onClick={() => handleRemoveBatch(bIdx)}
                    className="mt-4 p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded"
                    title="Hapus pola"
                  >
                    <TrashIcon size={14} />
                  </button>
                </div>
              </div>
            );
          })}
          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-gray-600 dark:text-slate-400">
              {usedRolls} / {qty} roll dipotong
              {remaining > 0
                ? ` · ${remaining} dibiarkan utuh`
                : remaining < 0
                  ? ` · melebihi ${Math.abs(remaining)} roll!`
                  : ""}
            </span>
            {remaining > 0 ? (
              <button
                type="button"
                onClick={handleAddBatch}
                className="text-purple-600 dark:text-purple-300 font-medium hover:underline"
              >
                + Tambah pola
              </button>
            ) : null}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 pt-2 border-t dark:border-slate-700">
          <button
            type="button"
            onClick={onClear}
            className="px-4 py-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg text-sm font-medium"
          >
            Hapus semua pola
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium"
            >
              Simpan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
