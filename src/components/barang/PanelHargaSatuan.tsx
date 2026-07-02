"use client";

import type { UnitPrice } from "./types-barang";

// Panel "Harga Per Satuan" (Section 2) di ModalTambahBarang. Diekstrak (Fase 6 B5).
// Props-only: induk pegang daftar unitPrices + handler tambah/hapus/ubah.

export interface PanelHargaSatuanProps {
  unitPrices: UnitPrice[];
  baseUnit: string;
  unitsData: { id: string; nama: string }[];
  loadingMaster: boolean;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, field: keyof UnitPrice, value: unknown) => void;
  /** Simpan draf form + buka halaman kelola satuan. */
  onManageUnit: () => void;
}

/** Format angka jadi Rupiah tanpa desimal. */
function formatRupiah(value: number): string {
  if (!value || value === 0) return "Rp 0";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export default function PanelHargaSatuan({
  unitPrices,
  baseUnit,
  unitsData,
  loadingMaster,
  onAdd,
  onRemove,
  onUpdate,
  onManageUnit,
}: PanelHargaSatuanProps) {
  return (
    <div className="bg-blue-50 dark:bg-slate-800 rounded-xl p-4 border-2 border-blue-200 dark:border-slate-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-gray-800 dark:text-slate-100 flex items-center gap-2">
          <span className="w-8 h-8 bg-blue-500 dark:bg-slate-700 text-white rounded-lg flex items-center justify-center text-sm font-bold">
            2
          </span>
          Produk Jual
        </h3>
        <button
          type="button"
          onClick={onAdd}
          className="px-3 py-1.5 bg-blue-500 dark:bg-slate-700 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-semibold flex items-center gap-1"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Tambah Satuan
        </button>
      </div>

      <div className="space-y-4">
        {unitPrices.map((up, index) => (
          <div
            key={index}
            className="bg-white dark:bg-slate-900 rounded-lg p-4 border-2 border-gray-200 dark:border-slate-800"
          >
            <div className="flex items-start justify-between mb-3">
              <span className="text-sm font-bold text-gray-600 dark:text-slate-300">
                Produk #{index + 1}
              </span>
              {unitPrices.length > 1 && (
                <button
                  type="button"
                  onClick={() => onRemove(index)}
                  className="text-red-500 hover:text-red-700 p-1"
                  title="Hapus satuan ini"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
              {/* Nama Produk — label customer-facing di POS */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1">
                  Nama Produk
                </label>
                <input
                  type="text"
                  value={up.nama_produk_jual ?? ""}
                  onChange={(e) =>
                    onUpdate(index, "nama_produk_jual", e.target.value || null)
                  }
                  placeholder="Nama tampil di POS (opsional)"
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-slate-100"
                />
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                  Kosong = pakai nama satuan
                </p>
              </div>

              {/* Nama Satuan - DROPDOWN */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1">
                  Satuan <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={up.nama_satuan}
                  onChange={(e) =>
                    onUpdate(index, "nama_satuan", e.target.value)
                  }
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-slate-100"
                  disabled={loadingMaster}
                >
                  <option value="">Pilih satuan...</option>
                  {unitsData.map((unit) => (
                    <option key={unit.id} value={unit.nama}>
                      {unit.nama}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                  Tidak ada?{" "}
                  <button
                    type="button"
                    onClick={onManageUnit}
                    className="text-blue-600 dark:text-blue-300 hover:underline font-semibold"
                  >
                    Kelola
                  </button>
                </p>
              </div>

              {/* Unit conversion */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1">
                  Konversi <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={up.faktor_konversi}
                  onChange={(e) =>
                    onUpdate(
                      index,
                      "faktor_konversi",
                      parseFloat(e.target.value) || 1,
                    )
                  }
                  placeholder="1"
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-slate-100"
                />
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                  1 {up.nama_satuan} = {up.faktor_konversi} {baseUnit}
                </p>
              </div>

              {/* Harga Beli */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1">
                  HPP Rata-rata Awal
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={up.harga_beli}
                  onChange={(e) =>
                    onUpdate(
                      index,
                      "harga_beli",
                      parseFloat(e.target.value) || 0,
                    )
                  }
                  placeholder="0"
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-slate-100"
                />
                <p className="text-xs text-emerald-600 dark:text-emerald-300 mt-1 font-medium">
                  {formatRupiah(up.harga_beli)}
                </p>
              </div>

              {/* Harga Jual */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1">
                  Harga Jual
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={up.harga_jual}
                  onChange={(e) =>
                    onUpdate(
                      index,
                      "harga_jual",
                      parseFloat(e.target.value) || 0,
                    )
                  }
                  placeholder="0"
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-slate-100"
                />
                <p className="text-xs text-emerald-600 dark:text-emerald-300 mt-1 font-medium">
                  {formatRupiah(up.harga_jual)}
                </p>
              </div>

              {/* Harga Member */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1">
                  Harga Member
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={up.harga_member}
                  onChange={(e) =>
                    onUpdate(
                      index,
                      "harga_member",
                      parseFloat(e.target.value) || 0,
                    )
                  }
                  placeholder="0"
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-slate-100"
                />
                <p className="text-xs text-emerald-600 dark:text-emerald-300 mt-1 font-medium">
                  {formatRupiah(up.harga_member)}
                </p>
              </div>
            </div>
          </div>
        ))}
        <p className="text-xs text-blue-700 dark:text-blue-300 mt-3">
          Setiap satuan di bawah selalu muncul sebagai kartu terpisah di POS,
          terlepas dari centang &quot;Munculkan di POS&quot; pada barang induk.
        </p>
      </div>

      <div className="mt-4 bg-blue-100 dark:bg-blue-900/30 border border-blue-300 rounded-lg p-3">
        <p className="text-xs text-blue-800 dark:text-blue-200 font-semibold mb-1">
          Contoh Penggunaan:
        </p>
        <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1 ml-4">
          <li>
            • <strong>Flexi Banner:</strong> Nama Produk "Print Banner per m²",
            Satuan "m²", Konversi 1
          </li>
          <li>
            • <strong>HVS A4:</strong> Nama Produk "Print Hitam Putih A4",
            Satuan "lembar", Konversi 1
          </li>
          <li>
            • <strong>Kertas Foto:</strong> Nama Produk "Print Foto 4R", Satuan
            "lembar", Konversi 1
          </li>
        </ul>
      </div>
    </div>
  );
}
