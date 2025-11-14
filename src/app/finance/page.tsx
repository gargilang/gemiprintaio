"use client";

import { useEffect, useState, useRef, useMemo, useCallback, memo } from "react";
import { useRouter } from "next/navigation";
import { useClickOutside } from "@/hooks/useClickOutside";
import NotificationToast, {
  NotificationToastProps,
} from "@/components/NotificationToast";
import { CashBook, KategoriTransaksi } from "@/types/database";
import { getTodayJakarta, formatDateJakarta } from "@/lib/date-utils";
import ImportCsvModal from "@/components/ImportCsvModal";
import DeleteAllCashbookModal from "@/components/DeleteAllCashbookModal";
import EditManualModal from "@/components/EditManualModal";
import CloseBooksModal from "@/components/CloseBooksModal";
import SelectMonthModal from "@/components/SelectMonthModal";
import ConfirmDialog from "@/components/ConfirmDialog";
import { MoneyIcon } from "@/components/icons/PageIcons";
import {
  BriefcaseIcon,
  PersonIcon,
  CoinIcon,
  BoxIcon,
  CheckIcon,
} from "@/components/icons/ContentIcons";
import { getDebts } from "@/lib/services/purchases-service";
import { getReceivables } from "@/lib/services/pos-service";
import {
  deleteAllCashbook,
  deleteCashBookEntry,
} from "@/lib/services/finance-service";
import { restoreArchivedTransactions } from "@/lib/services/reports-service";

// Helper function to strip [REF:xxx] from display while keeping it in database
const stripReferenceId = (text: string | null | undefined): string => {
  if (!text) return "";
  return text.replace(/\s*\[REF:[^\]]+\]/g, "").trim();
};

