"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { previewNomorFakturAction } from "@/app/pos/preview-faktur-actions";
import DropdownKeranjangTersimpan from "@/app/pos/DropdownKeranjangTersimpan";
import type { ParkedCart } from "@/lib/services/keranjang-tersimpan-service";
import {
  CashIcon,
  TransferIcon,
  QRISIcon,
  CardIcon,
  CalendarIcon,
} from "../icons/ContentIcons";
import {
  allocateCartLineCharges,
  formatPosUnitPrice,
  formatRollCartDetailLine,
  roundUpToThousand,
} from "@/lib/money-rounding";
import { useFocusTrap } from "@/components/useFocusTrap";

interface FinishingItem {
  jenis_finishing: string;
  keterangan?: string;
}

interface CartItem {
  barang_id: string;
  barang_nama: string;
  nama_produk_jual?: string | null;
  nama_satuan: string;
  harga_satuan: number;
  jumlah: number;
  jumlah_roll?: number;
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
  biaya_tambahan?: BiayaTambahan[];
  tipe_item?: "BARANG" | "MAKLON";
  vendor_subkontrak_nama?: string;
  biaya_subkontrak?: number;
  metode_bayar_vendor?: "CASH" | "NET30" | "TRANSFER";
  deskripsi_pekerjaan?: string;
  /** Label kustom per baris — mis. "Banner Pecel Lele". Dicetak di struk/faktur/SPK. */
  catatan_item?: string;
}

export type PrintType = "thermal" | "faktur" | "both" | "none";

export interface BiayaTambahan {
  label: string;
  nominal: number;
  modal?: number;
}

