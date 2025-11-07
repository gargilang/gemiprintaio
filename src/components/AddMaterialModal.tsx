"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface UnitPrice {
  id?: string;
  unit_name: string;
  conversion_factor: number;
  purchase_price: number;
  selling_price: number;
  member_price: number;
  is_default: boolean;
  display_order?: number;
}

interface AddMaterialModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editData?: any | null;
}

export default function AddMaterialModal({
  isOpen,
  onClose,
  onSuccess,
  editData,
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
  });

  const [unitPrices, setUnitPrices] = useState<UnitPrice[]>([]);

  const nameInputRef = useRef<HTMLInputElement>(null);

  // Load master data
  useEffect(() => {
    if (isOpen) {
      loadMasterData();
    }
  }, [isOpen]);

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleEscKey);
    return () => window.removeEventListener("keydown", handleEscKey);
  }, [isOpen, onClose]);

  const loadMasterData = async () => {
    try {
      setLoadingMaster(true);

      const [catRes, subRes, unitRes, specRes] = await Promise.all([
        fetch("/api/master/categories"),
        fetch("/api/master/subcategories"),
        fetch("/api/master/units"),
        fetch("/api/master/quick-specs"),
      ]);

      const [catData, subData, unitData, specData] = await Promise.all([
        catRes.json(),
        subRes.json(),
        unitRes.json(),
        specRes.json(),
      ]);

      if (catRes.ok) setCategoriesData(catData.categories || []);
      if (subRes.ok) setSubcategoriesData(subData.subcategories || []);
      if (unitRes.ok) setUnitsData(unitData.units || []);
      if (specRes.ok) setSpecsData(specData.specs || []);
    } catch (error) {
      console.error("Error loading master data:", error);
    } finally {
      setLoadingMaster(false);
    }
  };

  // Initialize form
  useEffect(() => {
    if (isOpen && editData) {
      // Edit mode
      setFormData({
        name: editData.name,
        description: editData.description || "",
        category: editData.category_name || "",
        subcategory: editData.subcategory_name || "",
        base_unit: editData.base_unit || "",
        specifications: editData.specifications || "",
        stock_quantity: editData.stock_quantity?.toString() || "0",
        min_stock_level: editData.min_stock_level?.toString() || "0",
        track_inventory: editData.track_inventory !== 0,
        requires_dimension: editData.requires_dimension === 1,
      });

      setUnitPrices(editData.unit_prices || []);
    } else if (isOpen && categoriesData.length > 0) {
      // Add new mode
      const firstCategory = categoriesData[0]?.name || "";
      const firstSubcat = subcategoriesData.find(
        (s) => s.category_name === firstCategory
      );
      const firstUnit = unitsData[0]?.name || "pcs";

      setFormData({
        name: "",
        description: "",
        category: firstCategory,
        subcategory: firstSubcat?.name || "",
        base_unit: firstUnit,
        specifications: "",
        stock_quantity: "0",
        min_stock_level: "0",
        track_inventory: true,
        requires_dimension: firstCategory === "Media Cetak", // Auto-check untuk Media Cetak
      });

      // Initialize with one default unit price
      setUnitPrices([
        {
          unit_name: firstUnit,
          conversion_factor: 1,
          purchase_price: 0,
          selling_price: 0,
          member_price: 0,
          is_default: true,
        },
      ]);
    }

    if (isOpen) {
      setTimeout(() => nameInputRef.current?.focus(), 100);
    }
  }, [isOpen, editData, categoriesData, subcategoriesData, unitsData]);

  const handleCategoryChange = (category: string) => {
    const firstSubcat = subcategoriesData.find(
      (s) => s.category_name === category
    );

    setFormData({
      ...formData,
      category,
      subcategory: firstSubcat?.name || "",
      // Auto-check requires_dimension untuk Media Cetak
      requires_dimension: category === "Media Cetak",
    });
  };

  const handleBaseUnitChange = (newBaseUnit: string) => {
    setFormData({ ...formData, base_unit: newBaseUnit });

    // Update default unit price if exists
    const updatedUnitPrices = unitPrices.map((up) => {
      if (up.conversion_factor === 1) {
        return { ...up, unit_name: newBaseUnit };
      }
      return up;
    });

    setUnitPrices(updatedUnitPrices);
  };

  const addUnitPrice = () => {
    setUnitPrices([
      ...unitPrices,
      {
        unit_name: "",
        conversion_factor: 1,
        purchase_price: 0,
        selling_price: 0,
        member_price: 0,
        is_default: false,
      },
    ]);
  };

  const removeUnitPrice = (index: number) => {
    if (unitPrices.length <= 1) {
      alert("Minimal harus ada 1 harga satuan");
      return;
    }
    setUnitPrices(unitPrices.filter((_, i) => i !== index));
  };

  const updateUnitPrice = (
    index: number,
    field: keyof UnitPrice,
    value: any
  ) => {
    const updated = [...unitPrices];
    updated[index] = { ...updated[index], [field]: value };

    // If setting as default, unset others
    if (field === "is_default" && value === true) {
      updated.forEach((up, i) => {
        if (i !== index) up.is_default = false;
      });
    }

    setUnitPrices(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.name.trim()) {
      alert("Nama bahan harus diisi");
      return;
    }

    if (!formData.base_unit.trim()) {
      alert("Satuan dasar harus diisi");
      return;
    }

    if (unitPrices.length === 0) {
      alert("Minimal harus ada 1 harga satuan");
      return;
    }

    // Check if at least one unit price is set as default
    const hasDefault = unitPrices.some((up) => up.is_default);
    if (!hasDefault) {
      alert("Minimal harus ada 1 satuan yang dijadikan default");
      return;
    }

    // Validate unit prices
    for (const up of unitPrices) {
      if (!up.unit_name || !up.unit_name.trim()) {
        alert("Nama satuan tidak boleh kosong");
        return;
      }
      if (up.conversion_factor <= 0) {
        alert("Faktor konversi harus lebih dari 0");
        return;
      }
    }

    setLoading(true);

    try {
      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        category_id:
          categoriesData.find((c) => c.name === formData.category)?.id || null,
        subcategory_id:
          subcategoriesData.find((s) => s.name === formData.subcategory)?.id ||
          null,
        base_unit: formData.base_unit.trim(),
        specifications: formData.specifications.trim() || null,
        stock_quantity: parseFloat(formData.stock_quantity) || 0,
        min_stock_level: parseFloat(formData.min_stock_level) || 0,
        track_inventory: formData.track_inventory,
        requires_dimension: formData.requires_dimension,
        unit_prices: unitPrices,
      };

      const url = editData ? `/api/materials/${editData.id}` : "/api/materials";
      const method = editData ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan data");

      onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      alert(
        `Terjadi kesalahan: ${err instanceof Error ? err.message : "Unknown"}`
      );
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const currentSubcategories = subcategoriesData.filter(
    (sub) => sub.category_name === formData.category
  );

  const currentSpecs = specsData.filter(
    (spec) =>
      categoriesData.find((cat) => cat.name === formData.category)?.id ===
      spec.category_id
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-500 to-green-600 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
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
              {editData ? "Edit Bahan" : "Tambah Bahan Baru"}
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
            <div className="bg-gray-50 rounded-xl p-4 border-2 border-gray-200">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <span className="w-8 h-8 bg-emerald-500 text-white rounded-lg flex items-center justify-center text-sm font-bold">
                  1
                </span>
                Informasi Dasar
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Nama Bahan */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
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
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>

                {/* Kategori */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Kategori <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={formData.category}
                    onChange={(e) => handleCategoryChange(e.target.value)}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    disabled={loadingMaster}
                  >
                    {loadingMaster ? (
                      <option value="">Memuat kategori...</option>
                    ) : categoriesData.length === 0 ? (
                      <option value="">Belum ada kategori</option>
                    ) : (
                      categoriesData.map((cat) => (
                        <option key={cat.id} value={cat.name}>
                          {cat.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {/* Subkategori */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Subkategori
                  </label>
                  <select
                    value={formData.subcategory}
                    onChange={(e) =>
                      setFormData({ ...formData, subcategory: e.target.value })
                    }
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    disabled={loadingMaster}
                  >
                    {loadingMaster ? (
                      <option value="">Memuat...</option>
                    ) : currentSubcategories.length === 0 ? (
                      <option value="">Belum ada subkategori</option>
                    ) : (
                      currentSubcategories.map((sub) => (
                        <option key={sub.id} value={sub.name}>
                          {sub.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {/* Satuan Dasar (Base Unit) */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Satuan Dasar (untuk tracking stok){" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={formData.base_unit}
                    onChange={(e) => handleBaseUnitChange(e.target.value)}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    disabled={loadingMaster}
                  >
                    {loadingMaster ? (
                      <option value="">Memuat...</option>
                    ) : unitsData.length === 0 ? (
                      <option value="">Belum ada satuan</option>
                    ) : (
                      unitsData.map((unit) => (
                        <option key={unit.id} value={unit.name}>
                          {unit.name}
                        </option>
                      ))
                    )}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Satuan terkecil untuk menghitung stok (contoh: pcs, meter,
                    lembar)
                  </p>
                </div>

                {/* Track Inventory */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Pengaturan POS
                  </label>
                  <div className="space-y-2 mt-3">
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
                      <span className="text-sm text-gray-700">
                        Track stok barang ini
                      </span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.requires_dimension}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            requires_dimension: e.target.checked,
                          })
                        }
                        className="w-4 h-4 text-blue-500 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">
                        Perlu input dimensi (Panjang × Lebar) saat penjualan
                      </span>
                    </label>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    • Track stok: Nonaktifkan untuk barang konsumsi (lem, tinta,
                    dll)
                    <br />• Dimensi: Aktifkan untuk banner, vinyl, flexi
                    (Kuantitas = Panjang × Lebar meter)
                  </p>
                </div>

                {/* Spesifikasi */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Spesifikasi
                  </label>

                  {/* Quick Specs Helper - Pindah ke ATAS */}
                  {currentSpecs.length > 0 && (
                    <div className="mb-3 p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                      <p className="text-xs font-semibold text-emerald-800 mb-2">
                        Pilih Spesifikasi Cepat:
                      </p>
                      <div className="flex gap-2 flex-wrap">
                        {Object.entries(
                          currentSpecs.reduce(
                            (acc: Record<string, any[]>, spec: any) => {
                              if (!acc[spec.spec_type])
                                acc[spec.spec_type] = [];
                              acc[spec.spec_type].push(spec);
                              return acc;
                            },
                            {} as Record<string, any[]>
                          )
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
                            className="px-3 py-1.5 text-sm border-2 border-emerald-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white hover:border-emerald-400 transition-colors"
                          >
                            <option value="">+ {type}</option>
                            {specs.map((spec: any) => (
                              <option key={spec.id} value={spec.spec_value}>
                                {spec.spec_value}
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
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
                  />
                </div>

                {/* Deskripsi */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Deskripsi
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder="Catatan tambahan tentang bahan ini..."
                    rows={2}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Harga Per Satuan */}
            <div className="bg-blue-50 rounded-xl p-4 border-2 border-blue-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <span className="w-8 h-8 bg-blue-500 text-white rounded-lg flex items-center justify-center text-sm font-bold">
                    2
                  </span>
                  Harga Per Satuan Jual
                </h3>
                <button
                  type="button"
                  onClick={addUnitPrice}
                  className="px-3 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-semibold flex items-center gap-1"
                >
                  <svg
                    className="w-4 h-4"
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
                  Tambah Satuan
                </button>
              </div>

              <div className="space-y-4">
                {unitPrices.map((up, index) => (
                  <div
                    key={index}
                    className="bg-white rounded-lg p-4 border-2 border-gray-200"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-gray-600">
                          #{index + 1}
                        </span>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="default_unit"
                            checked={up.is_default}
                            onChange={() =>
                              updateUnitPrice(index, "is_default", true)
                            }
                            className="w-4 h-4 text-blue-500"
                          />
                          <span className="text-xs font-semibold text-gray-600">
                            Default
                          </span>
                        </label>
                      </div>
                      {unitPrices.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeUnitPrice(index)}
                          className="text-red-500 hover:text-red-700 p-1"
                          title="Hapus satuan ini"
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
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                      {/* Nama Satuan - DROPDOWN */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Satuan <span className="text-red-500">*</span>
                        </label>
                        <select
                          required
                          value={up.unit_name}
                          onChange={(e) =>
                            updateUnitPrice(index, "unit_name", e.target.value)
                          }
                          className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          disabled={loadingMaster}
                        >
                          <option value="">Pilih satuan...</option>
                          {unitsData.map((unit) => (
                            <option key={unit.id} value={unit.name}>
                              {unit.name}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-gray-500 mt-1">
                          Tidak ada?{" "}
                          <button
                            type="button"
                            onClick={() => {
                              localStorage.setItem(
                                "materialFormDraft",
                                JSON.stringify({ formData, unitPrices })
                              );
                              router.push("/settings?tab=materials");
                            }}
                            className="text-blue-600 hover:underline font-semibold"
                          >
                            Kelola
                          </button>
                        </p>
                      </div>

                      {/* Konversi */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Konversi <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={up.conversion_factor}
                          onChange={(e) =>
                            updateUnitPrice(
                              index,
                              "conversion_factor",
                              parseFloat(e.target.value) || 1
                            )
                          }
                          placeholder="1"
                          className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          1 {up.unit_name} = {up.conversion_factor}{" "}
                          {formData.base_unit}
                        </p>
                      </div>

                      {/* Harga Beli */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Harga Beli
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={up.purchase_price}
                          onChange={(e) =>
                            updateUnitPrice(
                              index,
                              "purchase_price",
                              parseFloat(e.target.value) || 0
                            )
                          }
                          placeholder="0"
                          className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      {/* Harga Jual */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Harga Jual
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={up.selling_price}
                          onChange={(e) =>
                            updateUnitPrice(
                              index,
                              "selling_price",
                              parseFloat(e.target.value) || 0
                            )
                          }
                          placeholder="0"
                          className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      {/* Harga Member */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Harga Member
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={up.member_price}
                          onChange={(e) =>
                            updateUnitPrice(
                              index,
                              "member_price",
                              parseFloat(e.target.value) || 0
                            )
                          }
                          placeholder="0"
                          className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 bg-blue-100 border border-blue-300 rounded-lg p-3">
                <p className="text-xs text-blue-800 font-semibold mb-1">
                  💡 Contoh Penggunaan:
                </p>
                <ul className="text-xs text-blue-700 space-y-1 ml-4">
                  <li>
                    • <strong>Pulpen:</strong> Base unit "pcs", tambah satuan
                    "lusin" (konversi 12), "pack" (konversi 144)
                  </li>
                  <li>
                    • <strong>Flexi Banner:</strong> Base unit "meter", tambah
                    satuan "roll" (konversi 50)
                  </li>
                  <li>
                    • <strong>Kertas HVS:</strong> Base unit "lembar", tambah
                    satuan "rim" (konversi 500)
                  </li>
                </ul>
              </div>
            </div>

            {/* Section 3: Stok */}
            <div className="bg-orange-50 rounded-xl p-4 border-2 border-orange-200">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <span className="w-8 h-8 bg-orange-500 text-white rounded-lg flex items-center justify-center text-sm font-bold">
                  3
                </span>
                Stok & Inventory
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Stok Saat Ini */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
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
                    disabled={!formData.track_inventory}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Jumlah stok dalam satuan dasar ({formData.base_unit})
                  </p>
                </div>

                {/* Min Stock Level */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
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
                    disabled={!formData.track_inventory}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Warning jika stok di bawah nilai ini
                  </p>
                </div>
              </div>
            </div>
          </div>
        </form>

        {/* Footer Actions */}
        <div className="bg-gray-50 px-6 py-4 flex items-center justify-end gap-3 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-6 py-2 bg-white border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-semibold disabled:opacity-50"
          >
            Batal
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-6 py-2 bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-lg hover:from-emerald-600 hover:to-green-700 transition-all font-semibold shadow-lg disabled:opacity-50 flex items-center gap-2"
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
              <>
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
                {editData ? "Update Bahan" : "Simpan Bahan"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
