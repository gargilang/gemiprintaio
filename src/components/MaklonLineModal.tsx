"use client";

/**
 * Modal untuk menambah (atau edit) entri Maklon (subkontrak) di penjualan POS.
 *
 * Bentuk entri Maklon — satu form = satu vendor + satu metode pembayaran, tapi
 * mendukung beberapa baris item dalam satu submission. Setiap baris membawa
 * deskripsi, qty, harga jual, dan biaya vendor sendiri.
 *
 * Saat disimpan, parent (POSPage) memecah nilai form ke N CartItem,
 * satu per baris, semua berbagi vendor + metode_bayar_vendor yang sama.
 *
 * Margin per baris = (jumlah * harga_satuan) - biaya_subkontrak.
 * Total margin = jumlah margin semua baris. Ditampilkan di footer; total negatif
 * memicu peringatan tapi tidak diblokir.
 */

import { useEffect, useMemo, useState } from "react";
import ModalFormShell from "@/components/ModalFormShell";

export interface MaklonLineItem {
  deskripsi_pekerjaan: string;
  jumlah: number;
  nama_satuan: string;
  harga_satuan: number;
  biaya_subkontrak: number;
}

export interface MaklonLineFormValue {
  vendor_subkontrak_id: string;
  metode_bayar_vendor: "CASH" | "NET30";
  lines: MaklonLineItem[];
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

interface LineDraft {
  deskripsi: string;
  jumlahStr: string;
  satuan: string;
  hargaJualStr: string;
  biayaSubkontrakStr: string;
}

const EMPTY_LINE: LineDraft = {
  deskripsi: "",
  jumlahStr: "1",
  satuan: "pcs",
  hargaJualStr: "",
  biayaSubkontrakStr: "",
};

function lineToDraft(line: MaklonLineItem): LineDraft {
  return {
    deskripsi: line.deskripsi_pekerjaan,
    jumlahStr: line.jumlah > 0 ? String(line.jumlah) : "1",
    satuan: line.nama_satuan || "pcs",
    hargaJualStr: line.harga_satuan > 0 ? String(line.harga_satuan) : "",
    biayaSubkontrakStr:
      line.biaya_subkontrak > 0 ? String(line.biaya_subkontrak) : "",
  };
}

function parsePositive(str: string): number {
  const n = parseFloat(str);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function parseNonNegative(str: string): number {
  const n = parseFloat(str);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export default function MaklonLineModal({
  show,
  initialValue,
  subkontraktor,
  isEditing = false,
  onClose,
  onSave,
  onShowMessage,
}: MaklonLineModalProps) {
  const safeSubkontraktor = subkontraktor ?? [];

  const [vendorId, setVendorId] = useState("");
  const [metodeBayarVendor, setMetodeBayarVendor] = useState<"CASH" | "NET30">(
    "CASH"
  );
  const [drafts, setDrafts] = useState<LineDraft[]>([{ ...EMPTY_LINE }]);

  // Reset setiap kali modal dibuka dengan initialValue baru.
  useEffect(() => {
    if (!show) return;
    setVendorId(initialValue?.vendor_subkontrak_id ?? "");
    setMetodeBayarVendor(
      (initialValue?.metode_bayar_vendor as "CASH" | "NET30") || "CASH"
    );
    if (initialValue?.lines && initialValue.lines.length > 0) {
      setDrafts(initialValue.lines.map(lineToDraft));
    } else {
      setDrafts([{ ...EMPTY_LINE }]);
    }
  }, [show, initialValue]);

  const lineSummaries = useMemo(
    () =>
      drafts.map((d) => {
        const jumlah = parsePositive(d.jumlahStr);
        const harga = parseNonNegative(d.hargaJualStr);
        const biaya = parseNonNegative(d.biayaSubkontrakStr);
        const subtotal = jumlah * harga;
        const margin = subtotal - biaya;
        return { jumlah, harga, biaya, subtotal, margin };
      }),
    [drafts]
  );

  const totalCustomer = useMemo(
    () => lineSummaries.reduce((sum, s) => sum + s.subtotal, 0),
    [lineSummaries]
  );
  const totalVendor = useMemo(
    () => lineSummaries.reduce((sum, s) => sum + s.biaya, 0),
    [lineSummaries]
  );
  const totalMargin = totalCustomer - totalVendor;
  const isLoss = totalVendor > 0 && totalMargin < 0;

  const updateDraft = (index: number, patch: Partial<LineDraft>) => {
    setDrafts((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const addLine = () => {
    setDrafts((prev) => [...prev, { ...EMPTY_LINE }]);
  };

  const removeLine = (index: number) => {
    setDrafts((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!vendorId) {
      onShowMessage?.("error", "Vendor subkontraktor wajib dipilih");
      return;
    }
    if (drafts.length === 0) {
      onShowMessage?.("error", "Minimal satu baris item");
      return;
    }

    const lines: MaklonLineItem[] = [];
    for (let i = 0; i < drafts.length; i++) {
      const d = drafts[i];
      const jumlah = parsePositive(d.jumlahStr);
      const harga = parseNonNegative(d.hargaJualStr);
      const biaya = parseNonNegative(d.biayaSubkontrakStr);

      if (!d.deskripsi.trim()) {
        onShowMessage?.(
          "error",
          `Baris ${i + 1}: deskripsi pekerjaan wajib diisi`
        );
        return;
      }
      if (jumlah <= 0) {
        onShowMessage?.("error", `Baris ${i + 1}: jumlah harus lebih dari 0`);
        return;
      }
      if (harga <= 0) {
        onShowMessage?.(
          "error",
          `Baris ${i + 1}: harga jual harus lebih dari 0`
        );
        return;
      }
      if (biaya <= 0) {
        onShowMessage?.(
          "error",
          `Baris ${i + 1}: biaya subkontrak harus lebih dari 0`
        );
        return;
      }

      lines.push({
        deskripsi_pekerjaan: d.deskripsi.trim(),
        jumlah,
        nama_satuan: d.satuan.trim() || "pcs",
        harga_satuan: harga,
        biaya_subkontrak: biaya,
      });
    }

    onSave({
      vendor_subkontrak_id: vendorId,
      metode_bayar_vendor: metodeBayarVendor,
      lines,
    });
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
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-white truncate">
                {isEditing ? "Edit Pekerjaan Maklon" : "Tambah Pekerjaan Maklon"}
              </h2>
              <p className="text-xs text-white/90">
                Satu vendor, banyak item. PO ke vendor digabung jadi satu.
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
            <div className="text-xs text-gray-700 dark:text-slate-300 space-y-0.5">
              <div>
                Total tagih ke pelanggan:{" "}
                <span className="font-bold text-gray-900 dark:text-slate-100">
                  Rp {totalCustomer.toLocaleString("id-ID")}
                </span>
              </div>
              <div>
                Total bayar ke vendor:{" "}
                <span className="font-bold text-gray-900 dark:text-slate-100">
                  Rp {totalVendor.toLocaleString("id-ID")}
                </span>
              </div>
              <div
                className={`font-semibold ${
                  isLoss
                    ? "text-amber-700 dark:text-amber-300"
                    : totalMargin > 0
                      ? "text-emerald-700 dark:text-emerald-300"
                      : "text-gray-700 dark:text-slate-300"
                }`}
              >
                Total margin: {totalMargin >= 0 ? "+" : "−"}Rp{" "}
                {Math.abs(totalMargin).toLocaleString("id-ID")}
                {isLoss && " (rugi)"}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 bg-white dark:bg-slate-900 border-2 border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors font-semibold"
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
        className="p-6 space-y-5"
      >
        {/* ── Vendor + metode bayar (sekali untuk semua baris) ─────────────── */}
        <div className="rounded-lg border-2 border-[#2266ff]/30 bg-blue-50/40 dark:bg-slate-800/60 p-4">
          <div className="text-xs font-bold uppercase tracking-wide text-[#2266ff] mb-3">
            Vendor Subkontraktor
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1.5">
                Vendor <span className="text-red-500">*</span>
              </label>
              <select
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
                className="w-full px-3 py-2 border-2 border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:border-[#00afef] bg-white dark:bg-slate-900 dark:text-slate-100"
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
              <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1.5">
                Cara Bayar Vendor <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                {(
                  [
                    { value: "CASH", label: "Cash", sub: "Bayar sekarang" },
                    { value: "NET30", label: "NET30", sub: "Tagihan 30 hari" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setMetodeBayarVendor(opt.value)}
                    className={`flex-1 px-3 py-1.5 rounded-lg border-2 text-sm font-semibold transition-all ${
                      metodeBayarVendor === opt.value
                        ? "bg-gradient-to-r from-[#0a1b3d] to-[#2266ff] text-white border-[#2266ff] shadow-sm"
                        : "bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 border-gray-300 dark:border-slate-600 hover:border-[#2266ff]"
                    }`}
                  >
                    <div className="text-xs">{opt.label}</div>
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
        </div>

        {/* ── Tabel baris item ────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-bold uppercase tracking-wide text-[#0a1b3d] dark:text-slate-100">
              Daftar Item ({drafts.length})
            </div>
            <button
              type="button"
              onClick={addLine}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#00afef] hover:bg-[#0098d0] text-white transition-colors"
            >
              + Tambah Baris
            </button>
          </div>

          <datalist id="maklon-satuan-options">
            {SATUAN_OPTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>

          <div className="space-y-3">
            {drafts.map((draft, idx) => {
              const summary = lineSummaries[idx];
              const lineLoss = summary.biaya > 0 && summary.margin < 0;
              return (
                <div
                  key={idx}
                  className="rounded-lg border-2 border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-gray-500 dark:text-slate-400">
                      Item #{idx + 1}
                    </span>
                    {drafts.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        className="text-xs font-semibold text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                        aria-label={`Hapus item ${idx + 1}`}
                      >
                        Hapus
                      </button>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1">
                        Deskripsi Pekerjaan{" "}
                        <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={draft.deskripsi}
                        onChange={(e) =>
                          updateDraft(idx, { deskripsi: e.target.value })
                        }
                        placeholder='Contoh: "Cetak banner 3 x 2 meter"'
                        className="w-full px-3 py-2 text-sm border-2 border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:border-[#00afef] dark:bg-slate-800 dark:text-slate-100"
                      />
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1">
                          Jumlah <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={draft.jumlahStr}
                          onChange={(e) =>
                            updateDraft(idx, { jumlahStr: e.target.value })
                          }
                          className="w-full px-2 py-2 text-sm border-2 border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:border-[#00afef] dark:bg-slate-800 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1">
                          Satuan
                        </label>
                        <input
                          type="text"
                          list="maklon-satuan-options"
                          value={draft.satuan}
                          onChange={(e) =>
                            updateDraft(idx, { satuan: e.target.value })
                          }
                          className="w-full px-2 py-2 text-sm border-2 border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:border-[#00afef] dark:bg-slate-800 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1">
                          Harga / Satuan{" "}
                          <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          step="100"
                          min="0"
                          value={draft.hargaJualStr}
                          onChange={(e) =>
                            updateDraft(idx, { hargaJualStr: e.target.value })
                          }
                          placeholder="0"
                          className="w-full px-2 py-2 text-sm border-2 border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:border-[#00afef] dark:bg-slate-800 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1">
                          Biaya Vendor (Total){" "}
                          <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          step="100"
                          min="0"
                          value={draft.biayaSubkontrakStr}
                          onChange={(e) =>
                            updateDraft(idx, {
                              biayaSubkontrakStr: e.target.value,
                            })
                          }
                          placeholder="0"
                          className="w-full px-2 py-2 text-sm border-2 border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:border-[#00afef] dark:bg-slate-800 dark:text-slate-100"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] pt-1 border-t border-gray-100 dark:border-slate-800">
                      <span className="text-gray-500 dark:text-slate-400">
                        Subtotal: Rp{" "}
                        <span className="font-semibold text-gray-700 dark:text-slate-200">
                          {summary.subtotal.toLocaleString("id-ID")}
                        </span>
                      </span>
                      <span
                        className={`font-semibold ${
                          lineLoss
                            ? "text-amber-700 dark:text-amber-300"
                            : summary.margin > 0
                              ? "text-emerald-700 dark:text-emerald-300"
                              : "text-gray-500 dark:text-slate-400"
                        }`}
                      >
                        Margin: {summary.margin >= 0 ? "+" : "−"}Rp{" "}
                        {Math.abs(summary.margin).toLocaleString("id-ID")}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {isLoss && (
          <div className="rounded-lg border-2 border-amber-300 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-900 dark:text-amber-200">
            <strong>Peringatan:</strong> Total biaya ke vendor lebih besar
            dari total harga jual. Transaksi tetap bisa diproses, tapi
            pastikan ini disengaja.
          </div>
        )}
      </form>
    </ModalFormShell>
  );
}
