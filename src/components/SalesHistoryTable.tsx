"use client";

import React, { useState } from "react";
import { TrashIcon } from "./icons/ContentIcons";
import ConfirmDialog from "./ConfirmDialog";

interface SaleItemRow {
  barang_nama?: string;
  nama_satuan?: string;
  jumlah?: number;
  harga_satuan?: number;
  subtotal?: number;
  hpp_total?: number;
  panjang?: number | null;
  lebar?: number | null;
}

interface Sale {
  id: string;
  nomor_invoice: string;
  pelanggan_nama: string | null;
  pelanggan_nama_snapshot?: string | null;
  pelanggan_kota?: string | null;
  total_jumlah: number;
  jumlah_dibayar?: number;
  metode_pembayaran: string;
  status_pembayaran: string;
  status_transaksi?: string;
  sisa_piutang: number;
  dibuat_pada: string;
  kasir_nama: string | null;
  has_pelunasan?: number; // 1 if has payment records, 0 if not
  items?: SaleItemRow[];
}

interface SalesHistoryTableProps {
  sales: Sale[];
  loading: boolean;
  onDelete?: (saleId: string) => Promise<void>;
  onRevert?: (sale: Sale) => void;
  onPayReceivable?: () => void;
}

export default function SalesHistoryTable({
  sales,
  loading,
  onDelete,
  onRevert,
  onPayReceivable,
}: SalesHistoryTableProps) {
  const [expandedSale, setExpandedSale] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    show: boolean;
    saleId: string;
    invoiceNumber: string;
  } | null>(null);
  const [fakturPromptSale, setFakturPromptSale] = useState<Sale | null>(null);
  const [fakturPromptInput, setFakturPromptInput] = useState({
    nama: "",
    kota: "Bekasi",
  });

  const filteredSales = sales.filter(
    (sale) =>
      sale.nomor_invoice.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sale.pelanggan_nama?.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      LUNAS: "bg-green-100 dark:bg-green-900/30 text-green-700 border-green-200 dark:border-slate-700",
      AKTIF: "bg-red-100 dark:bg-red-900/30 text-red-700 border-red-200 dark:border-red-800/50",
      SEBAGIAN: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 border-yellow-200 dark:border-yellow-800/50",
    };

    return (
      <span
        className={`px-2 py-1 rounded-lg text-xs font-semibold border ${
          styles[status as keyof typeof styles] || "bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300"
        }`}
      >
        {status}
      </span>
    );
  };

  const getPaymentMethodIcon = (method: string) => {
    const iconMap: { [key: string]: React.ReactNode } = {
      CASH: (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z"
            clipRule="evenodd"
          />
        </svg>
      ),
      TRANSFER: (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
          <path
            fillRule="evenodd"
            d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z"
            clipRule="evenodd"
          />
        </svg>
      ),
      QRIS: (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M3 4a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm2 2V5h1v1H5zM3 13a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1H4a1 1 0 01-1-1v-3zm2 2v-1h1v1H5zM13 3a1 1 0 00-1 1v3a1 1 0 001 1h3a1 1 0 001-1V4a1 1 0 00-1-1h-3zm1 2v1h1V5h-1z"
            clipRule="evenodd"
          />
          <path d="M11 4a1 1 0 10-2 0v1a1 1 0 002 0V4zM10 7a1 1 0 011 1v1h2a1 1 0 110 2h-3a1 1 0 01-1-1V8a1 1 0 011-1zM16 9a1 1 0 100 2 1 1 0 000-2zM9 13a1 1 0 011-1h1a1 1 0 110 2v2a1 1 0 11-2 0v-3zM7 11a1 1 0 100-2H4a1 1 0 100 2h3zM17 13a1 1 0 01-1 1h-2a1 1 0 110-2h2a1 1 0 011 1zM16 17a1 1 0 100-2h-3a1 1 0 100 2h3z" />
        </svg>
      ),
      DEBIT: (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
          <path
            fillRule="evenodd"
            d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z"
            clipRule="evenodd"
          />
        </svg>
      ),
      DOWN_PAYMENT: (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z"
            clipRule="evenodd"
          />
        </svg>
      ),
      NET30: (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z"
            clipRule="evenodd"
          />
        </svg>
      ),
    };

    return iconMap[method] || iconMap.CASH;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#00afef]"></div>
      </div>
    );
  }

  const reprintThermal = async (sale: Sale) => {
    setPrintingId(sale.id);
    try {
      const { printThermalInvoice } = await import("@/lib/thermal-print");
      const items = (sale.items || []).map((item) => {
        const dimensi =
          item.panjang && item.lebar
            ? `${item.panjang.toFixed(2)} × ${item.lebar.toFixed(2)} m`
            : undefined;
        return {
          nama: item.barang_nama || "-",
          jumlah: Number(item.jumlah || 0),
          satuan: item.nama_satuan || "",
          harga: Number(item.harga_satuan || 0),
          subtotal: Number(item.subtotal || 0),
          dimensi,
        };
      });
      const total = sale.total_jumlah;
      const bayar = sale.jumlah_dibayar ?? sale.total_jumlah - sale.sisa_piutang;
      printThermalInvoice({
        nomor_invoice: sale.nomor_invoice,
        tanggal: sale.dibuat_pada,
        pelanggan_nama:
          sale.pelanggan_nama || sale.pelanggan_nama_snapshot || undefined,
        kasir_nama: sale.kasir_nama || "Kasir",
        items,
        total,
        jumlah_bayar: bayar,
        kembalian: Math.max(0, bayar - total),
        metode_pembayaran: sale.metode_pembayaran,
      });
    } catch (e) {
      console.error("reprintThermal error:", e);
      alert("Gagal menyiapkan struk untuk dicetak.");
    } finally {
      setPrintingId(null);
    }
  };

  const reprintFaktur = async (
    sale: Sale,
    overrideNama?: string,
    overrideKota?: string
  ) => {
    const nama =
      overrideNama ||
      sale.pelanggan_nama ||
      sale.pelanggan_nama_snapshot ||
      "";
    if (!nama) {
      // Open prompt for old sales without snapshot data
      setFakturPromptInput({
        nama: "",
        kota: sale.pelanggan_kota || "Bekasi",
      });
      setFakturPromptSale(sale);
      return;
    }
    setPrintingId(sale.id);
    try {
      const { printFaktur, formatUkuran } = await import("@/lib/faktur-print");
      let shop:
        | {
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
          }
        | undefined;
      try {
        const { getShopSettingsAction } = await import("@/app/settings/actions");
        const settings = await getShopSettingsAction();
        shop = {
          nama_toko: settings.nama_toko,
          slogan: settings.slogan,
          alamat: settings.alamat,
          telepon: settings.telepon,
          email: settings.email,
          website: settings.website,
          bank_nama: settings.bank_nama,
          bank_nomor: settings.bank_nomor,
          bank_atas_nama: settings.bank_atas_nama,
          catatan_faktur: settings.catatan_faktur,
          npwp: settings.npwp,
          alamat_npwp: settings.alamat_npwp,
        };
      } catch (settingsError) {
        console.warn("Data usaha tidak bisa dimuat untuk reprint faktur:", settingsError);
      }
      const items = (sale.items || []).map((item) => ({
        nama: item.barang_nama || "-",
        ukuran: formatUkuran(item.panjang, item.lebar),
        qty: Number(item.jumlah || 0),
        satuan: item.nama_satuan || "",
        harga: Number(item.harga_satuan || 0),
        jumlah: Number(item.subtotal || 0),
      }));
      const total = sale.total_jumlah;
      const bayar = sale.jumlah_dibayar ?? sale.total_jumlah - sale.sisa_piutang;
      const sisa = Math.max(0, total - bayar);
      printFaktur({
        nomor_invoice: sale.nomor_invoice,
        tanggal: sale.dibuat_pada,
        pelanggan_nama: nama,
        kota: overrideKota || sale.pelanggan_kota || "Bekasi",
        items,
        total,
        bayar,
        sisa,
        shop,
      });
    } catch (e) {
      console.error("reprintFaktur error:", e);
      alert("Gagal menyiapkan faktur untuk dicetak.");
    } finally {
      setPrintingId(null);
    }
  };

  const totalPenjualan = filteredSales.reduce(
    (sum, sale) => sum + sale.total_jumlah,
    0
  );
  const totalPiutang = filteredSales
    .filter(
      (s) =>
        s.status_pembayaran === "AKTIF" || s.status_pembayaran === "SEBAGIAN"
    )
    .reduce((sum, sale) => sum + sale.sisa_piutang, 0);

  return (
    <div className="space-y-4">
      {/* Search and Stats */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 max-w-md">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari invoice atau pelanggan..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00afef] dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
        <div className="flex items-center gap-3">
          {totalPiutang > 0 && onPayReceivable && (
            <button
              onClick={onPayReceivable}
              className="px-4 py-2 bg-gradient-to-r from-[#00afef] to-[#2266ff] text-white rounded-lg font-semibold hover:from-[#0099dd] hover:to-[#1955ee] transition-all shadow-md text-sm flex items-center gap-2"
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
                  d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
              Terima Piutang
            </button>
          )}
          <div className="text-right">
            <div className="text-xs text-gray-500 dark:text-slate-400">Total Penjualan</div>
            <div className="text-lg font-bold text-[#00afef]">
              Rp {totalPenjualan.toLocaleString("id-ID")}
            </div>
          </div>
          {totalPiutang > 0 && (
            <div className="text-right">
              <div className="text-xs text-gray-500 dark:text-slate-400">Total Piutang</div>
              <div className="text-lg font-bold text-red-600">
                Rp {totalPiutang.toLocaleString("id-ID")}
              </div>
            </div>
          )}
          <div className="text-right">
            <div className="text-xs text-gray-500 dark:text-slate-400">Transaksi</div>
            <div className="text-lg font-bold text-gray-800 dark:text-slate-100">
              {filteredSales.length}
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      {filteredSales.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-800">
          <div className="text-gray-400 mb-2">
            <svg
              className="w-16 h-16 mx-auto"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <p className="text-gray-600 dark:text-slate-300 font-semibold">Belum ada transaksi</p>
          <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">
            Transaksi akan muncul di sini
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 dark:border-slate-800 rounded-lg max-h-[700px] overflow-y-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-[#00afef] to-[#2266ff] text-white">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold">
                  Invoice
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold">
                  Pelanggan
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold">
                  Total
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold">
                  Pembayaran
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold">
                  Tanggal
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredSales.map((sale, index) => (
                <React.Fragment key={sale.id}>
                  <tr
                    onClick={() =>
                      setExpandedSale(expandedSale === sale.id ? null : sale.id)
                    }
                    className={`border-b border-gray-200 dark:border-slate-800 hover:bg-cyan-50 transition-all cursor-pointer ${
                      index % 2 === 0 ? "bg-white dark:bg-slate-900" : "bg-gray-50 dark:bg-slate-800"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-bold text-gray-800 dark:text-slate-100">
                        {sale.nomor_invoice}
                      </div>
                      {sale.status_transaksi === "VOIDED" && (
                        <span className="inline-block mt-1 px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 rounded text-xs font-semibold">
                          VOID
                        </span>
                      )}
                      {sale.kasir_nama && (
                        <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                          Kasir: {sale.kasir_nama}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-800 dark:text-slate-100">
                        {sale.pelanggan_nama || (
                          <span className="text-gray-400 italic">Walk-in</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="font-bold text-gray-800 dark:text-slate-100">
                        {formatRupiah(sale.total_jumlah)}
                      </div>
                      {sale.sisa_piutang > 0 && (
                        <div className="text-xs text-red-600 mt-1">
                          Sisa: {formatRupiah(sale.sisa_piutang)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-100 dark:bg-slate-800 rounded-lg text-xs font-semibold text-gray-700 dark:text-slate-300">
                        {getPaymentMethodIcon(sale.metode_pembayaran)}
                        {sale.metode_pembayaran}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {getStatusBadge(sale.status_pembayaran)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-700 dark:text-slate-300">
                        {formatDate(sale.dibuat_pada)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            reprintThermal(sale);
                          }}
                          disabled={printingId === sale.id}
                          className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 dark:bg-cyan-900/30 rounded-lg transition-all disabled:opacity-50"
                          title="Cetak ulang struk thermal (80mm)"
                        >
                          <svg
                            className="w-5 h-5 text-cyan-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                            />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            reprintFaktur(sale);
                          }}
                          disabled={printingId === sale.id}
                          className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 dark:bg-blue-900/30 rounded-lg transition-all disabled:opacity-50"
                          title="Cetak faktur A5"
                        >
                          <svg
                            className="w-5 h-5 text-blue-600 dark:text-blue-300"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                          </svg>
                        </button>
                        {/* Revert button logic:
                            - Only show if has_pelunasan = 1 (meaning there are payment records to revert)
                            - This means the transaction had piutang and received payment(s)
                            - Clicking revert will delete all pelunasan records and reset to original piutang
                        */}
                        {sale.status_transaksi !== "VOIDED" &&
                          sale.has_pelunasan === 1 &&
                          onRevert && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onRevert(sale);
                            }}
                            className={`p-2 rounded-lg transition-all group ${
                              sale.status_pembayaran === "LUNAS"
                                ? "hover:bg-slate-50 dark:hover:bg-white/5"
                                : "hover:bg-slate-50 dark:hover:bg-white/5"
                            }`}
                            title={
                              sale.status_pembayaran === "LUNAS"
                                ? "Kembalikan pembayaran piutang (ke status AKTIF)"
                                : "Batalkan pembayaran sebagian"
                            }
                          >
                            <svg
                              className={`w-5 h-5 ${
                                sale.status_pembayaran === "LUNAS"
                                  ? "text-blue-600 dark:text-blue-300 group-hover:text-blue-700 dark:text-blue-300"
                                  : "text-orange-600 dark:text-orange-300 group-hover:text-orange-700 dark:text-orange-300"
                              }`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                              />
                            </svg>
                          </button>
                        )}
                        {onDelete && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDialog({
                                show: true,
                                saleId: sale.id,
                                invoiceNumber: sale.nomor_invoice,
                              });
                            }}
                            disabled={
                              deletingId === sale.id ||
                              sale.status_transaksi === "VOIDED"
                            }
                            className="p-2 hover:bg-red-100 dark:bg-red-900/30 rounded-lg transition-all disabled:opacity-50"
                            title="Batalkan Transaksi"
                          >
                            {deletingId === sale.id ? (
                              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-red-500"></div>
                            ) : (
                              <TrashIcon size={20} className="text-red-500" />
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Expanded Row - Items */}
                  {expandedSale === sale.id && sale.items && (
                    <tr className="bg-gradient-to-r from-cyan-50/50 to-blue-50/50">
                      <td colSpan={7} className="px-4 py-3">
                        <div className="text-xs">
                          <div className="font-semibold text-gray-700 dark:text-slate-300 mb-2">
                            Detail Item:
                          </div>
                          <div className="space-y-1">
                            {sale.items.map((item, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between py-1 px-2 bg-white dark:bg-slate-900/60 rounded"
                              >
                                <div className="flex-1">
                                  <span className="font-semibold text-gray-800 dark:text-slate-100">
                                    {idx + 1}. {item.barang_nama}
                                  </span>
                                  <span className="text-gray-500 dark:text-slate-400 ml-2">
                                    ({item.nama_satuan})
                                  </span>
                                </div>
                                <div className="flex items-center gap-4 text-gray-700 dark:text-slate-300">
                                  <span>
                                    Qty:{" "}
                                    <span className="font-semibold">
                                      {item.jumlah}
                                    </span>
                                  </span>
                                  <span>×</span>
                                  <span>
                                    Rp{" "}
                                    <span className="font-semibold">
                                      {(item.harga_satuan ?? 0).toLocaleString(
                                        "id-ID"
                                      )}
                                    </span>
                                  </span>
                                  <span>=</span>
                                  <span className="font-semibold text-[#00afef]">
                                    Rp{" "}
                                    {(item.subtotal ?? 0).toLocaleString(
                                      "id-ID"
                                    )}
                                  </span>
                                  {typeof item.hpp_total === "number" && (
                                    <span className="text-slate-500">
                                      HPP Rp{" "}
                                      {item.hpp_total.toLocaleString("id-ID")}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Info Text */}
      {filteredSales.length > 0 && (
        <div className="text-xs text-gray-500 dark:text-slate-400 text-center">
          Klik baris untuk melihat detail item penjualan
        </div>
      )}

      {/* Confirm Dialog */}
      {confirmDialog && (
        <ConfirmDialog
          show={confirmDialog.show}
          title="Batalkan Transaksi"
          message={`Apakah Anda yakin ingin membatalkan transaksi ${confirmDialog.invoiceNumber}?\n\nTransaksi tidak akan dihapus permanen. Stok akan dikembalikan lewat jurnal pembalik, dan data keuangan terkait ditandai VOID.`}
          onConfirm={async () => {
            setConfirmDialog(null);
            setDeletingId(confirmDialog.saleId);
            try {
              if (onDelete) {
                await onDelete(confirmDialog.saleId);
              }
            } finally {
              setDeletingId(null);
            }
          }}
          onCancel={() => setConfirmDialog(null)}
          type="danger"
        />
      )}

      {fakturPromptSale && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-gradient-to-r from-[#00afef] to-[#2266ff] px-5 py-4">
              <h3 className="text-white font-bold text-lg">
                Info untuk Faktur
              </h3>
              <p className="text-white/90 text-xs mt-0.5">
                Transaksi {fakturPromptSale.nomor_invoice} tidak menyimpan data
                pelanggan. Isi info untuk dicetak di faktur.
              </p>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-600 dark:text-slate-300 mb-1">
                  Kepada Yth.
                </label>
                <input
                  type="text"
                  value={fakturPromptInput.nama}
                  onChange={(e) =>
                    setFakturPromptInput((prev) => ({
                      ...prev,
                      nama: e.target.value,
                    }))
                  }
                  placeholder="Nama / nama perusahaan"
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 text-black border-2 border-gray-300 rounded-lg focus:outline-none focus:border-[#00afef]"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 dark:text-slate-300 mb-1">
                  Kota
                </label>
                <input
                  type="text"
                  value={fakturPromptInput.kota}
                  onChange={(e) =>
                    setFakturPromptInput((prev) => ({
                      ...prev,
                      kota: e.target.value,
                    }))
                  }
                  placeholder="Bekasi"
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 text-black border-2 border-gray-300 rounded-lg focus:outline-none focus:border-[#00afef]"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setFakturPromptSale(null)}
                  className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 font-semibold hover:bg-gray-200"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const sale = fakturPromptSale;
                    const nama = fakturPromptInput.nama.trim();
                    const kota = fakturPromptInput.kota.trim() || "Bekasi";
                    setFakturPromptSale(null);
                    if (sale && nama) {
                      reprintFaktur(sale, nama, kota);
                    }
                  }}
                  disabled={!fakturPromptInput.nama.trim()}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#00afef] to-[#2266ff] text-white font-bold hover:from-[#0099dd] hover:to-[#1955ee] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cetak Faktur
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
