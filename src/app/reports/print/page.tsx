"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";

interface Summary {
  saldoAkhir: number;
  totalOmzet: number;
  totalBiayaOperasional: number;
  totalBiayaBahan: number;
  labaBersih: number;
  kasbonAnwar: number;
  kasbonSuri: number;
  kasbonCahaya: number;
  kasbonDinil: number;
  bagiHasilAnwar: number;
  bagiHasilSuri: number;
  bagiHasilGemi: number;
  startDate: string;
  endDate: string;
  totalTransaksi: number;
}

interface Transaction {
  id: string;
  tanggal: string;
  kategori_transaksi: string;
  debit: number;
  kredit: number;
  keperluan: string;
  saldo: number;
}

interface ReportData {
  label: string;
  archivedAt: string;
  summary: Summary;
  transactions: Transaction[];
}

const CATEGORY_COLORS: Record<string, string> = {
  KAS: "bg-blue-100 text-blue-800",
  BIAYA: "bg-red-100 text-red-800",
  OMZET: "bg-green-100 text-green-800",
  INVESTOR: "bg-purple-100 text-purple-800",
  SUBSIDI: "bg-yellow-100 text-yellow-800",
  LUNAS: "bg-teal-100 text-teal-800",
  SUPPLY: "bg-orange-100 text-orange-800",
  LABA: "bg-emerald-100 text-emerald-800",
  KOMISI: "bg-cyan-100 text-cyan-800",
  TABUNGAN: "bg-indigo-100 text-indigo-800",
  HUTANG: "bg-rose-100 text-rose-800",
  PIUTANG: "bg-lime-100 text-lime-800",
  "PRIBADI-A": "bg-sky-100 text-sky-800",
  "PRIBADI-S": "bg-pink-100 text-pink-800",
  "PRIBADI-G": "bg-violet-100 text-violet-800",
};

