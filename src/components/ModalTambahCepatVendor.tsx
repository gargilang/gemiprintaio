"use client";

import { useState, useEffect } from "react";
import ModalFormShell from "@/components/ModalFormShell";

interface VendorData {
  nama_perusahaan: string;
  email: string;
  telepon: string;
  alamat: string;
  kontak_person: string;
  aktif_status: number;
  ketentuan_bayar: string;
  catatan: string;
}

interface QuickAddVendorModalProps {
  show: boolean;
  onClose: () => void;
  onSuccess: () => void;
  showNotification: (type: "success" | "error", message: string) => void;
  onCreateVendor: (data: VendorData) => Promise<any>;
}

export default function ModalTambahCepatVendor({
  show,
  onClose,
  onSuccess,
  showNotification,
  onCreateVendor,
}: QuickAddVendorModalProps) {
  const [formData, setFormData] = useState({
    nama_perusahaan: "",
    email: "",
    telepon: "",
    alamat: "",
    kontak_person: "",
  });
  const [saving, setSaving] = useState(false);

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

      await onCreateVendor({
        ...formData,
        aktif_status: 1,
        ketentuan_bayar: "",
        catatan: "",
      });

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

  const dismissDisabled = saving;

  return (
    <ModalFormShell
      open={show}
      onClose={onClose}
      allowDismiss={!dismissDisabled}
      maxWidthClass="max-w-md"
      header={
        <div className="bg-gradient-to-r from-[#0a1b3d] to-[#2266ff] px-6 py-4 flex items-center justify-between shrink-0">
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
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white truncate">
              Tambah Vendor Cepat
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
            form="quick-add-vendor-form"
            disabled={dismissDisabled}
            className="px-6 py-2 bg-gradient-to-r from-[#0a1b3d] to-[#2266ff] text-white rounded-lg hover:from-[#0a1b3d]/90 hover:to-[#2266ff]/90 transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      }
    >
      <form
        id="quick-add-vendor-form"
        onSubmit={handleSubmit}
        className="p-6 space-y-4"
      >
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">
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
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-slate-100"
            required
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">
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
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">
            Nomor Telepon <span className="text-red-500">*</span>
          </label>
          <input
            type="tel"
            value={formData.telepon}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, telepon: e.target.value }))
            }
            placeholder="08123456789"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-slate-100"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">
            Email
          </label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, email: e.target.value }))
            }
            placeholder="vendor@email.com"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">
            Alamat
          </label>
          <textarea
            value={formData.alamat}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, alamat: e.target.value }))
            }
            placeholder="Alamat lengkap vendor"
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
      </form>
    </ModalFormShell>
  );
}
