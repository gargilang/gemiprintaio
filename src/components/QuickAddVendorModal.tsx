"use client";

import { useState, useRef, useEffect } from "react";
import { useClickOutside } from "@/hooks/useClickOutside";

interface QuickAddVendorModalProps {
  show: boolean;
  onClose: () => void;
  onSuccess: () => void;
  showNotification: (type: "success" | "error", message: string) => void;
}

export default function QuickAddVendorModal({
  show,
  onClose,
  onSuccess,
  showNotification,
}: QuickAddVendorModalProps) {
  const [formData, setFormData] = useState({
    nama_perusahaan: "",
    email: "",
    telepon: "",
    alamat: "",
    kontak_person: "",
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
        nama_perusahaan: "",
        email: "",
        telepon: "",
        alamat: "",
        kontak_person: "",
      });
    }
  }, [show]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.nama_perusahaan.trim()) {
      showNotification("error", "Nama perusahaan harus diisi!");
      return;
    }

    if (!formData.telepon.trim()) {
      showNotification("error", "Nomor telepon harus diisi!");
      return;
    }

    try {
      setSaving(true);

      const payload = {
        ...formData,
        aktif_status: 1, // Default aktif
        ketentuan_bayar: "",
        catatan: "",
      };

      const res = await fetch("/api/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Gagal menambahkan vendor");
      }

      showNotification("success", "Vendor berhasil ditambahkan!");
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error("Error adding vendor:", error);
      showNotification("error", error.message || "Gagal menambahkan vendor");
    } finally {
      setSaving(false);
    }
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        ref={modalRef}
        className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-[#0a1b3d] to-[#2266ff] px-6 py-4 rounded-t-xl">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">
              Tambah Vendor Cepat
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
              Nama Perusahaan <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.nama_perusahaan}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  nama_perusahaan: e.target.value,
                }))
              }
              placeholder="PT. Contoh Vendor"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Kontak Person
            </label>
            <input
              type="text"
              value={formData.kontak_person}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  kontak_person: e.target.value,
                }))
              }
              placeholder="Nama contact person"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Nomor Telepon <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              value={formData.telepon}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, telepon: e.target.value }))
              }
              placeholder="08123456789"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, email: e.target.value }))
              }
              placeholder="vendor@email.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Alamat
            </label>
            <textarea
              value={formData.alamat}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, alamat: e.target.value }))
              }
              placeholder="Alamat lengkap vendor"
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-4">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-[#0a1b3d] to-[#2266ff] text-white font-semibold rounded-lg hover:from-[#0a1b3d]/90 hover:to-[#2266ff]/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Menyimpan..." : "Simpan Vendor"}
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
