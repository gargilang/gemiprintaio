"use client";

/**
 * Modal for adding (or editing) a Maklon (subcontract) line on a POS sale.
 *
 * Maklon line shape:
 *   - deskripsi_pekerjaan: free text, becomes the line name on faktur + thermal
 *   - jumlah + harga_satuan: how the customer is billed
 *   - vendor_subkontrak_id + biaya_subkontrak: how much we pay the partner shop
 *   - metode_bayar_vendor: CASH (immediate) or NET30 (becomes hutang)
 *
 * Margin = (jumlah * harga_satuan) - biaya_subkontrak. We surface it in the
 * footer as a quick sanity check for the kasir; values < 0 trigger a yellow
 * warning but are NOT blocked (some maklon jobs are deliberately at-cost or
 * at a loss for relationship reasons).
 */

import { useEffect, useMemo, useState } from "react";
import ModalFormShell from "@/components/ModalFormShell";

export interface MaklonLineFormValue {
  deskripsi_pekerjaan: string;
  jumlah: number;
  nama_satuan: string;
  harga_satuan: number;
  subtotal: number;
  vendor_subkontrak_id: string;
  biaya_subkontrak: number;
  metode_bayar_vendor: "CASH" | "NET30";
}

interface SubkontraktorOption {
  id: string;
  nama_perusahaan: string;
  kontak_person?: string | null;
}

