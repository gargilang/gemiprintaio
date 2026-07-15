"use client";

import React, { useState, useEffect } from "react";
import ModalFormShell from "@/components/ModalFormShell";
import DialogKonfirmasi from "@/components/DialogKonfirmasi";
import ToastNotifikasi, { NotificationToastProps } from "@/components/ToastNotifikasi";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import {
  getCategoriesAction as getCategories,
  createCategoryAction as createCategory,
  updateCategoryAction as updateCategory,
  deleteCategoryAction as deleteCategory,
  reorderCategoriesAction as reorderCategories,
} from "../actions";
import { type Category, SortableCategory } from "./sortables";

// View daftar kategori master-data. Diekstrak dari PengaturanSetupTab (Fase 6 B1 step 2).

export function CategoriesView({
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
              className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors shrink-0 disabled:opacity-50"
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
              className="px-6 py-2 bg-white dark:bg-slate-900 border-2 border-gray-300 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors font-semibold disabled:opacity-50"
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
