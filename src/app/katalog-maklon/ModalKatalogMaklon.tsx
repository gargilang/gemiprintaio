"use client";

import { useMemo, useState } from "react";
import ModalFormShell from "@/components/ModalFormShell";
import { PencilIcon, PlusIcon } from "@/components/icons/ContentIcons";
import type { Vendor } from "@/lib/services/vendors-service";
import type { KatalogMaklon } from "@/lib/services/katalog-maklon-service";
import type { KatalogMaklonInput } from "@/lib/schemas/katalog-maklon";
import { useCachedData } from "@/lib/use-cached-data";
import {
  createKatalogMaklonAction,
  getKategoriBarangAction,
  updateKatalogMaklonAction,
} from "./actions";

interface Props {
  item: KatalogMaklon | null;
  vendors: Vendor[];
  onClose: () => void;
  /** Item baru dikirim null supaya parent melakukan reload penuh. */
  onSuccess: (item: KatalogMaklon | null) => void | Promise<void>;
  showNotification: (type: "success" | "error", message: string) => void;
}

type FormState = KatalogMaklonInput;

function buildInitialForm(item: KatalogMaklon | null): FormState {
  if (!item) {
    return {
      nama_produk: "",
      nama_satuan: "pcs",
      harga_jual_default: 0,
      biaya_subkontrak_default: 0,
      vendor_subkontrak_id_default: null,
      metode_bayar_vendor_default: "CASH",
      kategori: null,
      kategori_id: null,
      populer_status: 0,
      butuh_dimensi_status: 0,
      catatan_internal: null,
      is_aktif: 1,
      urutan: 0,
    };
  }
  return {
    nama_produk: item.nama_produk,
    nama_satuan: item.nama_satuan,
    harga_jual_default: item.harga_jual_default,
    biaya_subkontrak_default: item.biaya_subkontrak_default,
    vendor_subkontrak_id_default: item.vendor_subkontrak_id_default,
    metode_bayar_vendor_default: item.metode_bayar_vendor_default,
    kategori: item.kategori,
    kategori_id: item.kategori_id,
    populer_status: item.populer_status,
    butuh_dimensi_status: item.butuh_dimensi_status,
    catatan_internal: item.catatan_internal,
    is_aktif: item.is_aktif,
    urutan: item.urutan,
  };
}

/**
 * Modal tambah/edit item Katalog Extra. Katalog ini dipakai sebagai daftar
 * produk siap-maklon yang bisa ditambahkan cepat ke keranjang POS.
 */
