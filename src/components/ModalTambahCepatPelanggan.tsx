"use client";

import { useState } from "react";
import ModalFormShell from "@/components/ModalFormShell";

interface CustomerData {
  tipe_pelanggan: "perorangan" | "perusahaan";
  nama: string;
  nama_perusahaan?: string;
  telepon?: string;
  email?: string;
  alamat?: string;
  member_status: number;
}

interface QuickAddCustomerModalProps {
  show: boolean;
  onClose: () => void;
  onSuccess: () => void;
  showNotification: (type: "success" | "error", message: string) => void;
  onCreateCustomer: (data: CustomerData) => Promise<any>;
}

export default function ModalTambahCepatPelanggan({
  show,
  onClose,
  onSuccess,
  showNotification,
  onCreateCustomer,
}: QuickAddCustomerModalProps) {
  const [loading, setLoading] = useState(false);
  const [tipePelanggan, setTipePelanggan] = useState<
    "perorangan" | "perusahaan"
  >("perorangan");
  const [nama, setNama] = useState("");
  const [namaPerusahaan, setNamaPerusahaan] = useState("");
  const [telepon, setTelepon] = useState("");
  const [email, setEmail] = useState("");
  const [alamat, setAlamat] = useState("");
  const [memberStatus, setMemberStatus] = useState(false);

  const resetForm = () => {
    setNama("");
    setNamaPerusahaan("");
    setTelepon("");
    setEmail("");
    setAlamat("");
    setMemberStatus(false);
    setTipePelanggan("perorangan");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!nama.trim()) {
      showNotification("error", "Nama pelanggan harus diisi");
      return;
    }

    setLoading(true);

    try {
      await onCreateCustomer({
        tipe_pelanggan: tipePelanggan,
        nama: nama.trim(),
        nama_perusahaan: namaPerusahaan.trim() || undefined,
        telepon: telepon.trim() || undefined,
        email: email.trim() || undefined,
        alamat: alamat.trim() || undefined,
        member_status: memberStatus ? 1 : 0,
      });

      showNotification("success", "Pelanggan berhasil ditambahkan!");
      resetForm();
      onSuccess();
      onClose();
    } catch (error) {
      console.error("Error adding customer:", error);
      showNotification("error", "Terjadi kesalahan saat menambahkan pelanggan");
    }

    setLoading(false);
  };

  const dismissDisabled = loading;

  return (
    <ModalFormShell
      open={show}
      onClose={onClose}
      allowDismiss={!dismissDisabled}
      maxWidthClass="max-w-md"
      backdropClassName="bg-black/50 backdrop-blur-sm"
      header={
        <div className="bg-gradient-to-r from-[#14b8a6] to-[#06b6d4] px-6 py-4 flex items-center justify-between shrink-0">
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
                  d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white truncate">
              Tambah Pelanggan Baru
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-all shrink-0 disabled:opacity-50"
            disabled={dismissDisabled}
            aria-label="Tutup"
          >
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
            className="px-6 py-2.5 bg-white dark:bg-slate-900 border-2 border-gray-300 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors font-semibold disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="submit"
            form="quick-add-customer-form"
            disabled={dismissDisabled}
            className="px-6 py-2.5 bg-gradient-to-r from-[#14b8a6] to-[#06b6d4] text-white rounded-lg hover:from-[#0d9488] hover:to-[#0891b2] transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      }
    >
      <form
        id="quick-add-customer-form"
        onSubmit={handleSubmit}
        className="p-6 space-y-4"
      >
        <div>
          <label className="block text-base font-semibold text-gray-700 dark:text-slate-300 mb-2">
            Tipe Pelanggan
          </label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                value="perorangan"
                checked={tipePelanggan === "perorangan"}
                onChange={(e) =>
                  setTipePelanggan(e.target.value as "perorangan")
                }
                className="w-4 h-4 text-blue-600 dark:text-blue-300"
              />
              <span className="text-gray-700 dark:text-slate-300">Perorangan</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                value="perusahaan"
                checked={tipePelanggan === "perusahaan"}
                onChange={(e) =>
                  setTipePelanggan(e.target.value as "perusahaan")
                }
                className="w-4 h-4 text-blue-600 dark:text-blue-300"
              />
              <span className="text-gray-700 dark:text-slate-300">Perusahaan</span>
            </label>
          </div>
        </div>

        <div>
          <label className="block text-base font-semibold text-gray-700 dark:text-slate-300 mb-2">
            Nama{" "}
            {tipePelanggan === "perorangan" ? "Lengkap" : "Contact Person"} *
          </label>
          <input
            type="text"
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 dark:bg-slate-800 dark:text-slate-100"
            placeholder="Masukkan nama..."
            required
          />
        </div>

        {tipePelanggan === "perusahaan" && (
          <div>
            <label className="block text-base font-semibold text-gray-700 dark:text-slate-300 mb-2">
              Nama Perusahaan
            </label>
            <input
              type="text"
              value={namaPerusahaan}
              onChange={(e) => setNamaPerusahaan(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 dark:bg-slate-800 dark:text-slate-100"
              placeholder="PT. Contoh..."
            />
          </div>
        )}

        <div>
          <label className="block text-base font-semibold text-gray-700 dark:text-slate-300 mb-2">
            Nomor Telepon
          </label>
          <input
            type="tel"
            value={telepon}
            onChange={(e) => setTelepon(e.target.value)}
            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 dark:bg-slate-800 dark:text-slate-100"
            placeholder="08xxxxxxxxxx"
          />
        </div>

        <div>
          <label className="block text-base font-semibold text-gray-700 dark:text-slate-300 mb-2">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 dark:bg-slate-800 dark:text-slate-100"
            placeholder="email@example.com"
          />
        </div>

        <div>
          <label className="block text-base font-semibold text-gray-700 dark:text-slate-300 mb-2">
            Alamat
          </label>
          <textarea
            value={alamat}
            onChange={(e) => setAlamat(e.target.value)}
            rows={3}
            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 dark:bg-slate-800 dark:text-slate-100"
            placeholder="Alamat lengkap..."
          />
        </div>

        <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-slate-800 rounded-lg border-2 border-amber-200 dark:border-amber-800/50">
          <input
            type="checkbox"
            id="memberStatus"
            checked={memberStatus}
            onChange={(e) => setMemberStatus(e.target.checked)}
            className="w-5 h-5 text-amber-600 dark:text-amber-300"
          />
          <label htmlFor="memberStatus" className="flex-1 cursor-pointer">
            <span className="font-semibold text-gray-800 dark:text-slate-100">Member</span>
            <p className="text-base text-gray-600 dark:text-slate-300">
              Member mendapatkan harga khusus
            </p>
          </label>
        </div>
      </form>
    </ModalFormShell>
  );
}
