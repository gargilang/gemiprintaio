"use client";

import { useState, useEffect } from "react";
import ModalFormShell from "@/components/ModalFormShell";
import DialogKonfirmasi from "@/components/DialogKonfirmasi";
import ToastNotifikasi, { NotificationToastProps } from "@/components/ToastNotifikasi";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import {
  getSubcategoriesAction as getSubcategories,
  getQuickSpecsAction as getQuickSpecs,
  reorderSubcategoriesAction as reorderSubcategories,
  reorderQuickSpecsAction as reorderQuickSpecs,
} from "../actions";
import {
  type Category,
  type Subcategory,
  type QuickSpec,
  SortableSubcategory,
  SortableQuickSpec,
} from "./sortables";

// View subkategori + spesifikasi cepat. Diekstrak dari PengaturanSetupTab (Fase 6 B1 step 3).

export function SubcategoriesView({
  category,
}: {
  category: Category;
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
