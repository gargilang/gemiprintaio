"use client";

import { useState, useRef, useEffect } from "react";
import { useClickOutside } from "@/hooks/useClickOutside";
import { createMaterial as createMaterialService } from "@/lib/services/materials-service";

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
}

export default function QuickAddMaterialModal({
  show,
  onClose,
  onSuccess,
  categories,
  subcategories,
  units,
  showNotification,
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

  const modalRef = useRef<HTMLDivElement>(null);
  useClickOutside(modalRef, onClose, show);

  // Handle ESC key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && show) onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [show, onClose]);

  // Reset form when modal opens
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

  // Filter subcategories based on selected category
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
        lacak_inventori_status: 1, // Default track inventory
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

      const result = await createMaterialService(payload);

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

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        ref={modalRef}
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-emerald-500 to-green-500 px-6 py-4 rounded-t-xl">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">
              Tambah Barang Cepat
            </h2>
            <button
              onClick={onClose}
              className="text-white hover:bg-white/20 rounded-lg p-1 transition-colors"
              disabled={saving}
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
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Nama Barang <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.nama}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, nama: e.target.value }))
              }
              placeholder="Nama barang"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              required
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Kategori
              </label>
              <select
                value={formData.kategori_id}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    kategori_id: e.target.value,
                    subkategori_id: "", // Reset subcategory when category changes
                  }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
              <label className="block text-sm font-semibold text-gray-700 mb-1">
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
            <label className="block text-sm font-semibold text-gray-700 mb-1">
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
            <label className="block text-sm font-semibold text-gray-700 mb-1">
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="text-xs text-gray-500 bg-blue-50 p-3 rounded-lg">
            <strong>Info:</strong> Barang akan ditambahkan dengan stok awal 0
            dan status tracking inventori aktif. Anda bisa edit detail lengkap
            di halaman Data Barang.
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-4">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-emerald-500 to-green-500 text-white font-semibold rounded-lg hover:from-emerald-600 hover:to-green-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Menyimpan..." : "Simpan Barang"}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-6 py-3 bg-gray-100 text-gray-700 font-semibold rounded-lg hover:bg-gray-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Batal
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
