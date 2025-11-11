"use client";

import { useState, useEffect, useMemo } from "react";
import {
  PlusIcon,
  TrashIcon,
  CashIcon,
  CalendarIcon,
  PackageIcon,
  AlertIcon,
} from "./icons/ContentIcons";
import SearchableSelect from "./SearchableSelect";
import { getTodayJakarta } from "@/lib/date-utils";

interface PurchaseItem {
  id_barang: string;
  nama_barang?: string;
  id_satuan: string;
  nama_satuan?: string;
  faktor_konversi?: number;
  jumlah: number;
  harga_beli: number;
}

interface PurchaseFormData {
  tanggal: string;
  nomor_faktur: string;
  id_vendor: string | null;
  metode_pembayaran: "CASH" | "NET30" | "COD";
  catatan: string;
  items: PurchaseItem[];
}

interface Material {
  id: string;
  nama: string;
  satuan_dasar: string;
  unit_prices: {
    id: string;
    nama_satuan: string;
    faktor_konversi: number;
    harga_jual: number;
    harga_beli: number;
  }[];
}

interface Vendor {
  id: string;
  nama_perusahaan: string;
  aktif_status: number;
}

interface PurchaseFormProps {
  editData?: any;
  onSuccess: (message: string) => void;
  onCancel?: () => void;
  materials: Material[];
  vendors: Vendor[];
  onQuickAddVendor: () => void;
  onQuickAddMaterial: () => void;
  showNotification: (type: "success" | "error", message: string) => void;
}

