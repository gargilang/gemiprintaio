"use client";

import { useEffect, useState, useRef, useMemo, useCallback, memo } from "react";
import { useRouter } from "next/navigation";
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
import ModalFormShell from "@/components/ModalFormShell";
import PengaturanKeuanganModal, { type PengaturanTab } from "@/components/finance/PengaturanKeuanganModal";
import DynamicActorSummary from "@/components/finance/DynamicActorSummary";
import ConfirmDialog from "@/components/ConfirmDialog";
import { MoneyIcon } from "@/components/icons/PageIcons";
import { BoxIcon, CheckIcon } from "@/components/icons/ContentIcons";
import {
  getDebtsAction,
  getReceivablesAction,
  deleteAllCashbookAction,
  deleteCashBookEntryAction,
  restoreArchivedTransactionsAction,
  importCashbookFromCSVAction,
  createCashBookEntryAction,
  getArchivedPeriodsAction,
  archiveCashbookAction,
} from "./actions";
import {
  fetchSessionUser,
  getCachedSessionUser,
} from "@/lib/client-session";
import { useSWRConfig } from "swr";
import { useCachedData } from "@/lib/use-cached-data";

// Helper function to strip [REF:xxx] from display while keeping it in database
const stripReferenceId = (text: string | null | undefined): string => {
  if (!text) return "";
  return text.replace(/\s*\[REF:[^\]]+\]/g, "").trim();
};


// Memoized CashBook Row Component — avoids unnecessary re-renders
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
  role: string;
  aktif_status: number;
}

interface FinanceCategoryConfig {
  id?: string;
  category_code: string;
  display_name: string;
  color_bg: string;
  color_text: string;
  color_border: string;
  metric_contributions?: unknown;
}


const CASHBOOKS_CACHE_KEY = "cashbooks-active";
const FINANCE_CONFIG_CACHE_KEY = "finance-config";

type FinanceConfigPayload = {
  categories: FinanceCategoryConfig[];
};

async function fetchFinanceConfig(): Promise<FinanceConfigPayload> {
  const res = await fetch("/api/finance/config", { cache: "no-store" });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Gagal memuat konfigurasi");
  return { categories: data.categories || [] };
}

