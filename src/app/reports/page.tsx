"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import NotificationToast, {
  NotificationToastProps,
} from "@/components/NotificationToast";
import { ChartIcon } from "@/components/icons/PageIcons";
import {
  CoinIcon,
  BoxIcon,
  ShoppingCartIcon,
  ClipboardIcon,
} from "@/components/icons/ContentIcons";
import { getArchivedPeriodsAction } from "./actions";

interface User {
  id: string;
  username: string;
  email: string;
  full_name?: string;
  role: string;
  is_active: number;
}

interface Archive {
  archived_label: string;
  count: number;
  start_date: string;
  end_date: string;
  archived_at: string;
}

type ReportType = "financial" | "inventory" | "pos" | "receivables";

export default function ReportsPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<NotificationToastProps | null>(null);
  const [selectedReportType, setSelectedReportType] =
    useState<ReportType>("financial");
  const [archives, setArchives] = useState<Archive[]>([]);
  const [selectedArchive, setSelectedArchive] = useState<Archive | null>(null);
  const [loadingArchives, setLoadingArchives] = useState(false);
  const [generatingPDF, setGeneratingPDF] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = () => {
    const userSession = localStorage.getItem("user");
    if (!userSession) {
      router.push("/auth/login");
      return;
    }

    const user = JSON.parse(userSession);
    setCurrentUser(user);

    // Check if user has permission (Admin atau Manager)
    if (user.role !== "admin" && user.role !== "manager") {
      router.push("/dashboard");
      return;
    }

    setLoading(false);
    loadArchives();
  };

  const showMsg = (type: "success" | "error", message: string) => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 3000);
  };

  const loadArchives = async () => {
    setLoadingArchives(true);
    try {
      const data = await getArchivedPeriodsAction();
      setArchives(data || []);
    } catch (err: any) {
      showMsg("error", err.message || "Terjadi kesalahan");
    } finally {
      setLoadingArchives(false);
    }
  };

  const handleGenerateFinancialReport = async () => {
    if (!selectedArchive) {
      showMsg("error", "Pilih arsip terlebih dahulu");
      return;
    }

    setGeneratingPDF(true);
    try {
      // Buka print-friendly page dengan archived label & timestamp
      const printUrl = `/reports/financial/print?label=${encodeURIComponent(
        selectedArchive.archived_label
      )}&at=${encodeURIComponent(selectedArchive.archived_at)}`;

      const printWindow = window.open(
        printUrl,
        "_blank",
        "width=1024,height=768"
      );

      if (!printWindow) {
        throw new Error(
          "Popup blocked! Mohon izinkan popup untuk browser ini."
        );
      }

      showMsg(
        "success",
        "Print window dibuka! Anda bisa print atau save as PDF dari browser."
      );
    } catch (err: any) {
      console.error("Error opening print window:", err);
      showMsg("error", err.message || "Gagal membuka print window");
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

  const reportTypes = [
    {
      id: "financial" as ReportType,
      icon: <CoinIcon size={32} />,
      title: "Laporan Keuangan",
      description: "Ringkasan transaksi dari arsip tutup buku",
      available: true,
    },
    {
      id: "inventory" as ReportType,
      icon: <BoxIcon size={32} />,
      title: "Laporan Inventori",
      description: "Stok barang dan pergerakan inventori",
      available: false,
    },
    {
      id: "pos" as ReportType,
      icon: <ShoppingCartIcon size={32} />,
      title: "Laporan POS",
      description: "Transaksi penjualan dari sistem kasir",
      available: false,
    },
    {
      id: "receivables" as ReportType,
      icon: <ClipboardIcon size={32} />,
      title: "Laporan Hutang & Piutang",
      description: "Daftar hutang supplier dan piutang customer",
      available: false,
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
        <h3 className="text-lg font-bold text-gray-800 mb-4">
          Pilih Jenis Laporan
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {reportTypes.map((type) => (
            <button
              key={type.id}
              onClick={() => type.available && setSelectedReportType(type.id)}
              disabled={!type.available}
              className={`
                relative p-5 rounded-xl border-2 text-left transition-all duration-200
                ${
                  selectedReportType === type.id && type.available
                    ? "border-purple-500 bg-purple-50 shadow-lg transform scale-105"
                    : type.available
                    ? "border-gray-200 bg-white hover:border-purple-300 hover:shadow-md"
                    : "border-gray-200 bg-gray-50 cursor-not-allowed opacity-60"
                }
              `}
            >
              {!type.available && (
                <span className="absolute top-2 right-2 bg-yellow-100 text-yellow-800 text-xs font-bold px-2 py-1 rounded-full">
                  Soon
                </span>
              )}
              <div className="mb-2 text-purple-600">{type.icon}</div>
              <h4 className="font-bold text-gray-800 mb-1">{type.title}</h4>
              <p className="text-xs text-gray-600">{type.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Financial Report Section */}
      {selectedReportType === "financial" && (
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <CoinIcon size={24} className="text-purple-600" />
            Laporan Keuangan
          </h3>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Archive Selection */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                Pilih Periode / Arsip
              </label>

              {loadingArchives ? (
                <div className="text-center py-10">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-purple-500 border-t-transparent"></div>
                  <p className="mt-2 text-sm text-gray-600">Memuat arsip...</p>
                </div>
              ) : archives.length === 0 ? (
                <div className="text-center py-10 bg-gray-50 rounded-xl">
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
                  <p className="text-gray-600 font-medium">
                    Belum ada arsip tutup buku
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    Buat arsip dari halaman Buku Keuangan
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {archives.map((archive, index) => (
                    <button
                      key={index}
                      onClick={() => setSelectedArchive(archive)}
                      className={`
                        w-full text-left p-4 rounded-xl border-2 transition-all
                        ${
                          selectedArchive?.archived_label ===
                            archive.archived_label &&
                          selectedArchive?.archived_at === archive.archived_at
                            ? "border-purple-500 bg-purple-50 shadow-md"
                            : "border-gray-200 hover:border-purple-300 bg-white"
                        }
                      `}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-bold text-gray-800">
                            {archive.archived_label}
                          </h4>
                          <p className="text-sm text-gray-600 mt-1">
                            {formatDate(archive.start_date)} -{" "}
                            {formatDate(archive.end_date)}
                          </p>
                          <p className="text-xs text-gray-500 mt-2">
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

            {/* Preview & Action */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                Preview & Generate
              </label>

              {selectedArchive ? (
                <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-6 border-2 border-purple-200">
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
                    <h4 className="text-xl font-bold text-gray-800 mb-2">
                      {selectedArchive.archived_label}
                    </h4>
                    <p className="text-sm text-gray-600">
                      Periode: {formatDate(selectedArchive.start_date)} s/d{" "}
                      {formatDate(selectedArchive.end_date)}
                    </p>
                    <p className="text-xs text-gray-500 mt-2">
                      Total: {selectedArchive.count} transaksi
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="bg-white rounded-lg p-4 border border-purple-200">
                      <h5 className="font-semibold text-gray-700 mb-2 text-sm flex items-center gap-2">
                        <ClipboardIcon size={16} className="text-purple-600" />
                        Isi Laporan
                      </h5>
                      <ul className="text-xs text-gray-600 space-y-1">
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
                          <span>Opening Print Window...</span>
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
                          <span>Print / Save PDF</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 rounded-xl p-8 border-2 border-dashed border-gray-300 text-center">
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
                  <p className="text-gray-600 font-medium">
                    Pilih arsip terlebih dahulu
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    untuk generate laporan PDF
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Coming Soon Sections */}
      {selectedReportType !== "financial" && (
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="text-6xl mb-4">🚧</div>
          <h3 className="text-xl font-bold text-gray-800 mb-2">Coming Soon</h3>
          <p className="text-gray-600">
            Fitur laporan ini sedang dalam pengembangan
          </p>
        </div>
      )}

      {/* Notification Toast */}
      {notice && (
        <NotificationToast type={notice.type} message={notice.message} />
      )}
    </>
  );
}
