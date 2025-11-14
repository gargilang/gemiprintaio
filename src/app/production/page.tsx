"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import NotificationToast, {
  NotificationToastProps,
} from "@/components/NotificationToast";
import { PrinterIcon } from "@/components/icons/PageIcons";
import {
  getProductionOrders,
  updateProductionOrderStatus,
  updateProductionItemStatus,
  type ProductionOrder,
  type ProductionItem,
  type FinishingItem,
} from "@/lib/services/production-service";

interface User {
  id: string;
  nama_pengguna: string;
  role: string;
}

export default function ProductionPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<ProductionOrder[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [filterPriority, setFilterPriority] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<ProductionOrder | null>(
    null
  );
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [notice, setNotice] = useState<NotificationToastProps | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [orders, filterStatus, filterPriority, searchQuery]);

  const checkAuth = () => {
    const userSession = localStorage.getItem("user");
    if (!userSession) {
      router.push("/auth/login");
      return;
    }
    const user = JSON.parse(userSession);
    setCurrentUser(user);
    loadOrders();
  };

  const loadOrders = async () => {
    setLoading(true);
    try {
      const orders = await getProductionOrders();
      setOrders(orders);
    } catch (error) {
      console.error("Error loading production orders:", error);
      showMsg("error", "Gagal memuat data produksi");
    }
    setLoading(false);
  };

  const applyFilters = () => {
    let filtered = [...orders];

    // Filter by status
    if (filterStatus !== "ALL") {
      filtered = filtered.filter((order) => order.status === filterStatus);
    }

    // Filter by priority
    if (filterPriority !== "ALL") {
      filtered = filtered.filter((order) => order.prioritas === filterPriority);
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (order) =>
          order.nomor_spk.toLowerCase().includes(query) ||
          order.nomor_invoice?.toLowerCase().includes(query) ||
          order.pelanggan_nama?.toLowerCase().includes(query)
      );
    }

    setFilteredOrders(filtered);
  };

  const showMsg = (type: "success" | "error", message: string) => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 3000);
  };

  const handleUpdateStatus = async (
    orderId: string,
    newStatus: "MENUNGGU" | "PROSES" | "SELESAI" | "DIBATALKAN"
  ) => {
    try {
      await updateProductionOrderStatus(orderId, newStatus);
      showMsg("success", "Status berhasil diperbarui");
      loadOrders();
    } catch (error) {
      console.error("Error updating status:", error);
      showMsg("error", "Gagal memperbarui status");
    }
  };

  const handleUpdateItemStatus = async (
    itemId: string,
    newStatus: "MENUNGGU" | "PRINTING" | "FINISHING" | "SELESAI"
  ) => {
    try {
      await updateProductionItemStatus(itemId, { status: newStatus });
      showMsg("success", "Status item berhasil diperbarui");
      loadOrders();
    } catch (error) {
      console.error("Error updating item status:", error);
      showMsg("error", "Gagal memperbarui status item");
    }
  };

  const handlePrintSPK = (order: ProductionOrder) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      showMsg("error", "Gagal membuka window print");
      return;
    }

    const spkContent = generateSPKHTML(order);
    printWindow.document.write(spkContent);
    printWindow.document.close();
    printWindow.focus();

    // Auto-print removed - user can manually trigger print with Ctrl+P
  };

  const generateSPKHTML = (order: ProductionOrder) => {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>SPK - ${order.nomor_spk}</title>
  <style>
    @font-face {
      font-family: 'Bauhaus 93';
      src: url('/assets/fonts/BAUHS93.ttf') format('truetype');
      font-weight: normal;
      font-style: normal;
    }
    @font-face {
      font-family: 'TW Cen MT';
      src: url('/assets/fonts/Tw Cen MT.ttf') format('truetype');
      font-weight: normal;
      font-style: normal;
    }
    @font-face {
      font-family: 'TW Cen MT';
      src: url('/assets/fonts/TwCenMTStdItalic.otf') format('opentype');
      font-weight: normal;
      font-style: italic;
    }
    @font-face {
      font-family: 'TW Cen MT';
      src: url('/assets/fonts/TwCenMTStdBold.otf') format('opentype');
      font-weight: bold;
      font-style: normal;
    }
    @page {
      size: 80mm auto;
      margin: 5mm;
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'TW Cen MT', 'Arial', sans-serif;
      font-size: 11px;
      line-height: 1.4;
      width: 72mm;
      margin: 0 auto;
      padding: 8px;
    }
    .header {
      text-align: center;
      margin-bottom: 8px;
      padding-bottom: 8px;
      border-bottom: 2px dashed #000;
    }
    .logo-image {
      width: 48px;
      height: 48px;
      margin: 0 auto 8px;
    }
    .logo {
      font-family: 'Bauhaus 93', serif;
      font-size: 28px;
      font-weight: normal;
      font-style: italic;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }
    .logo-gemi {
      color: #00afef;
    }
    .logo-print {
      color: #0a1b3d;
    }
    .subtitle {
      font-family: 'TW Cen MT', sans-serif;
      font-size: 10px;
      margin-top: 2px;
      font-weight: bold;
    }
    .spk-title {
      font-size: 14px;
      font-weight: bold;
      margin: 8px 0;
      text-align: center;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      margin: 3px 0;
      font-size: 10px;
    }
    .info-label {
      font-weight: bold;
    }
    .divider {
      border-top: 1px dashed #000;
      margin: 8px 0;
    }
    .items {
      margin: 8px 0;
    }
    .item {
      margin: 6px 0;
      padding: 6px;
      border: 1px solid #000;
    }
    .item-name {
      font-weight: bold;
      font-size: 11px;
    }
    .item-detail {
      font-size: 10px;
      margin: 2px 0;
    }
    .finishing {
      margin-top: 4px;
      padding-top: 4px;
      border-top: 1px dotted #666;
      font-size: 9px;
    }
    .priority {
      display: inline-block;
      padding: 2px 6px;
      border: 1px solid #000;
      font-weight: bold;
      font-size: 10px;
    }
    .priority-KILAT {
      background: #000;
      color: #fff;
    }
    .footer {
      margin-top: 10px;
      padding-top: 8px;
      border-top: 2px dashed #000;
      text-align: center;
      font-size: 9px;
    }
  </style>
</head>
<body>
  <div class="header">
    <svg class="logo-image" viewBox="0 0 38 45" xmlns="http://www.w3.org/2000/svg">
      <path fill-rule="evenodd" clip-rule="evenodd" d="M11.1519 0.00085052H29.1766C38.4569 0.00085052 42.4009 44.1129 24.9542 44.1006H9.98877C27.0196 43.0487 25.6697 -0.221045 11.1484 0.00085052H11.1519Z" fill="#373435"/>
      <path fill-rule="evenodd" clip-rule="evenodd" d="M9.08292 1.29121C-0.976261 1.29121 -2.18167 22.7863 3.02062 29.2213C4.54324 31.1074 5.59357 31.054 7.54972 30.1171C9.44595 29.209 11.0496 27.4215 11.395 24.0725C11.885 18.6237 9.79841 16.7993 6.86595 13.5119H14.5707C15.0042 11.1574 15.7197 8.8932 16.6925 6.9701C14.9267 3.54304 12.3714 1.31176 9.07587 1.31176V1.29943L9.08292 1.29121Z" fill="#00AFEF"/>
      <path fill-rule="evenodd" clip-rule="evenodd" d="M7.17259 43.4268C2.76685 43.02 1.19136 40.7312 0.377177 36.396L16.9181 36.2028C14.8139 40.2052 11.3633 43.0118 7.17259 43.4268Z" fill="#00AFEF"/>
      <path fill-rule="evenodd" clip-rule="evenodd" d="M10.4293 14.868C14.5284 18.3608 14.3733 28.8885 9.61513 30.7582C9.31554 30.8773 8.32513 31.0088 8.66349 31.0088L10.4399 31.0129H19.0011C20.2488 27.7831 20.3757 18.8744 19.5756 14.868H10.4293Z" fill="#00AFEF"/>
    </svg>
    <div class="logo">
      <span class="logo-gemi">gemi</span><span class="logo-print">print</span>
    </div>
    <div class="subtitle">SURAT PERINTAH KERJA</div>
  </div>

  <div class="spk-title">SPK #${order.nomor_spk}</div>

  <div class="info-row">
    <span class="info-label">Invoice:</span>
    <span>${order.nomor_invoice || "-"}</span>
  </div>
  <div class="info-row">
    <span class="info-label">Pelanggan:</span>
    <span>${order.pelanggan_nama || "Walk-in"}</span>
  </div>
  <div class="info-row">
    <span class="info-label">Tanggal:</span>
    <span>${
      order.dibuat_pada
        ? new Date(order.dibuat_pada).toLocaleString("id-ID", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "-"
    }</span>
  </div>
  ${
    order.tanggal_deadline
      ? `
  <div class="info-row">
    <span class="info-label">Deadline:</span>
    <span>${new Date(order.tanggal_deadline).toLocaleDateString("id-ID")}</span>
  </div>
  `
      : ""
  }
  <div class="info-row">
    <span class="info-label">Prioritas:</span>
    <span class="priority priority-${order.prioritas}">${order.prioritas}</span>
  </div>

  <div class="divider"></div>

  <div class="items">
    ${(order.items || [])
      .map(
        (item, idx) => `
    <div class="item">
      <div class="item-name">${idx + 1}. ${item.barang_nama}</div>
      <div class="item-detail">Jumlah: ${item.jumlah} ${item.nama_satuan}</div>
      ${
        item.panjang && item.lebar
          ? `<div class="item-detail">Ukuran: ${item.panjang} x ${item.lebar} cm</div>`
          : ""
      }
      ${
        item.jenis_bahan
          ? `<div class="item-detail">Bahan: ${item.jenis_bahan}</div>`
          : ""
      }
      ${
        item.mesin_printing
          ? `<div class="item-detail">Mesin: ${item.mesin_printing}</div>`
          : ""
      }
      ${
        item.finishing && item.finishing.length > 0
          ? `
      <div class="finishing">
        <strong>Finishing:</strong><br>
        ${item.finishing
          .map(
            (f) =>
              `- ${f.jenis_finishing}${
                f.keterangan ? ` (${f.keterangan})` : ""
              }`
          )
          .join("<br>")}
      </div>
      `
          : ""
      }
      ${
        item.catatan_produksi
          ? `<div class="item-detail"><strong>Catatan:</strong> ${item.catatan_produksi}</div>`
          : ""
      }
    </div>
    `
      )
      .join("")}
  </div>

  ${
    order.catatan
      ? `
  <div class="divider"></div>
  <div class="item-detail"><strong>Catatan Umum:</strong><br>${order.catatan}</div>
  `
      : ""
  }

  <div class="footer">
    <div>Terima kasih!</div>
    <div style="margin-top: 4px;">www.gemiprint.com</div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 100);
    }
  </script>
