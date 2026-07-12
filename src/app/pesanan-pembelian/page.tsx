"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useCachedData } from "@/lib/use-cached-data";
import { sembunyikanPlaceholderBarang } from "@/lib/barang-placeholder";
import { PurchaseOrderFlowIcon } from "@/components/icons/PageIcons";
import { TrashIcon } from "@/components/icons/ContentIcons";
import MenuAksi from "@/components/MenuAksi";
import {
  formatTampilanQtyItem,
  formatQtyAngkaItem,
  mapPoItemKeFaktur,
} from "@/lib/dokumen-item-display";
import { printPurchaseOrder } from "@/lib/faktur-print";
import {
  createPurchaseOrderAction,
  deletePurchaseOrderDraftAction,
  getPurchaseOrdersInitAction,
  receivePurchaseOrderAction,
  updatePurchaseOrderAction,
  updatePurchaseOrderStatusAction,
} from "./actions";

type DraftItem = {
  barang_id: string;
  harga_satuan_id?: string;
  jumlah: number;
  nama_satuan: string;
  faktor_konversi: number;
  harga_satuan: number;
  panjang?: number | null;
  lebar?: number | null;
  jumlah_roll?: number | null;
  butuh_dimensi?: boolean;
};

type ReceiveModalState = {
  po: any;
  metode_pembayaran: "CASH" | "TRANSFER" | "NET30";
  jumlah_dibayar: number;
  tanggal: string;
  qtyByItem: Record<string, number>;
};

const money = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const initial = { purchaseOrders: [], materials: [], vendors: [], shop: null };

