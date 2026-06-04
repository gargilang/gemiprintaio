"use client";

"use client";

import { useState, useEffect } from "react";
import { useCachedData } from "@/lib/use-cached-data";
import { useSearchParams } from "next/navigation";
import { BoxIcon } from "@/components/icons/ContentIcons";
import { HashIcon, PriceTagIcon, SparklesIcon } from "@/components/icons/PageIcons";
import ToastNotifikasi, {
  NotificationToastProps,
} from "@/components/ToastNotifikasi";
import ModalFormShell from "@/components/ModalFormShell";
import DialogKonfirmasi from "@/components/DialogKonfirmasi";
import PpnTab from "./PpnTab";
import PeriodCloseTab from "./PeriodCloseTab";
import NomorUrutTab from "./NomorUrutTab";
import {
  getCategoriesAction as getCategories,
  createCategoryAction as createCategory,
  updateCategoryAction as updateCategory,
  deleteCategoryAction as deleteCategory,
  getSubcategoriesAction as getSubcategories,
  createSubcategoryAction as createSubcategory,
  updateSubcategoryAction as updateSubcategory,
  deleteSubcategoryAction as deleteSubcategory,
  getUnitsAction as getUnits,
  createUnitAction as createUnit,
  updateUnitAction as updateUnit,
  deleteUnitAction as deleteUnit,
  getQuickSpecsAction as getQuickSpecs,
  createQuickSpecAction as createQuickSpec,
  updateQuickSpecAction as updateQuickSpec,
  deleteQuickSpecAction as deleteQuickSpec,
  getFinishingOptionsAction as getFinishingOptions,
  createFinishingOptionAction as createFinishingOption,
  updateFinishingOptionAction as updateFinishingOption,
  deleteFinishingOptionAction as deleteFinishingOption,
  reorderCategoriesAction as reorderCategories,
  reorderSubcategoriesAction as reorderSubcategories,
  reorderUnitsAction as reorderUnits,
  reorderQuickSpecsAction as reorderQuickSpecs,
  getFinishingOptionsAction as getFinishingOptionsList,
  createFinishingOptionAction as createFinishingOpt,
  updateFinishingOptionAction as updateFinishingOpt,
  deleteFinishingOptionAction as deleteFinishingOpt,
  reorderFinishingOptionsAction as reorderFinishingOptions,
  getSyncStatusAction as getSyncStatus,
  getShopSettingsAction,
  updateShopSettingsAction,
} from "./actions";
import {
  getAutoSyncIntervalMinutes,
  getClientSyncStatus,
  runPullOnlyCycle,
  runSyncCycle,
  setAutoSyncIntervalMinutes,
} from "@/lib/sync-client";
import { isTauriApp } from "@/lib/client-utils";
import { useTheme } from "@/components/ThemeProvider";
import type { Theme } from "@/lib/theme";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { PengaturanToko } from "@/types/database";


type PricingBasis = "markup" | "margin";
type CustomerLevel = "umum" | "member" | "reseller" | "corporate";

interface PricingSettings {
  basis: PricingBasis;
  defaultMarkupPercent: number;
  targetMarginPercent: number;
  minimumMarginPercent: number;
  minimumCharge: number;
  roundingStep: number;
  rollWastePercent: number;
  minimumRollArea: number;
  memberDiscountPercent: number;
  resellerDiscountPercent: number;
  corporateDiscountPercent: number;
  requireOverrideReason: boolean;
}

const PRICING_SETTINGS_KEY = "settings.pricing.automation";

const defaultPricingSettings: PricingSettings = {
  basis: "markup",
  defaultMarkupPercent: 35,
  targetMarginPercent: 30,
  minimumMarginPercent: 18,
  minimumCharge: 15000,
  roundingStep: 500,
  rollWastePercent: 8,
  minimumRollArea: 0.25,
  memberDiscountPercent: 3,
  resellerDiscountPercent: 8,
  corporateDiscountPercent: 5,
  requireOverrideReason: true,
};

