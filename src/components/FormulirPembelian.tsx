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
import PilihanCari from "./PilihanCari";
import { getTodayJakarta } from "@/lib/date-utils";

interface SplitBatch {
  count: number;
  targets_text: string;
}

interface PurchaseItem {
  id_barang: string;
  nama_barang?: string;
  id_satuan: string;
  nama_satuan?: string;
  faktor_konversi?: number;
  jumlah: number;
  harga_beli: number;
  // Hanya diisi untuk barang dengan butuh_dimensi_status = 1.
  // jumlah lalu diturunkan sebagai jumlah_roll * panjang * lebar (m²).
  panjang?: number | null;
  lebar?: number | null;
  /** Jumlah roll fisik dengan dimensi sama (default 1). */
  jumlah_roll?: number;
  // Opsional: pecah roll lebar ini ke beberapa lebar baru saat penerimaan.
  // Setiap batch = N roll dengan pola potongan yang sama.
  split_enabled?: boolean;
  split_batches?: SplitBatch[];
}

interface PurchaseFormData {
  tanggal: string;
  nomor_faktur: string;
  id_vendor: string | null;
  metode_pembayaran: "CASH" | "NET30" | "COD";
  catatan: string;
  diterima_oleh: string;
  items: PurchaseItem[];
  // PPN masukan
  kena_ppn: boolean;
  ppn_persen: number;
  ppn_metode: "EKSKLUSIF" | "INKLUSIF";
  dapat_dikreditkan: boolean;
  nomor_faktur_pajak_vendor: string;
  tanggal_faktur_pajak: string;
}

interface Material {
  id: string;
  nama: string;
  satuan_dasar: string;
  butuh_dimensi_status?: number | boolean;
  unit_prices: {
    id: string;
    nama_satuan: string;
    faktor_konversi: number;
    harga_jual: number;
    harga_beli: number;
    default_status?: number | boolean;
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
  onCreatePurchase: (data: any) => Promise<any>;
  onUpdatePurchase: (id: string, data: any) => Promise<any>;
}

function isDimensionalMaterial(material: Material | undefined): boolean {
  if (!material) return false;
  const flag = material.butuh_dimensi_status;
  return flag === 1 || flag === true;
}

function parseSplitTargets(text: string | undefined | null): number[] {
  if (!text) return [];
  return text
    .split(/[,+\s]+/)
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/** Jumlah roll di batch yang valid (non-kosong). */
function sumBatchRolls(batches: SplitBatch[] | undefined): number {
  if (!batches) return 0;
  return batches.reduce(
    (sum, b) => sum + Math.max(0, Math.round(Number(b.count) || 0)),
    0
  );
}

export default function FormulirPembelian({
  editData,
  onSuccess,
  onCancel,
  materials,
  vendors,
  onQuickAddVendor,
  onQuickAddMaterial,
  showNotification,
  onCreatePurchase,
  onUpdatePurchase,
}: PurchaseFormProps) {
  const [formData, setFormData] = useState<PurchaseFormData>({
    tanggal: getTodayJakarta(),
    nomor_faktur: "",
    id_vendor: null,
    metode_pembayaran: "CASH",
    catatan: "",
    diterima_oleh: "",
    items: [
      {
        id_barang: "",
        id_satuan: "",
        jumlah: 1,
        harga_beli: 0,
        panjang: null,
        lebar: null,
        jumlah_roll: 1,
        split_enabled: false,
        split_batches: [],
      },
    ],
    kena_ppn: false,
    ppn_persen: 11,
    ppn_metode: "EKSKLUSIF",
    dapat_dikreditkan: true,
    nomor_faktur_pajak_vendor: "",
    tanggal_faktur_pajak: "",
  });

  const [saving, setSaving] = useState(false);
  const [splitModalIndex, setSplitModalIndex] = useState<number | null>(null);
  const [splitModalDraft, setSplitModalDraft] = useState<SplitBatch[]>([]);

  // Pintasan keyboard untuk menambah dan menghapus item
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // ESC closes the split-batches modal first if it's open
      if (e.key === "Escape" && splitModalIndex != null) {
        e.preventDefault();
        setSplitModalIndex(null);
        setSplitModalDraft([]);
        return;
      }
      // Hanya jalan saat Ctrl/Cmd ditekan
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
  }, [saving, formData.items.length, splitModalIndex]);

