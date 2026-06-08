"use client";

import { useState, useEffect, useMemo, useCallback, memo, useRef } from "react";
import ModalTambahBarang from "@/components/ModalTambahBarang";
import DialogKonfirmasi from "@/components/DialogKonfirmasi";
import ModalCatatRusak from "./ModalCatatRusak";
import ModalKonversiRoll from "./ModalKonversiRoll";
import { BoxIcon } from "@/components/icons/ContentIcons";
import MenuAksi from "@/components/MenuAksi";
import ToastNotifikasi, {
  NotificationToastProps,
} from "@/components/ToastNotifikasi";
import {
  getMaterialsAction,
  getMaterialByIdAction as getMaterialById,
  createMaterialWithUnitPricesAction,
  updateMaterialWithUnitPricesAction,
  deleteMaterialAction,
  getInventoryMovementsAction,
  createInventoryAdjustmentAction,
  getCategoriesAction,
  getSubcategoriesAction,
  getUnitsAction,
  getQuickSpecsAction,
} from "./actions";
import { useCachedData } from "@/lib/use-cached-data";

// Memoized Material Row Component — avoids unnecessary re-renders
const MaterialRow = memo(
  ({
    material,
    index,
    onEdit,
    onDelete,
    onViewMovements,
    onAdjustStock,
    onWasteMaterial,
    onConvertRoll,
  }: {
    material: any;
    index: number;
    onEdit: (material: any) => void;
    onDelete: (material: any) => void;
    onViewMovements: (material: any) => void;
    onAdjustStock: (material: any) => void;
    onWasteMaterial: (material: any) => void;
    onConvertRoll: (material: any) => void;
  }) => {
    const defaultUnit = material.unit_prices?.find(
      (up: any) => up.default_status
    );
    const otherUnits = material.unit_prices?.filter(
      (up: any) => !up.default_status
    );
    const averageCostPerBaseUnit =
      Number(material.average_cost_per_base_unit || 0) ||
      (defaultUnit?.harga_beli && defaultUnit?.faktor_konversi
        ? Number(defaultUnit.harga_beli) / Number(defaultUnit.faktor_konversi)
        : 0);

    return (
      <tr
        key={material.id}
        className={`border-b border-gray-200 dark:border-slate-800 hover:bg-emerald-50 transition-all cursor-default ${
          index % 2 === 0 ? "bg-white dark:bg-slate-900" : "bg-gray-50 dark:bg-slate-800"
        }`}
      >
        <td className="px-4 py-3">
          <div className="font-semibold text-gray-800 dark:text-slate-100">{material.nama}</div>
          {material.spesifikasi && (
            <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">
              {material.spesifikasi}
            </div>
          )}
          {!material.lacak_inventori_status && (
            <span className="inline-block mt-1 px-2 py-0.5 bg-gray-200 text-gray-600 dark:text-slate-300 rounded text-xs font-semibold">
              No Tracking
            </span>
          )}
        </td>
        <td className="px-4 py-3">
          <div className="text-sm text-gray-700 dark:text-slate-300">
            {material.category_name || "-"}
          </div>
          {material.subcategory_name && (
            <div className="text-xs text-gray-500 dark:text-slate-400">
              {material.subcategory_name}
            </div>
          )}
        </td>
        <td className="px-4 py-3">
          <span className="inline-block px-2 py-1 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded font-semibold text-sm">
            {material.satuan_dasar}
          </span>
        </td>
        <td className="px-4 py-3">
          <div className="space-y-1">
            {defaultUnit && (
              <div className="text-xs">
                <span className="font-semibold text-emerald-600 dark:text-emerald-300">
                  {defaultUnit.nama_satuan}
                </span>
                : Rp {defaultUnit.harga_jual.toLocaleString("id-ID")}
                {defaultUnit.harga_member > 0 && (
                  <span className="text-blue-600 dark:text-blue-300">
                    {" "}
                    / Rp {defaultUnit.harga_member.toLocaleString("id-ID")}
                  </span>
                )}
              </div>
            )}
            {otherUnits && otherUnits.length > 0 && (
              <details className="text-xs text-gray-600 dark:text-slate-300">
                <summary className="cursor-pointer hover:text-emerald-600 dark:text-emerald-300">
                  +{otherUnits.length} satuan lainnya
                </summary>
                <div className="mt-1 ml-2 space-y-0.5">
                  {otherUnits.map((up: any) => (
                    <div key={up.id}>
                      <span className="font-semibold">{up.nama_satuan}</span>:
                      Rp {up.harga_jual.toLocaleString("id-ID")}
                      {up.harga_member > 0 && (
                        <span className="text-blue-600 dark:text-blue-300">
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
              <div className="font-semibold text-gray-800 dark:text-slate-100">
                {material.jumlah_stok.toLocaleString("id-ID")}{" "}
                {material.satuan_dasar}
              </div>
              {Array.isArray((material as any).roll_variants) &&
                (material as any).roll_variants.length > 0 && (
                  <div className="mt-1 text-[11px] text-gray-500 dark:text-slate-400 space-y-0.5">
                    {(material as any).roll_variants.map((roll: any) => (
                      <div key={roll.id}>
                        {Number(roll.lebar_m).toFixed(2)}m:{" "}
                        {Number(roll.panjang_tersedia_m).toFixed(2)}m
                      </div>
                    ))}
                  </div>
                )}
              {material.jumlah_stok <= material.level_stok_minimum && (
                <span className="inline-block mt-1 px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 rounded text-xs font-semibold">
                  Stok Menipis!
                </span>
              )}
            </>
          ) : (
            <span className="text-gray-400 text-sm">-</span>
          )}
        </td>
        <td className="px-4 py-3 text-right">
          <div className="font-semibold text-gray-800 dark:text-slate-100">
            Rp {averageCostPerBaseUnit.toLocaleString("id-ID")}
          </div>
          <div className="text-xs text-gray-500 dark:text-slate-400">
            per {material.satuan_dasar}
          </div>
        </td>
        <td className="px-4 py-3">
          <MenuAksi
            labelMenu={`Aksi untuk ${material.nama}`}
            aksi={[
              {
                label: "Riwayat Stok",
                judul: "Riwayat stok",
                tampil: !!material.lacak_inventori_status,
                onClick: () => onViewMovements(material),
                ikon: (
                  <svg className="w-5 h-5 text-slate-600 dark:text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ),
              },
              {
                label: "Adjustment Stok",
                judul: "Adjustment stok",
                tampil: !!material.lacak_inventori_status,
                onClick: () => onAdjustStock(material),
                ikon: (
                  <svg className="w-5 h-5 text-amber-600 dark:text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v12m6-6H6" />
                  </svg>
                ),
              },
              {
                label: "Catat Rusak / Scrap",
                judul: "Catat barang rusak / scrap",
                tampil: !!material.lacak_inventori_status,
                onClick: () => onWasteMaterial(material),
                ikon: (
                  <svg className="w-5 h-5 text-rose-600 dark:text-rose-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
                  </svg>
                ),
              },
              {
                label: "Konversi Roll",
                judul: "Konversi roll (potong roll jadi lebar baru)",
                tampil:
                  !!material.lacak_inventori_status &&
                  Number(material.butuh_dimensi_status) === 1,
                onClick: () => onConvertRoll(material),
                ikon: (
                  <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" />
                  </svg>
                ),
              },
              {
                label: "Edit",
                judul: "Edit",
                onClick: () => onEdit(material),
                ikon: (
                  <svg className="w-5 h-5 text-blue-600 dark:text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                ),
              },
              {
                label: "Hapus",
                judul: "Hapus",
                varian: "bahaya",
                onClick: () => onDelete(material),
                ikon: (
                  <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                ),
              },
            ]}
          />
        </td>
      </tr>
    );
  }
);

MaterialRow.displayName = "MaterialRow";

type Material = { id: string; [k: string]: any };

export default function MaterialsPage() {
  const [showModal, setShowModal] = useState(false);
  const {
    data: materialsData,
    isLoading: materialsLoading,
    mutate: mutateMaterials,
  } = useCachedData<any[]>("materials", async () => {
    const list = await getMaterialsAction();
    return (list as any[]) || [];
  });
  // Placeholder sistem untuk pekerjaan maklon. Wajib ada di DB (dipakai keras
  // oleh jalur maklon di POS), tapi bukan barang katalog — sembunyikan dari
  // daftar Barang supaya tidak membingungkan pengguna. API tetap
  // mengembalikannya untuk POS/proses maklon.
  const materials = useMemo(
    () => (materialsData ?? []).filter((m) => m.id !== "barang-jasa-maklon"),
    [materialsData]
  );
  const setMaterials = useCallback<
    (next: any[] | ((prev: any[]) => any[])) => void
  >(
    (next) => {
      void mutateMaterials(
        (prev) => {
          const base = (prev as any[] | undefined) ?? [];
          return typeof next === "function"
            ? (next as (p: any[]) => any[])(base)
            : next;
        },
        { revalidate: false }
      );
    },
    [mutateMaterials]
  );
  const loading = materialsLoading;
  const [selectedMaterial, setSelectedMaterial] = useState<any>(null);
  const [movementMaterial, setMovementMaterial] = useState<any>(null);
  const [movementRows, setMovementRows] = useState<any[]>([]);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [adjustMaterial, setAdjustMaterial] = useState<any>(null);
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [savingAdjustment, setSavingAdjustment] = useState(false);
  const [wasteMaterial, setWasteMaterial] = useState<any>(null);
  const [convertMaterial, setConvertMaterial] = useState<any>(null);
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

  // Virtualization state — for performance with many rows
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 50 });
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Helper function to update a single material in state without reloading
  function updateMaterialInState(updated: Material) {
    setMaterials((prev: any[]) =>
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
        const aDefaultUnit = a.unit_prices?.find((up: any) => up.default_status);
        const bDefaultUnit = b.unit_prices?.find((up: any) => up.default_status);
        const aCost =
          Number(a.average_cost_per_base_unit || 0) ||
          (aDefaultUnit?.harga_beli && aDefaultUnit?.faktor_konversi
            ? Number(aDefaultUnit.harga_beli) / Number(aDefaultUnit.faktor_konversi)
            : 0);
        const bCost =
          Number(b.average_cost_per_base_unit || 0) ||
          (bDefaultUnit?.harga_beli && bDefaultUnit?.faktor_konversi
            ? Number(bDefaultUnit.harga_beli) / Number(bDefaultUnit.faktor_konversi)
            : 0);
        const aValue = a.jumlah_stok * aCost;
        const bValue = b.jumlah_stok * bCost;
        comparison = aValue - bValue;
      }

      return sortOrder === "asc" ? comparison : -comparison;
    });

    return filtered;
  }, [materials, searchQuery, showLowStockOnly, sortBy, sortOrder]);

  // Visible materials — only render visible rows (virtualization)
  const visibleMaterials = useMemo(() => {
    // Disable virtualization for lists with <= 100 items to avoid scrollbar issues
    if (filteredMaterials.length <= 100) return filteredMaterials;
    return filteredMaterials.slice(visibleRange.start, visibleRange.end);
  }, [filteredMaterials, visibleRange]);

  // SWR auto-fetches on mount via useCachedData; no manual call needed.

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
        else if (movementMaterial) setMovementMaterial(null);
        else if (adjustMaterial) setAdjustMaterial(null);
        else if (wasteMaterial) setWasteMaterial(null);
        else if (convertMaterial) setConvertMaterial(null);
        else if (confirmDialog?.show) setConfirmDialog(null);
      }
    };

    window.addEventListener("keydown", handleEscKey);
    return () => window.removeEventListener("keydown", handleEscKey);
  }, [showModal, movementMaterial, adjustMaterial, wasteMaterial, convertMaterial, confirmDialog]);

  const loadMaterials = async () => {
    try {
      await mutateMaterials();
    } catch (error) {
      console.error("Error loading materials:", error);
      showNotification("error", "Gagal memuat data barang");
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
          setMaterials((prev: any[]) =>
            prev.filter((m) => m.id !== material.id)
          );
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

  const handleViewMovements = async (material: any) => {
    setMovementMaterial(material);
    setLoadingMovements(true);
    try {
      const rows = await getInventoryMovementsAction({ barang_id: material.id });
      setMovementRows(rows || []);
    } catch (error) {
      console.error("Error loading inventory movements:", error);
      showNotification("error", "Gagal memuat riwayat stok");
      setMovementRows([]);
    } finally {
      setLoadingMovements(false);
    }
  };

  const handleAdjustStock = (material: any) => {
    setAdjustMaterial(material);
    setAdjustQty("");
    setAdjustReason("");
  };

  const submitAdjustment = async () => {
    if (!adjustMaterial) return;
    const qty = Number(adjustQty);
    if (!Number.isFinite(qty) || qty === 0) {
      showNotification("error", "Qty adjustment tidak boleh 0");
      return;
    }
    if (!adjustReason.trim()) {
      showNotification("error", "Alasan adjustment wajib diisi");
      return;
    }
    setSavingAdjustment(true);
    try {
      await createInventoryAdjustmentAction({
        barang_id: adjustMaterial.id,
        qty_delta: qty,
        reason: adjustReason.trim(),
      });
      setAdjustMaterial(null);
      await loadMaterials();
      showNotification("success", "Adjustment stok berhasil disimpan");
    } catch (error: any) {
      console.error("Error creating adjustment:", error);
      showNotification("error", error.message || "Gagal menyimpan adjustment");
    } finally {
      setSavingAdjustment(false);
    }
  };

  // Trigger modal — state form & loading dimiliki komponen modal masing-masing.
  const handleWasteMaterial = (material: any) => setWasteMaterial(material);

  const handleConvertRoll = (material: any) => setConvertMaterial(material);

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
    const price =
      Number(m.average_cost_per_base_unit || 0) ||
      (defaultUnit?.harga_beli && defaultUnit?.faktor_konversi
        ? Number(defaultUnit.harga_beli) / Number(defaultUnit.faktor_konversi)
        : 0);
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
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-800 p-4">
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
                className="px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent dark:bg-slate-800 dark:text-slate-100"
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
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-800 overflow-hidden">
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
                <th
                  className="px-4 py-3 text-right text-sm font-bold uppercase tracking-wider cursor-pointer hover:bg-white/10 transition-colors"
                  onClick={() => handleSort("value")}
                >
                  <div className="flex items-center justify-end gap-1">
                    HPP Rata-rata
                    {sortBy === "value" && (
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
              {loading && materials.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
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
                      <span className="text-gray-500 dark:text-slate-400">Memuat data...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredMaterials.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-12 text-center text-gray-500 dark:text-slate-400"
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
                    onViewMovements={handleViewMovements}
                    onAdjustStock={handleAdjustStock}
                    onWasteMaterial={handleWasteMaterial}
                    onConvertRoll={handleConvertRoll}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Material Modal */}
      <ModalTambahBarang
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

      {movementMaterial && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-4xl max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h3 className="text-lg font-bold text-gray-800 dark:text-slate-100">
                  Riwayat Stok
                </h3>
                <p className="text-sm text-gray-500 dark:text-slate-400">
                  {movementMaterial.nama}
                </p>
              </div>
              <button
                onClick={() => setMovementMaterial(null)}
                className="p-2 text-gray-500 dark:text-slate-400 hover:bg-gray-100 rounded-lg"
                title="Tutup"
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
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="overflow-auto max-h-[60vh]">
              {loadingMovements ? (
                <div className="p-8 text-center text-gray-500 dark:text-slate-400">
                  Memuat riwayat stok...
                </div>
              ) : movementRows.length === 0 ? (
                <div className="p-8 text-center text-gray-500 dark:text-slate-400">
                  Belum ada riwayat stok untuk barang ini.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-slate-300 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left">Tanggal</th>
                      <th className="px-4 py-3 text-left">Tipe</th>
                      <th className="px-4 py-3 text-right">Qty</th>
                      <th className="px-4 py-3 text-right">Stok</th>
                      <th className="px-4 py-3 text-right">HPP</th>
                      <th className="px-4 py-3 text-left">Catatan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movementRows.map((row) => (
                      <tr key={row.id} className="border-t">
                        <td className="px-4 py-3 text-gray-700 dark:text-slate-300">
                          {row.tanggal}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-block px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs font-semibold">
                            {row.movement_type}
                          </span>
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-semibold ${
                            Number(row.qty_delta) >= 0
                              ? "text-emerald-700 dark:text-emerald-300"
                              : "text-red-700"
                          }`}
                        >
                          {Number(row.qty_delta || 0).toLocaleString("id-ID")}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {Number(row.qty_before || 0).toLocaleString("id-ID")}
                          {" -> "}
                          {Number(row.qty_after || 0).toLocaleString("id-ID")}
                        </td>
                        <td className="px-4 py-3 text-right">
                          Rp{" "}
                          {Number(row.avg_cost_after || 0).toLocaleString(
                            "id-ID"
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-slate-300">
                          {row.catatan || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {adjustMaterial && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b">
              <h3 className="text-lg font-bold text-gray-800 dark:text-slate-100">
                Adjustment Stok
              </h3>
              <p className="text-sm text-gray-500 dark:text-slate-400">{adjustMaterial.nama}</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">
                  Qty Delta
                </label>
                <input
                  type="number"
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-800 dark:text-slate-100"
                  placeholder="Contoh: -2 atau 10"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">
                  Alasan
                </label>
                <textarea
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-800 dark:text-slate-100"
                  rows={3}
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-gray-50 dark:bg-slate-800">
              <button
                onClick={() => setAdjustMaterial(null)}
                className="px-4 py-2 text-gray-700 dark:text-slate-300 hover:bg-gray-200 rounded-lg"
              >
                Batal
              </button>
              <button
                onClick={submitAdjustment}
                disabled={savingAdjustment}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
              >
                {savingAdjustment ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Catat Material Rusak modal */}
      {wasteMaterial && (
        <ModalCatatRusak
          material={wasteMaterial}
          onClose={() => setWasteMaterial(null)}
          onSuccess={loadMaterials}
          showNotification={showNotification}
        />
      )}

      {/* Konversi Roll modal */}
      {convertMaterial && (
        <ModalKonversiRoll
          material={convertMaterial}
          onClose={() => setConvertMaterial(null)}
          onSuccess={loadMaterials}
          showNotification={showNotification}
        />
      )}

      
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

      {/* Notification Toast */}
      {notice && (
        <ToastNotifikasi type={notice.type} message={notice.message} />
      )}
    </div>
  );
}
