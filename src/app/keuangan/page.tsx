"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import ToastNotifikasi, {
  NotificationToastProps,
} from "@/components/ToastNotifikasi";
import { CashBook, KategoriTransaksi } from "@/types/database";
import { getTodayJakarta, formatDateJakarta } from "@/lib/date-utils";
import ModalHapusSemuaBukuKas from "@/components/ModalHapusSemuaBukuKas";
import ModalEditManual from "@/components/ModalEditManual";
import PengaturanKeuanganModal, { type PengaturanTab } from "@/components/finance/PengaturanKeuanganModal";
import RingkasanPengurus from "@/components/finance/RingkasanPengurus";
import DialogKonfirmasi from "@/components/DialogKonfirmasi";
import { MoneyIcon } from "@/components/icons/PageIcons";
import {
  getDebtsAction,
  getReceivablesAction,
  deleteAllCashbookAction,
  deleteCashBookEntryAction,
  createCashBookEntryAction,
} from "./actions";
import {
  fetchSessionUser,
  getCachedSessionUser,
} from "@/lib/client-session";
import { useSWRConfig } from "swr";
import { useCachedData } from "@/lib/use-cached-data";
import CashBookRow from "./CashBookRow";
import ModalTransaksiKeuangan, {
  type CashBookFormData,
} from "./ModalTransaksiKeuangan";
import {
  stripReferenceId,
  resolveKategoriColor,
  adalahKategoriNonKas,
  type FinanceCategoryConfig,
} from "./keuangan-utils";


// Memoized CashBook Row Component — diekstrak ke ./CashBookRow (Fase 6 C1)

interface User {
  id: string;
  role: string;
  aktif_status: number;
}


const CASHBOOKS_CACHE_KEY = "cashbooks-active";
const FINANCE_CONFIG_CACHE_KEY = "finance-config";

type SystemMetrics = {
  omzet: number;
  biaya_operasional: number;
  biaya_bahan: number;
  saldo: number;
  laba_bersih: number;
};

type FinanceConfigPayload = {
  categories: FinanceCategoryConfig[];
};