export default function ModalKatalogMaklon({
  item,
  vendors,
  onClose,
  onSuccess,
  showNotification,
}: Props) {
  const isEdit = Boolean(item);
  const [form, setForm] = useState<FormState>(() => buildInitialForm(item));
  const [saving, setSaving] = useState(false);
  const berdimensi = form.butuh_dimensi_status === 1;

  // Daftar kategori barang untuk dropdown (C6). SWR cache key stabil.
  const { data: kategoriBarang } = useCachedData<
    { id: string; nama: string }[]
  >("kategori-barang", getKategoriBarangAction);
  const kategoriOptions = useMemo(() => kategoriBarang ?? [], [kategoriBarang]);

  // Vendor maklon default hanya masuk akal untuk vendor bertipe subkontraktor.
  const vendorSubkontrak = useMemo(
    () =>
      vendors.filter(
        (v) =>
          v.tipe_vendor === "SUBKONTRAKTOR" || v.tipe_vendor === "KEDUANYA",
      ),
    [vendors],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nama_produk.trim()) {
      showNotification("error", "Nama produk wajib diisi");
      return;
    }

    setSaving(true);
    try {
      const payload: KatalogMaklonInput = {
        ...form,
        nama_produk: form.nama_produk.trim(),
        nama_satuan: berdimensi ? "m²" : form.nama_satuan.trim() || "pcs",
        kategori: form.kategori?.trim() || null,
        catatan_internal: form.catatan_internal?.trim() || null,
        vendor_subkontrak_id_default: form.vendor_subkontrak_id_default || null,
      };

      if (isEdit && item) {
        await updateKatalogMaklonAction(item.id, payload);
        showNotification("success", "Katalog maklon berhasil diperbarui");
        await onSuccess(null);
      } else {
        await createKatalogMaklonAction(payload);
        showNotification("success", "Katalog maklon berhasil ditambahkan");
        await onSuccess(null);
      }
      onClose();
    } catch (error: any) {
      showNotification(
        "error",
        error?.message || "Gagal menyimpan katalog extra",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalFormShell
      open
      onClose={onClose}
      allowDismiss={!saving}
      maxWidthClass="max-w-2xl"
      header={
        <div className="bg-gradient-to-r from-violet-600 to-purple-700 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-white/20 rounded-lg shrink-0">
              {isEdit ? (
                <PencilIcon size={24} className="text-white" />
              ) : (
                <PlusIcon size={24} className="text-white" />
              )}
            </div>
            <h3 className="text-2xl font-bold text-white truncate">
              {isEdit ? "Edit Katalog Extra" : "Tambah Katalog Extra"}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors shrink-0 disabled:opacity-50"
            aria-label="Tutup"
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
      }
      footer={
        <div className="bg-gray-50 dark:bg-slate-800 px-6 py-4 flex items-center justify-end gap-3 border-t border-gray-200 dark:border-slate-800 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-6 py-2 bg-white dark:bg-slate-900 border-2 border-gray-300 dark:border-slate-700 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors font-semibold disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="submit"
            form="katalog-maklon-form"
            disabled={saving}
            className="px-6 py-2 bg-gradient-to-r from-violet-600 to-purple-700 text-white rounded-lg hover:from-violet-700 hover:to-purple-800 transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      }
    >
      <form
        id="katalog-maklon-form"
        onSubmit={handleSubmit}
        className="p-6 space-y-4"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">
              Nama Produk <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.nama_produk}
              onChange={(e) =>
                setForm({ ...form, nama_produk: e.target.value })
              }
              placeholder="Contoh: Cetak Banner Flexi 280gr"
              className="w-full px-4 py-2 border-2 border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 dark:bg-slate-800 dark:text-slate-100"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">
              Satuan
            </label>
            <input
              type="text"
              value={berdimensi ? "m²" : form.nama_satuan}
              onChange={(e) =>
                setForm({ ...form, nama_satuan: e.target.value })
              }
              disabled={berdimensi}
              placeholder="pcs, m², lembar"
              className="w-full px-4 py-2 border-2 border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 dark:bg-slate-800 dark:text-slate-100 disabled:opacity-60 disabled:cursor-not-allowed"
            />
            {berdimensi && (
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                Dikunci ke m² karena harga dihitung per luas.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">
              Kategori
            </label>
            <select
              value={form.kategori_id ?? ""}
              onChange={(e) => {
                const selected = e.target.options[e.target.selectedIndex];
                setForm({
                  ...form,
                  kategori_id: e.target.value || null,
                  // Sinkronkan legacy free-text kategori dengan nama terpilih.
                  kategori: selected ? selected.text : null,
                });
              }}
              className="w-full px-4 py-2 border-2 border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="">— Tanpa kategori —</option>
              {kategoriOptions.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.nama}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">
              {berdimensi ? "Harga Jual per m²" : "Harga Jual"}
            </label>
            <input
              type="number"
              min={0}
              step="1"
              value={form.harga_jual_default}
              onChange={(e) =>
                setForm({
                  ...form,
                  harga_jual_default: Number(e.target.value || 0),
                })
              }
              className="w-full px-4 py-2 border-2 border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 dark:bg-slate-800 dark:text-slate-100"
            />
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
              {berdimensi
                ? "Harga jual ke pelanggan per m² (dikali lebar × panjang × jumlah)."
                : "Harga jual ke pelanggan, per satuan di atas."}
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">
              Biaya Subkontrak
            </label>
            <input
              type="number"
              min={0}
              step="1"
              value={form.biaya_subkontrak_default}
              onChange={(e) =>
                setForm({
                  ...form,
                  biaya_subkontrak_default: Number(e.target.value || 0),
                })
              }
              className="w-full px-4 py-2 border-2 border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 dark:bg-slate-800 dark:text-slate-100"
            />
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
              Biaya yang dibayarkan ke vendor maklon, per satuan.
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">
              Vendor Maklon Bawaan
            </label>
            <select
              value={form.vendor_subkontrak_id_default ?? ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  vendor_subkontrak_id_default: e.target.value || null,
                })
              }
              className="w-full px-4 py-2 border-2 border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="">— Pilih saat transaksi —</option>
              {vendorSubkontrak.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nama_perusahaan}
                </option>
              ))}
            </select>
            {vendorSubkontrak.length === 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                Belum ada vendor bertipe Subkontraktor/Keduanya. Tambahkan di
                menu Vendor terlebih dahulu.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">
              Metode Bayar ke Vendor
            </label>
            <select
              value={form.metode_bayar_vendor_default}
              onChange={(e) =>
                setForm({
                  ...form,
                  metode_bayar_vendor_default: e.target.value as
                    | "CASH"
                    | "NET30"
                    | "TRANSFER",
                })
              }
              className="w-full px-4 py-2 border-2 border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="CASH">CASH (bayar langsung)</option>
              <option value="TRANSFER">
                TRANSFER (bayar langsung via bank)
              </option>
              <option value="NET30">NET30 (jadi hutang)</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">
              Catatan Internal
            </label>
            <textarea
              value={form.catatan_internal ?? ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  catatan_internal: e.target.value || null,
                })
              }
              placeholder="Catatan untuk tim internal (tidak tampil ke pelanggan)"
              rows={2}
              className="w-full px-4 py-2 border-2 border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div className="md:col-span-2">
            <div className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-slate-800 rounded-lg border-2 border-emerald-200 dark:border-slate-700">
              <input
                type="checkbox"
                id="butuh_dimensi_status"
                checked={berdimensi}
                onChange={(e) =>
                  setForm({
                    ...form,
                    butuh_dimensi_status: e.target.checked ? 1 : 0,
                    // Kunci satuan ke m² saat dimensi aktif.
                    nama_satuan: e.target.checked ? "m²" : form.nama_satuan,
                  })
                }
                className="w-5 h-5 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
              />
              <label
                htmlFor="butuh_dimensi_status"
                className="flex-1 text-sm cursor-pointer"
              >
                <span className="font-semibold text-emerald-900 dark:text-emerald-200 block">
                  Butuh dimensi (harga per m²)
                </span>
                <span className="text-xs text-emerald-700 dark:text-emerald-300">
                  Harga dihitung dari lebar × panjang × jumlah, seperti barang
                  cetak di Data Barang. Satuan dikunci ke m².
                </span>
              </label>
            </div>
          </div>

          <div className="md:col-span-2">
            <div className="flex items-center gap-3 p-4 bg-violet-50 dark:bg-slate-800 rounded-lg border-2 border-violet-200 dark:border-slate-700">
              <input
                type="checkbox"
                id="is_aktif"
                checked={form.is_aktif === 1}
                onChange={(e) =>
                  setForm({ ...form, is_aktif: e.target.checked ? 1 : 0 })
                }
                className="w-5 h-5 text-violet-600 border-gray-300 rounded focus:ring-violet-500"
              />
              <label
                htmlFor="is_aktif"
                className="flex-1 text-sm cursor-pointer"
              >
                <span className="font-semibold text-violet-900 dark:text-violet-200 block">
                  Aktif
                </span>
                <span className="text-xs text-violet-700 dark:text-violet-300">
                  Item aktif muncul sebagai pilihan cepat di POS Maklon
                </span>
              </label>
            </div>
          </div>
        </div>
      </form>
    </ModalFormShell>
  );
}
