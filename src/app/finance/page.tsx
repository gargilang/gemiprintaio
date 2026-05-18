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
import BagiHasilManageModal from "@/components/BagiHasilManageModal";
import ConfirmDialog from "@/components/ConfirmDialog";
import { MoneyIcon } from "@/components/icons/PageIcons";
import {
  PersonIcon,
  CoinIcon,
  BoxIcon,
  CheckIcon,
} from "@/components/icons/ContentIcons";
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
import {
  participantNameMatches,
  resolveMetricParticipantName,
} from "@/lib/finance-metric-utils";
import { FINANCE_SLOT_LABELS, lookupFinanceSlotLabel } from "@/lib/finance-slot-labels";

// Helper function to strip [REF:xxx] from display while keeping it in database
const stripReferenceId = (text: string | null | undefined): string => {
  if (!text) return "";
  return text.replace(/\s*\[REF:[^\]]+\]/g, "").trim();
};

/** Kolom angka di baris buku kas — label Indonesia untuk pengguna non-teknis */
const FINANCE_DATA_SLOTS: Array<{
  source_column: string;
  metric_group: "summary" | "profit_share" | "cash_advance";
  label: string;
}> = [
  { source_column: "saldo", metric_group: "summary", label: "Saldo kas" },
  { source_column: "omzet", metric_group: "summary", label: "Omzet" },
  {
    source_column: "biaya_operasional",
    metric_group: "summary",
    label: "Biaya operasional",
  },
  { source_column: "biaya_bahan", metric_group: "summary", label: "Biaya bahan" },
  { source_column: "laba_bersih", metric_group: "summary", label: "Laba bersih" },
  {
    source_column: "bagi_hasil_anwar",
    metric_group: "profit_share",
    label: FINANCE_SLOT_LABELS.bagi_hasil_anwar,
  },
  {
    source_column: "bagi_hasil_suri",
    metric_group: "profit_share",
    label: FINANCE_SLOT_LABELS.bagi_hasil_suri,
  },
  {
    source_column: "bagi_hasil_gemi",
    metric_group: "profit_share",
    label: FINANCE_SLOT_LABELS.bagi_hasil_gemi,
  },
  {
    source_column: "kasbon_anwar",
    metric_group: "cash_advance",
    label: FINANCE_SLOT_LABELS.kasbon_anwar,
  },
  {
    source_column: "kasbon_suri",
    metric_group: "cash_advance",
    label: FINANCE_SLOT_LABELS.kasbon_suri,
  },
  {
    source_column: "kasbon_cahaya",
    metric_group: "cash_advance",
    label: FINANCE_SLOT_LABELS.kasbon_cahaya,
  },
  {
    source_column: "kasbon_dinil",
    metric_group: "cash_advance",
    label: FINANCE_SLOT_LABELS.kasbon_dinil,
  },
];

const METRIC_GROUP_LABELS: Record<
  "summary" | "profit_share" | "cash_advance",
  string
> = {
  summary: "Ringkasan",
  profit_share: "Bagi hasil",
  cash_advance: "Kasbon",
};


