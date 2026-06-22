"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import ToastNotifikasi, {
  NotificationToastProps,
} from "@/components/ToastNotifikasi";
import { ChartIcon } from "@/components/icons/PageIcons";
import {
  CoinIcon,
  BoxIcon,
  ShoppingCartIcon,
  ClipboardIcon,
} from "@/components/icons/ContentIcons";
import { getFormalAccountingReportAction } from "./actions";
import { fetchSessionUser, getCachedSessionUser } from "@/lib/client-session";

interface User {
  id: string;
  role: string;
  aktif_status: number;
}

type ReportType =
  | "cash"
  | "profit-loss"
  | "inventory"
  | "pos"
  | "receivables";

interface FormalAccountingReport {
  cashReport: {
    totalDebit: number;
    totalCredit: number;
    netCashFlow: number;
    endingBalance: number;
    omzet: number;
    operationalExpenses: number;
    cogs: number;
    netProfit: number;
    cashOnHand: number;
    rows: Array<{
      date: string;
      category: string;
      description: string;
      debit: number;
      credit: number;
      balance: number;
      omzet: number;
      operationalExpenses: number;
      cogs: number;
      netProfit: number;
    }>;
  };
  profitLoss: {
    revenue: number;
    cogs: number;
    grossProfit: number;
    grossMargin: number;
    operationalExpenses: number;
    netProfit: number;
    netMargin: number;
    salesCount: number;
  };
  inventory: {
    trackedItems: number;
    lowStockItems: number;
    inventoryValue: number;
    items: Array<{
      id: string;
      name: string;
      stock: number;
      unit: string;
      averageCost: number;
      value: number;
      lowStock: boolean;
    }>;
  };
  salesMargin: {
    invoiceCount: number;
    averageMargin: number;
    rows: Array<{
      invoice: string;
      date: string;
      customerName: string;
      revenue: number;
      cogs: number;
      grossProfit: number;
      grossMargin: number;
      itemCount: number;
    }>;
  };
  receivables: {
    count: number;
    totalOutstanding: number;
    rows: Array<{
      invoice: string;
      customerName: string;
      amount: number;
      paid: number;
      remaining: number;
      status: string;
      date: string;
    }>;
  };
  payables: {
    count: number;
    totalOutstanding: number;
    rows: Array<{
      purchaseNumber: string;
      invoiceNumber: string;
      vendorName: string;
      amount: number;
      paid: number;
      remaining: number;
      status: string;
      date: string;
    }>;
  };
}

function getMonthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function getTodayKey(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" });
}

function emptyCashReport(): FormalAccountingReport["cashReport"] {
  return {
    totalDebit: 0,
    totalCredit: 0,
    netCashFlow: 0,
    endingBalance: 0,
    omzet: 0,
    operationalExpenses: 0,
    cogs: 0,
    netProfit: 0,
    cashOnHand: 0,
    rows: [],
  };
}

