"use client";

import { useMemo, useState } from "react";
import {
  CashIcon,
  TransferIcon,
  QRISIcon,
  CardIcon,
  CalendarIcon,
} from "./icons/ContentIcons";
import ModalTambahFinishing from "./ModalTambahFinishing";
import ModalEditHarga from "./ModalEditHarga";
import {
  allocateCartLineCharges,
  formatPosUnitPrice,
  formatRollCartDetailLine,
  roundUpToThousand,
} from "@/lib/money-rounding";

interface FinishingItem {
  jenis_finishing: string;
  keterangan?: string;
}

interface CartItem {
  barang_id: string;
  barang_nama: string;
  nama_satuan: string;
  harga_satuan: number;
  jumlah: number;
  panjang?: number;
  lebar?: number;
  butuh_dimensi?: boolean;
  useRounding?: boolean;
  selectedRollSize?: number;
  billedPanjang?: number;
  billedLebar?: number;
  subtotalRaw: number;
  originalHargaSatuan?: number;
  finishing?: FinishingItem[];
  // Maklon (subcontract) fields. When tipe_item === 'MAKLON' the cart line
  // represents work outsourced to a partner shop; the cart row shows a
  // distinct badge + vendor name + per-line margin so the kasir can sanity-
  // check the deal at a glance.
  tipe_item?: "BARANG" | "MAKLON";
  vendor_subkontrak_nama?: string;
  biaya_subkontrak?: number;
  metode_bayar_vendor?: "CASH" | "NET30";
  deskripsi_pekerjaan?: string;
}

interface FinishingOption {
  id: string;
  nama: string;
  urutan_tampilan: number;
}

export type PrintType = "thermal" | "faktur" | "both" | "none";

export interface BiayaTambahan {
  label: string;
  nominal: number;
}

interface POSCartProps {
  cart: CartItem[];
  roundCartPrices: boolean;
  onRoundCartPricesChange: (value: boolean) => void;
  paymentMethod: string;
  jumlahBayar: string;
  catatan: string;
  prioritas: "NORMAL" | "KILAT";
  printType: PrintType;
  onRemoveItem: (index: number) => void;
  editingCartIndex?: number | null;
  onEditItem?: (index: number) => void;
  onPaymentMethodChange: (method: string) => void;
  onJumlahBayarChange: (jumlah: string) => void;
  onCatatanChange: (catatan: string) => void;
  onPrioritasChange: (prioritas: "NORMAL" | "KILAT") => void;
  onPrintTypeChange: (printType: PrintType) => void;
  onCheckout: () => void;
  onEditFinishing?: (index: number, finishing: FinishingItem[]) => void;
  onGetFinishingOptions: () => Promise<FinishingOption[]>;
  /** Override harga_satuan untuk cart line tertentu. */
  onEditPrice?: (index: number, newHargaSatuan: number) => void;
  /** Header-level biaya tambahan (ongkir, biaya pasang, dll). */
  biayaTambahan?: BiayaTambahan[];
  onBiayaTambahanChange?: (next: BiayaTambahan[]) => void;
  /** Nama pelanggan aktif (dari selectedCustomer atau customerSearch) untuk penawaran harga. */
  customerName?: string;
}

const denominations = [
  { value: 100000, label: "100rb" },
  { value: 50000, label: "50rb" },
  { value: 20000, label: "20rb" },
  { value: 10000, label: "10rb" },
  { value: 5000, label: "5rb" },
  { value: 2000, label: "2rb" },
  { value: 1000, label: "1rb" },
  { value: 500, label: "500" },
  { value: 200, label: "200" },
  { value: 100, label: "100" },
];

function calculateChange(
  amount: number
): { denom: number; label: string; count: number }[] {
  if (amount <= 0) return [];

  const result: { denom: number; label: string; count: number }[] = [];
  let remaining = amount;

  for (const { value, label } of denominations) {
    if (remaining >= value) {
      const count = Math.floor(remaining / value);
      result.push({ denom: value, label, count });
      remaining = remaining % value;
    }
  }

  return result;
}

