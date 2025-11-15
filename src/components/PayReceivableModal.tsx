"use client";

import { useState, useEffect, useRef } from "react";
import { useClickOutside } from "@/hooks/useClickOutside";
import { MoneyIcon } from "./icons/PageIcons";

interface Receivable {
  id: string;
  id_penjualan: string;
  nomor_invoice?: string;
  pelanggan_nama?: string | null;
  jumlah_piutang: number;
  jumlah_terbayar: number;
  sisa_piutang: number;
  jatuh_tempo?: string | null;
  status: string;
  dibuat_pada?: string;
}

interface PaymentData {
  piutang_id: string;
  jumlah_bayar: number;
  tanggal_bayar: string;
  metode_pembayaran: string;
  referensi?: string;
  catatan?: string;
  dibuat_oleh?: string;
}

interface PayReceivableModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentUserId: string | null;
  onGetReceivables: () => Promise<Receivable[]>;
  onPayReceivable: (data: PaymentData) => Promise<any>;
}

export default function PayReceivableModal({
  isOpen,
  onClose,
  onSuccess,
  currentUserId,
  onGetReceivables,
  onPayReceivable,
}: PayReceivableModalProps) {
  const [loading, setLoading] = useState(false);
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [selectedReceivable, setSelectedReceivable] =
    useState<Receivable | null>(null);
  const [jumlahBayar, setJumlahBayar] = useState("");
  const [metodePembayaran, setMetodePembayaran] = useState("CASH");
  const [tanggalBayar, setTanggalBayar] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [referensi, setReferensi] = useState("");
  const [catatan, setCatatan] = useState("");
  const [error, setError] = useState("");

  const modalRef = useRef<HTMLDivElement>(null);

  useClickOutside(modalRef, () => {
    if (!loading) onClose();
  });

  useEffect(() => {
    if (isOpen) {
      loadReceivables();
    } else {
      resetForm();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === "Escape") {
        if (!loading) onClose();
      } else if (e.key === "Enter" && selectedReceivable) {
        e.preventDefault();
        handleSubmit(e as any);
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [isOpen, loading, selectedReceivable]);

  const resetForm = () => {
    setSelectedReceivable(null);
    setJumlahBayar("");
    setMetodePembayaran("CASH");
    setTanggalBayar(new Date().toISOString().split("T")[0]);
    setReferensi("");
    setCatatan("");
    setError("");
  };

  const loadReceivables = async () => {
    setLoading(true);
    try {
      const data = await onGetReceivables();
      setReceivables(data || []);
    } catch (err) {
      console.error("Error loading receivables:", err);
      setError("Terjadi kesalahan saat memuat data piutang");
    }
    setLoading(false);
  };

  const handleSelectReceivable = (receivable: Receivable) => {
    setSelectedReceivable(receivable);
    setJumlahBayar(receivable.sisa_piutang.toString());
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReceivable) {
      setError("Pilih piutang yang akan dibayar");
      return;
    }

    const amount = parseFloat(jumlahBayar);
    if (isNaN(amount) || amount <= 0) {
      setError("Jumlah pembayaran harus lebih dari 0");
      return;
    }

    if (amount > selectedReceivable.sisa_piutang) {
      setError("Jumlah pembayaran tidak boleh melebihi sisa piutang");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await onPayReceivable({
        piutang_id: selectedReceivable.id,
        jumlah_bayar: amount,
        tanggal_bayar: tanggalBayar,
        metode_pembayaran: metodePembayaran,
        referensi: referensi.trim() || undefined,
        catatan: catatan.trim() || undefined,
        dibuat_oleh: currentUserId || undefined,
      });

      onSuccess();
      onClose();
      resetForm();
    } catch (err: any) {
      setError(err.message || "Gagal memproses pembayaran");
      console.error("Error paying receivable:", err);
      setError("Terjadi kesalahan saat memproses pembayaran");
    }
    setLoading(false);
  };

  const formatRupiah = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        ref={modalRef}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-[#00afef] to-[#2266ff] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 backdrop-blur-sm p-2 rounded-lg">
              <MoneyIcon size={24} className="text-white" />
            </div>
            <h2 className="text-xl font-bold text-white">
              Terima Pembayaran Piutang
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 rounded-lg p-2 transition-all"
            disabled={loading}
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && !selectedReceivable ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500"></div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Daftar Piutang */}
              <div>
                <h3 className="text-lg font-bold text-gray-800 mb-4">
                  Daftar Penjualan Berpiutang
                </h3>

                {receivables.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <svg
                      className="w-16 h-16 mx-auto mb-3 opacity-30"
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
                    <p className="font-semibold">Tidak Ada Piutang</p>
                    <p className="text-sm mt-1">Semua penjualan sudah lunas</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[500px] overflow-y-auto">
                    {receivables.map((receivable) => (
                      <div
                        key={receivable.id}
                        onClick={() => handleSelectReceivable(receivable)}
                        className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                          selectedReceivable?.id === receivable.id
                            ? "border-[#00afef] bg-cyan-50"
                            : "border-gray-200 hover:border-[#00afef]/50 hover:bg-cyan-50/50"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="font-bold text-gray-800">
                              {receivable.nomor_invoice}
                            </div>
                            <div className="text-sm text-gray-600 mt-1">
                              {receivable.pelanggan_nama || "Walk-in Customer"}
                            </div>
                            {receivable.dibuat_pada && (
                              <div className="text-xs text-gray-500 mt-1">
                                {formatDate(receivable.dibuat_pada)}
                              </div>
                            )}
                            <div className="mt-3 space-y-1">
                              <div className="text-sm">
                                <span className="text-gray-600">Total:</span>{" "}
                                <span className="font-semibold">
                                  {formatRupiah(receivable.jumlah_piutang)}
                                </span>
                              </div>
                              <div className="text-sm">
                                <span className="text-gray-600">Terbayar:</span>{" "}
                                <span className="font-semibold text-green-600">
                                  {formatRupiah(receivable.jumlah_terbayar)}
                                </span>
                              </div>
                              <div className="text-sm">
                                <span className="text-gray-600">Sisa:</span>{" "}
                                <span className="font-bold text-red-600">
                                  {formatRupiah(receivable.sisa_piutang)}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div
                            className={`px-2 py-1 rounded text-xs font-semibold ${
                              receivable.status === "AKTIF"
                                ? "bg-red-100 text-red-700"
                                : "bg-yellow-100 text-yellow-700"
                            }`}
                          >
                            {receivable.status}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Form Pembayaran */}
              <div>
                <h3 className="text-lg font-bold text-gray-800 mb-4">
                  Form Pembayaran
                </h3>

                {!selectedReceivable ? (
                  <div className="text-center py-12 text-gray-400">
                    <svg
                      className="w-16 h-16 mx-auto mb-3 opacity-30"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
                      />
                    </svg>
                    <p>Pilih piutang untuk memproses pembayaran</p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    {error && (
                      <div className="p-4 bg-red-50 border-2 border-red-200 rounded-lg">
                        <p className="text-sm text-red-700 font-semibold">
                          {error}
                        </p>
                      </div>
                    )}

                    <div className="p-4 bg-gradient-to-br from-cyan-50 to-blue-50 border-2 border-[#00afef]/30 rounded-lg">
                      <div className="text-sm text-gray-600 mb-2">
                        Invoice: {selectedReceivable.nomor_invoice}
                      </div>
                      <div className="text-2xl font-bold text-gray-800">
                        Sisa Piutang
                      </div>
                      <div className="text-3xl font-bold text-[#00afef] mt-1">
                        {formatRupiah(selectedReceivable.sisa_piutang)}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Jumlah Pembayaran *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={jumlahBayar}
                        onChange={(e) => setJumlahBayar(e.target.value)}
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-[#00afef]"
                        required
                      />
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setJumlahBayar(
                              selectedReceivable.sisa_piutang.toString()
                            )
                          }
                          className="px-3 py-1 bg-green-100 text-green-700 rounded text-sm font-semibold hover:bg-green-200 transition-colors"
                        >
                          Lunas ({formatRupiah(selectedReceivable.sisa_piutang)}
                          )
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setJumlahBayar(
                              (selectedReceivable.sisa_piutang / 2).toString()
                            )
                          }
                          className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm font-semibold hover:bg-blue-200 transition-colors"
                        >
                          50% (
                          {formatRupiah(selectedReceivable.sisa_piutang / 2)})
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Tanggal Pembayaran *
                      </label>
                      <input
                        type="date"
                        value={tanggalBayar}
                        onChange={(e) => setTanggalBayar(e.target.value)}
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-[#00afef]"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Metode Pembayaran *
                      </label>
                      <select
                        value={metodePembayaran}
                        onChange={(e) => setMetodePembayaran(e.target.value)}
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-[#00afef]"
                      >
                        <option value="CASH">Cash</option>
                        <option value="TRANSFER">Transfer</option>
                        <option value="QRIS">QRIS</option>
                        <option value="DEBIT">Debit/Kredit</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Referensi (No. Transaksi/Bukti)
                      </label>
                      <input
                        type="text"
                        value={referensi}
                        onChange={(e) => setReferensi(e.target.value)}
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-[#00afef]"
                        placeholder="Opsional"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Catatan
                      </label>
                      <textarea
                        value={catatan}
                        onChange={(e) => setCatatan(e.target.value)}
                        rows={3}
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-[#00afef]"
                        placeholder="Catatan tambahan..."
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3 bg-gradient-to-r from-[#00afef] to-[#2266ff] text-white rounded-lg font-bold hover:from-[#0099dd] hover:to-[#1955ee] transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-md"
                    >
                      {loading ? (
                        <>
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                          Memproses...
                        </>
                      ) : (
                        <>
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
                        </>
                      )}
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
