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


interface SystemPrinter {
  name: string;
  driver?: string | null;
  port?: string | null;
  status?: string | null;
  is_default: boolean;
}

interface PrinterPreferences {
  receiptPrinter: string;
  documentPrinter: string;
  receiptCopies: number;
  documentCopies: number;
  openPreview: boolean;
}

const PRINTER_PREFS_KEY = "settings.printer.preferences";

const defaultPrinterPreferences: PrinterPreferences = {
  receiptPrinter: "",
  documentPrinter: "",
  receiptCopies: 1,
  documentCopies: 1,
  openPreview: true,
};

function SystemTab() {
  const [notice, setNotice] = useState<NotificationToastProps | null>(null);

  // Tauri detection — sync UI is Tauri-only since web users go straight to
  // Supabase via server actions and have no local SQLite to sync with.
  const [isTauri, setIsTauri] = useState(false);
  useEffect(() => {
    setIsTauri(isTauriApp());
  }, []);

  // Sync state
  const [syncStatus, setSyncStatus] = useState<any>(null);
  const [syncLoading, setSyncLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [pullingOnly, setPullingOnly] = useState(false);
  const [updatingSyncInterval, setUpdatingSyncInterval] = useState(false);
  const [syncIntervalValue, setSyncIntervalValue] = useState<number>(20);
  const [syncIntervalUnit, setSyncIntervalUnit] = useState<string>("Menit");
  const [printers, setPrinters] = useState<SystemPrinter[]>([]);
  const [printerLoading, setPrinterLoading] = useState(false);
  const [printerPrefs, setPrinterPrefs] = useState<PrinterPreferences>(
    defaultPrinterPreferences
  );

  const loadSyncStatus = async () => {
    try {
      const serverStatus = await getSyncStatus();
      const lastSyncAt =
        typeof window !== "undefined"
          ? localStorage.getItem("sync.last.success.at")
          : null;
      const clientStatus = getClientSyncStatus(lastSyncAt);
      setSyncStatus({
        ...serverStatus,
        cloudBackup: clientStatus.cloudBackup,
        pendingChanges: clientStatus.pendingChanges || serverStatus.pendingChanges,
        lastSyncAt: lastSyncAt || serverStatus.lastSyncAt,
      });
      const minutes = getAutoSyncIntervalMinutes();
      if (minutes >= 60) {
        setSyncIntervalValue(Math.max(1, Math.floor(minutes / 60)));
        setSyncIntervalUnit("Jam");
      } else {
        setSyncIntervalValue(minutes);
        setSyncIntervalUnit("Menit");
      }
    } catch (error) {
      console.error("Failed to load sync status:", error);
    } finally {
      setSyncLoading(false);
    }
  };

  const loadPrinters = async () => {
    if (!isTauriApp()) return;
    setPrinterLoading(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<SystemPrinter[]>("list_system_printers");
      setPrinters(result);
      setPrinterPrefs((current) => {
        const defaultPrinter = result.find((printer) => printer.is_default)?.name;
        return {
          ...current,
          receiptPrinter: current.receiptPrinter || defaultPrinter || "",
          documentPrinter: current.documentPrinter || defaultPrinter || "",
        };
      });
    } catch (error) {
      console.error("Gagal memuat daftar printer:", error);
      setNotice({
        type: "error",
        message: "Gagal memuat daftar printer dari sistem",
      });
      setTimeout(() => setNotice(null), 3000);
    } finally {
      setPrinterLoading(false);
    }
  };

  const savePrinterPrefs = () => {
    if (typeof window === "undefined") return;
    localStorage.setItem(PRINTER_PREFS_KEY, JSON.stringify(printerPrefs));
    setNotice({
      type: "success",
      message: "Pengaturan printer berhasil disimpan",
    });
    setTimeout(() => setNotice(null), 3000);
  };

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      const result = await runSyncCycle();

      if (result.success) {
        setNotice({
          type: "success",
          message: `Sinkron berhasil! kirim ${result.synced}, tarik ${result.pulled}`,
        });
        await loadSyncStatus();
      } else {
        setNotice({
          type: "error",
          message: result.message || "Sinkron gagal",
        });
      }
    } catch (error) {
      setNotice({
        type: "error",
        message: "Terjadi kesalahan saat sinkron",
      });
    } finally {
      setSyncing(false);
      setTimeout(() => setNotice(null), 3000);
    }
  };

  const handleUpdateSyncInterval = async () => {
    const intervalMs =
      syncIntervalValue * (syncIntervalUnit === "Jam" ? 60 : 1);

    if (intervalMs < 5) {
      setNotice({
        type: "error",
        message: "Minimal 5 menit",
      });
      setTimeout(() => setNotice(null), 3000);
      return;
    }

    if (intervalMs > 1440) {
      setNotice({
        type: "error",
        message: "Maksimal 24 jam (1440 menit)",
      });
      setTimeout(() => setNotice(null), 3000);
      return;
    }

    setUpdatingSyncInterval(true);
    try {
      const normalized = setAutoSyncIntervalMinutes(intervalMs);
      setNotice({
        type: "success",
        message: `Interval sinkron diubah menjadi ${normalized} menit`,
      });
      await loadSyncStatus();
    } catch (error) {
      setNotice({
        type: "error",
        message: "Terjadi kesalahan saat mengubah interval sinkron",
      });
    } finally {
      setUpdatingSyncInterval(false);
      setTimeout(() => setNotice(null), 3000);
    }
  };

  const handlePullCloudOnly = async () => {
    setPullingOnly(true);
    try {
      const result = await runPullOnlyCycle();
      if (result.success) {
        setNotice({
          type: "success",
          message:
            result.pulled > 0
              ? `Tarik data cloud berhasil (${result.pulled} data diperbarui)`
              : "Tarik data cloud selesai (tidak ada perubahan baru)",
        });
      } else {
        setNotice({
          type: "error",
          message: result.message || "Gagal menarik data cloud",
        });
      }
      await loadSyncStatus();
    } catch {
      setNotice({
        type: "error",
        message: "Terjadi kesalahan saat menarik data cloud",
      });
    } finally {
      setPullingOnly(false);
      setTimeout(() => setNotice(null), 3000);
    }
  };

  useEffect(() => {
    // Sync status polling is only meaningful for Tauri desktop builds.
    // Web users hit Supabase directly — there is nothing to poll.
    if (!isTauriApp()) {
      setSyncLoading(false);
      return;
    }
    loadSyncStatus();
    const interval = setInterval(() => {
      loadSyncStatus();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!isTauriApp() || typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem(PRINTER_PREFS_KEY);
      if (stored) {
        setPrinterPrefs({
          ...defaultPrinterPreferences,
          ...JSON.parse(stored),
        });
      }
    } catch {
      localStorage.removeItem(PRINTER_PREFS_KEY);
    }
    loadPrinters();
  }, []);

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
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-slate-100 dark:text-slate-100">Pengaturan Sistem</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400 dark:text-slate-400">
            Pengaturan sistem dan database
          </p>
        </div>
      </div>

      {/* Tampilan: Terang / Gelap / Ikuti Sistem */}
      <ThemePanel />

      {/* Auto-Backup Database — Tauri desktop only. Web users (Vercel /
          localhost browser) write directly to Supabase via server actions,
          so there is no local store to sync. */}
      {isTauri && (
      <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-slate-800 dark:to-slate-900 rounded-xl p-6 border-2 border-green-200 dark:border-slate-700">
        <div className="flex items-center justify-between gap-6">
          {/* Left: Title & Status */}
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-50 dark:bg-slate-8000 rounded-xl">
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-800 dark:text-slate-100 flex items-center gap-2">
                Auto-Backup Database
                <div
                  className={`w-2 h-2 rounded-full ${
                    syncStatus?.cloudBackup === "connected"
                      ? "bg-green-50 dark:bg-slate-8000 animate-pulse"
                      : syncStatus?.cloudBackup === "syncing"
                      ? "bg-yellow-50 dark:bg-slate-8000 animate-pulse"
                      : "bg-gray-400"
                  }`}
                ></div>
              </h3>
              <p className="text-sm text-gray-600 dark:text-slate-300">
                {syncLoading ? (
                  "Memuat..."
                ) : syncStatus?.cloudBackup === "connected" ? (
                  <>
                    Terhubung •{" "}
                    {syncStatus?.lastSyncAt ? (
                      <>
                        Terakhir sync:{" "}
                        {new Date(syncStatus.lastSyncAt).toLocaleString(
                          "id-ID",
                          {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          }
                        )}
                      </>
                    ) : (
                      "Belum pernah sync"
                    )}
                  </>
                ) : syncStatus?.cloudBackup === "syncing" ? (
                  "Sedang sinkron..."
                ) : (
                  "Tidak terhubung"
                )}
              </p>
              {syncStatus?.pendingChanges > 0 && (
                <p className="text-xs text-orange-600 dark:text-orange-300 font-semibold mt-1">
                  {syncStatus.pendingChanges} perubahan pending
                </p>
              )}
            </div>
          </div>

          {/* Middle: Interval Control */}
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="5"
              max="1440"
              value={syncIntervalValue}
              onChange={(e) =>
                setSyncIntervalValue(parseInt(e.target.value) || 5)
              }
              className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-center font-semibold focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-slate-800 dark:text-slate-100"
              disabled={updatingSyncInterval}
            />
            <select
              value={syncIntervalUnit}
              onChange={(e) => setSyncIntervalUnit(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg font-semibold focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-slate-800 dark:text-slate-100"
              disabled={updatingSyncInterval}
            >
              <option value="Menit">Menit</option>
              <option value="Jam">Jam</option>
            </select>
            <button
              onClick={handleUpdateSyncInterval}
              disabled={updatingSyncInterval}
              className="px-4 py-2 bg-green-50 dark:bg-slate-8000 hover:bg-green-600 disabled:bg-gray-400 text-white rounded-lg font-semibold transition-all"
            >
              {updatingSyncInterval ? "..." : "Terapkan"}
            </button>
          </div>

          {/* Right: Manual Sync Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleManualSync}
              disabled={syncing || pullingOnly}
              className="px-4 py-2 bg-emerald-50 dark:bg-slate-8000 hover:bg-emerald-600 disabled:bg-gray-400 text-white rounded-lg font-semibold transition-all flex items-center gap-2 whitespace-nowrap"
            >
              {syncing ? (
                <>
                  <svg
                    className="animate-spin h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span>Menyinkronkan...</span>
                </>
              ) : (
                <>
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
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  <span>Sinkronkan Sekarang</span>
                </>
              )}
            </button>

            <button
              onClick={handlePullCloudOnly}
              disabled={pullingOnly || syncing}
              className="px-4 py-2 bg-cyan-50 dark:bg-slate-8000 hover:bg-cyan-600 disabled:bg-gray-400 text-white rounded-lg font-semibold transition-all flex items-center gap-2 whitespace-nowrap"
            >
              {pullingOnly ? "Menarik..." : "Tarik Data Cloud"}
            </button>
          </div>
        </div>

        {/* Info Bar */}
        <div className="mt-4 pt-4 border-t border-green-200 dark:border-slate-700 text-xs text-gray-600 dark:text-slate-300 flex items-center justify-between">
          <span>
            💡 Minimal: 5 menit • Rekomendasi: 15-20 menit • Sinkron otomatis berjalan
            di latar belakang
          </span>
          <span className="text-green-600 font-semibold">
            Data lokal akan otomatis dicadangkan
          </span>
        </div>
      </div>
      )}

      {isTauri && (
      <div className="bg-gradient-to-br from-indigo-50 to-sky-50 rounded-xl p-6 border-2 border-indigo-200 dark:border-slate-700">
        <div className="flex items-center gap-4 mb-4">
          <div className="p-3 bg-indigo-50 dark:bg-slate-8000 rounded-xl">
            <svg
              className="w-6 h-6 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-800 dark:text-slate-100">
              Pengaturan Printer
            </h3>
            <p className="text-sm text-gray-600 dark:text-slate-300">
              Pilih printer default untuk struk thermal dan dokumen aplikasi desktop
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900/85 rounded-lg p-5 border border-indigo-200 dark:border-slate-700 space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">
                Printer Struk Thermal
              </span>
              <select
                value={printerPrefs.receiptPrinter}
                onChange={(event) =>
                  setPrinterPrefs((prev) => ({
                    ...prev,
                    receiptPrinter: event.target.value,
                  }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white dark:bg-slate-900 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 outline-none"
                disabled={printerLoading}
              >
                <option value="">Gunakan printer default sistem</option>
                {printers.map((printer) => (
                  <option key={printer.name} value={printer.name}>
                    {printer.name}
                    {printer.is_default ? " (default)" : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">
                Printer Dokumen
              </span>
              <select
                value={printerPrefs.documentPrinter}
                onChange={(event) =>
                  setPrinterPrefs((prev) => ({
                    ...prev,
                    documentPrinter: event.target.value,
                  }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white dark:bg-slate-900 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 outline-none"
                disabled={printerLoading}
              >
                <option value="">Gunakan printer default sistem</option>
                {printers.map((printer) => (
                  <option key={printer.name} value={printer.name}>
                    {printer.name}
                    {printer.is_default ? " (default)" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="rounded-lg border border-gray-200 dark:border-slate-800 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 dark:bg-slate-800 text-sm font-semibold text-gray-700 dark:text-slate-300">
              Printer terdeteksi
            </div>
            {printerLoading ? (
              <div className="px-4 py-4 text-sm text-gray-500 dark:text-slate-400">
                Memuat daftar printer...
              </div>
            ) : printers.length === 0 ? (
              <div className="px-4 py-4 text-sm text-gray-500 dark:text-slate-400">
                Tidak ada printer yang terdeteksi dari sistem operasi.
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {printers.map((printer) => (
                  <div
                    key={printer.name}
                    className="px-4 py-3 flex items-center justify-between gap-4"
                  >
                    <div>
                      <p className="font-semibold text-gray-800 dark:text-slate-100">
                        {printer.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-slate-400">
                        {[printer.driver, printer.port, printer.status]
                          .filter(Boolean)
                          .join(" | ") || "Detail printer tidak tersedia"}
                      </p>
                    </div>
                    {printer.is_default && (
                      <span className="px-2 py-1 text-xs rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-semibold">
                        Bawaan
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-4 pt-1">
            <p className="text-sm text-gray-500 dark:text-slate-400">
              Preferensi ini hanya muncul dan disimpan di aplikasi desktop Tauri.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={loadPrinters}
                disabled={printerLoading}
                className="px-4 py-2 bg-white dark:bg-slate-900 border border-indigo-200 dark:border-slate-700 text-indigo-700 dark:text-indigo-300 rounded-lg font-semibold hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-60"
              >
                {printerLoading ? "Memuat..." : "Muat Ulang"}
              </button>
              <button
                type="button"
                onClick={savePrinterPrefs}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold"
              >
                Simpan Printer
              </button>
            </div>
          </div>
        </div>

        <div className="hidden">
          <div className="flex items-start gap-3 mb-4">
            <svg
              className="w-6 h-6 text-orange-500 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div>
              <h4 className="font-bold text-gray-800 dark:text-slate-100 mb-2">
                Fitur Dalam Pengembangan
              </h4>
              <p className="text-sm text-gray-700 dark:text-slate-300 mb-3">
                <strong>Catatan Teknis:</strong> Browser tidak dapat mendeteksi
                printer yang terinstall di komputer karena security
                restrictions.
              </p>
              <p className="text-sm text-gray-700 dark:text-slate-300 mb-3">
                Untuk saat ini, aplikasi ini menggunakan{" "}
                <strong>system print dialog</strong> default browser (
                <code className="px-1 py-0.5 bg-gray-200 rounded text-xs">
                  window.print()
                </code>
                ). Anda bisa memilih printer dari dialog yang muncul.
              </p>
              <div className="bg-purple-100 dark:bg-purple-900/30 rounded-lg p-3 border border-purple-200 dark:border-purple-800/50">
                <p className="text-sm text-purple-900 font-semibold mb-2">
                  Rencana Implementasi:
                </p>
                <ul className="text-sm text-purple-800 dark:text-purple-200 space-y-1 ml-4">
                  <li>• Deteksi printer terinstall otomatis</li>
                  <li>• Pilih printer default untuk receipt & dokumen</li>
                  <li>• Auto-print tanpa dialog (untuk thermal printer)</li>
                  <li>• Manajemen antrean cetak</li>
                </ul>
                <p className="text-xs text-purple-700 dark:text-purple-300 mt-3">
                  ⚡ Fitur ini akan tersedia setelah aplikasi di-wrap dengan{" "}
                  <strong>Tauri</strong> atau <strong>Electron</strong> yang
                  memiliki akses ke native printer API.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Future Features */}
      <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-6 border-2 border-gray-200 dark:border-slate-800">
        <p className="text-gray-600 dark:text-slate-300 flex items-start gap-2 mb-4">
          <svg
            className="w-5 h-5 text-gray-500 dark:text-slate-400 flex-shrink-0 mt-0.5"
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
          <span className="font-semibold">Fitur lainnya (segera):</span>
        </p>
        <ul className="space-y-2 text-gray-600 dark:text-slate-300 ml-7">
          <li>• Pulihkan Database dari backup</li>
          <li>• Ekspor Data (CSV/Excel)</li>
          <li>• Template Faktur</li>
          <li>• Uji Cetak untuk semua jenis dokumen</li>
        </ul>
      </div>
    </div>
  );
}

/**
 * ThemePanel — pilihan Terang / Gelap / Ikuti Sistem.
 * State diatur lewat useTheme(); preferensi disimpan di localStorage dan
 * disinkronkan otomatis ke <html> oleh ThemeProvider.
 */
function ThemePanel() {
  const { theme, effective, setTheme } = useTheme();

  const options: Array<{
    value: Theme;
    label: string;
    description: string;
    icon: React.ReactNode;
  }> = [
    {
      value: "light",
      label: "Terang",
      description: "Tampilan terang",
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
      ),
    },
    {
      value: "dark",
      label: "Gelap",
      description: "Tampilan gelap",
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
          />
        </svg>
      ),
    },
    {
      value: "system",
      label: "Ikuti Sistem",
      description: "Mengikuti tema OS",
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
      ),
    },
  ];

  const effectiveLabel = effective === "dark" ? "Mode Gelap" : "Mode Terang";
  const effectiveSuffix =
    theme === "system" ? " (mengikuti sistem)" : "";

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-slate-800 dark:to-slate-900 rounded-xl p-6 border-2 border-indigo-200 dark:border-slate-700">
      <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-100 dark:bg-indigo-900/50 rounded-xl">
            <svg
              className="w-6 h-6 text-indigo-600 dark:text-indigo-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-800 dark:text-slate-100 dark:text-slate-100">
              Tampilan
            </h3>
            <p className="text-sm text-gray-600 dark:text-slate-300 dark:text-slate-400">
              Saat ini:{" "}
              <span className="font-semibold text-indigo-700 dark:text-indigo-300">
                {effectiveLabel}
                {effectiveSuffix}
              </span>
            </p>
          </div>
        </div>
      </div>

      <div
        role="radiogroup"
        aria-label="Pilihan tema tampilan"
        className="grid grid-cols-1 sm:grid-cols-3 gap-3"
      >
        {options.map((opt) => {
          const selected = theme === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setTheme(opt.value)}
              className={`text-left rounded-xl border-2 p-4 transition-all duration-150 flex items-start gap-3 ${
                selected
                  ? "border-indigo-500 bg-white dark:bg-slate-800 shadow-md ring-2 ring-indigo-500/50 dark:ring-indigo-400/50"
                  : "border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800/50 hover:border-indigo-300 dark:hover:border-indigo-400 hover:bg-white dark:hover:bg-slate-800"
              }`}
            >
              <span
                className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${
                  selected
                    ? "bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300"
                    : "bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-300"
                }`}
              >
                {opt.icon}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-800 dark:text-slate-100 dark:text-slate-100">
                  {opt.label}
                </div>
                <div className="text-xs text-gray-600 dark:text-slate-300 dark:text-slate-400 mt-0.5">
                  {opt.description}
                </div>
              </div>
              {selected && (
                <svg
                  className="w-5 h-5 text-indigo-500 shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                  aria-hidden
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </button>
          );
        })}
      </div>

      <p className="mt-4 text-xs text-gray-500 dark:text-slate-400 dark:text-slate-400">
        Mode dark otomatis dinonaktifkan saat mencetak (faktur dan laporan
        tetap menggunakan latar putih).
      </p>
    </div>
  );
}


export { SystemTab };
export default SystemTab;
