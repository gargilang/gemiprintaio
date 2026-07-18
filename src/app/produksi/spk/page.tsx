"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import ToastNotifikasi, {
  NotificationToastProps,
} from "@/components/ToastNotifikasi";
import { PrinterIcon } from "@/components/icons/PageIcons";
import type {
  ProductionOrder,
  ProductionItem,
} from "@/lib/services/production-service";
import {
  getProductionOrdersAction,
  updateProductionStatusAction,
  updateProductionItemStatusAction,
  getRollVariantsForProductionItemAction,
  postProductionMaterialConsumptionAction,
  voidProductionMaterialConsumptionAction,
  setOrderStatusSiapDiambilCascadeAction,
  updateSaleCustomerAction,
  getPelangganRingkasAction,
} from "./actions";
import { fetchSessionUser, getCachedSessionUser } from "@/lib/client-session";
import { useCachedData, useInvalidate } from "@/lib/use-cached-data";
import SpkDetailModal from "./components/SpkDetailModal";
import { generateSPKHTML } from "./components/spk-print";
import { preparePrintHtml } from "@/lib/print-embed-client";
import { openPrintDocument } from "@/lib/print-fonts";
import DialogKonfirmasi from "@/components/DialogKonfirmasi";
import { getStatusColor, getPriorityColor } from "./components/spk-status";
import { labelStatus } from "@/lib/produksi/status-produksi";

interface User {
  id: string;
  nama_pengguna: string;
  role: string;
}

interface RollVariantOption {
  id: string;
  lebar_m: number;
  panjang_tersedia_m: number;
  average_cost_per_m2: number;
}

const EMPTY_ORDERS: ProductionOrder[] = [];

