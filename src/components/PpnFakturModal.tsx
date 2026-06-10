"use client";

/**
 * Modal "Faktur Pajak" untuk POS — kasir klik kalau pelanggan B2B mau faktur
 * pajak. Disembunyikan untuk transaksi retail biasa supaya UX kasir tidak
 * berubah dibandingkan POS retail standar.
 *
 * Datanya disimpan di parent state, dan diteruskan ke createSaleAction saat
 * checkout. Modal ini tidak melakukan persistensi sendiri.
 */

import { useEffect, useState } from "react";
import { getNextAvailableNsfpAction, listNsfpPoolAction } from "@/app/pengaturan/actions";
import { formatNsfpString, isValidNpwp, formatNpwp } from "@/lib/ppn-helpers";

export interface PpnFakturData {
  kena_ppn: boolean;
  ppn_persen: number;
  ppn_metode: "EKSKLUSIF" | "INKLUSIF";
  nsfp_kode_transaksi: string;
  nsfp_tahun: string;
  nsfp_nomor_seri: string;
  tanggal_faktur_pajak: string;
  pelanggan_npwp_snapshot: string;
  pelanggan_alamat_npwp_snapshot: string;
  pelanggan_nama_npwp_snapshot: string;
}

interface NsfpRow {
  id: string;
  tahun: string;
  kode_transaksi: string;
  nomor_seri: string;
  status: "TERSEDIA" | "TERPAKAI" | "BATAL";
}

interface Props {
  open: boolean;
  initial: PpnFakturData;
  defaultPpnPersen: number;
  defaultPpnMetode: "EKSKLUSIF" | "INKLUSIF";
  defaultKodeTransaksi: string;
  /** Pelanggan terpilih (untuk autofill NPWP). Opsional. */
  pelanggan?: {
    nama?: string;
    npwp?: string | null;
    alamat_npwp?: string | null;
    nama_di_npwp?: string | null;
  } | null;
  onSave: (data: PpnFakturData) => void;
  onClear: () => void;
  onClose: () => void;
}

