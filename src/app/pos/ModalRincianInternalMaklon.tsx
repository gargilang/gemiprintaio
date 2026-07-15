"use client";

import { useEffect, useState } from "react";
import ModalFormShell from "@/components/ModalFormShell";
import type { CartItem, SubkontraktorOption } from "./pos-types";

interface ModalRincianInternalMaklonProps {
  open: boolean;
  item: CartItem | null;
  subkontraktor: SubkontraktorOption[];
  onClose: () => void;
  onSave: (value: Partial<CartItem>) => void;
}

const SATUAN_OPTIONS = [
  "pcs",
  "lembar",
  "set",
  "rim",
  "pack",
  "m²",
  "meter",
  "roll",
  "unit",
];

export default function ModalRincianInternalMaklon({
  open,
  item,
  subkontraktor,
  onClose,
  onSave,
}: ModalRincianInternalMaklonProps) {
  const [namaItem, setNamaItem] = useState("");
  const [jumlah, setJumlah] = useState("1");
  const [namaSatuan, setNamaSatuan] = useState("pcs");
  const [hargaJual, setHargaJual] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [biayaSubkontrak, setBiayaSubkontrak] = useState("");
  const [metodeBayar, setMetodeBayar] = useState<"CASH" | "NET30" | "TRANSFER">(
    "CASH",
  );
  const [tampilkanInternal, setTampilkanInternal] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!item) return;
    setNamaItem(item.barang_nama);
    setJumlah(String(item.jumlah));
    setNamaSatuan(item.nama_satuan);
    setHargaJual(String(item.harga_satuan));
    setVendorId(item.vendor_subkontrak_id || "");
    setBiayaSubkontrak(String(item.biaya_subkontrak ?? ""));
    setMetodeBayar(item.metode_bayar_vendor || "CASH");
    setTampilkanInternal(true);
    setError(null);
  }, [item]);

  const handleSubmit = () => {
    const parsedJumlah = Number(jumlah);
    const parsedHarga = Number(hargaJual);
    const parsedBiaya = Number(biayaSubkontrak);

    if (!namaItem.trim()) {
      setError("Nama item wajib diisi");
      return;
    }
    if (!Number.isFinite(parsedJumlah) || parsedJumlah <= 0) {
      setError("Jumlah harus lebih dari 0");
      return;
    }
    if (!Number.isFinite(parsedHarga) || parsedHarga < 0) {
      setError("Harga jual tidak valid");
      return;
    }
    if (!vendorId || !Number.isFinite(parsedBiaya) || parsedBiaya <= 0) {
      setTampilkanInternal(true);
      setError(
        "Lengkapi Rincian Internal (vendor, biaya, metode) sebelum simpan.",
      );
      return;
    }

    const vendor = subkontraktor.find((v) => v.id === vendorId);
    setSaving(true);
    try {
      onSave({
        barang_nama: namaItem.trim(),
        deskripsi_pekerjaan: namaItem.trim(),
        jumlah: parsedJumlah,
        nama_satuan: namaSatuan,
        harga_satuan: parsedHarga,
        subtotalRaw: parsedJumlah * parsedHarga,
        vendor_subkontrak_id: vendorId,
        vendor_subkontrak_nama: vendor?.nama_perusahaan,
        biaya_subkontrak: parsedBiaya,
        metode_bayar_vendor: metodeBayar,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalFormShell
      open={open}
      onClose={onClose}
      maxWidthClass="max-w-lg"
      header={
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
            Rincian Item Maklon
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            aria-label="Tutup"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      }
      footer={
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold disabled:opacity-50"
          >
            {saving ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      }
    >
      <div className="px-6 py-4 space-y-4">
        {error && (
          <p className="text-sm text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 px-3 py-2 rounded-lg">
            {error}
          </p>
        )}

        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Pelanggan
          </p>
          <label className="block text-sm">
            <span className="text-slate-700 dark:text-slate-200">
              Nama item
            </span>
            <input
              value={namaItem}
              onChange={(e) => setNamaItem(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-slate-800 dark:text-slate-100"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-slate-700 dark:text-slate-200">Jumlah</span>
              <input
                type="number"
                min={1}
                value={jumlah}
                onChange={(e) => setJumlah(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-slate-800 dark:text-slate-100"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-700 dark:text-slate-200">Satuan</span>
              <select
                value={namaSatuan}
                onChange={(e) => setNamaSatuan(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-slate-800 dark:text-slate-100"
              >
                {SATUAN_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-sm">
            <span className="text-slate-700 dark:text-slate-200">
              Harga jual
            </span>
            <input
              type="number"
              min={0}
              value={hargaJual}
              onChange={(e) => setHargaJual(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-slate-800 dark:text-slate-100"
            />
          </label>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setTampilkanInternal((v) => !v)}
            className="flex items-center gap-2 text-sm font-semibold text-indigo-600 dark:text-indigo-300"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
              />
            </svg>
            Rincian Internal
          </button>
          {tampilkanInternal && (
            <div className="space-y-3 rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-900/10 p-3">
              <label className="block text-sm">
                <span className="text-slate-700 dark:text-slate-200">
                  Vendor subkontrak
                </span>
                <select
                  value={vendorId}
                  onChange={(e) => setVendorId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-slate-800 dark:text-slate-100"
                >
                  <option value="">— Pilih vendor —</option>
                  {subkontraktor.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.nama_perusahaan}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-slate-700 dark:text-slate-200">
                  Biaya subkontrak
                </span>
                <input
                  type="number"
                  min={0}
                  value={biayaSubkontrak}
                  onChange={(e) => setBiayaSubkontrak(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-slate-800 dark:text-slate-100"
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-700 dark:text-slate-200">
                  Metode bayar vendor
                </span>
                <select
                  value={metodeBayar}
                  onChange={(e) =>
                    setMetodeBayar(
                      e.target.value as "CASH" | "NET30" | "TRANSFER",
                    )
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-slate-800 dark:text-slate-100"
                >
                  <option value="CASH">CASH (tunai)</option>
                  <option value="NET30">NET30 (jadi hutang)</option>
                  <option value="TRANSFER">
                    TRANSFER (bayar langsung via bank)
                  </option>
                </select>
              </label>
            </div>
          )}
        </div>
      </div>
    </ModalFormShell>
  );
}
