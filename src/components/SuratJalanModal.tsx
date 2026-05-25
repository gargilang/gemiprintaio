"use client";

/**
 * Modal for creating or editing a Surat Jalan (delivery note).
 *
 * Two modes:
 *  - Create new (initialValue null): blank form, optionally seeded from sale
 *  - Edit existing (only if status=DRAFT)
 *
 * Items are an editable list — user can add, remove, reorder.
 */

import { useEffect, useState } from "react";
import ModalFormShell from "@/components/ModalFormShell";

export interface SuratJalanFormItem {
  nama_barang: string;
  keterangan?: string | null;
  ukuran?: string | null;
  qty: number;
  satuan?: string | null;
}

export interface SuratJalanFormValue {
  penjualan_id?: string | null;
  pelanggan_nama?: string | null;
  pelanggan_alamat?: string | null;
  pelanggan_telepon?: string | null;
  tanggal: string;
  nomor_kendaraan?: string | null;
  pengirim_nama?: string | null;
  catatan?: string | null;
  items: SuratJalanFormItem[];
}

interface SuratJalanModalProps {
  show: boolean;
  initialValue?: Partial<SuratJalanFormValue> | null;
  isEditing?: boolean;
  onClose: () => void;
  onSave: (value: SuratJalanFormValue) => Promise<void> | void;
  onShowMessage?: (type: "success" | "error", message: string) => void;
}

const EMPTY_ITEM: SuratJalanFormItem = {
  nama_barang: "",
  keterangan: "",
  ukuran: "",
  qty: 1,
  satuan: "",
};

function todayLocal(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" });
}