function slugifyParticipantCode(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toUpperCase()
    .slice(0, 16);
  return base || `ORANG${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

function slugifyCategoryCode(displayName: string): string {
  const base = displayName
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase()
    .slice(0, 24);
  return base || `KAT${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

function roleTypeLabelIndo(
  role: "profit_share" | "cash_advance" | "other"
): string {
  switch (role) {
    case "profit_share":
      return "Bagi hasil";
    case "cash_advance":
      return "Kasbon / pinjaman";
    default:
      return "Lainnya";
  }
}

function metricBelongsToActiveParticipant(
  metric: FinanceMetricConfig,
  participants: FinanceParticipantConfig[]
): boolean {
  if (
    metric.participant_id &&
    participants.some((p) => p.id === metric.participant_id)
  ) {
    return true;
  }
  const name = resolveMetricParticipantName(metric);
  if (!name) return false;
  return participants.some((p) => participantNameMatches(p.display_name, name));
}

function resolveMetricParticipantId(
  metric: FinanceMetricConfig,
  participants: FinanceParticipantConfig[]
): string | null {
  if (
    metric.participant_id &&
    participants.some((p) => p.id === metric.participant_id)
  ) {
    return metric.participant_id;
  }
  const name = resolveMetricParticipantName(metric);
  if (!name) return null;
  const match = participants.find((p) =>
    participantNameMatches(p.display_name, name)
  );
  return match?.id ?? null;
}

type ParticipantFinanceRow = {
  participantId: string;
  name: string;
  profitShareMetric: FinanceMetricConfig | null;
  cashAdvanceMetric: FinanceMetricConfig | null;
};

function buildParticipantMetricRows(
  participants: FinanceParticipantConfig[],
  metrics: FinanceMetricConfig[]
): ParticipantFinanceRow[] {
  const rows: ParticipantFinanceRow[] = [];

  for (const metric of metrics) {
    const pid = resolveMetricParticipantId(metric, participants);
    if (!pid) continue;
    const participant = participants.find((p) => p.id === pid);
    rows.push({
      participantId: pid,
      name:
        participant?.display_name ||
        resolveMetricParticipantName(metric) ||
        metric.metric_label,
      profitShareMetric: metric.metric_group === "profit_share" ? metric : null,
      cashAdvanceMetric: metric.metric_group === "cash_advance" ? metric : null,
    });
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name, "id"));
}

const FinanceParticipantSummaryTable = memo(function FinanceParticipantSummaryTable({
  rows,
  variant,
  formatRupiah,
  getValue,
  labaBersih,
}: {
  rows: ParticipantFinanceRow[];
  variant: "profit_share" | "cash_advance";
  formatRupiah: (n: number) => string;
  getValue: (sourceColumn: string) => number;
  labaBersih?: number;
}) {
  const isProfitShare = variant === "profit_share";
  const valueLabel = isProfitShare ? "Bagi hasil" : "Kasbon";
  const borderClass = isProfitShare ? "border-amber-200" : "border-violet-200";
  const headerBg = isProfitShare ? "bg-amber-50/80" : "bg-violet-50/80";
  const valueClass = isProfitShare ? "text-amber-800" : "text-violet-800";
  const footerBg = isProfitShare
    ? "bg-amber-50/60 border-amber-100 text-amber-900"
    : "bg-violet-50/60 border-violet-100 text-violet-900";

  if (rows.length === 0) {
    return (
      <p className="text-sm text-gray-500 py-6 text-center border border-dashed border-gray-200 rounded-xl mt-4 bg-gray-50/80">
        {isProfitShare
          ? "Belum ada bagi hasil untuk ditampilkan. Tambahkan orang dan kartu bagi hasil di Pengaturan."
          : "Belum ada kasbon untuk ditampilkan. Tambahkan orang dan kartu kasbon di Pengaturan."}
      </p>
    );
  }

  return (
    <div
      className={`mt-4 rounded-xl border-2 ${borderClass} overflow-hidden bg-white shadow-sm`}
    >
      <div
        className={`hidden sm:grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-3 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-gray-500 border-b ${headerBg}`}
      >
        <span>Nama</span>
        <span className="text-right">{valueLabel}</span>
      </div>
      <ul className="divide-y divide-gray-100">
        {rows.map((row) => {
          const metric = isProfitShare
            ? row.profitShareMetric
            : row.cashAdvanceMetric;
          return (
            <li
              key={`${variant}-${row.participantId}`}
              className="px-4 py-3 sm:grid sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] sm:gap-3 sm:items-center hover:bg-gray-50/80 transition-colors"
            >
              <div className="font-semibold text-gray-900 truncate">{row.name}</div>
              <div className="mt-2 sm:mt-0 flex items-center justify-between sm:justify-end gap-2">
                <span className="text-xs text-gray-500 sm:hidden">{valueLabel}</span>
                <span className={`font-bold tabular-nums ${valueClass}`}>
                  {metric ? formatRupiah(getValue(metric.source_column)) : "—"}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      {isProfitShare && labaBersih !== undefined && (
        <div
          className={`px-4 py-2.5 border-t text-xs flex flex-wrap justify-between gap-2 ${footerBg}`}
        >
          <span className="font-semibold">Laba bersih perusahaan (periode ini)</span>
          <span className="font-bold tabular-nums">{formatRupiah(labaBersih)}</span>
        </div>
      )}
    </div>
  );
});

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
}

interface FinanceMetricConfig {
  id?: string;
  metric_key: string;
  metric_label: string;
  metric_group: "summary" | "profit_share" | "cash_advance";
  source_column: string;
  participant_id?: string | null;
  participant_name: string | null;
}

interface FinanceParticipantConfig {
  id: string;
  participant_code: string;
  display_name: string;
  role_type: "profit_share" | "cash_advance" | "other";
  profit_formula?: "third_minus_kasbon" | "incremental_investor" | null;
  share_divisor?: number | null;
  bagi_hasil_column?: string | null;
}

const CASHBOOKS_CACHE_KEY = "cashbooks-active";

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
  const [showBagiHasilSection, setShowBagiHasilSection] = useState(true);
  const [showKasbonSection, setShowKasbonSection] = useState(true);
  const [financeCategories, setFinanceCategories] = useState<
    FinanceCategoryConfig[]
  >([]);
  const [financeMetrics, setFinanceMetrics] = useState<FinanceMetricConfig[]>(
    []
  );
  const [financeParticipants, setFinanceParticipants] = useState<
    FinanceParticipantConfig[]
  >([]);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showBagiHasilManageModal, setShowBagiHasilManageModal] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [participantForm, setParticipantForm] = useState({
    display_name: "",
    role_type: "other" as "profit_share" | "cash_advance" | "other",
  });
  const [categoryForm, setCategoryForm] = useState({
    display_name: "",
  });
  const [mappingForm, setMappingForm] = useState({
    selectedSourceColumn: "",
    metric_label: "",
    participant_id: "",
  });
  const [mappingEdits, setMappingEdits] = useState<
    Record<
      string,
      {
        metric_label: string;
        metric_group: "summary" | "profit_share" | "cash_advance";
        source_column: string;
        participant_id: string;
      }
    >
  >({});
  type FinanceConfigTabId = "people" | "categories" | "metrics";
  const [financeConfigTab, setFinanceConfigTab] =
    useState<FinanceConfigTabId>("people");
  const [financeCfgPeopleQuery, setFinanceCfgPeopleQuery] = useState("");
  const [financeCfgCategoryQuery, setFinanceCfgCategoryQuery] = useState("");
  const [financeCfgMetricQuery, setFinanceCfgMetricQuery] = useState("");

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

  // Filter state - multi-select dengan checkbox
  const [selectedKategoriFilters, setSelectedKategoriFilters] = useState<
    Set<string>
  >(new Set());
  const [showKategoriDropdown, setShowKategoriDropdown] = useState(false);

  // Virtualization state - untuk performance dengan banyak rows
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

  const dynamicMetricValue = useCallback(
    (sourceColumn: string): number => {
      const latest = viewingArchive
        ? cashBooks[cashBooks.length - 1]
        : cashBooks[0];
      if (!latest) return 0;
      const value = (latest as Record<string, any>)[sourceColumn];
      return typeof value === "number" ? value : 0;
    },
    [cashBooks, viewingArchive]
  );

  const profitShareMetrics = useMemo(
    () =>
      financeMetrics
        .filter((item) => item.metric_group === "profit_share")
        .filter((item) =>
          metricBelongsToActiveParticipant(item, financeParticipants)
        )
        .sort(
          (a, b) =>
            (a.participant_name || a.metric_label).localeCompare(
              b.participant_name || b.metric_label,
              "id"
            )
        ),
    [financeMetrics, financeParticipants]
  );
  const cashAdvanceMetrics = useMemo(
    () =>
      financeMetrics
        .filter((item) => item.metric_group === "cash_advance")
        .filter((item) =>
          metricBelongsToActiveParticipant(item, financeParticipants)
        )
        .sort(
          (a, b) =>
            (a.participant_name || a.metric_label).localeCompare(
              b.participant_name || b.metric_label,
              "id"
            )
        ),
    [financeMetrics, financeParticipants]
  );

  const profitShareRows = useMemo(
    () => buildParticipantMetricRows(financeParticipants, profitShareMetrics),
    [financeParticipants, profitShareMetrics]
  );

  const cashAdvanceRows = useMemo(
    () => buildParticipantMetricRows(financeParticipants, cashAdvanceMetrics),
    [financeParticipants, cashAdvanceMetrics]
  );

  const financeSlotsAvailableForNewMapping = useMemo(() => {
    const used = new Set(financeMetrics.map((m) => m.source_column));
    return FINANCE_DATA_SLOTS.filter((s) => !used.has(s.source_column));
  }, [financeMetrics]);

  const sourceColumnEditOptions = (
    activeColumn: string,
    fallbackGroup: "summary" | "profit_share" | "cash_advance"
  ) => {
    if (FINANCE_DATA_SLOTS.some((s) => s.source_column === activeColumn)) {
      return FINANCE_DATA_SLOTS;
    }
    return [
      ...FINANCE_DATA_SLOTS,
      {
        source_column: activeColumn,
        metric_group: fallbackGroup,
        label: `Posisi tersimpan: ${lookupFinanceSlotLabel(activeColumn)}`,
      },
    ];
  };

  const financeCfgParticipantsFiltered = useMemo(() => {
    const q = financeCfgPeopleQuery.trim().toLowerCase();
    if (!q) return financeParticipants;
    return financeParticipants.filter(
      (p) =>
        p.display_name.toLowerCase().includes(q) ||
        roleTypeLabelIndo(p.role_type).toLowerCase().includes(q)
    );
  }, [financeParticipants, financeCfgPeopleQuery]);

  const financeCfgCategoriesFiltered = useMemo(() => {
    const q = financeCfgCategoryQuery.trim().toLowerCase();
    if (!q) return financeCategories;
    return financeCategories.filter((c) =>
      [c.display_name, c.category_code].some((t) =>
        t.toLowerCase().includes(q)
      )
    );
  }, [financeCategories, financeCfgCategoryQuery]);

  const financeCfgMetricsActive = useMemo(
    () =>
      financeMetrics.filter((m) =>
        metricBelongsToActiveParticipant(m, financeParticipants)
      ),
    [financeMetrics, financeParticipants]
  );

  const financeCfgMetricsOrphaned = useMemo(
    () =>
      financeMetrics.filter(
        (m) => !metricBelongsToActiveParticipant(m, financeParticipants)
      ),
    [financeMetrics, financeParticipants]
  );

  const filterMetricsByQuery = useCallback(
    (list: FinanceMetricConfig[]) => {
      const q = financeCfgMetricQuery.trim().toLowerCase();
      if (!q) return list;
      return list.filter((m) => {
        const hay = [
          m.metric_label,
          lookupFinanceSlotLabel(m.source_column),
          m.participant_name || "",
          METRIC_GROUP_LABELS[m.metric_group],
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    },
    [financeCfgMetricQuery]
  );

  const financeCfgMetricsFiltered = useMemo(
    () => filterMetricsByQuery(financeCfgMetricsActive),
    [financeCfgMetricsActive, filterMetricsByQuery]
  );

  const financeCfgMetricsOrphanedFiltered = useMemo(
    () => filterMetricsByQuery(financeCfgMetricsOrphaned),
    [financeCfgMetricsOrphaned, filterMetricsByQuery]
  );

  const financeCfgParticipantNameInput = participantForm.display_name.trim();
  const financeCfgProposedParticipantCode =
    financeCfgParticipantNameInput.length > 0
      ? slugifyParticipantCode(financeCfgParticipantNameInput)
      : "";

  const financeCfgParticipantWarnings = useMemo(() => {
    const parts: string[] = [];
    const name = financeCfgParticipantNameInput;
    if (!name) return parts;
    const lower = name.toLowerCase();
    const nameTaken = financeParticipants.some(
      (p) => p.display_name.trim().toLowerCase() === lower
    );
    if (nameTaken) parts.push("Nama yang sama sudah ada di daftar.");
    const codeTaken = financeParticipants.some(
      (p) =>
        p.participant_code.toUpperCase() ===
        financeCfgProposedParticipantCode.toUpperCase()
    );
    if (!nameTaken && codeTaken)
      parts.push(
        "Kode singkat otomatis sama dengan orang lain — bedakan sedikit di nama."
      );
    return parts;
  }, [
    financeCfgParticipantNameInput,
    financeCfgProposedParticipantCode,
    financeParticipants,
  ]);

  const financeCfgCategoryNameInput = categoryForm.display_name.trim();
  const financeCfgProposedCategoryCode =
    financeCfgCategoryNameInput.length > 0
      ? slugifyCategoryCode(financeCfgCategoryNameInput)
      : "";

  const financeCfgCategoryWarnings = useMemo(() => {
    const parts: string[] = [];
    const name = financeCfgCategoryNameInput;
    if (!name) return parts;
    const lower = name.toLowerCase();
    const displayTaken = financeCategories.some(
      (c) => c.display_name.trim().toLowerCase() === lower
    );
    if (displayTaken) parts.push("Kategori dengan nama ini sudah ada.");
    const codeTaken = financeCategories.some(
      (c) =>
        c.category_code.toUpperCase() ===
        financeCfgProposedCategoryCode.toUpperCase()
    );
    if (!displayTaken && codeTaken)
      parts.push(
        "Kode kategori otomatis bentrok — coba nama yang sedikit berbeda."
      );
    return parts;
  }, [
    financeCfgCategoryNameInput,
    financeCfgProposedCategoryCode,
    financeCategories,
  ]);

  const financeCfgDuplicatedMappingSources = useMemo(() => {
    const count = new Map<string, number>();
    for (const m of financeMetrics) {
      if (!m.id) continue;
      const col =
        mappingEdits[m.id]?.source_column ?? m.source_column;
      count.set(col, (count.get(col) || 0) + 1);
    }
    const dup = new Set<string>();
    count.forEach((n, col) => {
      if (n > 1) dup.add(col);
    });
    return dup;
  }, [financeMetrics, mappingEdits]);

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
      loadFinanceConfig();
      // Always refresh active cashbooks on mount. The cached snapshot is shown
      // instantly while this network refresh fills in any new transactions.
      loadCashBooks();
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

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
        if (showConfigModal) setShowConfigModal(false);
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
    showBagiHasilManageModal,
    showConfigModal,
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

  useEffect(() => {
    if (!showConfigModal) {
      setFinanceConfigTab("people");
      setFinanceCfgPeopleQuery("");
      setFinanceCfgCategoryQuery("");
      setFinanceCfgMetricQuery("");
    }
  }, [showConfigModal]);

  const loadFinanceConfig = async () => {
    try {
      const res = await fetch("/api/finance/config", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Gagal memuat konfigurasi");
      setFinanceCategories(data.categories || []);
      setFinanceParticipants(data.participants || []);
      setFinanceMetrics(data.metricMappings || []);
      const edits: Record<string, any> = {};
      for (const metric of data.metricMappings || []) {
        if (!metric.id) continue;
        edits[metric.id] = {
          metric_label: metric.metric_label,
          metric_group: metric.metric_group,
          source_column: metric.source_column,
          participant_id:
            metric.participant_id ??
            (data.participants || []).find(
              (participant: FinanceParticipantConfig) =>
                participant.display_name === metric.participant_name
            )?.id ??
            "",
        };
      }
      setMappingEdits(edits);
    } catch (err) {
      console.error("Gagal memuat konfigurasi finance:", err);
    }
  };

  const requestDeleteParticipant = (participant: FinanceParticipantConfig) => {
    const linkedCards = financeMetrics.filter(
      (m) => m.participant_id === participant.id
    );
    if (linkedCards.length > 0) {
      showMsg(
        "error",
        `${participant.display_name} masih dipakai di ${linkedCards.length} hubungan angka. Putuskan atau hapus di tab Hubungkan angka terlebih dahulu.`
      );
      setFinanceConfigTab("metrics");
      return;
    }
    void submitConfigAction({
      action: "delete_participant",
      id: participant.id,
    });
  };

  const submitConfigAction = async (payload: Record<string, any>) => {
    setConfigSaving(true);
    const triggersRecalc =
      payload.action === "setup_bagi_hasil_partner" ||
      payload.action === "update_profit_share_partner" ||
      payload.action === "remove_bagi_hasil_partner";
    const deletedParticipantId =
      payload.action === "delete_participant" && typeof payload.id === "string"
        ? payload.id
        : null;
    const deletedMappingId =
      payload.action === "delete_mapping" && typeof payload.id === "string"
        ? payload.id
        : null;
    if (deletedMappingId) {
      setFinanceMetrics((prev) => prev.filter((m) => m.id !== deletedMappingId));
    }
    try {
      const res = await fetch("/api/finance/config/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Gagal menyimpan");
      if (deletedParticipantId) {
        setFinanceParticipants((prev) =>
          prev.filter((p) => p.id !== deletedParticipantId)
        );
      }
      await loadFinanceConfig();
      if (triggersRecalc) {
        await loadCashBooks();
      }
      showMsg(
        "success",
        triggersRecalc
          ? "Bagi hasil diperbarui dan buku kas dihitung ulang"
          : "Konfigurasi keuangan berhasil diperbarui"
      );
    } catch (error) {
      if (deletedParticipantId || deletedMappingId) {
        await loadFinanceConfig();
      }
      const message =
        error instanceof Error ? error.message : "Unknown";
      if (
        deletedParticipantId &&
        message.includes("kartu ringkasan")
      ) {
        setFinanceConfigTab("metrics");
      }
      showMsg(
        "error",
        `Gagal menyimpan konfigurasi: ${
          error instanceof Error ? error.message : "Unknown"
        }`
      );
    } finally {
      setConfigSaving(false);
    }
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
      {/* Bagi Hasil — baris vertikal */}
      {currentUser &&
        (currentUser.role === "admin" ||
          currentUser.role === "manager" ||
          currentUser.role === "staff") && (
          <div className="mb-6">
            <div className="flex gap-2 items-stretch">
              <button
                type="button"
                onClick={() => setShowBagiHasilSection(!showBagiHasilSection)}
                className="flex-1 min-w-0 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl shadow-md p-4 border-2 border-amber-200 hover:shadow-lg transition-all duration-200 text-left flex items-center justify-between"
              >
                <span className="text-sm font-bold text-gray-700 flex items-center gap-2">
                  <CoinIcon size={18} className="text-amber-600" />
                  Bagi Hasil
                  <span className="text-xs font-normal text-gray-500">
                    ({profitShareRows.length} orang)
                  </span>
                </span>
                <svg
                  className={`w-5 h-5 shrink-0 transform transition-transform ${
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
              {(currentUser.role === "admin" ||
                currentUser.role === "manager") && (
                <button
                  type="button"
                  onClick={() => setShowBagiHasilManageModal(true)}
                  className="shrink-0 px-4 rounded-xl border-2 border-amber-300 bg-white hover:bg-amber-50 text-amber-900 text-sm font-semibold shadow-sm transition-colors"
                  title="Kelola mitra dan rumus bagi hasil"
                >
                  Kelola
                </button>
              )}
            </div>
            {showBagiHasilSection && (
              <FinanceParticipantSummaryTable
                rows={profitShareRows}
                variant="profit_share"
                formatRupiah={formatRupiah}
                getValue={dynamicMetricValue}
                labaBersih={summaryData.labaBersih}
              />
            )}
          </div>
        )}
      {/* Kasbon Karyawan — baris vertikal */}
      {currentUser &&
        (currentUser.role === "admin" || currentUser.role === "manager") && (
          <div className="mb-6">
            <button
              type="button"
              onClick={() => setShowKasbonSection(!showKasbonSection)}
              className="w-full bg-gradient-to-r from-violet-50 to-purple-50 rounded-xl shadow-md p-4 border-2 border-violet-200 hover:shadow-lg transition-all duration-200 text-left flex items-center justify-between"
            >
              <span className="text-sm font-bold text-gray-700 flex items-center gap-2">
                <PersonIcon size={18} className="text-violet-600" />
                Kasbon Karyawan
                <span className="text-xs font-normal text-gray-500">
                  ({cashAdvanceRows.length} orang)
                </span>
              </span>
              <svg
                className={`w-5 h-5 transform transition-transform ${
                  showKasbonSection ? "rotate-180" : ""
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
            {showKasbonSection && (
              <FinanceParticipantSummaryTable
                rows={cashAdvanceRows}
                variant="cash_advance"
                formatRupiah={formatRupiah}
                getValue={dynamicMetricValue}
              />
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
                  onClick={() => setShowConfigModal(true)}
                  className="bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800 text-white px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 shadow-sm"
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
                      d="M10.325 4.317a1 1 0 011.35-.936l.82.307a1 1 0 00.962-.123l.73-.53a1 1 0 011.437.123l.52.67a1 1 0 00.916.375l.848-.06a1 1 0 011.054.999l.02.848a1 1 0 00.47.795l.72.45a1 1 0 01.287 1.438l-.48.7a1 1 0 00-.07.947l.34.777a1 1 0 01-.65 1.313l-.82.24a1 1 0 00-.68.69l-.24.82a1 1 0 01-1.312.65l-.778-.34a1 1 0 00-.947.07l-.7.48a1 1 0 01-1.438-.287l-.45-.72a1 1 0 00-.795-.47l-.848-.02a1 1 0 01-.999-1.054l.06-.848a1 1 0 00-.375-.916l-.67-.52a1 1 0 01-.123-1.437l.53-.73a1 1 0 00.123-.962l-.307-.82z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  Pengaturan tampilan
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
      <BagiHasilManageModal
        open={showBagiHasilManageModal}
        onClose={() => setShowBagiHasilManageModal(false)}
        participants={financeParticipants}
        metricMappings={financeMetrics}
        saving={configSaving}
        canEdit={
          currentUser?.role === "admin" || currentUser?.role === "manager"
        }
        onSubmit={submitConfigAction}
      />
      <ModalFormShell
        open={showConfigModal}
        onClose={() => setShowConfigModal(false)}
        maxWidthClass="max-w-5xl"
        header={
          <div
            className="p-6 border-b border-gray-200 bg-gradient-to-r from-slate-600 to-slate-800 shrink-0 flex items-start justify-between gap-4"
            role="presentation"
          >
            <div className="min-w-0">
              <h3
                id="finance-config-title"
                className="text-xl font-bold text-white"
              >
                Pengaturan tampilan ringkasan
              </h3>
              <p className="text-slate-200 text-sm mt-2 leading-relaxed">
                Sesuaikan nama dan kartu di halaman ini. Tidak perlu memahami
                istilah teknis; cukup ikuti petunjuk di setiap kotak.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowConfigModal(false)}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors shrink-0"
              aria-label="Tutup dialog"
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
              onClick={() => setShowConfigModal(false)}
              className="px-4 py-2 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-100 bg-white"
            >
              Tutup
            </button>
          </div>
        }
      >
            <div className="p-6 pb-4">
              <div
                className="flex flex-wrap gap-1 border-b border-gray-200 mb-5"
                role="tablist"
                aria-label="Bagian pengaturan"
              >
                {(
                  [
                    { id: "people" as const, label: "Orang" },
                    { id: "categories" as const, label: "Kategori" },
                    { id: "metrics" as const, label: "Hubungkan angka" },
                  ] as const
                ).map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={financeConfigTab === id}
                    onClick={() => setFinanceConfigTab(id)}
                    className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 transition -mb-px ${
                      financeConfigTab === id
                        ? "border-slate-700 text-slate-900 bg-slate-50"
                        : "border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50"
                    }`}
                  >
                    {label}
                    <span className="ml-1.5 text-xs font-normal text-gray-400">
                      {id === "people" && `(${financeParticipants.length})`}
                      {id === "categories" && `(${financeCategories.length})`}
                      {id === "metrics" && `(${financeMetrics.length})`}
                    </span>
                  </button>
                ))}
              </div>

              {financeConfigTab === "people" && (
                <div className="space-y-5 min-h-[340px]">
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                    <p className="font-bold text-gray-800 mb-1">
                      Tambah orang baru
                    </p>
                    <p className="text-xs text-gray-500 mb-3 leading-relaxed">
                      Nama muncul di baris Bagi Hasil atau Kasbon di halaman
                      Keuangan. Cukup isi nama biasa; sistem membuat kode
                      singkat sendiri. Untuk menghapus orang, putuskan dulu
                      hubungan angka di tab Hubungkan angka.
                    </p>
                    <div className="space-y-2 max-w-lg">
                      <input
                        value={participantForm.display_name}
                        onChange={(e) =>
                          setParticipantForm((prev) => ({
                            ...prev,
                            display_name: e.target.value,
                          }))
                        }
                        className={`w-full px-3 py-2 border rounded-lg ${
                          financeCfgParticipantWarnings.length > 0
                            ? "border-amber-300"
                            : ""
                        }`}
                        placeholder="Nama lengkap atau panggilan"
                        aria-label="Nama orang"
                      />
                      <select
                        value={participantForm.role_type}
                        onChange={(e) =>
                          setParticipantForm((prev) => ({
                            ...prev,
                            role_type: e.target.value as
                              | "profit_share"
                              | "cash_advance"
                              | "other",
                          }))
                        }
                        className="w-full px-3 py-2 border rounded-lg"
                        aria-label="Peran"
                      >
                        <option value="profit_share">Terlibat bagi hasil</option>
                        <option value="cash_advance">
                          Terlibat kasbon / pinjaman
                        </option>
                        <option value="other">Lainnya</option>
                      </select>
                      {financeCfgParticipantWarnings.length > 0 && (
                        <ul className="text-xs text-amber-800 space-y-1 list-disc list-inside">
                          {financeCfgParticipantWarnings.map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      )}
                      <button
                        type="button"
                        disabled={
                          configSaving || financeCfgParticipantWarnings.length > 0
                        }
                        onClick={() => {
                          const name = participantForm.display_name.trim();
                          if (!name) {
                            showMsg(
                              "error",
                              "Mohon isi nama orang terlebih dahulu."
                            );
                            return;
                          }
                          submitConfigAction({
                            action: "create_participant",
                            participant_code: slugifyParticipantCode(name),
                            display_name: name,
                            role_type: participantForm.role_type,
                          });
                        }}
                        className="w-full max-w-lg px-3 py-2 bg-slate-700 text-white rounded-lg disabled:opacity-50"
                      >
                        Tambah orang
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-gray-600">
                      Cari di daftar
                    </label>
                    <input
                      type="search"
                      value={financeCfgPeopleQuery}
                      onChange={(e) => setFinanceCfgPeopleQuery(e.target.value)}
                      className="w-full mt-1 max-w-lg px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      placeholder="Ketik nama atau peran…"
                      aria-label="Cari orang"
                    />
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-white p-3 max-h-72 overflow-y-auto">
                    {financeCfgParticipantsFiltered.length === 0 ? (
                      <p className="text-sm text-gray-500 py-6 text-center">
                        {financeParticipants.length === 0
                          ? "Belum ada orang terdaftar."
                          : "Tidak ada yang cocok dengan pencarian."}
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {financeCfgParticipantsFiltered.map((participant) => (
                          <div
                            key={participant.id}
                            className="flex items-center justify-between gap-2 text-sm bg-gray-50 rounded-lg p-3"
                          >
                            <div className="min-w-0">
                              <span className="font-medium text-gray-800 block truncate">
                                {participant.display_name}
                              </span>
                              <span className="text-xs text-gray-500">
                                {roleTypeLabelIndo(participant.role_type)}
                              </span>
                            </div>
                            <button
                              type="button"
                              disabled={configSaving}
                              onClick={() => requestDeleteParticipant(participant)}
                              className="text-red-600 hover:text-red-800 shrink-0 text-sm"
                            >
                              Hapus
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {financeConfigTab === "categories" && (
                <div className="space-y-5 min-h-[340px]">
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                    <p className="font-bold text-gray-800 mb-1">
                      Tambah kategori baru
                    </p>
                    <p className="text-xs text-gray-500 mb-3 leading-relaxed">
                      Kategori muncul saat Anda mencatat transaksi atau memilih di
                      tabel. Pakai kata yang dikenal seluruh staf.
                    </p>
                    <div className="space-y-2 max-w-lg">
                      <input
                        value={categoryForm.display_name}
                        onChange={(e) =>
                          setCategoryForm((prev) => ({
                            ...prev,
                            display_name: e.target.value,
                          }))
                        }
                        className={`w-full px-3 py-2 border rounded-lg ${
                          financeCfgCategoryWarnings.length > 0
                            ? "border-amber-300"
                            : ""
                        }`}
                        placeholder="Contoh: Bonus lebaran"
                        aria-label="Nama kategori"
                      />
                      {financeCfgCategoryWarnings.length > 0 && (
                        <ul className="text-xs text-amber-800 space-y-1 list-disc list-inside">
                          {financeCfgCategoryWarnings.map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      )}
                      <button
                        type="button"
                        disabled={
                          configSaving || financeCfgCategoryWarnings.length > 0
                        }
                        onClick={() => {
                          const name = categoryForm.display_name.trim();
                          if (!name) {
                            showMsg("error", "Mohon isi nama kategori.");
                            return;
                          }
                          submitConfigAction({
                            action: "create_category",
                            category_code: slugifyCategoryCode(name),
                            display_name: name,
                          });
                        }}
                        className="w-full max-w-lg px-3 py-2 bg-slate-700 text-white rounded-lg disabled:opacity-50"
                      >
                        Tambah kategori
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-gray-600">
                      Cari di daftar
                    </label>
                    <input
                      type="search"
                      value={financeCfgCategoryQuery}
                      onChange={(e) =>
                        setFinanceCfgCategoryQuery(e.target.value)
                      }
                      className="w-full mt-1 max-w-lg px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      placeholder="Ketik nama kategori…"
                      aria-label="Cari kategori"
                    />
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-white p-3 max-h-72 overflow-y-auto">
                    {financeCfgCategoriesFiltered.length === 0 ? (
                      <p className="text-sm text-gray-500 py-6 text-center">
                        {financeCategories.length === 0
                          ? "Belum ada kategori tambahan."
                          : "Tidak ada yang cocok dengan pencarian."}
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {financeCfgCategoriesFiltered.map((category) => (
                          <div
                            key={category.id || category.category_code}
                            className="flex items-center justify-between gap-2 text-sm bg-gray-50 rounded-lg p-3"
                          >
                            <span className="font-medium text-gray-800 truncate min-w-0">
                              {category.display_name}
                            </span>
                            {category.id && (
                              <button
                                type="button"
                                disabled={configSaving}
                                onClick={() =>
                                  submitConfigAction({
                                    action: "delete_category",
                                    id: category.id,
                                  })
                                }
                                className="text-red-600 hover:text-red-800 shrink-0 text-sm"
                              >
                                Hapus
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {financeConfigTab === "metrics" && (
                <div className="space-y-5 min-h-[340px]">
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                    <p className="font-bold text-gray-800 mb-1">
                      Hubungkan angka ke baris ringkasan
                    </p>
                    <p className="text-xs text-gray-500 mb-3 leading-relaxed">
                      Mengatur siapa muncul di bagian Bagi Hasil / Kasbon
                      Karyawan (bukan kartu terpisah lagi). Satu kolom angka di
                      buku kas hanya untuk satu orang. Judul bisa disesuaikan.
                    </p>
                    <div className="space-y-2 max-w-xl">
                      <select
                        value={mappingForm.selectedSourceColumn}
                        onChange={(e) =>
                          setMappingForm((prev) => ({
                            ...prev,
                            selectedSourceColumn: e.target.value,
                          }))
                        }
                        className="w-full px-3 py-2 border rounded-lg"
                        aria-label="Pilih sumber angka"
                      >
                        <option value="">
                          {financeSlotsAvailableForNewMapping.length === 0
                            ? "Semua pos sudah dipakai"
                            : "Pilih sumber angka"}
                        </option>
                        {financeSlotsAvailableForNewMapping.map((slot) => (
                          <option
                            key={slot.source_column}
                            value={slot.source_column}
                          >
                            {slot.label} ·{" "}
                            {METRIC_GROUP_LABELS[slot.metric_group]}
                          </option>
                        ))}
                      </select>
                      <input
                        value={mappingForm.metric_label}
                        onChange={(e) =>
                          setMappingForm((prev) => ({
                            ...prev,
                            metric_label: e.target.value,
                          }))
                        }
                        className="w-full px-3 py-2 border rounded-lg"
                        placeholder="Judul di ringkasan, kosongkan jika sudah jelas"
                        aria-label="Judul di ringkasan"
                      />
                      <select
                        value={mappingForm.participant_id}
                        onChange={(e) =>
                          setMappingForm((prev) => ({
                            ...prev,
                            participant_id: e.target.value,
                          }))
                        }
                        className="w-full px-3 py-2 border rounded-lg"
                        aria-label="Hubungkan ke orang"
                      >
                        <option value="">Tidak perlu nama orang</option>
                        {financeParticipants.map((participant) => (
                          <option key={participant.id} value={participant.id}>
                            {participant.display_name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={
                          configSaving ||
                          financeSlotsAvailableForNewMapping.length === 0
                        }
                        onClick={() => {
                          const slot = FINANCE_DATA_SLOTS.find(
                            (s) =>
                              s.source_column === mappingForm.selectedSourceColumn
                          );
                          if (!slot || !mappingForm.selectedSourceColumn) {
                            showMsg(
                              "error",
                              "Pilih sumber angka yang akan ditampilkan di kartu."
                            );
                            return;
                          }
                          submitConfigAction({
                            action: "create_mapping",
                            metric_key: `fin_${mappingForm.selectedSourceColumn}_${Date.now()}`,
                            metric_label:
                              mappingForm.metric_label.trim() || slot.label,
                            metric_group: slot.metric_group,
                            source_column: mappingForm.selectedSourceColumn,
                            participant_id: mappingForm.participant_id || null,
                          });
                        }}
                        className="w-full max-w-xl px-3 py-2 bg-slate-700 text-white rounded-lg disabled:opacity-50"
                      >
                        Tambah hubungan angka
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-gray-600">
                      Cari di daftar hubungan
                    </label>
                    <input
                      type="search"
                      value={financeCfgMetricQuery}
                      onChange={(e) =>
                        setFinanceCfgMetricQuery(e.target.value)
                      }
                      className="w-full mt-1 max-w-xl px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      placeholder="Ketik judul, nama orang, atau bagian ringkasan…"
                      aria-label="Cari hubungan angka"
                    />
                  </div>

                  {financeCfgDuplicatedMappingSources.size > 0 && (
                    <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      Ada lebih dari satu baris yang memakai sumber angka yang
                      sama. Sesuaikan pilihan hingga tidak ada pesan ini, lalu
                      simpan tiap baris.
                    </p>
                  )}

                  <div className="space-y-3 max-h-[min(52vh,28rem)] overflow-y-auto">
                    {financeCfgMetricsFiltered.map((metric) => {
                      const editCol =
                        (metric.id
                          ? mappingEdits[metric.id]?.source_column
                          : undefined) ?? metric.source_column;
                      const editGroup =
                        (metric.id
                          ? mappingEdits[metric.id]?.metric_group
                          : undefined) ?? metric.metric_group;
                      const slotOptions = sourceColumnEditOptions(
                        editCol,
                        editGroup
                      );
                      let subtitleParticipantName: string | null =
                        metric.participant_name;
                      if (metric.id && mappingEdits[metric.id]) {
                        const pid = mappingEdits[metric.id].participant_id;
                        if (pid === "") subtitleParticipantName = null;
                        else if (pid)
                          subtitleParticipantName =
                            financeParticipants.find((p) => p.id === pid)
                              ?.display_name ?? metric.participant_name;
                      }
                      const mappingRowSourceDup =
                        Boolean(metric.id) &&
                        financeCfgDuplicatedMappingSources.has(editCol);
                      return (
                        <div
                          key={metric.id || metric.metric_key}
                          className="text-sm bg-gray-50 rounded-lg p-3 border border-gray-100"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-semibold text-gray-900">
                                {metric.metric_label}
                              </p>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {METRIC_GROUP_LABELS[editGroup]}
                                {subtitleParticipantName
                                  ? ` · ${subtitleParticipantName}`
                                  : ""}
                                {" · "}
                                {lookupFinanceSlotLabel(editCol)}
                              </p>
                            </div>
                            {metric.id && (
                              <button
                                type="button"
                                disabled={configSaving}
                                onClick={() =>
                                  submitConfigAction({
                                    action: "delete_mapping",
                                    id: metric.id,
                                  })
                                }
                                className="text-red-600 hover:text-red-800 shrink-0 text-xs"
                              >
                                Hapus
                              </button>
                            )}
                          </div>
                          {metric.id && (
                            <div className="mt-3 space-y-2">
                              <label className="block text-xs font-medium text-gray-600">
                                Judul di kartu
                              </label>
                              <input
                                value={
                                  mappingEdits[metric.id]?.metric_label || ""
                                }
                                onChange={(e) =>
                                  setMappingEdits((prev) => ({
                                    ...prev,
                                    [metric.id as string]: {
                                      ...(prev[metric.id as string] || {
                                        metric_label: "",
                                        metric_group: "summary",
                                        source_column: "",
                                        participant_id: "",
                                      }),
                                      metric_label: e.target.value,
                                    },
                                  }))
                                }
                                className="w-full px-2 py-1.5 border rounded text-sm"
                                placeholder="Judul di kartu"
                              />
                              <label className="block text-xs font-medium text-gray-600">
                                Sumber angka di laporan
                              </label>
                              <select
                                value={editCol}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  const slot = FINANCE_DATA_SLOTS.find(
                                    (s) => s.source_column === v
                                  );
                                  setMappingEdits((prev) => ({
                                    ...prev,
                                    [metric.id as string]: {
                                      ...(prev[metric.id as string] || {
                                        metric_label: "",
                                        metric_group: "summary",
                                        source_column: "",
                                        participant_id: "",
                                      }),
                                      source_column: v,
                                      metric_group: slot
                                        ? slot.metric_group
                                        : prev[metric.id as string]
                                            ?.metric_group ??
                                          metric.metric_group,
                                    },
                                  }));
                                }}
                                className={`w-full px-2 py-1.5 border rounded text-sm ${
                                  mappingRowSourceDup
                                    ? "border-amber-400 bg-amber-50/40"
                                    : ""
                                }`}
                              >
                                {slotOptions.map((s) => (
                                  <option
                                    key={`${s.source_column}-${s.label}`}
                                    value={s.source_column}
                                  >
                                    {s.label}
                                  </option>
                                ))}
                              </select>
                              {mappingRowSourceDup && (
                                <p className="text-xs text-amber-800">
                                  Sumber angka ini dipakai lebih dari satu kartu.
                                  Ubah salah satunya lalu simpan.
                                </p>
                              )}
                              <label className="block text-xs font-medium text-gray-600">
                                Tampil sebagai bagian dari
                              </label>
                              <select
                                value={
                                  mappingEdits[metric.id]?.metric_group ??
                                  metric.metric_group
                                }
                                onChange={(e) =>
                                  setMappingEdits((prev) => ({
                                    ...prev,
                                    [metric.id as string]: {
                                      ...(prev[metric.id as string] || {
                                        metric_label: "",
                                        metric_group: "summary",
                                        source_column: "",
                                        participant_id: "",
                                      }),
                                      metric_group: e.target.value as
                                        | "summary"
                                        | "profit_share"
                                        | "cash_advance",
                                    },
                                  }))
                                }
                                className="w-full px-2 py-1.5 border rounded text-sm"
                              >
                                <option value="summary">
                                  {METRIC_GROUP_LABELS.summary}
                                </option>
                                <option value="profit_share">
                                  {METRIC_GROUP_LABELS.profit_share}
                                </option>
                                <option value="cash_advance">
                                  {METRIC_GROUP_LABELS.cash_advance}
                                </option>
                              </select>
                              <label className="block text-xs font-medium text-gray-600">
                                Orang terkait
                              </label>
                              <select
                                value={
                                  mappingEdits[metric.id]?.participant_id || ""
                                }
                                onChange={(e) =>
                                  setMappingEdits((prev) => ({
                                    ...prev,
                                    [metric.id as string]: {
                                      ...(prev[metric.id as string] || {
                                        metric_label: "",
                                        metric_group: "summary",
                                        source_column: "",
                                        participant_id: "",
                                      }),
                                      participant_id: e.target.value,
                                    },
                                  }))
                                }
                                className="w-full px-2 py-1.5 border rounded text-sm"
                              >
                                <option value="">Tanpa nama orang</option>
                                {financeParticipants.map((participant) => (
                                  <option
                                    key={participant.id}
                                    value={participant.id}
                                  >
                                    {participant.display_name}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                disabled={configSaving || mappingRowSourceDup}
                                onClick={() =>
                                  submitConfigAction({
                                    action: "update_mapping",
                                    id: metric.id,
                                    metric_label:
                                      (metric.id
                                        ? mappingEdits[metric.id]?.metric_label
                                        : "") || metric.metric_label,
                                    metric_group:
                                      (metric.id
                                        ? mappingEdits[metric.id]?.metric_group
                                        : undefined) || metric.metric_group,
                                    source_column:
                                      (metric.id
                                        ? mappingEdits[metric.id]?.source_column
                                        : "") || metric.source_column,
                                    participant_id:
                                      (metric.id
                                        ? mappingEdits[metric.id]
                                            ?.participant_id
                                        : "") || null,
                                  })
                                }
                                className="text-xs w-full px-2 py-1.5 bg-slate-100 text-slate-800 rounded font-medium hover:bg-slate-200 disabled:opacity-50"
                              >
                                Simpan perubahan untuk baris ini
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {financeMetrics.length > 0 &&
                      financeCfgMetricsFiltered.length === 0 &&
                      financeCfgMetricsOrphanedFiltered.length === 0 && (
                        <p className="text-sm text-gray-500 py-10 text-center">
                          Tidak ada kartu yang cocok dengan pencarian.
                        </p>
                      )}

                    {financeCfgMetricsOrphanedFiltered.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-amber-200 space-y-2">
                        <p className="text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
                          Hubungan terputus — orang sudah dihapus dari tab Orang
                          atau belum dipilih. Baris ini tidak tampil di Bagi
                          Hasil / Kasbon. Tambahkan orang di tab Orang, pilih
                          nama di baris di bawah lalu simpan, atau hapus baris
                          yang tidak dipakai.
                        </p>
                        {financeCfgMetricsOrphanedFiltered.map((metric) => (
                          <div
                            key={metric.id || metric.metric_key}
                            className="flex items-start justify-between gap-3 text-sm bg-amber-50/80 rounded-lg p-3 border border-amber-200"
                          >
                            <div className="min-w-0">
                              <p className="font-semibold text-gray-900">
                                {metric.metric_label}
                              </p>
                              <p className="text-xs text-gray-600 mt-0.5">
                                {METRIC_GROUP_LABELS[metric.metric_group]}
                                {" · "}
                                {lookupFinanceSlotLabel(metric.source_column)}
                              </p>
                            </div>
                            {metric.id ? (
                              <button
                                type="button"
                                disabled={configSaving}
                                onClick={() =>
                                  submitConfigAction({
                                    action: "delete_mapping",
                                    id: metric.id,
                                  })
                                }
                                className="shrink-0 px-3 py-1.5 text-xs font-semibold text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50"
                              >
                                Hapus kartu
                              </button>
                            ) : (
                              <span className="text-[10px] text-gray-500 shrink-0 max-w-[8rem] text-right">
                                Kartu bawaan — tambah kartu baru lalu abaikan
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
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
      {/* Notification Toast */}
      {notice && (
        <NotificationToast type={notice.type} message={notice.message} />
      )}
    </>
  );
}
