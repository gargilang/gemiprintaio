"use client";

import { useState } from "react";
import ModalFormShell from "@/components/ModalFormShell";
import type { SubkontraktorOption } from "./pos-types";

type KategoriOption = {
  id: string;
  nama: string;
};

export interface TambahItemLainnyaValue {
  barang_nama: string;
  nama_satuan: string;
  harga_satuan: number;
  /** 1 = harga per m² (lebar × panjang × jumlah). 0 = flat per satuan. */
  butuh_dimensi_status: number;
  kategori_id?: string | null;
  kategori?: string | null;
  // Rincian Internal opsional. Kosong = item "pending" vendor/HPP (ditangani
  // safeguard C2 di pos-mutations / Task 4 saat checkout).
  vendor_subkontrak_id?: string | null;
  biaya_subkontrak?: number | null;
  metode_bayar_vendor?: "CASH" | "NET30" | "TRANSFER" | null;
}

interface ModalTambahItemLainnyaProps {
  open: boolean;
  subkontraktor: SubkontraktorOption[];
  kategoriOptions: KategoriOption[];
  onClose: () => void;
  onSave: (value: TambahItemLainnyaValue) => void | Promise<void>;
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

export default function ModalTambahItemLainnya({
  open,
  subkontraktor,
  kategoriOptions,
  onClose,
  onSave,
}: ModalTambahItemLainnyaProps) {
  const [namaItem, setNamaItem] = useState("");
  const [namaSatuan, setNamaSatuan] = useState("pcs");
  const [hargaJual, setHargaJual] = useState("");
  const [berdimensi, setBerdimensi] = useState(false);
  const [kategoriId, setKategoriId] = useState<string | null>(null);
  const [kategoriNama, setKategoriNama] = useState<string | null>(null);
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [biayaSubkontrak, setBiayaSubkontrak] = useState("");
  const [metodeBayar, setMetodeBayar] = useState<"CASH" | "NET30" | "TRANSFER">(
    "CASH",
  );
  const [tampilkanInternal, setTampilkanInternal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setNamaItem("");
    setNamaSatuan("pcs");
    setHargaJual("");
    setBerdimensi(false);
    setKategoriId(null);
    setKategoriNama(null);
    setVendorId(null);
    setBiayaSubkontrak("");
    setMetodeBayar("CASH");
    setTampilkanInternal(false);
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    const parsedHarga = Number(hargaJual);
    const parsedBiaya = Number(biayaSubkontrak);

    if (!namaItem.trim()) {
      setError("Nama item wajib diisi");
      return;
    }
    if (!Number.isFinite(parsedHarga) || parsedHarga < 0) {
      setError("Harga jual tidak valid");
      return;
    }
    // Vendor/biaya/metode OPSIONAL. Pending (vendor/biaya kosong) ditangani safeguard
    // C2 di pos-mutations saat checkout. Kalau vendor diisi, biaya wajib > 0.
    if (vendorId) {
      if (!Number.isFinite(parsedBiaya) || parsedBiaya <= 0) {
        setTampilkanInternal(true);
        setError("Biaya subkontrak harus lebih dari 0 bila vendor dipilih.");
        return;
      }
    }

    setSaving(true);
    try {
      await onSave({
        barang_nama: namaItem.trim(),
        nama_satuan: berdimensi ? "m²" : namaSatuan,
        harga_satuan: parsedHarga,
        butuh_dimensi_status: berdimensi ? 1 : 0,
        kategori_id: kategoriId,
        kategori: kategoriNama,
        vendor_subkontrak_id: vendorId || null,
        biaya_subkontrak: vendorId ? parsedBiaya : null,
        metode_bayar_vendor: vendorId ? metodeBayar : null,
      });
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalFormShell
      open={open}
      onClose={handleClose}
      maxWidthClass="max-w-lg"
      header={
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
            Tambah Item Lainnya
          </h2>
          <button
            type="button"
            onClick={handleClose}
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
            onClick={handleClose}
            className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-700 hover:to-purple-800 text-white font-semibold disabled:opacity-50"
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
          <label className="flex items-start gap-2 text-sm rounded-lg border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/50 dark:bg-emerald-900/10 p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={berdimensi}
              onChange={(e) => setBerdimensi(e.target.checked)}
              className="mt-0.5 w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500"
            />
            <span>
              <span className="font-semibold text-emerald-800 dark:text-emerald-200 block">
                Butuh dimensi (harga per m²)
              </span>
              <span className="text-xs text-emerald-700 dark:text-emerald-300">
                Harga dihitung dari lebar × panjang × jumlah. Satuan dikunci ke
                m².
              </span>
            </span>
          </label>
          <label className="block text-sm">
            <span className="text-slate-700 dark:text-slate-200">Satuan</span>
            <select
              value={berdimensi ? "m²" : namaSatuan}
              onChange={(e) => setNamaSatuan(e.target.value)}
              disabled={berdimensi}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-slate-800 dark:text-slate-100 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {SATUAN_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-slate-700 dark:text-slate-200">
              {berdimensi ? "Harga jual per m²" : "Harga jual"}
            </span>
            <input
              type="number"
              min={0}
              value={hargaJual}
              onChange={(e) => setHargaJual(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-slate-800 dark:text-slate-100"
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-700 dark:text-slate-200">Kategori</span>
            <select
              value={kategoriId ?? ""}
              onChange={(e) => {
                const selected = e.target.options[e.target.selectedIndex];
                setKategoriId(e.target.value || null);
                setKategoriNama(e.target.value ? selected.text : null);
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-slate-800 dark:text-slate-100"
            >
              <option value="">— Tanpa kategori —</option>
              {kategoriOptions.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.nama}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setTampilkanInternal((v) => !v)}
            className="flex items-center gap-2 text-sm font-semibold text-violet-600 dark:text-violet-300"
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
                  value={vendorId ?? ""}
                  onChange={(e) => setVendorId(e.target.value || null)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-slate-800 dark:text-slate-100"
                >
                  <option value="">— Pilih vendor (opsional) —</option>
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
