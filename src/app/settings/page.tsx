"use client";

import { useState, useEffect } from "react";
import MainShell from "@/components/MainShell";
import { BoxIcon } from "@/components/icons/ContentIcons";
import NotificationToast, {
  NotificationToastProps,
} from "@/components/NotificationToast";

type TabType = "company" | "materials" | "pricing" | "system";

interface Category {
  id: string;
  name: string;
  display_order: number;
}

interface Subcategory {
  id: string;
  category_id: string;
  name: string;
  category_name: string;
  display_order: number;
}

interface Unit {
  id: string;
  name: string;
  display_order: number;
}

interface QuickSpec {
  id: string;
  category_id: string;
  spec_type: string;
  spec_value: string;
  category_name: string;
  display_order: number;
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabType>("materials");

  const tabs = [
    { id: "company" as TabType, label: "Company Info" },
    { id: "materials" as TabType, label: "Master Bahan" },
    { id: "pricing" as TabType, label: "Pricing" },
    { id: "system" as TabType, label: "System" },
  ];

  return (
    <MainShell title="Pengaturan">
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
          {activeTab === "materials" && <MaterialsTab />}
          {activeTab === "pricing" && <PricingTab />}
          {activeTab === "system" && <SystemTab />}
        </div>
      </div>
    </MainShell>
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
              {selectedCategory.name}
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
    name: "",
    needs_specifications: false,
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

  const loadCategories = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/master/categories");
      const data = await res.json();
      if (res.ok) {
        setCategories(data.categories || []);
      } else {
        showMsg("error", data.error || "Gagal memuat kategori");
      }
    } catch (error) {
      console.error("Error loading categories:", error);
      showMsg("error", "Gagal memuat data kategori");
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingCategory(null);
    setFormData({ name: "", needs_specifications: false });
    setShowModal(true);
  };

