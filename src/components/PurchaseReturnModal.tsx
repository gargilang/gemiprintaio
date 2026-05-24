"use client";

/**
 * Modal "Retur Vendor" untuk pembelian yang sudah POSTED.
 *
 * Berbeda dari void:
 *   - User pilih per-line qty yang dikembalikan ke vendor.
 *   - Pembelian tetap POSTED, hanya stok yang dikurangi.
 *   - Tidak menghapus catatan keuangan; biaya tetap tercatat sesuai kenyataan
 *     transaksi historis.
 *
 * Catatan: kalau pembelian kena PPN, retur juga butuh nota retur PPN
 * (handled manual lewat Coretax). Modal ini hanya catat sisi inventori.
 */

import { useEffect, useState } from "react";

interface PurchaseLine {
  id: string;
  barang_id: string;
  nama_barang: string;
  jumlah: number;
  nama_satuan: string;
  faktor_konversi: number;
  harga_satuan: number;
}

interface Props {
  open: boolean;
  purchase: {
    id: string;
    nomor_faktur?: string;
    nomor_pembelian?: string;
    items: PurchaseLine[];
  } | null;
  onClose: () => void;
  onSubmit: (input: {
    reason: string;
    items: Array<{ item_pembelian_id: string; qty: number }>;
  }) => Promise<void>;
}

export default function PurchaseReturnModal({
  open,
  purchase,
  onClose,
  onSubmit,
}: Props) {
  const [reason, setReason] = useState("");
  const [returQty, setReturQty] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason("");
      setReturQty({});
      setError(null);
    }
  }, [open, purchase?.id]);

  if (!open || !purchase) return null;

  const totalLines = purchase.items.length;
  const filledLines = Object.values(returQty).filter(
    (v) => Number(v) > 0
  ).length;

  const handleSubmit = async () => {
    if (!reason.trim()) {
      setError("Alasan retur wajib diisi");
      return;
    }
    const items = purchase.items
      .map((line) => ({
        item_pembelian_id: line.id,
        qty: Number(returQty[line.id] || 0),
      }))
      .filter((it) => it.qty > 0);
    if (items.length === 0) {
      setError("Minimal satu line dengan qty > 0");
      return;
    }
    // Validasi qty tidak lebih dari original
    for (const it of items) {
      const line = purchase.items.find((l) => l.id === it.item_pembelian_id);
      if (line && it.qty > line.jumlah) {
        setError(
          `Qty retur "${line.nama_barang}" (${it.qty}) melebihi qty pembelian (${line.jumlah})`
        );
        return;
      }
    }
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({ reason: reason.trim(), items });
      onClose();
    } catch (e: any) {
      setError(e?.message || "Gagal melakukan retur");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-800 dark:text-slate-100">
              Retur Vendor
            </h2>
            <p className="text-xs text-gray-500 dark:text-slate-400">
              Pembelian{" "}
              {purchase.nomor_faktur || purchase.nomor_pembelian || purchase.id}
            </p>
          </div>
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

          <p className="text-sm text-gray-600 dark:text-slate-300">
            Isi qty yang akan dikembalikan ke vendor di kolom "Retur".
            Stok akan otomatis dikurangi. Kalau stok sudah dipakai untuk
            penjualan, sistem akan menolak retur dengan pesan jelas — kamu
            harus retur lebih sedikit atau batalkan penjualan terkait dulu.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-gray-200 dark:border-slate-800">
              <thead className="bg-gray-50 dark:bg-slate-800 text-xs">
                <tr>
                  <th className="px-3 py-2 text-left">Barang</th>
                  <th className="px-3 py-2 text-right">Qty Beli</th>
                  <th className="px-3 py-2 text-left">Satuan</th>
                  <th className="px-3 py-2 text-right">Harga</th>
                  <th className="px-3 py-2 text-right">Retur</th>
                </tr>
              </thead>
              <tbody>
                {purchase.items.map((line) => (
                  <tr key={line.id} className="border-t border-gray-200 dark:border-slate-800">
                    <td className="px-3 py-2 font-medium">{line.nama_barang}</td>
                    <td className="px-3 py-2 text-right">{line.jumlah}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-slate-300">{line.nama_satuan}</td>
                    <td className="px-3 py-2 text-right text-gray-600 dark:text-slate-300">
                      Rp {Number(line.harga_satuan).toLocaleString("id-ID")}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max={line.jumlah}
                        value={returQty[line.id] || ""}
                        onChange={(e) =>
                          setReturQty((prev) => ({
                            ...prev,
                            [line.id]: e.target.value,
                          }))
                        }
                        placeholder="0"
                        className="w-24 px-2 py-1 border border-gray-300 rounded text-right"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              Alasan retur <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Barang cacat, salah kirim, kelebihan, dll."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>

          <p className="text-xs text-gray-500 dark:text-slate-400">
            {filledLines} dari {totalLines} line akan di-retur.
          </p>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 dark:border-slate-800 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            disabled={submitting}
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium disabled:opacity-50"
          >
            {submitting ? "Memproses..." : "Lakukan Retur"}
          </button>
        </div>
      </div>
    </div>
  );
}