function toNumber(value: string, fallback = 0) {
  const normalized = value.replace(/[^\d.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundUp(value: number, step: number) {
  if (step <= 0) return Math.round(value);
  return Math.ceil(value / step) * step;
}

function formatRupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function PricingTab() {
  const [settings, setSettings] = useState<PricingSettings>(() => {
    try {
      if (typeof window === "undefined") return defaultPricingSettings;
      const stored = localStorage.getItem(PRICING_SETTINGS_KEY);
      return stored
        ? { ...defaultPricingSettings, ...JSON.parse(stored) }
        : defaultPricingSettings;
    } catch {
      return defaultPricingSettings;
    }
  });
  const [notice, setNotice] = useState<NotificationToastProps | null>(null);
  const [simulator, setSimulator] = useState({
    hpp: 10000,
    qty: 1,
    area: 1,
    finishing: 0,
    customerLevel: "umum" as CustomerLevel,
  });

  const updateSetting = (
    field: keyof PricingSettings,
    value: number | boolean | PricingBasis
  ) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const saveSettings = () => {
    localStorage.setItem(PRICING_SETTINGS_KEY, JSON.stringify(settings));
    setNotice({
      type: "success",
      message: "Aturan pricing otomatis berhasil disimpan",
    });
    setTimeout(() => setNotice(null), 3000);
  };

  const resetSettings = () => {
    setSettings(defaultPricingSettings);
    localStorage.setItem(
      PRICING_SETTINGS_KEY,
      JSON.stringify(defaultPricingSettings)
    );
    setNotice({ type: "success", message: "Aturan pricing dikembalikan" });
    setTimeout(() => setNotice(null), 3000);
  };

  const discountPercent =
    simulator.customerLevel === "member"
      ? settings.memberDiscountPercent
      : simulator.customerLevel === "reseller"
      ? settings.resellerDiscountPercent
      : simulator.customerLevel === "corporate"
      ? settings.corporateDiscountPercent
      : 0;

  const billableArea = Math.max(
    simulator.area * (1 + settings.rollWastePercent / 100),
    settings.minimumRollArea
  );
  const baseCost = simulator.hpp * simulator.qty * billableArea;
  const priceBeforeDiscount =
    settings.basis === "margin"
      ? baseCost / Math.max(0.01, 1 - settings.targetMarginPercent / 100)
      : baseCost * (1 + settings.defaultMarkupPercent / 100);
  const priceAfterDiscount = priceBeforeDiscount * (1 - discountPercent / 100);
  const withFinishing = priceAfterDiscount + simulator.finishing;
  const guardedPrice = Math.max(withFinishing, settings.minimumCharge);
  const suggestedPrice = roundUp(guardedPrice, settings.roundingStep);
  const grossMargin =
    suggestedPrice > 0 ? ((suggestedPrice - baseCost) / suggestedPrice) * 100 : 0;
  const belowGuard = grossMargin < settings.minimumMarginPercent;

  return (
    <div className="space-y-6">
      {notice && (
        <ToastNotifikasi type={notice.type} message={notice.message} />
      )}

      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-gradient-to-br from-gray-500 to-gray-600 rounded-xl">
          <svg
            className="w-8 h-8 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-slate-100">
            Aturan Harga Otomatis
          </h2>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Acuan markup, margin, minimum charge, dan simulasi harga jual
          </p>
        </div>
      </div>

      <div className="bg-blue-50 dark:bg-slate-800 rounded-xl p-5 border-2 border-blue-200 dark:border-slate-700">
        <p className="text-sm text-blue-900 dark:text-slate-200">
          Setting ini tidak menimpa harga jual di data barang. Gunakan sebagai
          default otomatis, rekomendasi kasir, dan peringatan saat harga manual
          terlalu dekat dengan HPP.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 space-y-5">
          <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-5 border-2 border-gray-200 dark:border-slate-700">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="font-bold text-gray-800 dark:text-slate-100">
                  Policy Harga Dasar
                </h3>
                <p className="text-sm text-gray-500 dark:text-slate-400">
                  Pilih cara sistem menyarankan harga dari HPP.
                </p>
              </div>
              <div className="flex bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg p-1">
                {(["markup", "margin"] as PricingBasis[]).map((basis) => (
                  <button
                    key={basis}
                    type="button"
                    onClick={() => updateSetting("basis", basis)}
                    className={`px-4 py-2 rounded-md text-sm font-semibold ${
                      settings.basis === basis
                        ? "bg-blue-50 dark:bg-slate-8000 text-white"
                        : "text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800"
                    }`}
                  >
                    {basis === "markup" ? "Markup" : "Margin"}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <NumberSetting label="Markup Default" suffix="%" value={settings.defaultMarkupPercent} onChange={(value) => updateSetting("defaultMarkupPercent", value)} />
              <NumberSetting label="Target Margin" suffix="%" value={settings.targetMarginPercent} onChange={(value) => updateSetting("targetMarginPercent", value)} />
              <NumberSetting label="Margin Minimum" suffix="%" value={settings.minimumMarginPercent} onChange={(value) => updateSetting("minimumMarginPercent", value)} />
              <NumberSetting label="Minimum Charge" prefix="Rp" value={settings.minimumCharge} onChange={(value) => updateSetting("minimumCharge", value)} />
              <NumberSetting label="Pembulatan" prefix="Rp" value={settings.roundingStep} onChange={(value) => updateSetting("roundingStep", value)} />
              <label className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
                <input
                  type="checkbox"
                  checked={settings.requireOverrideReason}
                  onChange={(event) =>
                    updateSetting("requireOverrideReason", event.target.checked)
                  }
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 dark:text-blue-300"
                />
                <span className="text-sm font-semibold text-gray-700 dark:text-slate-200">
                  Wajib alasan saat override harga
                </span>
              </label>
            </div>
          </div>

          <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-5 border-2 border-gray-200 dark:border-slate-700">
            <h3 className="font-bold text-gray-800 dark:text-slate-100 mb-4">
              Level Harga Pelanggan
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <NumberSetting label="Diskon Member" suffix="%" value={settings.memberDiscountPercent} onChange={(value) => updateSetting("memberDiscountPercent", value)} />
              <NumberSetting label="Diskon Reseller" suffix="%" value={settings.resellerDiscountPercent} onChange={(value) => updateSetting("resellerDiscountPercent", value)} />
              <NumberSetting label="Diskon Corporate" suffix="%" value={settings.corporateDiscountPercent} onChange={(value) => updateSetting("corporateDiscountPercent", value)} />
            </div>
          </div>

          <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-5 border-2 border-gray-200 dark:border-slate-700">
            <h3 className="font-bold text-gray-800 dark:text-slate-100 mb-4">
              Aturan Roll / Area
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <NumberSetting label="Waste Produksi" suffix="%" value={settings.rollWastePercent} onChange={(value) => updateSetting("rollWastePercent", value)} />
              <NumberSetting label="Minimum Area Tagih" suffix="m2" value={settings.minimumRollArea} step="0.01" onChange={(value) => updateSetting("minimumRollArea", value)} />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl p-5 border-2 border-blue-200 dark:border-slate-700 shadow-sm h-fit">
          <h3 className="font-bold text-gray-800 dark:text-slate-100 mb-1">
            Simulasi Harga
          </h3>
          <p className="text-sm text-gray-500 dark:text-slate-400 mb-4">
            Cek dampak policy sebelum dipakai di transaksi.
          </p>

          <div className="space-y-3">
            <NumberSetting label="HPP per m2 / unit" prefix="Rp" value={simulator.hpp} onChange={(value) => setSimulator((prev) => ({ ...prev, hpp: value }))} />
            <NumberSetting label="Qty" value={simulator.qty} onChange={(value) => setSimulator((prev) => ({ ...prev, qty: value }))} />
            <NumberSetting label="Area" suffix="m2" value={simulator.area} step="0.01" onChange={(value) => setSimulator((prev) => ({ ...prev, area: value }))} />
            <NumberSetting label="Biaya Finishing" prefix="Rp" value={simulator.finishing} onChange={(value) => setSimulator((prev) => ({ ...prev, finishing: value }))} />
            <label className="block">
              <span className="block text-sm font-semibold text-gray-700 dark:text-slate-200 mb-1">
                Level Pelanggan
              </span>
              <select
                value={simulator.customerLevel}
                onChange={(event) =>
                  setSimulator((prev) => ({
                    ...prev,
                    customerLevel: event.target.value as CustomerLevel,
                  }))
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-gray-800 dark:text-slate-100"
              >
                <option value="umum">Umum</option>
                <option value="member">Member</option>
                <option value="reseller">Reseller</option>
                <option value="corporate">Corporate</option>
              </select>
            </label>
          </div>

          <div className="mt-5 rounded-xl bg-blue-50 dark:bg-slate-800 border border-blue-200 dark:border-slate-700 p-4 space-y-2">
            <PriceRow label="HPP terhitung" value={formatRupiah(baseCost)} />
            <PriceRow label="Area tagih" value={`${billableArea.toFixed(2)} m2`} />
            <PriceRow label="Diskon level" value={`${discountPercent}%`} />
            <PriceRow label="Margin estimasi" value={`${grossMargin.toFixed(1)}%`} danger={belowGuard} />
            <div className="pt-3 border-t border-blue-200 dark:border-slate-700">
              <p className="text-sm text-gray-500 dark:text-slate-400">
                Rekomendasi Harga Jual
              </p>
              <p className="text-3xl font-bold text-blue-700 dark:text-blue-300">
                {formatRupiah(suggestedPrice)}
              </p>
              {belowGuard && (
                <p className="text-xs text-red-600 dark:text-red-300 mt-2">
                  Margin di bawah batas minimum. Perlu approval atau ubah harga.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={resetSettings}
          className="px-4 py-2 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 text-gray-700 dark:text-slate-200 rounded-lg font-semibold hover:bg-gray-50 dark:hover:bg-slate-800"
        >
          Kembali ke Bawaan
        </button>
        <button
          type="button"
          onClick={saveSettings}
          className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold"
        >
          Simpan Aturan Harga
        </button>
      </div>
    </div>
  );
}

function NumberSetting({
  label,
  value,
  onChange,
  prefix,
  suffix,
  step = "1",
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  prefix?: string;
  suffix?: string;
  step?: string;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-gray-700 dark:text-slate-200 mb-1">
        {label}
      </span>
      <div className="flex items-center rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-950 overflow-hidden">
        {prefix && (
          <span className="px-3 text-sm text-gray-500 dark:text-slate-400">
            {prefix}
          </span>
        )}
        <input
          type="number"
          step={step}
          value={value}
          onChange={(event) => onChange(toNumber(event.target.value, value))}
          className="min-w-0 flex-1 px-3 py-2 bg-transparent text-gray-800 dark:text-slate-100 outline-none"
        />
        {suffix && (
          <span className="px-3 text-sm text-gray-500 dark:text-slate-400">
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
}

function PriceRow({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-gray-600 dark:text-slate-400">{label}</span>
      <span
        className={`font-semibold ${
          danger
            ? "text-red-600 dark:text-red-300"
            : "text-gray-800 dark:text-slate-100"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/*
export function LegacyPricingTab() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-gradient-to-br from-gray-500 to-gray-600 rounded-xl">
          <svg
            className="w-8 h-8 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-slate-100">Pengaturan Harga</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400">Pengaturan harga dan pajak</p>
        </div>
      </div>

      <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-6 border-2 border-gray-200 dark:border-slate-800">
        <p className="text-gray-600 dark:text-slate-300 flex items-start gap-2">
          <svg
            className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>Section ini akan berisi pengaturan:</span>
        </p>
        <ul className="mt-4 space-y-2 text-gray-600 dark:text-slate-300 ml-6">
          <li>• Markup/Margin Default (%)</li>
          <li>• Diskon Member (%)</li>
          <li>• Tarif Pajak / PPN (%)</li>
          <li>• Format Mata Uang</li>
        </ul>
      </div>
    </div>
  );
}

*/
function RollSizesTab() {
  const [rollSizes, setRollSizes] = useState<number[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newSize, setNewSize] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [notice, setNotice] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    // Load from localStorage or use defaults
    const stored = localStorage.getItem("rollSizes");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setRollSizes(parsed);
      } catch {
        const defaults = [0.5, 1, 1.5, 2, 2.5, 3];
        setRollSizes(defaults);
        localStorage.setItem("rollSizes", JSON.stringify(defaults));
      }
    } else {
      const defaults = [0.5, 1, 1.5, 2, 2.5, 3];
      setRollSizes(defaults);
      localStorage.setItem("rollSizes", JSON.stringify(defaults));
    }
  }, []);

  const showMsg = (type: "success" | "error", message: string) => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 3000);
  };

  const saveToLocalStorage = (sizes: number[]) => {
    const sorted = [...sizes].sort((a, b) => a - b);
    localStorage.setItem("rollSizes", JSON.stringify(sorted));
    setRollSizes(sorted);
  };

  const handleAdd = () => {
    const size = parseFloat(newSize);
    if (isNaN(size) || size <= 0) {
      showMsg("error", "Ukuran harus berupa angka positif");
      return;
    }
    if (rollSizes.includes(size)) {
      showMsg("error", "Ukuran sudah ada");
      return;
    }
    saveToLocalStorage([...rollSizes, size]);
    showMsg("success", "Roll size berhasil ditambahkan");
    setNewSize("");
    setIsAdding(false);
  };

  const handleUpdate = (index: number) => {
    const size = parseFloat(editingValue);
    if (isNaN(size) || size <= 0) {
      showMsg("error", "Ukuran harus berupa angka positif");
      return;
    }
    if (rollSizes.some((s, i) => i !== index && s === size)) {
      showMsg("error", "Ukuran sudah ada");
      return;
    }
    const newSizes = [...rollSizes];
    newSizes[index] = size;
    saveToLocalStorage(newSizes);
    showMsg("success", "Roll size berhasil diperbarui");
    setEditingIndex(null);
    setEditingValue("");
  };

  const handleDelete = (index: number, size: number) => {
    if (!confirm(`Hapus roll size ${size}m?`)) return;
    const newSizes = rollSizes.filter((_, i) => i !== index);
    saveToLocalStorage(newSizes);
    showMsg("success", "Roll size berhasil dihapus");
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newSizes = [...rollSizes];
    [newSizes[index - 1], newSizes[index]] = [
      newSizes[index],
      newSizes[index - 1],
    ];
    saveToLocalStorage(newSizes);
  };

  const handleMoveDown = (index: number) => {
    if (index === rollSizes.length - 1) return;
    const newSizes = [...rollSizes];
    [newSizes[index], newSizes[index + 1]] = [
      newSizes[index + 1],
      newSizes[index],
    ];
    saveToLocalStorage(newSizes);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-800 dark:text-slate-100">Ukuran Roll</h2>
            <p className="text-sm text-gray-500 dark:text-slate-400">
              Kelola ukuran roll untuk rounding kalkulasi POS
            </p>
          </div>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          disabled={isAdding}
          className="px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl font-semibold hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2"
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
              d="M12 4v16m8-8H4"
            />
          </svg>
          Tambah Ukuran Roll
        </button>
      </div>

      {/* Notice */}
      {notice && (
        <div
          className={`p-4 rounded-xl border-2 ${
            notice.type === "success"
              ? "bg-green-50 dark:bg-green-950/40 border-green-300 dark:border-green-800/50 text-green-800 dark:text-green-200"
              : "bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800/50 text-red-800 dark:text-red-200"
          }`}
        >
          {notice.message}
        </div>
      )}

      {/* Add New Form */}
      {isAdding && (
        <div className="bg-blue-50 dark:bg-slate-800 border-2 border-blue-300 dark:border-slate-700 rounded-xl p-4">
          <div className="flex gap-3">
            <input
              type="number"
              step="0.1"
              value={newSize}
              onChange={(e) => setNewSize(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAdd();
                } else if (e.key === "Escape") {
                  setIsAdding(false);
                  setNewSize("");
                }
              }}
              placeholder="Ukuran roll (meter)..."
              className="flex-1 px-4 py-2 border-2 border-blue-300 rounded-lg focus:outline-none focus:border-blue-600 dark:bg-slate-800 dark:text-slate-100"
              autoFocus
            />
            <button
              onClick={handleAdd}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
            >
              Simpan
            </button>
            <button
              onClick={() => {
                setIsAdding(false);
                setNewSize("");
              }}
              className="px-4 py-2 bg-gray-200 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-300 font-semibold"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {/* Roll Sizes List */}
      <div className="space-y-2">
        {rollSizes.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-slate-400 bg-gray-50 dark:bg-slate-800 rounded-xl">
            Belum ada roll size
          </div>
        ) : (
          rollSizes.map((size, index) => (
            <div
              key={index}
              className="bg-white dark:bg-slate-900 border-2 border-gray-200 dark:border-slate-800 rounded-xl p-4 hover:border-blue-400 transition-all"
            >
              <div className="flex items-center gap-3">
                {/* Reorder buttons */}
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0}
                    className="p-1 text-gray-400 hover:text-blue-600 dark:text-blue-300 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 15l7-7 7 7"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleMoveDown(index)}
                    disabled={index === rollSizes.length - 1}
                    className="p-1 text-gray-400 hover:text-blue-600 dark:text-blue-300 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>
                </div>

                {/* Size value */}
                {editingIndex === index ? (
                  <input
                    type="number"
                    step="0.1"
                    value={editingValue}
                    onChange={(e) => setEditingValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleUpdate(index);
                      } else if (e.key === "Escape") {
                        setEditingIndex(null);
                        setEditingValue("");
                      }
                    }}
                    className="flex-1 px-3 py-2 border-2 border-blue-300 rounded-lg focus:outline-none focus:border-blue-600 dark:bg-slate-800 dark:text-slate-100"
                    autoFocus
                  />
                ) : (
                  <div className="flex-1 font-semibold text-gray-800 dark:text-slate-100">
                    {size} meter
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2">
                  {editingIndex === index ? (
                    <>
                      <button
                        onClick={() => handleUpdate(index)}
                        className="px-3 py-1 bg-green-50 dark:bg-slate-8000 text-white rounded-lg hover:bg-green-600 text-sm font-semibold"
                      >
                        Simpan
                      </button>
                      <button
                        onClick={() => {
                          setEditingIndex(null);
                          setEditingValue("");
                        }}
                        className="px-3 py-1 bg-gray-200 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-300 text-sm font-semibold"
                      >
                        Batal
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setEditingIndex(index);
                          setEditingValue(size.toString());
                        }}
                        className="p-2 text-blue-600 dark:text-blue-300 hover:bg-slate-100 dark:hover:bg-white/10 dark:bg-slate-800 rounded-lg"
                        title="Edit"
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
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(index, size)}
                        className="p-2 text-red-600 hover:bg-red-50 dark:bg-red-950/40 rounded-lg"
                        title="Hapus"
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
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function FinishingOptionsTab() {
  interface FinishingOption {
    id: string;
    nama: string;
    urutan_tampilan: number;
    aktif_status: number;
  }

  const [options, setOptions] = useState<FinishingOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingNama, setEditingNama] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [newOptionName, setNewOptionName] = useState("");
  const [notice, setNotice] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    loadOptions();
  }, []);

  const loadOptions = async () => {
    try {
      const data = await getFinishingOptionsList();
      setOptions(data as any);
    } catch (error) {
      console.error("Error loading finishing options:", error);
    } finally {
      setLoading(false);
    }
  };

  const showMsg = (type: "success" | "error", message: string) => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 3000);
  };

  const handleAdd = async () => {
    if (!newOptionName.trim()) return;

    try {
      await createFinishingOpt({ nama: newOptionName.trim() });
      showMsg("success", "Opsi finishing berhasil ditambahkan");
      setNewOptionName("");
      setIsAdding(false);
      loadOptions();
    } catch (error: any) {
      showMsg("error", error.message || "Gagal menambahkan opsi");
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editingNama.trim()) return;

    try {
      await updateFinishingOpt(id, { nama: editingNama.trim() });
      showMsg("success", "Opsi finishing berhasil diperbarui");
      setEditingId(null);
      setEditingNama("");
      loadOptions();
    } catch (error: any) {
      showMsg("error", error.message || "Gagal memperbarui opsi");
    }
  };

  const handleDelete = async (id: string, nama: string) => {
    if (!confirm(`Hapus opsi finishing "${nama}"?`)) return;

    try {
      await deleteFinishingOpt(id);
      showMsg("success", "Opsi finishing berhasil dihapus");
      loadOptions();
    } catch (error: any) {
      showMsg("error", error.message || "Gagal menghapus opsi");
    }
  };

  const handleMoveUp = async (index: number) => {
    if (index === 0) return;
    const newOptions = [...options];
    [newOptions[index - 1], newOptions[index]] = [
      newOptions[index],
      newOptions[index - 1],
    ];
    await updateOrder(newOptions);
  };

  const handleMoveDown = async (index: number) => {
    if (index === options.length - 1) return;
    const newOptions = [...options];
    [newOptions[index], newOptions[index + 1]] = [
      newOptions[index + 1],
      newOptions[index],
    ];
    await updateOrder(newOptions);
  };

  const updateOrder = async (newOptions: FinishingOption[]) => {
    try {
      const updates = newOptions.map((opt, index) => ({
        id: opt.id,
        urutan_tampilan: index,
      }));

      await reorderFinishingOptions(updates);
      setOptions(newOptions);
      showMsg("success", "Urutan berhasil diperbarui");
    } catch (error) {
      showMsg("error", "Gagal memperbarui urutan");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-amber-700 to-amber-900 rounded-xl">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-800 dark:text-slate-100">Opsi Finishing</h2>
            <p className="text-sm text-gray-500 dark:text-slate-400">
              Kelola pilihan finishing untuk produksi
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsAdding(true)}
          className="px-4 py-2 bg-gradient-to-r from-amber-700 to-amber-900 text-white rounded-lg hover:shadow-lg transition-all font-semibold flex items-center gap-2"
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
              d="M12 4v16m8-8H4"
            />
          </svg>
          Tambah Opsi
        </button>
      </div>

      {/* Add New Form */}
      {isAdding && (
        <div className="bg-amber-50 dark:bg-slate-800 border-2 border-amber-300 dark:border-amber-800/50 rounded-xl p-4">
          <div className="flex gap-3">
            <input
              type="text"
              value={newOptionName}
              onChange={(e) => setNewOptionName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAdd();
                } else if (e.key === "Escape") {
                  setIsAdding(false);
                  setNewOptionName("");
                }
              }}
              placeholder="Nama opsi finishing..."
              className="flex-1 px-4 py-2 border-2 border-amber-300 dark:border-amber-800/50 rounded-lg focus:outline-none focus:border-amber-700 dark:bg-slate-800 dark:text-slate-100"
              autoFocus
            />
            <button
              onClick={handleAdd}
              className="px-4 py-2 bg-amber-800 text-white rounded-lg hover:bg-amber-900 font-semibold"
            >
              Simpan
            </button>
            <button
              onClick={() => {
                setIsAdding(false);
                setNewOptionName("");
              }}
              className="px-4 py-2 bg-gray-200 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-300 font-semibold"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {/* Options List */}
      <div className="space-y-2">
        {loading ? (
          <div className="text-center py-8 text-gray-500 dark:text-slate-400">Memuat...</div>
        ) : options.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-slate-400 bg-gray-50 dark:bg-slate-800 rounded-xl">
            Belum ada opsi finishing
          </div>
        ) : (
          options.map((option, index) => (
            <div
              key={option.id}
              className="bg-white dark:bg-slate-900 border-2 border-gray-200 dark:border-slate-800 rounded-xl p-4 hover:border-amber-400 transition-all"
            >
              <div className="flex items-center gap-3">
                {/* Reorder buttons */}
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0}
                    className="p-1 text-gray-400 hover:text-amber-700 dark:text-amber-300 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 15l7-7 7 7"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleMoveDown(index)}
                    disabled={index === options.length - 1}
                    className="p-1 text-gray-400 hover:text-amber-700 dark:text-amber-300 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>
                </div>

                {/* Option name */}
                {editingId === option.id ? (
                  <input
                    type="text"
                    value={editingNama}
                    onChange={(e) => setEditingNama(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleUpdate(option.id);
                      } else if (e.key === "Escape") {
                        setEditingId(null);
                        setEditingNama("");
                      }
                    }}
                    className="flex-1 px-3 py-2 border-2 border-amber-300 dark:border-amber-800/50 rounded-lg focus:outline-none focus:border-amber-700 dark:bg-slate-800 dark:text-slate-100"
                    autoFocus
                  />
                ) : (
                  <div className="flex-1 font-semibold text-gray-800 dark:text-slate-100">
                    {option.nama}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2">
                  {editingId === option.id ? (
                    <>
                      <button
                        onClick={() => handleUpdate(option.id)}
                        className="px-3 py-1 bg-green-50 dark:bg-slate-8000 text-white rounded-lg hover:bg-green-600 text-sm font-semibold"
                      >
                        Simpan
                      </button>
                      <button
                        onClick={() => {
                          setEditingId(null);
                          setEditingNama("");
                        }}
                        className="px-3 py-1 bg-gray-200 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-300 text-sm font-semibold"
                      >
                        Batal
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setEditingId(option.id);
                          setEditingNama(option.nama);
                        }}
                        className="p-2 text-blue-600 dark:text-blue-300 hover:bg-slate-100 dark:hover:bg-white/10 dark:bg-slate-800 rounded-lg"
                        title="Edit"
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
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(option.id, option.nama)}
                        className="p-2 text-red-600 hover:bg-red-50 dark:bg-red-950/40 rounded-lg"
                        title="Hapus"
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
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Notification Toast */}
      {notice && (
        <div
          className={`fixed bottom-6 right-6 px-6 py-4 rounded-xl shadow-2xl ${
            notice.type === "success" ? "bg-green-50 dark:bg-slate-8000" : "bg-red-50 dark:bg-red-950/400"
          } text-white font-semibold z-50`}
        >
          {notice.message}
        </div>
      )}
    </div>
  );
}

export { PricingTab, RollSizesTab, FinishingOptionsTab };