export default function PurchaseForm({
  editData,
  onSuccess,
  onCancel,
  materials,
  vendors,
  onQuickAddVendor,
  onQuickAddMaterial,
  showNotification,
}: PurchaseFormProps) {
  const [formData, setFormData] = useState<PurchaseFormData>({
    tanggal: getTodayJakarta(),
    nomor_faktur: "",
    id_vendor: null,
    metode_pembayaran: "CASH",
    catatan: "",
    items: [
      {
        id_barang: "",
        id_satuan: "",
        jumlah: 1,
        harga_beli: 0,
      },
    ],
  });

  const [saving, setSaving] = useState(false);

  // Keyboard shortcuts untuk tambah dan hapus item
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Hanya jalankan jika Ctrl/Cmd ditekan
      const isModifierPressed = e.ctrlKey || e.metaKey;

      if (!saving && isModifierPressed) {
        // Press Ctrl/Cmd + "+" or "=" key to add new item
        if (e.key === "+" || e.key === "=") {
          e.preventDefault();
          handleAddItem();
        }
        // Press Ctrl/Cmd + "-" key to remove last item
        else if (e.key === "-" && formData.items.length > 1) {
          e.preventDefault();
          handleRemoveItem(formData.items.length - 1);
        }
      }
    };
    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [saving, formData.items.length]);

  // Load edit data
  useEffect(() => {
    if (editData) {
      // Handle tanggal safely - could be from dibuat_pada
      let tanggalValue = getTodayJakarta();
      if (editData.tanggal) {
        tanggalValue = editData.tanggal.split("T")[0];
      } else if (editData.dibuat_pada) {
        tanggalValue = editData.dibuat_pada.split("T")[0];
      }

      setFormData({
        tanggal: tanggalValue,
        nomor_faktur: editData.nomor_faktur || editData.nomor_pembelian || "",
        id_vendor: editData.vendor_id || editData.id_vendor || null,
        metode_pembayaran: editData.metode_pembayaran || "CASH",
        catatan: editData.catatan || "",
        items: (editData.items || []).map((item: any) => ({
          id_barang: item.barang_id || item.id_barang,
          nama_barang: item.nama_barang,
          id_satuan: item.harga_satuan_id || item.id_satuan,
          nama_satuan: item.nama_satuan,
          faktor_konversi: item.faktor_konversi || 1,
          jumlah: item.jumlah,
          harga_beli: item.harga_satuan || item.harga_beli || 0,
        })),
      });
    }
  }, [editData]);

  // Calculate total
  const totalHarga = useMemo(() => {
    return formData.items.reduce(
      (sum, item) => sum + item.jumlah * item.harga_beli,
      0
    );
  }, [formData.items]);

  const activeVendors = useMemo(
    () => vendors.filter((v) => v.aktif_status === 1),
    [vendors]
  );

  const handleInputChange = (field: keyof PurchaseFormData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleItemChange = (
    index: number,
    field: keyof PurchaseItem,
    value: any
  ) => {
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };

    // Auto-select satuan when material changes
    if (field === "id_barang" && value) {
      const material = materials.find((m) => m.id === value);
      if (material) {
        newItems[index].nama_barang = material.nama;
        newItems[index].id_satuan = "";
        newItems[index].nama_satuan = "";
        newItems[index].faktor_konversi = 1;
      }
    }

    // Set satuan info when unit changes
    if (field === "id_satuan" && value) {
      const material = materials.find(
        (m) => m.id === newItems[index].id_barang
      );
      if (material) {
        const unit = material.unit_prices.find((u) => u.id === value);
        if (unit) {
          newItems[index].nama_satuan = unit.nama_satuan;
          newItems[index].faktor_konversi = unit.faktor_konversi;
          // Auto-populate harga_beli from materials data if available
          if (unit.harga_beli && unit.harga_beli > 0) {
            newItems[index].harga_beli = unit.harga_beli;
          }
        }
      }
    }

    setFormData((prev) => ({ ...prev, items: newItems }));
  };

  const handleAddItem = () => {
    setFormData((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          id_barang: "",
          id_satuan: "",
          jumlah: 1,
          harga_beli: 0,
        },
      ],
    }));
  };

  const handleRemoveItem = (index: number) => {
    if (formData.items.length === 1) return;
    setFormData((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.nomor_faktur.trim()) {
      showNotification("error", "Nomor faktur harus diisi!");
      return;
    }

    if (formData.items.length === 0) {
      showNotification("error", "Minimal harus ada 1 item pembelian!");
      return;
    }

    for (let i = 0; i < formData.items.length; i++) {
      const item = formData.items[i];
      if (!item.id_barang || !item.id_satuan) {
        showNotification(
          "error",
          `Item #${i + 1}: Barang dan satuan harus dipilih!`
        );
        return;
      }
      if (item.jumlah <= 0) {
        showNotification("error", `Item #${i + 1}: Jumlah harus lebih dari 0!`);
        return;
      }
      if (item.harga_beli < 0) {
        showNotification(
          "error",
          `Item #${i + 1}: Harga beli tidak boleh negatif!`
        );
        return;
      }
    }

    try {
      setSaving(true);

      const payload = {
        tanggal: formData.tanggal,
        nomor_faktur: formData.nomor_faktur,
        nomor_pembelian:
          editData?.nomor_pembelian ||
          editData?.nomor_faktur ||
          formData.nomor_faktur,
        vendor_id: formData.id_vendor,
        catatan: formData.catatan,
        metode_pembayaran: formData.metode_pembayaran,
        items: formData.items.map((item) => ({
          barang_id: item.id_barang,
          harga_satuan_id: item.id_satuan,
          jumlah: item.jumlah,
          nama_satuan: item.nama_satuan || "",
          faktor_konversi: item.faktor_konversi || 1,
          harga_satuan: item.harga_beli,
        })),
      };

      let res;
      if (editData) {
        res = await fetch(`/api/purchases/${editData.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch("/api/purchases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Gagal menyimpan pembelian");
      }

      onSuccess(
        editData
          ? "Pembelian berhasil diupdate!"
          : "Pembelian berhasil ditambahkan!"
      );

      // Reset form if adding new
      if (!editData) {
        setFormData({
          tanggal: new Date().toISOString().split("T")[0],
          nomor_faktur: "",
          id_vendor: null,
          metode_pembayaran: "CASH",
          catatan: "",
          items: [
            {
              id_barang: "",
              id_satuan: "",
              jumlah: 1,
              harga_beli: 0,
            },
          ],
        });
      }
    } catch (error: any) {
      console.error("Error saving purchase:", error);
      showNotification("error", error.message || "Gagal menyimpan pembelian");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Header Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            Tanggal <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={formData.tanggal}
            onChange={(e) => handleInputChange("tanggal", e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            Nomor Faktur <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.nomor_faktur}
            onChange={(e) => handleInputChange("nomor_faktur", e.target.value)}
            placeholder="INV-001"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            Vendor
            <button
              type="button"
              onClick={onQuickAddVendor}
              className="ml-2 text-xs text-[#2266ff] hover:text-[#0a1b3d] font-semibold"
            >
              + Tambah Vendor
            </button>
          </label>
          <SearchableSelect
            options={[
              { value: "", label: "-- Tanpa Vendor (Tanpa Nota) --" },
              ...activeVendors.map((v) => ({
                value: v.id,
                label: v.nama_perusahaan,
              })),
            ]}
            value={formData.id_vendor || ""}
            onChange={(value) => handleInputChange("id_vendor", value || null)}
            placeholder="Pilih vendor atau tanpa vendor"
            emptyText="Tidak ada vendor aktif"
          />
        </div>
      </div>

      {/* Items Section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-semibold text-gray-700">
            Item Pembelian <span className="text-red-500">*</span>
          </label>
          <button
            type="button"
            onClick={onQuickAddMaterial}
            className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold"
          >
            + Tambah Barang Baru
          </button>
        </div>

        <div className="border border-gray-300 rounded-lg max-h-[400px] overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-gradient-to-r from-indigo-500 to-purple-500 text-white z-10">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold">
                  Barang
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold">
                  Satuan
                </th>
                <th className="px-3 py-2 text-center text-xs font-semibold">
                  Jumlah
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold">
                  Harga Beli
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold">
                  Subtotal
                </th>
                <th className="px-3 py-2 text-center text-xs font-semibold w-12">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody>
              {formData.items.map((item, index) => {
                const selectedMaterial = materials.find(
                  (m) => m.id === item.id_barang
                );
                const subtotal = item.jumlah * item.harga_beli;

                return (
                  <tr
                    key={index}
                    className={`border-b ${
                      index % 2 === 0 ? "bg-white" : "bg-gray-50"
                    }`}
                  >
                    <td className="px-3 py-2">
                      <SearchableSelect
                        options={[
                          { value: "", label: "-- Pilih Barang --" },
                          ...materials.map((m) => ({
                            value: m.id,
                            label: m.nama,
                          })),
                        ]}
                        value={item.id_barang}
                        onChange={(value) =>
                          handleItemChange(index, "id_barang", value)
                        }
                        placeholder="Cari barang..."
                        emptyText="Tidak ada barang"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={item.id_satuan}
                        onChange={(e) =>
                          handleItemChange(index, "id_satuan", e.target.value)
                        }
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        disabled={!item.id_barang}
                        required
                      >
                        <option value="">-- Pilih Satuan --</option>
                        {selectedMaterial?.unit_prices.map((unit) => (
                          <option key={unit.id} value={unit.id}>
                            {unit.nama_satuan}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={item.jumlah}
                        onChange={(e) =>
                          handleItemChange(
                            index,
                            "jumlah",
                            parseFloat(e.target.value) || 0
                          )
                        }
                        min="0.01"
                        step="0.01"
                        className="w-full px-2 py-1 text-sm text-center border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        required
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={item.harga_beli}
                        onChange={(e) =>
                          handleItemChange(
                            index,
                            "harga_beli",
                            parseFloat(e.target.value) || 0
                          )
                        }
                        min="0"
                        step="any"
                        className="w-full px-2 py-1 text-sm text-right border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        required
                      />
                    </td>
                    <td className="px-3 py-2 text-right text-sm font-semibold text-gray-800">
                      Rp {subtotal.toLocaleString("id-ID")}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={handleAddItem}
                          className="p-1 text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                          title="Tambah Item (tekan +)"
                        >
                          <PlusIcon size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(index)}
                          disabled={formData.items.length === 1}
                          className={`p-1 rounded transition-colors ${
                            formData.items.length === 1
                              ? "text-gray-400 cursor-not-allowed"
                              : "text-red-600 hover:bg-red-50"
                          }`}
                          title="Hapus Item (tekan -)"
                        >
                          <TrashIcon size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gradient-to-r from-indigo-50 to-purple-50">
                <td
                  colSpan={4}
                  className="px-3 py-2 text-right font-bold text-gray-800"
                >
                  TOTAL:
                </td>
                <td className="px-3 py-2 text-right font-bold text-lg text-indigo-700">
                  Rp {totalHarga.toLocaleString("id-ID")}
                </td>
                <td></td>
              </tr>
              {/* Payment Method Row */}
              <tr className="bg-white border-t-2 border-gray-300">
                <td colSpan={6} className="px-4 py-3">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Metode Pembayaran <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="metode_pembayaran"
                        value="CASH"
                        checked={formData.metode_pembayaran === "CASH"}
                        onChange={(e) =>
                          handleInputChange("metode_pembayaran", e.target.value)
                        }
                        className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="flex items-center gap-1.5 text-sm text-gray-700">
                        <CashIcon size={16} className="text-green-600" />
                        Cash (Lunas Langsung)
                      </span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="metode_pembayaran"
                        value="NET30"
                        checked={formData.metode_pembayaran === "NET30"}
                        onChange={(e) =>
                          handleInputChange("metode_pembayaran", e.target.value)
                        }
                        className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="flex items-center gap-1.5 text-sm text-gray-700">
                        <CalendarIcon size={16} className="text-amber-600" />
                        NET 30 (Jatuh Tempo 30 Hari)
                      </span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="metode_pembayaran"
                        value="COD"
                        checked={formData.metode_pembayaran === "COD"}
                        onChange={(e) =>
                          handleInputChange("metode_pembayaran", e.target.value)
                        }
                        className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="flex items-center gap-1.5 text-sm text-gray-700">
                        <PackageIcon size={16} className="text-blue-600" />
                        COD (Bayar Saat Terima)
                      </span>
                    </label>
                  </div>
                  {formData.metode_pembayaran !== "CASH" && (
                    <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="flex items-start gap-2 text-xs text-amber-700">
                        <AlertIcon size={16} className="flex-shrink-0 mt-0.5" />
                        <span>
                          <strong>Catatan:</strong> Pembelian ini akan dicatat
                          sebagai hutang dan tidak akan masuk ke buku keuangan
                          sampai dilunaskan.
                        </span>
                      </p>
                    </div>
                  )}
                </td>
              </tr>
              {/* Catatan Row */}
              <tr className="bg-white border-t border-gray-200">
                <td colSpan={6} className="px-4 py-3">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Catatan
                  </label>
                  <textarea
                    value={formData.catatan}
                    onChange={(e) =>
                      handleInputChange("catatan", e.target.value)
                    }
                    placeholder="Catatan tambahan (opsional)"
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold rounded-lg hover:from-indigo-600 hover:to-purple-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving
            ? "Menyimpan..."
            : editData
            ? "Update Pembelian"
            : "Simpan Pembelian"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="px-6 py-3 bg-gray-100 text-gray-700 font-semibold rounded-lg hover:bg-gray-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Batal
          </button>
        )}
      </div>
    </form>
  );
}
