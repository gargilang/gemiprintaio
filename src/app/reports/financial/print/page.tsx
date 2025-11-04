"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";

interface Transaction {
  date: string;
  description: string;
  category: string;
  amount: number;
  type: "income" | "expense";
}

interface ReportData {
  dateRange: {
    startDate: string;
    endDate: string;
  };
  summary: {
    totalIncome: number;
    totalExpenses: number;
    netProfit: number;
    profitMargin: number;
  };
  categoryBreakdown: Array<{
    category: string;
    amount: number;
    percentage: number;
  }>;
  transactions: Transaction[];
  generatedAt: string;
}

export default function PrintFinancialReport() {
  const searchParams = useSearchParams();
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchReportData = async () => {
      try {
        const label = searchParams.get("label");
        const at = searchParams.get("at");

        if (!label || !at) {
          throw new Error("Parameter tidak lengkap: label dan at diperlukan");
        }

        const response = await fetch(
          `/api/reports/financial?label=${encodeURIComponent(
            label
          )}&at=${encodeURIComponent(at)}`
        );

        if (!response.ok) {
          throw new Error("Gagal mengambil data laporan");
        }

        const data = await response.json();
        setReportData(data);
        setLoading(false);

        // REMOVED: Auto-trigger print dialog - biarkan user yang memilih
      } catch (err) {
        setError(err instanceof Error ? err.message : "Terjadi kesalahan");
        setLoading(false);
      }
    };

    fetchReportData();
  }, [searchParams]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#00afef] mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Memuat data laporan...</p>
        </div>
      </div>
    );
  }

  if (error || !reportData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-600 mb-4 font-medium">
            {error || "Data tidak tersedia"}
          </p>
          <button
            onClick={() => window.close()}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 font-medium"
          >
            Tutup Window
          </button>
        </div>
      </div>
    );
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const getCategoryColor = (category: string) => {
    // Match colors dari BUKU KEUANGAN page
    const colors: { [key: string]: string } = {
      KAS: "#3b82f6", // blue-500
      BIAYA: "#ef4444", // red-500
      OMZET: "#22c55e", // green-500
      INVESTOR: "#a855f7", // purple-500
      SUBSIDI: "#eab308", // yellow-500
      LUNAS: "#14b8a6", // teal-500
      SUPPLY: "#f97316", // orange-500
      LABA: "#10b981", // emerald-500
      KOMISI: "#06b6d4", // cyan-500
      TABUNGAN: "#6366f1", // indigo-500
      HUTANG: "#f43f5e", // rose-500
      PIUTANG: "#84cc16", // lime-500
      "PRIBADI-A": "#0ea5e9", // sky-500
      "PRIBADI-S": "#ec4899", // pink-500
    };
    return colors[category] || "#6b7280"; // gray-500 as default
  };

  return (
    <>
      <style jsx global>{`
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          font-family: "TwCenMT", -apple-system, BlinkMacSystemFont, "Segoe UI",
            sans-serif;
          background: white;
          color: #1a1a1a;
        }

        @media print {
          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }

          .no-print {
            display: none !important;
          }

          .page-break {
            page-break-before: always;
            break-before: page;
          }

          @page {
            margin: 0.5in;
            size: A4;
          }
        }

        @media screen {
          .print-container {
            max-width: 8.27in;
            margin: 2rem auto;
            padding: 1rem;
            background: white;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
          }
        }
      `}</style>

      {/* Print/Close Buttons - hanya muncul di screen */}
      <div className="no-print fixed top-4 right-4 flex gap-2 z-50">
        <button
          onClick={() => window.print()}
          className="px-6 py-3 bg-[#00afef] text-white rounded-lg hover:bg-[#0099d6] shadow-lg font-semibold transition-colors"
        >
          <svg
            className="w-5 h-5 inline-block mr-2"
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
          Print / Save PDF
        </button>
        <button
          onClick={() => window.close()}
          className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 shadow-lg font-semibold transition-colors"
        >
          ✕ Tutup
        </button>
      </div>

      <div className="print-container">
        {/* Header dengan Gradient */}
        <div className="bg-gradient-to-r from-[#0a1b3d] to-[#00afef] text-white p-8 rounded-t-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Logo SVG */}
              <div className="w-16 h-16 flex items-center justify-center">
                <Image
                  src="/assets/images/logo-gemiprint-default.svg"
                  alt="gemiprint logo"
                  width={64}
                  height={64}
                  className="w-full h-full"
                />
              </div>
              <div>
                <h1 className="font-bauhaus text-3xl tracking-wide italic mb-1">
                  <span className="text-[#00afef]">gemi</span>
                  <span className="text-white">print</span>
                </h1>
                <p className="text-blue-200 text-sm font-semibold italic">
                  Professional Printing Services
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-blue-200 mb-1 font-semibold">
                Laporan Keuangan
              </p>
              <p className="text-xs text-blue-300">
                Dibuat: {formatDate(reportData.generatedAt)}
              </p>
            </div>
          </div>
        </div>

        {/* Period Info */}
        <div className="bg-gray-50 p-4 border-l-4 border-[#00afef]">
          <p className="text-sm text-gray-600 mb-1 font-medium">
            Periode Laporan
          </p>
          <p className="text-lg font-bold text-gray-800">
            {formatDate(reportData.dateRange.startDate)} -{" "}
            {formatDate(reportData.dateRange.endDate)}
          </p>
        </div>

        {/* Summary Section */}
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-6 bg-[#00afef] rounded-full"></div>
            <h2 className="text-xl font-bold text-gray-800">
              Ringkasan Keuangan
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="border-2 border-green-500 rounded-lg p-4 bg-green-50">
              <p className="text-sm text-gray-600 mb-1 font-medium">
                Total Pemasukan
              </p>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(reportData.summary.totalIncome)}
              </p>
            </div>
            <div className="border-2 border-red-500 rounded-lg p-4 bg-red-50">
              <p className="text-sm text-gray-600 mb-1 font-medium">
                Total Pengeluaran
              </p>
              <p className="text-2xl font-bold text-red-600">
                {formatCurrency(reportData.summary.totalExpenses)}
              </p>
            </div>
            <div className="border-2 border-[#00afef] rounded-lg p-4 bg-blue-50">
              <p className="text-sm text-gray-600 mb-1 font-medium">
                Laba Bersih
              </p>
              <p
                className={`text-2xl font-bold ${
                  reportData.summary.netProfit >= 0
                    ? "text-[#00afef]"
                    : "text-red-600"
                }`}
              >
                {formatCurrency(reportData.summary.netProfit)}
              </p>
            </div>
            <div className="border-2 border-purple-500 rounded-lg p-4 bg-purple-50">
              <p className="text-sm text-gray-600 mb-1 font-medium">
                Margin Laba
              </p>
              <p
                className={`text-2xl font-bold ${
                  reportData.summary.profitMargin >= 0
                    ? "text-purple-600"
                    : "text-red-600"
                }`}
              >
                {reportData.summary.profitMargin.toFixed(2)}%
              </p>
            </div>
          </div>
        </div>

        {/* Category Breakdown */}
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-6 bg-[#00afef] rounded-full"></div>
            <h2 className="text-xl font-bold text-gray-800">
              Rincian per Kategori
            </h2>
          </div>

          <div className="space-y-3 mb-6">
            {reportData.categoryBreakdown.map((cat, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-semibold text-gray-700">
                      {cat.category}
                    </span>
                    <span className="text-sm font-bold text-gray-800">
                      {formatCurrency(cat.amount)}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="h-2 rounded-full"
                      style={{
                        width: `${cat.percentage}%`,
                        backgroundColor: getCategoryColor(cat.category),
                      }}
                    ></div>
                  </div>
                </div>
                <span className="text-xs font-bold text-gray-500 w-12 text-right">
                  {cat.percentage.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Transactions Table */}
        <div className="mt-6 page-break">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-6 bg-[#00afef] rounded-full"></div>
            <h2 className="text-xl font-bold text-gray-800">
              Detail Transaksi
            </h2>
          </div>

          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#0a1b3d] text-white">
                <th className="border border-gray-300 px-3 py-2 text-left text-sm font-bold">
                  Tanggal
                </th>
                <th className="border border-gray-300 px-3 py-2 text-left text-sm font-bold">
                  Keterangan
                </th>
                <th className="border border-gray-300 px-3 py-2 text-left text-sm font-bold">
                  Kategori
                </th>
                <th className="border border-gray-300 px-3 py-2 text-right text-sm font-bold">
                  Jumlah
                </th>
              </tr>
            </thead>
            <tbody>
              {reportData.transactions.map((txn, idx) => (
                <tr
                  key={idx}
                  className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}
                >
                  <td className="border border-gray-300 px-3 py-2 text-sm text-gray-700">
                    {formatDate(txn.date)}
                  </td>
                  <td className="border border-gray-300 px-3 py-2 text-sm text-gray-700">
                    {txn.description}
                  </td>
                  <td className="border border-gray-300 px-3 py-2 text-sm">
                    <span
                      className="inline-block px-2 py-1 rounded text-xs font-bold text-white"
                      style={{
                        backgroundColor: getCategoryColor(txn.category),
                      }}
                    >
                      {txn.category}
                    </span>
                  </td>
                  <td
                    className={`border border-gray-300 px-3 py-2 text-sm text-right font-bold ${
                      txn.type === "income" ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {txn.type === "income" ? "+" : "-"}{" "}
                    {formatCurrency(Math.abs(txn.amount))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-4 border-t-2 border-[#00afef]">
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-1">
              Laporan ini dibuat oleh sistem{" "}
              <span className="font-bauhaus font-bold text-[#00afef] italic">
                gemiprint
              </span>{" "}
              AIO
            </p>
            <p className="text-xs text-gray-500">
              © {new Date().getFullYear()} gemiprint. Hak cipta dilindungi.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
