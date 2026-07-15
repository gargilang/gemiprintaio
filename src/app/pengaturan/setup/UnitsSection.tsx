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
  getUnitsAction as getUnits,
  reorderUnitsAction as reorderUnits,
} from "../actions";
import { type Unit, SortableUnit } from "./sortables";

// Section daftar satuan. Diekstrak dari PengaturanSetupTab (Fase 6 B1 step 4).

export function UnitsSection({ autoOpenModal = false }: { autoOpenModal?: boolean }) {
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
