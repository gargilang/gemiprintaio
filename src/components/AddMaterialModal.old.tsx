"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface AddMaterialModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editData?: Material | null;
}

interface Material {
  id: string;
  name: string;
  description: string;
  category: string;
  subcategory: string;
  unit: string;
  specifications: string;
  purchase_price: number;
  selling_price: number;
  member_price: number;
  stock_quantity: number;
  min_stock_level: number;
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
    unit: "",
    specifications: "",
    purchase_price: "",
    selling_price: "",
    member_price: "",
    stock_quantity: "0",
    min_stock_level: "0",
  });

  const nameInputRef = useRef<HTMLInputElement>(null);

  // Load master data from database
  useEffect(() => {
    if (isOpen) {
      loadMasterData();
    }
  }, [isOpen]);

  // Handle ESC key to close modal
  useEffect(() => {
    if (!isOpen) return;

    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleEscKey);
    return () => window.removeEventListener("keydown", handleEscKey);
  }, [isOpen, onClose]);

  const loadMasterData = async () => {
    try {
      setLoadingMaster(true);
      // Load categories
      const catRes = await fetch("/api/master/categories");
      const catData = await catRes.json();
      if (catRes.ok) {
        setCategoriesData(catData.categories || []);
      }

      // Load all subcategories
      const subRes = await fetch("/api/master/subcategories");
      const subData = await subRes.json();
      if (subRes.ok) {
        setSubcategoriesData(subData.subcategories || []);
      }

      // Load units
      const unitRes = await fetch("/api/master/units");
      const unitData = await unitRes.json();
      if (unitRes.ok) {
        setUnitsData(unitData.units || []);
      }

      // Load all specs (we'll filter by category later)
      const specRes = await fetch("/api/master/quick-specs");
      const specData = await specRes.json();
      if (specRes.ok) {
        setSpecsData(specData.specs || []);
      }
    } catch (error) {
      console.error("Error loading master data:", error);
    } finally {
      setLoadingMaster(false);
    }
  };

  // Categories dan units yang relevan untuk percetakan (fallback jika database kosong)
  const categories = {
    "Media Cetak": {
      subcategories: [
        "Flexi/Banner",
        "Vinyl",
        "Sticker",
        "Backlit",
        "One Way Vision",
        "Albatross",
        "Canvas",
        "Lain-lain",
      ],
      units: ["meter", "roll", "sheet"],
    },
    Kertas: {
      subcategories: [
        "HVS",
        "Art Paper",
        "Art Carton",
        "Ivory",
        "Duplex",
        "BC/BW",
        "Kraft",
        "Jasmine",
        "Concorde",
        "Linen",
        "Foto Paper",
        "Lain-lain",
      ],
      units: ["lembar", "rim", "sheet", "pack"],
    },
    "Kertas Foto": {
      subcategories: [
        "Photo Paper Glossy",
        "Photo Paper Matte",
        "Photo Paper Luster",
        "RC Paper",
        "Inkjet Paper",
      ],
      units: ["lembar", "pack", "sheet"],
    },
    Merchandise: {
      subcategories: [
        "Tote Bag",
        "Gelas/Mug",
        "Kaos",
        "Payung",
        "Pin/Badge",
        "Gantungan Kunci",
        "ID Card",
        "Lanyard",
        "Tumbler",
        "Notebook",
        "Pulpen",
        "Lain-lain",
      ],
      units: ["pcs", "lusin", "pack", "box"],
    },
    "Substrat UV": {
      subcategories: [
        "Akrilik",
        "Kayu",
        "MDF",
        "Aluminium",
        "Kaca",
        "Keramik",
        "Plastik/PVC",
        "Metal",
        "Kulit",
        "Lain-lain",
      ],
      units: ["pcs", "sheet", "meter", "pack"],
    },
    "Tinta & Consumables": {
      subcategories: [
        "Tinta Eco Solvent",
        "Tinta UV",
        "Tinta Sublim",
        "Tinta Pigment",
        "Tinta Dye",
        "Cleaning Solution",
        "Lain-lain",
      ],
      units: ["liter", "ml", "botol", "cartridge"],
    },
    Finishing: {
      subcategories: [
        "Laminating Glossy",
        "Laminating Doff",
        "Laminating Sandblast",
        "Foam Board",
        "Kaca Acrylic",
        "Bingkai",
        "Double Tape",
        "Lem",
        "Lain-lain",
      ],
      units: ["meter", "roll", "pcs", "sheet"],
    },
    "Lain-lain": {
      subcategories: ["Umum"],
      units: ["pcs", "unit", "pack"],
    },
  };

  // Ukuran kertas standard
  const paperSizes = [
    "A0",
    "A1",
    "A2",
    "A3",
    "A3+",
    "A4",
    "A5",
    "A6",
    "B4",
    "B5",
    "Letter",
    "Legal",
    "Ledger",
    "Tabloid",
    "F4",
    "Folio",
    "R4 (10x15cm)",
    "R8 (13x18cm)",
    "R16 (20x30cm)",
    "Custom",
  ];

  // Gramasi kertas umum
  const paperWeights = [
    "60 gsm",
    "70 gsm",
    "80 gsm",
    "100 gsm",
    "120 gsm",
    "150 gsm",
    "190 gsm",
    "210 gsm",
    "230 gsm",
    "260 gsm",
    "310 gsm",
    "400 gsm",
  ];

  useEffect(() => {
    if (isOpen && editData) {
      setFormData({
        name: editData.name,
        description: editData.description || "",
        category: editData.category || "",
        subcategory: editData.subcategory || "",
        unit: editData.unit,
        specifications: editData.specifications || "",
        purchase_price: editData.purchase_price.toString(),
        selling_price: editData.selling_price.toString(),
        member_price: editData.member_price.toString(),
        stock_quantity: editData.stock_quantity.toString(),
        min_stock_level: editData.min_stock_level.toString(),
      });
    } else if (isOpen && categoriesData.length > 0) {
      // Reset form saat open untuk add new - set default dari data pertama
      const firstCategory = categoriesData[0]?.name || "";
      const firstSubcat = subcategoriesData.find(
        (s) => s.category_name === firstCategory
      );
      const firstUnit = unitsData[0]?.name || "";

      setFormData({
        name: "",
        description: "",
        category: firstCategory,
        subcategory: firstSubcat?.name || "",
        unit: firstUnit,
        specifications: "",
        purchase_price: "",
        selling_price: "",
        member_price: "",
        stock_quantity: "0",
        min_stock_level: "0",
      });
    }

    // Focus ke input name saat modal dibuka
    if (isOpen) {
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, editData, categoriesData, subcategoriesData, unitsData]);

  // Update subcategory dan unit saat category berubah
  const handleCategoryChange = (category: string) => {
    // Cari subcategory pertama dari kategori ini
    const firstSubcat = subcategoriesData.find(
      (s) => s.category_name === category
    );
    const firstUnit = unitsData[0]?.name || formData.unit;

    setFormData({
      ...formData,
      category,
      subcategory: firstSubcat?.name || "",
      unit: firstUnit,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        category: formData.category,
        subcategory: formData.subcategory,
        unit: formData.unit,
        specifications: formData.specifications.trim(),
        purchase_price: parseFloat(formData.purchase_price) || 0,
        selling_price: parseFloat(formData.selling_price) || 0,
        member_price: parseFloat(formData.member_price) || 0,
        stock_quantity: parseFloat(formData.stock_quantity) || 0,
        min_stock_level: parseFloat(formData.min_stock_level) || 0,
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

  // Get subcategories untuk kategori yang dipilih
  const currentSubcategories = subcategoriesData.filter(
    (sub) => sub.category_name === formData.category
  );

  // Get specs untuk kategori yang dipilih
  const currentSpecs = specsData.filter(
    (spec) =>
      categoriesData.find((cat) => cat.name === formData.category)?.id ===
      spec.category_id
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
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
                    placeholder="Contoh: Flexi China 280 Glossy"
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>

                {/* Kategori */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Kategori <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <select
                      required
                      value={formData.category}
                      onChange={(e) => handleCategoryChange(e.target.value)}
                      className="flex-1 px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
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
                    <button
                      type="button"
                      onClick={() => {
                        // Save current form state to localStorage
                        localStorage.setItem(
                          "materialFormDraft",
                          JSON.stringify(formData)
                        );
                        // Navigate to settings (works in Tauri)
                        router.push("/settings?tab=materials");
                      }}
                      className="px-3 py-2 bg-gray-100 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-200 transition-all flex items-center gap-1 whitespace-nowrap"
                      title="Kelola Kategori di Pengaturan"
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
                          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                      <span className="text-xs">Kelola</span>
                    </button>
                  </div>
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

                {/* Satuan */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Satuan <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={formData.unit}
                    onChange={(e) =>
                      setFormData({ ...formData, unit: e.target.value })
                    }
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
                </div>

                {/* Quick Specs Helper (untuk kategori yang memiliki spesifikasi) */}
                {currentSpecs.length > 0 && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Tambah Spesifikasi dibawah dengan cepat
                    </label>
                    <div className="flex gap-2 flex-wrap">
                      {/* Group specs by type */}
                      {Object.entries(
                        currentSpecs.reduce(
                          (acc: Record<string, any[]>, spec: any) => {
                            if (!acc[spec.spec_type]) acc[spec.spec_type] = [];
                            acc[spec.spec_type].push(spec);
                            return acc;
                          },
                          {} as Record<string, any[]>
                        )
                      ).map(([type, specs]) => (
                        <select
                          key={type}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              specifications:
                                formData.specifications +
                                (formData.specifications ? " | " : "") +
                                e.target.value,
                            })
                          }
                          className="flex-1 min-w-[120px] px-3 py-2 border-2 border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        >
                          <option value="">
                            {type === "size"
                              ? "Ukuran..."
                              : type === "weight"
                              ? "Gramasi..."
                              : type === "thickness"
                              ? "Ketebalan..."
                              : type === "width"
                              ? "Lebar..."
                              : `${type}...`}
                          </option>
                          {(specs as any[]).map((spec: any) => (
                            <option key={spec.id} value={spec.spec_value}>
                              {spec.spec_value}
                            </option>
                          ))}
                        </select>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Pilih untuk menambahkan ke spesifikasi
                    </p>
                  </div>
                )}

                {/* Spesifikasi */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Spesifikasi
                  </label>
                  <textarea
                    value={formData.specifications}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        specifications: e.target.value,
                      })
                    }
                    placeholder="Contoh: Lebar 1.3m | 280 gsm | Indoor/Outdoor | Glossy Finish"
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

            {/* Section 2: Harga */}
            <div className="bg-blue-50 rounded-xl p-4 border-2 border-blue-200">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <span className="w-8 h-8 bg-blue-500 text-white rounded-lg flex items-center justify-center text-sm font-bold">
                  2
                </span>
                Harga
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Harga Beli */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Harga Beli (per {formData.unit})
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-semibold">
                      Rp
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.purchase_price}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          purchase_price: e.target.value,
                        })
                      }
                      placeholder="0"
                      className="w-full pl-12 pr-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Harga Jual */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Harga Jual (per {formData.unit})
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-semibold">
                      Rp
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.selling_price}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          selling_price: e.target.value,
                        })
                      }
                      placeholder="0"
                      className="w-full pl-12 pr-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Harga Member */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Harga Member (per {formData.unit})
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-semibold">
                      Rp
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.member_price}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          member_price: e.target.value,
                        })
                      }
                      placeholder="0"
                      className="w-full pl-12 pr-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
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
                {/* Stok Awal */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Stok Saat Ini ({formData.unit})
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
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                </div>

                {/* Min Stock Level */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Min. Stok Alert ({formData.unit})
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
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Sistem akan memberi warning jika stok di bawah nilai ini
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
