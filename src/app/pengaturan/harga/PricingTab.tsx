"use client";

import { useState } from "react";
import ToastNotifikasi, {
  NotificationToastProps,
} from "@/components/ToastNotifikasi";

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
export function PricingTab() {
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
