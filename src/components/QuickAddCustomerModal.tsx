"use client";

import { useState, useEffect, useRef } from "react";
import { useClickOutside } from "@/hooks/useClickOutside";

interface QuickAddCustomerModalProps {
  show: boolean;
  onClose: () => void;
  onSuccess: () => void;
  showNotification: (type: "success" | "error", message: string) => void;
}

function generateId(prefix: string = "id"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export default function QuickAddCustomerModal({
  show,
  onClose,
  onSuccess,
  showNotification,
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

  const modalRef = useRef<HTMLDivElement>(null);

  useClickOutside(modalRef, () => {
    if (!loading) onClose();
  });

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (!show) return;

      if (e.key === "Escape") {
        if (!loading) onClose();
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleSubmit(e as any);
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [show, loading]);

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
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: generateId("cust"),
          tipe_pelanggan: tipePelanggan,
          nama: nama.trim(),
          nama_perusahaan: namaPerusahaan.trim() || null,
          telepon: telepon.trim() || null,
          email: email.trim() || null,
          alamat: alamat.trim() || null,
          member_status: memberStatus ? 1 : 0,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        showNotification("success", "Pelanggan berhasil ditambahkan!");
        resetForm();
        onSuccess();
        onClose();
      } else {
        showNotification("error", data.error || "Gagal menambahkan pelanggan");
      }
    } catch (error) {
      console.error("Error adding customer:", error);
      showNotification("error", "Terjadi kesalahan saat menambahkan pelanggan");
    }

    setLoading(false);
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        ref={modalRef}
        className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-[#14b8a6] to-[#06b6d4] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 backdrop-blur-sm p-2 rounded-lg">
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
            <h2 className="text-xl font-bold text-white">
              Tambah Pelanggan Baru
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 rounded-lg p-2 transition-all"
            disabled={loading}
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

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-4">
            {/* Tipe Pelanggan */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
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
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-gray-700">Perorangan</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="perusahaan"
                    checked={tipePelanggan === "perusahaan"}
                    onChange={(e) =>
                      setTipePelanggan(e.target.value as "perusahaan")
                    }
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-gray-700">Perusahaan</span>
                </label>
              </div>
            </div>

            {/* Nama */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Nama{" "}
                {tipePelanggan === "perorangan" ? "Lengkap" : "Contact Person"}{" "}
                *
              </label>
              <input
                type="text"
                value={nama}
                onChange={(e) => setNama(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                placeholder="Masukkan nama..."
                required
              />
            </div>

            {/* Nama Perusahaan (if perusahaan) */}
            {tipePelanggan === "perusahaan" && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Nama Perusahaan
                </label>
                <input
                  type="text"
                  value={namaPerusahaan}
                  onChange={(e) => setNamaPerusahaan(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                  placeholder="PT. Contoh..."
                />
              </div>
            )}

            {/* Telepon */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Nomor Telepon
              </label>
              <input
                type="tel"
                value={telepon}
                onChange={(e) => setTelepon(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                placeholder="08xxxxxxxxxx"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                placeholder="email@example.com"
              />
            </div>

            {/* Alamat */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Alamat
              </label>
              <textarea
                value={alamat}
                onChange={(e) => setAlamat(e.target.value)}
                rows={3}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                placeholder="Alamat lengkap..."
              />
            </div>

            {/* Member Status */}
            <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-lg border-2 border-amber-200">
              <input
                type="checkbox"
                id="memberStatus"
                checked={memberStatus}
                onChange={(e) => setMemberStatus(e.target.checked)}
                className="w-5 h-5 text-amber-600"
              />
              <label htmlFor="memberStatus" className="flex-1 cursor-pointer">
                <span className="font-semibold text-gray-800">Member</span>
                <p className="text-sm text-gray-600">
                  Member mendapatkan harga khusus
                </p>
              </label>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-4">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-[#14b8a6] to-[#06b6d4] text-white font-semibold rounded-lg hover:from-[#0d9488] hover:to-[#0891b2] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Menyimpan..." : "Simpan Pelanggan"}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-6 py-3 bg-gray-100 text-gray-700 font-semibold rounded-lg hover:bg-gray-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Batal
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