interface OverlayKeranjangProps {
  open: boolean;
  onClose: () => void;
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
  /** Nama pelanggan aktif untuk pratinjau faktur. */
  customerName?: string;
  /** Data toko untuk header pratinjau faktur. */
  shopSettings?: {
    nama_toko?: string | null;
    slogan?: string | null;
    alamat?: string | null;
    telepon?: string | null;
    email?: string | null;
    website?: string | null;
    bank_nama?: string | null;
    bank_nomor?: string | null;
    bank_atas_nama?: string | null;
    catatan_faktur?: string | null;
    npwp?: string | null;
    alamat_npwp?: string | null;
  };
  onEditRincianInternal?: (index: number) => void;
  onParkClick?: () => void;
  parkedCarts?: ParkedCart[];
  onLoadParked?: (id: string) => void;
  onJadikanPenawaran?: (id: string) => void;
  onDeleteParked?: (id: string) => void;
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
  amount: number,
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

function getItemBiayaTambahanTotal(item: CartItem): number {
  return (item.biaya_tambahan || [])
    .filter((b) => b.label.trim() && b.nominal > 0)
    .reduce((sum, b) => sum + b.nominal, 0);
}

function getCartBiayaTambahanTotal(cart: CartItem[]): number {
  return cart.reduce((sum, item) => sum + getItemBiayaTambahanTotal(item), 0);
}

function getCartItemNamaTampil(item: CartItem): string {
  if (item.tipe_item === "MAKLON" && item.deskripsi_pekerjaan?.trim()) {
    return item.deskripsi_pekerjaan.trim();
  }
  return item.nama_produk_jual?.trim() || item.barang_nama;
}

/**
 * Overlay keranjang penuh (portal) dua kolom.
 * Kolom kiri: daftar item keranjang.
 * Kolom kanan: ringkasan total + metode pembayaran + proses bayar.
 * Dipanggil dari BarRingkasKeranjang di halaman POS.
 */
export default function OverlayKeranjang({
  open,
  onClose,
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
  customerName,
  shopSettings,
  onEditRincianInternal,
  onParkClick,
  parkedCarts = [],
  onLoadParked,
  onJadikanPenawaran,
  onDeleteParked,
}: OverlayKeranjangProps) {
  // --- Hooks harus dipanggil sebelum early-return ---
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const lineCharges = useMemo(
    () => allocateCartLineCharges(cart, roundCartPrices),
    [cart, roundCartPrices],
  );
  const subtotalItems = lineCharges.reduce((sum, n) => sum + n, 0);
  const biayaTambahanTotal = useMemo(
    () => getCartBiayaTambahanTotal(cart),
    [cart],
  );
  const total = subtotalItems + biayaTambahanTotal;
  const totalRaw = cart.reduce((sum, item) => sum + item.subtotalRaw, 0);
  const hasRoundingChoice = totalRaw !== roundUpToThousand(totalRaw);
  const bayar = parseFloat(jumlahBayar) || 0;
  const kembalian = Math.max(0, bayar - total);
  const kurang = Math.max(0, total - bayar);
  const changeBreakdown = calculateChange(kembalian);
  const [showChangeDetail, setShowChangeDetail] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // --- Early-return setelah semua hooks ---
  if (!open) return null;

  const handlePreviewFaktur = async () => {
    if (cart.length === 0) return;
    try {
      const { generateFakturHTML, patchQuotationHTML } =
        await import("@/lib/faktur-print");
      const { mapPenjualanItemKeFaktur } =
        await import("@/lib/dokumen-item-display");

      const items = cart.map((item, index) => {
        const lineTotal = lineCharges[index];
        const hargaEfektif =
          item.jumlah > 0 ? lineTotal / item.jumlah : item.harga_satuan;

        const fakturItem = mapPenjualanItemKeFaktur({
          barang_nama: item.barang_nama,
          nama_produk_jual: item.nama_produk_jual,
          tipe_item: item.tipe_item,
          deskripsi_pekerjaan: item.deskripsi_pekerjaan,
          jumlah: item.jumlah,
          nama_satuan: item.nama_satuan,
          panjang: item.panjang,
          lebar: item.lebar,
          billed_panjang: item.billedPanjang,
          billed_lebar: item.billedLebar,
          jumlah_roll: item.jumlah_roll,
          harga_satuan: hargaEfektif,
          subtotal: lineTotal,
          catatan_item: item.catatan_item?.trim() || undefined,
        });

        const biayaTambahan = (item.biaya_tambahan || []).filter(
          (b) => b.label?.trim() && b.nominal > 0,
        );
        if (biayaTambahan.length > 0) {
          fakturItem.biaya_tambahan = biayaTambahan.map((b) => ({
            label: b.label.trim(),
            nominal: b.nominal,
          }));
        }
        return fakturItem;
      });

      const nomorPreview = await previewNomorFakturAction();
      const html = generateFakturHTML({
        nomor_faktur: nomorPreview,
        tanggal: new Date().toISOString(),
        pelanggan_nama: customerName?.trim() || "—",
        items,
        total,
        bayar: 0,
        sisa: 0,
        shop: shopSettings,
      });
      const patched = patchQuotationHTML(html, { judul: "Faktur Penjualan" });
      window.dispatchEvent(
        new CustomEvent("gemi:preview-faktur", {
          detail: { html: patched, title: "Faktur Penjualan" },
        }),
      );
    } catch (e) {
      console.error("handlePreviewFaktur error:", e);
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

  return createPortal(
    <div
      className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Keranjang"
        className="w-full max-w-5xl max-h-[90vh] rounded-2xl bg-gradient-to-br from-slate-50 to-gray-100 dark:from-slate-900 dark:to-slate-900 shadow-2xl border-2 border-gray-200 dark:border-slate-800 flex flex-col overflow-hidden"
      >
        {/* ===== HEADER ===== */}
        <div className="shrink-0 flex items-center gap-2 px-5 pt-4 pb-3 border-b border-gray-200 dark:border-slate-800">
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
            <h3 className="text-xl font-bold text-gray-800 dark:text-slate-100 leading-tight">
              Keranjang
            </h3>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <p className="text-sm text-gray-500 dark:text-slate-400">
                {cart.length} item
              </p>
              {onParkClick && (
                <button
                  type="button"
                  onClick={() => {
                    onParkClick();
                    onClose();
                  }}
                  disabled={cart.length === 0}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs font-semibold disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                  title="Simpan keranjang"
                >
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                    />
                  </svg>
                  Simpan
                </button>
              )}
              {onLoadParked && onJadikanPenawaran && onDeleteParked && (
                <DropdownKeranjangTersimpan
                  parkedCarts={parkedCarts}
                  onLoad={(id) => {
                    onLoadParked(id);
                    onClose();
                  }}
                  onJadikanPenawaran={(id) => {
                    onJadikanPenawaran(id);
                    onClose();
                  }}
                  onDelete={onDeleteParked}
                />
              )}
            </div>
          </div>

          <div className="text-right shrink-0">
            <p className="text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">
              Total
            </p>
            <p className="text-xl font-bold text-[#00afef] leading-tight">
              Rp {total.toLocaleString("id-ID")}
            </p>
          </div>

          {/* Tombol tutup */}
          <button
            type="button"
            onClick={onClose}
            className="ml-2 p-1.5 rounded-lg text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-800 transition-colors"
            aria-label="Tutup keranjang"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* ===== BODY DUA KOLOM ===== */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 overflow-hidden">
          {/* ---- KIRI: Daftar item ---- */}
          <div className="overflow-y-auto px-4 py-3 space-y-2 border-b lg:border-b-0 lg:border-r border-gray-200 dark:border-slate-800">
            {cart.length === 0 ? (
              <div className="text-center py-12 text-gray-500 dark:text-slate-400">
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
                <p className="font-semibold text-base">Keranjang Kosong</p>
                <p className="text-sm mt-1">Tambahkan barang untuk memulai</p>
              </div>
            ) : (
              cart.map((item, index) => {
                const itemBiayaTotal = getItemBiayaTambahanTotal(item);
                const lineTotal = lineCharges[index] + itemBiayaTotal;
                return (
                  <div
                    key={index}
                    className={`bg-white dark:bg-slate-900 rounded-lg p-3 border transition-all ${
                      editingCartIndex === index
                        ? "border-amber-400 ring-2 ring-amber-200/50 shadow-sm"
                        : "border-gray-200 dark:border-slate-800 hover:border-[#00afef]/50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-base text-gray-800 dark:text-slate-100 truncate">
                          {getCartItemNamaTampil(item)}
                        </div>
                        {item.catatan_item && (
                          <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mt-0.5 truncate">
                            {item.catatan_item}
                          </div>
                        )}
                        <div className="text-sm text-gray-600 dark:text-slate-300 mt-0.5">
                          {item.butuh_dimensi &&
                          item.panjang &&
                          item.lebar ? (
                            <span>
                              {item.useRounding &&
                              item.selectedRollSize != null &&
                              item.billedPanjang != null &&
                              item.billedLebar != null ? (
                                formatRollCartDetailLine(item)
                              ) : (
                                <>
                                  {(item.jumlah_roll ?? 1) > 1
                                    ? `${item.jumlah_roll} × `
                                    : ""}
                                  {item.panjang.toFixed(2)} ×{" "}
                                  {item.lebar.toFixed(2)} m ={" "}
                                  {item.jumlah.toFixed(2)} m² @ Rp{" "}
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
                            Math.abs(
                              item.harga_satuan - item.originalHargaSatuan,
                            ) > 0.01 && (
                              <span className="ml-1.5 inline-block text-[11px] px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-bold rounded uppercase tracking-wide">
                                Harga Ubah
                              </span>
                            )}
                        </div>
                        <div className="text-base font-bold text-[#00afef] mt-1">
                          Rp {lineTotal.toLocaleString("id-ID")}
                        </div>
                        {itemBiayaTotal > 0 && (
                          <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                            Barang Rp{" "}
                            {lineCharges[index].toLocaleString("id-ID")}
                            {" + biaya Rp "}
                            {itemBiayaTotal.toLocaleString("id-ID")}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {item.tipe_item === "MAKLON" &&
                          onEditRincianInternal && (
                            <button
                              type="button"
                              onClick={() => {
                                onEditRincianInternal(index);
                                onClose();
                              }}
                              className="bg-amber-100 dark:bg-amber-900/30 hover:bg-amber-200 dark:hover:bg-amber-900/50 p-1.5 rounded-md transition-all text-amber-700 dark:text-amber-300"
                              aria-label="Rincian internal maklon"
                              title="Rincian internal"
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
                            </button>
                          )}
                        {onEditItem && item.tipe_item !== "MAKLON" && (
                          <button
                            type="button"
                            onClick={() => {
                              onEditItem(index);
                              onClose();
                            }}
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
                              className="inline-block text-xs px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200 rounded"
                            >
                              {fin.jenis_finishing}
                              {fin.keterangan && ` (${fin.keterangan})`}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {item.biaya_tambahan && item.biaya_tambahan.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-gray-100 dark:border-slate-800">
                        <div className="flex flex-wrap gap-1">
                          {item.biaya_tambahan.map((biaya, biayaIndex) => (
                            <span
                              key={biayaIndex}
                              className="inline-block text-xs px-1.5 py-0.5 bg-cyan-100 dark:bg-cyan-900/30 text-cyan-800 dark:text-cyan-200 rounded"
                            >
                              {biaya.label || "Biaya"}
                              {biaya.nominal > 0 &&
                                ` Rp ${biaya.nominal.toLocaleString("id-ID")}`}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* ---- KANAN: Pembayaran ---- */}
          <div className="overflow-y-auto flex flex-col">
            {/* Baris bulatkan + Lihat Faktur */}
            {cart.length > 0 && (
              <div className="shrink-0 px-4 py-2.5 border-b border-gray-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/60">
                <div className="flex items-center justify-between gap-2">
                  {hasRoundingChoice ? (
                    <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={roundCartPrices}
                        onChange={(e) =>
                          onRoundCartPricesChange(e.target.checked)
                        }
                        className="w-3.5 h-3.5 text-[#00afef] border-gray-300 rounded focus:ring-[#00afef]"
                      />
                      Bulatkan kelipatan Rp 1.000
                    </label>
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    onClick={handlePreviewFaktur}
                    disabled={cart.length === 0}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-800/50 text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Lihat faktur"
                  >
                    <svg
                      className="w-3.5 h-3.5"
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
                    Lihat Faktur
                  </button>
                </div>
              </div>
            )}

            {/* Panel pembayaran */}
            <div className="flex-1 px-4 pb-4 pt-3 space-y-2.5 bg-gradient-to-br from-slate-50 to-gray-100 dark:from-slate-900 dark:to-slate-900">
              {biayaTambahanTotal > 0 && (
                <div className="flex items-center justify-between text-xs px-2 py-1.5 rounded-lg bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-800/50">
                  <span className="text-gray-600 dark:text-slate-400">
                    Subtotal barang Rp {subtotalItems.toLocaleString("id-ID")}
                    {" + biaya tambahan"}
                  </span>
                  <span className="font-bold text-[#00afef]">
                    Rp {biayaTambahanTotal.toLocaleString("id-ID")}
                  </span>
                </div>
              )}

              {/* Metode pembayaran */}
              <div>
                <label className="block text-sm font-bold text-gray-600 dark:text-slate-300 mb-1.5">
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
                      className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-semibold transition-all border-2 ${
                        paymentMethod === method.value
                          ? "bg-[#00afef] text-white border-[#00afef] shadow-sm"
                          : "bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-800 hover:border-[#00afef]/50"
                      }`}
                    >
                      <div
                        className={
                          paymentMethod === method.value
                            ? "brightness-0 invert"
                            : ""
                        }
                      >
                        {method.icon}
                      </div>
                      {method.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Jumlah bayar + kilat */}
              <div className="flex items-end gap-2">
                <div className="flex-1 min-w-0">
                  <label className="block text-sm font-bold text-gray-600 dark:text-slate-300 mb-1">
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
                  <span className="text-sm font-bold text-gray-700 dark:text-slate-300 whitespace-nowrap">
                    Kilat
                  </span>
                </label>
              </div>

              {/* Denominasi cepat */}
              <div className="grid grid-cols-4 gap-1.5">
                {[10000, 20000, 50000, 100000].map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => {
                      const current = parseFloat(jumlahBayar) || 0;
                      onJumlahBayarChange(String(current + amount));
                    }}
                    className="px-1 py-1 bg-white dark:bg-slate-900 hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 rounded border border-gray-200 dark:border-slate-800 text-xs font-semibold transition-all cursor-pointer"
                  >
                    {amount >= 1000 ? `${amount / 1000}rb` : amount}
                  </button>
                ))}
              </div>

              {/* Kembalian / kurang */}
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
                      className={`text-sm font-bold ${
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
                      className="text-xs text-green-700 dark:text-green-400 underline mt-1"
                    >
                      {showChangeDetail
                        ? "Sembunyikan pecahan"
                        : "Lihat pecahan"}
                    </button>
                  )}
                  {showChangeDetail && kembalian > 0 && (
                    <div className="grid grid-cols-2 gap-1 mt-2 text-xs">
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
                    <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-1">
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
                  className="text-sm font-semibold text-gray-500 dark:text-slate-400 hover:text-[#00afef] transition-colors"
                >
                  {showNotes
                    ? "− Sembunyikan catatan"
                    : "+ Catatan (opsional)"}
                </button>
                {showNotes && (
                  <input
                    type="text"
                    value={catatan}
                    onChange={(e) => onCatatanChange(e.target.value)}
                    placeholder="Catatan transaksi..."
                    className="mt-1.5 w-full px-3 py-2 text-base bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 border-2 border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:border-[#00afef]"
                  />
                )}
              </div>

              {/* Jenis cetak */}
              <div>
                <label className="block text-sm font-bold text-gray-600 dark:text-slate-300 mb-1">
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
                      className={`py-2 px-1 rounded-lg border-2 text-sm font-semibold transition-all flex flex-col items-center justify-center leading-tight ${
                        printType === opt.value
                          ? "bg-[#00afef] text-white border-[#00afef]"
                          : "bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 border-gray-300 hover:border-[#00afef]"
                      }`}
                    >
                      <span>{opt.label}</span>
                      {opt.hint && (
                        <span
                          className={`text-xs ${
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

              {/* Tombol proses pembayaran */}
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
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