export default function KeranjangPOS({
  cart,
  roundCartPrices,
  onRoundCartPricesChange,
  paymentMethod,
  jumlahBayar,
  catatan,
  prioritas,
  printType,
  onRemoveItem,
  editingCartIndex = null,
  onEditItem,
  onPaymentMethodChange,
  onJumlahBayarChange,
  onCatatanChange,
  onPrioritasChange,
  onPrintTypeChange,
  onCheckout,
  onEditFinishing,
  onGetFinishingOptions,
  onEditPrice,
  biayaTambahan = [],
  onBiayaTambahanChange,
  customerName,
}: POSCartProps) {
  const totalRaw = cart.reduce((sum, item) => sum + item.subtotalRaw, 0);
  const lineCharges = useMemo(
    () => allocateCartLineCharges(cart, roundCartPrices),
    [cart, roundCartPrices]
  );
  const subtotalItems = lineCharges.reduce((sum, n) => sum + n, 0);
  const biayaTambahanTotal = useMemo(
    () => biayaTambahan.reduce((sum, b) => sum + (Number(b.nominal) || 0), 0),
    [biayaTambahan]
  );
  const total = subtotalItems + biayaTambahanTotal;
  const hasRoundingChoice = totalRaw !== roundUpToThousand(totalRaw);
  const bayar = parseFloat(jumlahBayar) || 0;
  const kembalian = Math.max(0, bayar - total);
  const kurang = Math.max(0, total - bayar);
  const changeBreakdown = calculateChange(kembalian);
  const [showChangeDetail, setShowChangeDetail] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [editingFinishingIndex, setEditingFinishingIndex] = useState<
    number | null
  >(null);
  const [editingPriceIndex, setEditingPriceIndex] = useState<number | null>(
    null
  );

  const handlePreviewQuotation = async () => {
    try {
      const { generateFakturHTML, patchQuotationHTML } = await import(
        "@/lib/faktur-print"
      );
      const { formatRollCartDetailLine } = await import("@/lib/money-rounding");

      const items = cart.map((item, index) => {
        // Build ukuran string for dimensional items
        let ukuran = "";
        if (item.butuh_dimensi && item.billedPanjang != null && item.billedLebar != null) {
          ukuran = `${item.billedPanjang} × ${item.billedLebar} m`;
        } else if (item.butuh_dimensi && item.panjang != null && item.lebar != null) {
          ukuran = `${item.panjang} × ${item.lebar} m`;
        }
        return {
          nama: item.barang_nama,
          keterangan: item.tipe_item === "MAKLON" && item.vendor_subkontrak_nama
            ? `Maklon: ${item.vendor_subkontrak_nama}`
            : undefined,
          ukuran,
          qty: item.jumlah,
          satuan: item.nama_satuan,
          harga: item.jumlah > 0 ? lineCharges[index] / item.jumlah : item.harga_satuan,
          jumlah: lineCharges[index],
        };
      });

      const html = generateFakturHTML({
        nomor_faktur: "—",
        tanggal: new Date().toISOString(),
        pelanggan_nama: customerName?.trim() || "—",
        items,
        total,
        bayar: 0,
        sisa: 0,
        shop: undefined,
      });

      const patched = patchQuotationHTML(html);

      window.dispatchEvent(
        new CustomEvent("gemi:preview-faktur", {
          detail: { html: patched, title: "Penawaran Harga" },
        })
      );
    } catch (e) {
      console.error("handlePreviewQuotation error:", e);
    }
  };

  const paymentMethods = [
    {
      value: "CASH",
      label: "Cash",
      icon: <CashIcon size={16} className="text-black" />,
    },
    {
      value: "TRANSFER",
      label: "Transfer",
      icon: <TransferIcon size={16} className="text-black" />,
    },
    {
      value: "QRIS",
      label: "QRIS",
      icon: <QRISIcon size={16} className="text-black" />,
    },
    {
      value: "DEBIT",
      label: "Debit",
      icon: <CardIcon size={16} className="text-black" />,
    },
    {
      value: "NET30",
      label: "NET30",
      icon: <CalendarIcon size={16} className="text-black" />,
    },
  ];

  return (
    <div className="bg-gradient-to-br from-slate-50 to-gray-100 dark:from-slate-900 dark:to-slate-900 rounded-xl shadow-2xl border-2 border-gray-200 dark:border-slate-800 sticky top-6 flex flex-col max-h-[calc(100vh-5rem)] overflow-hidden">
      {/* Header — satu baris ringkas */}
      <div className="shrink-0 flex items-center gap-2 px-4 pt-4 pb-3 border-b border-gray-200 dark:border-slate-800">
        <div className="bg-gradient-to-br from-[#00afef] to-[#0088cc] p-2 rounded-lg shadow-sm">
          <svg
            className="w-5 h-5 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-gray-800 dark:text-slate-100 leading-tight">
            Keranjang
          </h3>
          <p className="text-xs text-gray-500 dark:text-slate-400">{cart.length} item</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">
            Total
          </p>
          <p className="text-lg font-bold text-[#00afef] leading-tight">
            Rp {total.toLocaleString("id-ID")}
          </p>
        </div>
      </div>

      {cart.length > 0 && hasRoundingChoice && (
        <div className="shrink-0 px-4 py-2.5 border-b border-gray-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/60">
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={roundCartPrices}
                onChange={(e) => onRoundCartPricesChange(e.target.checked)}
                className="w-3.5 h-3.5 text-[#00afef] border-gray-300 rounded focus:ring-[#00afef]"
              />
              Bulatkan kelipatan Rp 1.000
            </label>
            <button
              type="button"
              onClick={handlePreviewQuotation}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-800/50 text-[10px] font-semibold transition-colors"
              title="Pratinjau penawaran harga"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Penawaran
            </button>
          </div>
        </div>
      )}

      {/* Item list — only scrollable area */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2">
        {cart.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-slate-400">
            <svg
              className="w-12 h-12 mx-auto mb-2 opacity-50"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
              />
            </svg>
            <p className="font-semibold text-sm">Keranjang Kosong</p>
            <p className="text-xs mt-1">Tambahkan barang untuk memulai</p>
          </div>
        ) : (
          cart.map((item, index) => (
            <div
              key={index}
              className={`bg-white dark:bg-slate-900 rounded-lg p-3 border transition-all ${
                editingCartIndex === index
                  ? "border-amber-400 ring-2 ring-amber-200/50 shadow-sm"
                  : item.tipe_item === "MAKLON"
                    ? "border-[#00afef]/50 hover:border-[#00afef]"
                    : "border-gray-200 dark:border-slate-800 hover:border-[#00afef]/50"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  {item.tipe_item === "MAKLON" && (
                    <div className="mb-1 flex items-center gap-2 flex-wrap">
                      <span className="inline-block text-[9px] px-1.5 py-0.5 bg-[#00afef]/20 text-[#0a1b3d] dark:text-slate-100 font-bold rounded uppercase tracking-wide">
                        Maklon
                      </span>
                      {item.vendor_subkontrak_nama && (
                        <span className="text-[10px] text-[#2266ff] truncate">
                          → {item.vendor_subkontrak_nama}
                        </span>
                      )}
                      {item.metode_bayar_vendor && (
                        <span className="text-[9px] px-1 py-0.5 bg-blue-50 dark:bg-slate-800 text-[#2266ff] border border-blue-200 dark:border-slate-700 rounded">
                          {item.metode_bayar_vendor}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="font-semibold text-sm text-gray-800 dark:text-slate-100 truncate">
                    {item.barang_nama}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-slate-300 mt-0.5">
                    {item.butuh_dimensi && item.panjang && item.lebar ? (
                      <span>
                        {item.useRounding &&
                        item.selectedRollSize != null &&
                        item.billedPanjang != null &&
                        item.billedLebar != null ? (
                          formatRollCartDetailLine(item)
                        ) : (
                          <>
                            {item.panjang.toFixed(2)} × {item.lebar.toFixed(2)}{" "}
                            m = {item.jumlah.toFixed(2)} m² @ Rp{" "}
                            {formatPosUnitPrice(item.harga_satuan)}
                          </>
                        )}
                      </span>
                    ) : (
                      <span>
                        {item.jumlah} {item.nama_satuan} @ Rp{" "}
                        {formatPosUnitPrice(item.harga_satuan)}
                      </span>
                    )}
                    {item.originalHargaSatuan != null &&
                      Math.abs(item.harga_satuan - item.originalHargaSatuan) >
                        0.01 && (
                        <span className="ml-1.5 inline-block text-[9px] px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-bold rounded uppercase tracking-wide">
                          Override
                        </span>
                      )}
                  </div>
                  <div className="text-sm font-bold text-[#00afef] mt-1">
                    Rp{" "}
                    {lineCharges[index].toLocaleString("id-ID")}
                  </div>
                  {item.tipe_item === "MAKLON" &&
                    typeof item.biaya_subkontrak === "number" && (
                      <div className="text-[10px] text-[#2266ff] mt-0.5">
                        Bayar vendor: Rp{" "}
                        {item.biaya_subkontrak.toLocaleString("id-ID")}
                        {(() => {
                          const margin =
                            lineCharges[index] - (item.biaya_subkontrak || 0);
                          return margin >= 0 ? (
                            <span className="ml-1 text-emerald-700 dark:text-emerald-300">
                              (margin +Rp {margin.toLocaleString("id-ID")})
                            </span>
                          ) : (
                            <span className="ml-1 text-amber-700 dark:text-amber-300">
                              (rugi −Rp{" "}
                              {Math.abs(margin).toLocaleString("id-ID")})
                            </span>
                          );
                        })()}
                      </div>
                    )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {onEditPrice && (
                    <button
                      type="button"
                      onClick={() => setEditingPriceIndex(index)}
                      className="bg-amber-100 dark:bg-amber-900/30 hover:bg-amber-500 dark:hover:bg-amber-500 p-1.5 rounded-md transition-all text-amber-700 dark:text-amber-300 hover:text-white"
                      aria-label="Edit harga"
                      title="Edit harga / subtotal"
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
                          d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                        />
                      </svg>
                    </button>
                  )}
                  {onEditItem && (
                    <button
                      type="button"
                      onClick={() => onEditItem(index)}
                      className="bg-[#00afef]/90 hover:bg-[#00afef] p-1.5 rounded-md transition-all text-white"
                      aria-label="Ubah item"
                      title="Ubah item"
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
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onRemoveItem(index)}
                    className="bg-red-50 dark:bg-red-900/30 hover:bg-red-500 dark:hover:bg-red-500 p-1.5 rounded-md transition-all text-red-500 dark:text-red-400 hover:text-white"
                    aria-label="Hapus item"
                    title="Hapus item"
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
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              {item.finishing && item.finishing.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-100 dark:border-slate-800">
                  <div className="flex flex-wrap gap-1">
                    {item.finishing.map((fin, finIndex) => (
                      <span
                        key={finIndex}
                        className="inline-block text-[10px] px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200 rounded"
                      >
                        {fin.jenis_finishing}
                        {fin.keterangan && ` (${fin.keterangan})`}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {onEditFinishing && (
                <button
                  type="button"
                  onClick={() => setEditingFinishingIndex(index)}
                  className="w-full mt-2 px-2 py-1 bg-amber-50 dark:bg-slate-800 border border-amber-200 dark:border-amber-800/50 text-amber-800 dark:text-amber-200 rounded text-[10px] font-semibold hover:bg-slate-50 dark:hover:bg-white/5 transition-all"
                >
                  {item.finishing && item.finishing.length > 0
                    ? "Edit Finishing"
                    : "+ Finishing"}
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Biaya tambahan section — header-level extra charges */}
      {onBiayaTambahanChange && cart.length > 0 && (
        <div className="shrink-0 px-4 py-2 border-t border-gray-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/60 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wide text-gray-600 dark:text-slate-400">
              Biaya Tambahan
              {biayaTambahan.length > 0 && (
                <span className="ml-1 text-[#00afef]">
                  ({biayaTambahan.length})
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() =>
                onBiayaTambahanChange([
                  ...biayaTambahan,
                  { label: "", nominal: 0 },
                ])
              }
              className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-[#00afef]/10 hover:bg-[#00afef]/20 text-[#00afef] transition-colors"
              title="Tambah biaya tambahan (ongkir, biaya pasang, dll)"
            >
              + Tambah
            </button>
          </div>

          {biayaTambahan.map((biaya, idx) => (
            <div key={idx} className="flex items-center gap-1.5">
              <input
                type="text"
                value={biaya.label}
                onChange={(e) => {
                  const next = [...biayaTambahan];
                  next[idx] = { ...next[idx], label: e.target.value };
                  onBiayaTambahanChange(next);
                }}
                placeholder="Ongkir, biaya pasang, dll"
                className="flex-1 min-w-0 px-2 py-1 text-xs bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 border border-gray-300 dark:border-slate-600 rounded focus:outline-none focus:border-[#00afef]"
              />
              <input
                type="number"
                step="1000"
                min="0"
                value={biaya.nominal || ""}
                onChange={(e) => {
                  const next = [...biayaTambahan];
                  next[idx] = {
                    ...next[idx],
                    nominal: parseFloat(e.target.value) || 0,
                  };
                  onBiayaTambahanChange(next);
                }}
                placeholder="0"
                className="w-24 px-2 py-1 text-xs text-right bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 border border-gray-300 dark:border-slate-600 rounded focus:outline-none focus:border-[#00afef] font-semibold"
              />
              <button
                type="button"
                onClick={() => {
                  const next = biayaTambahan.filter((_, i) => i !== idx);
                  onBiayaTambahanChange(next);
                }}
                className="p-1 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                aria-label="Hapus biaya"
                title="Hapus baris"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}

          {biayaTambahanTotal > 0 && (
            <div className="flex items-center justify-between text-[11px] pt-1 border-t border-gray-100 dark:border-slate-800">
              <span className="text-gray-500 dark:text-slate-400">
                Subtotal items + biaya tambahan
              </span>
              <span className="font-bold text-[#00afef]">
                Rp {total.toLocaleString("id-ID")}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Payment + checkout — always visible at bottom */}
      <div className="shrink-0 px-4 pb-4 pt-3 border-t border-gray-200 dark:border-slate-800 bg-gradient-to-br from-slate-50 to-gray-100 dark:from-slate-900 dark:to-slate-900 space-y-2.5">
        {/* Payment method — horizontal scroll */}
        <div>
          <label className="block text-xs font-bold text-gray-600 dark:text-slate-300 mb-1.5">
            Metode Pembayaran
          </label>
          <div
            className="flex gap-1.5 overflow-x-auto pb-0.5 scroll-smooth [scrollbar-width:thin]"
            role="group"
            aria-label="Metode pembayaran"
          >
            {paymentMethods.map((method) => (
              <button
                key={method.value}
                type="button"
                onClick={() => onPaymentMethodChange(method.value)}
                className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all border-2 ${
                  paymentMethod === method.value
                    ? "bg-[#00afef] text-white border-[#00afef] shadow-sm"
                    : "bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-800 hover:border-[#00afef]/50"
                }`}
              >
                <div
                  className={
                    paymentMethod === method.value ? "brightness-0 invert" : ""
                  }
                >
                  {method.icon}
                </div>
                {method.label}
              </button>
            ))}
          </div>
        </div>

        {/* Jumlah bayar + kilat — satu baris */}
        <div className="flex items-end gap-2">
          <div className="flex-1 min-w-0">
            <label className="block text-xs font-bold text-gray-600 dark:text-slate-300 mb-1">
              Jumlah Dibayar (Rp)
            </label>
            <input
              type="number"
              step="1000"
              value={jumlahBayar}
              onChange={(e) => onJumlahBayarChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onCheckout();
                }
              }}
              placeholder="0"
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 border-2 border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:border-[#00afef] font-bold text-base"
            />
          </div>
          <label className="shrink-0 flex items-center gap-1.5 cursor-pointer px-2 py-2 bg-white dark:bg-slate-900 rounded-lg border-2 border-gray-200 dark:border-slate-800 hover:border-amber-600 transition-all h-[42px]">
            <input
              type="checkbox"
              checked={prioritas === "KILAT"}
              onChange={(e) =>
                onPrioritasChange(e.target.checked ? "KILAT" : "NORMAL")
              }
              className="w-4 h-4 text-amber-700 dark:text-amber-300 rounded focus:ring-amber-700 cursor-pointer"
            />
            <span className="text-xs font-bold text-gray-700 dark:text-slate-300 whitespace-nowrap">
              Kilat
            </span>
          </label>
        </div>

        {/* Quick denomination buttons — add bill value to amount paid */}
        <div className="grid grid-cols-4 gap-1.5">
          {[10000, 20000, 50000, 100000].map((amount) => (
            <button
              key={amount}
              type="button"
              onClick={() => {
                const current = parseFloat(jumlahBayar) || 0;
                onJumlahBayarChange(String(current + amount));
              }}
              className="px-1 py-1 bg-white dark:bg-slate-900 hover:bg-gray-100 text-gray-700 dark:text-slate-300 rounded border border-gray-200 dark:border-slate-800 text-[10px] font-semibold transition-all"
            >
              {amount >= 1000 ? `${amount / 1000}rb` : amount}
            </button>
          ))}
        </div>

        {/* Change / shortfall — only relevant for cash payment */}
        {paymentMethod === "CASH" && bayar > 0 && (
          <div
            className={`rounded-lg px-3 py-2 text-sm border-2 ${
              kembalian > 0
                ? "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700"
                : kurang > 0
                  ? "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-700"
                  : "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className={`text-xs font-bold ${
                  kembalian > 0
                    ? "text-green-800 dark:text-green-300"
                    : kurang > 0
                      ? "text-yellow-800 dark:text-yellow-300"
                      : "text-green-800 dark:text-green-300"
                }`}
              >
                {kembalian > 0
                  ? "KEMBALIAN"
                  : kurang > 0
                    ? "KURANG"
                    : "PAS / LUNAS"}
              </span>
              <span
                className={`font-bold ${
                  kembalian > 0
                    ? "text-green-700 dark:text-green-300"
                    : kurang > 0
                      ? "text-yellow-700 dark:text-yellow-300"
                      : "text-green-700 dark:text-green-300"
                }`}
              >
                {kembalian > 0 || kurang > 0
                  ? `Rp ${(kembalian || kurang).toLocaleString("id-ID")}`
                  : "✓"}
              </span>
            </div>
            {kembalian > 0 && changeBreakdown.length > 0 && (
              <button
                type="button"
                onClick={() => setShowChangeDetail(!showChangeDetail)}
                className="text-[10px] text-green-700 dark:text-green-400 underline mt-1"
              >
                {showChangeDetail ? "Sembunyikan pecahan" : "Lihat pecahan"}
              </button>
            )}
            {showChangeDetail && kembalian > 0 && (
              <div className="grid grid-cols-2 gap-1 mt-2 text-[10px]">
                {changeBreakdown.map(({ denom, label, count }) => (
                  <div
                    key={denom}
                    className="flex justify-between bg-green-100 dark:bg-green-900/40 rounded px-1.5 py-0.5 text-green-900 dark:text-green-200"
                  >
                    <span>{label}</span>
                    <span className="font-bold">{count}×</span>
                  </div>
                ))}
              </div>
            )}
            {kurang > 0 && (
              <p className="text-[10px] text-yellow-700 dark:text-yellow-400 mt-1">
                Kekurangan masuk tagihan
              </p>
            )}
          </div>
        )}

        {/* Catatan — collapsible */}
        <div>
          <button
            type="button"
            onClick={() => setShowNotes(!showNotes)}
            className="text-xs font-semibold text-gray-500 dark:text-slate-400 hover:text-[#00afef] transition-colors"
          >
            {showNotes ? "− Sembunyikan catatan" : "+ Catatan (opsional)"}
          </button>
          {showNotes && (
            <input
              type="text"
              value={catatan}
              onChange={(e) => onCatatanChange(e.target.value)}
              placeholder="Catatan transaksi..."
              className="mt-1.5 w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 border-2 border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:border-[#00afef]"
            />
          )}
        </div>

        {/* Jenis cetak */}
        <div>
          <label className="block text-xs font-bold text-gray-600 dark:text-slate-300 mb-1">
            Cetak setelah transaksi
          </label>
          <div className="grid grid-cols-4 gap-1">
            {(
              [
                { value: "thermal", label: "Struk", hint: "80mm" },
                { value: "faktur", label: "Faktur", hint: "A5" },
                { value: "both", label: "Keduanya", hint: "" },
                { value: "none", label: "Tidak", hint: "" },
              ] as { value: PrintType; label: string; hint: string }[]
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onPrintTypeChange(opt.value)}
                className={`py-1.5 px-1 rounded-lg border-2 text-[11px] font-semibold transition-all flex flex-col items-center justify-center leading-tight ${
                  printType === opt.value
                    ? "bg-[#00afef] text-white border-[#00afef]"
                    : "bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 border-gray-300 hover:border-[#00afef]"
                }`}
              >
                <span>{opt.label}</span>
                {opt.hint && (
                  <span
                    className={`text-[9px] ${
                      printType === opt.value
                        ? "text-white/80"
                        : "text-gray-500 dark:text-slate-400"
                    }`}
                  >
                    {opt.hint}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={onCheckout}
          disabled={cart.length === 0}
          className="w-full py-3 bg-gradient-to-r from-[#00afef] to-[#2266ff] text-white rounded-lg font-bold text-base hover:from-[#0099dd] hover:to-[#1955ee] transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          Proses Pembayaran
        </button>
      </div>

      {editingFinishingIndex !== null && onEditFinishing && (
        <ModalTambahFinishing
          onClose={() => setEditingFinishingIndex(null)}
          onAdd={(finishing) => {
            onEditFinishing(editingFinishingIndex, finishing);
            setEditingFinishingIndex(null);
          }}
          existingFinishing={cart[editingFinishingIndex]?.finishing}
          itemName={cart[editingFinishingIndex]?.barang_nama || ""}
          onGetFinishingOptions={onGetFinishingOptions}
        />
      )}

      {editingPriceIndex !== null && onEditPrice && cart[editingPriceIndex] && (
        <ModalEditHarga
          show={true}
          itemName={cart[editingPriceIndex].barang_nama}
          jumlah={cart[editingPriceIndex].jumlah}
          hargaOriginal={
            cart[editingPriceIndex].originalHargaSatuan ??
            cart[editingPriceIndex].harga_satuan
          }
          hargaCurrent={cart[editingPriceIndex].harga_satuan}
          onClose={() => setEditingPriceIndex(null)}
          onSave={(newHarga) => {
            onEditPrice(editingPriceIndex, newHarga);
            setEditingPriceIndex(null);
          }}
        />
      )}
    </div>
  );
}
