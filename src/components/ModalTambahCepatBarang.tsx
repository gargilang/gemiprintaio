"use client";

import { useState, useEffect } from "react";
import ModalFormShell from "@/components/ModalFormShell";

interface MaterialData {
  nama: string;
  kategori_id: string | null;
  subkategori_id: string | null;
  satuan_dasar: string;
  spesifikasi: string | null;
  deskripsi: string;
  jumlah_stok: number;
  level_stok_minimum: number;
  lacak_inventori_status: number;
  butuh_dimensi_status: number;
  unit_prices: Array<{
    id?: string;
    nama_satuan: string;
    faktor_konversi: number;
    harga_jual: number;
    harga_member: number;
    default_status: number;
    urutan_tampilan: number;
  }>;
}

interface Category {
  id: string;
  nama: string;
  butuh_spesifikasi_status: number;
}

interface Subcategory {
  id: string;
  nama: string;
  kategori_id: string;
}

interface Unit {
  id: string;
  nama: string;
}

interface QuickAddMaterialModalProps {
  show: boolean;
  onClose: () => void;
  onSuccess: () => void;
  categories: Category[];
  subcategories: Subcategory[];
  units: Unit[];
  showNotification: (type: "success" | "error", message: string) => void;
  onCreateMaterial: (data: MaterialData) => Promise<any>;
}

export default function ModalTambahCepatBarang({
  show,
  onClose,
  onSuccess,
  categories,
  subcategories,
  units,
  showNotification,
  onCreateMaterial,
}: QuickAddMaterialModalProps) {
  const [formData, setFormData] = useState({
    nama: "",
    kategori_id: "",
    subkategori_id: "",
    satuan_dasar: "",
    spesifikasi: "",
    harga_jual: 0,
    harga_member: 0,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (show) {
      setFormData({
        nama: "",
        kategori_id: "",
        subkategori_id: "",
        satuan_dasar: "",
        spesifikasi: "",
        harga_jual: 0,
        harga_member: 0,
      });
    }
  }, [show]);

  const filteredSubcategories = subcategories.filter(
    (sub) => sub.kategori_id === formData.kategori_id
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.nama.trim()) {
      showNotification("error", "Nama barang harus diisi!");
      return;
    }

    if (!formData.satuan_dasar.trim()) {
      showNotification("error", "Satuan dasar harus diisi!");
      return;
    }

    try {
      setSaving(true);

      const payload = {
        nama: formData.nama.trim(),
        kategori_id: formData.kategori_id || null,
        subkategori_id: formData.subkategori_id || null,
        satuan_dasar: formData.satuan_dasar.trim(),
        spesifikasi: formData.spesifikasi.trim() || null,
        deskripsi: "",
        jumlah_stok: 0,
        level_stok_minimum: 0,
        lacak_inventori_status: 1,
        butuh_dimensi_status: 0,
        unit_prices: [
          {
            nama_satuan: formData.satuan_dasar.trim(),
            faktor_konversi: 1,
            harga_jual: formData.harga_jual,
            harga_member: formData.harga_member,
            default_status: 1,
            urutan_tampilan: 1,
          },
        ],
      };

      const result = await onCreateMaterial(payload);

      if (!result) {
        throw new Error("Gagal menambahkan barang");
      }

      showNotification("success", "Barang berhasil ditambahkan!");
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error("Error adding material:", error);
      showNotification("error", error.message || "Gagal menambahkan barang");
    } finally {
      setSaving(false);
    }
  };

  const dismissDisabled = saving;

  return (
    <ModalFormShell
      open={show}
      onClose={onClose}
      allowDismiss={!dismissDisabled}
      maxWidthClass="max-w-lg"
      header={
        <div className="bg-gradient-to-r from-emerald-500 to-green-500 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-white/20 dark:bg-slate-900/20 rounded-lg shrink-0">
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
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white truncate">
              Tambah Barang Cepat
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white hover:bg-white/20 rounded-lg p-2 transition-colors shrink-0 disabled:opacity-50"
            disabled={dismissDisabled}
            aria-label="Tutup"
          >
            <svg
              className="w-6 h-6"
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
            onClick={onClose}
            disabled={dismissDisabled}
            className="px-6 py-2 bg-white dark:bg-slate-900 border-2 border-gray-300 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-100 transition-colors font-semibold disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="submit"
            form="quick-add-material-form"
            disabled={dismissDisabled}
            className="px-6 py-2 bg-gradient-to-r from-emerald-500 to-green-500 text-white rounded-lg hover:from-emerald-600 hover:to-green-600 transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      }
    >
      <form
        id="quick-add-material-form"
        onSubmit={handleSubmit}
        className="p-6 space-y-4"
      >
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">
            Nama Barang <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.nama}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, nama: e.target.value }))
            }
            placeholder="Nama barang"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-800 dark:text-slate-100"
            required
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">
              Kategori
            </label>
            <select
              value={formData.kategori_id}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  kategori_id: e.target.value,
                  subkategori_id: "",
                }))
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="">-- Pilih Kategori --</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.nama}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">
              Sub-Kategori
            </label>
            <select
              value={formData.subkategori_id}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  subkategori_id: e.target.value,
                }))
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-800 dark:text-slate-100"
              disabled={!formData.kategori_id}
            >
              <option value="">-- Pilih Sub-Kategori --</option>
              {filteredSubcategories.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.nama}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">
            Satuan Dasar <span className="text-red-500">*</span>
          </label>
          <select
            value={formData.satuan_dasar}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                satuan_dasar: e.target.value,
              }))
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-800 dark:text-slate-100"
            required
          >
            <option value="">-- Pilih Satuan --</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.nama}>
                {unit.nama}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">
            Spesifikasi
          </label>
          <input
            type="text"
            value={formData.spesifikasi}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                spesifikasi: e.target.value,
              }))
            }
            placeholder="Keterangan spesifikasi (opsional)"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">
              Harga Jual
            </label>
            <input
              type="number"
              value={formData.harga_jual}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  harga_jual: parseFloat(e.target.value) || 0,
                }))
              }
              min="0"
              step="100"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">
              Harga Member
            </label>
            <input
              type="number"
              value={formData.harga_member}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  harga_member: parseFloat(e.target.value) || 0,
                }))
              }
              min="0"
              step="100"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
        </div>

        <div className="text-xs text-gray-500 dark:text-slate-400 bg-blue-50 dark:bg-slate-800 p-3 rounded-lg">
          <strong>Info:</strong> Barang akan ditambahkan dengan stok awal 0 dan
          status tracking inventori aktif. Anda bisa edit detail lengkap di
          halaman Data Barang.
        </div>
      </form>
    </ModalFormShell>
  );
}
