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


import { PricingTab, RollSizesTab, FinishingOptionsTab } from "./PengaturanHargaTab";

interface Category {
  id: string;
  nama: string;
  urutan_tampilan: number;
}

interface Subcategory {
  id: string;
  kategori_id: string;
  nama: string;
  category_name: string;
  urutan_tampilan: number;
}

interface Unit {
  id: string;
  nama: string;
  urutan_tampilan?: number;
}

interface QuickSpec {
  id: string;
  kategori_id: string;
  tipe_spesifikasi: string;
  nilai_spesifikasi: string;
  category_name: string;
  urutan_tampilan: number;
}

function SetupTab() {
  type SetupSubTab = "materials" | "pricing" | "finishing" | "rollsizes" | "nomorurut";
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const subtabParam = searchParams.get("subtab");
  const [activeSetupTab, setActiveSetupTab] = useState<SetupSubTab>(
    subtabParam === "materials" ||
      subtabParam === "pricing" ||
      subtabParam === "finishing" ||
      subtabParam === "rollsizes" ||
      subtabParam === "nomorurut"
      ? (subtabParam as SetupSubTab)
      : tabParam === "materials"
      ? "materials"
      : "nomorurut"
  );

  const setupTabs = [
    {
      id: "nomorurut" as SetupSubTab,
      label: "Nomor Urut",
      icon: HashIcon,
      gradient: "from-blue-500 to-cyan-500",
    },
    {
      id: "pricing" as SetupSubTab,
      label: "Harga",
      icon: PriceTagIcon,
      gradient: "from-blue-500 to-cyan-500",
    },
    {
      id: "rollsizes" as SetupSubTab,
      label: "Ukuran Roll",
      icon: BoxIcon,
      gradient: "from-blue-500 to-cyan-500",
    },
    {
      id: "materials" as SetupSubTab,
      label: "Master Barang",
      icon: BoxIcon,
      gradient: "from-emerald-500 to-teal-500",
    },
    {
      id: "finishing" as SetupSubTab,
      label: "Opsi Finishing",
      icon: SparklesIcon,
      gradient: "from-amber-700 to-amber-900",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Sub-tabs Navigation */}
      <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-2 border border-gray-200 dark:border-slate-800">
        <div className="flex gap-2">
          {setupTabs.map((tab) => {
            const IconComponent = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSetupTab(tab.id)}
                className={`
                  flex-1 px-4 py-3 rounded-lg font-semibold transition-all duration-200
                  flex items-center justify-center gap-2
                  ${
                    activeSetupTab === tab.id
                      ? `bg-gradient-to-r ${tab.gradient} text-white shadow-md`
                      : "bg-white dark:bg-slate-900 text-gray-600 dark:text-slate-300 hover:bg-gray-100"
                  }
                `}
              >
                <IconComponent size={20} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Sub-tab Content */}
      <div>
        {activeSetupTab === "pricing" && <PricingTab />}
        {activeSetupTab === "rollsizes" && <RollSizesTab />}
        {activeSetupTab === "materials" && <MaterialsTab />}
        {activeSetupTab === "finishing" && <FinishingOptionsTab />}
        {activeSetupTab === "nomorurut" && <NomorUrutTab />}
      </div>
    </div>
  );
}

function MaterialsTab() {
  const searchParams = useSearchParams();
  const manageParam = searchParams.get("manage");
  const openCategoryManager = manageParam === "category";
  const openUnitManager = manageParam === "unit";
  const [view, setView] = useState<"categories" | "subcategories">(
    "categories"
  );
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(
    null
  );

  const handleCategoryClick = (category: Category) => {
    setSelectedCategory(category);
    setView("subcategories");
  };

  const handleBackToCategories = () => {
    setSelectedCategory(null);
    setView("categories");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl">
          <BoxIcon size={32} className="text-white" />
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-slate-100">
            Master Kategori Bahan
          </h2>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Kelola kategori, subkategori, spesifikasi, dan satuan bahan
          </p>
        </div>
      </div>

      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={handleBackToCategories}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors ${
            view === "categories"
              ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-semibold"
              : "text-gray-600 dark:text-slate-300 hover:bg-gray-100"
          }`}
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
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
          Semua Kategori
        </button>
        {selectedCategory && (
          <>
            <svg
              className="w-4 h-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
            <span className="px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-semibold rounded-lg">
              {selectedCategory.nama}
            </span>
          </>
        )}
      </div>

      {/* Content Area */}
      <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-6 border-2 border-gray-200 dark:border-slate-800 min-h-[500px] min-w-[800px]">
        {view === "categories" ? (
          <CategoriesView
            onCategoryClick={handleCategoryClick}
            autoOpenModal={openCategoryManager}
          />
        ) : (
          <SubcategoriesView
            category={selectedCategory!}
            onBack={handleBackToCategories}
          />
        )}
      </div>

      {/* Units Section - Always Visible */}
      <UnitsSection autoOpenModal={openUnitManager} />
    </div>
  );
}

// Sortable Category Component
function SortableCategory({
  category,
  index,
  onCategoryClick,
  onEdit,
  onDelete,
}: {
  category: Category;
  index: number;
  onCategoryClick: (category: Category) => void;
  onEdit: (e: React.MouseEvent, category: Category) => void;
  onDelete: (e: React.MouseEvent, category: Category) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-gradient-to-br from-emerald-50 to-green-50 dark:from-slate-800 dark:to-slate-800 rounded-xl p-4 border-2 border-emerald-200 dark:border-slate-700 hover:border-emerald-400 dark:hover:border-slate-600 flex items-center justify-between group hover:shadow-lg transition-all text-left"
    >
      <div className="flex items-center gap-3 flex-1">
        {/* Drag Handle */}
        <button
          {...attributes}
          {...listeners}
          className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-emerald-600 dark:text-emerald-300 hover:bg-slate-50 dark:hover:bg-white/5 dark:bg-emerald-900/30 rounded cursor-grab active:cursor-grabbing transition-colors"
          title="Drag untuk mengatur urutan"
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
              d="M4 8h16M4 16h16"
            />
          </svg>
        </button>

        {/* Number Badge */}
        <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-green-600 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-md">
          {index + 1}
        </div>

        {/* Category Info */}
        <div
          className="flex-1 cursor-pointer"
          onClick={() => onCategoryClick(category)}
        >
          <span className="font-semibold text-gray-800 dark:text-slate-100 block">
            {category.nama}
          </span>
          {(category as any).butuh_spesifikasi_status === 1 && (
            <span className="text-xs text-emerald-600 dark:text-emerald-300 flex items-center gap-1 mt-1">
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
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Ada Spesifikasi
            </span>
          )}
        </div>

        {/* Arrow Icon */}
        <svg
          className="w-5 h-5 text-emerald-600 dark:text-emerald-300 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          onClick={() => onCategoryClick(category)}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
        <button
          onClick={(e) => onEdit(e, category)}
          className="p-2 text-blue-600 dark:text-blue-300 hover:bg-slate-100 dark:hover:bg-white/10 dark:bg-blue-900/30 rounded-lg transition-colors"
          title="Edit"
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
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
        </button>
        <button
          onClick={(e) => onDelete(e, category)}
          className="p-2 text-red-600 hover:bg-red-100 dark:bg-red-900/30 rounded-lg transition-colors"
          title="Hapus"
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
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

function CategoriesView({
  onCategoryClick,
  autoOpenModal = false,
}: {
  onCategoryClick: (category: Category) => void;
  autoOpenModal?: boolean;
}) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formData, setFormData] = useState({
    nama: "",
    butuh_spesifikasi_status: false,
  });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<NotificationToastProps | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const showMsg = (type: "success" | "error", message: string) => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 2500);
  };

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    if (autoOpenModal) {
      setEditingCategory(null);
      setFormData({ nama: "", butuh_spesifikasi_status: false });
      setShowModal(true);
    }
  }, [autoOpenModal]);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = categories.findIndex((c) => c.id === active.id);
      const newIndex = categories.findIndex((c) => c.id === over.id);

      const newCategories = arrayMove(categories, oldIndex, newIndex);
      setCategories(newCategories);

      // Update urutan_tampilan based on new positions
      const updates = newCategories.map((cat, index) => ({
        id: cat.id,
        urutan_tampilan: index,
      }));

      try {
        await reorderCategories(updates);
      } catch (error: any) {
        showMsg("error", error.message);
        // Reload categories to revert optimistic update
        loadCategories();
      }
    }
  };

  const loadCategories = async () => {
    try {
      setLoading(true);
      const data = await getCategories();
      setCategories(data || []);
    } catch (error) {
      console.error("Error loading categories:", error);
      showMsg("error", "Gagal memuat data kategori");
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingCategory(null);
    setFormData({ nama: "", butuh_spesifikasi_status: false });
    setShowModal(true);
  };

  const handleEdit = (e: React.MouseEvent, category: Category) => {
    e.stopPropagation(); // Prevent category click
    setEditingCategory(category);
    setFormData({
      nama: category.nama,
      butuh_spesifikasi_status:
        (category as any).butuh_spesifikasi_status === 1,
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nama.trim()) return;

    try {
      setSaving(true);

      const payload = {
        nama: formData.nama,
        butuh_spesifikasi_status: formData.butuh_spesifikasi_status ? 1 : 0,
        urutan_tampilan: editingCategory?.urutan_tampilan || categories.length,
      };

      if (editingCategory) {
        await updateCategory(editingCategory.id, payload);
      } else {
        await createCategory(payload);
      }

      showMsg(
        "success",
        editingCategory
          ? "Kategori berhasil diupdate"
          : "Kategori berhasil ditambahkan"
      );
      setShowModal(false);
      loadCategories();
    } catch (error: any) {
      showMsg("error", error.message || "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, category: Category) => {
    e.stopPropagation(); // Prevent category click

    setConfirmDialog({
      show: true,
      title: "Hapus Kategori",
      message: `Yakin ingin menghapus kategori "${category.nama}"?\n\nKategori hanya bisa dihapus jika tidak ada bahan yang menggunakannya.`,
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          await deleteCategory(category.id);
          showMsg("success", "Kategori berhasil dihapus");
          loadCategories();
        } catch (error: any) {
          showMsg("error", error.message || "Gagal menghapus");
        }
      },
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-gray-800 dark:text-slate-100">
          Pilih Kategori untuk Melihat Subkategori
        </h3>
        <button
          onClick={handleAdd}
          className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-lg hover:from-emerald-600 hover:to-green-700 transition-all font-semibold shadow-md flex items-center gap-2"
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
          Tambah Kategori
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500 dark:text-slate-400">Memuat data...</div>
      ) : categories.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-slate-400">
          Belum ada kategori. Klik "Tambah Kategori" untuk memulai.
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={categories.map((c) => c.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {categories.map((category, index) => (
                <SortableCategory
                  key={category.id}
                  category={category}
                  index={index}
                  onCategoryClick={onCategoryClick}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <ModalFormShell
        open={showModal}
        onClose={() => setShowModal(false)}
        allowDismiss={!saving}
        maxWidthClass="max-w-md"
        header={
          <div className="p-6 border-b border-gray-200 dark:border-slate-800 shrink-0 flex items-center justify-between gap-3 bg-white dark:bg-slate-900 rounded-t-xl">
            <h3 className="text-xl font-bold text-gray-800 dark:text-slate-100 min-w-0">
              {editingCategory ? "Edit Kategori" : "Tambah Kategori Baru"}
            </h3>
            <button
              type="button"
              onClick={() => setShowModal(false)}
              disabled={saving}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors shrink-0 disabled:opacity-50"
              aria-label="Tutup"
            >
              <svg
                className="w-6 h-6 text-gray-600 dark:text-slate-300"
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
        }
        footer={
          <div className="bg-gray-50 dark:bg-slate-800 px-6 py-4 flex items-center justify-end gap-3 border-t border-gray-200 dark:border-slate-800 shrink-0">
            <button
              type="button"
              onClick={() => setShowModal(false)}
              disabled={saving}
              className="px-6 py-2 bg-white dark:bg-slate-900 border-2 border-gray-300 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-100 transition-colors font-semibold disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              form="settings-category-form"
              disabled={saving}
              className="px-6 py-2 bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-lg hover:from-emerald-600 hover:to-green-700 transition-all font-semibold disabled:opacity-50"
            >
              {saving ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        }
      >
            <form
              id="settings-category-form"
              onSubmit={handleSave}
              className="p-6 space-y-4"
            >
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">
                  Nama Kategori
                </label>
                <input
                  type="text"
                  value={formData.nama}
                  onChange={(e) =>
                    setFormData({ ...formData, nama: e.target.value })
                  }
                  placeholder="Contoh: Finishing"
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-800 dark:text-slate-100"
                  autoFocus
                  required
                />
              </div>
              <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-slate-800 rounded-lg border border-blue-200 dark:border-slate-700">
                <input
                  type="checkbox"
                  id="needs_specifications"
                  checked={formData.butuh_spesifikasi_status}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      butuh_spesifikasi_status: e.target.checked,
                    })
                  }
                  className="w-5 h-5 text-emerald-600 dark:text-emerald-300 border-gray-300 rounded focus:ring-emerald-500"
                />
                <label
                  htmlFor="needs_specifications"
                  className="flex-1 text-sm text-gray-700 dark:text-slate-300 cursor-pointer"
                >
                  <span className="font-semibold block">
                    Kategori ini perlu Spesifikasi
                  </span>
                  <span className="text-xs text-gray-500 dark:text-slate-400">
                    Misal: Kertas perlu ukuran & gramasi, Finishing perlu jenis
                    (Glossy/Doff)
                  </span>
                </label>
              </div>
            </form>
      </ModalFormShell>

      {/* Notification Toast */}
      {notice && (
        <ToastNotifikasi type={notice.type} message={notice.message} />
      )}

      {confirmDialog?.show && (
        <DialogKonfirmasi
          show={confirmDialog.show}
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmText="Ya, Hapus"
          cancelText="Batal"
          type="danger"
          onConfirm={() => confirmDialog.onConfirm()}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  );
}

// Sortable Subcategory Component
function SortableSubcategory({
  subcategory,
  index,
  onEdit,
  onDelete,
}: {
  subcategory: Subcategory;
  index: number;
  onEdit: (subcategory: Subcategory) => void;
  onDelete: (subcategory: Subcategory) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: subcategory.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-blue-50 dark:bg-slate-800 rounded-lg p-3 border-2 border-blue-200 dark:border-slate-700 flex items-center justify-between group hover:shadow-md transition-all"
    >
      <div className="flex items-center gap-2 flex-1">
        {/* Drag Handle */}
        <button
          {...attributes}
          {...listeners}
          className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-blue-600 dark:text-blue-300 hover:bg-slate-50 dark:hover:bg-white/5 dark:bg-blue-900/30 rounded cursor-grab active:cursor-grabbing transition-colors"
          title="Drag untuk mengatur urutan"
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
              d="M4 8h16M4 16h16"
            />
          </svg>
        </button>

        {/* Number Badge */}
        <span className="w-8 h-8 bg-blue-50 dark:bg-slate-8000 text-white rounded-lg flex items-center justify-center font-bold text-sm">
          {index + 1}
        </span>

        {/* Subcategory Name */}
        <span className="text-gray-800 dark:text-slate-100 font-semibold flex-1">
          {subcategory.nama}
        </span>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onEdit(subcategory)}
          className="p-1.5 text-blue-600 dark:text-blue-300 hover:bg-slate-100 dark:hover:bg-white/10 dark:bg-blue-900/30 rounded transition-colors"
          title="Edit"
        >
          <svg
            className="w-3.5 h-3.5"
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
          onClick={() => onDelete(subcategory)}
          className="p-1.5 text-red-600 hover:bg-red-100 dark:bg-red-900/30 rounded transition-colors"
          title="Hapus"
        >
          <svg
            className="w-3.5 h-3.5"
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
      </div>
    </div>
  );
}

// Sortable Unit Component
function SortableUnit({
  unit,
  index,
  onEdit,
  onDelete,
}: {
  unit: Unit;
  index: number;
  onEdit: (unit: Unit) => void;
  onDelete: (unit: Unit) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: unit.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-slate-800 dark:to-slate-800 rounded-lg p-3 border-2 border-orange-200 dark:border-slate-700 flex items-center justify-between group hover:shadow-md transition-all"
    >
      <div className="flex items-center gap-2 flex-1">
        {/* Drag Handle */}
        <button
          {...attributes}
          {...listeners}
          className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-orange-600 dark:text-orange-300 hover:bg-slate-50 dark:hover:bg-white/5 dark:bg-orange-900/30 rounded cursor-grab active:cursor-grabbing transition-colors"
          title="Drag untuk mengatur urutan"
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
              d="M4 8h16M4 16h16"
            />
          </svg>
        </button>

        {/* Number Badge */}
        <span className="w-8 h-8 bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-lg flex items-center justify-center font-bold text-sm">
          {index + 1}
        </span>

        {/* Unit Name */}
        <span className="font-semibold text-gray-800 dark:text-slate-100 flex-1">{unit.nama}</span>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onEdit(unit)}
          className="p-1.5 text-blue-600 dark:text-blue-300 hover:bg-slate-100 dark:hover:bg-white/10 dark:bg-blue-900/30 rounded transition-colors"
          title="Edit"
        >
          <svg
            className="w-3.5 h-3.5"
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
          onClick={() => onDelete(unit)}
          className="p-1.5 text-red-600 hover:bg-red-100 dark:bg-red-900/30 rounded transition-colors"
          title="Hapus"
        >
          <svg
            className="w-3.5 h-3.5"
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
      </div>
    </div>
  );
}

// Sortable Quick Spec Component
function SortableQuickSpec({
  spec,
  onEdit,
  onDelete,
}: {
  spec: QuickSpec;
  onEdit: (spec: QuickSpec) => void;
  onDelete: (spec: QuickSpec) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: spec.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-white dark:bg-slate-900 rounded-lg p-2 border border-purple-300 flex items-center justify-between group hover:shadow-md transition-all"
    >
      <div className="flex items-center gap-2 flex-1">
        {/* Drag Handle */}
        <button
          {...attributes}
          {...listeners}
          className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-purple-600 dark:text-purple-300 hover:bg-slate-50 dark:hover:bg-white/5 dark:bg-purple-900/30 rounded cursor-grab active:cursor-grabbing transition-colors"
          title="Drag untuk mengatur urutan"
        >
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
              d="M4 8h16M4 16h16"
            />
          </svg>
        </button>

        {/* Spec Value */}
        <span className="text-sm font-semibold text-gray-800 dark:text-slate-100 truncate flex-1">
          {spec.nilai_spesifikasi}
        </span>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
        <button
          onClick={() => onEdit(spec)}
          className="p-1 text-blue-600 dark:text-blue-300 hover:bg-slate-100 dark:hover:bg-white/10 dark:bg-blue-900/30 rounded transition-colors"
          title="Edit"
        >
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
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
        </button>
        <button
          onClick={() => onDelete(spec)}
          className="p-1 text-red-600 hover:bg-red-100 dark:bg-red-900/30 rounded transition-colors"
          title="Hapus"
        >
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
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

function SubcategoriesView({
  category,
  onBack,
}: {
  category: Category;
  onBack: () => void;
}) {
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [specs, setSpecs] = useState<QuickSpec[]>([]);
  const [loading, setLoading] = useState(true);
  const [specsLoading, setSpecsLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showSpecModal, setShowSpecModal] = useState(false);
  const [editingSubcategory, setEditingSubcategory] =
    useState<Subcategory | null>(null);
  const [editingSpec, setEditingSpec] = useState<QuickSpec | null>(null);
  const [formData, setFormData] = useState({ nama: "" });
  const [specFormData, setSpecFormData] = useState({
    tipe_spesifikasi: "",
    nilai_spesifikasi: "",
  });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<NotificationToastProps | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const showMsg = (type: "success" | "error", message: string) => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 2500);
  };

  useEffect(() => {
    loadSubcategories();
    if ((category as any).butuh_spesifikasi_status === 1) {
      loadSpecs();
    }
  }, [category.id]);

  const loadSubcategories = async () => {
    try {
      setLoading(true);
      const data = await getSubcategories(category.id);
      setSubcategories(
        (data || []).map((sub: any) => ({
          ...sub,
          category_name: category.nama,
        }))
      );
    } catch (error) {
      console.error("Error loading subcategories:", error);
      showMsg("error", "Gagal memuat data subkategori");
    } finally {
      setLoading(false);
    }
  };

  const handleDragEndSubcat = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = subcategories.findIndex((s) => s.id === active.id);
      const newIndex = subcategories.findIndex((s) => s.id === over.id);

      const newSubcategories = arrayMove(subcategories, oldIndex, newIndex);
      setSubcategories(newSubcategories);

      // Update urutan_tampilan based on new positions
      const updates = newSubcategories.map((sub, index) => ({
        id: sub.id,
        urutan_tampilan: index,
      }));

      try {
        await reorderSubcategories(updates);
      } catch (error: any) {
        showMsg("error", error.message);
        loadSubcategories();
      }
    }
  };

  const loadSpecs = async () => {
    try {
      setSpecsLoading(true);
      const data = await getQuickSpecs(category.id);
      setSpecs(
        (data || []).map((spec: any) => ({
          ...spec,
          tipe_spesifikasi: spec.tipe_spesifikasi || "",
          nilai_spesifikasi: spec.nilai_spesifikasi || "",
          category_name: category.nama,
        }))
      );
    } catch (error) {
      console.error("Error loading specs:", error);
      showMsg("error", "Gagal memuat data spesifikasi");
    } finally {
      setSpecsLoading(false);
    }
  };

  const handleDragEndSpecs = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = specs.findIndex((s) => s.id === active.id);
      const newIndex = specs.findIndex((s) => s.id === over.id);

      const newSpecs = arrayMove(specs, oldIndex, newIndex);
      setSpecs(newSpecs);

      // Update urutan_tampilan based on new positions
      const updates = newSpecs.map((spec, index) => ({
        id: spec.id,
        urutan_tampilan: index,
      }));

      try {
        await reorderQuickSpecs(updates);
      } catch (error: any) {
        showMsg("error", error.message);
        loadSpecs();
      }
    }
  };

  const handleAdd = () => {
    setEditingSubcategory(null);
    setFormData({ nama: "" });
    setShowModal(true);
  };

  const handleEdit = (subcategory: Subcategory) => {
    setEditingSubcategory(subcategory);
    setFormData({ nama: subcategory.nama });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nama.trim()) return;

    try {
      setSaving(true);
      const url = editingSubcategory
        ? `/api/master/subcategories/${editingSubcategory.id}`
        : "/api/master/subcategories";
      const method = editingSubcategory ? "PUT" : "POST";

      const payload = {
        nama: formData.nama,
        ...(!editingSubcategory && { kategori_id: category.id }),
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan");

      showMsg("success", data.message);
      setShowModal(false);
      loadSubcategories();
    } catch (error: any) {
      showMsg("error", error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (subcategory: Subcategory) => {
    setConfirmDialog({
      show: true,
      title: "Hapus Subkategori",
      message: `Yakin ingin menghapus subkategori "${subcategory.nama}"?\n\nSubkategori hanya bisa dihapus jika tidak ada bahan yang menggunakannya.`,
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const res = await fetch(
            `/api/master/subcategories/${subcategory.id}`,
            {
              method: "DELETE",
            }
          );
          const data = await res.json();

          if (!res.ok) throw new Error(data.error || "Gagal menghapus");

          showMsg("success", data.message);
          loadSubcategories();
        } catch (error: any) {
          showMsg("error", error.message);
        }
      },
    });
  };

  // Quick Specs Handlers
  const handleAddSpec = () => {
    setEditingSpec(null);
    setSpecFormData({ tipe_spesifikasi: "", nilai_spesifikasi: "" });
    setShowSpecModal(true);
  };

  const handleEditSpec = (spec: QuickSpec) => {
    setEditingSpec(spec);
    setSpecFormData({
      tipe_spesifikasi: spec.tipe_spesifikasi,
      nilai_spesifikasi: spec.nilai_spesifikasi,
    });
    setShowSpecModal(true);
  };

  const handleSaveSpec = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !specFormData.tipe_spesifikasi.trim() ||
      !specFormData.nilai_spesifikasi.trim()
    )
      return;

    try {
      setSaving(true);
      const url = editingSpec
        ? `/api/master/quick-specs/${editingSpec.id}`
        : "/api/master/quick-specs";
      const method = editingSpec ? "PUT" : "POST";

      const payload = {
        ...specFormData,
        ...(!editingSpec && { kategori_id: category.id }),
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan");

      showMsg("success", data.message);
      setShowSpecModal(false);
      loadSpecs();
    } catch (error: any) {
      showMsg("error", error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSpec = async (spec: QuickSpec) => {
    setConfirmDialog({
      show: true,
      title: "Hapus Spesifikasi",
      message: `Yakin ingin menghapus spesifikasi "${spec.nilai_spesifikasi}" (${spec.tipe_spesifikasi})?`,
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const res = await fetch(`/api/master/quick-specs/${spec.id}`, {
            method: "DELETE",
          });
          const data = await res.json();

          if (!res.ok) throw new Error(data.error || "Gagal menghapus");

          showMsg("success", data.message);
          loadSpecs();
        } catch (error: any) {
          showMsg("error", error.message);
        }
      },
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-gray-800 dark:text-slate-100">
            Subkategori: {category.nama}
          </h3>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
            Kelola subkategori untuk kategori ini
          </p>
        </div>
        <button
          onClick={handleAdd}
          className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all font-semibold shadow-md flex items-center gap-2"
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
          Tambah Subkategori
        </button>
      </div>

      {/* Info Card */}
      {(category as any).butuh_spesifikasi_status === 1 && (
        <div className="bg-amber-50 dark:bg-slate-800 border-2 border-amber-200 dark:border-amber-800/50 rounded-lg p-4 flex items-start gap-3">
          <svg
            className="w-5 h-5 text-amber-600 dark:text-amber-300 flex-shrink-0 mt-0.5"
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
          <div className="text-sm">
            <p className="font-semibold text-amber-800 dark:text-amber-200">
              Kategori ini memerlukan Spesifikasi
            </p>
            <p className="text-amber-700 dark:text-amber-300 mt-1">
              Anda bisa mengelola spesifikasi (ukuran, gramasi, dll) di section
              "Kelola Spesifikasi" di bawah.
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500 dark:text-slate-400">Memuat data...</div>
      ) : subcategories.length === 0 ? (
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 dark:bg-slate-800 rounded-full mb-4">
            <svg
              className="w-8 h-8 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <p className="text-gray-600 dark:text-slate-300 font-semibold">Belum ada subkategori</p>
          <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">
            Klik "Tambah Subkategori" untuk mulai menambahkan
          </p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEndSubcat}
        >
          <SortableContext
            items={subcategories.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {subcategories.map((subcategory, index) => (
                <SortableSubcategory
                  key={subcategory.id}
                  subcategory={subcategory}
                  index={index}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Quick Specs Section - Only for categories that need specifications */}
      {(category as any).butuh_spesifikasi_status === 1 ? (
        <div className="mt-8 pt-6 border-t-2 border-gray-300">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-bold text-gray-800 dark:text-slate-100 flex items-center gap-2">
                <svg
                  className="w-5 h-5 text-purple-600 dark:text-purple-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                  />
                </svg>
                Kelola Spesifikasi
              </h3>
              <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                Spesifikasi seperti ukuran, gramasi, atau jenis finishing
              </p>
            </div>
            <button
              onClick={handleAddSpec}
              className="px-4 py-2 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-lg hover:from-purple-600 hover:to-purple-700 transition-all font-semibold shadow-md flex items-center gap-2"
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
              Tambah Spesifikasi
            </button>
          </div>

          {specsLoading ? (
            <div className="text-center py-8 text-gray-500 dark:text-slate-400">
              Memuat spesifikasi...
            </div>
          ) : specs.length === 0 ? (
            <div className="text-center py-8 bg-purple-50 dark:bg-slate-800 rounded-lg border-2 border-purple-200 dark:border-slate-700">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-purple-100 dark:bg-purple-900/40 rounded-full mb-4">
                <svg
                  className="w-8 h-8 text-purple-400 dark:text-purple-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
              </div>
              <p className="text-gray-600 dark:text-slate-300 font-semibold">
                Belum ada spesifikasi
              </p>
              <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">
                Klik "Tambah Spesifikasi" untuk mulai menambahkan
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Group by spec_type */}
              {Object.entries(
                specs.reduce((acc, spec) => {
                  if (!acc[spec.tipe_spesifikasi])
                    acc[spec.tipe_spesifikasi] = [];
                  acc[spec.tipe_spesifikasi].push(spec);
                  return acc;
                }, {} as Record<string, QuickSpec[]>)
              ).map(([type, typeSpecs]) => (
                <div
                  key={type}
                  className="bg-purple-50 dark:bg-slate-800 rounded-lg p-4 border-2 border-purple-200 dark:border-slate-700"
                >
                  <h4 className="font-bold text-purple-800 dark:text-purple-200 mb-3 capitalize">
                    {type === "size"
                      ? "Ukuran"
                      : type === "weight"
                      ? "Gramasi"
                      : type === "thickness"
                      ? "Ketebalan"
                      : type === "width"
                      ? "Lebar"
                      : type}
                  </h4>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEndSpecs}
                  >
                    <SortableContext
                      items={typeSpecs.map((s) => s.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                        {typeSpecs.map((spec) => (
                          <SortableQuickSpec
                            key={spec.id}
                            spec={spec}
                            onEdit={handleEditSpec}
                            onDelete={handleDeleteSpec}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Info when category does not require specifications */
        <div className="mt-8 pt-6 border-t-2 border-gray-300">
          <div className="bg-gray-50 dark:bg-slate-800 border-2 border-gray-200 dark:border-slate-800 rounded-lg p-6 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-200 rounded-full mb-4">
              <svg
                className="w-8 h-8 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-gray-700 dark:text-slate-300 mb-2">
              Kategori ini tidak memerlukan spesifikasi
            </h3>
            <p className="text-gray-600 dark:text-slate-300 text-sm max-w-md mx-auto">
              Untuk menambahkan spesifikasi, silakan edit kategori "
              {category.nama}" dan centang opsi{" "}
              <span className="font-semibold">
                "Kategori ini perlu Spesifikasi"
              </span>
              .
            </p>
          </div>
        </div>
      )}

      <ModalFormShell
        open={showModal}
        onClose={() => setShowModal(false)}
        allowDismiss={!saving}
        maxWidthClass="max-w-md"
        header={
          <div className="p-6 border-b border-gray-200 dark:border-slate-800 shrink-0 flex items-start justify-between gap-3 bg-white dark:bg-slate-900 rounded-t-xl">
            <div className="min-w-0">
              <h3 className="text-xl font-bold text-gray-800 dark:text-slate-100">
                {editingSubcategory
                  ? "Edit Subkategori"
                  : "Tambah Subkategori Baru"}
              </h3>
              <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                Kategori: {category.nama}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowModal(false)}
              disabled={saving}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors shrink-0 disabled:opacity-50"
              aria-label="Tutup"
            >
              <svg
                className="w-6 h-6 text-gray-600 dark:text-slate-300"
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
        }
        footer={
          <div className="bg-gray-50 dark:bg-slate-800 px-6 py-4 flex items-center justify-end gap-3 border-t border-gray-200 dark:border-slate-800 shrink-0">
            <button
              type="button"
              onClick={() => setShowModal(false)}
              disabled={saving}
              className="px-6 py-2 bg-white dark:bg-slate-900 border-2 border-gray-300 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-100 transition-colors font-semibold disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              form="settings-subcategory-form"
              disabled={saving}
              className="px-6 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all font-semibold disabled:opacity-50"
            >
              {saving ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        }
      >
            <form
              id="settings-subcategory-form"
              onSubmit={handleSave}
              className="p-6"
            >
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">
                  Nama Subkategori
                </label>
                <input
                  type="text"
                  value={formData.nama}
                  onChange={(e) => setFormData({ nama: e.target.value })}
                  placeholder="Contoh: Mata Ayam"
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-slate-100"
                  autoFocus
                  required
                />
              </div>
            </form>
      </ModalFormShell>

      <ModalFormShell
        open={showSpecModal}
        onClose={() => setShowSpecModal(false)}
        allowDismiss={!saving}
        maxWidthClass="max-w-md"
        header={
          <div className="p-6 border-b border-gray-200 dark:border-slate-800 shrink-0 flex items-start justify-between gap-3 bg-white dark:bg-slate-900 rounded-t-xl">
            <div className="min-w-0">
              <h3 className="text-xl font-bold text-gray-800 dark:text-slate-100">
                {editingSpec ? "Edit Spesifikasi" : "Tambah Spesifikasi Baru"}
              </h3>
              <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                Kategori: {category.nama}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowSpecModal(false)}
              disabled={saving}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors shrink-0 disabled:opacity-50"
              aria-label="Tutup"
            >
              <svg
                className="w-6 h-6 text-gray-600 dark:text-slate-300"
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
        }
        footer={
          <div className="bg-gray-50 dark:bg-slate-800 px-6 py-4 flex items-center justify-end gap-3 border-t border-gray-200 dark:border-slate-800 shrink-0">
            <button
              type="button"
              onClick={() => setShowSpecModal(false)}
              disabled={saving}
              className="px-6 py-2 bg-white dark:bg-slate-900 border-2 border-gray-300 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-100 transition-colors font-semibold disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              form="settings-spec-form"
              disabled={saving}
              className="px-6 py-2 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-lg hover:from-purple-600 hover:to-purple-700 transition-all font-semibold disabled:opacity-50"
            >
              {saving ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        }
      >
            <form
              id="settings-spec-form"
              onSubmit={handleSaveSpec}
              className="p-6 space-y-4"
            >
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">
                  Tipe Spesifikasi
                </label>
                <select
                  value={specFormData.tipe_spesifikasi}
                  onChange={(e) =>
                    setSpecFormData({
                      ...specFormData,
                      tipe_spesifikasi: e.target.value,
                    })
                  }
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-slate-800 dark:text-slate-100"
                  required
                >
                  <option value="">Pilih Tipe</option>
                  <option value="size">Ukuran</option>
                  <option value="weight">Gramasi</option>
                  <option value="thickness">Ketebalan</option>
                  <option value="width">Lebar</option>
                  <option value="type">Jenis</option>
                  <option value="other">Lainnya</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">
                  Nilai Spesifikasi
                </label>
                <input
                  type="text"
                  value={specFormData.nilai_spesifikasi}
                  onChange={(e) =>
                    setSpecFormData({
                      ...specFormData,
                      nilai_spesifikasi: e.target.value,
                    })
                  }
                  placeholder="Contoh: A4, 80 gsm, Glossy"
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-slate-800 dark:text-slate-100"
                  autoFocus
                  required
                />
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                  Contoh untuk Ukuran: A4, A3, F4
                  <br />
                  Contoh untuk Gramasi: 80 gsm, 100 gsm, 120 gsm
                </p>
              </div>
            </form>
      </ModalFormShell>

      {/* Notification Toast */}
      {notice && (
        <ToastNotifikasi type={notice.type} message={notice.message} />
      )}

      {confirmDialog?.show && (
        <DialogKonfirmasi
          show={confirmDialog.show}
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmText="Ya, Hapus"
          cancelText="Batal"
          type="danger"
          onConfirm={() => confirmDialog.onConfirm()}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  );
}

function UnitsSection({ autoOpenModal = false }: { autoOpenModal?: boolean }) {
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [formData, setFormData] = useState({ nama: "" });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<NotificationToastProps | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const showMsg = (type: "success" | "error", message: string) => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 2500);
  };

  useEffect(() => {
    loadUnits();
  }, []);

  useEffect(() => {
    if (autoOpenModal) {
      setEditingUnit(null);
      setFormData({ nama: "" });
      setShowModal(true);
    }
  }, [autoOpenModal]);

  const loadUnits = async () => {
    try {
      setLoading(true);
      const data = await getUnits();
      setUnits(data || []);
    } catch (error) {
      console.error("Error loading units:", error);
      showMsg("error", "Gagal memuat data satuan");
    } finally {
      setLoading(false);
    }
  };

  const handleDragEndUnits = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = units.findIndex((u) => u.id === active.id);
      const newIndex = units.findIndex((u) => u.id === over.id);

      const newUnits = arrayMove(units, oldIndex, newIndex);
      setUnits(newUnits);

      // Update urutan_tampilan based on new positions
      const updates = newUnits.map((unit, index) => ({
        id: unit.id,
        urutan_tampilan: index,
      }));

      try {
        await reorderUnits(updates);
      } catch (error: any) {
        showMsg("error", error.message);
        loadUnits();
      }
    }
  };

  const handleAdd = () => {
    setEditingUnit(null);
    setFormData({ nama: "" });
    setShowModal(true);
  };

  const handleEdit = (unit: Unit) => {
    setEditingUnit(unit);
    setFormData({ nama: unit.nama });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nama.trim()) return;

    try {
      setSaving(true);
      const url = editingUnit
        ? `/api/master/units/${editingUnit.id}`
        : "/api/master/units";
      const method = editingUnit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan");

      showMsg("success", data.message);
      setShowModal(false);
      loadUnits();
    } catch (error: any) {
      showMsg("error", error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (unit: Unit) => {
    setConfirmDialog({
      show: true,
      title: "Hapus Satuan",
      message: `Yakin ingin menghapus satuan "${unit.nama}"?`,
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const res = await fetch(`/api/master/units/${unit.id}`, {
            method: "DELETE",
          });
          const data = await res.json();

          if (!res.ok) throw new Error(data.error || "Gagal menghapus");

          showMsg("success", data.message);
          loadUnits();
        } catch (error: any) {
          showMsg("error", error.message);
        }
      },
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-800 dark:text-slate-100">Daftar Satuan</h3>
        <button
          onClick={handleAdd}
          className="px-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all font-semibold shadow-md flex items-center gap-2"
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
          Tambah Satuan
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500 dark:text-slate-400">Memuat data...</div>
      ) : units.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-slate-400">Belum ada satuan</div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEndUnits}
        >
          <SortableContext
            items={units.map((u) => u.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {units.map((unit, index) => (
                <SortableUnit
                  key={unit.id}
                  unit={unit}
                  index={index}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <ModalFormShell
        open={showModal}
        onClose={() => setShowModal(false)}
        allowDismiss={!saving}
        maxWidthClass="max-w-md"
        header={
          <div className="p-6 border-b border-gray-200 dark:border-slate-800 shrink-0 flex items-center justify-between gap-3 bg-white dark:bg-slate-900 rounded-t-xl">
            <h3 className="text-xl font-bold text-gray-800 dark:text-slate-100 min-w-0">
              {editingUnit ? "Edit Satuan" : "Tambah Satuan Baru"}
            </h3>
            <button
              type="button"
              onClick={() => setShowModal(false)}
              disabled={saving}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors shrink-0 disabled:opacity-50"
              aria-label="Tutup"
            >
              <svg
                className="w-6 h-6 text-gray-600 dark:text-slate-300"
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
        }
        footer={
          <div className="bg-gray-50 dark:bg-slate-800 px-6 py-4 flex items-center justify-end gap-3 border-t border-gray-200 dark:border-slate-800 shrink-0">
            <button
              type="button"
              onClick={() => setShowModal(false)}
              disabled={saving}
              className="px-6 py-2 bg-white dark:bg-slate-900 border-2 border-gray-300 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-100 transition-colors font-semibold disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              form="settings-unit-form"
              disabled={saving}
              className="px-6 py-2 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all font-semibold disabled:opacity-50"
            >
              {saving ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        }
      >
            <form id="settings-unit-form" onSubmit={handleSave} className="p-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">
                  Nama Satuan
                </label>
                <input
                  type="text"
                  value={formData.nama}
                  onChange={(e) => setFormData({ nama: e.target.value })}
                  placeholder="Contoh: kg, liter, buah"
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 dark:bg-slate-800 dark:text-slate-100"
                  autoFocus
                  required
                />
              </div>
            </form>
      </ModalFormShell>

      {/* Notification Toast */}
      {notice && (
        <ToastNotifikasi type={notice.type} message={notice.message} />
      )}

      {confirmDialog?.show && (
        <DialogKonfirmasi
          show={confirmDialog.show}
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmText="Ya, Hapus"
          cancelText="Batal"
          type="danger"
          onConfirm={() => confirmDialog.onConfirm()}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  );
}

export { SetupTab };
export default SetupTab;