export default function PurchaseOrdersPage() {
  const {
    data: rawData,
    isLoading,
    mutate,
  } = useCachedData<any>("purchase-orders-init", getPurchaseOrdersInitAction);
  const data = rawData ?? initial;
  const loading = isLoading && !rawData;
  const reload = async () => {
    await mutate();
  };

  // Paksa revalidasi sekali saat halaman ter-mount. Tanpa ini, jika pengguna
  // kembali ke halaman ini dalam <10 detik (dedupingInterval SWR) — mis. baru
  // saja klik "Buat Draf" dari Beranda — SWR menekan revalidasi on-mount dan
  // menampilkan cache lama tanpa draf yang baru dibuat. mutate() eksplisit
  // melewati jendela dedup, jadi draf baru langsung muncul tanpa refresh
  // manual. Diperbaiki di sisi tujuan supaya tidak ada mutasi SWR yang balapan
  // dengan transisi router.push di Beranda (yang memantulkan pengguna kembali).
  useEffect(() => {
    void mutate();
    // Sengaja hanya saat mount: mutate stabil dari SWR.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [vendorId, setVendorId] = useState("");
  const [items, setItems] = useState<DraftItem[]>([]);
  const [catatan, setCatatan] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingPoId, setEditingPoId] = useState<string | null>(null);
  const [receiveModal, setReceiveModal] = useState<ReceiveModalState | null>(
    null,
  );
  const total = useMemo(
    () => items.reduce((sum, item) => sum + item.jumlah * item.harga_satuan, 0),
    [items],
  );

  function addItem(materialId: string) {
    const material = data.materials.find((m: any) => m.id === materialId);
    const unit =
      material?.unit_prices?.find((u: any) => Number(u.default_status) === 1) ||
      material?.unit_prices?.[0];
    if (!material || !unit) return;
    const isDim = Number(material.butuh_dimensi_status) === 1;
    setItems((prev) => [
      ...prev,
      {
        barang_id: material.id,
        harga_satuan_id: unit.id,
        jumlah: isDim ? 0 : 1,
        nama_satuan: isDim ? "m²" : unit.nama_satuan || "pcs",
        faktor_konversi: Number(unit.faktor_konversi || 1),
        harga_satuan: Number(unit.harga_beli || 0),
        butuh_dimensi: isDim,
        panjang: isDim ? 0 : null,
        lebar: isDim ? 0 : null,
        jumlah_roll: isDim ? 1 : null,
      },
    ]);
  }

  function resetForm() {
    setVendorId("");
    setItems([]);
    setCatatan("");
    setEditingPoId(null);
  }

  function loadPoForEdit(po: any) {
    if (po.status !== "DRAFT") return;
    setEditingPoId(po.id);
    setVendorId(po.vendor_id || "");
    setCatatan(po.catatan || "");
    setItems(
      (po.items || []).map((item: any) => {
        const material = data.materials.find(
          (m: any) => m.id === item.barang_id,
        );
        const isDim = Number(material?.butuh_dimensi_status) === 1;
        return {
          barang_id: item.barang_id,
          harga_satuan_id: item.harga_satuan_id || undefined,
          jumlah: Number(item.jumlah || 0),
          nama_satuan: item.nama_satuan || (isDim ? "m²" : "pcs"),
          faktor_konversi: Number(item.faktor_konversi || 1),
          harga_satuan: Number(item.harga_satuan || 0),
          butuh_dimensi: isDim,
          panjang: item.panjang ?? (isDim ? 0 : null),
          lebar: item.lebar ?? (isDim ? 0 : null),
          jumlah_roll: item.jumlah_roll ?? (isDim ? 1 : null),
        };
      }),
    );
    setNotice(`Mengedit draf ${po.nomor_po}.`);
  }

  async function submit() {
    if (!vendorId) return setNotice("Vendor wajib dipilih.");
    if (items.length === 0) return setNotice("Tambahkan item dulu.");
    setSaving(true);
    try {
      const payload = {
        vendor_id: vendorId,
        status: "DRAFT" as const,
        catatan,
        items: items.map((item) => ({
          ...item,
          panjang: item.panjang || null,
          lebar: item.lebar || null,
          jumlah_roll: item.jumlah_roll || null,
          subtotal: item.jumlah * item.harga_satuan,
        })),
      };
      if (editingPoId) {
        await updatePurchaseOrderAction(editingPoId, payload);
        setNotice("Draf pesanan pembelian diperbarui.");
      } else {
        await createPurchaseOrderAction(payload);
        setNotice("Pesanan pembelian tersimpan.");
      }
      resetForm();
      await reload();
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Gagal menyimpan pesanan pembelian",
      );
    } finally {
      setSaving(false);
    }
  }

  function openReceive(po: any) {
    setReceiveModal({
      po,
      metode_pembayaran: "NET30",
      jumlah_dibayar: 0,
      tanggal: new Date().toISOString().slice(0, 10),
      qtyByItem: {},
    });
  }

  async function confirmReceive() {
    if (!receiveModal) return;
    const lines = (receiveModal.po.items || [])
      .map((item: any) => ({
        purchase_order_item_id: item.id,
        qty: Number(receiveModal.qtyByItem[item.id] || 0),
      }))
      .filter((line: any) => line.qty > 0);
    if (lines.length === 0) {
      setNotice("Isi qty terima minimal satu item.");
      return;
    }
    if (
      !window.confirm(
        `Posting penerimaan pesanan pembelian ${receiveModal.po.nomor_po}?\nIni akan membuat pembelian dan menambah stok.`,
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      await receivePurchaseOrderAction({
        purchase_order_id: receiveModal.po.id,
        metode_pembayaran: receiveModal.metode_pembayaran,
        jumlah_dibayar:
          receiveModal.metode_pembayaran === "NET30"
            ? receiveModal.jumlah_dibayar
            : undefined,
        tanggal: receiveModal.tanggal,
        items: lines,
      });
      setReceiveModal(null);
      setNotice("Penerimaan pesanan pembelian masuk ke pembelian.");
      await reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Gagal menerima PO");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeletePo(po: any) {
    if (
      !window.confirm(
        `Hapus draf ${po.nomor_po}?\nTindakan ini tidak bisa dibatalkan.`,
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      await deletePurchaseOrderDraftAction(po.id);
      if (editingPoId === po.id) resetForm();
      setNotice(`Draf ${po.nomor_po} dihapus.`);
      await reload();
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Gagal menghapus draf",
      );
    } finally {
      setSaving(false);
    }
  }

  async function markSent(po: any) {
    setSaving(true);
    try {
      await updatePurchaseOrderStatusAction(po.id, "SENT");
      await reload();
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Gagal memperbarui status",
      );
    } finally {
      setSaving(false);
    }
  }

  async function printPo(po: any) {
    const vendor = data.vendors.find((v: any) => v.id === po.vendor_id);
    try {
      await printPurchaseOrder({
        nomor_po: po.nomor_po,
        tanggal: po.tanggal || new Date().toISOString(),
        expected_date: po.expected_date,
        vendor_nama:
          vendor?.nama_perusahaan || po.vendor_name || po.vendor_id || "Vendor",
        items: (po.items || []).map((item: any) =>
          mapPoItemKeFaktur({
            ...item,
            barang_nama: item.barang_nama || item.barang_id,
          }),
        ),
        total: Number(po.total_jumlah || 0),
        catatan: po.catatan,
        shop: data.shop,
      });
    } catch (error) {
      console.error("printPo error:", error);
      setNotice("Gagal menyiapkan dokumen cetak.");
    }
  }

  return (
    <div className="space-y-6">
      {/* Kartu judul */}
      <div className="bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl shadow-lg p-6 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <PurchaseOrderFlowIcon size={28} className="text-white" />
            <div>
              <h2 className="text-2xl font-bold uppercase tracking-wide">
                Pesanan Pembelian
              </h2>
              <p className="text-white/90 text-base">
                Draf, kirim, cetak, dan penerimaan parsial.
              </p>
            </div>
          </div>
          {notice ? (
            <div className="rounded-md bg-white/20 px-3 py-2 text-base text-white">
              {notice}
            </div>
          ) : null}
        </div>
      </div>

      <section className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-slate-800 dark:text-slate-100">
            {editingPoId
              ? "Edit Draf Pesanan Pembelian"
              : "Buat Pesanan Pembelian"}
          </h2>
          <div className="space-y-3">
            <select
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-2"
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
              disabled={saving}
            >
              <option value="">Pilih vendor</option>
              {data.vendors.map((v: any) => (
                <option key={v.id} value={v.id}>
                  {v.nama_perusahaan}
                </option>
              ))}
            </select>
            <select
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-2"
              onChange={(e) => {
                addItem(e.target.value);
                e.currentTarget.value = "";
              }}
              disabled={saving}
            >
              <option value="">Tambah barang</option>
              {sembunyikanPlaceholderBarang(data.materials).map((m: any) => (
                <option key={m.id} value={m.id}>
                  {m.nama}
                </option>
              ))}
            </select>
            {items.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-300 dark:border-slate-600 p-3 text-center text-sm text-slate-500 dark:text-slate-400">
                Belum ada item
              </div>
            ) : null}
            {items.map((item, index) => {
              const material = data.materials.find(
                (m: any) => m.id === item.barang_id,
              );
              const isDim = item.butuh_dimensi;

              const updateDim = (
                field: "lebar" | "panjang" | "jumlah_roll",
                val: number,
              ) => {
                setItems((prev) =>
                  prev.map((row, i) => {
                    if (i !== index) return row;
                    const updated = { ...row, [field]: val };
                    const l = Number(updated.lebar) || 0;
                    const p = Number(updated.panjang) || 0;
                    const roll = Number(updated.jumlah_roll) || 1;
                    return {
                      ...updated,
                      jumlah: isDim ? l * p * roll : row.jumlah,
                    };
                  }),
                );
              };

              return (
                <div
                  key={`${item.barang_id}-${index}`}
                  className="rounded-md bg-slate-50 dark:bg-slate-800 p-2 text-base space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-800 dark:text-slate-100 truncate">
                      {material?.nama || item.barang_id}
                    </span>
                    <button
                      className="rounded bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 px-2 py-0.5"
                      onClick={() =>
                        setItems((prev) => prev.filter((_, i) => i !== index))
                      }
                      aria-label="Hapus item"
                    >
                      ×
                    </button>
                  </div>
                  {isDim ? (
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-sm text-slate-500 dark:text-slate-400 mb-1">
                          Lebar roll (m)
                        </label>
                        <input
                          className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 p-1 text-base"
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.lebar ?? ""}
                          onChange={(e) =>
                            updateDim("lebar", Number(e.target.value))
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-slate-500 dark:text-slate-400 mb-1">
                          Panjang roll (m)
                        </label>
                        <input
                          className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 p-1 text-base"
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.panjang ?? ""}
                          onChange={(e) =>
                            updateDim("panjang", Number(e.target.value))
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-slate-500 dark:text-slate-400 mb-1">
                          Jml Roll
                        </label>
                        <input
                          className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 p-1 text-base"
                          type="number"
                          min="1"
                          step="1"
                          value={item.jumlah_roll ?? 1}
                          onChange={(e) =>
                            updateDim("jumlah_roll", Number(e.target.value))
                          }
                        />
                      </div>
                      <div className="col-span-3 text-sm text-slate-400 dark:text-slate-500">
                        = {Number(item.jumlah).toFixed(2)} m²
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-[70px_100px] gap-2">
                      <input
                        className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 p-1 text-base"
                        type="number"
                        min="0"
                        value={item.jumlah}
                        onChange={(e) =>
                          setItems((prev) =>
                            prev.map((row, i) =>
                              i === index
                                ? { ...row, jumlah: Number(e.target.value) }
                                : row,
                            ),
                          )
                        }
                      />
                      <input
                        className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 p-1 text-base"
                        type="number"
                        min="0"
                        value={item.harga_satuan}
                        onChange={(e) =>
                          setItems((prev) =>
                            prev.map((row, i) =>
                              i === index
                                ? {
                                    ...row,
                                    harga_satuan: Number(e.target.value),
                                  }
                                : row,
                            ),
                          )
                        }
                      />
                    </div>
                  )}
                  {isDim ? (
                    <input
                      className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 p-1 text-base"
                      type="number"
                      min="0"
                      placeholder="Harga per m²"
                      value={item.harga_satuan}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((row, i) =>
                            i === index
                              ? { ...row, harga_satuan: Number(e.target.value) }
                              : row,
                          ),
                        )
                      }
                    />
                  ) : null}
                </div>
              );
            })}
            <textarea
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 p-2"
              placeholder="Catatan"
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
            />
            <div className="flex items-center justify-between font-semibold text-slate-800 dark:text-slate-100">
              <span>Total</span>
              <span>{money(total)}</span>
            </div>
            <div className="flex gap-2">
              {editingPoId ? (
                <button
                  type="button"
                  disabled={saving}
                  className="w-full rounded-md border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  onClick={resetForm}
                >
                  Batal Edit
                </button>
              ) : null}
              <button
                disabled={saving}
                className="w-full rounded-md bg-indigo-600 px-4 py-2 font-medium text-white disabled:opacity-60 hover:bg-indigo-700 transition-colors"
                onClick={submit}
              >
                {editingPoId ? "Simpan Perubahan" : "Simpan Pesanan Pembelian"}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {loading ? (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 text-sm text-slate-500 dark:text-slate-400 shadow-sm">
              Memuat...
            </div>
          ) : data.purchaseOrders.length === 0 ? (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 text-sm text-slate-500 dark:text-slate-400 shadow-sm">
              Belum ada pesanan pembelian.
            </div>
          ) : (
            data.purchaseOrders.map((po: any) => {
              const allReceived = (po.items || []).every(
                (it: any) =>
                  Number(it.qty_received || 0) >=
                  Number(it.jumlah || 0) - 0.000001,
              );
              return (
                <div
                  key={po.id}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm"
                >
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-semibold text-slate-800 dark:text-slate-100">
                        {po.nomor_po}
                      </div>
                      <div className="text-sm text-slate-500 dark:text-slate-400">
                        {po.vendor_name || "Vendor"} - {po.status}
                      </div>
                    </div>
                    <MenuAksi
                      ambangInline={0}
                      labelMenu={`Aksi untuk ${po.nomor_po}`}
                      aksi={[
                        {
                          label: "Edit Draf",
                          judul: "Edit draf pesanan pembelian",
                          tampil: po.status === "DRAFT",
                          disabled: saving,
                          onClick: () => loadPoForEdit(po),
                          ikon: (
                            <svg
                              className="w-5 h-5 text-indigo-600 dark:text-indigo-300"
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
                          ),
                        },
                        {
                          label: "Cetak PO",
                          judul: "Cetak pesanan pembelian (A4)",
                          onClick: () => printPo(po),
                          ikon: (
                            <svg
                              className="w-5 h-5 text-blue-600 dark:text-blue-300"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                              />
                            </svg>
                          ),
                        },
                        {
                          label: "Tandai Terkirim",
                          judul: "Tandai PO sudah dikirim ke vendor",
                          tampil:
                            po.status !== "CANCELLED" &&
                            po.status !== "RECEIVED",
                          disabled:
                            saving ||
                            po.status === "SENT" ||
                            po.status === "PARTIAL_RECEIVED",
                          onClick: () => markSent(po),
                          ikon: (
                            <svg
                              className="w-5 h-5 text-violet-600 dark:text-violet-300"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                              />
                            </svg>
                          ),
                        },
                        {
                          label: "Terima Barang",
                          judul: "Posting penerimaan barang dari PO",
                          tampil: po.status !== "CANCELLED" && !allReceived,
                          disabled: saving,
                          onClick: () => openReceive(po),
                          ikon: (
                            <svg
                              className="w-5 h-5 text-emerald-600 dark:text-emerald-300"
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
                          ),
                        },
                        {
                          label: "Hapus Draf",
                          judul: "Hapus draf pesanan pembelian",
                          varian: "bahaya",
                          tampil: po.status === "DRAFT",
                          disabled: saving,
                          onClick: () => confirmDeletePo(po),
                          ikon: (
                            <TrashIcon size={20} className="text-red-500" />
                          ),
                        },
                      ]}
                    />
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 dark:bg-slate-800 text-left text-slate-600 dark:text-slate-300">
                        <tr>
                          <th className="p-2">Barang</th>
                          <th className="p-2">Dipesan</th>
                          <th className="p-2 text-right">Diterima</th>
                          <th className="p-2 text-right">Sisa</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(po.items || []).map((item: any) => (
                          <tr
                            key={item.id}
                            className="border-t border-slate-100 dark:border-slate-800 text-slate-800 dark:text-slate-200"
                          >
                            <td className="p-2">
                              {item.barang_id ? (
                                <Link
                                  className="text-cyan-600 dark:text-cyan-400 underline-offset-2 hover:underline"
                                  href={`/barang?id=${item.barang_id}`}
                                >
                                  {item.barang_nama || item.barang_id}
                                </Link>
                              ) : (
                                item.barang_nama || "-"
                              )}
                            </td>
                            <td className="p-2 text-sm">
                              {formatTampilanQtyItem(item)}
                            </td>
                            <td className="p-2 text-right">
                              {formatQtyAngkaItem(
                                item,
                                Number(item.qty_received || 0),
                              )}
                            </td>
                            <td className="p-2 text-right">
                              {formatQtyAngkaItem(
                                item,
                                Math.max(
                                  0,
                                  Number(item.jumlah || 0) -
                                    Number(item.qty_received || 0),
                                ),
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {receiveModal ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-2xl rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                Penerimaan Pesanan {receiveModal.po.nomor_po}
              </h2>
              <button
                className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                onClick={() => setReceiveModal(null)}
              >
                x
              </button>
            </div>
            <div className="grid gap-3 text-sm md:grid-cols-2">
              <label className="block">
                <span className="text-xs text-slate-600 dark:text-slate-400">
                  Tanggal
                </span>
                <input
                  type="date"
                  className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-2"
                  value={receiveModal.tanggal}
                  onChange={(e) =>
                    setReceiveModal((prev) =>
                      prev ? { ...prev, tanggal: e.target.value } : prev,
                    )
                  }
                />
              </label>
              <label className="block">
                <span className="text-xs text-slate-600 dark:text-slate-400">
                  Metode bayar vendor
                </span>
                <select
                  className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-2"
                  value={receiveModal.metode_pembayaran}
                  onChange={(e) =>
                    setReceiveModal((prev) =>
                      prev
                        ? { ...prev, metode_pembayaran: e.target.value as any }
                        : prev,
                    )
                  }
                >
                  <option value="CASH">CASH (lunas)</option>
                  <option value="TRANSFER">TRANSFER (lunas)</option>
                  <option value="NET30">NET30 (jadi hutang)</option>
                </select>
              </label>
              {receiveModal.metode_pembayaran === "NET30" ? (
                <label className="block md:col-span-2">
                  <span className="text-xs text-slate-600 dark:text-slate-400">
                    DP yang dibayar (opsional)
                  </span>
                  <input
                    type="number"
                    min={0}
                    className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-2"
                    value={receiveModal.jumlah_dibayar || ""}
                    onChange={(e) =>
                      setReceiveModal((prev) =>
                        prev
                          ? {
                              ...prev,
                              jumlah_dibayar: Number(e.target.value || 0),
                            }
                          : prev,
                      )
                    }
                  />
                </label>
              ) : null}
            </div>
            <div className="mt-4 max-h-72 overflow-auto rounded-md border border-slate-200 dark:border-slate-700">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800 text-left text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="p-2">Barang</th>
                    <th className="p-2 text-right">Dipesan</th>
                    <th className="p-2 text-right">Sudah</th>
                    <th className="p-2 text-right">Terima</th>
                  </tr>
                </thead>
                <tbody>
                  {(receiveModal.po.items || []).map((item: any) => {
                    const remaining = Math.max(
                      0,
                      Number(item.jumlah || 0) - Number(item.qty_received || 0),
                    );
                    return (
                      <tr
                        key={item.id}
                        className="border-t border-slate-100 dark:border-slate-800 text-slate-800 dark:text-slate-200"
                      >
                        <td className="p-2">
                          {item.barang_nama || item.barang_id}
                        </td>
                        <td className="p-2 text-sm">
                          {formatTampilanQtyItem(item)}
                        </td>
                        <td className="p-2 text-right">
                          {formatQtyAngkaItem(
                            item,
                            Number(item.qty_received || 0),
                          )}
                        </td>
                        <td className="p-2 text-right">
                          <input
                            className="w-24 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 p-1 text-right"
                            type="number"
                            min={0}
                            max={remaining}
                            value={receiveModal.qtyByItem[item.id] || ""}
                            onChange={(e) =>
                              setReceiveModal((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      qtyByItem: {
                                        ...prev.qtyByItem,
                                        [item.id]: Number(e.target.value),
                                      },
                                    }
                                  : prev,
                              )
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                onClick={() => setReceiveModal(null)}
              >
                Batal
              </button>
              <button
                disabled={saving}
                className="rounded bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-60 hover:bg-emerald-700 transition-colors"
                onClick={confirmReceive}
              >
                Posting Penerimaan
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
