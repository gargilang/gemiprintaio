"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useRouter } from "next/navigation";
import PanelHargaSatuan from "./barang/PanelHargaSatuan";
import PanelKomponenRakitan from "@/components/PanelKomponenRakitan";
import type { UnitPrice } from "./barang/types-barang";
import {
  findDuplicateNamaProduk,
  getReferensiUnitPrice,
  normalizeDefaultStatusForSave,
} from "@/lib/barang-unit-utils";

interface AddMaterialModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string, updatedMaterial?: any) => void;
  showNotification: (type: "success" | "error", message: string) => void;
  editData?: any | null;
  onCreateMaterial: (data: any) => Promise<any>;
  onUpdateMaterial: (id: string, data: any) => Promise<any>;
  onGetCategories: () => Promise<any[]>;
  onGetSubcategories: () => Promise<any[]>;
  onGetUnits: () => Promise<any[]>;
  onGetQuickSpecs: () => Promise<any[]>;
  /** Daftar semua barang — untuk pilih komponen rakitan saat edit */
  materials?: any[];
}

export default function ModalTambahBarang({
  isOpen,
  onClose,
  onSuccess,
  showNotification,
  editData,
  onCreateMaterial,
  onUpdateMaterial,
  onGetCategories,
  onGetSubcategories,
  onGetUnits,
  onGetQuickSpecs,
  materials,
}: AddMaterialModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [categoriesData, setCategoriesData] = useState<any[]>([]);
  const [subcategoriesData, setSubcategoriesData] = useState<any[]>([]);
  const [unitsData, setUnitsData] = useState<any[]>([]);
  const [specsData, setSpecsData] = useState<any[]>([]);
  const [loadingMaster, setLoadingMaster] = useState(true);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    category: "",
    subcategory: "",
    base_unit: "",
    specifications: "",
    stock_quantity: "0",
    min_stock_level: "0",
    track_inventory: true,
    requires_dimension: false,
    show_in_pos: true,
  });

  const [unitPrices, setUnitPrices] = useState<UnitPrice[]>([]);

  const nameInputRef = useRef<HTMLInputElement>(null);

  // Klik di luar untuk tutup modal
  const modalRef = useRef<HTMLDivElement>(null);
  useClickOutside(modalRef, onClose, isOpen);

  // Muat data master
  const loadMasterData = useCallback(async () => {
    try {
      setLoadingMaster(true);

      const [categories, subcategories, units, specs] = await Promise.all([
        onGetCategories(),
        onGetSubcategories(),
        onGetUnits(),
        onGetQuickSpecs(),
      ]);

      setCategoriesData(categories || []);

      // Add category_name to subcategories for compatibility
      const subcategoriesWithCategory = (subcategories || []).map((sub) => ({
        ...sub,
        category_name:
          categories?.find((c) => c.id === sub.kategori_id)?.nama || "",
      }));
      setSubcategoriesData(subcategoriesWithCategory);

      setUnitsData(units || []);
      setSpecsData(specs || []);
    } catch (error) {
      console.error("Error loading master data:", error);
    } finally {
      setLoadingMaster(false);
    }
  }, [onGetCategories, onGetSubcategories, onGetUnits, onGetQuickSpecs]);

  useEffect(() => {
    if (isOpen) {
      loadMasterData();
    }
  }, [isOpen, loadMasterData]);

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleEscKey);
    return () => window.removeEventListener("keydown", handleEscKey);
  }, [isOpen, onClose]);

  /** Simpan draf form lalu buka halaman kelola satuan. */
  const handleManageUnit = () => {
    localStorage.setItem(
      "materialFormDraft",
      JSON.stringify({ formData, unitPrices }),
    );
    router.push("/pengaturan?tab=setup&subtab=materials&manage=unit");
  };

  // Inisialisasi form
  useEffect(() => {
    if (isOpen && editData) {
      // Mode edit
      setFormData({
        name: editData.nama,
        description: editData.deskripsi || "",
        category: editData.category_name || "",
        subcategory: editData.subcategory_name || "",
        base_unit: editData.satuan_dasar || "",
        specifications: editData.spesifikasi || "",
        stock_quantity: editData.jumlah_stok?.toString() || "0",
        min_stock_level: editData.level_stok_minimum?.toString() || "0",
        track_inventory: editData.lacak_inventori_status !== 0,
        requires_dimension: editData.butuh_dimensi_status === 1,
        show_in_pos: editData.muncul_di_pos_status !== 0,
      });

      setUnitPrices(editData.unit_prices || []);
    } else if (isOpen && categoriesData.length > 0) {
      // Mode tambah baru
      const firstCategory = categoriesData[0]?.nama || "";
      const firstSubcat = subcategoriesData.find(
        (s) => s.category_name === firstCategory,
      );
      const isMediaCetak = firstCategory === "Media Cetak";
      const firstUnit = isMediaCetak ? "m²" : unitsData[0]?.nama || "pcs";

      setFormData({
        name: "",
        description: "",
        category: firstCategory,
        subcategory: firstSubcat?.nama || "",
        base_unit: firstUnit,
        specifications: "",
        stock_quantity: "0",
        min_stock_level: "0",
        track_inventory: true,
        requires_dimension: isMediaCetak, // Auto-check for Media Cetak
        show_in_pos: true,
      });

      // Inisialisasi dengan satu baris harga satuan default
      setUnitPrices([
        {
          nama_satuan: firstUnit,
          faktor_konversi: 1,
          harga_beli: 0,
          harga_jual: 0,
          harga_member: 0,
        },
      ]);
    }

    if (isOpen) {
      setTimeout(() => nameInputRef.current?.focus(), 100);
    }
  }, [isOpen, editData, categoriesData, subcategoriesData, unitsData]);

  const handleCategoryChange = (category: string) => {
    const firstSubcat = subcategoriesData.find(
      (s) => s.category_name === category,
    );

    const isMediaCetak = category === "Media Cetak";
    setFormData({
      ...formData,
      category,
      subcategory: firstSubcat?.nama || "",
      // Auto-check requires_dimension for Media Cetak
      requires_dimension: isMediaCetak,
      // Auto-set base unit to m² when dimension tracking turns on
      base_unit: isMediaCetak ? "m²" : formData.base_unit,
    });

    if (isMediaCetak) {
      // Sinkronkan label harga satuan utama ke m² supaya penyimpanan tetap konsisten.
      setUnitPrices((prev) =>
        prev.length === 0
          ? prev
          : prev.map((up) =>
              up.faktor_konversi === 1 ? { ...up, nama_satuan: "m²" } : up,
            ),
      );
    }
  };

  const handleRequiresDimensionChange = (checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      requires_dimension: checked,
      // Force satuan_dasar to m² so stock units stay consistent when this
      // flag is on. The user can pick a different unit if they uncheck.
      base_unit: checked ? "m²" : prev.base_unit,
    }));

    if (checked) {
      // Cermin nama satuan ke baris utama (faktor_konversi = 1).
      setUnitPrices((prev) =>
        prev.length === 0
          ? prev
          : prev.map((up) =>
              up.faktor_konversi === 1 ? { ...up, nama_satuan: "m²" } : up,
            ),
      );
    }
  };

  const handleBaseUnitChange = (newBaseUnit: string) => {
    setFormData({ ...formData, base_unit: newBaseUnit });

    // Update harga satuan utama kalau ada
    const updatedUnitPrices = unitPrices.map((up) => {
      if (up.faktor_konversi === 1) {
        return { ...up, nama_satuan: newBaseUnit };
      }
      return up;
    });

    setUnitPrices(updatedUnitPrices);
  };

  const addUnitPrice = () => {
    const refUnit = getReferensiUnitPrice(unitPrices);

    setUnitPrices([
      ...unitPrices,
      {
        // B1: default satuan dasar barang induk supaya produk jual kedua dst.
        // tidak kosong. fallback "" kalau base_unit belum terisi (kasus edge).
        nama_satuan: formData.base_unit || "",
        faktor_konversi: 1,
        harga_beli: refUnit?.harga_beli || 0,
        harga_jual: refUnit?.harga_jual || 0,
        harga_member: refUnit?.harga_member || 0,
      },
    ]);
  };

  const removeUnitPrice = (index: number) => {
    if (unitPrices.length <= 1) {
      alert("Minimal harus ada 1 produk jual");
      return;
    }
    setUnitPrices(unitPrices.filter((_, i) => i !== index));
  };

  const updateUnitPrice = (
    index: number,
    field: keyof UnitPrice,
    value: any,
  ) => {
    const updated = [...unitPrices];
    const refUnit = getReferensiUnitPrice(unitPrices);
    const refIndex = refUnit ? unitPrices.indexOf(refUnit) : 0;

    // Kalau faktor konversi diubah, hitung otomatis harga berdasar satuan referensi
    if (field === "faktor_konversi" && refUnit && index !== refIndex) {
      const newConversion = parseFloat(value) || 1;
      updated[index] = {
        ...updated[index],
        faktor_konversi: newConversion,
        harga_beli: Math.round(refUnit.harga_beli * newConversion),
        harga_jual: Math.round(refUnit.harga_jual * newConversion),
        harga_member:
          refUnit.harga_member > 0
            ? Math.round(refUnit.harga_member * newConversion)
            : 0,
      };
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }

    setUnitPrices(updated);
  };

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      // Validation
      if (!formData.name.trim()) {
        alert("Nama barang harus diisi");
        return;
      }

      if (!formData.base_unit.trim()) {
        alert("Satuan dasar harus diisi");
        return;
      }

      if (unitPrices.length === 0) {
        alert("Minimal harus ada 1 produk jual");
        return;
      }

      // Validasi produk jual
      for (const up of unitPrices) {
        if (!up.nama_satuan || !up.nama_satuan.trim()) {
          alert("Satuan tidak boleh kosong");
          return;
        }
        if (up.faktor_konversi <= 0) {
          alert("Faktor konversi harus lebih dari 0");
          return;
        }
      }

      const duplicateNama = findDuplicateNamaProduk(unitPrices);
      if (duplicateNama) {
        alert(
          `Nama produk "${duplicateNama}" sudah dipakai. Setiap produk jual harus punya nama unik.`,
        );
        return;
      }

      setLoading(true);

      try {
        // Find kategori_id — only set when category is selected and valid
        let kategori_id = null;
        if (formData.category && formData.category.trim()) {
          const foundCategory = categoriesData.find(
            (c) => c.nama === formData.category,
          );
          if (foundCategory) {
            kategori_id = foundCategory.id;
          }
        }

        // Find subkategori_id — only set when subcategory is selected and valid
        let subkategori_id = null;
        if (formData.subcategory && formData.subcategory.trim()) {
          const foundSubcategory = subcategoriesData.find(
            (s) => s.nama === formData.subcategory,
          );
          if (foundSubcategory) {
            subkategori_id = foundSubcategory.id;
          }
        }

        // Saat flag dimensi baru saja dinyalakan, satuan beralih dari
        // linear (e.g. meter) to area (m²). Existing stock numbers are no
        // longer comparable, so reset to 0 and let the user re-enter via a
        // purchase. Already-dimension materials keep their current stock.
        const isFreshlyTurningOnDimension =
          formData.requires_dimension &&
          (!editData || editData.butuh_dimensi_status !== 1);
        const stokFinal = isFreshlyTurningOnDimension
          ? 0
          : parseFloat(formData.stock_quantity) || 0;
        const minStokFinal = isFreshlyTurningOnDimension
          ? 0
          : parseFloat(formData.min_stock_level) || 0;

        const payload = {
          nama: formData.name.trim(),
          deskripsi: formData.description.trim() || null,
          kategori_id,
          subkategori_id,
          satuan_dasar: formData.base_unit.trim(),
          spesifikasi: formData.specifications.trim() || null,
          jumlah_stok: stokFinal,
          level_stok_minimum: minStokFinal,
          lacak_inventori_status: formData.track_inventory,
          butuh_dimensi_status: formData.requires_dimension,
          muncul_di_pos_status: formData.show_in_pos,
          unit_prices: normalizeDefaultStatusForSave(
            unitPrices.map((up, index) => ({
              ...up,
              urutan_tampilan: index,
            })),
          ),
        };

        let result;
        if (editData) {
          // Perbarui barang yang sudah ada
          result = await onUpdateMaterial(editData.id, payload);
        } else {
          // Buat barang baru
          result = await onCreateMaterial(payload);
        }

        if (!result) {
          onClose();
          showNotification("error", "Gagal menyimpan data");
          return;
        }

        // Tutup modal dulu, lalu tampilkan notifikasi di parent
        onClose();

        // Untuk edit, kembalikan barang yang diperbarui beserta ID; untuk item baru kirim null
        const updatedMaterial = editData ? { id: editData.id } : null;
        onSuccess(
          `Barang berhasil ${editData ? "diupdate" : "ditambahkan"}!`,
          updatedMaterial,
        );
      } catch (err) {
        console.error(err);
        onClose();
        showNotification(
          "error",
          `Terjadi kesalahan: ${err instanceof Error ? err.message : "Unknown"}`,
        );
      } finally {
        setLoading(false);
      }
    },
    [
      formData,
      unitPrices,
      categoriesData,
      subcategoriesData,
      editData,
      onClose,
      onSuccess,
      onCreateMaterial,
      onUpdateMaterial,
      showNotification,
    ],
  );

  // Handler keyboard - Enter untuk submit, ESC untuk tutup
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === "Enter" && !e.shiftKey) {
        // Cegah submit kalau pengguna sedang mengetik di textarea
        const target = e.target as HTMLElement;
        if (target.tagName === "TEXTAREA") return;

        e.preventDefault();
        handleSubmit(e as any);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleSubmit, onClose]);

  if (!isOpen) return null;

  const currentSubcategories = subcategoriesData.filter(
    (sub) => sub.category_name === formData.category,
  );

  const currentSpecs = specsData.filter(
    (spec) =>
      categoriesData.find((cat) => cat.nama === formData.category)?.id ===
      spec.kategori_id,
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        ref={modalRef}
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-500 to-green-600 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 dark:bg-slate-900/20 rounded-lg">
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
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white">
              {editData ? "Edit Barang" : "Tambah Barang Baru"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
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

        {/* Form Content - Scrollable */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {/* Section 1: Informasi Dasar */}
            <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-4 border-2 border-gray-200 dark:border-slate-800">
              <h3 className="text-lg font-bold text-gray-800 dark:text-slate-100 mb-4 flex items-center gap-2">
                <span className="w-8 h-8 bg-emerald-500 dark:bg-slate-700 text-white rounded-lg flex items-center justify-center text-base font-bold">
                  1
                </span>
                Informasi Dasar
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Nama Bahan */}
                <div className="md:col-span-2">
                  <label className="block text-base font-semibold text-gray-700 dark:text-slate-300 mb-2">
                    Nama Bahan <span className="text-red-500">*</span>
                  </label>
                  <input
                    ref={nameInputRef}
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="Contoh: Pulpen Pilot"
                    className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                {/* Category */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-base font-semibold text-gray-700 dark:text-slate-300">
                      Kategori <span className="text-red-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        localStorage.setItem(
                          "materialFormDraft",
                          JSON.stringify({ formData, unitPrices }),
                        );
                        router.push(
                          "/pengaturan?tab=setup&subtab=materials&manage=category",
                        );
                      }}
                      className="text-base text-blue-600 dark:text-blue-300 hover:text-blue-800 dark:text-blue-200 hover:underline font-semibold"
                    >
                      Kelola
                    </button>
                  </div>
                  <select
                    required
                    value={formData.category}
                    onChange={(e) => handleCategoryChange(e.target.value)}
                    className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent dark:bg-slate-800 dark:text-slate-100"
                    disabled={loadingMaster}
                  >
                    {loadingMaster ? (
                      <option value="">Memuat kategori...</option>
                    ) : categoriesData.length === 0 ? (
                      <option value="">Belum ada kategori</option>
                    ) : (
                      categoriesData.map((cat) => (
                        <option key={cat.id} value={cat.nama}>
                          {cat.nama}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {/* Subcategory */}
                <div>
                  <label className="block text-base font-semibold text-gray-700 dark:text-slate-300 mb-2">
                    Subkategori
                  </label>
                  <select
                    value={formData.subcategory}
                    onChange={(e) =>
                      setFormData({ ...formData, subcategory: e.target.value })
                    }
                    className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent dark:bg-slate-800 dark:text-slate-100"
                    disabled={loadingMaster}
                  >
                    {loadingMaster ? (
                      <option value="">Memuat...</option>
                    ) : currentSubcategories.length === 0 ? (
                      <option value="">Belum ada subkategori</option>
                    ) : (
                      currentSubcategories.map((sub) => (
                        <option key={sub.id} value={sub.nama}>
                          {sub.nama}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {/* Satuan Dasar (Base Unit) */}
                <div>
                  <label className="block text-base font-semibold text-gray-700 dark:text-slate-300 mb-2">
                    Satuan Dasar (untuk tracking stok){" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={formData.base_unit}
                    onChange={(e) => handleBaseUnitChange(e.target.value)}
                    className="w-full px-4 py-2.5 border-2 border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed dark:bg-slate-800 dark:text-slate-100 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
                    disabled={loadingMaster || formData.requires_dimension}
                  >
                    {loadingMaster ? (
                      <option value="">Memuat...</option>
                    ) : unitsData.length === 0 ? (
                      <option value="">Belum ada satuan</option>
                    ) : (
                      unitsData.map((unit) => (
                        <option key={unit.id} value={unit.nama}>
                          {unit.nama}
                        </option>
                      ))
                    )}
                  </select>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                    {formData.requires_dimension
                      ? "Dikunci ke m². Stok dihitung total area."
                      : "Satuan terkecil (contoh: pcs, meter, lembar)"}
                  </p>
                </div>

                {/* Track Inventory */}
                <div>
                  <label className="block text-base font-semibold text-gray-700 dark:text-slate-300 mb-2">
                    Pengaturan POS
                  </label>
                  <div className="space-y-2 mt-3">
                    {/* Munculkan di POS — harus di paling atas */}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.show_in_pos}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            show_in_pos: e.target.checked,
                          })
                        }
                        className="w-4 h-4 text-emerald-500 border-gray-300 rounded focus:ring-emerald-500"
                      />
                      <span className="text-base text-gray-700 dark:text-slate-300">
                        Munculkan di POS
                      </span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.track_inventory}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            track_inventory: e.target.checked,
                          })
                        }
                        className="w-4 h-4 text-emerald-500 border-gray-300 rounded focus:ring-emerald-500"
                      />
                      <span className="text-base text-gray-700 dark:text-slate-300">
                        Track stok barang ini
                      </span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.requires_dimension}
                        onChange={(e) =>
                          handleRequiresDimensionChange(e.target.checked)
                        }
                        className="w-4 h-4 text-blue-500 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-base text-gray-700 dark:text-slate-300">
                        Perlu input dimensi (Panjang × Lebar) saat penjualan
                      </span>
                    </label>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-2 space-y-0.5">
                    • Munculkan di POS: visibilitas barang induk.{" "}
                    <strong>Produk Jual</strong> di bawah selalu muncul (stok
                    tetap terlacak).
                    <br />• Track stok: nonaktifkan untuk barang konsumsi (lem,
                    tinta, dll).
                    <br />• Dimensi: untuk banner, vinyl, flexi. Stok dihitung{" "}
                    <strong>m²</strong>; pembelian meminta panjang × lebar tiap
                    roll.
                  </p>
                </div>

                {/* Spesifikasi */}
                <div className="md:col-span-2">
                  <label className="block text-base font-semibold text-gray-700 dark:text-slate-300 mb-2">
                    Spesifikasi
                  </label>

                  {/* Quick Specs Helper - Pindah ke ATAS */}
                  {currentSpecs.length > 0 && (
                    <div className="mb-3 p-3 bg-emerald-50 dark:bg-slate-800 rounded-lg border border-emerald-200 dark:border-slate-700">
                      <p className="text-base font-semibold text-emerald-800 dark:text-emerald-200 mb-2">
                        Pilih Spesifikasi Cepat:
                      </p>
                      <div className="flex gap-2 flex-wrap">
                        {Object.entries(
                          currentSpecs.reduce(
                            (acc: Record<string, any[]>, spec: any) => {
                              if (!acc[spec.tipe_spesifikasi])
                                acc[spec.tipe_spesifikasi] = [];
                              acc[spec.tipe_spesifikasi].push(spec);
                              return acc;
                            },
                            {} as Record<string, any[]>,
                          ),
                        ).map(([type, specs]) => (
                          <select
                            key={type}
                            onChange={(e) => {
                              if (e.target.value) {
                                setFormData({
                                  ...formData,
                                  specifications:
                                    formData.specifications +
                                    (formData.specifications ? " | " : "") +
                                    e.target.value,
                                });
                                e.target.value = "";
                              }
                            }}
                            tabIndex={0}
                            className="px-3 py-1.5 text-base border-2 border-emerald-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-slate-900 hover:border-emerald-400 transition-colors"
                          >
                            <option value="">+ {type}</option>
                            {specs.map((spec: any) => (
                              <option
                                key={spec.id}
                                value={spec.nilai_spesifikasi}
                              >
                                {spec.nilai_spesifikasi}
                              </option>
                            ))}
                          </select>
                        ))}
                      </div>
                    </div>
                  )}

                  <textarea
                    value={formData.specifications}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        specifications: e.target.value,
                      })
                    }
                    placeholder="Contoh: Warna hitam | Grip karet | Tinta gel"
                    rows={2}
                    className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                {/* Deskripsi */}
                <div className="md:col-span-2">
                  <label className="block text-base font-semibold text-gray-700 dark:text-slate-300 mb-2">
                    Deskripsi
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder="Catatan tambahan tentang bahan ini..."
                    rows={2}
                    className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Harga Per Satuan */}
            <PanelHargaSatuan
              unitPrices={unitPrices}
              baseUnit={formData.base_unit}
              unitsData={unitsData}
              loadingMaster={loadingMaster}
              onAdd={addUnitPrice}
              onRemove={removeUnitPrice}
              onUpdate={updateUnitPrice}
              onManageUnit={handleManageUnit}
            />

            {/* Section 3: Stock */}
            <div className="bg-orange-50 dark:bg-slate-800 rounded-xl p-4 border-2 border-orange-200 dark:border-orange-800/50">
              <h3 className="text-lg font-bold text-gray-800 dark:text-slate-100 mb-4 flex items-center gap-2">
                <span className="w-8 h-8 bg-orange-500 dark:bg-slate-700 text-white rounded-lg flex items-center justify-center text-base font-bold">
                  3
                </span>
                Stok & Inventory
              </h3>

              {formData.requires_dimension &&
                editData &&
                editData.butuh_dimensi_status !== 1 && (
                  <div className="mb-4 p-3 bg-amber-100 dark:bg-amber-900/30 border-2 border-amber-300 dark:border-amber-800/50 rounded-lg">
                    <p className="text-base text-amber-900">
                      <strong>⚠ Perhatian:</strong> Mengaktifkan tracking
                      dimensi mengubah satuan stok ke <strong>m²</strong>. Saat
                      disimpan, stok saat ini akan <strong>direset ke 0</strong>
                      . Catat ulang stok dari faktur terakhir lewat halaman
                      Pembelian.
                    </p>
                  </div>
                )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Current stock */}
                <div>
                  <label className="block text-base font-semibold text-gray-700 dark:text-slate-300 mb-2">
                    Stok Saat Ini ({formData.base_unit})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.stock_quantity}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        stock_quantity: e.target.value,
                      })
                    }
                    placeholder="0"
                    className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent dark:bg-slate-800 dark:text-slate-100"
                  />
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                    Stok dalam satuan dasar ({formData.base_unit})
                  </p>
                </div>

                {/* Min Stock Level - Hidden if tracking is off */}
                {formData.track_inventory && (
                  <div>
                    <label className="block text-base font-semibold text-gray-700 dark:text-slate-300 mb-2">
                      Min. Stok Alert ({formData.base_unit})
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.min_stock_level}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          min_stock_level: e.target.value,
                        })
                      }
                      placeholder="0"
                      className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent dark:bg-slate-800 dark:text-slate-100"
                    />
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                      Warning jika stok di bawah nilai ini
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Section 4: Komponen Rakitan — hanya tampil saat edit barang yang dilacak */}
            {editData?.id && formData.track_inventory && (
              <div className="bg-purple-50 dark:bg-slate-800 rounded-xl p-4 border-2 border-purple-200 dark:border-purple-800/50">
                <h3 className="text-lg font-bold text-gray-800 dark:text-slate-100 mb-4 flex items-center gap-2">
                  <span className="w-8 h-8 bg-purple-500 dark:bg-slate-700 text-white rounded-lg flex items-center justify-center text-base font-bold">
                    4
                  </span>
                  Komponen Rakitan
                </h3>
                <PanelKomponenRakitan
                  parentBarangId={editData.id}
                  allBarang={(materials || []).map((m: any) => ({
                    id: m.id,
                    nama: m.nama,
                    satuan_dasar: m.satuan_dasar || "",
                    butuh_dimensi_status: m.butuh_dimensi_status ?? 0,
                  }))}
                />
              </div>
            )}
          </div>
        </form>

        {/* Footer Actions */}
        <div className="bg-gray-50 dark:bg-slate-800 px-6 py-4 flex items-center justify-end gap-3 border-t border-gray-200 dark:border-slate-800 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-6 py-2.5 bg-white dark:bg-slate-900 border-2 border-gray-300 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-100 transition-colors font-semibold disabled:opacity-50"
          >
            Batal
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-lg hover:from-emerald-600 hover:to-green-700 transition-all font-semibold shadow-lg disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? (
              <>
                <svg
                  className="animate-spin h-5 w-5 text-white"
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
                Menyimpan...
              </>
            ) : (
              "Simpan"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