export default function ProductionPage() {
  const router = useRouter();
  const initialUser =
    typeof window !== "undefined"
      ? (getCachedSessionUser() as User | null)
      : null;
  const [currentUser, setCurrentUser] = useState<User | null>(initialUser);
  const {
    data: ordersData,
    isLoading: ordersLoading,
    mutate: mutateOrders,
  } = useCachedData<ProductionOrder[]>("production-orders", async () => {
    const list = await getProductionOrdersAction();
    return (list as ProductionOrder[]) || [];
  });
  const orders = ordersData ?? EMPTY_ORDERS;
  // SPK milik penjualan VOID disembunyikan dari seluruh halaman (kartu statistik
  // + tabel), konsisten dengan riwayat penjualan & buku keuangan.
  const visibleOrders = useMemo(
    () => orders.filter((o) => !o.penjualan_dibatalkan),
    [orders],
  );
  const loading = currentUser === null && ordersLoading;
  const invalidate = useInvalidate();
  const [showCustomerEditor, setShowCustomerEditor] = useState(false);
  const [customerOptions, setCustomerOptions] = useState<
    { id: string; nama: string }[]
  >([]);
  const [customerNameInput, setCustomerNameInput] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [filterPriority, setFilterPriority] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<ProductionOrder | null>(
    null,
  );
  const selectedOrderRef = useRef<ProductionOrder | null>(null);
  useEffect(() => {
    selectedOrderRef.current = selectedOrder;
  });
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [notice, setNotice] = useState<NotificationToastProps | null>(null);
  const [confirmState, setConfirmState] = useState<{
    show: boolean;
    title: string;
    message: string;
    type: "warning" | "danger" | "info";
    onConfirm: () => void;
  }>({ show: false, title: "", message: "", type: "info", onConfirm: () => {} });
  const closeConfirm = () => setConfirmState((s) => ({ ...s, show: false }));
  const [rollVariantsByItem, setRollVariantsByItem] = useState<
    Record<string, RollVariantOption[]>
  >({});
  const [consumptionDrafts, setConsumptionDrafts] = useState<
    Record<
      string,
      { roll_variant_id: string; linear_used_m: string; catatan: string }
    >
  >({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const user = await fetchSessionUser();
      if (cancelled) return;
      if (!user) {
        router.push("/auth/login");
        return;
      }
      setCurrentUser(user);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!showDetailModal || !selectedOrder) return;
    const pendingItems = (selectedOrder.items || []).filter(
      (item) => item.roll_inventory_status === "PENDING",
    );
    if (pendingItems.length === 0) return;

    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        pendingItems.map(async (item) => {
          try {
            const variants = await getRollVariantsForProductionItemAction(
              item.id,
            );
            return [item.id, variants as RollVariantOption[]] as const;
          } catch (error) {
            console.error("Error loading roll variants:", error);
            return [item.id, [] as RollVariantOption[]] as const;
          }
        }),
      );
      if (cancelled) return;
      setRollVariantsByItem((prev) => {
        const next = { ...prev };
        for (const [itemId, variants] of entries) {
          next[itemId] = variants;
        }
        return next;
      });
      setConsumptionDrafts((prev) => {
        const next = { ...prev };
        for (const item of pendingItems) {
          if (next[item.id]) continue;
          const variants =
            entries.find(([itemId]) => itemId === item.id)?.[1] || [];
          const preferred =
            variants.find(
              (v) =>
                Math.abs(
                  Number(v.lebar_m) -
                    Number(item.recommended_roll_width_m || 0),
                ) < 0.000001,
            ) || variants[0];
          next[item.id] = {
            roll_variant_id: preferred?.id || "",
            linear_used_m: "",
            catatan: "",
          };
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [showDetailModal, selectedOrder]);

  const filteredOrders = useMemo(() => {
    // Pakai visibleOrders (sudah tanpa SPK penjualan VOID).
    let filtered = [...visibleOrders];

    if (filterStatus !== "ALL") {
      filtered = filtered.filter((order) => order.status === filterStatus);
    }

    if (filterPriority !== "ALL") {
      filtered = filtered.filter((order) => order.prioritas === filterPriority);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (order) =>
          order.nomor_spk.toLowerCase().includes(query) ||
          order.pelanggan_nama?.toLowerCase().includes(query),
      );
    }

    return filtered;
  }, [visibleOrders, filterStatus, filterPriority, searchQuery]);

  const showMsg = (type: "success" | "error", message: string) => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 3000);
  };

  // Fetch ulang semua order, lalu sync selectedOrder dari hasil terbaru.
  // Pakai ref agar ID order yang sedang dibuka tidak stale di closure.
  const reloadOrders = async () => {
    try {
      const refreshed = await mutateOrders();
      const currentId = selectedOrderRef.current?.id;
      if (currentId) {
        const next = (refreshed as ProductionOrder[] | undefined)?.find(
          (o) => o.id === currentId,
        );
        if (next) setSelectedOrder(next);
      }
    } catch (error) {
      console.error("Error loading production orders:", error);
      showMsg("error", "Gagal memuat data produksi");
    }
  };

  const setSelectedOrderSiapDiambil = (orderId: string) => {
    setSelectedOrder((current) => {
      if (!current || current.id !== orderId) return current;
      return {
        ...current,
        status: "SIAP_AMBIL",
        status_override_manual: false,
        items: (current.items || []).map((item) =>
          item.status === "SELESAI" || item.status === "DIBATALKAN"
            ? item
            : { ...item, status: "SIAP_AMBIL" },
        ),
      };
    });
  };

  const handleUpdateStatus = async (orderId: string, newStatus: string) => {
    try {
      if (newStatus === "SELESAI") {
        showMsg(
          "error",
          "Status Selesai hanya bisa ditandai lewat halaman Pengambilan (Sudah Diambil).",
        );
        return;
      }
      if (newStatus === "SIAP_AMBIL") {
        setConfirmState({
          show: true,
          title: "Tandai Siap Diambil",
          message: "Tandai SPK siap diambil pelanggan?",
          type: "info",
          onConfirm: async () => {
            try {
              const hasil = await setOrderStatusSiapDiambilCascadeAction(orderId);
              if (hasil.terhalang.length > 0) {
                const nama = hasil.terhalang.map((t: any) => t.nama).join(", ");
                showMsg("error", `Item berikut belum bisa diselesaikan: ${nama}. Konfirmasi bahan roll dulu jika perlu.`);
              } else if (hasil.statusOrderAkhir === "SIAP_AMBIL") {
                setSelectedOrderSiapDiambil(orderId);
                showMsg("success", "SPK ditandai Siap Diambil");
              } else {
                showMsg("error", "SPK belum bisa ditandai Siap Diambil — periksa status item.");
              }
              await reloadOrders();
              setSelectedOrderSiapDiambil(orderId);
            } catch (error) {
              showMsg("error", error instanceof Error ? error.message : "Gagal memperbarui status");
            }
          },
        });
        return;
      } else {
        await updateProductionStatusAction(orderId, newStatus);
        showMsg("success", "Status berhasil diperbarui");
      }
      await reloadOrders();
      if (newStatus === "SIAP_AMBIL") {
        setSelectedOrderSiapDiambil(orderId);
      }
    } catch (error) {
      console.error("Error updating status:", error);
      showMsg(
        "error",
        error instanceof Error ? error.message : "Gagal memperbarui status",
      );
    }
  };

  const handleUpdateItemStatus = async (itemId: string, newStatus: string) => {
    try {
      await updateProductionItemStatusAction(itemId, { status: newStatus });
      showMsg("success", "Status item berhasil diperbarui");
      await reloadOrders();
    } catch (error) {
      console.error("Error updating item status:", error);
      showMsg("error", "Gagal memperbarui status item");
    }
  };

  const handleOpenCustomerEditor = async () => {
    if (!selectedOrder) return;
    setCustomerNameInput(selectedOrder.pelanggan_nama || "");
    if (customerOptions.length === 0) {
      try {
        const list = await getPelangganRingkasAction();
        setCustomerOptions(list);
      } catch {
        // biarkan kosong; operator masih bisa ketik nama bebas
      }
    }
    setShowCustomerEditor(true);
  };

  const handleSaveCustomerName = async (payload: {
    pelanggan_id?: string | null;
    pelanggan_nama_snapshot?: string | null;
  }) => {
    if (!selectedOrder) return;
    try {
      await updateSaleCustomerAction(selectedOrder.penjualan_id, payload);
      showMsg("success", "Nama pelanggan disimpan");
      setShowCustomerEditor(false);
      // Sinkron dua arah: bust cache SPK + Riwayat Penjualan (sales ada di pos-init).
      invalidate("production-orders");
      invalidate("pos-init");
      await reloadOrders();
    } catch (error) {
      console.error("Error saving customer name:", error);
      showMsg("error", "Gagal menyimpan nama pelanggan");
    }
  };

  const patchConsumptionDraft = (
    itemId: string,
    patch: Partial<{
      roll_variant_id: string;
      linear_used_m: string;
      catatan: string;
    }>,
  ) => {
    setConsumptionDrafts((prev) => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] || {
          roll_variant_id: "",
          linear_used_m: "",
          catatan: "",
        }),
        ...patch,
      },
    }));
  };

  const handlePostConsumption = async (item: ProductionItem) => {
    const draft = consumptionDrafts[item.id];
    if (!draft?.roll_variant_id) {
      showMsg("error", "Pilih roll aktual terlebih dahulu");
      return;
    }
    try {
      await postProductionMaterialConsumptionAction({
        item_produksi_id: item.id,
        roll_variant_id: draft.roll_variant_id,
        linear_used_m: draft.linear_used_m ? Number(draft.linear_used_m) : null,
        operator_id: currentUser?.id || null,
        catatan: draft.catatan,
      });
      showMsg("success", "Konsumsi bahan produksi berhasil diposting");
      await reloadOrders();
    } catch (error: any) {
      console.error("Error posting consumption:", error);
      showMsg("error", error?.message || "Gagal posting konsumsi bahan");
    }
  };

  const handleVoidConsumption = async (item: ProductionItem) => {
    if (!item.consumption?.id) return;
    try {
      await voidProductionMaterialConsumptionAction(
        item.consumption.id,
        "Koreksi konsumsi produksi",
        currentUser?.id || null,
      );
      showMsg("success", "Konsumsi bahan dibatalkan");
      await reloadOrders();
    } catch (error: any) {
      console.error("Error voiding consumption:", error);
      showMsg("error", error?.message || "Gagal membatalkan konsumsi bahan");
    }
  };

  const handlePrintSPK = async (order: ProductionOrder) => {
    try {
      const spkContent = generateSPKHTML(order);
      const prepared = await preparePrintHtml(spkContent);
      const opened = openPrintDocument(prepared, "Cetak struk SPK");
      if (!opened) {
        showMsg(
          "error",
          "Gagal membuka window print. Izinkan pop-up untuk situs ini.",
        );
      }
    } catch (err) {
      console.error("Error mencetak SPK:", err);
      showMsg("error", "Gagal menyiapkan dokumen SPK untuk dicetak.");
    }
  };

  if (loading && orders.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-purple-600 border-t-transparent"></div>
          <p className="mt-4 text-[#0a1b3d] dark:text-slate-100 font-semibold">
            Memuat data produksi...
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {notice && (
        <ToastNotifikasi type={notice.type} message={notice.message} />
      )}

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-6">
        <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 text-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-white/20 rounded-lg">
                <svg
                  className="w-5 h-5 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <h3 className="text-base font-semibold uppercase tracking-wide">
                Menunggu
              </h3>
            </div>
          </div>
          <p className="text-3xl font-bold">
            {visibleOrders.filter((o) => o.status === "MENUNGGU").length}
          </p>
          <p className="text-base mt-2 text-yellow-100">Order baru</p>
        </div>

        <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-white/20 rounded-lg">
                <PrinterIcon size={20} className="text-white" />
              </div>
              <h3 className="text-base font-semibold uppercase tracking-wide">
                Proses
              </h3>
            </div>
          </div>
          <p className="text-3xl font-bold">
            {visibleOrders.filter((o) => o.status === "PROSES").length}
          </p>
          <p className="text-base mt-2 text-blue-100">Sedang dikerjakan</p>
        </div>

        <div className="bg-gradient-to-br from-teal-500 to-teal-600 text-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-white/20 rounded-lg">
                <svg
                  className="w-5 h-5 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                  />
                </svg>
              </div>
              <h3 className="text-base font-semibold uppercase tracking-wide">
                Siap Diambil
              </h3>
            </div>
          </div>
          <p className="text-3xl font-bold">
            {visibleOrders.filter((o) => o.status === "SIAP_AMBIL").length}
          </p>
          <p className="text-sm mt-2 text-teal-100">Menunggu pelanggan</p>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-white/20 rounded-lg">
                <svg
                  className="w-5 h-5 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h3 className="text-base font-semibold uppercase tracking-wide">
                Selesai
              </h3>
            </div>
          </div>
          <p className="text-3xl font-bold">
            {visibleOrders.filter((o) => o.status === "SELESAI").length}
          </p>
          <p className="text-base mt-2 text-green-100">Order selesai</p>
        </div>

        <div className="bg-gradient-to-br from-amber-700 to-amber-900 text-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-white/20 rounded-lg">
                <svg
                  className="w-5 h-5 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              </div>
              <h3 className="text-base font-semibold uppercase tracking-wide">
                Kilat
              </h3>
            </div>
          </div>
          <p className="text-3xl font-bold">
            {visibleOrders.filter((o) => o.prioritas === "KILAT").length}
          </p>
          <p className="text-base mt-2 opacity-90">Prioritas tinggi</p>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="flex-1 min-w-[250px]">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari SPK atau Pelanggan..."
                className="w-full pl-10 pr-4 py-2 border-2 border-gray-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 dark:bg-slate-800 dark:text-slate-100"
              />
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
          </div>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2.5 border-2 border-gray-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="ALL">Semua Status</option>
            <option value="MENUNGGU">Menunggu</option>
            <option value="PROSES">Proses</option>
            <option value="SIAP_AMBIL">Siap Diambil</option>
            <option value="SELESAI">Selesai</option>
            <option value="DIBATALKAN">Dibatalkan</option>
          </select>

          {/* Priority Filter */}
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="px-4 py-2.5 border-2 border-gray-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="ALL">Semua Prioritas</option>
            <option value="KILAT">Kilat</option>
            <option value="NORMAL">Normal</option>
          </select>

          {/* Refresh Button */}
          <button
            onClick={reloadOrders}
            className="px-4 py-2.5 bg-gradient-to-r from-amber-700 to-amber-900 text-white rounded-lg hover:shadow-lg transition-all flex items-center gap-2"
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
            Refresh
          </button>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-800 overflow-hidden">
        {filteredOrders.length === 0 ? (
          <div className="text-center py-12">
            <PrinterIcon size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 dark:text-slate-400 text-xl font-semibold">
              {searchQuery || filterStatus !== "ALL" || filterPriority !== "ALL"
                ? "Tidak ada order yang sesuai filter"
                : "Belum ada order produksi"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-amber-700 to-amber-900 text-white sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold uppercase tracking-wider">
                    SPK
                  </th>

                  <th className="px-6 py-3 text-left text-sm font-semibold uppercase tracking-wider">
                    Pelanggan
                  </th>
                  <th className="px-6 py-3 text-center text-sm font-semibold uppercase tracking-wider">
                    Item
                  </th>
                  <th className="px-6 py-3 text-center text-sm font-semibold uppercase tracking-wider">
                    Prioritas
                  </th>
                  <th className="px-6 py-3 text-center text-sm font-semibold uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-center text-sm font-semibold uppercase tracking-wider">
                    Tanggal
                  </th>
                  <th className="px-6 py-3 text-center text-sm font-semibold uppercase tracking-wider">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredOrders.map((order, idx) => (
                  <tr
                    key={order.id}
                    className={`hover:bg-amber-50 transition-colors ${
                      idx % 2 === 0
                        ? "bg-white dark:bg-slate-900"
                        : "bg-gray-50 dark:bg-slate-800"
                    }`}
                  >
                    <td className="px-6 py-4">
                      <div className="font-semibold text-amber-800 dark:text-amber-200">
                        {order.nomor_spk}
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="text-base font-medium text-gray-900 dark:text-slate-100">
                        {order.pelanggan_nama || "Pelanggan Umum"}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 font-semibold">
                        {order.total_item}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-bold ${getPriorityColor(
                          order.prioritas,
                        )}`}
                      >
                        {order.prioritas}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-sm font-semibold border-2 ${getStatusColor(
                          order.status,
                        )}`}
                      >
                        {labelStatus(order.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center text-base text-gray-600 dark:text-slate-300">
                      {order.dibuat_pada
                        ? new Date(order.dibuat_pada).toLocaleDateString(
                            "id-ID",
                          )
                        : "-"}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => {
                            setSelectedOrder(order);
                            setShowDetailModal(true);
                          }}
                          className="p-2 text-amber-700 dark:text-amber-300 hover:bg-slate-100 dark:hover:bg-white/10 dark:bg-amber-900/30 rounded-lg transition-colors"
                          title="Lihat Detail"
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
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                            />
                          </svg>
                        </button>
                        {order.status === "PROSES" && (
                          <button
                            onClick={() =>
                              handleUpdateStatus(order.id, "SIAP_AMBIL")
                            }
                            className="px-2.5 py-2 text-xs font-semibold text-teal-700 dark:text-teal-200 bg-teal-100 dark:bg-teal-900/30 hover:bg-teal-200 dark:hover:bg-teal-900/50 rounded-lg transition-colors"
                            title="Tandai siap diambil"
                          >
                            Siap Diambil
                          </button>
                        )}
                        <button
                          onClick={() => handlePrintSPK(order)}
                          className="p-2 text-orange-600 dark:text-orange-300 hover:bg-slate-100 dark:hover:bg-white/10 dark:bg-orange-900/30 rounded-lg transition-colors"
                          title="Cetak SPK"
                        >
                          <PrinterIcon size={20} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {showDetailModal && selectedOrder && (
        <SpkDetailModal
          order={selectedOrder}
          rollVariantsByItem={rollVariantsByItem}
          consumptionDrafts={consumptionDrafts}
          onClose={() => setShowDetailModal(false)}
          onUpdateItemStatus={handleUpdateItemStatus}
          onPatchDraft={patchConsumptionDraft}
          onPostConsumption={handlePostConsumption}
          onVoidConsumption={handleVoidConsumption}
          onUpdateOrderStatus={handleUpdateStatus}
          onEditCustomer={handleOpenCustomerEditor}
          onPrint={handlePrintSPK}
        />
      )}
      {showCustomerEditor && selectedOrder && (
        <div
          className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCustomerEditor(false);
          }}
        >
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-xl font-bold text-gray-900 dark:text-slate-100 mb-3">
              Ubah Nama Pelanggan
            </h3>
            <p className="text-sm text-gray-500 dark:text-slate-400 mb-2">
              Ketik nama bebas, atau pilih pelanggan terdaftar dari daftar.
            </p>
            <input
              list="spk-pelanggan-list"
              value={customerNameInput}
              onChange={(e) => setCustomerNameInput(e.target.value)}
              placeholder="Nama pelanggan"
              className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-100 mb-4"
              autoFocus
            />
            <datalist id="spk-pelanggan-list">
              {customerOptions.map((c) => (
                <option key={c.id} value={c.nama} />
              ))}
            </datalist>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCustomerEditor(false)}
                className="px-4 py-2.5 rounded-lg border border-gray-300 dark:border-slate-700 text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  const nama = customerNameInput.trim();
                  const match = customerOptions.find((c) => c.nama === nama);
                  if (match) {
                    handleSaveCustomerName({ pelanggan_id: match.id });
                  } else {
                    handleSaveCustomerName({ pelanggan_nama_snapshot: nama });
                  }
                }}
                disabled={!customerNameInput.trim()}
                className="px-4 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold disabled:opacity-50"
              >
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}
      <DialogKonfirmasi
        show={confirmState.show}
        title={confirmState.title}
        message={confirmState.message}
        confirmText="Ya, Lanjutkan"
        cancelText="Batal"
        onConfirm={() => { confirmState.onConfirm(); closeConfirm(); }}
        onCancel={closeConfirm}
        type={confirmState.type}
      />
    </>
  );
}
