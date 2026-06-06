"use client";

// Panel PPN masukan di FormulirPembelian (baris tfoot). Diekstrak (Fase 6 B4).
// Props-only: induk pegang formData + handleInputChange.

export interface PanelPpnPembelianProps {
  kenaPpn: boolean;
  ppnPersen: number;
  ppnMetode: "EKSKLUSIF" | "INKLUSIF";
  dapatDikreditkan: boolean;
  nomorFakturPajakVendor: string;
  tanggalFakturPajak: string;
  onChange: <K extends keyof PanelPpnValues>(field: K, value: PanelPpnValues[K]) => void;
}

/** Nama field harus sama dengan kunci di PurchaseFormData induk. */
export interface PanelPpnValues {
  kena_ppn: boolean;
  ppn_persen: number;
  ppn_metode: "EKSKLUSIF" | "INKLUSIF";
  dapat_dikreditkan: boolean;
  nomor_faktur_pajak_vendor: string;
  tanggal_faktur_pajak: string;
}

export default function PanelPpnPembelian({
  kenaPpn,
  ppnPersen,
  ppnMetode,
  dapatDikreditkan,
  nomorFakturPajakVendor,
  tanggalFakturPajak,
  onChange,
}: PanelPpnPembelianProps) {
  return (
    <tr className="bg-emerald-50 dark:bg-slate-800 border-t border-gray-200 dark:border-slate-800">
      <td colSpan={6} className="px-4 py-3 space-y-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={kenaPpn}
            onChange={(e) => onChange("kena_ppn", e.target.checked)}
            className="w-4 h-4 rounded text-emerald-600 dark:text-emerald-300"
          />
          <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
            Pembelian ini kena PPN (PPN masukan)
          </span>
        </label>
        {kenaPpn && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">
                Tarif PPN (%)
              </label>
              <input
                type="number"
                step="0.01"
                value={ppnPersen}
                onChange={(e) =>
                  onChange("ppn_persen", parseFloat(e.target.value) || 0)
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">
                Metode harga
              </label>
              <select
                value={ppnMetode}
                onChange={(e) =>
                  onChange(
                    "ppn_metode",
                    e.target.value as "EKSKLUSIF" | "INKLUSIF"
                  )
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="EKSKLUSIF">Belum termasuk PPN</option>
                <option value="INKLUSIF">Sudah termasuk PPN</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">
                No. Faktur Pajak Vendor
              </label>
              <input
                type="text"
                value={nomorFakturPajakVendor}
                onChange={(e) =>
                  onChange("nomor_faktur_pajak_vendor", e.target.value)
                }
                placeholder="010.000-25.00000001"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">
                Tanggal Faktur Pajak
              </label>
              <input
                type="date"
                value={tanggalFakturPajak}
                onChange={(e) =>
                  onChange("tanggal_faktur_pajak", e.target.value)
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div className="md:col-span-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={dapatDikreditkan}
                  onChange={(e) =>
                    onChange("dapat_dikreditkan", e.target.checked)
                  }
                  className="w-4 h-4 rounded text-emerald-600 dark:text-emerald-300"
                />
                <span className="text-xs text-gray-700 dark:text-slate-300">
                  PPN masukan dapat dikreditkan (centang kalau faktur
                  pajak vendor lengkap dan vendor PKP)
                </span>
              </label>
            </div>
          </div>
        )}
      </td>
    </tr>
  );
}
