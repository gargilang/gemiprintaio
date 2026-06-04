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


function CompanyTab() {
  const {
    data: shopSettings,
    isLoading: loading,
    mutate: mutateShopSettings,
  } = useCachedData<PengaturanToko>("settings:shop", () => getShopSettingsAction() as Promise<PengaturanToko>);
  const [form, setForm] = useState<Partial<PengaturanToko>>({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<NotificationToastProps | null>(null);

  // Sync SWR data into local form state (only when data first arrives or changes externally)
  useEffect(() => {
    if (shopSettings) setForm(shopSettings);
  }, [shopSettings]);

  const updateField = (field: keyof PengaturanToko, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const updated = await updateShopSettingsAction({
        nama_toko: (form.nama_toko || "").trim() || "gemiprint",
        slogan: (form.slogan || "").trim() || null,
        alamat: (form.alamat || "").trim() || null,
        telepon: (form.telepon || "").trim() || null,
        email: (form.email || "").trim() || null,
        website: (form.website || "").trim() || null,
        bank_nama: (form.bank_nama || "").trim() || null,
        bank_nomor: (form.bank_nomor || "").trim() || null,
        bank_atas_nama: (form.bank_atas_nama || "").trim() || null,
        catatan_faktur: (form.catatan_faktur || "").trim() || null,
        catatan_struk: (form.catatan_struk || "").trim() || null,
        npwp: (form.npwp || "").trim() || null,
        alamat_npwp: (form.alamat_npwp || "").trim() || null,
      });
      // Update SWR cache with the saved value so PpnTab (which shares the
      // same "settings:shop" key) also sees the latest data without re-fetching.
      await mutateShopSettings(updated as PengaturanToko, { revalidate: false });
      setForm(updated);
      setNotice({ type: "success", message: "Data usaha berhasil disimpan" });
    } catch (error) {
      console.error("Gagal menyimpan data usaha:", error);
      setNotice({ type: "error", message: "Gagal menyimpan data usaha" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {notice && (
        <ToastNotifikasi
          type={notice.type}
          message={notice.message}
        />
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
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
            />
          </svg>
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-slate-100">Data Usaha</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Identitas usaha untuk faktur, struk thermal, dan dokumen pajak
          </p>
        </div>
      </div>

      <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-6 border-2 border-gray-200 dark:border-slate-800 space-y-5">
        {loading ? (
          <div className="text-gray-500 dark:text-slate-400">Memuat data usaha...</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TextInput label="Nama Usaha" value={form.nama_toko || ""} onChange={(value) => updateField("nama_toko", value)} placeholder="gemiprint" />
              <TextInput label="Slogan / Tagline" value={form.slogan || ""} onChange={(value) => updateField("slogan", value)} placeholder="Digital Printing & Advertising" />
              <TextInput label="No. Telepon" value={form.telepon || ""} onChange={(value) => updateField("telepon", value)} placeholder="0812 3456 0525" />
              <TextInput label="Email" value={form.email || ""} onChange={(value) => updateField("email", value)} placeholder="cs@gemiprint.com" />
              <TextInput label="Website / Sosial Media" value={form.website || ""} onChange={(value) => updateField("website", value)} placeholder="www.gemiprint.com / @gemiprint" />
              <TextInput label="NPWP" value={form.npwp || ""} onChange={(value) => updateField("npwp", value)} placeholder="Opsional" />
            </div>
            <TextArea label="Alamat Usaha" value={form.alamat || ""} onChange={(value) => updateField("alamat", value)} placeholder="Alamat yang tampil di faktur dan struk" />
            <TextArea label="Alamat NPWP" value={form.alamat_npwp || ""} onChange={(value) => updateField("alamat_npwp", value)} placeholder="Alamat resmi untuk faktur pajak (opsional)" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <TextInput label="Nama Bank" value={form.bank_nama || ""} onChange={(value) => updateField("bank_nama", value)} placeholder="BCA" />
              <TextInput label="Nomor Rekening" value={form.bank_nomor || ""} onChange={(value) => updateField("bank_nomor", value)} placeholder="6881276507" />
              <TextInput label="Atas Nama Rekening" value={form.bank_atas_nama || ""} onChange={(value) => updateField("bank_atas_nama", value)} placeholder="Nama pemilik rekening" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TextArea label="Catatan Faktur" value={form.catatan_faktur || ""} onChange={(value) => updateField("catatan_faktur", value)} placeholder="Barang yang sudah dibawa tidak bisa ditukar/dikembalikan." />
              <TextArea label="Catatan Struk Thermal" value={form.catatan_struk || ""} onChange={(value) => updateField("catatan_struk", value)} placeholder="Barang yang sudah dibeli tidak dapat dikembalikan" />
            </div>
            <div className="flex items-center justify-between gap-4 pt-2 border-t border-gray-200 dark:border-slate-800">
              <p className="text-sm text-gray-500 dark:text-slate-400">
                Perubahan ini dipakai untuk faktur penjualan, bukti pembelian, struk thermal, dan header faktur pajak.
              </p>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2.5 bg-gradient-to-r from-gray-600 to-gray-700 text-white rounded-lg font-semibold hover:shadow-lg disabled:opacity-60"
              >
                {saving ? "Menyimpan..." : "Simpan Data Usaha"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TextInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-400 focus:border-gray-400 outline-none"
      />
    </label>
  );
}

function TextArea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-400 focus:border-gray-400 outline-none resize-y"
      />
    </label>
  );
}

export { CompanyTab };
export default CompanyTab;