export default function FinancialReportPrint() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const label = searchParams.get("label");
    const at = searchParams.get("at");

    if (!label || !at) {
      setError("Missing parameters");
      setLoading(false);
      return;
    }

    fetch(
      `/api/reports/financial?label=${encodeURIComponent(
        label
      )}&at=${encodeURIComponent(at)}`
    )
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setData(json.data);
          // Auto print after data loaded
          setTimeout(() => {
            window.print();
          }, 500);
        } else {
          setError(json.error || "Failed to load data");
        }
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [searchParams]);

  const formatRupiah = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#00afef] border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-600">Memuat laporan...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-600 font-semibold">
            Error: {error || "No data"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Print Styles */}
      <style jsx global>{`
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
          }

          table {
            page-break-inside: avoid;
          }

          tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
        }

        @page {
          size: A4;
          margin: 15mm;
        }
      `}</style>

      {/* Screen Only: Print Button */}
      <div className="no-print fixed top-4 right-4 z-50">
        <button
          onClick={() => window.print()}
          className="px-6 py-3 bg-gradient-to-r from-[#0a1b3d] to-[#00afef] text-white rounded-xl font-semibold hover:shadow-xl transition-all flex items-center gap-2"
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
              d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
            />
          </svg>
          Print / Save PDF
        </button>
      </div>

      {/* Report Content */}
      <div className="max-w-[210mm] mx-auto bg-white p-8">
        {/* Header with Gradient */}
        <div className="relative mb-8 rounded-xl overflow-hidden">
          <div className="bg-gradient-to-r from-[#0a1b3d] via-[#1a3d6f] to-[#00afef] p-8 text-white">
            <div className="flex items-center gap-4 mb-4">
              <Image
                src="/assets/images/logo-gemiprint-default.svg"
                alt="gemiprint"
                width={60}
                height={60}
                className="bg-white rounded-full p-2"
              />
              <div>
                <h1 className="font-bauhaus text-4xl tracking-wide">
                  gemiprint
                </h1>
                <p className="text-white/80 text-sm">
                  All-in-One Business System
                </p>
              </div>
            </div>
            <div className="border-t border-white/20 pt-4 mt-4">
              <h2 className="font-twcenmt font-bold text-2xl mb-1">
                LAPORAN KEUANGAN
              </h2>
              <p className="text-white/90">{data.label}</p>
            </div>
          </div>
        </div>

        {/* Info Section */}
        <div className="grid grid-cols-3 gap-4 mb-8 text-sm">
          <div>
            <span className="text-gray-500">Periode:</span>
            <p className="font-semibold text-[#0a1b3d]">
              {formatDate(data.summary.startDate)} -{" "}
              {formatDate(data.summary.endDate)}
            </p>
          </div>
          <div>
            <span className="text-gray-500">Total Transaksi:</span>
            <p className="font-semibold text-[#0a1b3d]">
              {data.summary.totalTransaksi}
            </p>
          </div>
          <div>
            <span className="text-gray-500">Dicetak:</span>
            <p className="font-semibold text-[#0a1b3d]">
              {new Date().toLocaleDateString("id-ID", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </p>
          </div>
        </div>

        {/* Summary Section */}
        <div className="mb-8">
          <h3 className="font-twcenmt font-bold text-lg mb-4 text-[#0a1b3d] border-l-4 border-[#0a1b3d] pl-3">
            RINGKASAN KEUANGAN
          </h3>
          <div className="grid grid-cols-2 gap-4">
            {[
              {
                label: "Saldo Akhir",
                value: data.summary.saldoAkhir,
                color: "border-blue-500",
              },
              {
                label: "Total Omzet",
                value: data.summary.totalOmzet,
                color: "border-green-500",
              },
              {
                label: "Biaya Operasional",
                value: data.summary.totalBiayaOperasional,
                color: "border-orange-500",
              },
              {
                label: "Biaya Bahan",
                value: data.summary.totalBiayaBahan,
                color: "border-red-500",
              },
              {
                label: "Laba Bersih",
                value: data.summary.labaBersih,
                color: "border-cyan-500",
              },
            ].map((item, i) => (
              <div
                key={i}
                className={`border-l-4 ${item.color} bg-gray-50 p-4 rounded-r-lg`}
              >
                <p className="text-sm text-gray-600 mb-1">{item.label}</p>
                <p className="font-twcenmt font-bold text-xl text-[#0a1b3d]">
                  {formatRupiah(item.value)}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Kasbon Section */}
        <div className="mb-8">
          <h3 className="font-twcenmt font-bold text-lg mb-4 text-[#0a1b3d] border-l-4 border-[#0a1b3d] pl-3">
            KASBON KARYAWAN
          </h3>
          <table className="w-full text-sm border border-gray-200">
            <thead className="bg-[#0a1b3d] text-white">
              <tr>
                <th className="px-4 py-3 text-left font-twcenmt">Nama</th>
                <th className="px-4 py-3 text-right font-twcenmt">Jumlah</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {[
                ["Kasbon Anwar", data.summary.kasbonAnwar],
                ["Kasbon Suri", data.summary.kasbonSuri],
                ["Kasbon Cahaya", data.summary.kasbonCahaya],
                ["Kasbon Dinil", data.summary.kasbonDinil],
              ].map(([name, value], i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3">{name}</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {formatRupiah(value as number)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Bagi Hasil Section */}
        <div className="mb-8">
          <h3 className="font-twcenmt font-bold text-lg mb-4 text-[#0a1b3d] border-l-4 border-[#00afef] pl-3">
            BAGI HASIL PARTNER
          </h3>
          <table className="w-full text-sm border border-gray-200">
            <thead className="bg-[#00afef] text-white">
              <tr>
                <th className="px-4 py-3 text-left font-twcenmt">Partner</th>
                <th className="px-4 py-3 text-right font-twcenmt">Jumlah</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {[
                ["Anwar", data.summary.bagiHasilAnwar],
                ["Suri", data.summary.bagiHasilSuri],
                ["Gemi", data.summary.bagiHasilGemi],
              ].map(([name, value], i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3">{name}</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {formatRupiah(value as number)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Transactions Section */}
        <div className="page-break mb-8">
          <h3 className="font-twcenmt font-bold text-lg mb-4 text-[#0a1b3d] border-l-4 border-[#2266ff] pl-3">
            DETAIL TRANSAKSI
          </h3>
          <table className="w-full text-xs border border-gray-200">
            <thead className="bg-[#2266ff] text-white">
              <tr>
                <th className="px-2 py-2 text-left font-twcenmt">Tanggal</th>
                <th className="px-2 py-2 text-left font-twcenmt">Kategori</th>
                <th className="px-2 py-2 text-right font-twcenmt">Debit</th>
                <th className="px-2 py-2 text-right font-twcenmt">Kredit</th>
                <th className="px-2 py-2 text-left font-twcenmt">Keperluan</th>
                <th className="px-2 py-2 text-right font-twcenmt">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-gray-50">
                  <td className="px-2 py-2 whitespace-nowrap">
                    {formatDate(tx.tanggal)}
                  </td>
                  <td className="px-2 py-2">
                    <span
                      className={`px-2 py-1 rounded text-xs font-semibold ${
                        CATEGORY_COLORS[tx.kategori_transaksi] ||
                        "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {tx.kategori_transaksi}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right">
                    {tx.debit > 0 ? formatRupiah(tx.debit) : "-"}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {tx.kredit > 0 ? formatRupiah(tx.kredit) : "-"}
                  </td>
                  <td className="px-2 py-2">{tx.keperluan || "-"}</td>
                  <td className="px-2 py-2 text-right font-semibold">
                    {formatRupiah(tx.saldo)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-gray-200 text-center text-sm text-gray-500">
          <p>
            Dibuat dengan{" "}
            <span className="font-bauhaus text-[#00afef] font-bold">
              gemiprint
            </span>{" "}
            • {new Date().toLocaleDateString("id-ID")}
          </p>
        </div>
      </div>
    </>
  );
}
