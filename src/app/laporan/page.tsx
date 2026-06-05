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
import {
  getArchivedPeriodsAction,
  getFormalAccountingReportAction,
} from "./actions";
import { fetchSessionUser, getCachedSessionUser } from "@/lib/client-session";
import { useCachedData } from "@/lib/use-cached-data";

interface User {
  id: string;
  role: string;
  aktif_status: number;
}

interface Archive {
  archived_label: string;
  count: number;
  start_date: string;
  end_date: string;
  archived_at: string;
}

type ReportType =
  | "cash"
  | "financial"
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
  const isPrivileged =
    initialUser?.role === "admin" || initialUser?.role === "manager";
  const [currentUser, setCurrentUser] = useState<User | null>(initialUser);
  const [notice, setNotice] = useState<NotificationToastProps | null>(null);
  const [selectedReportType, setSelectedReportType] =
    useState<ReportType>("cash");
  const {
    data: archivesData,
    isLoading: loadingArchives,
    mutate: mutateArchives,
  } = useCachedData<Archive[]>(
    isPrivileged ? "archived-periods" : null,
    async () => {
      const list = await getArchivedPeriodsAction();
      return (list as Archive[]) || [];
    },
  );
  const archives = archivesData ?? [];
  const [selectedArchive, setSelectedArchive] = useState<Archive | null>(null);
  const [generatingPDF, setGeneratingPDF] = useState(false);
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

  const loadArchives = async () => {
    try {
      await mutateArchives();
    } catch (err: any) {
      showMsg("error", err.message || "Terjadi kesalahan");
    }
  };

  const handleGenerateFinancialReport = async () => {
    if (!selectedArchive) {
      showMsg("error", "Pilih arsip terlebih dahulu");
      return;
    }

    setGeneratingPDF(true);
    try {
      // Buka halaman cetak dengan label arsip dan timestamp.
      const printUrl = `/laporan/financial/print?label=${encodeURIComponent(
        selectedArchive.archived_label,
      )}&at=${encodeURIComponent(selectedArchive.archived_at)}`;

      const printWindow = window.open(
        printUrl,
        "_blank",
        "width=1024,height=768",
      );

      if (!printWindow) {
        throw new Error(
          "Popup diblokir! Mohon izinkan popup untuk browser ini.",
        );
      }

      showMsg(
        "success",
        "Jendela cetak dibuka! Anda bisa mencetak atau menyimpan PDF dari browser.",
      );
    } catch (err: any) {
      console.error("Gagal membuka jendela cetak:", err);
      showMsg("error", err.message || "Gagal membuka jendela cetak");
    } finally {
      setGeneratingPDF(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
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
      id: "financial" as ReportType,
      icon: <CoinIcon size={32} />,
      title: "Arsip Kas",
      description: "Ringkasan transaksi dari arsip tutup buku",
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
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

      {/* Financial Report Section */}
      {selectedReportType === "financial" && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg p-6">
          <h3 className="text-lg font-bold text-gray-800 dark:text-slate-100 mb-4 flex items-center gap-2">
            <CoinIcon size={24} className="text-purple-600 dark:text-purple-300" />
            Laporan Keuangan
          </h3>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Archive Selection */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-3">
                Pilih Periode / Arsip
              </label>

              {loadingArchives ? (
                <div className="text-center py-10">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-purple-500 border-t-transparent"></div>
                  <p className="mt-2 text-sm text-gray-600 dark:text-slate-300">Memuat arsip...</p>
                </div>
              ) : archives.length === 0 ? (
                <div className="text-center py-10 bg-gray-50 dark:bg-slate-800 rounded-xl">
                  <svg
                    className="w-20 h-20 mx-auto text-gray-300 mb-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                    />
                  </svg>
                  <p className="text-gray-600 dark:text-slate-300 font-medium">
                    Belum ada arsip tutup buku
                  </p>
                  <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                    Buat arsip dari halaman Buku Keuangan
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {archives.map((archive) => (
                    <button
                      key={archive.archived_at}
                      onClick={() => setSelectedArchive(archive)}
                      className={`
                        w-full text-left p-4 rounded-xl border-2 transition-all
                        ${
                          selectedArchive?.archived_label ===
                            archive.archived_label &&
                          selectedArchive?.archived_at === archive.archived_at
                            ? "border-purple-500 bg-purple-50 dark:bg-slate-800 shadow-md"
                            : "border-gray-200 dark:border-slate-800 hover:border-purple-300 bg-white dark:bg-slate-900"
                        }
                      `}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-bold text-gray-800 dark:text-slate-100">
                            {archive.archived_label}
                          </h4>
                          <p className="text-sm text-gray-600 dark:text-slate-300 mt-1">
                            {formatDate(archive.start_date)} -{" "}
                            {formatDate(archive.end_date)}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">
                            {archive.count} transaksi
                          </p>
                        </div>
                        {selectedArchive?.archived_label ===
                          archive.archived_label &&
                          selectedArchive?.archived_at ===
                            archive.archived_at && (
                            <div className="text-purple-500">
                              <svg
                                className="w-6 h-6"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            </div>
                          )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Pratinjau dan aksi */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-3">
                Pratinjau dan Cetak
              </label>

              {selectedArchive ? (
                <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-slate-800 dark:to-slate-900 rounded-xl p-6 border-2 border-purple-200 dark:border-purple-800/50">
                  <div className="text-center mb-6">
                    <svg
                      className="w-16 h-16 mx-auto text-purple-500 mb-3"
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
                    <h4 className="text-xl font-bold text-gray-800 dark:text-slate-100 mb-2">
                      {selectedArchive.archived_label}
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-slate-300">
                      Periode: {formatDate(selectedArchive.start_date)} s/d{" "}
                      {formatDate(selectedArchive.end_date)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">
                      Total: {selectedArchive.count} transaksi
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="bg-white dark:bg-slate-900 rounded-lg p-4 border border-purple-200 dark:border-purple-800/50">
                      <h5 className="font-semibold text-gray-700 dark:text-slate-300 mb-2 text-sm flex items-center gap-2">
                        <ClipboardIcon size={16} className="text-purple-600 dark:text-purple-300" />
                        Isi Laporan
                      </h5>
                      <ul className="text-xs text-gray-600 dark:text-slate-300 space-y-1">
                        <li>• Ringkasan Saldo & Omzet</li>
                        <li>• Biaya Operasional & Bahan</li>
                        <li>• Laba Bersih Periode</li>
                        <li>• Kasbon Karyawan</li>
                        <li>• Bagi Hasil Partner</li>
                        <li>• Detail Transaksi Lengkap</li>
                      </ul>
                    </div>

                    <button
                      onClick={handleGenerateFinancialReport}
                      disabled={generatingPDF}
                      className="w-full py-4 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 text-white rounded-xl font-bold hover:shadow-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {generatingPDF ? (
                        <>
                          <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                          <span>Membuka Jendela Cetak...</span>
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
                              d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                            />
                          </svg>
                          <span>Cetak / Simpan PDF</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-8 border-2 border-dashed border-gray-300 text-center">
                  <svg
                    className="w-20 h-20 mx-auto text-gray-300 mb-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M7 11l5-5m0 0l5 5m-5-5v12"
                    />
                  </svg>
                  <p className="text-gray-600 dark:text-slate-300 font-medium">
                    Pilih arsip terlebih dahulu
                  </p>
                  <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                    untuk membuat laporan PDF
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Accounting Reports */}
      {selectedReportType !== "financial" && (
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
      )}

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
  selectedReportType: Exclude<ReportType, "financial">;
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