export default function FinancePage() {
  const router = useRouter();
  const swr = useSWRConfig();
  const initialUser =
    typeof window !== "undefined"
      ? (getCachedSessionUser() as User | null)
      : null;
  const initialCashBooks =
    typeof window !== "undefined"
      ? (((swr.cache.get(CASHBOOKS_CACHE_KEY) as { data?: CashBook[] } | undefined)
          ?.data ?? []) as CashBook[])
      : [];
  const initialFinanceConfig =
    typeof window !== "undefined"
      ? (
          swr.cache.get(FINANCE_CONFIG_CACHE_KEY) as
            | { data?: FinanceConfigPayload }
            | undefined
        )?.data
      : undefined;
  const [currentUser, setCurrentUser] = useState<User | null>(initialUser);
  const [loading, setLoading] = useState(initialUser === null);
  const [cashBooks, setCashBooksState] =
    useState<CashBook[]>(initialCashBooks);
  const setCashBooks = useCallback<
    (next: CashBook[] | ((prev: CashBook[]) => CashBook[])) => void
  >(
    (next) => {
      setCashBooksState((prev) => {
        const resolved =
          typeof next === "function"
            ? (next as (p: CashBook[]) => CashBook[])(prev)
            : next;
        // Mirror into SWR cache only when we are viewing the active (non-archive) table.
        if (!viewingArchiveRef.current) {
          swr.mutate(CASHBOOKS_CACHE_KEY, resolved, { revalidate: false });
        }
        return resolved;
      });
    },
    [swr]
  );
  const viewingArchiveRef = useRef<string | null>(null);
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
  const [showKasDetail, setShowKasDetail] = useState(false);
  const [systemMetrics, setSystemMetrics] = useState<{
    modal_kas: number;
    piutang_kas: number;
    kas: number;
  }>({ modal_kas: 0, piutang_kas: 0, kas: 0 });
  const [financeCategories, setFinanceCategories] = useState<
    FinanceCategoryConfig[]
  >(initialFinanceConfig?.categories ?? []);
  const [showPengaturanModal, setShowPengaturanModal] = useState(false);
  const [pengaturanDefaultTab, setPengaturanDefaultTab] = useState<PengaturanTab>("pengurus");
  const [actorSummaryTick, setActorSummaryTick] = useState(0);
  const [lastCashBookLoadAt, setLastCashBookLoadAt] = useState(0);

  const applyFinanceConfig = useCallback(
    (data: FinanceConfigPayload) => {
      setFinanceCategories(data.categories);
      swr.mutate(FINANCE_CONFIG_CACHE_KEY, data, { revalidate: false });
    },
    [swr]
  );

  const { refresh: refreshFinanceConfig } = useCachedData<FinanceConfigPayload>(
    FINANCE_CONFIG_CACHE_KEY,
    fetchFinanceConfig,
    { onSuccess: applyFinanceConfig }
  );

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

  // Fetch system metrics (Modal Kas, Piutang Kas, Kas) for archive view only.
  // For active view, /api/finance/cash-book already returns systemMetrics
  // alongside the rows so we avoid a second round-trip.
  // These come from cashbook_formula via transaction_computed and aren't
  // available on the raw `keuangan` rows.
  useEffect(() => {
    if (!viewingArchive) return;
    let cancelled = false;
    const url = `/api/finance/summary-v2?month=${encodeURIComponent(viewingArchive)}`;
    fetch(url)
      .then((r) => r.json())
      .then((body: { systemMetrics?: { modal_kas: number; piutang_kas: number; kas: number } }) => {
        if (cancelled) return;
        if (body.systemMetrics) setSystemMetrics(body.systemMetrics);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [actorSummaryTick, viewingArchive]);
  const [currentArchiveInfo, setCurrentArchiveInfo] = useState<{
    label: string;
    archived_at: string;
  } | null>(null);

  // Keep ref in sync so setCashBooks knows whether to mirror to SWR cache.
  useEffect(() => {
    viewingArchiveRef.current = viewingArchive;
  }, [viewingArchive]);

  // Helper function to update a single cashbook in state without reloading
  function updateCashBookInState(updated: CashBook) {
    setCashBooks((prev) =>
      prev.map((cb) => (cb.id === updated.id ? { ...cb, ...updated } : cb))
    );
  }

  // Filter state — multi-select with checkboxes
  const [selectedKategoriFilters, setSelectedKategoriFilters] = useState<
    Set<string>
  >(new Set());
  const [showKategoriDropdown, setShowKategoriDropdown] = useState(false);

  // Virtualization state — for performance with many rows
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 50 });
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const debitInputRef = useRef<HTMLInputElement>(null);

  const kategoriOptions = useMemo(
    () =>
      financeCategories.length > 0
        ? financeCategories.map((x) => x.category_code)
        : [
            "KAS",
            "BIAYA",
            "OMZET",
            "INVESTOR",
            "SUBSIDI",
            "LUNAS",
            "SUPPLY",
            "HPP",
            "LABA",
            "KOMISI",
            "TABUNGAN",
            "HUTANG",
            "PIUTANG",
            "PRIBADI-A",
            "PRIBADI-S",
          ],
    [financeCategories]
  );

  // Filtered cashbooks based on kategori selection
  const filteredCashBooks = useMemo(() => {
    if (selectedKategoriFilters.size === 0) return cashBooks;
    return cashBooks.filter((cb) =>
      selectedKategoriFilters.has(cb.kategori_transaksi)
    );
  }, [cashBooks, selectedKategoriFilters]);

  // Visible cashbooks — only render visible rows (virtualization)
  const visibleCashBooks = useMemo(() => {
    // Disable virtualization for lists with <= 100 items to avoid scrollbar issues
    if (filteredCashBooks.length <= 100) return filteredCashBooks;
    return filteredCashBooks.slice(visibleRange.start, visibleRange.end);
  }, [filteredCashBooks, visibleRange]);

  // Memoized summary values — recalculate once per cashBooks change.
  // Reads the cumulative metrics from the latest visible row's hardcoded
  // columns. The new transaction_computed-backed feed handles per-actor
  // metrics; this block only powers the four cards at the top of the page.
  const summaryData = useMemo(() => {
    if (cashBooks.length === 0) {
      return {
        saldo: 0,
        omzet: 0,
        biayaOperasional: 0,
        biayaBahan: 0,
        totalBiaya: 0,
        labaBersih: 0,
        hutang: totalHutang,
        hutangCount: hutangCount,
        piutang: totalPiutang,
        piutangCount: piutangCount,
      };
    }

    // Active data: index 0 (highest display_order = newest transaction).
    // Archive: last index (lowest display_order = last transaction in period).
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

  const kategoriLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const category of financeCategories) {
      map.set(category.category_code, category.display_name);
    }
    return map;
  }, [financeCategories]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const user = await fetchSessionUser();
      if (cancelled) return;
      if (!user) {
        router.push("/auth/login");
        return;
      }

      if (
        user.role !== "admin" &&
        user.role !== "manager" &&
        user.role !== "staff"
      ) {
        router.push("/dashboard");
        return;
      }

      setCurrentUser({
        id: user.id,
        role: user.role,
        aktif_status: user.aktif_status,
      });
      setLoading(false);
      // Always refresh active cashbooks on mount. The cached snapshot is shown
      // instantly while this network refresh fills in any new transactions.
      loadCashBooks();
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // Scroll handler for lazy-loading rows (virtualization)
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
        if (showPengaturanModal) setShowPengaturanModal(false);
        else if (showModal) handleCloseModal();
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
    showPengaturanModal,
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
      // /api/finance/cash-book also returns systemMetrics (kas, modal_kas,
      // piutang_kas) computed by the AST engine via transaction_computed.
      // Reading them from the same response avoids a separate /summary-v2
      // round-trip and keeps the Kas card in sync with the table data.
      if (data.systemMetrics) {
        setSystemMetrics({
          modal_kas: data.systemMetrics.modal_kas ?? 0,
          piutang_kas: data.systemMetrics.piutang_kas ?? 0,
          kas: data.systemMetrics.kas ?? 0,
        });
      }

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
      const debts = await getDebtsAction();
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
      const receivables = await getReceivablesAction();
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
        await createCashBookEntryAction({
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

  const getKategoriColor = useCallback((kategori: string) => {
    const dynamicCategory = financeCategories.find(
      (item) => item.category_code === kategori
    );
    if (dynamicCategory) {
      return {
        bg: dynamicCategory.color_bg,
        text: dynamicCategory.color_text,
        border: dynamicCategory.color_border,
      };
    }

    const colors: Record<
      string,
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
      HPP: {
        bg: "bg-slate-100",
        text: "text-slate-800",
        border: "border-slate-300",
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
  }, [financeCategories]);

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
        )}\n\nUntuk membatalkan transaksi ini:\n\n1. Buka halaman PEMBELIAN\n2. Klik tombol Batalkan pada Daftar Pembelian\n3. Jika pembelian sudah punya pelunasan tagihan, lakukan Revert pembayaran dulu`,
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
        )}\n\nUntuk membatalkan transaksi ini:\n\n1. Buka halaman POS\n2. Scroll ke bagian RIWAYAT PENJUALAN\n3. Cari transaksi yang ingin dibatalkan\n4. Klik tombol Batalkan pada transaksi tersebut\n\nTransaksi akan ditandai VOID dan stok dikembalikan lewat jurnal pembalik.`,
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
          await deleteCashBookEntryAction(cashBook.id);

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
      await deleteAllCashbookAction();
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
          await restoreArchivedTransactionsAction(
            currentArchiveInfo.label,
            currentArchiveInfo.archived_at
          );

          showMsg(
            "success",
            `Transaksi berhasil dikembalikan dari "${currentArchiveInfo.label}"`
          );

          // Return to active table and reload
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

  if (loading && cashBooks.length === 0) {
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
        {/* Card 0: Kas (Clickable, expandable to Modal Kas + Piutang Kas) */}
        <div
          onClick={() => setShowKasDetail(!showKasDetail)}
          className="bg-white rounded-xl shadow-md p-4 border-l-4 border-cyan-500 cursor-pointer hover:shadow-lg transition-all duration-200"
        >
          <p className="text-sm text-gray-500 font-semibold mb-1 flex items-center justify-between">
            <span>Kas</span>
            <svg
              className={`w-5 h-5 transform transition-transform ${
                showKasDetail ? "rotate-180" : ""
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
          <p className="text-2xl font-bold text-cyan-700">
            {formatRupiah(systemMetrics.kas)}
          </p>
          {showKasDetail && (
            <div className="mt-3 pt-3 border-t border-gray-200 space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Modal Kas:</span>
                <span className="text-sm font-semibold text-cyan-700">
                  {formatRupiah(systemMetrics.modal_kas)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Piutang Kas:</span>
                <span className="text-sm font-semibold text-cyan-700">
                  {formatRupiah(systemMetrics.piutang_kas)}
                </span>
              </div>
            </div>
          )}
        </div>

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
                <span className="text-sm text-gray-600">HPP:</span>
                <span className="text-sm font-semibold text-red-700">
                  {formatRupiah(summaryData.biayaBahan)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Card 4: Payables (NEW) */}
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

        {/* Card 5: Receivables */}
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
      {/* Pengurus Usaha — DynamicActorSummary + transaction_computed */}
      {currentUser &&
        (currentUser.role === "admin" ||
          currentUser.role === "manager" ||
          currentUser.role === "staff") && (
          <DynamicActorSummary
            formatRupiah={formatRupiah}
            month={viewingArchive ?? undefined}
            refreshKey={`${actorSummaryTick}-${lastCashBookLoadAt}`}
            onOpenPeopleSettings={() => {
              setPengaturanDefaultTab("pengurus");
              setShowPengaturanModal(true);
            }}
          />
        )}
      {/* Toolbar for Cash Book Management - Moved here */}
      <div className="mb-6 bg-white rounded-xl shadow-md p-4 border border-gray-200">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Category filter dropdown with checkbox */}
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
                        {kategoriLabelMap.get(kat) || kat}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {!viewingArchive && (
            <>
              {(currentUser?.role === "admin" ||
                currentUser?.role === "manager" ||
                currentUser?.role === "staff") && (
                <button
                  onClick={() => { setPengaturanDefaultTab("kolom"); setShowPengaturanModal(true); }}
                  className="bg-gradient-to-r from-slate-600 to-slate-800 hover:from-slate-700 hover:to-slate-900 text-white px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 shadow-sm"
                  title="Kelola pengurus, kategori transaksi, dan rumus kalkulasi"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Pengaturan
                </button>
              )}
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
                  {/* Spacer before visible range — only when data > 100 */}
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
                  {/* Spacer after visible range — only when data > 100 */}
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
      <ModalFormShell
        open={showModal}
        onClose={handleCloseModal}
        maxWidthClass="max-w-md"
        header={
          <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-orange-500 to-pink-600 flex items-center justify-between shrink-0 gap-3 rounded-t-2xl">
            <h3 className="text-xl font-bold text-white min-w-0">
              {editingCashBook
                ? "✏️ Edit Transaksi"
                : "Tambah Transaksi Baru"}
            </h3>
            <button
              type="button"
              onClick={handleCloseModal}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors shrink-0"
              aria-label="Tutup"
            >
              <svg
                className="w-6 h-6 text-white"
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
        }
        footer={
          <div className="bg-gray-50 px-6 py-4 flex items-center justify-end gap-3 border-t border-gray-200 shrink-0">
            <button
              type="button"
              onClick={handleCloseModal}
              className="px-6 py-2 bg-white border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-100 transition"
              tabIndex={8}
            >
              Batal
            </button>
            <button
              type="submit"
              form="finance-cashbook-form"
              className="px-6 py-2 bg-gradient-to-r from-orange-500 to-pink-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all duration-300"
              tabIndex={7}
            >
              Simpan
            </button>
          </div>
        }
      >
            <form
              id="finance-cashbook-form"
              onSubmit={handleSubmit}
              className="p-6 space-y-4"
            >
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
                      {kategoriLabelMap.get(kat) || kat}
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

            </form>
      </ModalFormShell>
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
        onImportCsv={importCashbookFromCSVAction}
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
        onArchiveCashbook={archiveCashbookAction}
      />
      {/* Select Month Modal */}
      <SelectMonthModal
        show={showSelectMonthModal}
        onClose={() => setShowSelectMonthModal(false)}
        onSelectArchive={handleSelectArchive}
        onGetArchivedPeriods={getArchivedPeriodsAction}
      />
      {/* Pengaturan Keuangan — combined settings modal */}
      <PengaturanKeuanganModal
        open={showPengaturanModal}
        onClose={() => setShowPengaturanModal(false)}
        defaultTab={pengaturanDefaultTab}
        onCategoriesChanged={() => void refreshFinanceConfig()}
        onActorsChanged={() => setActorSummaryTick((t) => t + 1)}
        onRecalcTriggered={() => {
          setActorSummaryTick((t) => t + 1);
          void loadCashBooks();
        }}
      />
      {/* Notification Toast */}
      {notice && (
        <NotificationToast type={notice.type} message={notice.message} />
      )}
    </>
  );
}