export default function SuratJalanModal({
  show,
  initialValue,
  isEditing = false,
  onClose,
  onSave,
  onShowMessage,
}: SuratJalanModalProps) {
  const [pelangganNama, setPelangganNama] = useState("");
  const [pelangganAlamat, setPelangganAlamat] = useState("");
  const [pelangganTelepon, setPelangganTelepon] = useState("");
  const [tanggal, setTanggal] = useState(todayLocal());
  const [nomorKendaraan, setNomorKendaraan] = useState("");
  const [pengirimNama, setPengirimNama] = useState("");
  const [catatan, setCatatan] = useState("");
  const [items, setItems] = useState<SuratJalanFormItem[]>([{ ...EMPTY_ITEM }]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!show) return;
    setPelangganNama(initialValue?.pelanggan_nama || "");
    setPelangganAlamat(initialValue?.pelanggan_alamat || "");
    setPelangganTelepon(initialValue?.pelanggan_telepon || "");
    setTanggal(initialValue?.tanggal || todayLocal());
    setNomorKendaraan(initialValue?.nomor_kendaraan || "");
    setPengirimNama(initialValue?.pengirim_nama || "");
    setCatatan(initialValue?.catatan || "");
    setItems(
      initialValue?.items && initialValue.items.length > 0
        ? initialValue.items.map((it) => ({
            nama_barang: it.nama_barang || "",
            keterangan: it.keterangan || "",
            ukuran: it.ukuran || "",
            qty: it.qty ?? 1,
            satuan: it.satuan || "",
          }))
        : [{ ...EMPTY_ITEM }]
    );
  }, [show, initialValue]);

  const updateItem = (idx: number, patch: Partial<SuratJalanFormItem>) => {
    setItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  const addItem = () => setItems((prev) => [...prev, { ...EMPTY_ITEM }]);
  const removeItem = (idx: number) =>
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    if (!pelangganNama.trim()) {
      onShowMessage?.("error", "Nama penerima wajib diisi");
      return;
    }
    if (items.length === 0) {
      onShowMessage?.("error", "Tambahkan minimal satu item");
      return;
    }
    for (let i = 0; i < items.length; i++) {
      if (!items[i].nama_barang.trim()) {
        onShowMessage?.("error", `Item #${i + 1}: nama barang wajib diisi`);
        return;
      }
      if (!Number.isFinite(items[i].qty) || items[i].qty <= 0) {
        onShowMessage?.("error", `Item #${i + 1}: qty harus lebih dari 0`);
        return;
      }
    }

    setSubmitting(true);
    try {
      await onSave({
        penjualan_id: initialValue?.penjualan_id || null,
        pelanggan_nama: pelangganNama.trim(),
        pelanggan_alamat: pelangganAlamat.trim() || null,
        pelanggan_telepon: pelangganTelepon.trim() || null,
        tanggal,
        nomor_kendaraan: nomorKendaraan.trim() || null,
        pengirim_nama: pengirimNama.trim() || null,
        catatan: catatan.trim() || null,
        items: items.map((it) => ({
          nama_barang: it.nama_barang.trim(),
          keterangan: it.keterangan?.trim() || null,
          ukuran: it.ukuran?.trim() || null,
          qty: Number(it.qty) || 0,
          satuan: it.satuan?.trim() || null,
        })),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalFormShell
      open={show}
      onClose={onClose}
      maxWidthClass="max-w-4xl"
      backdropClassName="bg-black/50 backdrop-blur-sm"
      header={
        <div className="bg-gradient-to-r from-[#0a1b3d] to-[#2266ff] px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-white/20 rounded-lg shrink-0">
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
                  d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0"
                />
              </svg>
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-white truncate">
                {isEditing ? "Edit Surat Jalan" : "Buat Surat Jalan"}
              </h2>
              <p className="text-xs text-white/90">
                Dokumen pengantar barang yang akan dikirim ke pelanggan
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-all shrink-0"
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
        <div className="bg-gray-50 dark:bg-slate-800 px-6 py-4 border-t border-gray-200 dark:border-slate-700 shrink-0 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-white dark:bg-slate-900 border-2 border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors font-semibold"
          >
            Batal
          </button>
          <button
            type="submit"
            form="surat-jalan-form"
            disabled={submitting}
            className="px-5 py-2 bg-gradient-to-r from-[#0a1b3d] to-[#2266ff] text-white rounded-lg hover:from-[#0a1b3d]/90 hover:to-[#2266ff]/90 transition-all font-semibold disabled:opacity-50"
          >
            {submitting
              ? "Menyimpan..."
              : isEditing
                ? "Simpan Perubahan"
                : "Buat Surat Jalan"}
          </button>
        </div>
      }
    >
      <form
        id="surat-jalan-form"
        onSubmit={handleSubmit}
        className="p-6 space-y-5"
      >
        {/* ── Penerima ─────────────────────────────────────────────────────── */}
        <div className="rounded-lg border-2 border-[#00afef]/30 bg-cyan-50/40 dark:bg-slate-800/60 p-4">
          <div className="text-xs font-bold uppercase tracking-wide text-[#00afef] mb-3">
            Penerima
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1.5">
                Nama / Perusahaan <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={pelangganNama}
                onChange={(e) => setPelangganNama(e.target.value)}
                placeholder="Nama penerima"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 border-2 border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:border-[#00afef]"
                required
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1.5">
                  Alamat
                </label>
                <input
                  type="text"
                  value={pelangganAlamat}
                  onChange={(e) => setPelangganAlamat(e.target.value)}
                  placeholder="Alamat pengiriman"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 border-2 border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:border-[#00afef]"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1.5">
                  Telepon
                </label>
                <input
                  type="text"
                  value={pelangganTelepon}
                  onChange={(e) => setPelangganTelepon(e.target.value)}
                  placeholder="08..."
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 border-2 border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:border-[#00afef]"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Logistik ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1.5">
              Tanggal <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 border-2 border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:border-[#00afef]"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1.5">
              No. Kendaraan
            </label>
            <input
              type="text"
              value={nomorKendaraan}
              onChange={(e) => setNomorKendaraan(e.target.value)}
              placeholder="B 1234 ABC"
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 border-2 border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:border-[#00afef]"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1.5">
              Pengirim (Driver)
            </label>
            <input
              type="text"
              value={pengirimNama}
              onChange={(e) => setPengirimNama(e.target.value)}
              placeholder="Nama driver / kurir"
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 border-2 border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:border-[#00afef]"
            />
          </div>
        </div>

        {/* ── Items ────────────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-bold uppercase tracking-wide text-[#0a1b3d] dark:text-slate-100">
              Daftar Barang ({items.length})
            </div>
            <button
              type="button"
              onClick={addItem}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#00afef] hover:bg-[#0098d0] text-white transition-colors"
            >
              + Tambah Item
            </button>
          </div>

          <div className="space-y-2">
            {items.map((item, idx) => (
              <div
                key={idx}
                className="rounded-lg border-2 border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-gray-500 dark:text-slate-400">
                    Item #{idx + 1}
                  </span>
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      className="text-xs font-semibold text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                    >
                      Hapus
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1">
                      Nama Barang <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={item.nama_barang}
                      onChange={(e) =>
                        updateItem(idx, { nama_barang: e.target.value })
                      }
                      placeholder="Misal: Banner Flexi 280gr"
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 border-2 border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:border-[#00afef]"
                    />
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1">
                        Keterangan
                      </label>
                      <input
                        type="text"
                        value={item.keterangan || ""}
                        onChange={(e) =>
                          updateItem(idx, { keterangan: e.target.value })
                        }
                        placeholder="(opsional)"
                        className="w-full px-2 py-2 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 border-2 border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:border-[#00afef]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1">
                        Ukuran
                      </label>
                      <input
                        type="text"
                        value={item.ukuran || ""}
                        onChange={(e) =>
                          updateItem(idx, { ukuran: e.target.value })
                        }
                        placeholder="2 × 3 m"
                        className="w-full px-2 py-2 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 border-2 border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:border-[#00afef]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1">
                        Qty <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.qty}
                        onChange={(e) =>
                          updateItem(idx, {
                            qty: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-full px-2 py-2 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 border-2 border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:border-[#00afef]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1">
                        Satuan
                      </label>
                      <input
                        type="text"
                        value={item.satuan || ""}
                        onChange={(e) =>
                          updateItem(idx, { satuan: e.target.value })
                        }
                        placeholder="pcs / m²"
                        className="w-full px-2 py-2 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 border-2 border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:border-[#00afef]"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Catatan ──────────────────────────────────────────────────────── */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1.5">
            Catatan
          </label>
          <textarea
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            rows={2}
            placeholder="Catatan tambahan (opsional)"
            className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 border-2 border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:border-[#00afef]"
          />
        </div>
      </form>
    </ModalFormShell>
  );
}
