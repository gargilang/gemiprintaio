"use client";

import { useState } from "react";
import {
  CashIcon,
  TransferIcon,
  QRISIcon,
  CardIcon,
  CalendarIcon,
} from "./icons/ContentIcons";
import AddFinishingModal from "./AddFinishingModal";

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
  subtotal: number;
  finishing?: FinishingItem[];
}

interface POSCartProps {
  cart: CartItem[];
  paymentMethod: string;
  jumlahBayar: string;
  catatan: string;
  prioritas: "NORMAL" | "KILAT";
  onRemoveItem: (index: number) => void;
  onPaymentMethodChange: (method: string) => void;
  onJumlahBayarChange: (jumlah: string) => void;
  onCatatanChange: (catatan: string) => void;
  onPrioritasChange: (prioritas: "NORMAL" | "KILAT") => void;
  onCheckout: () => void;
  onEditFinishing?: (index: number, finishing: FinishingItem[]) => void;
}

// Pecahan uang Indonesia
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

export default function POSCart({
  cart,
  paymentMethod,
  jumlahBayar,
  catatan,
  prioritas,
  onRemoveItem,
  onPaymentMethodChange,
  onJumlahBayarChange,
  onCatatanChange,
  onPrioritasChange,
  onCheckout,
  onEditFinishing,
}: POSCartProps) {
  const total = cart.reduce((sum, item) => sum + item.subtotal, 0);
  const bayar = parseFloat(jumlahBayar) || 0;
  const kembalian = Math.max(0, bayar - total);
  const kurang = Math.max(0, total - bayar);
  const changeBreakdown = calculateChange(kembalian);
  const [showChangeDetail, setShowChangeDetail] = useState(false);
  const [editingFinishingIndex, setEditingFinishingIndex] = useState<
    number | null
  >(null);

  const paymentMethods = [
    {
      value: "CASH",
      label: "Cash",
      icon: <CashIcon size={18} className="text-black" />,
    },
    {
      value: "TRANSFER",
      label: "Transfer",
      icon: <TransferIcon size={18} className="text-black" />,
    },
    {
      value: "QRIS",
      label: "QRIS",
      icon: <QRISIcon size={18} className="text-black" />,
    },
    {
      value: "DEBIT",
      label: "Debit/Kredit",
      icon: <CardIcon size={18} className="text-black" />,
    },
    {
      value: "NET30",
      label: "NET 30",
      icon: <CalendarIcon size={18} className="text-black" />,
    },
  ];

  return (
    <div className="bg-gradient-to-br from-slate-50 to-gray-100 rounded-xl shadow-2xl p-6 border-2 border-gray-200 sticky top-6">
      <div className="flex items-center gap-3 mb-6 pb-4 border-b-2 border-gray-300">
        <div className="bg-gradient-to-br from-[#00afef] to-[#0088cc] p-3 rounded-lg shadow-md">
          <svg
            className="w-8 h-8 text-white"
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
        <div>
          <h3 className="text-2xl font-bold text-gray-800">Keranjang</h3>
          <p className="text-sm text-gray-600">{cart.length} item</p>
        </div>
      </div>

      {/* Cart Items */}
      <div className="space-y-3 mb-6 max-h-[300px] overflow-y-auto">
        {cart.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <svg
              className="w-16 h-16 mx-auto mb-3 opacity-50"
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
            <p className="font-semibold">Keranjang Kosong</p>
            <p className="text-sm mt-1">
              Tambahkan barang untuk memulai transaksi
            </p>
          </div>
        ) : (
          cart.map((item, index) => (
            <div
              key={index}
              className="bg-white rounded-lg p-4 border-2 border-gray-200 hover:border-[#00afef]/50 hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-gray-800 truncate">
                    {item.barang_nama}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    {item.butuh_dimensi && item.panjang && item.lebar ? (
                      <span>
                        {item.panjang} × {item.lebar} m
                        {!item.useRounding && (
                          <> = {item.jumlah.toFixed(2)} m²</>
                        )}
                      </span>
                    ) : (
                      <span>
                        {item.jumlah} {item.nama_satuan}
                      </span>
                    )}
                    {" @ "}
                    <span className="font-semibold">
                      Rp {item.harga_satuan.toLocaleString("id-ID")}
                    </span>
                  </div>
                  <div className="text-lg font-bold text-[#00afef] mt-2">
                    Rp {item.subtotal.toLocaleString("id-ID")}
                  </div>
                </div>
                <button
                  onClick={() => onRemoveItem(index)}
                  className="bg-red-500/80 hover:bg-red-500 p-2 rounded-lg transition-all flex-shrink-0 text-white"
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
              </div>

              {/* Finishing Section */}
              {item.finishing && item.finishing.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-200">
                  <div className="text-xs font-semibold text-orange-700 mb-1">
                    Finishing:
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {item.finishing.map((fin, finIndex) => (
                      <span
                        key={finIndex}
                        className="inline-block text-xs px-2 py-1 bg-orange-100 text-orange-800 rounded"
                      >
                        {fin.jenis_finishing}
                        {fin.keterangan && ` (${fin.keterangan})`}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Add Finishing Button */}
              {onEditFinishing && (
                <button
                  onClick={() => setEditingFinishingIndex(index)}
                  className="w-full mt-2 px-3 py-1.5 bg-gradient-to-r from-amber-700/10 to-amber-900/10 border border-amber-700/30 text-amber-800 rounded-lg hover:from-amber-700/20 hover:to-amber-900/20 transition-all text-xs font-semibold flex items-center justify-center gap-1"
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
                      d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
                    />
                  </svg>
                  {item.finishing && item.finishing.length > 0
                    ? "Edit Finishing"
                    : "Tambah Finishing"}
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Total */}
      <div className="bg-gradient-to-br from-[#00afef] to-[#0088cc] rounded-lg p-4 mb-6 border-2 border-[#00afef] shadow-lg">
        <div className="flex items-center justify-between">
          <span className="text-xl font-bold text-white">TOTAL</span>
          <span className="text-3xl font-bold text-white">
            Rp {total.toLocaleString("id-ID")}
          </span>
        </div>
      </div>

      {/* Payment Method */}
      <div className="mb-4">
        <label className="block text-sm font-bold mb-2 text-gray-700">
          Metode Pembayaran
        </label>
        <div className="grid grid-cols-2 gap-2">
          {paymentMethods.map((method) => (
            <button
              key={method.value}
              onClick={() => onPaymentMethodChange(method.value)}
              className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-semibold transition-all border-2 ${
                paymentMethod === method.value
                  ? "bg-[#00afef] text-white border-[#00afef] shadow-lg scale-105"
                  : "bg-white text-gray-700 border-gray-300 hover:border-[#00afef]/50"
              }`}
            >
              <div
                className={
                  paymentMethod === method.value ? "brightness-0 invert" : ""
                }
              >
                {method.icon}
              </div>
              <span className="text-sm">{method.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Priority Selection */}
      <div className="mb-4">
        <label className="flex items-center gap-2 cursor-pointer p-3 bg-gray-50 rounded-lg border-2 border-gray-300 hover:border-amber-700 transition-all">
          <input
            type="checkbox"
            checked={prioritas === "KILAT"}
            onChange={(e) =>
              onPrioritasChange(e.target.checked ? "KILAT" : "NORMAL")
            }
            className="w-5 h-5 text-amber-700 rounded focus:ring-amber-700 focus:ring-2 cursor-pointer"
          />
          <span className="text-sm font-bold text-gray-700">Orderan Kilat</span>
        </label>
      </div>

      {/* Amount Paid Input */}
      <div className="mb-4">
        <label className="block text-sm font-bold mb-2 text-gray-700">
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
          className="w-full px-4 py-3 bg-white text-black border-2 border-gray-300 rounded-lg focus:outline-none focus:border-[#00afef] font-bold text-xl"
        />
        {/* Quick Amount Buttons */}
        <div className="grid grid-cols-4 gap-2 mt-2">
          {[10000, 20000, 50000, 100000].map((amount) => (
            <button
              key={amount}
              onClick={() =>
                onJumlahBayarChange(String(Math.ceil(total / amount) * amount))
              }
              className="px-2 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded text-xs font-semibold transition-all"
            >
              {amount >= 1000 ? `${amount / 1000}rb` : amount}
            </button>
          ))}
        </div>
      </div>

      {/* Change/Kurang Display */}
      {bayar > 0 && (
        <div className="mb-4">
          {kembalian > 0 ? (
            <div className="bg-green-500/20 border-2 border-green-400 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-green-800">KEMBALIAN</span>
                <span className="text-2xl font-bold text-green-800">
                  Rp {kembalian.toLocaleString("id-ID")}
                </span>
              </div>
              {changeBreakdown.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowChangeDetail(!showChangeDetail)}
                    className="text-xs hover:text-green-700 underline mb-2"
                  >
                    {showChangeDetail ? "Sembunyikan" : "Lihat"} Pecahan
                  </button>
                  {showChangeDetail && (
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {changeBreakdown.map(({ denom, label, count }) => (
                        <div
                          key={denom}
                          className="flex justify-between bg-green-600/30 rounded px-2 py-1"
                        >
                          <span>{label}:</span>
                          <span className="font-bold">{count}x</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : kurang > 0 ? (
            <div className="bg-yellow-50 border-2 border-yellow-400 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <span className="font-bold text-yellow-800">KURANG</span>
                <span className="text-2xl font-bold text-yellow-600">
                  Rp {kurang.toLocaleString("id-ID")}
                </span>
              </div>
              <p className="text-xs text-yellow-700 mt-2">
                Kekurangan akan masuk ke Tagihan
              </p>
            </div>
          ) : (
            <div className="bg-green-50 border-2 border-green-400 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <span className="font-bold text-green-800">STATUS</span>
                <span className="text-lg font-bold text-green-600">
                  PAS / LUNAS
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Notes */}
      <div className="mb-6">
        <label className="block text-sm font-bold mb-2 text-gray-700">
          Catatan (Opsional)
        </label>
        <textarea
          value={catatan}
          onChange={(e) => onCatatanChange(e.target.value)}
          placeholder="Tambahkan catatan..."
          rows={2}
          className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-lg focus:outline-none focus:border-[#00afef] text-gray-700 placeholder-gray-400"
        />
      </div>

      {/* Checkout Button */}
      <button
        onClick={onCheckout}
        disabled={cart.length === 0}
        className="w-full py-4 bg-gradient-to-r from-[#00afef] to-[#2266ff] text-white rounded-lg font-bold text-lg hover:from-[#0099dd] hover:to-[#1955ee] transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        <svg
          className="w-6 h-6"
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

      {/* Finishing Modal */}
      {editingFinishingIndex !== null && onEditFinishing && (
        <AddFinishingModal
          onClose={() => setEditingFinishingIndex(null)}
          onAdd={(finishing) => {
            onEditFinishing(editingFinishingIndex, finishing);
            setEditingFinishingIndex(null);
          }}
          existingFinishing={cart[editingFinishingIndex]?.finishing}
          itemName={cart[editingFinishingIndex]?.barang_nama || ""}
        />
      )}
    </div>
  );
}
