"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useClickOutside } from "@/hooks/useClickOutside";
import { BoxIcon } from "@/components/icons/ContentIcons";
import { PriceTagIcon, SparklesIcon } from "@/components/icons/PageIcons";
import NotificationToast, {
  NotificationToastProps,
} from "@/components/NotificationToast";
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getSubcategories,
  createSubcategory,
  updateSubcategory,
  deleteSubcategory,
  getUnits,
  createUnit,
  updateUnit,
  deleteUnit,
  getQuickSpecs,
  createQuickSpec,
  updateQuickSpec,
  deleteQuickSpec,
  getFinishingOptions,
  createFinishingOption,
  updateFinishingOption,
  deleteFinishingOption,
  reorderCategories,
  reorderSubcategories,
  reorderUnits,
  reorderQuickSpecs,
} from "@/lib/services/master-service";
import {
  getFinishingOptions as getFinishingOptionsList,
  createFinishingOption as createFinishingOpt,
  updateFinishingOption as updateFinishingOpt,
  deleteFinishingOption as deleteFinishingOpt,
  reorderFinishingOptions,
} from "@/lib/services/finishing-options-service";
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

type TabType = "company" | "setup" | "system";

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

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<TabType>(
    (tabParam as TabType) || "system"
  );

  const tabs = [
    { id: "system" as TabType, label: "System" },
    { id: "company" as TabType, label: "Company Info" },
    { id: "setup" as TabType, label: "Master Data" },
  ];

  return (
    <div className="space-y-6">
      {/* Tabs Navigation */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-2">
        <div className="flex gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex-1 px-4 py-3 rounded-lg font-semibold transition-all duration-200
                flex items-center justify-center gap-2
                ${
                  activeTab === tab.id
                    ? "bg-gradient-to-r from-gray-500 to-gray-600 text-white shadow-md"
                    : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                }
              `}
            >
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        {activeTab === "company" && <CompanyTab />}
        {activeTab === "setup" && <SetupTab />}
        {activeTab === "system" && <SystemTab />}
      </div>
    </div>
  );
}

function CompanyTab() {
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
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
            />
          </svg>
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-800">
            Company Information
          </h2>
          <p className="text-sm text-gray-500">
            Informasi perusahaan dan kontak
          </p>
        </div>
      </div>

      <div className="bg-gray-50 rounded-xl p-6 border-2 border-gray-200">
        <p className="text-gray-600">
          <svg
            className="w-5 h-5 inline mr-2 text-orange-500"
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
          Section ini akan berisi form untuk:
        </p>
        <ul className="mt-4 space-y-2 text-gray-600 ml-6">
          <li>• Nama Perusahaan</li>
          <li>• Alamat Lengkap</li>
          <li>• No. Telepon & Email</li>
          <li>• NPWP / Tax ID</li>
          <li>• Logo Upload</li>
        </ul>
      </div>
    </div>
  );
}

function SetupTab() {
  type SetupSubTab = "materials" | "pricing" | "finishing" | "rollsizes";
  const searchParams = useSearchParams();
  const subtabParam = searchParams.get("subtab");
  const [activeSetupTab, setActiveSetupTab] = useState<SetupSubTab>(
    (subtabParam as SetupSubTab) || "pricing"
  );

  const setupTabs = [
    {
      id: "pricing" as SetupSubTab,
      label: "Pricing",
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
      <div className="bg-gray-50 rounded-xl p-2 border border-gray-200">
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
                      : "bg-white text-gray-600 hover:bg-gray-100"
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
      </div>
    </div>
  );
}

function MaterialsTab() {
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
          <h2 className="text-2xl font-bold text-gray-800">
            Master Kategori Bahan
          </h2>
          <p className="text-sm text-gray-500">
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
              ? "bg-emerald-100 text-emerald-700 font-semibold"
              : "text-gray-600 hover:bg-gray-100"
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
            <span className="px-3 py-1.5 bg-blue-100 text-blue-700 font-semibold rounded-lg">
              {selectedCategory.nama}
            </span>
          </>
        )}
      </div>

      {/* Content Area */}
      <div className="bg-gray-50 rounded-xl p-6 border-2 border-gray-200 min-h-[500px] min-w-[800px]">
        {view === "categories" ? (
          <CategoriesView onCategoryClick={handleCategoryClick} />
        ) : (
          <SubcategoriesView
            category={selectedCategory!}
            onBack={handleBackToCategories}
          />
        )}
      </div>

      {/* Units Section - Always Visible */}
      <UnitsSection />
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
      className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl p-4 border-2 border-emerald-200 hover:border-emerald-400 flex items-center justify-between group hover:shadow-lg transition-all text-left"
    >
      <div className="flex items-center gap-3 flex-1">
        {/* Drag Handle */}
        <button
          {...attributes}
          {...listeners}
          className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-emerald-600 hover:bg-emerald-100 rounded cursor-grab active:cursor-grabbing transition-colors"
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
          <span className="font-semibold text-gray-800 block">
            {category.nama}
          </span>
          {(category as any).butuh_spesifikasi_status === 1 && (
            <span className="text-xs text-emerald-600 flex items-center gap-1 mt-1">
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
          className="w-5 h-5 text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
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
          className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
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
          className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
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
}: {
  onCategoryClick: (category: Category) => void;
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

  // Click outside to close modal
  const categoryModalRef = useRef<HTMLDivElement>(null);
  useClickOutside(categoryModalRef, () => setShowModal(false), showModal);

  const showMsg = (type: "success" | "error", message: string) => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 2500);
  };

  useEffect(() => {
    loadCategories();
  }, []);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle ESC key to close modals
  useEffect(() => {
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showModal) {
          setShowModal(false);
        } else if (confirmDialog?.show) {
          setConfirmDialog(null);
        }
      }
    };

    window.addEventListener("keydown", handleEscKey);
    return () => window.removeEventListener("keydown", handleEscKey);
  }, [showModal, confirmDialog]);

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
        <h3 className="text-lg font-bold text-gray-800">
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
        <div className="text-center py-12 text-gray-500">Memuat data...</div>
      ) : categories.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
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

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div
            ref={categoryModalRef}
            className="bg-white rounded-xl shadow-2xl w-full max-w-md"
          >
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-800">
                {editingCategory ? "Edit Kategori" : "Tambah Kategori Baru"}
              </h3>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Nama Kategori
                </label>
                <input
                  type="text"
                  value={formData.nama}
                  onChange={(e) =>
                    setFormData({ ...formData, nama: e.target.value })
                  }
                  placeholder="Contoh: Finishing"
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  autoFocus
                  required
                />
              </div>
              <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
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
                  className="w-5 h-5 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                />
                <label
                  htmlFor="needs_specifications"
                  className="flex-1 text-sm text-gray-700 cursor-pointer"
                >
                  <span className="font-semibold block">
                    Kategori ini perlu Spesifikasi
                  </span>
                  <span className="text-xs text-gray-500">
                    Misal: Kertas perlu ukuran & gramasi, Finishing perlu jenis
                    (Glossy/Doff)
                  </span>
                </label>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-lg hover:from-emerald-600 hover:to-green-700 transition-all font-semibold disabled:opacity-50"
                >
                  {saving ? "Menyimpan..." : "Simpan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Notification Toast */}
      {notice && (
        <NotificationToast type={notice.type} message={notice.message} />
      )}

      {/* Confirm Dialog */}
      {confirmDialog?.show && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-red-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-gray-800">
                  {confirmDialog.title}
                </h3>
              </div>
            </div>

            <div className="p-6">
              <p className="text-gray-600 text-base leading-relaxed whitespace-pre-line">
                {confirmDialog.message}
              </p>
            </div>

            <div className="p-6 border-t border-gray-200 flex gap-3">
              <button
                onClick={() => setConfirmDialog(null)}
                className="flex-1 px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-all font-semibold"
              >
                Batal
              </button>
              <button
                onClick={confirmDialog.onConfirm}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl hover:shadow-lg hover:from-red-600 hover:to-red-700 transition-all font-semibold"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
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
      className="bg-blue-50 rounded-lg p-3 border-2 border-blue-200 flex items-center justify-between group hover:shadow-md transition-all"
    >
      <div className="flex items-center gap-2 flex-1">
        {/* Drag Handle */}
        <button
          {...attributes}
          {...listeners}
          className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-100 rounded cursor-grab active:cursor-grabbing transition-colors"
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
        <span className="w-8 h-8 bg-blue-500 text-white rounded-lg flex items-center justify-center font-bold text-sm">
          {index + 1}
        </span>

        {/* Subcategory Name */}
        <span className="text-gray-800 font-semibold flex-1">
          {subcategory.nama}
        </span>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onEdit(subcategory)}
          className="p-1.5 text-blue-600 hover:bg-blue-100 rounded transition-colors"
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
          className="p-1.5 text-red-600 hover:bg-red-100 rounded transition-colors"
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
      className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-3 border-2 border-orange-200 flex items-center justify-between group hover:shadow-md transition-all"
    >
      <div className="flex items-center gap-2 flex-1">
        {/* Drag Handle */}
        <button
          {...attributes}
          {...listeners}
          className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-orange-600 hover:bg-orange-100 rounded cursor-grab active:cursor-grabbing transition-colors"
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
        <span className="font-semibold text-gray-800 flex-1">{unit.nama}</span>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onEdit(unit)}
          className="p-1.5 text-blue-600 hover:bg-blue-100 rounded transition-colors"
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
          className="p-1.5 text-red-600 hover:bg-red-100 rounded transition-colors"
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
      className="bg-white rounded-lg p-2 border border-purple-300 flex items-center justify-between group hover:shadow-md transition-all"
    >
      <div className="flex items-center gap-2 flex-1">
        {/* Drag Handle */}
        <button
          {...attributes}
          {...listeners}
          className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-purple-600 hover:bg-purple-100 rounded cursor-grab active:cursor-grabbing transition-colors"
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
        <span className="text-sm font-semibold text-gray-800 truncate flex-1">
          {spec.nilai_spesifikasi}
        </span>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
        <button
          onClick={() => onEdit(spec)}
          className="p-1 text-blue-600 hover:bg-blue-100 rounded transition-colors"
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
          className="p-1 text-red-600 hover:bg-red-100 rounded transition-colors"
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

  // Click outside to close modals
  const subcategoryModalRef = useRef<HTMLDivElement>(null);
  const specModalRef = useRef<HTMLDivElement>(null);
  useClickOutside(subcategoryModalRef, () => setShowModal(false), showModal);
  useClickOutside(specModalRef, () => setShowSpecModal(false), showSpecModal);

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

  // Handle ESC key to close modals
  useEffect(() => {
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showModal) {
          setShowModal(false);
        } else if (showSpecModal) {
          setShowSpecModal(false);
        } else if (confirmDialog?.show) {
          setConfirmDialog(null);
        }
      }
    };

    window.addEventListener("keydown", handleEscKey);
    return () => window.removeEventListener("keydown", handleEscKey);
  }, [showModal, showSpecModal, confirmDialog]);

  const loadSubcategories = async () => {
    try {
      setLoading(true);
      const { getSubcategories: getSubcats } = await import(
        "@/lib/services/master-service"
      );
      const data = await getSubcats(category.id);
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
      const { getQuickSpecs } = await import("@/lib/services/master-service");
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
          <h3 className="text-lg font-bold text-gray-800">
            Subkategori: {category.nama}
          </h3>
          <p className="text-sm text-gray-500 mt-1">
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
        <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <svg
            className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5"
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
            <p className="font-semibold text-amber-800">
              Kategori ini memerlukan Spesifikasi
            </p>
            <p className="text-amber-700 mt-1">
              Anda bisa mengelola spesifikasi (ukuran, gramasi, dll) di section
              "Kelola Spesifikasi" di bawah.
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Memuat data...</div>
      ) : subcategories.length === 0 ? (
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
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
          <p className="text-gray-600 font-semibold">Belum ada subkategori</p>
          <p className="text-gray-500 text-sm mt-1">
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
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <svg
                  className="w-5 h-5 text-purple-600"
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
              <p className="text-sm text-gray-500 mt-1">
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
            <div className="text-center py-8 text-gray-500">
              Memuat spesifikasi...
            </div>
          ) : specs.length === 0 ? (
            <div className="text-center py-8 bg-purple-50 rounded-lg border-2 border-purple-200">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-purple-100 rounded-full mb-4">
                <svg
                  className="w-8 h-8 text-purple-400"
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
              <p className="text-gray-600 font-semibold">
                Belum ada spesifikasi
              </p>
              <p className="text-gray-500 text-sm mt-1">
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
                  className="bg-purple-50 rounded-lg p-4 border-2 border-purple-200"
                >
                  <h4 className="font-bold text-purple-800 mb-3 capitalize">
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
        /* Info jika kategori tidak memerlukan spesifikasi */
        <div className="mt-8 pt-6 border-t-2 border-gray-300">
          <div className="bg-gray-50 border-2 border-gray-200 rounded-lg p-6 text-center">
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
            <h3 className="text-lg font-bold text-gray-700 mb-2">
              Kategori ini tidak memerlukan spesifikasi
            </h3>
            <p className="text-gray-600 text-sm max-w-md mx-auto">
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

      {/* Modal Subkategori */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div
            ref={subcategoryModalRef}
            className="bg-white rounded-xl shadow-2xl w-full max-w-md"
          >
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-800">
                {editingSubcategory
                  ? "Edit Subkategori"
                  : "Tambah Subkategori Baru"}
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Kategori: {category.nama}
              </p>
            </div>
            <form onSubmit={handleSave} className="p-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Nama Subkategori
                </label>
                <input
                  type="text"
                  value={formData.nama}
                  onChange={(e) => setFormData({ nama: e.target.value })}
                  placeholder="Contoh: Mata Ayam"
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                  required
                />
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all font-semibold disabled:opacity-50"
                >
                  {saving ? "Menyimpan..." : "Simpan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Spesifikasi */}
      {showSpecModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div
            ref={specModalRef}
            className="bg-white rounded-xl shadow-2xl w-full max-w-md"
          >
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-800">
                {editingSpec ? "Edit Spesifikasi" : "Tambah Spesifikasi Baru"}
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Kategori: {category.nama}
              </p>
            </div>
            <form onSubmit={handleSaveSpec} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
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
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
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
                <label className="block text-sm font-semibold text-gray-700 mb-2">
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
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  autoFocus
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Contoh untuk Ukuran: A4, A3, F4
                  <br />
                  Contoh untuk Gramasi: 80 gsm, 100 gsm, 120 gsm
                </p>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowSpecModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-lg hover:from-purple-600 hover:to-purple-700 transition-all font-semibold disabled:opacity-50"
                >
                  {saving ? "Menyimpan..." : "Simpan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Notification Toast */}
      {notice && (
        <NotificationToast type={notice.type} message={notice.message} />
      )}

      {/* Confirm Dialog */}
      {confirmDialog?.show && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-red-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-gray-800">
                  {confirmDialog.title}
                </h3>
              </div>
            </div>

            <div className="p-6">
              <p className="text-gray-600 text-base leading-relaxed whitespace-pre-line">
                {confirmDialog.message}
              </p>
            </div>

            <div className="p-6 border-t border-gray-200 flex gap-3">
              <button
                onClick={() => setConfirmDialog(null)}
                className="flex-1 px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-all font-semibold"
              >
                Batal
              </button>
              <button
                onClick={confirmDialog.onConfirm}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl hover:shadow-lg hover:from-red-600 hover:to-red-700 transition-all font-semibold"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UnitsSection() {
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

  // Click outside to close modal
  const unitModalRef = useRef<HTMLDivElement>(null);
  useClickOutside(unitModalRef, () => setShowModal(false), showModal);

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

  // Handle ESC key to close modals
  useEffect(() => {
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showModal) {
          setShowModal(false);
        } else if (confirmDialog?.show) {
          setConfirmDialog(null);
        }
      }
    };

    window.addEventListener("keydown", handleEscKey);
    return () => window.removeEventListener("keydown", handleEscKey);
  }, [showModal, confirmDialog]);

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
        <h3 className="text-lg font-bold text-gray-800">Daftar Satuan</h3>
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
        <div className="text-center py-8 text-gray-500">Memuat data...</div>
      ) : units.length === 0 ? (
        <div className="text-center py-8 text-gray-500">Belum ada satuan</div>
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

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div
            ref={unitModalRef}
            className="bg-white rounded-xl shadow-2xl w-full max-w-md"
          >
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-800">
                {editingUnit ? "Edit Satuan" : "Tambah Satuan Baru"}
              </h3>
            </div>
            <form onSubmit={handleSave} className="p-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Nama Satuan
                </label>
                <input
                  type="text"
                  value={formData.nama}
                  onChange={(e) => setFormData({ nama: e.target.value })}
                  placeholder="Contoh: kg, liter, buah"
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  autoFocus
                  required
                />
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all font-semibold disabled:opacity-50"
                >
                  {saving ? "Menyimpan..." : "Simpan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Notification Toast */}
      {notice && (
        <NotificationToast type={notice.type} message={notice.message} />
      )}

      {/* Confirm Dialog */}
      {confirmDialog?.show && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-red-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-gray-800">
                  {confirmDialog.title}
                </h3>
              </div>
            </div>

            <div className="p-6">
              <p className="text-gray-600 text-base leading-relaxed whitespace-pre-line">
                {confirmDialog.message}
              </p>
            </div>

            <div className="p-6 border-t border-gray-200 flex gap-3">
              <button
                onClick={() => setConfirmDialog(null)}
                className="flex-1 px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-all font-semibold"
              >
                Batal
              </button>
              <button
                onClick={confirmDialog.onConfirm}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl hover:shadow-lg hover:from-red-600 hover:to-red-700 transition-all font-semibold"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PricingTab() {
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
          <h2 className="text-2xl font-bold text-gray-800">Pricing Settings</h2>
          <p className="text-sm text-gray-500">Pengaturan harga dan pajak</p>
        </div>
      </div>

      <div className="bg-gray-50 rounded-xl p-6 border-2 border-gray-200">
        <p className="text-gray-600 flex items-start gap-2">
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
        <ul className="mt-4 space-y-2 text-gray-600 ml-6">
          <li>• Default Markup/Margin (%)</li>
          <li>• Member Discount (%)</li>
          <li>• Tax Rate / PPN (%)</li>
          <li>• Currency Format</li>
        </ul>
      </div>
    </div>
  );
}

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
            <h2 className="text-2xl font-bold text-gray-800">Ukuran Roll</h2>
            <p className="text-sm text-gray-500">
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
              ? "bg-green-50 border-green-300 text-green-800"
              : "bg-red-50 border-red-300 text-red-800"
          }`}
        >
          {notice.message}
        </div>
      )}

      {/* Add New Form */}
      {isAdding && (
        <div className="bg-blue-50 border-2 border-blue-300 rounded-xl p-4">
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
              className="flex-1 px-4 py-2 border-2 border-blue-300 rounded-lg focus:outline-none focus:border-blue-600"
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
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-semibold"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {/* Roll Sizes List */}
      <div className="space-y-2">
        {rollSizes.length === 0 ? (
          <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-xl">
            Belum ada roll size
          </div>
        ) : (
          rollSizes.map((size, index) => (
            <div
              key={index}
              className="bg-white border-2 border-gray-200 rounded-xl p-4 hover:border-blue-400 transition-all"
            >
              <div className="flex items-center gap-3">
                {/* Reorder buttons */}
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0}
                    className="p-1 text-gray-400 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed"
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
                    className="p-1 text-gray-400 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed"
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
                    className="flex-1 px-3 py-2 border-2 border-blue-300 rounded-lg focus:outline-none focus:border-blue-600"
                    autoFocus
                  />
                ) : (
                  <div className="flex-1 font-semibold text-gray-800">
                    {size} meter
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2">
                  {editingIndex === index ? (
                    <>
                      <button
                        onClick={() => handleUpdate(index)}
                        className="px-3 py-1 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm font-semibold"
                      >
                        Simpan
                      </button>
                      <button
                        onClick={() => {
                          setEditingIndex(null);
                          setEditingValue("");
                        }}
                        className="px-3 py-1 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm font-semibold"
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
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
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
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                        title="Delete"
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
            <h2 className="text-2xl font-bold text-gray-800">Opsi Finishing</h2>
            <p className="text-sm text-gray-500">
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
        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4">
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
              className="flex-1 px-4 py-2 border-2 border-amber-300 rounded-lg focus:outline-none focus:border-amber-700"
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
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-semibold"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {/* Options List */}
      <div className="space-y-2">
        {loading ? (
          <div className="text-center py-8 text-gray-500">Loading...</div>
        ) : options.length === 0 ? (
          <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-xl">
            Belum ada opsi finishing
          </div>
        ) : (
          options.map((option, index) => (
            <div
              key={option.id}
              className="bg-white border-2 border-gray-200 rounded-xl p-4 hover:border-amber-400 transition-all"
            >
              <div className="flex items-center gap-3">
                {/* Reorder buttons */}
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0}
                    className="p-1 text-gray-400 hover:text-amber-700 disabled:opacity-30 disabled:cursor-not-allowed"
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
                    className="p-1 text-gray-400 hover:text-amber-700 disabled:opacity-30 disabled:cursor-not-allowed"
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
                    className="flex-1 px-3 py-2 border-2 border-amber-300 rounded-lg focus:outline-none focus:border-amber-700"
                    autoFocus
                  />
                ) : (
                  <div className="flex-1 font-semibold text-gray-800">
                    {option.nama}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2">
                  {editingId === option.id ? (
                    <>
                      <button
                        onClick={() => handleUpdate(option.id)}
                        className="px-3 py-1 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm font-semibold"
                      >
                        Simpan
                      </button>
                      <button
                        onClick={() => {
                          setEditingId(null);
                          setEditingNama("");
                        }}
                        className="px-3 py-1 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm font-semibold"
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
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
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
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                        title="Delete"
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
            notice.type === "success" ? "bg-green-500" : "bg-red-500"
          } text-white font-semibold z-50`}
        >
          {notice.message}
        </div>
      )}
    </div>
  );
}

function SystemTab() {
  const [backupStatus, setBackupStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [updatingInterval, setUpdatingInterval] = useState(false);
  const [intervalValue, setIntervalValue] = useState<number>(10);
  const [intervalUnit, setIntervalUnit] = useState<string>("Menit");
  const [notice, setNotice] = useState<NotificationToastProps | null>(null);

  // Sync state
  const [syncStatus, setSyncStatus] = useState<any>(null);
  const [syncLoading, setSyncLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [updatingSyncInterval, setUpdatingSyncInterval] = useState(false);
  const [syncIntervalValue, setSyncIntervalValue] = useState<number>(20);
  const [syncIntervalUnit, setSyncIntervalUnit] = useState<string>("Menit");

  const intervalUnits = [
    { label: "Detik", multiplier: 1000 },
    { label: "Menit", multiplier: 60000 },
    { label: "Jam", multiplier: 3600000 },
  ];

  const loadBackupStatus = async () => {
    try {
      const res = await fetch("/api/backup/status");
      const data = await res.json();
      if (data.success) {
        setBackupStatus(data.status);

        // Set current interval to input
        const currentMs = data.status?.currentInterval || 600000;
        if (currentMs >= 3600000) {
          setIntervalValue(Math.floor(currentMs / 3600000));
          setIntervalUnit("Jam");
        } else if (currentMs >= 60000) {
          setIntervalValue(Math.floor(currentMs / 60000));
          setIntervalUnit("Menit");
        } else {
          setIntervalValue(Math.floor(currentMs / 1000));
          setIntervalUnit("Detik");
        }
      }
    } catch (error) {
      console.error("Failed to load backup status:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadSyncStatus = async () => {
    try {
      const res = await fetch("/api/sync/manual");
      const data = await res.json();
      if (data.success) {
        setSyncStatus(data.status);
      }
    } catch (error) {
      console.error("Failed to load sync status:", error);
    } finally {
      setSyncLoading(false);
    }
  };

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync/manual", { method: "POST" });
      const data = await res.json();

      if (data.success) {
        setNotice({
          type: "success",
          message: `✅ Sync berhasil! ${data.result.synced} record`,
        });
        await loadSyncStatus();
      } else {
        setNotice({
          type: "error",
          message: data.error || "Gagal sync",
        });
      }
    } catch (error) {
      setNotice({
        type: "error",
        message: "Error saat sync",
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
      // Stop current auto-sync
      await fetch("/api/sync/auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop" }),
      });

      // Start with new interval
      const res = await fetch("/api/sync/auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", intervalMinutes: intervalMs }),
      });

      const data = await res.json();

      if (data.success) {
        setNotice({
          type: "success",
          message: `Interval sync diubah menjadi ${syncIntervalValue} ${syncIntervalUnit.toLowerCase()}`,
        });
        await loadSyncStatus();
      } else {
        setNotice({
          type: "error",
          message: "Gagal mengubah interval",
        });
      }
    } catch (error) {
      setNotice({
        type: "error",
        message: "Error saat mengubah interval",
      });
    } finally {
      setUpdatingSyncInterval(false);
      setTimeout(() => setNotice(null), 3000);
    }
  };

  useEffect(() => {
    loadBackupStatus();
    loadSyncStatus();
    const interval = setInterval(() => {
      loadBackupStatus();
      loadSyncStatus();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleManualBackup = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/backup/create", { method: "POST" });
      const data = await res.json();

      if (data.success) {
        setNotice({
          type: "success",
          message: "✅ Backup berhasil dibuat!",
        });
        await loadBackupStatus();
      } else {
        setNotice({
          type: "error",
          message: "Gagal membuat backup",
        });
      }
    } catch (error) {
      setNotice({
        type: "error",
        message: "Error saat membuat backup",
      });
    } finally {
      setCreating(false);
      setTimeout(() => setNotice(null), 3000);
    }
  };

  const handleUpdateInterval = async () => {
    const unit = intervalUnits.find((u) => u.label === intervalUnit);
    if (!unit) return;

    const intervalMs = intervalValue * unit.multiplier;

    if (intervalMs < 30000) {
      setNotice({
        type: "error",
        message: "Minimal 30 detik",
      });
      setTimeout(() => setNotice(null), 3000);
      return;
    }

    if (intervalMs > 86400000) {
      setNotice({
        type: "error",
        message: "Maksimal 24 jam",
      });
      setTimeout(() => setNotice(null), 3000);
      return;
    }

    setUpdatingInterval(true);
    try {
      const res = await fetch("/api/backup/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval: intervalMs }),
      });
      const data = await res.json();

      if (data.success) {
        setNotice({
          type: "success",
          message: `Interval diubah menjadi ${intervalValue} ${intervalUnit.toLowerCase()}`,
        });
        await loadBackupStatus();
      } else {
        setNotice({
          type: "error",
          message: "Gagal mengubah interval",
        });
      }
    } catch (error) {
      setNotice({
        type: "error",
        message: "Error saat mengubah interval",
      });
    } finally {
      setUpdatingInterval(false);
      setTimeout(() => setNotice(null), 3000);
    }
  };

  return (
    <div className="space-y-6">
      {notice && (
        <NotificationToast type={notice.type} message={notice.message} />
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
          <h2 className="text-2xl font-bold text-gray-800">System Settings</h2>
          <p className="text-sm text-gray-500">
            Pengaturan sistem dan database
          </p>
        </div>
      </div>

      {/* Auto-Backup Settings - Compact */}
      <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-6 border-2 border-blue-200">
        <div className="flex items-center justify-between gap-6">
          {/* Left: Title & Status */}
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-500 rounded-xl">
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
                  d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                Auto-Backup Database
                <div
                  className={`w-2 h-2 rounded-full ${
                    backupStatus?.isRunning
                      ? "bg-green-500 animate-pulse"
                      : "bg-gray-400"
                  }`}
                ></div>
              </h3>
              <p className="text-sm text-gray-600">
                {loading
                  ? "Loading..."
                  : backupStatus?.isRunning
                  ? `Aktif • Setiap ${backupStatus.currentIntervalMinutes} menit`
                  : "Tidak aktif"}
              </p>
            </div>
          </div>

          {/* Middle: Interval Control */}
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              value={intervalValue}
              onChange={(e) => setIntervalValue(parseInt(e.target.value) || 1)}
              className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-center font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={updatingInterval}
            />
            <select
              value={intervalUnit}
              onChange={(e) => setIntervalUnit(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={updatingInterval}
            >
              {intervalUnits.map((unit) => (
                <option key={unit.label} value={unit.label}>
                  {unit.label}
                </option>
              ))}
            </select>
            <button
              onClick={handleUpdateInterval}
              disabled={updatingInterval}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded-lg font-semibold transition-all"
            >
              {updatingInterval ? "..." : "Terapkan"}
            </button>
          </div>

          {/* Right: Manual Backup Button */}
          <button
            onClick={handleManualBackup}
            disabled={creating}
            className="px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white rounded-lg font-semibold transition-all flex items-center gap-2 whitespace-nowrap"
          >
            {creating ? (
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
                <span>Backing up...</span>
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
                    d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
                  />
                </svg>
                <span>Backup Sekarang</span>
              </>
            )}
          </button>
        </div>

        {/* Info Bar - Minimal */}
        <div className="mt-4 pt-4 border-t border-blue-200 text-xs text-gray-600 flex items-center justify-between">
          <span>💡 Minimal: 30 detik • Rekomendasi: 5-10 menit</span>
          <span className="text-blue-600 font-semibold">
            Lokasi: database/gemiprint.db.auto-backup
          </span>
        </div>
      </div>

      {/* Cloud Sync Settings */}
      <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-6 border-2 border-green-200">
        <div className="flex items-center justify-between gap-6">
          {/* Left: Title & Status */}
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-500 rounded-xl">
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
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                Cloud Sync (Supabase)
                <div
                  className={`w-2 h-2 rounded-full ${
                    syncStatus?.cloudBackup === "connected"
                      ? "bg-green-500 animate-pulse"
                      : syncStatus?.cloudBackup === "syncing"
                      ? "bg-yellow-500 animate-pulse"
                      : "bg-gray-400"
                  }`}
                ></div>
              </h3>
              <p className="text-sm text-gray-600">
                {syncLoading ? (
                  "Loading..."
                ) : syncStatus?.cloudBackup === "connected" ? (
                  <>
                    ✅ Terhubung •{" "}
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
                  "⏳ Sedang sync..."
                ) : (
                  "⚠️ Tidak terhubung"
                )}
              </p>
              {syncStatus?.pendingChanges > 0 && (
                <p className="text-xs text-orange-600 font-semibold mt-1">
                  📝 {syncStatus.pendingChanges} perubahan pending
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
              className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-center font-semibold focus:outline-none focus:ring-2 focus:ring-green-500"
              disabled={updatingSyncInterval}
            />
            <select
              value={syncIntervalUnit}
              onChange={(e) => setSyncIntervalUnit(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg font-semibold focus:outline-none focus:ring-2 focus:ring-green-500"
              disabled={updatingSyncInterval}
            >
              <option value="Menit">Menit</option>
              <option value="Jam">Jam</option>
            </select>
            <button
              onClick={handleUpdateSyncInterval}
              disabled={updatingSyncInterval}
              className="px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white rounded-lg font-semibold transition-all"
            >
              {updatingSyncInterval ? "..." : "Terapkan"}
            </button>
          </div>

          {/* Right: Manual Sync Button */}
          <button
            onClick={handleManualSync}
            disabled={syncing}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-400 text-white rounded-lg font-semibold transition-all flex items-center gap-2 whitespace-nowrap"
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
                <span>Syncing...</span>
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
                <span>Sync Sekarang</span>
              </>
            )}
          </button>
        </div>

        {/* Info Bar */}
        <div className="mt-4 pt-4 border-t border-green-200 text-xs text-gray-600 flex items-center justify-between">
          <span>
            💡 Minimal: 5 menit • Rekomendasi: 15-20 menit • Auto-sync berjalan
            di background
          </span>
          <span className="text-green-600 font-semibold">
            Data local akan otomatis sync ke cloud ☁️
          </span>
        </div>
      </div>

      {/* Printer Settings - Coming Soon */}
      <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-6 border-2 border-purple-200">
        <div className="flex items-center gap-4 mb-4">
          <div className="p-3 bg-purple-500 rounded-xl">
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
            <h3 className="text-lg font-bold text-gray-800">
              Printer Settings
            </h3>
            <p className="text-sm text-gray-600">
              Print receipt termal & dokumen (Invoice, PO, Surat Jalan, dll)
            </p>
          </div>
        </div>

        <div className="bg-white/80 rounded-lg p-5 border-2 border-purple-300">
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
              <h4 className="font-bold text-gray-800 mb-2">
                🚧 Fitur Dalam Pengembangan
              </h4>
              <p className="text-sm text-gray-700 mb-3">
                <strong>Catatan Teknis:</strong> Browser tidak dapat mendeteksi
                printer yang terinstall di komputer karena security
                restrictions.
              </p>
              <p className="text-sm text-gray-700 mb-3">
                Untuk saat ini, aplikasi ini menggunakan{" "}
                <strong>system print dialog</strong> default browser (
                <code className="px-1 py-0.5 bg-gray-200 rounded text-xs">
                  window.print()
                </code>
                ). Anda bisa memilih printer dari dialog yang muncul.
              </p>
              <div className="bg-purple-100 rounded-lg p-3 border border-purple-200">
                <p className="text-sm text-purple-900 font-semibold mb-2">
                  🎯 Rencana Implementasi:
                </p>
                <ul className="text-sm text-purple-800 space-y-1 ml-4">
                  <li>• Deteksi printer terinstall otomatis</li>
                  <li>• Pilih printer default untuk receipt & dokumen</li>
                  <li>• Auto-print tanpa dialog (untuk thermal printer)</li>
                  <li>• Print queue management</li>
                </ul>
                <p className="text-xs text-purple-700 mt-3">
                  ⚡ Fitur ini akan tersedia setelah aplikasi di-wrap dengan{" "}
                  <strong>Tauri</strong> atau <strong>Electron</strong> yang
                  memiliki akses ke native printer API.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Future Features */}
      <div className="bg-gray-50 rounded-xl p-6 border-2 border-gray-200">
        <p className="text-gray-600 flex items-start gap-2 mb-4">
          <svg
            className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5"
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
          <span className="font-semibold">Fitur lainnya (coming soon):</span>
        </p>
        <ul className="space-y-2 text-gray-600 ml-7">
          <li>• Restore Database dari backup</li>
          <li>• Export Data (CSV/Excel)</li>
          <li>• Invoice Template</li>
          <li>• Test Print untuk semua jenis dokumen</li>
        </ul>
      </div>
    </div>
  );
}
