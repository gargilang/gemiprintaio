"use client";

import { useEffect, useState, useRef, useMemo, useCallback, memo } from "react";
import { useRouter } from "next/navigation";
import MainShell from "@/components/MainShell";
import { NotificationToastProps } from "@/components/NotificationToast";
import { CashBook, KategoriTransaksi } from "@/types/database";
import { getTodayJakarta, formatDateJakarta } from "@/lib/date-utils";
import ImportCsvModal from "@/components/ImportCsvModal";
import DeleteAllCashbookModal from "@/components/DeleteAllCashbookModal";
import EditManualModal from "@/components/EditManualModal";
import CloseBooksModal from "@/components/CloseBooksModal";
import SelectMonthModal from "@/components/SelectMonthModal";

// Memoized CashBook Row Component - mencegah re-render yang tidak perlu
const CashBookRow = memo(
  ({
    cashBook,
    index,
    isDragging,
    isDragOver,
    viewingArchive,
    formatRupiah,
    formatDateJakarta,
    getKategoriColor,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop,
    onDragEnd,
    onEdit,
    onEditManual,
    onDelete,
  }: {
    cashBook: CashBook;
    index: number;
    isDragging: boolean;
    isDragOver: boolean;
    viewingArchive: boolean;
    formatRupiah: (amount: number) => string;
    formatDateJakarta: (date: string) => string;
    getKategoriColor: (kategori: KategoriTransaksi) => {
      bg: string;
      text: string;
      border: string;
    };
    onDragStart: (e: React.DragEvent, index: number) => void;
    onDragOver: (e: React.DragEvent, index: number) => void;
    onDragLeave: () => void;
    onDrop: (e: React.DragEvent, index: number) => void;
    onDragEnd: () => void;
    onEdit: (cb: CashBook) => void;
    onEditManual: (cb: CashBook) => void;
    onDelete: (cb: CashBook) => void;
  }) => {
    const kategoriColor = getKategoriColor(cashBook.kategori_transaksi);

    return (
      <tr
        draggable={!viewingArchive}
        onDragStart={!viewingArchive ? (e) => onDragStart(e, index) : undefined}
        onDragOver={!viewingArchive ? (e) => onDragOver(e, index) : undefined}
        onDragLeave={!viewingArchive ? onDragLeave : undefined}
        onDrop={!viewingArchive ? (e) => onDrop(e, index) : undefined}
        onDragEnd={!viewingArchive ? onDragEnd : undefined}
        className={`
          hover:bg-purple-50 transition-all ${
            !viewingArchive ? "cursor-move" : "cursor-default"
          }
          ${index % 2 === 0 ? "bg-white" : "bg-gray-50"}
          ${!viewingArchive && isDragging ? "opacity-40 bg-blue-100" : ""}
          ${!viewingArchive && isDragOver ? "border-t-4 border-purple-500" : ""}
        `}
        title="Drag untuk mengubah urutan"
      >
        <td className="px-3 py-3 text-sm text-gray-700 whitespace-nowrap">
          <div className="flex items-center gap-2">
            <span className="text-gray-400 cursor-grab active:cursor-grabbing">
              ⋮⋮
            </span>
            {formatDateJakarta(cashBook.tanggal)}
          </div>
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
          {cashBook.keperluan || "-"}
        </td>
        <td className="px-3 py-3 text-sm text-right font-bold text-blue-600">
          {formatRupiah(cashBook.saldo)}
        </td>
        <td className="px-3 py-3 text-center">
          <div className="flex gap-2 justify-center">
            {!viewingArchive ? (
              <>
                <button
                  onClick={() => onEdit(cashBook)}
                  className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors inline-flex items-center justify-center"
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
  const [showModal, setShowModal] = useState(false);
  const [editingCashBook, setEditingCashBook] = useState<CashBook | null>(null);
  const [formData, setFormData] = useState({
    tanggal: getTodayJakarta(),
    kategori_transaksi: "KAS" as KategoriTransaksi,
    debit: "",
    kredit: "",
    keperluan: "",
    notes: "",
  });
  const [notice, setNotice] = useState<NotificationToastProps | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    show: boolean;
    title: string;
    message: string;
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

  // Drag & Drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Virtualization state - untuk performance dengan banyak rows
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 50 });
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const debitInputRef = useRef<HTMLInputElement>(null);

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

  // Visible cashbooks - hanya render yang terlihat (virtualization)
  const visibleCashBooks = useMemo(() => {
    if (cashBooks.length <= 50) return cashBooks; // No virtualization for small lists
    return cashBooks.slice(visibleRange.start, visibleRange.end);
  }, [cashBooks, visibleRange]);

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
      };
    }

    // Untuk arsip, ambil dari transaksi terakhir (index terakhir) karena sudah di-sort DESC
    // Untuk data aktif, ambil dari transaksi pertama (latest)
    // Transaksi terakhir di array adalah yang memiliki nilai kumulatif akhir periode
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
    };
  }, [cashBooks, viewingArchive]);

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
      const end = Math.min(cashBooks.length, start + visibleRows + buffer * 2);

      setVisibleRange({ start, end });
    };

    const container = tableContainerRef.current;
    if (container) {
      container.addEventListener("scroll", handleScroll);
      handleScroll(); // Initial calculation
      return () => container.removeEventListener("scroll", handleScroll);
    }
  }, [cashBooks.length]);

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
  ]);

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
    } catch (err) {
      console.error("Gagal memuat cash books:", err);
      showMsg("error", "Tidak bisa memuat data buku keuangan dari database.");
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
      notes: "",
    });
    setShowModal(true);
    // Focus on debit input after modal opens
    setTimeout(() => {
      debitInputRef.current?.focus();
    }, 100);
  };

  const handleOpenEditModal = (cashBook: CashBook) => {
    setEditingCashBook(cashBook);
    setFormData({
      tanggal: cashBook.tanggal,
      kategori_transaksi: cashBook.kategori_transaksi,
      debit: cashBook.debit ? cashBook.debit.toString() : "",
      kredit: cashBook.kredit ? cashBook.kredit.toString() : "",
      keperluan: cashBook.keperluan || "",
      notes: cashBook.notes || "",
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
      notes: "",
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
              notes: formData.notes,
            }),
          }
        );

        const data = await res.json();
        if (!res.ok)
          throw new Error(data?.error || "Gagal mengupdate transaksi");

        showMsg("success", " Transaksi berhasil diupdate!");
      } else {
        // Create new transaction
        const res = await fetch("/api/finance/cash-book", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tanggal: formData.tanggal,
            kategori_transaksi: formData.kategori_transaksi,
            debit: debitVal,
            kredit: kreditVal,
            keperluan: formData.keperluan,
            notes: formData.notes,
            created_by: currentUser?.id,
          }),
        });

        const data = await res.json();
        if (!res.ok)
          throw new Error(data?.error || "Gagal menambahkan transaksi");

        showMsg("success", " Transaksi berhasil ditambahkan!");
      }

      handleCloseModal();
      await loadCashBooks();
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
    setConfirmDialog({
      show: true,
      title: "Hapus Transaksi",
      message: `Yakin ingin menghapus transaksi berikut?\n\nKategori: ${
        cashBook.kategori_transaksi
      }\nKeperluan: ${cashBook.keperluan || "-"}\nTanggal: ${formatDateJakarta(
        cashBook.tanggal
      )}\n\nData akan dikalkulasi ulang otomatis setelah penghapusan.`,
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const res = await fetch(`/api/finance/cash-book/${cashBook.id}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
          });
          const data = await res.json();
          if (!res.ok)
            throw new Error(data?.error || "Gagal menghapus transaksi");

          showMsg(
            "success",
            " Transaksi berhasil dihapus dan data telah dikalkulasi ulang!"
          );
          await loadCashBooks();
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
      const res = await fetch("/api/cashbook/delete-all", {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Gagal menghapus data");

      showMsg("success", `✓ ${data.message}`);
      setShowDeleteAllModal(false);
      await loadCashBooks();
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
    setEditManualCashBook(cashBook);
    setShowEditManualModal(true);
  };

  const handleImportSuccess = async () => {
    showMsg("success", " Data berhasil diimport!");
    await loadCashBooks();
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
      showMsg("success", `Menampilkan arsip: ${archive.label}`);
    } catch (err) {
      console.error("Gagal memuat arsip:", err);
      showMsg("error", "Tidak bisa memuat arsip");
    }
  };

  // Drag & Drop Handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();

    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    // Reorder the array
    const reordered = [...cashBooks];
    const [removed] = reordered.splice(draggedIndex, 1);
    reordered.splice(dropIndex, 0, removed);

    // Update local state immediately for smooth UX
    setCashBooks(reordered);
    setDraggedIndex(null);
    setDragOverIndex(null);

    // Send new order to server
    try {
      const reorderedIds = reordered.map((cb) => cb.id);
      const res = await fetch("/api/cashbook/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reorderedIds }),
      });

      if (!res.ok) {
        throw new Error("Gagal menyimpan urutan baru");
      }

      showMsg("success", " Urutan berhasil diubah dan dihitung ulang!");
      await loadCashBooks(); // Reload to get recalculated values
    } catch (err) {
      console.error(err);
      showMsg("error", "Gagal menyimpan urutan baru");
      // Reload to revert to correct state
      await loadCashBooks();
    }
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-purple-600 border-t-transparent"></div>
          <p className="mt-4 text-[#0a1b3d] font-semibold">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <MainShell title="Buku Keuangan" notice={notice}>
      {/* Header Section */}
      <div className="bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 rounded-2xl shadow-lg p-6 mb-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-1 font-twcenmt">
              💰 Manajemen Buku Keuangan
            </h2>
            <p className="text-white/90 text-sm">
              {viewingArchive
                ? `Melihat Arsip: ${viewingArchive}`
                : "Kelola transaksi dan buku kas perusahaan"}
            </p>
          </div>
          {!viewingArchive && (
            <button
              onClick={handleOpenModal}
              className="bg-white text-purple-700 px-6 py-3 rounded-xl font-bold hover:bg-gray-100 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 flex items-center gap-2"
            >
              <span className="text-xl">+</span>
              Tambah Transaksi
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Card 1: Saldo */}
        <div className="bg-white rounded-xl shadow-md p-4 border-l-4 border-blue-500">
          <p className="text-sm text-gray-500 font-semibold mb-1">Saldo</p>
          <p className="text-2xl font-bold text-blue-600">
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
              <span className="text-sm font-bold text-gray-700">
                💼 Bagi Hasil
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
                    <span>💼 Bagi Hasil Anwar</span>
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
                    <span>💼 Bagi Hasil Suri</span>
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
                    <span>💼 Bagi Hasil Gemi</span>
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
              <span className="text-sm font-bold text-gray-700">
                👤 Kasbon Karyawan
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
                  <p className="text-sm font-bold text-violet-800 mb-2">
                    👤 Kasbon Cahaya
                  </p>
                  <p className="text-2xl font-bold text-violet-900">
                    {formatRupiah(summaryData.kasbonCahaya)}
                  </p>
                </div>
                <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl shadow-md p-4 border-2 border-emerald-200">
                  <p className="text-sm font-bold text-emerald-800 mb-2">
                    👤 Kasbon Dinil
                  </p>
                  <p className="text-2xl font-bold text-emerald-900">
                    {formatRupiah(summaryData.kasbonDinil)}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

      {/* Toolbar for Cash Book Management - Moved here */}
      <div className="mb-6 bg-white rounded-xl shadow-md p-4 border border-gray-200">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setShowImportModal(true)}
            disabled={!!viewingArchive}
            className={`${
              viewingArchive
                ? "bg-gray-300 cursor-not-allowed"
                : "bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
            } text-white px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 shadow-sm`}
          >
            <span className="text-lg">📥</span>
            Import CSV
          </button>
          <button
            onClick={() => setShowDeleteAllModal(true)}
            disabled={!!viewingArchive}
            className={`${
              viewingArchive
                ? "bg-gray-300 cursor-not-allowed"
                : "bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700"
            } text-white px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 shadow-sm`}
          >
            <span className="text-lg">🗑️</span>
            Delete All
          </button>
          <button
            onClick={() => setShowCloseBooksModal(true)}
            disabled={!!viewingArchive}
            className={`${
              viewingArchive
                ? "bg-gray-300 cursor-not-allowed"
                : "bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700"
            } text-white px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 shadow-sm`}
          >
            <span className="text-lg">📚</span>
            Tutup Buku
          </button>
          <button
            onClick={() => setShowSelectMonthModal(true)}
            className="bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 shadow-sm"
          >
            <span className="text-lg">📅</span>
            Pilih Bulan
          </button>
          {viewingArchive && (
            <button
              onClick={() => loadCashBooks()}
              className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 shadow-sm"
            >
              <span className="text-lg">🔙</span>
              Kembali ke Aktif
            </button>
          )}
          <div className="ml-auto">
            <div className="bg-gray-100 text-gray-700 text-sm font-semibold px-4 py-2 rounded-lg shadow-inner">
              {viewingArchive ? (
                <>
                  📦 {viewingArchive} ({cashBooks.length} Transaksi)
                </>
              ) : (
                <>{cashBooks.length} Transaksi Aktif</>
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
            <thead className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 text-white sticky top-0 z-10">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-bold uppercase whitespace-nowrap w-28">
                  Tanggal
                </th>
                <th className="px-3 py-3 text-left text-xs font-bold uppercase w-28">
                  Kategori
                </th>
                <th className="px-3 py-3 text-right text-xs font-bold uppercase w-28">
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
              {cashBooks.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-gray-500"
                  >
                    Belum ada transaksi. Klik "Tambah Transaksi" untuk memulai.
                  </td>
                </tr>
              ) : (
                <>
                  {/* Spacer untuk rows sebelum visible range - dengan konten agar table tidak collapse */}
                  {visibleRange.start > 0 && (
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
                  {/* Render visible rows */}
                  {visibleCashBooks.map((cb, relativeIndex) => {
                    const actualIndex =
                      cashBooks.length <= 50
                        ? relativeIndex
                        : visibleRange.start + relativeIndex;
                    return (
                      <CashBookRow
                        key={cb.id}
                        cashBook={cb}
                        index={actualIndex}
                        isDragging={draggedIndex === actualIndex}
                        isDragOver={dragOverIndex === actualIndex}
                        viewingArchive={!!viewingArchive}
                        formatRupiah={formatRupiah}
                        formatDateJakarta={formatDateJakarta}
                        getKategoriColor={getKategoriColor}
                        onDragStart={handleDragStart}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onDragEnd={handleDragEnd}
                        onEdit={handleOpenEditModal}
                        onEditManual={handleOpenEditManual}
                        onDelete={handleDelete}
                      />
                    );
                  })}
                  {/* Spacer untuk rows setelah visible range - dengan konten agar table tidak collapse */}
                  {cashBooks.length > 50 &&
                    visibleRange.end < cashBooks.length && (
                      <tr
                        style={{
                          height: `${
                            (cashBooks.length - visibleRange.end) * 60
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600">
              <h3 className="text-xl font-bold text-white">
                {editingCashBook ? "Edit Transaksi" : "Tambah Transaksi Baru"}
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
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition"
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
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition"
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
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition"
                  placeholder="Deskripsi transaksi..."
                  tabIndex={4}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#0a1b3d] mb-2">
                  Catatan (Opsional)
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                  rows={3}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition resize-none"
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
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all duration-300"
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
      {confirmDialog?.show && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-red-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-[#0a1b3d]">
                  {confirmDialog.title}
                </h3>
              </div>
            </div>

            <div className="p-6">
              <p className="text-[#6b7280] text-base leading-relaxed whitespace-pre-line">
                {confirmDialog.message}
              </p>
            </div>

            <div className="p-6 border-t border-gray-200 flex gap-3">
              <button
                onClick={() => setConfirmDialog(null)}
                className="flex-1 px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-all font-semibold"
              >
                Batal
              </button>
              <button
                onClick={confirmDialog.onConfirm}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl hover:shadow-lg hover:from-red-600 hover:to-red-700 transition-all font-semibold"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
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
    </MainShell>
  );
}