export default function PpnFakturModal({
  open,
  initial,
  defaultPpnPersen,
  defaultPpnMetode,
  defaultKodeTransaksi,
  pelanggan,
  onSave,
  onClear,
  onClose,
}: Props) {
  const [data, setData] = useState<PpnFakturData>(initial);
  const [available, setAvailable] = useState<NsfpRow[]>([]);
  const [loadingNsfp, setLoadingNsfp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      // Reset ke kondisi awal saat modal dibuka.
      setData({
        ...initial,
        ppn_persen: initial.ppn_persen || defaultPpnPersen,
        ppn_metode: initial.ppn_metode || defaultPpnMetode,
        nsfp_kode_transaksi:
          initial.nsfp_kode_transaksi || defaultKodeTransaksi,
        // Autofill NPWP dari pelanggan kalau belum diisi manual
        pelanggan_npwp_snapshot:
          initial.pelanggan_npwp_snapshot || pelanggan?.npwp || "",
        pelanggan_alamat_npwp_snapshot:
          initial.pelanggan_alamat_npwp_snapshot ||
          pelanggan?.alamat_npwp ||
          "",
        pelanggan_nama_npwp_snapshot:
          initial.pelanggan_nama_npwp_snapshot ||
          pelanggan?.nama_di_npwp ||
          pelanggan?.nama ||
          "",
      });
      setError(null);
    }
  }, [open, initial, defaultPpnPersen, defaultPpnMetode, defaultKodeTransaksi, pelanggan]);

  useEffect(() => {
    if (!open) return;
    setLoadingNsfp(true);
    listNsfpPoolAction({ status: "TERSEDIA", limit: 100 })
      .then((rows) => setAvailable(rows as NsfpRow[]))
      .catch(() => setAvailable([]))
      .finally(() => setLoadingNsfp(false));
  }, [open]);

  const pickFirstAvailable = async () => {
    try {
      const next = await getNextAvailableNsfpAction(
        undefined,
        data.nsfp_kode_transaksi
      );
      if (!next) {
        setError(
          "Tidak ada NSFP tersedia. Impor dulu dari Coretax di Pengaturan → PPN."
        );
        return;
      }
      setData((d) => ({
        ...d,
        nsfp_tahun: next.tahun,
        nsfp_kode_transaksi: next.kode_transaksi,
        nsfp_nomor_seri: next.nomor_seri,
      }));
    } catch (e: any) {
      setError(e?.message || "Gagal mengambil NSFP");
    }
  };

  const handleSave = () => {
    if (data.pelanggan_npwp_snapshot && !isValidNpwp(data.pelanggan_npwp_snapshot)) {
      setError("Format NPWP pelanggan tidak valid (15 atau 16 digit)");
      return;
    }
    if (
      !data.nsfp_kode_transaksi ||
      !data.nsfp_tahun ||
      !data.nsfp_nomor_seri
    ) {
      setError("NSFP wajib lengkap. Pilih dari daftar atau klik 'Pakai NSFP berikutnya'.");
      return;
    }
    if (!data.tanggal_faktur_pajak) {
      setError("Tanggal faktur pajak wajib diisi");
      return;
    }
    setError(null);
    onSave({ ...data, kena_ppn: true });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800 dark:text-slate-100">
            Faktur Pajak (PPN Keluaran)
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="px-3 py-2 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 text-red-700 rounded text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                Tarif PPN (%)
              </label>
              <input
                type="number"
                step="0.01"
                value={data.ppn_persen}
                onChange={(e) =>
                  setData((d) => ({ ...d, ppn_persen: parseFloat(e.target.value) || 0 }))
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                Metode harga
              </label>
              <select
                value={data.ppn_metode}
                onChange={(e) =>
                  setData((d) => ({
                    ...d,
                    ppn_metode: e.target.value as "EKSKLUSIF" | "INKLUSIF",
                  }))
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100"
              >
                <option value="EKSKLUSIF" className="bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100">Belum termasuk PPN</option>
                <option value="INKLUSIF" className="bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100">Sudah termasuk PPN</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                Kode transaksi
              </label>
              <select
                value={data.nsfp_kode_transaksi}
                onChange={(e) =>
                  setData((d) => ({ ...d, nsfp_kode_transaksi: e.target.value }))
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100"
              >
                <option value="01" className="bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100">01</option>
                <option value="02" className="bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100">02</option>
                <option value="03" className="bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100">03</option>
                <option value="04" className="bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100">04</option>
                <option value="06" className="bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100">06</option>
                <option value="07" className="bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100">07</option>
                <option value="08" className="bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100">08</option>
                <option value="09" className="bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100">09</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                Tahun
              </label>
              <input
                type="text"
                maxLength={2}
                value={data.nsfp_tahun}
                onChange={(e) =>
                  setData((d) => ({ ...d, nsfp_tahun: e.target.value }))
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                Nomor seri
              </label>
              <input
                type="text"
                maxLength={8}
                value={data.nsfp_nomor_seri}
                onChange={(e) =>
                  setData((d) => ({
                    ...d,
                    nsfp_nomor_seri: e.target.value.replace(/\D/g, ""),
                  }))
                }
                placeholder="00000001"
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 font-mono"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500 dark:text-slate-400">
              {data.nsfp_kode_transaksi && data.nsfp_tahun && data.nsfp_nomor_seri
                ? `NSFP: ${formatNsfpString(
                    data.nsfp_kode_transaksi,
                    data.nsfp_tahun,
                    data.nsfp_nomor_seri.padStart(8, "0")
                  )}`
                : "NSFP belum lengkap"}
            </p>
            <button
              type="button"
              onClick={pickFirstAvailable}
              className="text-sm px-3 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700"
              disabled={loadingNsfp}
            >
              {loadingNsfp ? "Memuat..." : "Pakai NSFP berikutnya"}
            </button>
          </div>

          {available.length > 0 && (
            <details className="text-xs text-gray-600 dark:text-slate-300">
              <summary className="cursor-pointer">
                Daftar NSFP tersedia ({available.length})
              </summary>
              <div className="mt-2 max-h-40 overflow-y-auto border border-gray-200 dark:border-slate-800 rounded p-2 space-y-1 font-mono">
                {available.slice(0, 50).map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() =>
                      setData((d) => ({
                        ...d,
                        nsfp_tahun: row.tahun,
                        nsfp_kode_transaksi: row.kode_transaksi,
                        nsfp_nomor_seri: row.nomor_seri,
                      }))
                    }
                    className="block w-full text-left hover:bg-gray-100 dark:hover:bg-slate-800 px-2 py-1 rounded"
                  >
                    {formatNsfpString(row.kode_transaksi, row.tahun, row.nomor_seri)}
                  </button>
                ))}
              </div>
            </details>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              Tanggal faktur pajak
            </label>
            <input
              type="date"
              value={data.tanggal_faktur_pajak}
              onChange={(e) =>
                setData((d) => ({ ...d, tanggal_faktur_pajak: e.target.value }))
              }
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 dark:[color-scheme:dark]"
            />
          </div>

          <div className="border-t border-gray-200 dark:border-slate-800 pt-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300">
              Data pelanggan untuk faktur pajak
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 dark:text-slate-300 mb-1">
                  Nama (sesuai NPWP)
                </label>
                <input
                  type="text"
                  value={data.pelanggan_nama_npwp_snapshot}
                  onChange={(e) =>
                    setData((d) => ({
                      ...d,
                      pelanggan_nama_npwp_snapshot: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 dark:text-slate-300 mb-1">
                  NPWP pelanggan
                </label>
                <input
                  type="text"
                  value={data.pelanggan_npwp_snapshot}
                  onChange={(e) =>
                    setData((d) => ({
                      ...d,
                      pelanggan_npwp_snapshot: e.target.value,
                    }))
                  }
                  placeholder="01.234.567.8-901.234"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 font-mono"
                />
                {data.pelanggan_npwp_snapshot && (
                  <p className="text-xs text-gray-400 mt-1">
                    {formatNpwp(data.pelanggan_npwp_snapshot)}
                  </p>
                )}
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-slate-300 mb-1">
                Alamat sesuai NPWP
              </label>
              <textarea
                value={data.pelanggan_alamat_npwp_snapshot}
                onChange={(e) =>
                  setData((d) => ({
                    ...d,
                    pelanggan_alamat_npwp_snapshot: e.target.value,
                  }))
                }
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100"
              />
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 dark:border-slate-800 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              onClear();
              onClose();
            }}
            className="text-sm text-red-600 hover:text-red-800 dark:text-red-200"
          >
            Hapus PPN dari transaksi
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium"
            >
              Simpan ke transaksi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
