"use client";

import { useState, useEffect, useRef } from "react";
import { useClickOutside } from "@/hooks/useClickOutside";
import { CashBook } from "@/types/database";
import { formatRupiah } from "@/lib/indonesian-helpers";

interface EditManualModalProps {
  show: boolean;
  onClose: () => void;
  onSuccess: () => void;
  cashBook: CashBook | null;
}

const EDITABLE_FIELDS = [
  { key: "saldo", label: "Saldo" },
  { key: "omzet", label: "Omzet" },
  { key: "biaya_operasional", label: "Biaya Operasional" },
  { key: "biaya_bahan", label: "Biaya Bahan" },
  { key: "laba_bersih", label: "Laba Bersih" },
  { key: "kasbon_anwar", label: "Kasbon Anwar" },
  { key: "kasbon_suri", label: "Kasbon Suri" },
  { key: "kasbon_cahaya", label: "Kasbon Cahaya" },
  { key: "kasbon_dinil", label: "Kasbon Dinil" },
  { key: "bagi_hasil_anwar", label: "Bagi Hasil Anwar" },
  { key: "bagi_hasil_suri", label: "Bagi Hasil Suri" },
  { key: "bagi_hasil_gemi", label: "Bagi Hasil Gemi" },
];

export default function EditManualModal({
  show,
  onClose,
  onSuccess,
  cashBook,
}: EditManualModalProps) {
  const [formData, setFormData] = useState<{ [key: string]: string }>({});
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");

  // Click outside to close modal (only when not saving)
  const modalRef = useRef<HTMLDivElement>(null);
  useClickOutside(modalRef, onClose, show && !saving);

  useEffect(() => {
    if (cashBook) {
      const initialData: { [key: string]: string } = {};
      EDITABLE_FIELDS.forEach(({ key }) => {
        initialData[key] = ((cashBook as any)[key] || 0).toString();
      });
      setFormData(initialData);
      setTouchedFields(new Set()); // Reset touched fields when modal opens
    }
  }, [cashBook]);

  // Handle ESC key to close modal
  useEffect(() => {
    if (!show) return;

    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleEscKey);
    return () => window.removeEventListener("keydown", handleEscKey);
  }, [show, onClose]);

  if (!show || !cashBook) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const updateData: { [key: string]: number } = {};

      // Only include fields that were actually touched/edited by user
      EDITABLE_FIELDS.forEach(({ key }) => {
        if (
          touchedFields.has(key) &&
          formData[key] !== undefined &&
          formData[key] !== ""
        ) {
          const value = parseFloat(formData[key]);
          if (!isNaN(value)) {
            updateData[key] = value;
          }
        }
      });

      // Check if at least one field is being updated
      if (Object.keys(updateData).length === 0) {
        setError("Tidak ada field yang diubah");
        setSaving(false);
        return;
      }

      console.log("Sending override request:", {
        id: cashBook.id,
        url: `/api/cashbook/override/${cashBook.id}`,
        data: updateData,
      });

      const res = await fetch(`/api/cashbook/override/${cashBook.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      });

      const data = await res.json();
      console.log("Override response:", data);

      if (!res.ok) {
        throw new Error(data.error || "Gagal mengupdate data");
      }

      onSuccess();
      handleClose();
    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan");
      setSaving(false);
    }
  };

  const handleClose = () => {
    setFormData({});
    setTouchedFields(new Set());
    setSaving(false);
    setError("");
    onClose();
  };

  const handleChange = (key: string, value: string) => {
    // Only allow numbers and decimal point
    const sanitized = value.replace(/[^0-9.-]/g, "");
    setFormData({ ...formData, [key]: sanitized });
    // Mark this field as touched
    setTouchedFields(new Set(touchedFields).add(key));
  };

  const isOverridden = (field: string) => {
    return (cashBook as any)[`override_${field}`] === 1;
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
      <div
        ref={modalRef}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200"
      >
        <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-orange-500 to-pink-600 rounded-t-2xl">
          <h3 className="text-xl font-bold text-white">
            🔧 Edit Manual (Override)
          </h3>
          <p className="text-white/90 text-sm mt-1">
            Transaksi tgl: {cashBook.tanggal} | Kategori:{" "}
            {cashBook.kategori_transaksi}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-5">
            {/* Info Box */}
            <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-4 text-sm text-orange-800">
              <div className="font-bold mb-1">🔧 Fitur Override Manual</div>
              <p>
                Nilai yang Anda edit akan di-override dan tidak akan dihitung
                ulang secara otomatis. Kolom yang di-override ditandai dengan
                ikon 🔒.
              </p>
            </div>

            {/* Transaction Info */}
            <div className="bg-gray-50 rounded-xl p-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm border-2 border-gray-200">
              <div>
                <span className="text-gray-500">Debit:</span>{" "}
                <span className="font-semibold text-green-600">
                  {formatRupiah(cashBook.debit || 0)}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Kredit:</span>{" "}
                <span className="font-semibold text-red-600">
                  {formatRupiah(cashBook.kredit || 0)}
                </span>
              </div>
              <div className="col-span-2">
                <span className="text-gray-500">Keperluan:</span>{" "}
                <span className="font-semibold text-gray-800">
                  {cashBook.keperluan || "-"}
                </span>
              </div>
            </div>

            {/* Editable Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-5">
              {EDITABLE_FIELDS.map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-sm font-semibold text-[#0a1b3d] mb-2 flex items-center">
                    {label}
                    {isOverridden(key) && (
                      <span
                        className="ml-2 text-yellow-500"
                        title="Nilai ini di-override"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </span>
                    )}
                  </label>
                  <input
                    type="text"
                    value={formData[key] || ""}
                    onChange={(e) => handleChange(key, e.target.value)}
                    disabled={saving}
                    className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-600 focus:border-pink-600 transition disabled:bg-gray-100"
                    placeholder="0"
                  />
                  {formData[key] && (
                    <p className="text-xs text-gray-500 mt-1">
                      {formatRupiah(parseFloat(formData[key]))}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-50 border-2 border-red-200 rounded-xl p-3 text-sm text-red-800 font-medium">
                {error}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="p-6 border-t border-gray-200 flex gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={saving}
              className="flex-1 px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-100 transition-all font-semibold disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-orange-500 to-pink-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all duration-300 disabled:opacity-50"
            >
              {saving ? "Menyimpan..." : "Simpan & Kalkulasi Ulang"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