</body>
</html>
    `;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "MENUNGGU":
        return "bg-yellow-100 text-yellow-800 border-yellow-300";
      case "PROSES":
        return "bg-blue-100 text-blue-800 border-blue-300";
      case "SELESAI":
        return "bg-green-100 text-green-800 border-green-300";
      case "DIBATALKAN":
        return "bg-red-100 text-red-800 border-red-300";
      case "PRINTING":
        return "bg-purple-100 text-purple-800 border-purple-300";
      case "FINISHING":
        return "bg-orange-100 text-orange-800 border-orange-300";
      default:
        return "bg-gray-100 text-gray-800 border-gray-300";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "KILAT":
        return "bg-red-600 text-white";
      case "NORMAL":
        return "bg-blue-500 text-white";
      default:
        return "bg-gray-400 text-white";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-purple-600 border-t-transparent"></div>
          <p className="mt-4 text-[#0a1b3d] font-semibold">
            Memuat data produksi...
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {notice && (
        <NotificationToast type={notice.type} message={notice.message} />
      )}

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 text-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-white/20 rounded-lg">
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
            {orders.filter((o) => o.status === "MENUNGGU").length}
          </p>
          <p className="text-sm mt-2 text-yellow-100">Order baru</p>
        </div>

        <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-white/20 rounded-lg">
                <PrinterIcon size={20} />
              </div>
              <h3 className="text-base font-semibold uppercase tracking-wide">
                Proses
              </h3>
            </div>
          </div>
          <p className="text-3xl font-bold">
            {orders.filter((o) => o.status === "PROSES").length}
          </p>
          <p className="text-sm mt-2 text-blue-100">Sedang dikerjakan</p>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-white/20 rounded-lg">
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
            {orders.filter((o) => o.status === "SELESAI").length}
          </p>
          <p className="text-sm mt-2 text-green-100">Order selesai</p>
        </div>

        <div className="bg-gradient-to-br from-amber-700 to-amber-900 text-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-white/20 rounded-lg">
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
            {orders.filter((o) => o.prioritas === "KILAT").length}
          </p>
          <p className="text-sm mt-2 opacity-90">Prioritas tinggi</p>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="flex-1 min-w-[250px]">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari SPK, Invoice, atau Pelanggan..."
                className="w-full pl-10 pr-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
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
            className="px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
          >
            <option value="ALL">Semua Status</option>
            <option value="MENUNGGU">Menunggu</option>
            <option value="PROSES">Proses</option>
            <option value="SELESAI">Selesai</option>
            <option value="DIBATALKAN">Dibatalkan</option>
          </select>

          {/* Priority Filter */}
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
          >
            <option value="ALL">Semua Prioritas</option>
            <option value="KILAT">Kilat</option>
            <option value="NORMAL">Normal</option>
          </select>

          {/* Refresh Button */}
          <button
            onClick={loadOrders}
            className="px-4 py-2 bg-gradient-to-r from-amber-700 to-amber-900 text-white rounded-lg hover:shadow-lg transition-all flex items-center gap-2"
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
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {filteredOrders.length === 0 ? (
          <div className="text-center py-12">
            <PrinterIcon size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 text-lg font-semibold">
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
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider">
                    SPK
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider">
                    Invoice
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider">
                    Pelanggan
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider">
                    Item
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider">
                    Prioritas
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider">
                    Tanggal
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredOrders.map((order, idx) => (
                  <tr
                    key={order.id}
                    className={`hover:bg-amber-50 transition-colors ${
                      idx % 2 === 0 ? "bg-white" : "bg-gray-50"
                    }`}
                  >
                    <td className="px-6 py-4">
                      <div className="font-semibold text-amber-800">
                        {order.nomor_spk}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-600">
                        {order.nomor_invoice}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">
                        {order.pelanggan_nama || "Walk-in"}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 text-amber-800 font-semibold">
                        {order.total_item}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-bold ${getPriorityColor(
                          order.prioritas
                        )}`}
                      >
                        {order.prioritas}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <select
                        value={order.status}
                        onChange={(e) =>
                          handleUpdateStatus(
                            order.id,
                            e.target.value as
                              | "MENUNGGU"
                              | "PROSES"
                              | "SELESAI"
                              | "DIBATALKAN"
                          )
                        }
                        className={`px-3 py-1 rounded-full text-xs font-semibold border-2 cursor-pointer ${getStatusColor(
                          order.status
                        )}`}
                      >
                        <option value="MENUNGGU">MENUNGGU</option>
                        <option value="PROSES">PROSES</option>
                        <option value="SELESAI">SELESAI</option>
                        <option value="DIBATALKAN">DIBATALKAN</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600">
                      {order.dibuat_pada
                        ? new Date(order.dibuat_pada).toLocaleDateString(
                            "id-ID"
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
                          className="p-2 text-amber-700 hover:bg-amber-100 rounded-lg transition-colors"
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
                        <button
                          onClick={() => handlePrintSPK(order)}
                          className="p-2 text-orange-600 hover:bg-orange-100 rounded-lg transition-colors"
                          title="Print SPK"
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
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-amber-700 to-amber-900">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <PrinterIcon size={24} />
                  Detail SPK - {selectedOrder.nomor_spk}
                </h3>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="text-white hover:bg-white/20 rounded-lg p-2 transition-colors"
                >
                  <svg
                    className="w-6 h-6"
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
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
              {/* Order Info */}
              <div className="grid grid-cols-2 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
                <div>
                  <div className="text-sm text-gray-600 mb-1">Invoice</div>
                  <div className="font-semibold">
                    {selectedOrder.nomor_invoice}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 mb-1">Pelanggan</div>
                  <div className="font-semibold">
                    {selectedOrder.pelanggan_nama || "Walk-in"}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 mb-1">Prioritas</div>
                  <span
                    className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${getPriorityColor(
                      selectedOrder.prioritas
                    )}`}
                  >
                    {selectedOrder.prioritas}
                  </span>
                </div>
                <div>
                  <div className="text-sm text-gray-600 mb-1">Status</div>
                  <span
                    className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border-2 ${getStatusColor(
                      selectedOrder.status
                    )}`}
                  >
                    {selectedOrder.status}
                  </span>
                </div>
              </div>

              {/* Items */}
              <div className="space-y-4">
                <h4 className="font-bold text-lg text-gray-900 mb-4">
                  Item Produksi ({selectedOrder.items?.length || 0})
                </h4>
                {(selectedOrder.items || []).map((item, idx) => (
                  <div
                    key={item.id}
                    className="border-2 border-gray-200 rounded-lg p-4 hover:border-amber-400 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="font-bold text-gray-900 mb-1">
                          {idx + 1}. {item.barang_nama}
                        </div>
                        <div className="text-sm text-gray-600">
                          Jumlah: {item.jumlah} {item.nama_satuan}
                        </div>
                        {item.panjang && item.lebar && (
                          <div className="text-sm text-gray-600">
                            Ukuran: {item.panjang} x {item.lebar} cm
                          </div>
                        )}
                        {item.jenis_bahan && (
                          <div className="text-sm text-gray-600">
                            Bahan: {item.jenis_bahan}
                          </div>
                        )}
                        {item.mesin_printing && (
                          <div className="text-sm text-gray-600">
                            Mesin: {item.mesin_printing}
                          </div>
                        )}
                      </div>
                      <select
                        value={item.status}
                        onChange={(e) =>
                          handleUpdateItemStatus(
                            item.id,
                            e.target.value as
                              | "MENUNGGU"
                              | "PRINTING"
                              | "FINISHING"
                              | "SELESAI"
                          )
                        }
                        className={`px-3 py-1 rounded-full text-xs font-semibold border-2 cursor-pointer ${getStatusColor(
                          item.status
                        )}`}
                      >
                        <option value="MENUNGGU">MENUNGGU</option>
                        <option value="PRINTING">PRINTING</option>
                        <option value="FINISHING">FINISHING</option>
                        <option value="SELESAI">SELESAI</option>
                      </select>
                    </div>

                    {/* Finishing */}
                    {item.finishing && item.finishing.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <div className="text-sm font-semibold text-gray-700 mb-2">
                          Finishing:
                        </div>
                        <div className="space-y-2">
                          {item.finishing.map((fin) => (
                            <div
                              key={fin.id}
                              className="flex items-center justify-between bg-orange-50 px-3 py-2 rounded-lg"
                            >
                              <div className="flex-1">
                                <span className="font-medium text-gray-900">
                                  {fin.jenis_finishing}
                                </span>
                                {fin.keterangan && (
                                  <span className="text-sm text-gray-600 ml-2">
                                    ({fin.keterangan})
                                  </span>
                                )}
                              </div>
                              <span
                                className={`px-2 py-1 rounded text-xs font-semibold ${getStatusColor(
                                  fin.status
                                )}`}
                              >
                                {fin.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {item.catatan_produksi && (
                      <div className="mt-3 pt-3 border-t border-gray-200 text-sm text-gray-600">
                        <strong>Catatan:</strong> {item.catatan_produksi}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {selectedOrder.catatan && (
                <div className="mt-6 p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded">
                  <div className="font-semibold text-gray-900 mb-1">
                    Catatan Umum:
                  </div>
                  <div className="text-sm text-gray-700">
                    {selectedOrder.catatan}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
              <button
                onClick={() => setShowDetailModal(false)}
                className="px-6 py-2 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-semibold"
              >
                Tutup
              </button>
              <button
                onClick={() => {
                  handlePrintSPK(selectedOrder);
                  setShowDetailModal(false);
                }}
                className="px-6 py-2 bg-gradient-to-r from-amber-700 to-amber-900 text-white rounded-lg hover:shadow-lg transition-all font-semibold flex items-center gap-2"
              >
                <PrinterIcon size={18} />
                Print SPK
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