// Memoized CashBook Row Component - mencegah re-render yang tidak perlu
const CashBookRow = memo(
  ({
    cashBook,
    index,
    viewingArchive,
    formatRupiah,
    formatDateJakarta,
    getKategoriColor,
    onEdit,
    onEditManual,
    onDelete,
  }: {
    cashBook: CashBook;
    index: number;
    viewingArchive: boolean;
    formatRupiah: (amount: number) => string;
    formatDateJakarta: (date: string) => string;
    getKategoriColor: (kategori: KategoriTransaksi) => {
      bg: string;
      text: string;
      border: string;
    };
    onEdit: (cb: CashBook) => void;
    onEditManual: (cb: CashBook) => void;
    onDelete: (cb: CashBook) => void;
  }) => {
    const kategoriColor = getKategoriColor(cashBook.kategori_transaksi);

    return (
      <tr
        className={`
          hover:bg-orange-50 transition-all cursor-default
          ${index % 2 === 0 ? "bg-white" : "bg-gray-50"}
        `}
      >
        <td className="px-3 py-3 text-sm text-gray-700 whitespace-nowrap">
          {formatDateJakarta(cashBook.tanggal)}
        </td>
        <td className="px-3 py-3">
          <span
            className={`inline-block px-2 py-1 text-xs font-semibold rounded-lg border ${kategoriColor.bg} ${kategoriColor.text} ${kategoriColor.border}`}
          >
            {cashBook.kategori_transaksi}
          </span>
        </td>
        <td className="px-3 py-3 text-sm text-right font-semibold">
          {cashBook.debit > 0 ? (
            <span className="text-green-600">
              +{formatRupiah(cashBook.debit)}
            </span>
          ) : cashBook.kredit > 0 ? (
            <span className="text-red-600">
              -{formatRupiah(cashBook.kredit)}
            </span>
          ) : (
            <span className="text-gray-400">-</span>
          )}
        </td>
        <td className="px-3 py-3 text-sm text-gray-700 max-w-xs truncate">
          {stripReferenceId(cashBook.keperluan) || "-"}
        </td>
        <td className="px-3 py-3 text-sm text-right font-bold text-pink-600">
          {formatRupiah(cashBook.saldo)}
        </td>
        <td className="px-3 py-3 text-center">
          <div className="flex gap-2 justify-center">
            {!viewingArchive ? (
              <>
                <button
                  onClick={() => onEdit(cashBook)}
                  className="p-2 text-pink-600 hover:bg-pink-50 rounded-lg transition-colors inline-flex items-center justify-center"
                  title="Edit Transaction"
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
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                </button>
                <button
                  onClick={() => onEditManual(cashBook)}
                  className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors inline-flex items-center justify-center"
                  title="Edit Manual (Override)"
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
                      d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                    />
                  </svg>
                </button>
                <button
                  onClick={() => onDelete(cashBook)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors inline-flex items-center justify-center"
                  title="Delete"
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
              </>
            ) : (
              <span className="text-gray-400 text-sm italic">Read-only</span>
            )}
          </div>
        </td>
      </tr>
    );
  }
);

CashBookRow.displayName = "CashBookRow";

interface User {
  id: string;
  username: string;
  email: string;
  full_name?: string;
  role: string;
  is_active: number;
}

export default function FinancePage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [cashBooks, setCashBooks] = useState<CashBook[]>([]);
  const [totalHutang, setTotalHutang] = useState(0);
  const [hutangCount, setHutangCount] = useState(0);
  const [totalPiutang, setTotalPiutang] = useState(0);
  const [piutangCount, setPiutangCount] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [editingCashBook, setEditingCashBook] = useState<CashBook | null>(null);
  const [formData, setFormData] = useState({
    tanggal: getTodayJakarta(),
    kategori_transaksi: "KAS" as KategoriTransaksi,
    debit: "",
    kredit: "",
    keperluan: "",
    catatan: "",
  });
  const [notice, setNotice] = useState<NotificationToastProps | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    show: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: "warning" | "danger" | "info" | "purchases" | "pos";
    onConfirm: () => void;
  } | null>(null);
  const [showBiayaDetail, setShowBiayaDetail] = useState(false);
  const [showBagiHasilAnwar, setShowBagiHasilAnwar] = useState(false);
  const [showBagiHasilSuri, setShowBagiHasilSuri] = useState(false);
  const [showBagiHasilGemi, setShowBagiHasilGemi] = useState(false);
  const [showKasbonKaryawan, setShowKasbonKaryawan] = useState(false);
  const [showBagiHasilSection, setShowBagiHasilSection] = useState(false);

  // New modals for cash book management
  const [showImportModal, setShowImportModal] = useState(false);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [showEditManualModal, setShowEditManualModal] = useState(false);
  const [editManualCashBook, setEditManualCashBook] = useState<CashBook | null>(
    null
  );
  const [deleting, setDeleting] = useState(false);

  // Merged state for Close Books and Select Month
  const [showCloseBooksModal, setShowCloseBooksModal] = useState(false);
  const [showSelectMonthModal, setShowSelectMonthModal] = useState(false);

  // Archive viewing state
  const [viewingArchive, setViewingArchive] = useState<string | null>(null);
  const [currentArchiveInfo, setCurrentArchiveInfo] = useState<{
    label: string;
    archived_at: string;
  } | null>(null);

  // Helper function to update a single cashbook in state without reloading
  function updateCashBookInState(updated: CashBook) {
    setCashBooks((prev) =>
      prev.map((cb) => (cb.id === updated.id ? { ...cb, ...updated } : cb))
    );
  }

  // Filter state - multi-select dengan checkbox
  const [selectedKategoriFilters, setSelectedKategoriFilters] = useState<
    Set<KategoriTransaksi>
  >(new Set());
  const [showKategoriDropdown, setShowKategoriDropdown] = useState(false);

  // Virtualization state - untuk performance dengan banyak rows
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 50 });
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const debitInputRef = useRef<HTMLInputElement>(null);
  const editFormRef = useRef<HTMLDivElement>(null);

  // Close edit form when clicking outside
  useClickOutside(
    editFormRef,
    () => {
      if (showModal) {
        setShowModal(false);
        setEditingCashBook(null);
      }
    },
    showModal
  );

  const kategoriOptions: KategoriTransaksi[] = [
    "KAS",
    "BIAYA",
    "OMZET",
    "INVESTOR",
    "SUBSIDI",
    "LUNAS",
    "SUPPLY",
    "LABA",
    "KOMISI",
    "TABUNGAN",
    "HUTANG",
    "PIUTANG",
    "PRIBADI-A",
    "PRIBADI-S",
  ];

  // Filtered cashbooks based on kategori selection
  const filteredCashBooks = useMemo(() => {
    if (selectedKategoriFilters.size === 0) return cashBooks;
    return cashBooks.filter((cb) =>
      selectedKategoriFilters.has(cb.kategori_transaksi)
    );
  }, [cashBooks, selectedKategoriFilters]);

  // Visible cashbooks - hanya render yang terlihat (virtualization)
  const visibleCashBooks = useMemo(() => {
    // Disable virtualization for lists with <= 100 items to avoid scrollbar issues
    if (filteredCashBooks.length <= 100) return filteredCashBooks;
    return filteredCashBooks.slice(visibleRange.start, visibleRange.end);
  }, [filteredCashBooks, visibleRange]);

  // Memoized summary values - hanya hitung sekali per perubahan cashBooks
  const summaryData = useMemo(() => {
    if (cashBooks.length === 0) {
      return {
        saldo: 0,
        omzet: 0,
        biayaOperasional: 0,
        biayaBahan: 0,
        totalBiaya: 0,
        labaBersih: 0,
        bagiHasilAnwar: 0,
        bagiHasilSuri: 0,
        bagiHasilGemi: 0,
        kasbonAnwar: 0,
        kasbonSuri: 0,
        kasbonCahaya: 0,
        kasbonDinil: 0,
        hutang: totalHutang,
        hutangCount: hutangCount,
        piutang: totalPiutang,
        piutangCount: piutangCount,
      };
    }

    // Untuk data aktif: ambil index 0 (display_order tertinggi = transaksi terbaru)
    // Untuk arsip: ambil index terakhir (display_order terkecil = transaksi terakhir periode)
    // Karena display_order DESC: nilai tertinggi = transaksi paling lama di CSV
    const latest = viewingArchive
      ? cashBooks[cashBooks.length - 1]
      : cashBooks[0];

    return {
      saldo: latest.saldo,
      omzet: latest.omzet,
      biayaOperasional: latest.biaya_operasional,
      biayaBahan: latest.biaya_bahan,
      totalBiaya: latest.biaya_operasional + latest.biaya_bahan,
      labaBersih: latest.laba_bersih,
      bagiHasilAnwar: latest.bagi_hasil_anwar,
      bagiHasilSuri: latest.bagi_hasil_suri,
      bagiHasilGemi: latest.bagi_hasil_gemi,
      kasbonAnwar: latest.kasbon_anwar,
      kasbonSuri: latest.kasbon_suri,
      kasbonCahaya: latest.kasbon_cahaya,
      kasbonDinil: latest.kasbon_dinil,
      hutang: totalHutang,
      hutangCount: hutangCount,
      piutang: totalPiutang,
      piutangCount: piutangCount,
    };
  }, [
    cashBooks,
    viewingArchive,
    totalHutang,
    hutangCount,
    totalPiutang,
    piutangCount,
  ]);

  useEffect(() => {
    checkAuth();
  }, []);

  // Scroll handler untuk lazy loading rows (virtualization)
  useEffect(() => {
    const handleScroll = () => {
      if (!tableContainerRef.current) return;

      const container = tableContainerRef.current;
      const scrollTop = container.scrollTop;
      const rowHeight = 60; // Approximate row height
      const visibleRows = Math.ceil(container.clientHeight / rowHeight);
      const buffer = 10; // Extra rows to render above/below

      const start = Math.max(0, Math.floor(scrollTop / rowHeight) - buffer);
      const end = Math.min(
        filteredCashBooks.length,
        start + visibleRows + buffer * 2
      );

      setVisibleRange({ start, end });
    };

    const container = tableContainerRef.current;
    if (container) {
      container.addEventListener("scroll", handleScroll);
      handleScroll(); // Initial calculation
      return () => container.removeEventListener("scroll", handleScroll);
    }
  }, [filteredCashBooks.length]);

  // Reset scroll position when filter changes
  useEffect(() => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTop = 0;
      setVisibleRange({ start: 0, end: 50 });
    }
  }, [selectedKategoriFilters]);

  // Handle ESC key to close modals
  useEffect(() => {
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showModal) handleCloseModal();
        else if (confirmDialog?.show) setConfirmDialog(null);
        else if (showImportModal) setShowImportModal(false);
        else if (showDeleteAllModal) setShowDeleteAllModal(false);
        else if (showEditManualModal) setShowEditManualModal(false);
        else if (showCloseBooksModal) setShowCloseBooksModal(false);
        else if (showSelectMonthModal) setShowSelectMonthModal(false);
        else if (showKategoriDropdown) setShowKategoriDropdown(false);
      }
    };

    window.addEventListener("keydown", handleEscKey);
    return () => window.removeEventListener("keydown", handleEscKey);
  }, [
    showModal,
    confirmDialog,
    showImportModal,
    showDeleteAllModal,
    showEditManualModal,
    showCloseBooksModal,
    showSelectMonthModal,
    showKategoriDropdown,
  ]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (showKategoriDropdown && !target.closest(".relative")) {
        setShowKategoriDropdown(false);
      }
    };

    if (showKategoriDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showKategoriDropdown]);

  const checkAuth = () => {
    const userSession = localStorage.getItem("user");
    if (!userSession) {
      router.push("/auth/login");
      return;
    }

    const user = JSON.parse(userSession);
    setCurrentUser(user);

    // Check if user has permission (Admin, Manager, atau Chief)
    if (
      user.role !== "admin" &&
      user.role !== "manager" &&
      user.role !== "chief"
    ) {
      router.push("/dashboard");
      return;
    }

    setLoading(false);
    loadCashBooks();
  };

  const showMsg = (type: "success" | "error", message: string) => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 3000);
  };

  const loadCashBooks = async (archiveLabel?: string) => {
    try {
      const url = archiveLabel
        ? `/api/cashbook/archive/${encodeURIComponent(archiveLabel)}`
        : "/api/finance/cash-book";

      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Gagal memuat data");
      setCashBooks(data.cashBooks || []);

      // Set viewing archive state
      setViewingArchive(archiveLabel || null);
      // Reset archive info when returning to active table
      if (!archiveLabel) {
        setCurrentArchiveInfo(null);
      }

      // Load hutang and piutang data (only for active table, not archive)
      if (!archiveLabel) {
        loadHutangData();
        loadPiutangData();
      }
    } catch (err) {
      console.error("Gagal memuat cash books:", err);
      showMsg("error", "Tidak bisa memuat data buku keuangan dari database.");
    }
  };

  const loadHutangData = async () => {
    try {
      const debts = await getDebts();
      const total = debts.reduce(
        (sum: number, debt: any) => sum + debt.sisa_hutang,
        0
      );
      setTotalHutang(total);
      setHutangCount(debts.length);
    } catch (err) {
      console.error("Gagal memuat data hutang:", err);
    }
  };

  const loadPiutangData = async () => {
    try {
      const receivables = await getReceivables();
      const total = receivables.reduce(
        (sum: number, rec: any) => sum + rec.sisa_piutang,
        0
      );
      setTotalPiutang(total);
      setPiutangCount(receivables.length);
    } catch (err) {
      console.error("Gagal memuat data piutang:", err);
    }
  };

  const handleOpenModal = () => {
    setEditingCashBook(null);
    setFormData({
      tanggal: getTodayJakarta(),
      kategori_transaksi: "KAS",
      debit: "",
      kredit: "",
      keperluan: "",
      catatan: "",
    });
    setShowModal(true);
    // Focus on debit input after modal opens
    setTimeout(() => {
      debitInputRef.current?.focus();
    }, 100);
  };

  const handleOpenEditModal = (cashBook: CashBook) => {
    // Check if this transaction is from purchases (pembelian cash or pembayaran hutang)
    const isFromPurchase =
      cashBook.keperluan?.toLowerCase().includes("pembelian") ||
      cashBook.keperluan?.toLowerCase().includes("pembayaran hutang") ||
      cashBook.keperluan?.toLowerCase().includes("pelunasan");

    // Check if this transaction is from POS
    const isFromPOS =
      cashBook.keperluan?.toLowerCase().includes("penjualan") ||
      cashBook.keperluan?.toLowerCase().includes("inv-") ||
      (cashBook.kategori_transaksi === "OMZET" &&
        cashBook.keperluan?.includes("[REF:sale_")) ||
      (cashBook.kategori_transaksi === "PIUTANG" &&
        (cashBook.keperluan?.toLowerCase().includes("dp inv-") ||
          cashBook.keperluan
            ?.toLowerCase()
            .includes("pembayaran sebagian inv-"))) ||
      (cashBook.kategori_transaksi === "LUNAS" &&
        cashBook.keperluan?.toLowerCase().includes("bayar piutang inv-"));

    if (isFromPurchase) {
      setConfirmDialog({
        show: true,
        title: "Tidak Dapat Diedit",
        message: `Transaksi ini berasal dari sistem Pembelian dan tidak dapat diedit langsung dari halaman Finance.\n\nKategori: ${
          cashBook.kategori_transaksi
        }\nKeperluan: ${
          stripReferenceId(cashBook.keperluan) || "-"
        }\nTanggal: ${formatDateJakarta(
          cashBook.tanggal
        )}\n\nUntuk mengubah transaksi ini:\n\n1. Buka halaman PEMBELIAN\n2. Cari data pembelian terkait\n3. Klik tombol Edit pada data pembelian tersebut`,
        confirmText: "Mengerti",
        cancelText: "",
        type: "purchases",
        onConfirm: () => {
          setConfirmDialog(null);
        },
      });
      return;
    }

    if (isFromPOS) {
      setConfirmDialog({
        show: true,
        title: "Tidak Dapat Diedit",
        message: `Transaksi ini berasal dari sistem POS (Point of Sale) dan tidak dapat diedit langsung dari halaman Keuangan.\n\nKategori: ${
          cashBook.kategori_transaksi
        }\nKeperluan: ${
          stripReferenceId(cashBook.keperluan) || "-"
        }\nTanggal: ${formatDateJakarta(
          cashBook.tanggal
        )}\n\nTransaksi POS hanya dapat dimodifikasi melalui halaman POS dengan menghapus dan membuat transaksi baru.`,
        confirmText: "Mengerti",
        cancelText: "",
        type: "pos",
        onConfirm: () => {
          setConfirmDialog(null);
        },
      });
      return;
    }

    setEditingCashBook(cashBook);
    setFormData({
      tanggal: cashBook.tanggal,
      kategori_transaksi: cashBook.kategori_transaksi,
      debit: cashBook.debit ? cashBook.debit.toString() : "",
      kredit: cashBook.kredit ? cashBook.kredit.toString() : "",
      keperluan: cashBook.keperluan || "",
      catatan: cashBook.catatan || "",
    });
    setShowModal(true);
    // Focus on debit input after modal opens
    setTimeout(() => {
      debitInputRef.current?.focus();
    }, 100);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingCashBook(null);
    setFormData({
      tanggal: getTodayJakarta(),
      kategori_transaksi: "KAS",
      debit: "",
      kredit: "",
      keperluan: "",
      catatan: "",
    });
  };

  const handleDebitChange = (value: string) => {
    // Only allow numbers and decimal point
    const sanitized = value.replace(/[^0-9.]/g, "");
    setFormData({ ...formData, debit: sanitized, kredit: "" });
  };

  const handleKreditChange = (value: string) => {
    // Only allow numbers and decimal point
    const sanitized = value.replace(/[^0-9.]/g, "");
    setFormData({ ...formData, kredit: sanitized, debit: "" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const debitVal = parseFloat(formData.debit) || 0;
    const kreditVal = parseFloat(formData.kredit) || 0;

    if (debitVal === 0 && kreditVal === 0) {
      showMsg("error", "Debit atau kredit harus diisi!");
      return;
    }

    if (debitVal > 0 && kreditVal > 0) {
      showMsg("error", "Tidak boleh mengisi debit dan kredit bersamaan!");
      return;
    }

    try {
      if (editingCashBook) {
        // Update existing transaction
        const res = await fetch(
          `/api/finance/cash-book/${editingCashBook.id}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tanggal: formData.tanggal,
              kategori_transaksi: formData.kategori_transaksi,
              debit: debitVal,
              kredit: kreditVal,
              keperluan: formData.keperluan,
              catatan: formData.catatan,
            }),
          }
        );

        const data = await res.json();
        if (!res.ok)
          throw new Error(data?.error || "Gagal mengupdate transaksi");

        // Update local state for edits
        if (data.cashBook) {
          updateCashBookInState(data.cashBook);
        } else {
          await loadCashBooks();
        }

        showMsg("success", " Transaksi berhasil diupdate!");
      } else {
        // Create new transaction
        const { createCashBookEntry } = await import(
          "@/lib/services/finance-service"
        );
        await createCashBookEntry({
          tanggal: formData.tanggal,
          kategori_transaksi: formData.kategori_transaksi,
          debit: debitVal,
          kredit: kreditVal,
          keperluan: formData.keperluan,
          catatan: formData.catatan,
          dibuat_oleh: currentUser?.id,
        });

        showMsg("success", " Transaksi berhasil ditambahkan!");
      }

      handleCloseModal();

      // For new transactions, reload; for edits, state already updated
      if (!editingCashBook) {
        await loadCashBooks();
      }
    } catch (err) {
      console.error(err);
      showMsg(
        "error",
        `Terjadi kesalahan: ${err instanceof Error ? err.message : "Unknown"}`
      );
    }
  };

  const formatRupiah = useCallback((amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }, []);

  const getKategoriColor = useCallback((kategori: KategoriTransaksi) => {
    const colors: Record<
      KategoriTransaksi,
      { bg: string; text: string; border: string }
    > = {
      KAS: {
        bg: "bg-blue-100",
        text: "text-blue-800",
        border: "border-blue-300",
      },
      BIAYA: {
        bg: "bg-red-100",
        text: "text-red-800",
        border: "border-red-300",
      },
      OMZET: {
        bg: "bg-green-100",
        text: "text-green-800",
        border: "border-green-300",
      },
      INVESTOR: {
        bg: "bg-purple-100",
        text: "text-purple-800",
        border: "border-purple-300",
      },
      SUBSIDI: {
        bg: "bg-yellow-100",
        text: "text-yellow-800",
        border: "border-yellow-300",
      },
      LUNAS: {
        bg: "bg-teal-100",
        text: "text-teal-800",
        border: "border-teal-300",
      },
      SUPPLY: {
        bg: "bg-orange-100",
        text: "text-orange-800",
        border: "border-orange-300",
      },
      LABA: {
        bg: "bg-emerald-100",
        text: "text-emerald-800",
        border: "border-emerald-300",
      },
      KOMISI: {
        bg: "bg-cyan-100",
        text: "text-cyan-800",
        border: "border-cyan-300",
      },
      TABUNGAN: {
        bg: "bg-indigo-100",
        text: "text-indigo-800",
        border: "border-indigo-300",
      },
      HUTANG: {
        bg: "bg-rose-100",
        text: "text-rose-800",
        border: "border-rose-300",
      },
      PIUTANG: {
        bg: "bg-lime-100",
        text: "text-lime-800",
        border: "border-lime-300",
      },
      "PRIBADI-A": {
        bg: "bg-sky-100",
        text: "text-sky-800",
        border: "border-sky-300",
      },
      "PRIBADI-S": {
        bg: "bg-pink-100",
        text: "text-pink-800",
        border: "border-pink-300",
      },
    };
    return (
      colors[kategori] || {
        bg: "bg-gray-100",
        text: "text-gray-800",
        border: "border-gray-300",
      }
    );
  }, []);

  const handleDelete = (cashBook: CashBook) => {
    // Check if this transaction is from purchases (pembelian cash or pembayaran hutang)
    const isFromPurchase =
      cashBook.keperluan?.toLowerCase().includes("pembelian") ||
      cashBook.keperluan?.toLowerCase().includes("pembayaran hutang") ||
      cashBook.keperluan?.toLowerCase().includes("pelunasan");

    // Check if this transaction is from POS (penjualan)
    const isFromPOS =
      cashBook.keperluan?.toLowerCase().includes("penjualan") ||
      cashBook.keperluan?.toLowerCase().includes("inv-") ||
      (cashBook.kategori_transaksi === "OMZET" &&
        cashBook.keperluan?.includes("[REF:sale_")) ||
      (cashBook.kategori_transaksi === "PIUTANG" &&
        (cashBook.keperluan?.toLowerCase().includes("dp inv-") ||
          cashBook.keperluan
            ?.toLowerCase()
            .includes("pembayaran sebagian inv-")));

    if (isFromPurchase) {
      setConfirmDialog({
        show: true,
        title: "Tidak Dapat Dihapus",
        message: `Transaksi ini berasal dari sistem Pembelian dan tidak dapat dihapus langsung dari halaman Keuangan.\n\nKategori: ${
          cashBook.kategori_transaksi
        }\nKeperluan: ${
          stripReferenceId(cashBook.keperluan) || "-"
        }\nTanggal: ${formatDateJakarta(
          cashBook.tanggal
        )}\n\nUntuk menghapus atau membatalkan transaksi ini:\n\n1. Buka halaman PEMBELIAN\n2. Untuk pembelian yang sudah Lunas lewat pembayaran Cash: Klik tombol Hapus pada Daftar Pembelian\n3. Untuk pembayaran tagihan yang sudah Lunas (sudah dibayar): Klik tombol Revert untuk mengembalikan ke status TAGIHAN`,
        confirmText: "Mengerti",
        cancelText: "",
        type: "purchases",
        onConfirm: () => {
          setConfirmDialog(null);
        },
      });
      return;
    }

    if (isFromPOS) {
      setConfirmDialog({
        show: true,
        title: "Tidak Dapat Dihapus",
        message: `Transaksi ini berasal dari sistem POS (Point of Sale) dan tidak dapat dihapus langsung dari halaman Keuangan.\n\nKategori: ${
          cashBook.kategori_transaksi
        }\nKeperluan: ${
          stripReferenceId(cashBook.keperluan) || "-"
        }\nTanggal: ${formatDateJakarta(
          cashBook.tanggal
        )}\n\nUntuk menghapus transaksi ini:\n\n1. Buka halaman POS\n2. Scroll ke bagian RIWAYAT PENJUALAN\n3. Cari transaksi yang ingin dihapus\n4. Klik tombol Hapus (ikon tempat sampah) pada transaksi tersebut\n\nPerhatian: Menghapus transaksi penjualan akan mengembalikan stok barang dan menghapus semua data terkait termasuk piutang (jika ada).`,
        confirmText: "Mengerti",
        cancelText: "",
        type: "pos",
        onConfirm: () => {
          setConfirmDialog(null);
        },
      });
      return;
    }

    setConfirmDialog({
      show: true,
      title: "Hapus Transaksi",
      message: `Yakin ingin menghapus transaksi berikut?\n\nKategori: ${
        cashBook.kategori_transaksi
      }\nKeperluan: ${
        stripReferenceId(cashBook.keperluan) || "-"
      }\nTanggal: ${formatDateJakarta(
        cashBook.tanggal
      )}\n\nData akan dikalkulasi ulang otomatis setelah penghapusan.`,
      confirmText: "Ya, Hapus",
      cancelText: "Batal",
      type: "danger",
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          await deleteCashBookEntry(cashBook.id);

          showMsg(
            "success",
            " Transaksi berhasil dihapus dan data telah dikalkulasi ulang!"
          );

          // Remove from local state instead of reloading
          setCashBooks((prev) => prev.filter((cb) => cb.id !== cashBook.id));
        } catch (err) {
          console.error(err);
          showMsg(
            "error",
            `Terjadi kesalahan: ${
              err instanceof Error ? err.message : "Unknown"
            }`
          );
        }
      },
    });
  };

  const handleDeleteAll = async () => {
    setDeleting(true);
    try {
      await deleteAllCashbook();
      showMsg(
        "success",
        "Transaksi aktif berhasil dihapus. Data arsip tetap tersimpan."
      );
      setShowDeleteAllModal(false);

      // Clear local state instead of reloading
      setCashBooks([]);
    } catch (err) {
      console.error(err);
      showMsg(
        "error",
        `Terjadi kesalahan: ${err instanceof Error ? err.message : "Unknown"}`
      );
    } finally {
      setDeleting(false);
    }
  };

  const handleOpenEditManual = (cashBook: CashBook) => {
    // Check if this transaction is from purchases
    const isFromPurchase =
      cashBook.keperluan?.toLowerCase().includes("pembelian") ||
      cashBook.keperluan?.toLowerCase().includes("pembayaran hutang") ||
      cashBook.keperluan?.toLowerCase().includes("pelunasan");

    // Check if this transaction is from POS
    const isFromPOS =
      cashBook.keperluan?.toLowerCase().includes("penjualan") ||
      cashBook.keperluan?.toLowerCase().includes("inv-") ||
      (cashBook.kategori_transaksi === "OMZET" &&
        cashBook.keperluan?.includes("[REF:sale_")) ||
      (cashBook.kategori_transaksi === "PIUTANG" &&
        (cashBook.keperluan?.toLowerCase().includes("dp inv-") ||
          cashBook.keperluan
            ?.toLowerCase()
            .includes("pembayaran sebagian inv-"))) ||
      (cashBook.kategori_transaksi === "LUNAS" &&
        cashBook.keperluan?.toLowerCase().includes("bayar piutang inv-"));

    if (isFromPurchase) {
      setConfirmDialog({
        show: true,
        title: "Tidak Dapat Di-Override",
        message: `Transaksi ini berasal dari sistem Pembelian dan tidak dapat di-override dari halaman Keuangan.\n\nKategori: ${
          cashBook.kategori_transaksi
        }\nKeperluan: ${
          stripReferenceId(cashBook.keperluan) || "-"
        }\nTanggal: ${formatDateJakarta(
          cashBook.tanggal
        )}\n\nData akan dihitung otomatis berdasarkan transaksi pembelian.`,
        confirmText: "Mengerti",
        cancelText: "",
        type: "purchases",
        onConfirm: () => {
          setConfirmDialog(null);
        },
      });
      return;
    }

    if (isFromPOS) {
      setConfirmDialog({
        show: true,
        title: "Tidak Dapat Di-Override",
        message: `Transaksi ini berasal dari sistem POS (Point of Sale) dan tidak dapat di-override dari halaman Keuangan.\n\nKategori: ${
          cashBook.kategori_transaksi
        }\nKeperluan: ${
          stripReferenceId(cashBook.keperluan) || "-"
        }\nTanggal: ${formatDateJakarta(
          cashBook.tanggal
        )}\n\nData akan dihitung otomatis berdasarkan transaksi penjualan.`,
        confirmText: "Mengerti",
        cancelText: "",
        type: "pos",
        onConfirm: () => {
          setConfirmDialog(null);
        },
      });
      return;
    }

    setEditManualCashBook(cashBook);
    setShowEditManualModal(true);
  };

  const handleImportSuccess = async (updatedCashBooks?: CashBook[]) => {
    showMsg("success", " Data berhasil diimport!");

    // If new cashbooks provided, update state; otherwise reload
    if (updatedCashBooks && updatedCashBooks.length > 0) {
      setCashBooks(updatedCashBooks);
    } else {
      await loadCashBooks();
    }
  };

  const handleEditManualSuccess = async () => {
    showMsg("success", " Data berhasil di-override!");
    await loadCashBooks();
  };

  const handleCloseBooksSuccess = async () => {
    showMsg("success", " Buku berhasil ditutup!");
    await loadCashBooks();
  };

  const handleSelectArchive = async (archive: {
    label: string;
    archived_at: string;
    start_date: string;
    end_date: string;
  }) => {
    try {
      const url = `/api/cashbook/archive/by-time?label=${encodeURIComponent(
        archive.label
      )}&at=${encodeURIComponent(archive.archived_at)}`;
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Gagal memuat arsip");
      setCashBooks(data.cashBooks || []);
      setViewingArchive(archive.label);
      setCurrentArchiveInfo({
        label: archive.label,
        archived_at: archive.archived_at,
      });
      showMsg("success", `Menampilkan arsip: ${archive.label}`);
    } catch (err) {
      console.error("Gagal memuat arsip:", err);
      showMsg("error", "Tidak bisa memuat arsip");
    }
  };

  const handleRestoreArchive = () => {
    if (!currentArchiveInfo) {
      showMsg("error", "Tidak ada arsip yang dipilih");
      return;
    }

    setConfirmDialog({
      show: true,
      title: "Restore Arsip",
      message: `Apakah Anda yakin ingin mengembalikan semua transaksi dari arsip "${currentArchiveInfo.label}" ke tabel aktif?\n\nSemua transaksi akan kembali menjadi aktif dan dapat diedit.`,
      confirmText: "Ya, Restore",
      cancelText: "Batal",
      type: "warning",
      onConfirm: async () => {
        setConfirmDialog(null);

        try {
          await restoreArchivedTransactions(
            currentArchiveInfo.label,
            currentArchiveInfo.archived_at
          );

          showMsg(
            "success",
            `Transaksi berhasil dikembalikan dari "${currentArchiveInfo.label}"`
          );

          // Kembali ke tabel aktif dan reload
          setViewingArchive(null);
          setCurrentArchiveInfo(null);
          await loadCashBooks();
        } catch (err: any) {
          console.error("Restore archive error:", err);
          showMsg("error", err.message || "Gagal restore arsip");
        }
      },
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-pink-600 border-t-transparent"></div>
          <p className="mt-4 text-[#0a1b3d] font-semibold">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Header Section */}
      <div className="bg-gradient-to-br from-orange-500 to-pink-600 rounded-2xl shadow-lg p-6 mb-6 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MoneyIcon size={28} className="text-white" />
            <div>
              <h2 className="text-2xl font-bold mb-1 uppercase font-twcenmt tracking-wide">
                Buku Keuangan
              </h2>
              <p className="text-white/90 text-sm">
                {viewingArchive
                  ? `Melihat Arsip: ${viewingArchive}`
                  : "Kelola transaksi dan buku kas perusahaan"}
              </p>
            </div>
          </div>
          {!viewingArchive && (
            <button
              onClick={handleOpenModal}
              className="px-6 py-3 bg-white text-orange-600 rounded-xl font-semibold hover:shadow-xl transition-all flex items-center gap-2"
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
                  d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                />
              </svg>
              Tambah Transaksi
            </button>
          )}
        </div>
      </div>
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {/* Card 1: Saldo */}
        <div className="bg-white rounded-xl shadow-md p-4 border-l-4 border-pink-600">
          <p className="text-sm text-gray-500 font-semibold mb-1">Saldo</p>
          <p className="text-2xl font-bold text-pink-600">
            {formatRupiah(summaryData.saldo)}
          </p>
        </div>

        {/* Card 2: Total Omzet */}
        <div className="bg-white rounded-xl shadow-md p-4 border-l-4 border-green-500">
          <p className="text-sm text-gray-500 font-semibold mb-1">
            Total Omzet
          </p>
          <p className="text-2xl font-bold text-green-600">
            {formatRupiah(summaryData.omzet)}
          </p>
        </div>

        {/* Card 3: Total Biaya (Clickable) */}
        <div
          onClick={() => setShowBiayaDetail(!showBiayaDetail)}
          className="bg-white rounded-xl shadow-md p-4 border-l-4 border-red-500 cursor-pointer hover:shadow-lg transition-all duration-200"
        >
          <p className="text-sm text-gray-500 font-semibold mb-1 flex items-center justify-between">
            <span>Total Biaya</span>
            <svg
              className={`w-5 h-5 transform transition-transform ${
                showBiayaDetail ? "rotate-180" : ""
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </p>
          <p className="text-2xl font-bold text-red-600">
            {formatRupiah(summaryData.totalBiaya)}
          </p>
          {showBiayaDetail && (
            <div className="mt-3 pt-3 border-t border-gray-200 space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Operasional:</span>
                <span className="text-sm font-semibold text-red-700">
                  {formatRupiah(summaryData.biayaOperasional)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Bahan:</span>
                <span className="text-sm font-semibold text-red-700">
                  {formatRupiah(summaryData.biayaBahan)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Card 4: Tagihan (NEW) */}
        <div className="bg-white rounded-xl shadow-md p-4 border-l-4 border-amber-500">
          <p className="text-sm text-gray-500 font-semibold mb-1">
            Tagihan Vendor
          </p>
          <p className="text-2xl font-bold text-amber-600">
            {formatRupiah(summaryData.hutang)}
          </p>
          {summaryData.hutangCount > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              {summaryData.hutangCount} pembelian
            </p>
          )}
        </div>

        {/* Card 5: Piutang */}
        <div className="bg-white rounded-xl shadow-md p-4 border-l-4 border-blue-500">
          <p className="text-sm text-gray-500 font-semibold mb-1">
            Piutang Pelanggan
          </p>
          <p className="text-2xl font-bold text-blue-600">
            {formatRupiah(summaryData.piutang)}
          </p>
          {summaryData.piutangCount > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              {summaryData.piutangCount} penjualan
            </p>
          )}
        </div>
      </div>
      {/* Bagi Hasil Summary - Hanya untuk Admin, Manager & Chief */}
      {currentUser &&
        (currentUser.role === "admin" ||
          currentUser.role === "manager" ||
          currentUser.role === "chief") && (
          <div className="mb-6">
            <button
              onClick={() => setShowBagiHasilSection(!showBagiHasilSection)}
              className="w-full bg-gradient-to-r from-amber-50 via-pink-50 to-cyan-50 rounded-xl shadow-md p-4 border-2 border-purple-200 hover:shadow-lg transition-all duration-200 text-left flex items-center justify-between"
            >
              <span className="text-sm font-bold text-gray-700 flex items-center gap-2">
                <BriefcaseIcon size={18} className="text-purple-600" />
                Bagi Hasil
              </span>
              <svg
                className={`w-5 h-5 transform transition-transform ${
                  showBagiHasilSection ? "rotate-180" : ""
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {showBagiHasilSection && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                {/* Bagi Hasil Anwar - Warna Amber */}
                <div
                  onClick={() => setShowBagiHasilAnwar(!showBagiHasilAnwar)}
                  className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl shadow-md p-4 border-2 border-amber-200 cursor-pointer hover:shadow-lg transition-all duration-200 hover:scale-105"
                >
                  <p className="text-sm font-bold text-amber-800 mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <BriefcaseIcon size={16} className="text-amber-700" />
                      Bagi Hasil Anwar
                    </span>
                    <svg
                      className={`w-4 h-4 transform transition-transform ${
                        showBagiHasilAnwar ? "rotate-180" : ""
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </p>
                  <p className="text-2xl font-bold text-amber-900">
                    {formatRupiah(summaryData.bagiHasilAnwar)}
                  </p>
                  {showBagiHasilAnwar && (
                    <div className="mt-3 pt-3 border-t border-amber-300 space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-amber-700">
                          Laba Bersih:
                        </span>
                        <span className="text-xs font-semibold text-amber-900">
                          {formatRupiah(summaryData.labaBersih)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-amber-700">Kasbon:</span>
                        <span className="text-xs font-semibold text-amber-900">
                          {formatRupiah(summaryData.kasbonAnwar)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Bagi Hasil Suri */}
                <div
                  onClick={() => setShowBagiHasilSuri(!showBagiHasilSuri)}
                  className="bg-gradient-to-br from-pink-50 to-pink-100 rounded-xl shadow-md p-4 border-2 border-pink-200 cursor-pointer hover:shadow-lg transition-all duration-200 hover:scale-105"
                >
                  <p className="text-sm font-bold text-pink-800 mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <BriefcaseIcon size={16} className="text-pink-700" />
                      Bagi Hasil Suri
                    </span>
                    <svg
                      className={`w-4 h-4 transform transition-transform ${
                        showBagiHasilSuri ? "rotate-180" : ""
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </p>
                  <p className="text-2xl font-bold text-pink-900">
                    {formatRupiah(summaryData.bagiHasilSuri)}
                  </p>
                  {showBagiHasilSuri && (
                    <div className="mt-3 pt-3 border-t border-pink-300 space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-pink-700">
                          Laba Bersih:
                        </span>
                        <span className="text-xs font-semibold text-pink-900">
                          {formatRupiah(summaryData.labaBersih)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-pink-700">Kasbon:</span>
                        <span className="text-xs font-semibold text-pink-900">
                          {formatRupiah(summaryData.kasbonSuri)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Bagi Hasil Gemi - Warna Biru (seperti Kasbon Pegawai) */}
                <div
                  onClick={() => setShowBagiHasilGemi(!showBagiHasilGemi)}
                  className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl shadow-md p-4 border-2 border-blue-200 cursor-pointer hover:shadow-lg transition-all duration-200 hover:scale-105"
                >
                  <p className="text-sm font-bold text-blue-800 mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <BriefcaseIcon size={16} className="text-blue-700" />
                      Bagi Hasil Gemi
                    </span>
                    <svg
                      className={`w-4 h-4 transform transition-transform ${
                        showBagiHasilGemi ? "rotate-180" : ""
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </p>
                  <p className="text-2xl font-bold text-blue-900">
                    {formatRupiah(summaryData.bagiHasilGemi)}
                  </p>
                  {showBagiHasilGemi && (
                    <div className="mt-3 pt-3 border-t border-blue-300 space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-blue-700">
                          Laba Bersih:
                        </span>
                        <span className="text-xs font-semibold text-blue-900">
                          {formatRupiah(summaryData.labaBersih)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      {/* Kasbon Karyawan Summary - Hanya untuk Admin & Manager */}
      {currentUser &&
        (currentUser.role === "admin" || currentUser.role === "manager") && (
          <div className="mb-6">
            <button
              onClick={() => setShowKasbonKaryawan(!showKasbonKaryawan)}
              className="w-full bg-gradient-to-r from-violet-50 to-emerald-50 rounded-xl shadow-md p-4 border-2 border-violet-200 hover:shadow-lg transition-all duration-200 text-left flex items-center justify-between"
            >
              <span className="text-sm font-bold text-gray-700 flex items-center gap-2">
                <PersonIcon size={18} className="text-violet-600" />
                Kasbon Karyawan
              </span>
              <svg
                className={`w-5 h-5 transform transition-transform ${
                  showKasbonKaryawan ? "rotate-180" : ""
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {showKasbonKaryawan && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div className="bg-gradient-to-br from-violet-50 to-violet-100 rounded-xl shadow-md p-4 border-2 border-violet-200">
                  <p className="text-sm font-bold text-violet-800 mb-2 flex items-center gap-2">
                    <PersonIcon size={16} className="text-violet-700" />
                    Kasbon Cahaya
                  </p>
                  <p className="text-2xl font-bold text-violet-900">
                    {formatRupiah(summaryData.kasbonCahaya)}
                  </p>
                </div>
                <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl shadow-md p-4 border-2 border-emerald-200">
                  <p className="text-sm font-bold text-emerald-800 mb-2 flex items-center gap-2">
                    <PersonIcon size={16} className="text-emerald-700" />
                    Kasbon Dinil
                  </p>
                  <p className="text-2xl font-bold text-emerald-900">
                    {formatRupiah(summaryData.kasbonDinil)}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}{" "}
      {/* Toolbar for Cash Book Management - Moved here */}
      <div className="mb-6 bg-white rounded-xl shadow-md p-4 border border-gray-200">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Filter Kategori Dropdown with Checkbox */}
          <div className="relative">
            <button
              onClick={() => setShowKategoriDropdown(!showKategoriDropdown)}
              className="bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 text-white px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 shadow-sm"
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
                  d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                />
              </svg>
              {selectedKategoriFilters.size === 0
                ? "Semua Kategori"
                : `${selectedKategoriFilters.size} Kategori`}
              <svg
                className={`w-4 h-4 transition-transform ${
                  showKategoriDropdown ? "rotate-180" : ""
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
            {showKategoriDropdown && (
              <div className="absolute z-50 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[200px] max-h-[400px] overflow-y-auto">
                <div className="p-2 border-b border-gray-200 flex gap-2">
                  <button
                    onClick={() => {
                      const allKats = new Set(kategoriOptions);
                      setSelectedKategoriFilters(allKats);
                    }}
                    className="flex-1 text-xs px-2 py-1 bg-cyan-50 text-cyan-700 rounded hover:bg-cyan-100 transition-colors"
                  >
                    Pilih Semua
                  </button>
                  <button
                    onClick={() => {
                      setSelectedKategoriFilters(new Set());
                    }}
                    className="flex-1 text-xs px-2 py-1 bg-gray-50 text-gray-700 rounded hover:bg-gray-100 transition-colors"
                  >
                    Bersihkan
                  </button>
                </div>
                {kategoriOptions.map((kat) => {
                  const isSelected = selectedKategoriFilters.has(kat);
                  return (
                    <label
                      key={kat}
                      className="flex items-center gap-2 px-4 py-2 hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          const newFilters = new Set(selectedKategoriFilters);
                          if (e.target.checked) {
                            newFilters.add(kat);
                          } else {
                            newFilters.delete(kat);
                          }
                          setSelectedKategoriFilters(newFilters);
                        }}
                        className="w-4 h-4 text-cyan-600 border-gray-300 rounded focus:ring-cyan-500"
                      />
                      <span
                        className={
                          isSelected ? "font-semibold text-cyan-700" : ""
                        }
                      >
                        {kat}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {!viewingArchive && (
            <>
              <button
                onClick={() => setShowDeleteAllModal(true)}
                className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 shadow-sm"
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
                Delete All
              </button>
              <button
                onClick={() => setShowCloseBooksModal(true)}
                className="bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 shadow-sm"
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
                    d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                  />
                </svg>
                Tutup Buku
              </button>
            </>
          )}

          <button
            onClick={() => setShowSelectMonthModal(true)}
            className="bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 shadow-sm"
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
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            Pilih Arsip Bulan
          </button>

          {!viewingArchive && (
            <button
              onClick={() => setShowImportModal(true)}
              className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 shadow-sm"
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
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              Import CSV
            </button>
          )}

          {viewingArchive && (
            <>
              <button
                onClick={handleRestoreArchive}
                className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 shadow-sm"
                title="Kembalikan semua transaksi arsip ini ke tabel aktif"
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
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                Restore Arsip
              </button>
              <button
                onClick={() => loadCashBooks()}
                className="bg-white border-2 border-slate-600 text-slate-700 px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 shadow-sm hover:bg-slate-50"
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
                    d="M10 19l-7-7m0 0l7-7m-7 7h18"
                  />
                </svg>
                Kembali ke Aktif
              </button>
            </>
          )}
          <div className="ml-auto">
            <div className="bg-gray-100 text-gray-700 text-sm font-semibold px-4 py-2 rounded-lg shadow-inner flex items-center gap-2">
              {viewingArchive ? (
                <>
                  <BoxIcon size={16} className="text-gray-600" />{" "}
                  {viewingArchive} ({filteredCashBooks.length} Transaksi)
                </>
              ) : (
                <>{filteredCashBooks.length} Transaksi Aktif</>
              )}
            </div>
          </div>
        </div>
      </div>
      {/* Table Section */}
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
        <div
          ref={tableContainerRef}
          className="overflow-x-auto max-h-[600px] overflow-y-auto"
          style={{ scrollBehavior: "smooth" }}
        >
          <table className="w-full table-fixed">
            <thead className="bg-gradient-to-r from-orange-500 to-pink-600 text-white sticky top-0 z-10">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-bold uppercase whitespace-nowrap w-28">
                  Tanggal
                </th>
                <th className="px-3 py-3 text-left text-xs font-bold uppercase w-28">
                  Kategori
                </th>
                <th className="px-3 py-3 text-right text-xs font-bold uppercase w-40">
                  Nominal
                </th>
                <th className="px-3 py-3 text-left text-xs font-bold uppercase">
                  Keperluan
                </th>
                <th className="px-3 py-3 text-right text-xs font-bold uppercase w-32">
                  Saldo
                </th>
                <th className="px-3 py-3 text-center text-xs font-bold uppercase w-32">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredCashBooks.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-gray-500"
                  >
                    {selectedKategoriFilters.size > 0
                      ? `Tidak ada transaksi dengan kategori yang dipilih.`
                      : 'Belum ada transaksi. Klik "Tambah Transaksi" untuk memulai.'}
                  </td>
                </tr>
              ) : (
                <>
                  {/* Spacer untuk rows sebelum visible range - hanya untuk data > 100 */}
                  {filteredCashBooks.length > 100 && visibleRange.start > 0 && (
                    <tr
                      style={{
                        height: `${visibleRange.start * 60}px`,
                        opacity: 0,
                        pointerEvents: "none",
                      }}
                    >
                      <td className="px-3 py-3">&nbsp;</td>
                      <td className="px-3 py-3">&nbsp;</td>
                      <td className="px-3 py-3">&nbsp;</td>
                      <td className="px-3 py-3">&nbsp;</td>
                      <td className="px-3 py-3">&nbsp;</td>
                      <td className="px-3 py-3">&nbsp;</td>
                    </tr>
                  )}
                  {visibleCashBooks.map((cb, idx) => {
                    const actualIndex = visibleRange.start + idx;
                    return (
                      <CashBookRow
                        key={cb.id}
                        cashBook={cb}
                        index={actualIndex}
                        viewingArchive={!!viewingArchive}
                        formatRupiah={formatRupiah}
                        formatDateJakarta={formatDateJakarta}
                        getKategoriColor={getKategoriColor}
                        onEdit={handleOpenEditModal}
                        onEditManual={handleOpenEditManual}
                        onDelete={handleDelete}
                      />
                    );
                  })}
                  {/* Spacer untuk rows setelah visible range - hanya untuk data > 100 */}
                  {filteredCashBooks.length > 100 &&
                    visibleRange.end < filteredCashBooks.length && (
                      <tr
                        style={{
                          height: `${
                            (filteredCashBooks.length - visibleRange.end) * 60
                          }px`,
                          opacity: 0,
                          pointerEvents: "none",
                        }}
                      >
                        <td className="px-3 py-3">&nbsp;</td>
                        <td className="px-3 py-3">&nbsp;</td>
                        <td className="px-3 py-3">&nbsp;</td>
                        <td className="px-3 py-3">&nbsp;</td>
                        <td className="px-3 py-3">&nbsp;</td>
                        <td className="px-3 py-3">&nbsp;</td>
                      </tr>
                    )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {/* Modal Form */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div
            ref={editFormRef}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
          >
            <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-orange-500 to-pink-600 rounded-t-2xl">
              <h3 className="text-xl font-bold text-white">
                {editingCashBook
                  ? "✏️ Edit Transaksi"
                  : "Tambah Transaksi Baru"}
              </h3>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-[#0a1b3d] mb-2">
                  Tanggal
                </label>
                <input
                  type="date"
                  value={formData.tanggal}
                  onChange={(e) =>
                    setFormData({ ...formData, tanggal: e.target.value })
                  }
                  required
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-600 focus:border-pink-600 transition"
                  tabIndex={5}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-[#0a1b3d] mb-2">
                    Debit (Masuk)
                  </label>
                  <input
                    ref={debitInputRef}
                    type="text"
                    value={formData.debit}
                    onChange={(e) => handleDebitChange(e.target.value)}
                    disabled={!!formData.kredit}
                    className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-green-400 transition disabled:bg-gray-100 disabled:cursor-not-allowed"
                    placeholder="0"
                    tabIndex={1}
                  />
                  {formData.debit && (
                    <p className="text-xs text-green-600 mt-1">
                      {formatRupiah(parseFloat(formData.debit))}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#0a1b3d] mb-2">
                    Kredit (Keluar)
                  </label>
                  <input
                    type="text"
                    value={formData.kredit}
                    onChange={(e) => handleKreditChange(e.target.value)}
                    disabled={!!formData.debit}
                    className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-red-400 transition disabled:bg-gray-100 disabled:cursor-not-allowed"
                    placeholder="0"
                    tabIndex={2}
                  />
                  {formData.kredit && (
                    <p className="text-xs text-red-600 mt-1">
                      {formatRupiah(parseFloat(formData.kredit))}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#0a1b3d] mb-2">
                  Kategori
                </label>
                <select
                  value={formData.kategori_transaksi}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      kategori_transaksi: e.target.value as KategoriTransaksi,
                    })
                  }
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-600 focus:border-pink-600 transition"
                  tabIndex={3}
                >
                  {kategoriOptions.map((kat) => (
                    <option key={kat} value={kat}>
                      {kat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#0a1b3d] mb-2">
                  Keperluan
                </label>
                <input
                  type="text"
                  value={formData.keperluan}
                  onChange={(e) =>
                    setFormData({ ...formData, keperluan: e.target.value })
                  }
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-600 focus:border-pink-600 transition"
                  placeholder="Deskripsi transaksi..."
                  tabIndex={4}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#0a1b3d] mb-2">
                  Catatan (Opsional)
                </label>
                <textarea
                  value={formData.catatan}
                  onChange={(e) =>
                    setFormData({ ...formData, catatan: e.target.value })
                  }
                  rows={3}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-600 focus:border-pink-600 transition resize-none"
                  placeholder="Catatan tambahan..."
                  tabIndex={6}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 px-4 py-2 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-100 transition"
                  tabIndex={8}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-orange-500 to-pink-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all duration-300"
                  tabIndex={7}
                >
                  {editingCashBook ? "Update" : "Simpan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Confirm Dialog */}
      {/* Confirm Dialog */}
      {confirmDialog?.show && (
        <ConfirmDialog
          show={confirmDialog.show}
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmText={confirmDialog.confirmText}
          cancelText={confirmDialog.cancelText}
          type={confirmDialog.type}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
      {/* Import CSV Modal */}
      <ImportCsvModal
        show={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={handleImportSuccess}
      />
      {/* Delete All Modal */}
      <DeleteAllCashbookModal
        show={showDeleteAllModal}
        onClose={() => setShowDeleteAllModal(false)}
        onConfirm={handleDeleteAll}
        deleting={deleting}
      />
      {/* Edit Manual Modal */}
      <EditManualModal
        show={showEditManualModal}
        onClose={() => {
          setShowEditManualModal(false);
          setEditManualCashBook(null);
        }}
        onSuccess={handleEditManualSuccess}
        cashBook={editManualCashBook}
      />
      {/* Close Books Modal */}
      <CloseBooksModal
        show={showCloseBooksModal}
        onClose={() => setShowCloseBooksModal(false)}
        onSuccess={handleCloseBooksSuccess}
      />
      {/* Select Month Modal */}
      <SelectMonthModal
        show={showSelectMonthModal}
        onClose={() => setShowSelectMonthModal(false)}
        onSelectArchive={handleSelectArchive}
      />
      {/* Notification Toast */}
      {notice && (
        <NotificationToast type={notice.type} message={notice.message} />
      )}
    </>
  );
}
