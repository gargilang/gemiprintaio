"use client";

import { useState, useEffect, useMemo, useCallback, memo, useRef } from "react";
import AddMaterialModal from "@/components/AddMaterialModal";
import ConfirmDialog from "@/components/ConfirmDialog";
import { BoxIcon } from "@/components/icons/ContentIcons";
import NotificationToast, {
  NotificationToastProps,
} from "@/components/NotificationToast";
import {
  getMaterialsAction,
  getMaterialByIdAction as getMaterialById,
  createMaterialWithUnitPricesAction,
  updateMaterialWithUnitPricesAction,
  deleteMaterialAction,
  getCategoriesAction,
  getSubcategoriesAction,
  getUnitsAction,
  getQuickSpecsAction,
} from "./actions";

// Memoized Material Row Component - mencegah re-render yang tidak perlu
const MaterialRow = memo(
  ({
    material,
    index,
    onEdit,
    onDelete,
  }: {
    material: any;
    index: number;
    onEdit: (material: any) => void;
    onDelete: (material: any) => void;
  }) => {
    const defaultUnit = material.unit_prices?.find(
      (up: any) => up.default_status
    );
    const otherUnits = material.unit_prices?.filter(
      (up: any) => !up.default_status
    );

    return (
      <tr
        key={material.id}
        className={`border-b border-gray-200 hover:bg-emerald-50 transition-all cursor-default ${
          index % 2 === 0 ? "bg-white" : "bg-gray-50"
        }`}
      >
        <td className="px-4 py-3">
          <div className="font-semibold text-gray-800">{material.nama}</div>
          {material.spesifikasi && (
            <div className="text-xs text-gray-500 mt-1">
              {material.spesifikasi}
            </div>
          )}
          {!material.lacak_inventori_status && (
            <span className="inline-block mt-1 px-2 py-0.5 bg-gray-200 text-gray-600 rounded text-xs font-semibold">
              No Tracking
            </span>
          )}
        </td>
        <td className="px-4 py-3">
          <div className="text-sm text-gray-700">
            {material.category_name || "-"}
          </div>
          {material.subcategory_name && (
            <div className="text-xs text-gray-500">
              {material.subcategory_name}
            </div>
          )}
        </td>
        <td className="px-4 py-3">
          <span className="inline-block px-2 py-1 bg-gray-100 text-gray-700 rounded font-semibold text-sm">
            {material.satuan_dasar}
          </span>
        </td>
        <td className="px-4 py-3">
          <div className="space-y-1">
            {defaultUnit && (
              <div className="text-xs">
                <span className="font-semibold text-emerald-600">
                  {defaultUnit.nama_satuan}
                </span>
                : Rp {defaultUnit.harga_jual.toLocaleString("id-ID")}
                {defaultUnit.harga_member > 0 && (
                  <span className="text-blue-600">
                    {" "}
                    / Rp {defaultUnit.harga_member.toLocaleString("id-ID")}
                  </span>
                )}
              </div>
            )}
            {otherUnits && otherUnits.length > 0 && (
              <details className="text-xs text-gray-600">
                <summary className="cursor-pointer hover:text-emerald-600">
                  +{otherUnits.length} satuan lainnya
                </summary>
                <div className="mt-1 ml-2 space-y-0.5">
                  {otherUnits.map((up: any) => (
                    <div key={up.id}>
                      <span className="font-semibold">{up.nama_satuan}</span>:
                      Rp {up.harga_jual.toLocaleString("id-ID")}
                      {up.harga_member > 0 && (
                        <span className="text-blue-600">
                          {" "}
                          / Rp {up.harga_member.toLocaleString("id-ID")}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-right">
          {material.lacak_inventori_status ? (
            <>
              <div className="font-semibold text-gray-800">
                {material.jumlah_stok.toLocaleString("id-ID")}{" "}
                {material.satuan_dasar}
              </div>
              {material.jumlah_stok <= material.level_stok_minimum && (
                <span className="inline-block mt-1 px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-semibold">
                  Stok Menipis!
                </span>
              )}
            </>
          ) : (
            <span className="text-gray-400 text-sm">-</span>
          )}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => onEdit(material)}
              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title="Edit"
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
              onClick={() => onDelete(material)}
              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Hapus"
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
          </div>
        </td>
      </tr>
    );
  }
);

MaterialRow.displayName = "MaterialRow";

type Material = { id: string; [k: string]: any };

export default function MaterialsPage() {
  const [showModal, setShowModal] = useState(false);
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMaterial, setSelectedMaterial] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "stock" | "value">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [notice, setNotice] = useState<NotificationToastProps | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    show: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: "warning" | "danger" | "info";
    onConfirm: () => void;
  } | null>(null);

  // Virtualization state - untuk performance dengan banyak rows
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 50 });
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Helper function to update a single material in state without reloading
  function updateMaterialInState(updated: Material) {
    setMaterials((prev) =>
      prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m))
    );
  }

  // Filtered and sorted materials
  const filteredMaterials = useMemo(() => {
    let filtered = [...materials];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (m) =>
          m.nama.toLowerCase().includes(query) ||
          (m.category_name && m.category_name.toLowerCase().includes(query))
      );
    }

    // Apply low stock filter
    if (showLowStockOnly) {
      filtered = filtered.filter(
        (m) => m.lacak_inventori_status && m.jumlah_stok <= m.level_stok_minimum
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let comparison = 0;

      if (sortBy === "name") {
        comparison = a.nama.localeCompare(b.nama);
      } else if (sortBy === "stock") {
        comparison = a.jumlah_stok - b.jumlah_stok;
      } else if (sortBy === "value") {
        const aValue =
          a.jumlah_stok *
          (a.unit_prices?.find((up: any) => up.default_status)?.harga_beli ||
            0);
        const bValue =
          b.jumlah_stok *
          (b.unit_prices?.find((up: any) => up.default_status)?.harga_beli ||
            0);
        comparison = aValue - bValue;
      }

      return sortOrder === "asc" ? comparison : -comparison;
    });

    return filtered;
  }, [materials, searchQuery, showLowStockOnly, sortBy, sortOrder]);

  // Visible materials - hanya render yang terlihat (virtualization)
  const visibleMaterials = useMemo(() => {
    // Disable virtualization for lists with <= 100 items to avoid scrollbar issues
    if (filteredMaterials.length <= 100) return filteredMaterials;
    return filteredMaterials.slice(visibleRange.start, visibleRange.end);
  }, [filteredMaterials, visibleRange]);

  useEffect(() => {
    loadMaterials();
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
        filteredMaterials.length,
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
  }, [filteredMaterials.length]);

  // Reset scroll position when search changes
  useEffect(() => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTop = 0;
      setVisibleRange({ start: 0, end: 50 });
    }
  }, [searchQuery]);

  // Handle ESC key to close modals
  useEffect(() => {
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showModal) handleCloseModal();
        else if (confirmDialog?.show) setConfirmDialog(null);
      }
    };

    window.addEventListener("keydown", handleEscKey);
    return () => window.removeEventListener("keydown", handleEscKey);
  }, [showModal, confirmDialog]);

  const loadMaterials = async () => {
    try {
      setLoading(true);
      const materials = await getMaterialsAction();
      setMaterials(materials || []);
    } catch (error) {
      console.error("Error loading materials:", error);
      showNotification("error", "Gagal memuat data barang");
    } finally {
      setLoading(false);
    }
  };

  const showNotification = useCallback(
    (type: "success" | "error", message: string) => {
      setNotice({ type, message });
      setTimeout(() => setNotice(null), 3000);
    },
    []
  );

  const handleSuccess = async (message: string, updatedMaterial?: any) => {
    // If we have updated material data (from edit), update state directly
    if (updatedMaterial) {
      // Fetch full material data with category names if not present
      try {
        const material = await getMaterialById(updatedMaterial.id);
        if (material) {
          updateMaterialInState(material);
          showNotification("success", message);
        } else {
          // Fallback to full reload if fetch fails
          await loadMaterials();
          showNotification("success", message);
        }
      } catch (error) {
        console.error("Error fetching updated material:", error);
        // Fallback to full reload if error occurs
        await loadMaterials();
        showNotification("success", message);
      }
    } else {
      // For new materials, do a full reload
      await loadMaterials();
      showNotification("success", message);
    }
  };

  const handleEdit = (material: any) => {
    setSelectedMaterial(material);
    setShowModal(true);
  };

  const handleDelete = (material: any) => {
    setConfirmDialog({
      show: true,
      title: "Hapus Barang",
      message: `Yakin ingin menghapus barang "${material.nama}"?\n\nKategori: ${
        material.category_name || "-"
      }\nSpesifikasi: ${
        material.spesifikasi || "-"
      }\n\nData akan dihapus permanen dari database.`,
      confirmText: "Ya, Hapus",
      cancelText: "Batal",
      type: "danger",
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          await deleteMaterialAction(material.id);
          // Remove from local state instead of reloading
          setMaterials((prev) => prev.filter((m) => m.id !== material.id));
          showNotification(
            "success",
            `Barang "${material.nama}" berhasil dihapus`
          );
        } catch (error) {
          console.error("Error deleting material:", error);
          showNotification("error", "Terjadi kesalahan saat menghapus barang");
        }
      },
    });
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedMaterial(null);
  };

  const handleSort = (field: "name" | "stock" | "value") => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder(field === "stock" ? "asc" : "desc");
    }
  };

  // Calculate totals
  const totalItems = materials.length;
  const totalStockValue = materials.reduce((sum, m) => {
    const defaultUnit = m.unit_prices?.find((up: any) => up.default_status);
    const price = defaultUnit?.harga_beli || 0;
    return sum + m.jumlah_stok * price;
  }, 0);
  const lowStockItems = materials.filter(
    (m) => m.lacak_inventori_status && m.jumlah_stok <= m.level_stok_minimum
  ).length;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total Items */}
        <div className="bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl shadow-lg p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-white/20 rounded-lg">
                <BoxIcon size={20} className="text-white" />
              </div>
              <h3 className="text-base font-semibold uppercase tracking-wide">
                {searchQuery.trim() ? "Hasil Pencarian" : "Total Jenis Barang"}
              </h3>
            </div>
          </div>
          <p className="text-3xl font-bold">
            {searchQuery.trim() ? filteredMaterials.length : totalItems}
          </p>
          <p className="text-sm mt-2 text-emerald-100">
            {searchQuery.trim() ? `dari ${totalItems} item` : "Item terdaftar"}
          </p>
        </div>

        {/* Total Stock Value */}
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg p-6 text-white">
          <div className="flex items-center justify-between mb-2">
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
                    d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                  />
                </svg>
              </div>
              <h3 className="text-base font-semibold uppercase tracking-wide">
                Nilai Stok
              </h3>
            </div>
          </div>
          <p className="text-3xl font-bold">
            Rp {totalStockValue.toLocaleString("id-ID")}
          </p>
          <p className="text-sm mt-2 text-blue-100">Total nilai inventory</p>
        </div>

        {/* Low Stock Alert - Clickable */}
        <div
          onClick={() => setShowLowStockOnly(!showLowStockOnly)}
          className={`bg-gradient-to-br from-orange-500 to-red-500 rounded-xl shadow-lg p-6 text-white cursor-pointer hover:shadow-xl transition-all ${
            showLowStockOnly ? "ring-4 ring-orange-300" : ""
          }`}
        >
          <div className="flex items-center justify-between mb-2">
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
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <h3 className="text-base font-semibold uppercase tracking-wide">
                Stok Menipis
              </h3>
            </div>
            {showLowStockOnly && (
              <div className="bg-white/20 rounded-full px-2 py-1">
                <svg
                  className="w-4 h-4"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
            )}
          </div>
          <p className="text-3xl font-bold">{lowStockItems}</p>
          <p className="text-sm mt-2 text-orange-100">
            {showLowStockOnly
              ? "Menampilkan item menipis"
              : "Klik untuk filter"}
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setSelectedMaterial(null);
                setShowModal(true);
              }}
              className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-lg hover:from-emerald-600 hover:to-green-700 transition-all font-semibold shadow-md flex items-center gap-2"
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
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Tambah Barang
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <input
                type="text"
                placeholder="Cari barang atau kategori..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
              <svg
                className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"
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
        </div>
      </div>

      {/* Materials Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div
          ref={tableContainerRef}
          className="overflow-x-auto max-h-[600px] overflow-y-auto"
          style={{ scrollBehavior: "smooth" }}
        >
          <table className="w-full">
            <thead className="bg-gradient-to-r from-emerald-500 to-green-600 text-white sticky top-0 z-10">
              <tr>
                <th
                  className="px-4 py-3 text-left text-sm font-bold uppercase tracking-wider cursor-pointer hover:bg-white/10 transition-colors"
                  onClick={() => handleSort("name")}
                >
                  <div className="flex items-center gap-1">
                    Nama Barang
                    {sortBy === "name" && (
                      <span className="text-xs">
                        {sortOrder === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-sm font-bold uppercase tracking-wider">
                  Kategori
                </th>
                <th className="px-4 py-3 text-left text-sm font-bold uppercase tracking-wider">
                  Satuan Dasar
                </th>
                <th className="px-4 py-3 text-center text-sm font-bold uppercase tracking-wider">
                  Satuan Jual
                </th>
                <th
                  className="px-4 py-3 text-right text-sm font-bold uppercase tracking-wider cursor-pointer hover:bg-white/10 transition-colors"
                  onClick={() => handleSort("stock")}
                >
                  <div className="flex items-center justify-end gap-1">
                    Stok
                    {sortBy === "stock" && (
                      <span className="text-xs">
                        {sortOrder === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </div>
                </th>
                <th className="px-4 py-3 text-center text-sm font-bold uppercase tracking-wider">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <svg
                        className="animate-spin h-6 w-6 text-emerald-500"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      <span className="text-gray-500">Memuat data...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredMaterials.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-gray-500"
                  >
                    <div className="flex flex-col items-center gap-3">
                      <BoxIcon size={48} className="text-gray-300" />
                      <p className="text-lg font-semibold">
                        {searchQuery.trim()
                          ? "Tidak ada barang yang sesuai"
                          : "Belum ada data barang"}
                      </p>
                      <p className="text-sm">
                        {searchQuery.trim()
                          ? `Tidak ditemukan barang dengan keyword "${searchQuery}"`
                          : 'Klik tombol "Tambah Barang" untuk menambahkan data baru'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                visibleMaterials.map((material, idx) => (
                  <MaterialRow
                    key={material.id}
                    material={material}
                    index={visibleRange.start + idx}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Material Modal */}
      <AddMaterialModal
        isOpen={showModal}
        onClose={handleCloseModal}
        onSuccess={handleSuccess}
        showNotification={showNotification}
        editData={selectedMaterial}
        onCreateMaterial={createMaterialWithUnitPricesAction}
        onUpdateMaterial={updateMaterialWithUnitPricesAction}
        onGetCategories={getCategoriesAction}
        onGetSubcategories={getSubcategoriesAction}
        onGetUnits={getUnitsAction}
        onGetQuickSpecs={getQuickSpecsAction}
      />

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

      {/* Notification Toast */}
      {notice && (
        <NotificationToast type={notice.type} message={notice.message} />
      )}
    </div>
  );
}
