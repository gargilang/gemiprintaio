"use client";

import { useState, useEffect } from "react";
import { MoneyIcon } from "./icons/PageIcons";
import { ClockIcon, CheckIcon } from "./icons/ContentIcons";

interface DebtPurchase {
  id: string;
  nomor_pembelian: string;
  nomor_faktur: string;
  tanggal: string;
  vendor_name: string | null;
  total_jumlah: number;
  jumlah_dibayar: number;
  sisa_hutang: number;
  status_pembayaran: string;
}

interface PayDebtModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentUserId: string | null;
}

export default function PayDebtModal({
  isOpen,
  onClose,
  onSuccess,
  currentUserId,
}: PayDebtModalProps) {
  const [loading, setLoading] = useState(false);
  const [debts, setDebts] = useState<DebtPurchase[]>([]);
  const [selectedDebt, setSelectedDebt] = useState<DebtPurchase | null>(null);
  const [jumlahBayar, setJumlahBayar] = useState("");
  const [metodePembayaran, setMetodePembayaran] = useState("CASH");
  const [tanggalBayar, setTanggalBayar] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [referensi, setReferensi] = useState("");
  const [catatan, setCatatan] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      loadDebts();
    } else {
      // Reset form when modal closes
      resetForm();
    }
  }, [isOpen]);

  const resetForm = () => {
    setSelectedDebt(null);
    setJumlahBayar("");
    setMetodePembayaran("CASH");
    setTanggalBayar(new Date().toISOString().split("T")[0]);
    setReferensi("");
    setCatatan("");
    setError("");
  };

  const loadDebts = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/purchases/debts");
      if (res.ok) {
        const data = await res.json();
        setDebts(data.debts || []);
      } else {
        const data = await res.json();
        setError(data.error || "Gagal memuat data tagihan");
      }
    } catch (err) {
      console.error("Error loading debts:", err);
      setError("Terjadi kesalahan saat memuat data tagihan");
    }
    setLoading(false);
  };

  const handleSelectDebt = (debt: DebtPurchase) => {
    setSelectedDebt(debt);
    setJumlahBayar(debt.sisa_hutang.toString());
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDebt) {
      setError("Pilih pembelian yang akan dibayar");
      return;
    }

    const amount = parseFloat(jumlahBayar);
    if (isNaN(amount) || amount <= 0) {
      setError("Jumlah pembayaran harus lebih dari 0");
      return;
    }

    if (amount > selectedDebt.sisa_hutang) {
      setError("Jumlah pembayaran tidak boleh melebihi sisa tagihan");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/purchases/pay-debt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchase_id: selectedDebt.id,
          jumlah_bayar: amount,
          tanggal_bayar: tanggalBayar,
          metode_pembayaran: metodePembayaran,
          referensi: referensi.trim() || null,
          catatan: catatan.trim() || null,
          dibuat_oleh: currentUserId,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        onSuccess();
        onClose();
        resetForm();
      } else {
        setError(data.error || "Gagal memproses pembayaran");
      }
    } catch (err) {
      console.error("Error paying debt:", err);
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-500 to-purple-500 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 backdrop-blur-sm p-2 rounded-lg">
              <MoneyIcon size={24} className="text-white" />
            </div>
            <h2 className="text-xl font-bold text-white">Pembayaran Tagihan</h2>
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
          {loading && !selectedDebt ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500"></div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Daftar Tagihan */}
              <div>
                <h3 className="text-lg font-bold text-gray-800 mb-4">
                  Daftar Pembelian Bertagihan
                </h3>
                {debts.length === 0 ? (
                  <div className="text-center py-8 bg-green-50 rounded-lg border border-green-200">
                    <CheckIcon
                      size={48}
                      className="mx-auto text-green-500 mb-2"
                    />
                    <p className="text-green-700 font-semibold">
                      Tidak ada tagihan pembelian
                    </p>
                    <p className="text-green-600 text-sm mt-1">
                      Semua pembelian sudah lunas
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
                    {debts.map((debt) => (
                      <div
                        key={debt.id}
                        onClick={() => handleSelectDebt(debt)}
                        className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                          selectedDebt?.id === debt.id
                            ? "border-indigo-500 bg-indigo-50"
                            : "border-gray-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/50"
                        }`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <div className="font-bold text-gray-800">
                              {debt.nomor_faktur}
                            </div>
                            <div className="text-sm text-gray-600">
                              {debt.nomor_pembelian}
                            </div>
                          </div>
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold ${
                              debt.status_pembayaran === "SEBAGIAN"
                                ? "bg-blue-100 text-blue-700"
                                : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            <ClockIcon size={12} className="text-[#2266ff]" />
                            {debt.status_pembayaran === "HUTANG"
                              ? "TAGIHAN"
                              : debt.status_pembayaran}
                          </span>
                        </div>
                        <div className="text-sm text-gray-600 mb-2">
                          <div>
                            Vendor:{" "}
                            {debt.vendor_name || (
                              <span className="italic">Tanpa Vendor</span>
                            )}
                          </div>
                          <div>Tanggal: {formatDate(debt.tanggal)}</div>
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                          <div className="text-sm">
                            <div className="text-gray-600">
                              Total: {formatRupiah(debt.total_jumlah)}
                            </div>
                            <div className="text-gray-600">
                              Dibayar: {formatRupiah(debt.jumlah_dibayar)}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-gray-500">
                              Sisa Tagihan
                            </div>
                            <div className="text-lg font-bold text-red-600">
                              {formatRupiah(debt.sisa_hutang)}
                            </div>
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
                {!selectedDebt ? (
                  <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
                    <ClockIcon
                      size={48}
                      className="mx-auto text-gray-400 mb-2"
                    />
                    <p className="text-gray-600">
                      Pilih pembelian di sebelah kiri untuk melakukan pembayaran
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    {error && (
                      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                        {error}
                      </div>
                    )}

                    <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-lg">
                      <div className="text-sm text-indigo-800 mb-2">
                        Pembelian Terpilih:
                      </div>
                      <div className="font-bold text-gray-800">
                        {selectedDebt.nomor_faktur}
                      </div>
                      <div className="text-sm text-gray-600">
                        Sisa Tagihan:{" "}
                        <span className="font-bold text-red-600">
                          {formatRupiah(selectedDebt.sisa_hutang)}
                        </span>
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
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Jumlah Pembayaran (Rp) *
                      </label>
                      <input
                        type="number"
                        value={jumlahBayar}
                        onChange={(e) => setJumlahBayar(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="Masukkan jumlah pembayaran"
                        min="0"
                        step="0.01"
                        required
                      />
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setJumlahBayar(selectedDebt.sisa_hutang.toString())
                          }
                          className="px-3 py-1 bg-green-100 text-green-700 rounded text-sm font-semibold hover:bg-green-200 transition-colors"
                        >
                          Lunas ({formatRupiah(selectedDebt.sisa_hutang)})
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setJumlahBayar(
                              (selectedDebt.sisa_hutang / 2).toString()
                            )
                          }
                          className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm font-semibold hover:bg-blue-200 transition-colors"
                        >
                          50% ({formatRupiah(selectedDebt.sisa_hutang / 2)})
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Metode Pembayaran *
                      </label>
                      <select
                        value={metodePembayaran}
                        onChange={(e) => setMetodePembayaran(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        required
                      >
                        <option value="CASH">CASH</option>
                        <option value="TRANSFER">TRANSFER</option>
                        <option value="GIRO">GIRO</option>
                        <option value="CEK">CEK</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Referensi (No. Transaksi/Giro/Cek)
                      </label>
                      <input
                        type="text"
                        value={referensi}
                        onChange={(e) => setReferensi(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        rows={3}
                        placeholder="Catatan pembayaran (opsional)"
                      />
                    </div>

                    <div className="flex gap-3 pt-4">
                      <button
                        type="button"
                        onClick={() => setSelectedDebt(null)}
                        className="flex-1 px-4 py-3 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition-all"
                        disabled={loading}
                      >
                        Batal
                      </button>
                      <button
                        type="submit"
                        className="flex-1 px-4 py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-lg font-semibold hover:from-indigo-600 hover:to-purple-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={loading}
                      >
                        {loading ? "Memproses..." : "Bayar"}
                      </button>
                    </div>
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