async function fetchFinanceConfig(): Promise<FinanceConfigPayload> {
  const res = await fetch("/api/keuangan/config", { cache: "no-store" });
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
        // Mirror into SWR cache for instant paint on next visit.
        swr.mutate(CASHBOOKS_CACHE_KEY, resolved, { revalidate: false });
        return resolved;
      });
    },
    [swr]
  );
  const [totalHutang, setTotalHutang] = useState(0);
  const [hutangCount, setHutangCount] = useState(0);
  const [totalPiutang, setTotalPiutang] = useState(0);
  const [piutangCount, setPiutangCount] = useState(0);
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null);
  const [periodeLabel, setPeriodeLabel] = useState("Periode Aktif");
  const [showModal, setShowModal] = useState(false);
  const [editingCashBook, setEditingCashBook] = useState<CashBook | null>(null);
  const [formData, setFormData] = useState<CashBookFormData>({
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
  const [financeCategories, setFinanceCategories] = useState<
    FinanceCategoryConfig[]
  >(initialFinanceConfig?.categories ?? []);
  const [showPengaturanModal, setShowPengaturanModal] = useState(false);
  const [pengaturanDefaultTab, setPengaturanDefaultTab] = useState<PengaturanTab>("pengurus");
  const [actorSummaryTick, setActorSummaryTick] = useState(0);

  // Paksa RingkasanPengurus memuat ulang summary-v2 setelah transaksi berubah.
  // Kartu Saldo/Omzet/Biaya dihitung langsung dari state lokal cashBooks, tapi
  // "Bagi Hasil" adalah rumus profit-share yang dihitung server dari omzet/biaya,
  // jadi harus di-refetch tiap kali transaksi ditambah/diubah/dihapus — kalau
  // tidak, angkanya basi sampai pengguna refresh manual. RingkasanPengurus pakai
  // keepPreviousData sehingga refetch ini tidak memunculkan spinner.
  const bumpActorSummary = useCallback(() => {
    setActorSummaryTick((t) => t + 1);
  }, []);

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
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [showEditManualModal, setShowEditManualModal] = useState(false);
  const [editManualCashBook, setEditManualCashBook] = useState<CashBook | null>(
    null
  );
  const [deleting, setDeleting] = useState(false);

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

  // Kontainer tabel — dipakai untuk reset posisi scroll saat filter berubah.
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const debitInputRef = useRef<HTMLInputElement>(null);

  const kategoriOptions = useMemo(
    () =>
      (financeCategories.length > 0
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
          ]
      // Kategori non-kas (HPP/RETUR_HPP) disembunyikan dari ledger, jadi tak
      // perlu jadi opsi filter.
      ).filter((kode) => !adalahKategoriNonKas(kode)),
    [financeCategories]
  );

  // Filtered cashbooks based on kategori selection
  const filteredCashBooks = useMemo(() => {
    // Sembunyikan entri jurnal non-kas (HPP/RETUR_HPP) dari ledger — tidak
    // menggerakkan saldo dan membingungkan bila tampil di antara transaksi kas.
    // Tetap utuh di DB & tetap dihitung di kartu ringkasan + Laporan Laba Rugi.
    const visible = cashBooks.filter(
      (cb) => !adalahKategoriNonKas(cb.kategori_transaksi)
    );
    if (selectedKategoriFilters.size === 0) return visible;
    return visible.filter((cb) =>
      selectedKategoriFilters.has(cb.kategori_transaksi)
    );
  }, [cashBooks, selectedKategoriFilters]);

  // Kartu ringkasan memakai metrik kumulatif global dari API supaya saldo/omzet
  // tidak nol di awal bulan sebelum ada transaksi bulan berjalan.
  const summaryData = useMemo(() => {
    const latest = cashBooks[0];
    const biayaOperasional =
      systemMetrics?.biaya_operasional ?? latest?.biaya_operasional ?? 0;
    const biayaBahan =
      systemMetrics?.biaya_bahan ?? latest?.biaya_bahan ?? 0;

    return {
      saldo: systemMetrics?.saldo ?? latest?.saldo ?? 0,
      omzet: systemMetrics?.omzet ?? latest?.omzet ?? 0,
      biayaOperasional,
      biayaBahan,
      totalBiaya: biayaOperasional + biayaBahan,
      labaBersih: systemMetrics?.laba_bersih ?? latest?.laba_bersih ?? 0,
      hutang: totalHutang,
      hutangCount: hutangCount,
      piutang: totalPiutang,
      piutangCount: piutangCount,
    };
  }, [
    cashBooks,
    systemMetrics,
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
        router.push("/beranda");
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

  // Reset posisi scroll tabel saat filter kategori berubah.
  useEffect(() => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTop = 0;
    }
  }, [selectedKategoriFilters]);

  // Handle ESC key to close modals
  useEffect(() => {
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showPengaturanModal) setShowPengaturanModal(false);
        else if (showModal) handleCloseModal();
        else if (confirmDialog?.show) setConfirmDialog(null);
        else if (showDeleteAllModal) setShowDeleteAllModal(false);
        else if (showEditManualModal) setShowEditManualModal(false);
        else if (showKategoriDropdown) setShowKategoriDropdown(false);
      }
    };

    window.addEventListener("keydown", handleEscKey);
    return () => window.removeEventListener("keydown", handleEscKey);
  }, [
    showPengaturanModal,
    showModal,
    confirmDialog,
    showDeleteAllModal,
    showEditManualModal,
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

  const loadCashBooks = async () => {
    try {
      const res = await fetch("/api/keuangan/cash-book", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Gagal memuat data");
      setCashBooks(data.cashBooks || []);
      if (data.periodeLabel) {
        setPeriodeLabel(data.periodeLabel as string);
      }
      if (data.systemMetrics) {
        setSystemMetrics(data.systemMetrics as SystemMetrics);
      }
      loadHutangData();
      loadPiutangData();
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
          `/api/keuangan/cash-book/${editingCashBook.id}`,
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
      // Bagi Hasil (rumus server) ikut berubah → refetch ringkasan pengurus.
      bumpActorSummary();
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

  const getKategoriColor = useCallback(
    (kategori: string) => resolveKategoriColor(kategori, financeCategories),
    [financeCategories]
  );

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
          // Bagi Hasil ikut berubah → refetch ringkasan pengurus.
          bumpActorSummary();
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
      bumpActorSummary();
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

  const handleEditManualSuccess = async () => {
    showMsg("success", " Data berhasil di-override!");
    await loadCashBooks();
    bumpActorSummary();
  };

  if (loading && cashBooks.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-pink-600 border-t-transparent"></div>
          <p className="mt-4 text-[#0a1b3d] dark:text-slate-100 font-semibold">Memuat...</p>
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
                Area kerja buku kas —{" "}
                <span className="font-semibold">{periodeLabel}</span>. Riwayat
                tersedia di Laporan.
              </p>
            </div>
          </div>
          <button
            onClick={handleOpenModal}
              className="px-6 py-3 bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-300 rounded-xl font-semibold hover:shadow-xl transition-all flex items-center gap-2"
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
        </div>
      </div>
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {/* Card 1: Saldo */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-md p-4 border-l-4 border-pink-600">
          <p className="text-sm text-gray-500 dark:text-slate-400 font-semibold mb-1">Saldo</p>
          <p className="text-2xl font-bold text-pink-600">
            {formatRupiah(summaryData.saldo)}
          </p>
        </div>

        {/* Card 2: Total Omzet */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-md p-4 border-l-4 border-green-500">
          <p className="text-sm text-gray-500 dark:text-slate-400 font-semibold mb-1">
            Total Omzet
          </p>
          <p className="text-2xl font-bold text-green-600">
            {formatRupiah(summaryData.omzet)}
          </p>
        </div>

        {/* Card 3: Total Biaya (Clickable) */}
        <div
          onClick={() => setShowBiayaDetail(!showBiayaDetail)}
          className="bg-white dark:bg-slate-900 rounded-xl shadow-md p-4 border-l-4 border-red-500 cursor-pointer hover:shadow-lg transition-all duration-200"
        >
          <p className="text-sm text-gray-500 dark:text-slate-400 font-semibold mb-1 flex items-center justify-between">
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
            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-slate-800 space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-slate-300">Operasional:</span>
                <span className="text-sm font-semibold text-red-700">
                  {formatRupiah(summaryData.biayaOperasional)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-slate-300">HPP:</span>
                <span className="text-sm font-semibold text-red-700">
                  {formatRupiah(summaryData.biayaBahan)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Card 4: Payables (NEW) */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-md p-4 border-l-4 border-amber-500">
          <p className="text-sm text-gray-500 dark:text-slate-400 font-semibold mb-1">
            Tagihan Vendor
          </p>
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-300">
            {formatRupiah(summaryData.hutang)}
          </p>
          {summaryData.hutangCount > 0 && (
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
              {summaryData.hutangCount} pembelian
            </p>
          )}
        </div>

        {/* Card 5: Receivables */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-md p-4 border-l-4 border-blue-500">
          <p className="text-sm text-gray-500 dark:text-slate-400 font-semibold mb-1">
            Piutang Pelanggan
          </p>
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-300">
            {formatRupiah(summaryData.piutang)}
          </p>
          {summaryData.piutangCount > 0 && (
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
              {summaryData.piutangCount} penjualan
            </p>
          )}
        </div>
      </div>
      {/* Pengurus Usaha — RingkasanPengurus + transaksi_terhitung */}
      {currentUser &&
        (currentUser.role === "admin" ||
          currentUser.role === "manager" ||
          currentUser.role === "staff") && (
          <RingkasanPengurus
            formatRupiah={formatRupiah}
            refreshKey={actorSummaryTick}
            onOpenPeopleSettings={() => {
              setPengaturanDefaultTab("pengurus");
              setShowPengaturanModal(true);
            }}
          />
        )}
      {/* Toolbar for Cash Book Management - Moved here */}
      <div className="mb-6 bg-white dark:bg-slate-900 rounded-xl shadow-md p-4 border border-gray-200 dark:border-slate-800">
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
              <div className="absolute z-50 mt-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-lg shadow-lg min-w-[200px] max-h-[400px] overflow-y-auto">
                <div className="p-2 border-b border-gray-200 dark:border-slate-800 flex gap-2">
                  <button
                    onClick={() => {
                      const allKats = new Set(kategoriOptions);
                      setSelectedKategoriFilters(allKats);
                    }}
                    className="flex-1 text-xs px-2 py-1 bg-cyan-50 dark:bg-slate-800 text-cyan-700 rounded hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                  >
                    Pilih Semua
                  </button>
                  <button
                    onClick={() => {
                      setSelectedKategoriFilters(new Set());
                    }}
                    className="flex-1 text-xs px-2 py-1 bg-gray-50 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                  >
                    Bersihkan
                  </button>
                </div>
                {kategoriOptions.map((kat) => {
                  const isSelected = selectedKategoriFilters.has(kat);
                  return (
                    <label
                      key={kat}
                      className="flex items-center gap-2 px-4 py-2 hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer transition-colors"
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
            Hapus Semua
          </button>
          <div className="ml-auto">
            <div className="bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 text-sm font-semibold px-4 py-2 rounded-lg shadow-inner flex items-center gap-2">
              <>{filteredCashBooks.length} Transaksi {periodeLabel}</>
            </div>
          </div>
        </div>
      </div>
      {/* Table Section */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg overflow-hidden">
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
                    className="px-4 py-8 text-center text-gray-500 dark:text-slate-400"
                  >
                    {selectedKategoriFilters.size > 0
                      ? `Tidak ada transaksi dengan kategori yang dipilih.`
                      : 'Belum ada transaksi. Klik "Tambah Transaksi" untuk memulai.'}
                  </td>
                </tr>
              ) : (
                <>
                  {filteredCashBooks.map((cb, idx) => (
                    <CashBookRow
                      key={cb.id}
                      cashBook={cb}
                      index={idx}
                      viewingArchive={false}
                      formatRupiah={formatRupiah}
                      formatDateJakarta={formatDateJakarta}
                      getKategoriColor={getKategoriColor}
                      kategoriLabelMap={kategoriLabelMap}
                      onEdit={handleOpenEditModal}
                      onEditManual={handleOpenEditManual}
                      onDelete={handleDelete}
                    />
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <ModalTransaksiKeuangan
        open={showModal}
        isEditing={!!editingCashBook}
        formData={formData}
        setFormData={setFormData}
        onClose={handleCloseModal}
        onSubmit={handleSubmit}
        onDebitChange={handleDebitChange}
        onKreditChange={handleKreditChange}
        debitInputRef={debitInputRef}
        formatRupiah={formatRupiah}
        kategoriOptions={kategoriOptions}
        kategoriLabelMap={kategoriLabelMap}
      />
      {/* Confirm Dialog */}
      {/* Confirm Dialog */}
      {confirmDialog?.show && (
        <DialogKonfirmasi
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
      {/* Delete All Modal */}
      <ModalHapusSemuaBukuKas
        show={showDeleteAllModal}
        onClose={() => setShowDeleteAllModal(false)}
        onConfirm={handleDeleteAll}
        deleting={deleting}
      />
      {/* Edit Manual Modal */}
      <ModalEditManual
        show={showEditManualModal}
        onClose={() => {
          setShowEditManualModal(false);
          setEditManualCashBook(null);
        }}
        onSuccess={handleEditManualSuccess}
        cashBook={editManualCashBook}
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
        <ToastNotifikasi type={notice.type} message={notice.message} />
      )}
    </>
  );
}