  // Muat data edit
  useEffect(() => {
    if (editData) {
      // Tangani tanggal dengan aman - bisa dari dibuat_pada
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
        diterima_oleh: editData.diterima_oleh || "",
        items: (editData.items || []).map((item: any) => ({
          id_barang: item.barang_id || item.id_barang,
          nama_barang: item.nama_barang,
          id_satuan: item.harga_satuan_id || item.id_satuan,
          nama_satuan: item.nama_satuan,
          faktor_konversi: item.faktor_konversi || 1,
          jumlah: item.jumlah,
          harga_beli: item.harga_satuan || item.harga_beli || 0,
          panjang: item.panjang ?? null,
          lebar: item.lebar ?? null,
          jumlah_roll: Math.max(1, Math.round(Number(item.jumlah_roll) || 1)),
          split_enabled: false,
          split_batches: [],
        })),
        kena_ppn: !!editData.kena_ppn,
        ppn_persen: Number(editData.ppn_persen ?? 11),
        ppn_metode: (editData.ppn_metode as "EKSKLUSIF" | "INKLUSIF") || "EKSKLUSIF",
        dapat_dikreditkan: editData.dapat_dikreditkan === 0 ? false : true,
        nomor_faktur_pajak_vendor: editData.nomor_faktur_pajak_vendor || "",
        tanggal_faktur_pajak: editData.tanggal_faktur_pajak
          ? String(editData.tanggal_faktur_pajak).split("T")[0]
          : "",
      });
    }
  }, [editData]);

  // Hitung total
  const totalHarga = useMemo(() => {
    return formData.items.reduce(
      (sum, item) => sum + item.jumlah * item.harga_beli,
      0
    );
  }, [formData.items]);

  const hasAnyDimensional = useMemo(() => {
    return formData.items.some((item) => {
      const material = materials.find((m) => m.id === item.id_barang);
      return isDimensionalMaterial(material);
    });
  }, [formData.items, materials]);

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
        const isDimensional = isDimensionalMaterial(material);
        newItems[index].nama_barang = material.nama;

        // Auto-pick the canonical unit so users don't have to click into
        // the dropdown for the common case (single-unit materials, or the
        // base unit on multi-unit materials). Preference order:
        //   1. unit flagged as default
        //   2. unit with faktor_konversi === 1 (the base / smallest unit)
        //   3. first unit in the list
        const defaultUnit =
          material.unit_prices.find((u) => Number(u.default_status) === 1) ??
          material.unit_prices.find((u) => Number(u.faktor_konversi) === 1) ??
          material.unit_prices[0];

        if (defaultUnit) {
          newItems[index].id_satuan = defaultUnit.id;
          newItems[index].nama_satuan = defaultUnit.nama_satuan;
          newItems[index].faktor_konversi = defaultUnit.faktor_konversi;
          if (defaultUnit.harga_beli && defaultUnit.harga_beli > 0) {
            newItems[index].harga_beli = defaultUnit.harga_beli;
          }
        } else {
          newItems[index].id_satuan = "";
          newItems[index].nama_satuan = "";
          newItems[index].faktor_konversi = 1;
        }

        newItems[index].panjang = isDimensional ? 0 : null;
        newItems[index].lebar = isDimensional ? 0 : null;
        newItems[index].jumlah = isDimensional ? 0 : 1;
        newItems[index].jumlah_roll = isDimensional ? 1 : undefined;
        if (!isDimensional) {
          newItems[index].split_enabled = false;
          newItems[index].split_batches = [];
        }
      }
    }

    // Atur info satuan saat satuan berubah
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

    // Hitung ulang jumlah (m²) saat panjang/lebar/jumlah_roll berubah untuk
    // dimensional items. jumlah = jumlah_roll × panjang × lebar.
    if (field === "panjang" || field === "lebar" || field === "jumlah_roll") {
      const p = Number(newItems[index].panjang) || 0;
      const l = Number(newItems[index].lebar) || 0;
      const qty = Math.max(
        1,
        Math.round(Number(newItems[index].jumlah_roll) || 1)
      );
      newItems[index].jumlah = qty * p * l;
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
          panjang: null,
          lebar: null,
          jumlah_roll: 1,
          split_enabled: false,
          split_batches: [],
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

  /**
   * Buka modal pola-potong untuk satu item. Memuat split_batches yang sudah ada.
   * batches as draft, or seeds a single default batch covering all rolls.
   */
  const handleOpenSplit = (index: number) => {
    const item = formData.items[index];
    const qty = Math.max(1, Math.round(Number(item.jumlah_roll) || 1));
    const existing = item.split_batches ?? [];
    setSplitModalDraft(
      existing.length > 0
        ? existing.map((b) => ({ ...b }))
        : [{ count: qty, targets_text: "" }]
    );
    setSplitModalIndex(index);
  };

  const handleSplitDraftAddBatch = () => {
    if (splitModalIndex == null) return;
    const item = formData.items[splitModalIndex];
    const qty = Math.max(1, Math.round(Number(item.jumlah_roll) || 1));
    const used = sumBatchRolls(splitModalDraft);
    const remaining = Math.max(1, qty - used);
    setSplitModalDraft((prev) => [
      ...prev,
      { count: remaining, targets_text: "" },
    ]);
  };

  const handleSplitDraftRemoveBatch = (batchIndex: number) => {
    setSplitModalDraft((prev) => prev.filter((_, i) => i !== batchIndex));
  };

  const handleSplitDraftChange = (
    batchIndex: number,
    field: keyof SplitBatch,
    value: any
  ) => {
    setSplitModalDraft((prev) => {
      const next = [...prev];
      const batch = { ...next[batchIndex] };
      if (field === "count") {
        batch.count = Math.max(0, Math.round(Number(value) || 0));
      } else {
        batch.targets_text = String(value);
      }
      next[batchIndex] = batch;
      return next;
    });
  };

  const handleSplitModalSave = () => {
    if (splitModalIndex == null) return;
    const item = formData.items[splitModalIndex];
    const lebar = Number(item.lebar) || 0;
    const qty = Math.max(1, Math.round(Number(item.jumlah_roll) || 1));

    const validBatches = splitModalDraft
      .map((b) => ({
        count: Math.max(0, Math.round(Number(b.count) || 0)),
        targets: parseSplitTargets(b.targets_text),
        targets_text: b.targets_text,
      }))
      .filter((b) => b.count > 0 && b.targets.length > 0);

    for (const b of validBatches) {
      const sum = b.targets.reduce((acc, n) => acc + n, 0);
      if (Math.abs(sum - lebar) > 0.000001) {
        showNotification(
          "error",
          `Total lebar pola (${sum}m) harus sama dengan lebar roll (${lebar}m).`
        );
        return;
      }
    }
    const totalCount = validBatches.reduce((sum, b) => sum + b.count, 0);
    if (totalCount > qty) {
      showNotification(
        "error",
        `Total roll dipotong (${totalCount}) melebihi qty (${qty}).`
      );
      return;
    }

    setFormData((prev) => {
      const items = [...prev.items];
      const target = { ...items[splitModalIndex] };
      target.split_batches = validBatches.map((b) => ({
        count: b.count,
        targets_text: b.targets_text,
      }));
      target.split_enabled = validBatches.length > 0;
      items[splitModalIndex] = target;
      return { ...prev, items };
    });
    setSplitModalIndex(null);
    setSplitModalDraft([]);
  };

  const handleSplitModalClear = () => {
    if (splitModalIndex == null) return;
    setFormData((prev) => {
      const items = [...prev.items];
      const target = { ...items[splitModalIndex] };
      target.split_batches = [];
      target.split_enabled = false;
      items[splitModalIndex] = target;
      return { ...prev, items };
    });
    setSplitModalIndex(null);
    setSplitModalDraft([]);
  };

  const handleSplitModalClose = () => {
    setSplitModalIndex(null);
    setSplitModalDraft([]);
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
      const material = materials.find((m) => m.id === item.id_barang);
      const isDimensional = isDimensionalMaterial(material);
      if (isDimensional) {
        const l = Number(item.lebar);
        const p = Number(item.panjang);
        const qty = Math.max(1, Math.round(Number(item.jumlah_roll) || 1));
        if (!l || l <= 0 || !p || p <= 0) {
          showNotification(
            "error",
            `Item #${i + 1}: Lebar dan panjang harus lebih dari 0!`
          );
          return;
        }
        if (qty < 1) {
          showNotification(
            "error",
            `Item #${i + 1}: Jumlah roll harus minimal 1!`
          );
          return;
        }
        if (item.split_enabled) {
          const batches = item.split_batches ?? [];
          const validBatches = batches
            .map((b) => ({
              count: Math.max(0, Math.round(Number(b.count) || 0)),
              targets: parseSplitTargets(b.targets_text),
            }))
            .filter((b) => b.count > 0 || b.targets.length > 0);
          if (validBatches.length === 0) {
            showNotification(
              "error",
              `Item #${i + 1}: Tambahkan minimal 1 pola potongan, atau matikan "Potong roll".`
            );
            return;
          }
          let totalCount = 0;
          for (const b of validBatches) {
            if (b.count <= 0) {
              showNotification(
                "error",
                `Item #${i + 1}: Jumlah roll per pola harus minimal 1.`
              );
              return;
            }
            if (b.targets.length === 0) {
              showNotification(
                "error",
                `Item #${i + 1}: Isi lebar potongan untuk pola, contoh "1.5, 1".`
              );
              return;
            }
            const sum = b.targets.reduce((acc, n) => acc + n, 0);
            if (Math.abs(sum - l) > 0.000001) {
              showNotification(
                "error",
                `Item #${i + 1}: Total lebar pola (${sum}m) harus sama dengan lebar roll (${l}m).`
              );
              return;
            }
            totalCount += b.count;
          }
          if (totalCount > qty) {
            showNotification(
              "error",
              `Item #${i + 1}: Total roll yang dipotong (${totalCount}) melebihi jumlah roll dibeli (${qty}). Roll yang tidak dipotong tetap utuh.`
            );
            return;
          }
        }
      } else if (item.jumlah <= 0) {
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
        diterima_oleh: formData.diterima_oleh,
        metode_pembayaran: formData.metode_pembayaran,
        items: formData.items.map((item) => {
          const material = materials.find((m) => m.id === item.id_barang);
          const isDimensional = isDimensionalMaterial(material);
          const splitBatches =
            isDimensional && item.split_enabled && item.split_batches
              ? item.split_batches
                  .map((b) => ({
                    roll_count: Math.max(0, Math.round(Number(b.count) || 0)),
                    targets: parseSplitTargets(b.targets_text),
                  }))
                  .filter(
                    (b) => b.roll_count > 0 && b.targets.length > 0
                  )
              : [];
          return {
            barang_id: item.id_barang,
            harga_satuan_id: item.id_satuan,
            jumlah: item.jumlah,
            nama_satuan: item.nama_satuan || "",
            faktor_konversi: item.faktor_konversi || 1,
            harga_satuan: item.harga_beli,
            panjang: isDimensional ? item.panjang ?? null : null,
            lebar: isDimensional ? item.lebar ?? null : null,
            jumlah_roll: isDimensional
              ? Math.max(1, Math.round(Number(item.jumlah_roll) || 1))
              : 1,
            split_batches: splitBatches.length > 0 ? splitBatches : null,
          };
        }),
        // PPN masukan
        kena_ppn: formData.kena_ppn,
        ppn_persen: formData.kena_ppn ? formData.ppn_persen : 0,
        ppn_metode: formData.ppn_metode,
        dapat_dikreditkan: formData.dapat_dikreditkan,
        nomor_faktur_pajak_vendor: formData.kena_ppn
          ? formData.nomor_faktur_pajak_vendor.trim() || null
          : null,
        tanggal_faktur_pajak: formData.kena_ppn
          ? formData.tanggal_faktur_pajak || null
          : null,
      };

      if (editData) {
        await onUpdatePurchase(editData.id, payload);
      } else {
        await onCreatePurchase(payload);
      }

      onSuccess(
        editData
          ? "Pembelian berhasil diupdate!"
          : "Pembelian berhasil ditambahkan!"
      );

      // Reset form kalau menambah baru
      if (!editData) {
        setFormData({
          tanggal: new Date().toISOString().split("T")[0],
          nomor_faktur: "",
          id_vendor: null,
          metode_pembayaran: "CASH",
          catatan: "",
          diterima_oleh: "",
          items: [
            {
              id_barang: "",
              id_satuan: "",
              jumlah: 1,
              harga_beli: 0,
              panjang: null,
              lebar: null,
              jumlah_roll: 1,
              split_enabled: false,
              split_batches: [],
            },
          ],
          kena_ppn: false,
          ppn_persen: 11,
          ppn_metode: "EKSKLUSIF",
          dapat_dikreditkan: true,
          nomor_faktur_pajak_vendor: "",
          tanggal_faktur_pajak: "",
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
    <>
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Header Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">
            Tanggal <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={formData.tanggal}
            onChange={(e) => handleInputChange("tanggal", e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800 dark:text-slate-100"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">
            Nomor Faktur <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.nomor_faktur}
            onChange={(e) => handleInputChange("nomor_faktur", e.target.value)}
            placeholder="INV-001"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800 dark:text-slate-100"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">
            Vendor
            <button
              type="button"
              onClick={onQuickAddVendor}
              className="ml-2 text-xs text-[#2266ff] hover:text-[#0a1b3d] font-semibold"
            >
              + Tambah Vendor
            </button>
          </label>
          <PilihanCari
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
          <label className="text-sm font-semibold text-gray-700 dark:text-slate-300">
            Item Pembelian <span className="text-red-500">*</span>
          </label>
          <button
            type="button"
            onClick={onQuickAddMaterial}
            className="text-xs text-emerald-600 dark:text-emerald-300 hover:text-emerald-700 dark:text-emerald-300 font-semibold"
          >
            + Tambah Barang Baru
          </button>
        </div>

        <div className="border border-gray-300 rounded-lg max-h-[600px] overflow-y-auto">
          <table className="w-full table-fixed">
            <colgroup>
              <col className="w-[24%]" />
              <col className="w-[9%]" />
              <col className="w-[24%]" />
              <col className="w-[13%]" />
              <col className="w-[18%]" />
              <col className="w-[12%]" />
            </colgroup>
            <thead className="sticky top-0 bg-gradient-to-r from-indigo-500 to-purple-500 text-white z-10">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold">
                  Barang
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold">
                  Satuan
                </th>
                <th className="px-3 py-2 text-center text-xs font-semibold">
                  {hasAnyDimensional ? "Jumlah & Dimensi" : "Jumlah"}
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold">
                  Harga Beli
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold">
                  Subtotal
                </th>
                <th className="px-3 py-2 text-center text-xs font-semibold">
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
                const isDimensional = isDimensionalMaterial(selectedMaterial);

                return (
                  <tr
                    key={index}
                    className={`border-b ${
                      index % 2 === 0 ? "bg-white dark:bg-slate-900" : "bg-gray-50 dark:bg-slate-800"
                    }`}
                  >
                    <td className="px-3 py-2 align-top">
                      <PilihanCari
                        options={materials.map((m) => ({
                          value: m.id,
                          label: m.nama,
                        }))}
                        value={item.id_barang}
                        onChange={(value) =>
                          handleItemChange(index, "id_barang", value)
                        }
                        placeholder="Cari barang..."
                        emptyText="Tidak ada barang"
                        inputClassName="!px-2 !py-1 !h-[30px] text-sm"
                      />
                      {isDimensional && (
                        <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                          Barang dimensi · stok dalam m²
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <select
                        value={item.id_satuan}
                        onChange={(e) =>
                          handleItemChange(index, "id_satuan", e.target.value)
                        }
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 h-[30px] dark:bg-slate-800 dark:text-slate-100"
                        disabled={!item.id_barang}
                        required
                      >
                        <option value="" disabled hidden>Satuan</option>
                        {selectedMaterial?.unit_prices.map((unit) => (
                          <option key={unit.id} value={unit.id}>
                            {unit.nama_satuan}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 align-top">
                      {isDimensional ? (
                        <div className="space-y-1">
                          <div className="flex items-center justify-center gap-1">
                            <input
                              type="number"
                              value={item.jumlah_roll ?? 1}
                              onChange={(e) =>
                                handleItemChange(
                                  index,
                                  "jumlah_roll",
                                  e.target.value === ""
                                    ? 1
                                    : Math.max(
                                        1,
                                        Math.round(
                                          parseFloat(e.target.value) || 1
                                        )
                                      )
                                )
                              }
                              min="1"
                              step="1"
                              inputMode="numeric"
                              placeholder="Qty"
                              title="Jumlah roll dengan dimensi yang sama"
                              className="w-12 px-1 py-1 h-[30px] text-sm text-center border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800 dark:text-slate-100"
                              required
                            />
                            <span className="text-xs text-gray-500 dark:text-slate-400">roll</span>
                            <span className="text-xs text-gray-500 dark:text-slate-400 ml-0.5">·</span>
                            <input
                              type="number"
                              value={item.lebar ?? ""}
                              onChange={(e) =>
                                handleItemChange(
                                  index,
                                  "lebar",
                                  e.target.value === ""
                                    ? null
                                    : parseFloat(e.target.value) || 0
                                )
                              }
                              min="0"
                              max="999"
                              step="any"
                              inputMode="decimal"
                              placeholder="L"
                              title="Lebar roll (m)"
                              className="w-14 px-1 py-1 h-[30px] text-sm text-center border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800 dark:text-slate-100"
                              required
                            />
                            <span className="text-xs text-gray-500 dark:text-slate-400">×</span>
                            <input
                              type="number"
                              value={item.panjang ?? ""}
                              onChange={(e) =>
                                handleItemChange(
                                  index,
                                  "panjang",
                                  e.target.value === ""
                                    ? null
                                    : parseFloat(e.target.value) || 0
                                )
                              }
                              min="0"
                              max="9999"
                              step="any"
                              inputMode="decimal"
                              placeholder="P"
                              title="Panjang per roll (m)"
                              className="w-14 px-1 py-1 h-[30px] text-sm text-center border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800 dark:text-slate-100"
                              required
                            />
                          </div>
                          <p className="text-[11px] text-gray-500 dark:text-slate-400 text-center">
                            {(item.jumlah_roll ?? 1) > 1 ? `${item.jumlah_roll} × ` : ""}
                            L × P = {item.jumlah.toLocaleString("id-ID")} m²
                          </p>
                          {item.split_enabled && (item.split_batches?.length ?? 0) > 0 ? (
                            (() => {
                              const qty = Math.max(
                                1,
                                Math.round(Number(item.jumlah_roll) || 1)
                              );
                              const used = sumBatchRolls(item.split_batches);
                              return (
                                <div className="flex items-center justify-center gap-1 text-[10px] text-purple-700 dark:text-purple-300">
                                  <svg
                                    className="w-3 h-3"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z"
                                    />
                                  </svg>
                                  <span>
                                    {used}/{qty} roll dipotong ·{" "}
                                    {item.split_batches!.length} pola
                                  </span>
                                </div>
                              );
                            })()
                          ) : null}
                        </div>
                      ) : (
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
                          onKeyDown={(e) => {
                            if (e.key !== "ArrowUp" && e.key !== "ArrowDown") {
                              return;
                            }
                            e.preventDefault();
                            const delta = e.key === "ArrowUp" ? 1 : -1;
                            const next = Math.max(0, (item.jumlah || 0) + delta);
                            handleItemChange(index, "jumlah", next);
                          }}
                          min="0"
                          step="any"
                          inputMode="decimal"
                          className="w-full px-2 py-1 h-[30px] text-sm text-center border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800 dark:text-slate-100"
                          required
                        />
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
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
                        title={
                          isDimensional
                            ? "Harga per m²"
                            : "Harga per satuan"
                        }
                        className="w-full px-2 py-1 h-[30px] text-sm text-right border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800 dark:text-slate-100"
                        required
                      />
                      {isDimensional && (
                        <p className="text-[11px] text-gray-500 dark:text-slate-400 text-right mt-0.5">
                          per m²
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-right text-sm font-semibold text-gray-800 dark:text-slate-100 whitespace-nowrap">
                      Rp {subtotal.toLocaleString("id-ID")}
                    </td>
                    <td className="px-3 py-2 align-top text-center">
                      <div className="flex items-center justify-center gap-1">
                        {isDimensional && (
                          <button
                            type="button"
                            onClick={() => handleOpenSplit(index)}
                            disabled={
                              !Number(item.lebar) ||
                              !Number(item.panjang) ||
                              !Number(item.jumlah_roll)
                            }
                            className={`p-2 rounded-lg transition-colors ${
                              item.split_enabled &&
                              (item.split_batches?.length ?? 0) > 0
                                ? "text-purple-600 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40 hover:bg-purple-100 dark:hover:bg-purple-900/40"
                                : "text-purple-600 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-white/10"
                            } disabled:opacity-30 disabled:cursor-not-allowed`}
                            title={
                              !Number(item.lebar) || !Number(item.panjang)
                                ? "Isi lebar & panjang dulu"
                                : "Atur potongan roll"
                            }
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
                                d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z"
                              />
                            </svg>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={handleAddItem}
                          className="p-2 text-indigo-600 dark:text-indigo-300 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-colors"
                          title="Tambah Item (tekan +)"
                        >
                          <PlusIcon size={20} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(index)}
                          disabled={formData.items.length === 1}
                          className={`p-2 rounded-lg transition-colors ${
                            formData.items.length === 1
                              ? "text-gray-400 cursor-not-allowed"
                              : "text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                          }`}
                          title="Hapus Item (tekan -)"
                        >
                          <TrashIcon size={20} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-indigo-100 bg-gradient-to-r from-indigo-50 to-purple-50 dark:border-indigo-800/50 dark:from-slate-800 dark:via-indigo-950/40 dark:to-slate-800">
                <td
                  colSpan={4}
                  className="px-3 py-2 text-right font-bold text-gray-800 dark:text-slate-200"
                >
                  TOTAL:
                </td>
                <td className="px-3 py-2 text-right font-bold text-lg text-indigo-700 dark:text-cyan-300">
                  Rp {totalHarga.toLocaleString("id-ID")}
                </td>
                <td></td>
              </tr>
              {/* Payment Method Row */}
              <tr className="bg-white dark:bg-slate-900 border-t-2 border-gray-300">
                <td colSpan={6} className="px-4 py-3">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">
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
                        className="w-4 h-4 text-indigo-600 dark:text-indigo-300 focus:ring-indigo-500"
                      />
                      <span className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-slate-300">
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
                        className="w-4 h-4 text-indigo-600 dark:text-indigo-300 focus:ring-indigo-500"
                      />
                      <span className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-slate-300">
                        <CalendarIcon size={16} className="text-amber-600 dark:text-amber-300" />
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
                        className="w-4 h-4 text-indigo-600 dark:text-indigo-300 focus:ring-indigo-500"
                      />
                      <span className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-slate-300">
                        <PackageIcon size={16} className="text-blue-600 dark:text-blue-300" />
                        COD (Bayar Saat Terima)
                      </span>
                    </label>
                  </div>
                  {formData.metode_pembayaran !== "CASH" && (
                    <div className="mt-2 p-3 bg-amber-50 dark:bg-slate-800 border border-amber-200 dark:border-amber-800/50 rounded-lg">
                      <p className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
                        <AlertIcon size={16} className="flex-shrink-0 mt-0.5" />
                        <span>
                          <strong>Catatan:</strong> Pembelian ini akan dicatat
                          sebagai tagihan dan tidak akan masuk ke buku keuangan
                          sampai dilunaskan.
                        </span>
                      </p>
                    </div>
                  )}
                </td>
              </tr>
              {/* Catatan Row */}
              <tr className="bg-white dark:bg-slate-900 border-t border-gray-200 dark:border-slate-800">
                <td colSpan={6} className="px-4 py-3">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">
                    Catatan
                  </label>
                  <textarea
                    value={formData.catatan}
                    onChange={(e) =>
                      handleInputChange("catatan", e.target.value)
                    }
                    placeholder="Catatan tambahan (opsional)"
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800 dark:text-slate-100"
                  />
                </td>
              </tr>
              {/* PPN masukan */}
              <tr className="bg-emerald-50 dark:bg-slate-800 border-t border-gray-200 dark:border-slate-800">
                <td colSpan={6} className="px-4 py-3 space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.kena_ppn}
                      onChange={(e) =>
                        handleInputChange("kena_ppn", e.target.checked)
                      }
                      className="w-4 h-4 rounded text-emerald-600 dark:text-emerald-300"
                    />
                    <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                      Pembelian ini kena PPN (PPN masukan)
                    </span>
                  </label>
                  {formData.kena_ppn && (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">
                          Tarif PPN (%)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.ppn_persen}
                          onChange={(e) =>
                            handleInputChange(
                              "ppn_persen",
                              parseFloat(e.target.value) || 0
                            )
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">
                          Metode harga
                        </label>
                        <select
                          value={formData.ppn_metode}
                          onChange={(e) =>
                            handleInputChange(
                              "ppn_metode",
                              e.target.value as "EKSKLUSIF" | "INKLUSIF"
                            )
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        >
                          <option value="EKSKLUSIF">Belum termasuk PPN</option>
                          <option value="INKLUSIF">Sudah termasuk PPN</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">
                          No. Faktur Pajak Vendor
                        </label>
                        <input
                          type="text"
                          value={formData.nomor_faktur_pajak_vendor}
                          onChange={(e) =>
                            handleInputChange(
                              "nomor_faktur_pajak_vendor",
                              e.target.value
                            )
                          }
                          placeholder="010.000-25.00000001"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">
                          Tanggal Faktur Pajak
                        </label>
                        <input
                          type="date"
                          value={formData.tanggal_faktur_pajak}
                          onChange={(e) =>
                            handleInputChange(
                              "tanggal_faktur_pajak",
                              e.target.value
                            )
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                      </div>
                      <div className="md:col-span-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.dapat_dikreditkan}
                            onChange={(e) =>
                              handleInputChange(
                                "dapat_dikreditkan",
                                e.target.checked
                              )
                            }
                            className="w-4 h-4 rounded text-emerald-600 dark:text-emerald-300"
                          />
                          <span className="text-xs text-gray-700 dark:text-slate-300">
                            PPN masukan dapat dikreditkan (centang kalau faktur
                            pajak vendor lengkap dan vendor PKP)
                          </span>
                        </label>
                      </div>
                    </div>
                  )}
                </td>
              </tr>
              {/* Diterima Oleh Row */}
              <tr className="bg-white dark:bg-slate-900 border-t border-gray-200 dark:border-slate-800">
                <td colSpan={6} className="px-4 py-3">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">
                    Diterima Oleh
                    <span className="ml-1 text-xs font-normal text-gray-400">
                      (nama penerima barang di gudang)
                    </span>
                  </label>
                  <input
                    type="text"
                    value={formData.diterima_oleh}
                    onChange={(e) =>
                      handleInputChange("diterima_oleh", e.target.value)
                    }
                    placeholder="Nama penerima barang (opsional)"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800 dark:text-slate-100"
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
            className="px-6 py-3 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 font-semibold rounded-lg hover:bg-gray-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Batal
          </button>
        )}
      </div>
    </form>
    {splitModalIndex != null &&
      (() => {
        const item = formData.items[splitModalIndex];
        if (!item) return null;
        const lebar = Number(item.lebar) || 0;
        const panjang = Number(item.panjang) || 0;
        const qty = Math.max(1, Math.round(Number(item.jumlah_roll) || 1));
        const usedRolls = sumBatchRolls(splitModalDraft);
        const remaining = qty - usedRolls;
        return (
          <div
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) handleSplitModalClose();
            }}
          >
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-auto">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-purple-700 dark:text-purple-300">
                    Atur Potongan Roll
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-slate-300 mt-1">
                    {item.nama_barang || "Item"} · {qty} roll @ {lebar}m × {panjang}m
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSplitModalClose}
                  className="p-1 text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-white/10 rounded"
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
              <p className="text-xs text-gray-500 dark:text-slate-400">
                Tiap pola = N roll dengan lebar potongan yang sama. Total lebar
                tiap pola harus sama dengan {lebar}m. Roll yang tidak masuk
                pola manapun akan dibiarkan utuh.
              </p>
              <div className="space-y-2">
                {splitModalDraft.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-slate-400 italic text-center py-4">
                    Belum ada pola. Klik &quot;Tambah pola&quot; di bawah.
                  </p>
                ) : null}
                {splitModalDraft.map((batch, bIdx) => {
                  const targets = parseSplitTargets(batch.targets_text);
                  const sum = targets.reduce((acc, n) => acc + n, 0);
                  const valid =
                    targets.length > 0 && Math.abs(sum - lebar) < 0.000001;
                  return (
                    <div
                      key={bIdx}
                      className="grid grid-cols-12 gap-2 items-start p-3 bg-purple-50/50 dark:bg-purple-950/20 rounded border border-purple-200 dark:border-purple-900/40"
                    >
                      <div className="col-span-2">
                        <label className="block text-[10px] text-gray-500 dark:text-slate-400 mb-0.5">
                          Roll
                        </label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={batch.count || ""}
                          onChange={(e) =>
                            handleSplitDraftChange(bIdx, "count", e.target.value)
                          }
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-slate-800 dark:text-slate-100"
                        />
                      </div>
                      <div className="col-span-9">
                        <label className="block text-[10px] text-gray-500 dark:text-slate-400 mb-0.5">
                          Lebar potongan (dipisah koma)
                        </label>
                        <input
                          type="text"
                          value={batch.targets_text ?? ""}
                          onChange={(e) =>
                            handleSplitDraftChange(
                              bIdx,
                              "targets_text",
                              e.target.value
                            )
                          }
                          placeholder="contoh: 1.5, 1"
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-slate-800 dark:text-slate-100"
                        />
                        <p
                          className={`text-[11px] mt-0.5 ${
                            valid
                              ? "text-emerald-600 dark:text-emerald-300"
                              : "text-amber-600 dark:text-amber-300"
                          }`}
                        >
                          {targets.length === 0
                            ? `Σ ? / ${lebar}m`
                            : `Σ ${sum}m / ${lebar}m`}
                        </p>
                      </div>
                      <div className="col-span-1 flex items-end justify-end h-full">
                        <button
                          type="button"
                          onClick={() => handleSplitDraftRemoveBatch(bIdx)}
                          className="mt-4 p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded"
                          title="Hapus pola"
                        >
                          <TrashIcon size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="text-gray-600 dark:text-slate-400">
                    {usedRolls} / {qty} roll dipotong
                    {remaining > 0
                      ? ` · ${remaining} dibiarkan utuh`
                      : remaining < 0
                        ? ` · melebihi ${Math.abs(remaining)} roll!`
                        : ""}
                  </span>
                  {remaining > 0 ? (
                    <button
                      type="button"
                      onClick={handleSplitDraftAddBatch}
                      className="text-purple-600 dark:text-purple-300 font-medium hover:underline"
                    >
                      + Tambah pola
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 pt-2 border-t dark:border-slate-700">
                <button
                  type="button"
                  onClick={handleSplitModalClear}
                  className="px-4 py-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg text-sm font-medium"
                >
                  Hapus semua pola
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSplitModalClose}
                    className="px-4 py-2 text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={handleSplitModalSave}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium"
                  >
                    Simpan
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
