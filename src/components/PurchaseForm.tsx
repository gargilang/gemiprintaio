"use client";

import { useState, useEffect, useMemo } from "react";
import { PlusIcon, TrashIcon } from "./icons/ContentIcons";

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
}

export default function PurchaseForm({
  editData,
  onSuccess,
  onCancel,
  materials,
  vendors,
  onQuickAddVendor,
  onQuickAddMaterial,
}: PurchaseFormProps) {
  const [formData, setFormData] = useState<PurchaseFormData>({
    tanggal: new Date().toISOString().split("T")[0],
    nomor_faktur: "",
    id_vendor: null,
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

  // Load edit data
  useEffect(() => {
    if (editData) {
      setFormData({
        tanggal: editData.tanggal.split("T")[0],
        nomor_faktur: editData.nomor_faktur,
        id_vendor: editData.id_vendor || null,
        catatan: editData.catatan || "",
        items: editData.items.map((item: any) => ({
          id_barang: item.id_barang,
          nama_barang: item.nama_barang,
          id_satuan: item.id_satuan,
          nama_satuan: item.nama_satuan,
          faktor_konversi: item.faktor_konversi,
          jumlah: item.jumlah,
          harga_beli: item.harga_beli,
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
      alert("Nomor faktur harus diisi!");
      return;
    }

    if (formData.items.length === 0) {
      alert("Minimal harus ada 1 item pembelian!");
      return;
    }

    for (let i = 0; i < formData.items.length; i++) {
      const item = formData.items[i];
      if (!item.id_barang || !item.id_satuan) {
        alert(`Item #${i + 1}: Barang dan satuan harus dipilih!`);
        return;
      }
      if (item.jumlah <= 0) {
        alert(`Item #${i + 1}: Jumlah harus lebih dari 0!`);
        return;
      }
      if (item.harga_beli < 0) {
        alert(`Item #${i + 1}: Harga beli tidak boleh negatif!`);
        return;
      }
    }

    try {
      setSaving(true);

      const payload = {
        tanggal: formData.tanggal,
        nomor_pembelian: formData.nomor_faktur,
        vendor_id: formData.id_vendor,
        catatan: formData.catatan,
        metode_pembayaran: "cash", // Default cash
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
      alert(error.message || "Gagal menyimpan pembelian");
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
              className="ml-2 text-xs text-indigo-600 hover:text-indigo-700 font-semibold"
            >
              + Tambah Vendor
            </button>
          </label>
          <select
            value={formData.id_vendor || ""}
            onChange={(e) =>
              handleInputChange("id_vendor", e.target.value || null)
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">-- Tanpa Vendor (Warung/Nota-less) --</option>
            {activeVendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.nama_perusahaan}
              </option>
            ))}
          </select>
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
            + Tambah Bahan Baru
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border border-gray-300 rounded-lg">
            <thead className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white">
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
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="p-1 hover:bg-white/20 rounded transition-colors"
                    title="Tambah Item"
                  >
                    <PlusIcon size={16} />
                  </button>
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
                      <select
                        value={item.id_barang}
                        onChange={(e) =>
                          handleItemChange(index, "id_barang", e.target.value)
                        }
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        required
                      >
                        <option value="">-- Pilih Barang --</option>
                        {materials.map((material) => (
                          <option key={material.id} value={material.id}>
                            {material.nama}
                          </option>
                        ))}
                      </select>
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
                        step="100"
                        className="w-full px-2 py-1 text-sm text-right border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        required
                      />
                    </td>
                    <td className="px-3 py-2 text-right text-sm font-semibold text-gray-800">
                      Rp {subtotal.toLocaleString("id-ID")}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(index)}
                        disabled={formData.items.length === 1}
                        className={`p-1 rounded transition-colors ${
                          formData.items.length === 1
                            ? "text-gray-400 cursor-not-allowed"
                            : "text-red-600 hover:bg-red-50"
                        }`}
                        title="Hapus Item"
                      >
                        <TrashIcon size={16} />
                      </button>
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
            </tfoot>
          </table>
        </div>
      </div>

      {/* Catatan */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">
          Catatan
        </label>
        <textarea
          value={formData.catatan}
          onChange={(e) => handleInputChange("catatan", e.target.value)}
          placeholder="Catatan tambahan (opsional)"
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
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