interface MaklonLineModalProps {
  show: boolean;
  initialValue?: Partial<MaklonLineFormValue> | null;
  subkontraktor: SubkontraktorOption[];
  isEditing?: boolean;
  onClose: () => void;
  onSave: (value: MaklonLineFormValue) => void;
  onShowMessage?: (type: "success" | "error", message: string) => void;
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

export default function MaklonLineModal({
  show,
  initialValue,
  subkontraktor,
  isEditing = false,
  onClose,
  onSave,
  onShowMessage,
}: MaklonLineModalProps) {
  // Defensive default: cache lama (pre-maklon) bisa kembalikan POSInitData
  // tanpa field subkontraktor, jadi prop di sini bisa undefined sampai
  // SWR re-fetch. Render aman dengan empty list.
  const safeSubkontraktor = subkontraktor ?? [];
  const [deskripsi, setDeskripsi] = useState("");
  const [jumlahStr, setJumlahStr] = useState("1");
  const [namaSatuan, setNamaSatuan] = useState("pcs");
  const [hargaJualStr, setHargaJualStr] = useState("");
  const [biayaSubkontrakStr, setBiayaSubkontrakStr] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [metodeBayarVendor, setMetodeBayarVendor] = useState<"CASH" | "NET30">(
    "CASH"
  );

  // Reset form whenever the modal opens with a new initialValue.
  useEffect(() => {
    if (!show) return;
    setDeskripsi(initialValue?.deskripsi_pekerjaan ?? "");
    setJumlahStr(
      initialValue?.jumlah && initialValue.jumlah > 0
        ? String(initialValue.jumlah)
        : "1"
    );
    setNamaSatuan(initialValue?.nama_satuan ?? "pcs");
    setHargaJualStr(
      initialValue?.harga_satuan && initialValue.harga_satuan > 0
        ? String(initialValue.harga_satuan)
        : ""
    );
    setBiayaSubkontrakStr(
      initialValue?.biaya_subkontrak && initialValue.biaya_subkontrak > 0
        ? String(initialValue.biaya_subkontrak)
        : ""
    );
    setVendorId(initialValue?.vendor_subkontrak_id ?? "");
    setMetodeBayarVendor(
      (initialValue?.metode_bayar_vendor as "CASH" | "NET30") || "CASH"
    );
  }, [show, initialValue]);

  const jumlah = useMemo(() => {
    const n = parseFloat(jumlahStr);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [jumlahStr]);

  const hargaJual = useMemo(() => {
    const n = parseFloat(hargaJualStr);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [hargaJualStr]);

  const biayaSubkontrak = useMemo(() => {
    const n = parseFloat(biayaSubkontrakStr);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [biayaSubkontrakStr]);

  const subtotalCustomer = useMemo(
    () => jumlah * hargaJual,
    [jumlah, hargaJual]
  );
  const margin = subtotalCustomer - biayaSubkontrak;
  const isLoss = biayaSubkontrak > 0 && margin < 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const errors: string[] = [];
    if (!deskripsi.trim()) errors.push("Deskripsi pekerjaan wajib diisi");
    if (jumlah <= 0) errors.push("Jumlah harus lebih dari 0");
    if (hargaJual <= 0)
      errors.push("Harga jual ke customer harus lebih dari 0");
    if (biayaSubkontrak <= 0)
      errors.push("Biaya subkontrak harus lebih dari 0");
    if (!vendorId) errors.push("Vendor subkontraktor wajib dipilih");

    if (errors.length > 0) {
      onShowMessage?.("error", errors[0]);
      return;
    }

    onSave({
      deskripsi_pekerjaan: deskripsi.trim(),
      jumlah,
      nama_satuan: namaSatuan.trim() || "pcs",
      harga_satuan: hargaJual,
      subtotal: subtotalCustomer,
      vendor_subkontrak_id: vendorId,
      biaya_subkontrak: biayaSubkontrak,
      metode_bayar_vendor: metodeBayarVendor,
    });
  };

  return (
    <ModalFormShell
      open={show}
      onClose={onClose}
      maxWidthClass="max-w-2xl"
      backdropClassName="bg-black/50 backdrop-blur-sm"
      header={
        <div className="bg-gradient-to-r from-[#0a1b3d] to-[#2266ff] px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-white dark:bg-slate-900/20 rounded-lg shrink-0">
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
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-white truncate">
                {isEditing ? "Edit Item Maklon" : "Tambah Item Maklon"}
              </h2>
              <p className="text-xs text-white/90">
                Pekerjaan yang dikerjakan vendor subkontraktor
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
        <div className="bg-gray-50 dark:bg-slate-800 px-6 py-4 border-t border-gray-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-gray-700 dark:text-slate-300">
              <div>
                Tagih ke customer:{" "}
                <span className="font-bold text-gray-900 dark:text-slate-100">
                  Rp {subtotalCustomer.toLocaleString("id-ID")}
                </span>
              </div>
              <div>
                Bayar ke vendor:{" "}
                <span className="font-bold text-gray-900 dark:text-slate-100">
                  Rp {biayaSubkontrak.toLocaleString("id-ID")}
                </span>
              </div>
              <div
                className={`mt-0.5 font-semibold ${
                  isLoss
                    ? "text-amber-700 dark:text-amber-300"
                    : margin > 0
                      ? "text-emerald-700 dark:text-emerald-300"
                      : "text-gray-700 dark:text-slate-300"
                }`}
              >
                Margin:{" "}
                {margin >= 0 ? "+" : "−"}Rp{" "}
                {Math.abs(margin).toLocaleString("id-ID")}
                {isLoss && " (rugi)"}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 bg-white dark:bg-slate-900 border-2 border-gray-300 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-100 transition-colors font-semibold"
              >
                Batal
              </button>
              <button
                type="submit"
                form="maklon-line-form"
                className="px-5 py-2 bg-gradient-to-r from-[#0a1b3d] to-[#2266ff] text-white rounded-lg hover:from-[#0a1b3d]/90 hover:to-[#2266ff]/90 transition-all font-semibold"
              >
                {isEditing ? "Simpan Perubahan" : "Tambah ke Keranjang"}
              </button>
            </div>
          </div>
        </div>
      }
    >
      <form
        id="maklon-line-form"
        onSubmit={handleSubmit}
        className="p-6 space-y-4"
      >
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">
            Deskripsi Pekerjaan <span className="text-red-500">*</span>
          </label>
          <textarea
            value={deskripsi}
            onChange={(e) => setDeskripsi(e.target.value)}
            rows={2}
            placeholder='Contoh: "Cetak banner 3 x 2 meter, 5 pcs"'
            className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-[#00afef] dark:bg-slate-800 dark:text-slate-100"
            required
          />
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
            Akan tampil di faktur sebagai nama item.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">
              Jumlah <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={jumlahStr}
              onChange={(e) => setJumlahStr(e.target.value)}
              className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-[#00afef] dark:bg-slate-800 dark:text-slate-100"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">
              Satuan
            </label>
            <input
              type="text"
              list="maklon-satuan-options"
              value={namaSatuan}
              onChange={(e) => setNamaSatuan(e.target.value)}
              className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-[#00afef] dark:bg-slate-800 dark:text-slate-100"
            />
            <datalist id="maklon-satuan-options">
              {SATUAN_OPTIONS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">
              Harga Jual / Satuan <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              step="100"
              min="0"
              value={hargaJualStr}
              onChange={(e) => setHargaJualStr(e.target.value)}
              placeholder="0"
              className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-[#00afef] dark:bg-slate-800 dark:text-slate-100"
              required
            />
          </div>
        </div>

        <div className="border-t border-gray-200 dark:border-slate-800 pt-4">
          <div className="text-xs font-bold uppercase tracking-wide text-[#2266ff] mb-2">
            Vendor Subkontraktor (Pengerja)
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">
                Vendor <span className="text-red-500">*</span>
              </label>
              <select
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-[#00afef] bg-white dark:bg-slate-900"
                required
              >
                <option value="">Pilih vendor...</option>
                {safeSubkontraktor.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nama_perusahaan}
                    {v.kontak_person ? ` — ${v.kontak_person}` : ""}
                  </option>
                ))}
              </select>
              {safeSubkontraktor.length === 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                  Belum ada vendor bertipe Subkontraktor. Tambahkan di
                  halaman Vendor terlebih dahulu.
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">
                Biaya ke Vendor (Total){" "}
                <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="100"
                min="0"
                value={biayaSubkontrakStr}
                onChange={(e) => setBiayaSubkontrakStr(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-[#00afef] dark:bg-slate-800 dark:text-slate-100"
                required
              />
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                Total biaya untuk seluruh jumlah, bukan per satuan.
              </p>
            </div>
          </div>

          <div className="mt-3">
            <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">
              Cara Bayar Vendor <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              {(
                [
                  {
                    value: "CASH",
                    label: "Cash",
                    sub: "Bayar sekarang",
                  },
                  {
                    value: "NET30",
                    label: "NET30",
                    sub: "Tagihan 30 hari",
                  },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMetodeBayarVendor(opt.value)}
                  className={`flex-1 px-4 py-2 rounded-lg border-2 text-sm font-semibold transition-all ${
                    metodeBayarVendor === opt.value
                      ? "bg-gradient-to-r from-[#0a1b3d] to-[#2266ff] text-white border-[#2266ff] shadow-sm"
                      : "bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 border-gray-300 hover:border-[#2266ff]"
                  }`}
                >
                  <div>{opt.label}</div>
                  <div
                    className={`text-[10px] ${
                      metodeBayarVendor === opt.value
                        ? "text-white/80"
                        : "text-gray-500 dark:text-slate-400"
                    }`}
                  >
                    {opt.sub}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {isLoss && (
          <div className="rounded-lg border-2 border-amber-300 dark:border-amber-800/50 bg-amber-50 dark:bg-slate-800 p-3 text-sm text-amber-900">
            <strong>Peringatan:</strong> Biaya ke vendor lebih besar dari
            harga jual. Transaksi tetap bisa diproses, tapi pastikan ini
            disengaja.
          </div>
        )}
      </form>
    </ModalFormShell>
  );
}