export default function ReportsPage() {
  const router = useRouter();
  const initialUser =
    typeof window !== "undefined"
      ? (getCachedSessionUser() as User | null)
      : null;
  const [currentUser, setCurrentUser] = useState<User | null>(initialUser);
  const [notice, setNotice] = useState<NotificationToastProps | null>(null);
  const [selectedReportType, setSelectedReportType] =
    useState<ReportType>("cash");
  const [startDate, setStartDate] = useState(getMonthStart());
  const [endDate, setEndDate] = useState(getTodayKey());
  const [formalReport, setFormalReport] =
    useState<FormalAccountingReport | null>(null);
  const [loadingFormalReport, setLoadingFormalReport] = useState(false);
  const loading = currentUser === null;

  useEffect(() => {
    setFormalReport(null);
  }, [selectedReportType, startDate, endDate]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const user = await fetchSessionUser();
      if (cancelled) return;
      if (!user) {
        router.push("/auth/login");
        return;
      }

      if (user.role !== "admin" && user.role !== "manager") {
        router.push("/beranda");
        return;
      }

      setCurrentUser({
        id: user.id,
        role: user.role,
        aktif_status: user.aktif_status,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const showMsg = (type: "success" | "error", message: string) => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 3000);
  };

  const formatRupiah = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount || 0);
  };

  const handleLoadFormalReport = async () => {
    if (startDate > endDate) {
      showMsg(
        "error",
        "Tanggal awal tidak boleh lebih besar dari tanggal akhir",
      );
      return;
    }

    setLoadingFormalReport(true);
    try {
      const report = await getFormalAccountingReportAction({
        startDate,
        endDate,
      });
      setFormalReport(report as FormalAccountingReport);
      showMsg("success", "Laporan diperbarui");
    } catch (err: any) {
      console.error("Error loading formal report:", err);
      showMsg("error", err.message || "Gagal memuat laporan");
    } finally {
      setLoadingFormalReport(false);
    }
  };

  const reportTypes = [
    {
      id: "cash" as ReportType,
      icon: <CoinIcon size={32} />,
      title: "Laporan Kas",
      description: "Transaksi kas, saldo akhir, omzet, biaya, laba",
      available: true,
    },
    {
      id: "profit-loss" as ReportType,
      icon: <CoinIcon size={32} />,
      title: "Laba Rugi",
      description: "Omzet, HPP, laba kotor, biaya, laba bersih",
      available: true,
    },
    {
      id: "inventory" as ReportType,
      icon: <BoxIcon size={32} />,
      title: "Persediaan",
      description: "Stok, HPP rata-rata, dan nilai persediaan",
      available: true,
    },
    {
      id: "pos" as ReportType,
      icon: <ShoppingCartIcon size={32} />,
      title: "Margin Penjualan",
      description: "Faktur, HPP snapshot, laba kotor, margin",
      available: true,
    },
    {
      id: "receivables" as ReportType,
      icon: <ClipboardIcon size={32} />,
      title: "Hutang & Piutang",
      description: "Daftar hutang pemasok dan piutang pelanggan",
      available: true,
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <>
      {/* Header Section */}
      <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-lg p-6 mb-6 text-white">
        <div className="flex items-center gap-3">
          <ChartIcon size={32} className="text-white" />
          <div>
            <h2 className="text-2xl font-bold mb-1 font-twcenmt uppercase tracking-wide">
              Pusat Laporan
            </h2>
            <p className="text-white/90 text-sm">
              Generate berbagai jenis laporan untuk analisis bisnis
            </p>
          </div>
        </div>
      </div>

      {/* Report Type Selection */}
      <div className="mb-6">
        <h3 className="text-lg font-bold text-gray-800 dark:text-slate-100 mb-4">
          Pilih Jenis Laporan
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          {reportTypes.map((type) => (
            <button
              key={type.id}
              onClick={() => type.available && setSelectedReportType(type.id)}
              disabled={!type.available}
              className={`
                relative p-5 rounded-xl border-2 text-left transition-all duration-200
                ${
                  selectedReportType === type.id && type.available
                    ? "border-purple-500 bg-purple-50 dark:bg-slate-800 shadow-lg transform scale-105"
                    : type.available
                      ? "border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-purple-300 hover:shadow-md"
                      : "border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 cursor-not-allowed opacity-60"
                }
              `}
            >
              {!type.available && (
                <span className="absolute top-2 right-2 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 text-xs font-bold px-2 py-1 rounded-full">
                  Segera
                </span>
              )}
              <div className="mb-2 text-purple-600 dark:text-purple-300">{type.icon}</div>
              <h4 className="font-bold text-gray-800 dark:text-slate-100 mb-1">{type.title}</h4>
              <p className="text-xs text-gray-600 dark:text-slate-300">{type.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Accounting Reports */}
      <FormalReportPanel
          selectedReportType={selectedReportType}
          title={
            reportTypes.find((type) => type.id === selectedReportType)?.title ||
            "Laporan"
          }
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          onLoad={handleLoadFormalReport}
          loading={loadingFormalReport}
          report={formalReport}
          formatRupiah={formatRupiah}
        />
      {/* Notification Toast */}
      {notice && (
        <ToastNotifikasi type={notice.type} message={notice.message} />
      )}
    </>
  );
}

function FormalReportPanel({
  selectedReportType,
  title,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onLoad,
  loading,
  report,
  formatRupiah,
}: {
  selectedReportType: ReportType;
  title: string;
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onLoad: () => void;
  loading: boolean;
  report: FormalAccountingReport | null;
  formatRupiah: (amount: number) => string;
}) {
  const cashReport = report?.cashReport ?? emptyCashReport();

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg p-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-6">
        <div>
          <h3 className="text-lg font-bold text-gray-800 dark:text-slate-100 mb-1">{title}</h3>
          <p className="text-sm text-gray-600 dark:text-slate-300">
            Kalkulasi otomatis dari transaksi POS, HPP snapshot, persediaan,
            piutang, hutang, dan buku kas.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1">
              Dari
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1">
              Sampai
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
          <button
            onClick={onLoad}
            disabled={loading}
            className="self-end px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700 disabled:opacity-50"
          >
            {loading ? "Memuat..." : "Muat Laporan"}
          </button>
        </div>
      </div>

      {!report ? (
        <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-8 border-2 border-dashed border-gray-300 text-center">
          <ClipboardIcon size={48} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-700 dark:text-slate-300 font-semibold">
            Pilih periode lalu klik Muat Laporan
          </p>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
            Laporan dihitung langsung dari transaksi, bukan rumus bebas
            halaman Keuangan.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {selectedReportType === "cash" && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <MetricCard
                  label="Saldo Akhir"
                  value={formatRupiah(cashReport.endingBalance)}
                  color="purple"
                />
                <MetricCard
                  label="Kas Masuk"
                  value={formatRupiah(cashReport.totalDebit)}
                  color="green"
                />
                <MetricCard
                  label="Kas Keluar"
                  value={formatRupiah(cashReport.totalCredit)}
                  color="red"
                />
                <MetricCard
                  label="Omzet"
                  value={formatRupiah(cashReport.omzet)}
                  color="blue"
                />
                <MetricCard
                  label="Total Biaya"
                  value={formatRupiah(
                    cashReport.operationalExpenses + cashReport.cogs,
                  )}
                  color="slate"
                />
                <MetricCard
                  label="Laba Bersih"
                  value={formatRupiah(cashReport.netProfit)}
                  color="amber"
                />
              </div>
              <FormalTable
                columns={[
                  "Tanggal",
                  "Kategori",
                  "Keterangan",
                  "Debit",
                  "Kredit",
                  "Saldo",
                  "Omzet",
                  "Biaya Ops",
                ]}
                rows={cashReport.rows.map((row) => [
                  row.date,
                  row.category,
                  row.description,
                  formatRupiah(row.debit),
                  formatRupiah(row.credit),
                  formatRupiah(row.balance),
                  formatRupiah(row.omzet),
                  formatRupiah(row.operationalExpenses),
                ])}
              />
            </>
          )}

          {selectedReportType === "profit-loss" && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <MetricCard
                label="Omzet"
                value={formatRupiah(report.profitLoss.revenue)}
                detail={`${report.profitLoss.salesCount} faktur`}
                color="green"
              />
              <MetricCard
                label="HPP"
                value={formatRupiah(report.profitLoss.cogs)}
                color="slate"
              />
              <MetricCard
                label="Laba Kotor"
                value={formatRupiah(report.profitLoss.grossProfit)}
                detail={`Margin ${report.profitLoss.grossMargin.toFixed(2)}%`}
                color="blue"
              />
              <MetricCard
                label="Biaya Operasional"
                value={formatRupiah(report.profitLoss.operationalExpenses)}
                color="red"
              />
              <MetricCard
                label="Laba Bersih"
                value={formatRupiah(report.profitLoss.netProfit)}
                detail={`Net margin ${report.profitLoss.netMargin.toFixed(2)}%`}
                color="purple"
                wide
              />
            </div>
          )}

          {selectedReportType === "inventory" && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <MetricCard
                  label="Nilai Persediaan"
                  value={formatRupiah(report.inventory.inventoryValue)}
                  color="green"
                />
                <MetricCard
                  label="Item Dilacak"
                  value={String(report.inventory.trackedItems)}
                  color="slate"
                />
                <MetricCard
                  label="Stok Menipis"
                  value={String(report.inventory.lowStockItems)}
                  color="red"
                />
              </div>
              <FormalTable
                columns={["Barang", "Stok", "HPP Rata-rata", "Nilai"]}
                rows={report.inventory.items.map((item) => [
                  item.name,
                  `${item.stock.toLocaleString("id-ID")} ${item.unit}`,
                  formatRupiah(item.averageCost),
                  formatRupiah(item.value),
                ])}
              />
            </>
          )}

          {selectedReportType === "pos" && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <MetricCard
                  label="Faktur"
                  value={String(report.salesMargin.invoiceCount)}
                  color="blue"
                />
                <MetricCard
                  label="Rata-rata Margin"
                  value={`${report.salesMargin.averageMargin.toFixed(2)}%`}
                  color="purple"
                />
                <MetricCard
                  label="Laba Kotor"
                  value={formatRupiah(report.profitLoss.grossProfit)}
                  color="green"
                />
              </div>
              <FormalTable
                columns={[
                  "Faktur",
                  "Pelanggan",
                  "Omzet",
                  "HPP",
                  "Laba",
                  "Margin",
                ]}
                rows={report.salesMargin.rows.map((row) => [
                  row.invoice,
                  row.customerName,
                  formatRupiah(row.revenue),
                  formatRupiah(row.cogs),
                  formatRupiah(row.grossProfit),
                  `${row.grossMargin.toFixed(2)}%`,
                ])}
              />
            </>
          )}

          {selectedReportType === "receivables" && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <MetricCard
                  label="Piutang Belum Lunas"
                  value={formatRupiah(report.receivables.totalOutstanding)}
                  detail={`${report.receivables.count} faktur`}
                  color="green"
                />
                <MetricCard
                  label="Hutang Vendor"
                  value={formatRupiah(report.payables.totalOutstanding)}
                  detail={`${report.payables.count} tagihan`}
                  color="amber"
                />
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <FormalTable
                  title="Piutang"
                  columns={["Faktur", "Pelanggan", "Sisa", "Status"]}
                  rows={report.receivables.rows.map((row) => [
                    row.invoice,
                    row.customerName,
                    formatRupiah(row.remaining),
                    row.status,
                  ])}
                />
                <FormalTable
                  title="Hutang"
                  columns={["PO", "Vendor", "Sisa", "Status"]}
                  rows={report.payables.rows.map((row) => [
                    row.purchaseNumber || row.invoiceNumber,
                    row.vendorName,
                    formatRupiah(row.remaining),
                    row.status,
                  ])}
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  color,
  wide = false,
}: {
  label: string;
  value: string;
  detail?: string;
  color: "green" | "slate" | "blue" | "red" | "purple" | "amber";
  wide?: boolean;
}) {
  const classes = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:text-emerald-300",
    slate: "border-slate-200 bg-slate-50 dark:bg-slate-800 text-slate-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700 dark:text-blue-300",
    red: "border-red-200 bg-red-50 text-red-700",
    purple: "border-purple-200 bg-purple-50 text-purple-700 dark:text-purple-300",
    amber: "border-amber-200 bg-amber-50 text-amber-700 dark:text-amber-300",
  }[color];

  return (
    <div
      className={`rounded-xl border p-4 ${classes} ${
        wide ? "md:col-span-2" : ""
      }`}
    >
      <p className="text-sm text-gray-600 dark:text-slate-300 font-semibold">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {detail && <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">{detail}</p>}
    </div>
  );
}

function FormalTable({
  title,
  columns,
  rows,
}: {
  title?: string;
  columns: string[];
  rows: string[][];
}) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-slate-800 overflow-hidden">
      {title && (
        <div className="px-4 py-3 bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-800 font-bold text-gray-800 dark:text-slate-100">
          {title}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-800 text-white">
            <tr>
              {columns.map((column) => (
                <th key={column} className="px-4 py-3 text-left font-bold">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-center text-gray-500 dark:text-slate-400"
                >
                  Tidak ada data untuk periode ini.
                </td>
              </tr>
            ) : (
              rows.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className={rowIndex % 2 === 0 ? "bg-white dark:bg-slate-900" : "bg-gray-50 dark:bg-slate-800"}
                >
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="px-4 py-3 text-gray-700 dark:text-slate-300">
                      {cell || "-"}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
