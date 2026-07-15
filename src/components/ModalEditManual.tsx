"use client";

import { useState, useEffect } from "react";
import ModalFormShell from "@/components/ModalFormShell";
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
];

export default function ModalEditManual({
  show,
  onClose,
  onSuccess,
  cashBook,
}: EditManualModalProps) {
  const [formData, setFormData] = useState<{ [key: string]: string }>({});
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (cashBook) {
      const initialData: { [key: string]: string } = {};
      EDITABLE_FIELDS.forEach(({ key }) => {
        initialData[key] = ((cashBook as any)[key] || 0).toString();
      });
      setFormData(initialData);
      setTouchedFields(new Set()); // Reset field yang sudah disentuh saat modal dibuka
    }
  }, [cashBook]);

  if (!show || !cashBook) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const updateData: { [key: string]: number } = {};

      // Hanya kirim field yang benar-benar disentuh/diedit oleh pengguna
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

      // Pastikan minimal ada satu field yang akan diperbarui
      if (Object.keys(updateData).length === 0) {
        setError("Tidak ada field yang diubah");
        setSaving(false);
        return;
      }

      const res = await fetch(`/api/cashbook/override/${cashBook.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      });

      const data = await res.json();

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
    // Hanya izinkan angka dan titik desimal
    const sanitized = value.replace(/[^0-9.-]/g, "");
    setFormData({ ...formData, [key]: sanitized });
    // Tandai field ini sudah disentuh
    setTouchedFields(new Set(touchedFields).add(key));
  };

  const isOverridden = (field: string) => {
    return (cashBook as any)[`override_${field}`] === 1;
  };

  return (
    <ModalFormShell
      open={show}
      onClose={handleClose}
      allowDismiss={!saving}
      maxWidthClass="max-w-2xl"
      zIndexClass="z-[60]"
      backdropClassName="bg-black/60"
      header={
        <div className="p-6 border-b border-gray-200 dark:border-slate-800 bg-gradient-to-r from-orange-500 to-pink-600 shrink-0 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-white/20 dark:bg-slate-900/20 rounded-lg shrink-0">
              <span className="text-2xl" aria-hidden>
                🔧
              </span>
            </div>
            <div className="min-w-0">
              <h3 className="text-xl font-bold text-white truncate">
                Edit Manual (Penggantian)
              </h3>
              <p className="text-white/90 text-base mt-1 truncate">
                Transaksi tgl: {cashBook.tanggal} | Kategori:{" "}
                {cashBook.kategori_transaksi}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={saving}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors shrink-0 disabled:opacity-50"
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
            onClick={handleClose}
            disabled={saving}
            className="px-6 py-2.5 bg-white dark:bg-slate-900 border-2 border-gray-300 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors font-semibold disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="submit"
            form="edit-manual-form"
            disabled={saving}
            className="px-6 py-2.5 bg-gradient-to-r from-orange-500 to-pink-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all duration-300 disabled:opacity-50"
          >
            {saving ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      }
    >
        <form id="edit-manual-form" onSubmit={handleSubmit}>
          <div className="p-6 space-y-5">
            {/* Kotak info */}
            <div className="bg-orange-50 dark:bg-slate-800 border-2 border-orange-200 dark:border-orange-800/50 rounded-xl p-4 text-base text-orange-800 dark:text-orange-200">
              <div className="font-bold mb-1">🔧 Fitur Penggantian Manual</div>
              <p>
                Nilai yang Anda edit akan diganti manual dan tidak akan dihitung
                ulang secara otomatis. Kolom yang diganti ditandai dengan
                ikon 🔒.
              </p>
            </div>

            {/* Info transaksi */}
            <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-4 grid grid-cols-2 gap-x-6 gap-y-3 text-base border-2 border-gray-200 dark:border-slate-800">
              <div>
                <span className="text-gray-500 dark:text-slate-400">Debit:</span>{" "}
                <span className="font-semibold text-green-600">
                  {formatRupiah(cashBook.debit || 0)}
                </span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-slate-400">Kredit:</span>{" "}
                <span className="font-semibold text-red-600">
                  {formatRupiah(cashBook.kredit || 0)}
                </span>
              </div>
              <div className="col-span-2">
                <span className="text-gray-500 dark:text-slate-400">Keperluan:</span>{" "}
                <span className="font-semibold text-gray-800 dark:text-slate-100">
                  {cashBook.keperluan || "-"}
                </span>
              </div>
            </div>

            {/* Field yang dapat diedit */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-5">
              {EDITABLE_FIELDS.map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-base font-semibold text-[#0a1b3d] dark:text-slate-100 mb-2 flex items-center">
                    {label}
                    {isOverridden(key) && (
                      <span
                        className="ml-2 text-yellow-500"
                        title="Nilai ini diganti manual"
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
                    className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-600 focus:border-pink-600 transition disabled:bg-gray-100 dark:bg-slate-800 dark:text-slate-100"
                    placeholder="0"
                  />
                  {formData[key] && (
                    <p className="text-base text-gray-500 dark:text-slate-400 mt-1">
                      {formatRupiah(parseFloat(formData[key]))}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* Pesan kesalahan */}
            {error && (
              <div className="bg-red-50 dark:bg-red-950/40 border-2 border-red-200 dark:border-red-800/50 rounded-xl p-3 text-base text-red-800 dark:text-red-200 font-medium">
                {error}
              </div>
            )}
          </div>
        </form>
    </ModalFormShell>
  );
}
