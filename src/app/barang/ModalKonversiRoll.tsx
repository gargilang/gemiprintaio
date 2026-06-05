"use client";

import { useState, useEffect } from "react";
import {
  getRollVariantsAction,
  convertRollVariantAction,
} from "./actions";

export interface MaterialKonversi {
  id: string;
  nama: string;
}

interface RollVariant {
  id: string;
  lebar_m: number;
  panjang_tersedia_m: number;
}

interface Batch {
  count: number;
  targets_text: string;
  length_text: string;
}

interface Props {
  material: MaterialKonversi;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
  showNotification: (type: "success" | "error", message: string) => void;
}
// MARKER_BODY

function parseTargets(text: string): number[] {
  return text
    .split(/[,+\s]+/)
    .map((p) => Number(p.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/**
 * Modal "Konversi Roll" — memotong satu roll sumber menjadi beberapa roll
 * dengan lebar berbeda. Konversi netral terhadap nilai stok (avg cost diturunkan
 * ke roll baru). Diekstrak dari barang/page.tsx (U-I1); memuat data roll-nya
 * sendiri saat dibuka dan memegang state batch secara lokal.
 */
export default function ModalKonversiRoll({
  material,
  onClose,
  onSuccess,
  showNotification,
}: Props) {
  const [rolls, setRolls] = useState<RollVariant[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [batches, setBatches] = useState<Batch[]>([
    { count: 1, targets_text: "", length_text: "" },
  ]);
  const [saving, setSaving] = useState(false);

  // Muat varian roll milik material ini saat modal dibuka.
  useEffect(() => {
    let aktif = true;
    (async () => {
      try {
        const data = await getRollVariantsAction(material.id);
        if (!aktif) return;
        const list = (data || []) as RollVariant[];
        setRolls(list);
        setSourceId(list[0]?.id || "");
      } catch (error) {
        console.error("Error loading roll variants:", error);
        if (aktif) {
          showNotification("error", "Gagal memuat data roll");
          setRolls([]);
        }
      }
    })();
    return () => {
      aktif = false;
    };
  }, [material.id, showNotification]);

  const addBatch = () =>
    setBatches((prev) => [
      ...prev,
      { count: 1, targets_text: "", length_text: "" },
    ]);

  const removeBatch = (index: number) =>
    setBatches((prev) => prev.filter((_, i) => i !== index));

  const changeBatch = (
    index: number,
    field: "count" | "targets_text" | "length_text",
    value: string
  ) =>
    setBatches((prev) => {
      const next = [...prev];
      const batch = { ...next[index] };
      if (field === "count") {
        batch.count = Math.max(1, Math.round(Number(value) || 1));
      } else {
        (batch as Record<string, unknown>)[field] = String(value);
      }
      next[index] = batch;
      return next;
    });

  const submit = async () => {
    if (!sourceId) {
      showNotification("error", "Pilih roll sumber");
      return;
    }
    const sourceRoll = rolls.find((r) => r.id === sourceId);
    if (!sourceRoll) {
      showNotification("error", "Roll sumber tidak ditemukan");
      return;
    }
    const sourceWidth = Number(sourceRoll.lebar_m) || 0;
    const sourceAvailable = Number(sourceRoll.panjang_tersedia_m) || 0;

    const validBatches = batches
      .map((b) => ({
        count: Math.max(1, Math.round(Number(b.count) || 1)),
        targets: parseTargets(b.targets_text),
        length: Number(b.length_text) > 0 ? Number(b.length_text) : null,
      }))
      .filter((b) => b.targets.length > 0);

    if (validBatches.length === 0) {
      showNotification("error", "Tambahkan minimal 1 pola potongan");
      return;
    }

    let totalLength = 0;
    for (const b of validBatches) {
      const sum = b.targets.reduce((acc, n) => acc + n, 0);
      if (Math.abs(sum - sourceWidth) > 0.000001) {
        showNotification(
          "error",
          `Pola ${b.targets.join(",")} = ${sum}m harus = ${sourceWidth}m (lebar roll sumber)`
        );
        return;
      }
      const lengthPerRoll =
        b.length != null ? b.length : sourceAvailable / validBatches.length;
      totalLength += lengthPerRoll * b.count;
    }
    if (totalLength > sourceAvailable + 0.000001) {
      showNotification(
        "error",
        `Total panjang dipotong (${totalLength}m) melebihi sisa roll (${sourceAvailable}m)`
      );
      return;
    }

    setSaving(true);
    try {
      for (const b of validBatches) {
        const lengthPerRoll =
          b.length != null
            ? b.length
            : sourceAvailable / validBatches.length / b.count;
        await convertRollVariantAction({
          source_roll_variant_id: sourceId,
          target_widths_m: b.targets,
          length_m: lengthPerRoll * b.count,
          reason: `Konversi roll manual (${b.count} roll)`,
        });
      }
      await onSuccess();
      onClose();
      showNotification("success", "Konversi roll berhasil disimpan");
    } catch (error: any) {
      console.error("Error converting roll:", error);
      showNotification("error", error.message || "Gagal konversi roll");
    } finally {
      setSaving(false);
    }
  };

  const source = rolls.find((r) => r.id === sourceId);
  const sourceWidth = Number(source?.lebar_m) || 0;
  const sourceAvailable = Number(source?.panjang_tersedia_m) || 0;
  const totalLength = batches.reduce((acc, b) => {
    const len = Number(b.length_text) > 0 ? Number(b.length_text) : 0;
    return acc + len * Math.max(1, Math.round(Number(b.count) || 1));
  }, 0);

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
            <h3 className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
              Konversi Roll
            </h3>
            <p className="text-sm text-gray-600 dark:text-slate-300 mt-1">
              {material.nama}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-white/10 rounded"
            title="Tutup"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-slate-400">
          Setiap pola = N roll dengan lebar potongan yang sama. Total lebar di
          tiap pola harus sama dengan lebar roll sumber. Konversi netral terhadap
          nilai stok (avg cost diturunkan ke roll baru).
        </p>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
            Roll sumber
          </label>
          {rolls.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-slate-400 italic">
              Belum ada roll dengan stok aktif untuk barang ini.
            </p>
          ) : (
            <select
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="">Pilih roll</option>
              {rolls.map((roll) => (
                <option key={roll.id} value={roll.id}>
                  Lebar {Number(roll.lebar_m).toFixed(2)}m · sisa{" "}
                  {Number(roll.panjang_tersedia_m).toFixed(2)}m
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">
            Pola potongan
          </label>
          {batches.map((batch, idx) => {
            const targets = parseTargets(batch.targets_text);
            const sum = targets.reduce((acc, n) => acc + n, 0);
            const valid =
              sourceWidth > 0 &&
              targets.length > 0 &&
              Math.abs(sum - sourceWidth) < 0.000001;
            return (
              <div
                key={idx}
                className="grid grid-cols-12 gap-2 items-start p-2 bg-slate-50 dark:bg-slate-800/50 rounded border border-slate-200 dark:border-slate-700"
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
                    onChange={(e) => changeBatch(idx, "count", e.target.value)}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
                <div className="col-span-5">
                  <label className="block text-[10px] text-gray-500 dark:text-slate-400 mb-0.5">
                    Lebar potongan (m)
                  </label>
                  <input
                    type="text"
                    value={batch.targets_text}
                    onChange={(e) => changeBatch(idx, "targets_text", e.target.value)}
                    placeholder="contoh: 1.5, 1"
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded dark:bg-slate-900 dark:text-slate-100"
                  />
                  <p
                    className={`text-[10px] mt-0.5 ${
                      valid
                        ? "text-emerald-600 dark:text-emerald-300"
                        : "text-amber-600 dark:text-amber-300"
                    }`}
                  >
                    {sourceWidth === 0
                      ? "Pilih roll sumber dulu"
                      : targets.length === 0
                        ? `Σ ? / ${sourceWidth}m`
                        : `Σ ${sum}m / ${sourceWidth}m`}
                  </p>
                </div>
                <div className="col-span-4">
                  <label className="block text-[10px] text-gray-500 dark:text-slate-400 mb-0.5">
                    Panjang (m, per roll)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={batch.length_text}
                    onChange={(e) => changeBatch(idx, "length_text", e.target.value)}
                    placeholder={sourceAvailable ? `Maks ${sourceAvailable}m` : "Auto"}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
                <div className="col-span-1 flex items-end justify-end h-full">
                  <button
                    type="button"
                    onClick={() => removeBatch(idx)}
                    disabled={batches.length === 1}
                    className="mt-4 p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Hapus pola"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500 dark:text-slate-400">
              {sourceAvailable
                ? `Total dipakai ${totalLength}m / sisa ${sourceAvailable}m${
                    totalLength > sourceAvailable ? " — melebihi!" : ""
                  }`
                : ""}
            </span>
            <button
              type="button"
              onClick={addBatch}
              className="text-emerald-600 dark:text-emerald-300 font-medium hover:underline"
            >
              + Tambah pola
            </button>
          </div>
          <p className="text-[10px] text-gray-500 dark:text-slate-400">
            Panjang kosong = otomatis dibagi rata sisa roll antar pola.
          </p>
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-slate-300 hover:bg-gray-200 rounded-lg"
          >
            Batal
          </button>
          <button
            onClick={submit}
            disabled={saving || rolls.length === 0}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? "Menyimpan..." : "Simpan Konversi"}
          </button>
        </div>
      </div>
    </div>
  );
}