  const handleEdit = (e: React.MouseEvent, category: Category) => {
    e.stopPropagation(); // Prevent category click
    setEditingCategory(category);
    setFormData({
      name: category.name,
      needs_specifications: (category as any).needs_specifications === 1,
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    try {
      setSaving(true);
      const url = editingCategory
        ? `/api/master/categories/${editingCategory.id}`
        : "/api/master/categories";
      const method = editingCategory ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan");

      showMsg("success", data.message);
      setShowModal(false);
      loadCategories();
    } catch (error: any) {
      showMsg("error", error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, category: Category) => {
    e.stopPropagation(); // Prevent category click

    setConfirmDialog({
      show: true,
      title: "Hapus Kategori",
      message: `Yakin ingin menghapus kategori "${category.name}"?\n\nKategori hanya bisa dihapus jika tidak ada bahan yang menggunakannya.`,
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const res = await fetch(`/api/master/categories/${category.id}`, {
            method: "DELETE",
          });
          const data = await res.json();

          if (!res.ok) throw new Error(data.error || "Gagal menghapus");

          showMsg("success", data.message);
          loadCategories();
        } catch (error: any) {
          showMsg("error", error.message);
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map((category, index) => (
            <div
              key={category.id}
              onClick={() => onCategoryClick(category)}
              className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl p-4 border-2 border-emerald-200 hover:border-emerald-400 flex items-center justify-between group hover:shadow-lg transition-all cursor-pointer text-left"
            >
              <div className="flex items-center gap-3 flex-1">
                <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-green-600 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-md">
                  {index + 1}
                </div>
                <div className="flex-1">
                  <span className="font-semibold text-gray-800 block">
                    {category.name}
                  </span>
                  {(category as any).needs_specifications === 1 && (
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
                <svg
                  className="w-5 h-5 text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity"
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
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                <button
                  onClick={(e) => handleEdit(e, category)}
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
                  onClick={(e) => handleDelete(e, category)}
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
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
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
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
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
                  checked={formData.needs_specifications}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      needs_specifications: e.target.checked,
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
  const [formData, setFormData] = useState({ name: "" });
  const [specFormData, setSpecFormData] = useState({
    spec_type: "",
    spec_value: "",
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
    loadSubcategories();
    if ((category as any).needs_specifications === 1) {
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
      const url = `/api/master/subcategories?category_id=${category.id}`;
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok) {
        setSubcategories(data.subcategories || []);
      } else {
        showMsg("error", data.error || "Gagal memuat subkategori");
      }
    } catch (error) {
      console.error("Error loading subcategories:", error);
      showMsg("error", "Gagal memuat data subkategori");
    } finally {
      setLoading(false);
    }
  };

  const loadSpecs = async () => {
    try {
      setSpecsLoading(true);
      const url = `/api/master/quick-specs?category_id=${category.id}`;
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok) {
        setSpecs(data.specs || []);
      } else {
        showMsg("error", data.error || "Gagal memuat spesifikasi");
      }
    } catch (error) {
      console.error("Error loading specs:", error);
      showMsg("error", "Gagal memuat data spesifikasi");
    } finally {
      setSpecsLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingSubcategory(null);
    setFormData({ name: "" });
    setShowModal(true);
  };

  const handleEdit = (subcategory: Subcategory) => {
    setEditingSubcategory(subcategory);
    setFormData({ name: subcategory.name });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    try {
      setSaving(true);
      const url = editingSubcategory
        ? `/api/master/subcategories/${editingSubcategory.id}`
        : "/api/master/subcategories";
      const method = editingSubcategory ? "PUT" : "POST";

      const payload = {
        name: formData.name,
        ...(!editingSubcategory && { category_id: category.id }),
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
      message: `Yakin ingin menghapus subkategori "${subcategory.name}"?\n\nSubkategori hanya bisa dihapus jika tidak ada bahan yang menggunakannya.`,
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
    setSpecFormData({ spec_type: "", spec_value: "" });
    setShowSpecModal(true);
  };

  const handleEditSpec = (spec: QuickSpec) => {
    setEditingSpec(spec);
    setSpecFormData({ spec_type: spec.spec_type, spec_value: spec.spec_value });
    setShowSpecModal(true);
  };

  const handleSaveSpec = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!specFormData.spec_type.trim() || !specFormData.spec_value.trim())
      return;

    try {
      setSaving(true);
      const url = editingSpec
        ? `/api/master/quick-specs/${editingSpec.id}`
        : "/api/master/quick-specs";
      const method = editingSpec ? "PUT" : "POST";

      const payload = {
        ...specFormData,
        ...(!editingSpec && { category_id: category.id }),
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
      message: `Yakin ingin menghapus spesifikasi "${spec.spec_value}" (${spec.spec_type})?`,
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
            Subkategori: {category.name}
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
      {(category as any).needs_specifications === 1 && (
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {subcategories.map((subcategory) => (
            <div
              key={subcategory.id}
              className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg p-4 border-2 border-blue-200 hover:border-blue-400 flex items-center justify-between group hover:shadow-md transition-all"
            >
              <div className="flex-1 min-w-0">
                <span className="font-semibold text-gray-800 block truncate">
                  {subcategory.name}
                </span>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                <button
                  onClick={() => handleEdit(subcategory)}
                  className="p-2 text-blue-600 hover:bg-blue-100 rounded transition-colors"
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
                  onClick={() => handleDelete(subcategory)}
                  className="p-2 text-red-600 hover:bg-red-100 rounded transition-colors"
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
          ))}
        </div>
      )}

      {/* Quick Specs Section - Only for categories that need specifications */}
      {(category as any).needs_specifications === 1 ? (
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
                  if (!acc[spec.spec_type]) acc[spec.spec_type] = [];
                  acc[spec.spec_type].push(spec);
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
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                    {typeSpecs.map((spec) => (
                      <div
                        key={spec.id}
                        className="bg-white rounded-lg p-2 border border-purple-300 flex items-center justify-between group hover:shadow-md transition-all"
                      >
                        <span className="text-sm font-semibold text-gray-800 truncate">
                          {spec.spec_value}
                        </span>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
                          <button
                            onClick={() => handleEditSpec(spec)}
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
                            onClick={() => handleDeleteSpec(spec)}
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
                    ))}
                  </div>
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
              {category.name}" dan centang opsi{" "}
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
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-800">
                {editingSubcategory
                  ? "Edit Subkategori"
                  : "Tambah Subkategori Baru"}
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Kategori: {category.name}
              </p>
            </div>
            <form onSubmit={handleSave} className="p-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Nama Subkategori
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ name: e.target.value })}
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
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-800">
                {editingSpec ? "Edit Spesifikasi" : "Tambah Spesifikasi Baru"}
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Kategori: {category.name}
              </p>
            </div>
            <form onSubmit={handleSaveSpec} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Tipe Spesifikasi
                </label>
                <select
                  value={specFormData.spec_type}
                  onChange={(e) =>
                    setSpecFormData({
                      ...specFormData,
                      spec_type: e.target.value,
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
                  value={specFormData.spec_value}
                  onChange={(e) =>
                    setSpecFormData({
                      ...specFormData,
                      spec_value: e.target.value,
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
  const [formData, setFormData] = useState({ name: "" });
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
      const res = await fetch("/api/master/units");
      const data = await res.json();
      if (res.ok) {
        setUnits(data.units || []);
      } else {
        showMsg("error", data.error || "Gagal memuat satuan");
      }
    } catch (error) {
      console.error("Error loading units:", error);
      showMsg("error", "Gagal memuat data satuan");
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingUnit(null);
    setFormData({ name: "" });
    setShowModal(true);
  };

  const handleEdit = (unit: Unit) => {
    setEditingUnit(unit);
    setFormData({ name: unit.name });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

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
      message: `Yakin ingin menghapus satuan "${unit.name}"?`,
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
          Tambah Satuan
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">Memuat data...</div>
      ) : units.length === 0 ? (
        <div className="text-center py-8 text-gray-500">Belum ada satuan</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {units.map((unit) => (
            <div
              key={unit.id}
              className="bg-gradient-to-br from-orange-50 to-yellow-50 rounded-lg p-3 border-2 border-orange-200 flex items-center justify-between group hover:shadow-md transition-all"
            >
              <span className="font-semibold text-gray-800">{unit.name}</span>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleEdit(unit)}
                  className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
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
                  onClick={() => handleDelete(unit)}
                  className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
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
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
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
                  value={formData.name}
                  onChange={(e) => setFormData({ name: e.target.value })}
                  placeholder="Contoh: kg, liter, buah"
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
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

function SystemTab() {
  const [backupInfo, setBackupInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<NotificationToastProps | null>(null);

  const loadBackupInfo = async () => {
    try {
      const res = await fetch("/api/backup/status");
      const data = await res.json();
      if (data.success) {
        setBackupInfo(data.backup);
      }
    } catch (error) {
      console.error("Failed to load backup info:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBackupInfo();
    // Refresh backup info every 30 seconds
    const interval = setInterval(loadBackupInfo, 30000);
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
        // Reload backup info
        await loadBackupInfo();
      } else {
        setNotice({
          type: "error",
          message: "❌ Gagal membuat backup",
        });
      }
    } catch (error) {
      setNotice({
        type: "error",
        message: "❌ Error saat membuat backup",
      });
    } finally {
      setCreating(false);
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

      {/* Auto-Backup Status */}
      <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-6 border-2 border-blue-200">
        <div className="flex items-start gap-4">
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
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-800 mb-2">
              Auto-Backup Database
            </h3>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-sm font-semibold text-green-700">
                  Auto-backup aktif (setiap 10 menit)
                </span>
              </div>

              {loading ? (
                <div className="text-sm text-gray-600">
                  Loading backup info...
                </div>
              ) : backupInfo?.exists ? (
                <div className="bg-white rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">File Backup:</span>
                    <span className="font-semibold text-gray-800">
                      gemiprint.db.auto-backup
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Ukuran:</span>
                    <span className="font-semibold text-gray-800">
                      {backupInfo.sizeMB} MB
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Terakhir dibackup:</span>
                    <span className="font-semibold text-gray-800">
                      {backupInfo.lastModifiedFormatted}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-600">
                  Belum ada backup. Backup pertama akan dibuat otomatis.
                </div>
              )}

              <button
                onClick={handleManualBackup}
                disabled={creating}
                className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white px-4 py-3 rounded-lg font-semibold transition-all flex items-center justify-center gap-2"
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
                    <span>Membuat Backup...</span>
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
                    <span>Backup Manual Sekarang</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Info Section */}
      <div className="bg-yellow-50 rounded-xl p-6 border-2 border-yellow-200">
        <div className="flex items-start gap-3">
          <svg
            className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5"
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
          <div className="space-y-2">
            <h4 className="font-bold text-yellow-800">Tentang Auto-Backup</h4>
            <ul className="text-sm text-yellow-700 space-y-1">
              <li>
                ✅ Backup otomatis berjalan setiap 10 menit saat aplikasi
                running
              </li>
              <li>
                ✅ Hanya 1 file backup (di-override setiap backup untuk hemat
                space)
              </li>
              <li>
                ✅ Backup tersimpan di folder database: gemiprint.db.auto-backup
              </li>
              <li>
                ✅ Berlaku di development mode dan production (Tauri desktop
                app)
              </li>
              <li>
                ⚠️ Lokasi backup:{" "}
                <code className="bg-yellow-100 px-1 rounded">
                  database/gemiprint.db.auto-backup
                </code>
              </li>
            </ul>
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
          <li>• Printer Settings</li>
          <li>• Invoice Template</li>
        </ul>
      </div>
    </div>
  );
}
