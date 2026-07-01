"use client";

import { useState } from "react";

/**
 * Form input roll-aware: pilih lebar variant + masukkan panjang meter.
 * Dipakai di form penyesuaian, waste, dan opname untuk barang dimensi.
 */

export interface RollInputVal {
  roll_variant_id: string;
  lebar_m: number;
  /** Panjang meter: positif = tambah, negatif = kurangi (adjustment).
   *  Untuk waste, selalu positif — service yang membalik ke negatif. */
  panjang_m: number;
  /** Dikomputasi: panjang_m × lebar_m (bisa negatif untuk adjustment). */
  qty_m2: number;
}

export interface RollVariantOption {
  id: string;
  lebar_m: number;
  panjang_tersedia_m: number;
}

interface InputDimensiRollProps {
  variants: RollVariantOption[];
  onChange: (val: RollInputVal | null) => void;
  disabled?: boolean;
  /** "waste" → panjang harus positif; "adjustment" → boleh positif atau negatif. */
  mode: "adjustment" | "waste";
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

export default function InputDimensiRoll({
  variants,
  onChange,
  disabled,
  mode,
}: InputDimensiRollProps) {
  const [variantId, setVariantId] = useState(variants[0]?.id ?? "");
  const [panjangStr, setPanjangStr] = useState("");

  function getVariant(id: string): RollVariantOption | null {
    return variants.find((v) => v.id === id) ?? null;
  }

  function buildVal(id: string, str: string): RollInputVal | null {
    const variant = getVariant(id);
    if (!variant) return null;
    const panjang = Number(str);
    if (!Number.isFinite(panjang) || panjang === 0) return null;
    if (mode === "waste" && panjang < 0) return null;
    const lebar = Number(variant.lebar_m);
    return {
      roll_variant_id: variant.id,
      lebar_m: lebar,
      panjang_m: panjang,
      qty_m2: panjang * lebar,
    };
  }

  function handleVariantChange(id: string) {
    setVariantId(id);
    setPanjangStr("");
    onChange(null);
  }

  function handlePanjangChange(str: string) {
    setPanjangStr(str);
    onChange(buildVal(variantId, str));
  }

  const selectedVariant = getVariant(variantId);
  const panjang = Number(panjangStr);
  const qtyM2 = selectedVariant && panjangStr ? panjang * Number(selectedVariant.lebar_m) : 0;

  const errorMsg = (() => {
    if (!panjangStr) return null;
    if (!Number.isFinite(panjang) || panjang === 0) {
      return mode === "waste"
        ? "Panjang harus lebih dari 0"
        : "Panjang tidak boleh 0";
    }
    if (mode === "waste" && panjang < 0) return "Untuk waste, masukkan angka positif";
    if (
      mode === "waste" &&
      selectedVariant &&
      panjang > Number(selectedVariant.panjang_tersedia_m) + 0.001
    ) {
      return `Melebihi stok tersedia (${fmt(Number(selectedVariant.panjang_tersedia_m))} m)`;
    }
    return null;
  })();

  if (variants.length === 0) {
    return (
      <p className="text-sm text-amber-600 dark:text-amber-400">
        Belum ada varian roll aktif untuk barang ini.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
          Lebar roll
        </label>
        <select
          className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-2 text-sm"
          value={variantId}
          onChange={(e) => handleVariantChange(e.target.value)}
          disabled={disabled}
        >
          {variants.map((v) => (
            <option key={v.id} value={v.id}>
              {fmt(Number(v.lebar_m))} m (tersedia: {fmt(Number(v.panjang_tersedia_m))} m)
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
          Panjang (meter)
          {mode === "adjustment" && (
            <span className="ml-1 text-slate-400 dark:text-slate-500">
              (positif = tambah, negatif = kurangi)
            </span>
          )}
        </label>
        <input
          type="number"
          step="0.01"
          value={panjangStr}
          onChange={(e) => handlePanjangChange(e.target.value)}
          disabled={disabled}
          className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 p-2 text-sm"
          placeholder={mode === "waste" ? "Contoh: 10" : "Contoh: 10 atau -5"}
        />
        {errorMsg && (
          <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">{errorMsg}</p>
        )}
        {!errorMsg && panjangStr && qtyM2 !== 0 && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
            = {Math.abs(qtyM2).toFixed(2)} m²
            {qtyM2 < 0 ? " (pengurangan)" : " (penambahan)"}
          </p>
        )}
      </div>
    </div>
  );
}
