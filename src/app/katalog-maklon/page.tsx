"use client";

import { useMemo, useState } from "react";
import { useCachedData } from "@/lib/use-cached-data";
import { PrinterIcon } from "@/components/icons/PageIcons";
import {
  CheckIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from "@/components/icons/ContentIcons";
import ToastNotifikasi, {
  NotificationToastProps,
} from "@/components/ToastNotifikasi";
import DialogKonfirmasi from "@/components/DialogKonfirmasi";
import ModalKatalogMaklon from "./ModalKatalogMaklon";
import type { Vendor } from "@/lib/services/vendors-service";
import type { KatalogMaklon } from "@/lib/services/katalog-maklon-service";
import { getVendorsAction } from "@/app/vendors/actions";
import {
  deleteKatalogMaklonAction,
  listKatalogMaklonAction,
} from "./actions";

const money = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

export default function KatalogMaklonPage() {
  // onlyAktif=false supaya admin tetap bisa melihat & mengaktifkan kembali item non-aktif.
  const {
    data: itemsData,
    isLoading,
    mutate,
  } = useCachedData<KatalogMaklon[]>("katalog-maklon", () =>
    listKatalogMaklonAction(false)
  );
  const items = useMemo(() => itemsData ?? [], [itemsData]);

  const { data: vendorsData } = useCachedData<Vendor[]>("vendors", async () => {
    const result = await getVendorsAction();
    return (result as Vendor[]) || [];
  });
  const vendors = useMemo(() => vendorsData ?? [], [vendorsData]);
  const vendorMap = useMemo(() => {
    const map = new Map<string, Vendor>();
    for (const v of vendors) map.set(v.id, v);
    return map;
  }, [vendors]);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterKategori, setFilterKategori] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<KatalogMaklon | null>(null);
  const [notice, setNotice] = useState<NotificationToastProps | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const showMsg = (type: "success" | "error", message: string) => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 3000);
  };

  const reload = async () => {
    await mutate();
  };

  const kategoriOptions = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      if (item.kategori) set.add(item.kategori);
    }
    return Array.from(set).sort();
  }, [items]);

  const filteredItems = useMemo(() => {
    let filtered = [...items];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((item) =>
        item.nama_produk.toLowerCase().includes(query)
      );
    }

    if (filterKategori !== "all") {
      filtered = filtered.filter((item) => item.kategori === filterKategori);
    }

    return filtered;
  }, [items, searchQuery, filterKategori]);

  const totalItems = items.length;
  const activeItems = items.filter((item) => item.is_aktif === 1).length;
  const inactiveItems = totalItems - activeItems;

  const handleAdd = () => {
    setEditingItem(null);
    setShowModal(true);
  };

  const handleEdit = (item: KatalogMaklon) => {
    setEditingItem(item);
    setShowModal(true);
  };

  const handleDelete = (item: KatalogMaklon) => {
    setConfirmDialog({
      show: true,
      title: "Hapus Katalog Extra",
      message: `Yakin ingin menghapus "${item.nama_produk}" dari katalog extra?\n\nData akan dihapus permanen dari daftar.`,
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          await deleteKatalogMaklonAction(item.id);
          showMsg("success", "Katalog extra berhasil dihapus");
          await reload();
        } catch (error: any) {
          showMsg("error", error?.message || "Gagal menghapus katalog extra");
        }
      },
    });
  };

  const loading = isLoading && items.length === 0;

  return (
    <>
      <div className="space-y-6">
        {/* Kartu Judul */}
        <div className="bg-gradient-to-br from-violet-600 to-purple-700 rounded-2xl shadow-lg p-6 text-white">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/20 rounded-xl">
              <PrinterIcon size={32} className="text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold mb-1 uppercase tracking-wide">
                Katalog Extra
              </h2>
              <p className="text-white/90 text-sm">
                Daftar produk extra siap pakai untuk transaksi cepat di POS
              </p>
            </div>
          </div>
        </div>

        {/* Kartu Ringkasan */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gradient-to-br from-violet-600 to-purple-700 rounded-xl shadow-lg p-6 text-white">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-white/20 rounded-lg">
                  <PrinterIcon size={20} className="text-white" />
                </div>
                <h3 className="text-base font-semibold uppercase tracking-wide">
                  Total Item
                </h3>
              </div>
            </div>
            <p className="text-3xl font-bold">{totalItems}</p>
            <p className="text-sm mt-2 text-violet-100">
              Terdaftar di katalog
            </p>
          </div>

          <div className="bg-gradient-to-br from-fuchsia-600 to-violet-600 rounded-xl shadow-lg p-6 text-white">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-white/20 rounded-lg">
                  <CheckIcon size={20} className="text-white" />
                </div>
                <h3 className="text-base font-semibold uppercase tracking-wide">
                  Aktif
                </h3>
              </div>
            </div>
            <p className="text-3xl font-bold">{activeItems}</p>
            <p className="text-sm mt-2 text-fuchsia-100">Tampil di POS</p>
          </div>

          <div className="bg-gradient-to-br from-gray-500 to-gray-600 rounded-xl shadow-lg p-6 text-white">
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
                      d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                    />
                  </svg>
                </div>
                <h3 className="text-base font-semibold uppercase tracking-wide">
                  Non-Aktif
                </h3>
              </div>
            </div>
            <p className="text-3xl font-bold">{inactiveItems}</p>
            <p className="text-sm mt-2 text-gray-100">Disembunyikan dari POS</p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-800 p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <button
              onClick={handleAdd}
              className="px-4 py-2 bg-gradient-to-r from-violet-600 to-purple-700 text-white rounded-lg hover:from-violet-700 hover:to-purple-800 transition-all font-semibold shadow-md flex items-center gap-2"
            >
              <PlusIcon size={20} />
              Tambah Katalog
            </button>

            <div className="flex items-center gap-3">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari nama produk..."
                  className="px-4 py-2 pl-10 border border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent w-64 dark:bg-slate-800 dark:text-slate-100"
                />
                <SearchIcon
                  size={18}
                  className="text-gray-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2"
                />
              </div>

              <select
                value={filterKategori}
                onChange={(e) => setFilterKategori(e.target.value)}
                className="px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white dark:bg-slate-900 font-semibold text-gray-700 dark:text-slate-300"
              >
                <option value="all">Semua Kategori</option>
                {kategoriOptions.map((kategori) => (
                  <option key={kategori} value={kategori}>
                    {kategori}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Tabel Katalog */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-800 overflow-hidden">
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-violet-600 to-purple-700 text-white sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-bold uppercase tracking-wider">
                    Nama Produk
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-bold uppercase tracking-wider">
                    Satuan
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-bold uppercase tracking-wider">
                    Harga Jual
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-bold uppercase tracking-wider">
                    Biaya Subkontrak
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-bold uppercase tracking-wider">
                    Vendor Bawaan
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-bold uppercase tracking-wider">
                    Metode
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-bold uppercase tracking-wider">
                    Kategori
                  </th>
                  <th className="px-4 py-3 text-center text-sm font-bold uppercase tracking-wider">
                    Aktif
                  </th>
                  <th className="px-4 py-3 text-center text-sm font-bold uppercase tracking-wider">
                    Urutan
                  </th>
                  <th className="px-4 py-3 text-center text-sm font-bold uppercase tracking-wider">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-slate-800">
                {loading ? (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-4 py-12 text-center text-gray-500 dark:text-slate-400"
                    >
                      Memuat...
                    </td>
                  </tr>
                ) : filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center">
                      <div className="flex flex-col items-center justify-center text-gray-400 dark:text-slate-500">
                        <PrinterIcon size={48} className="mb-3 opacity-50" />
                        <p className="text-lg font-semibold text-gray-600 dark:text-slate-300">
                          {searchQuery || filterKategori !== "all"
                            ? "Tidak ada data yang sesuai"
                            : "Belum ada katalog extra"}
                        </p>
                        <p className="text-sm mt-1">
                          {searchQuery || filterKategori !== "all"
                            ? "Coba ubah pencarian atau filter"
                            : "Klik 'Tambah Katalog' untuk memulai"}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item, idx) => {
                    const vendor = item.vendor_subkontrak_id_default
                      ? vendorMap.get(item.vendor_subkontrak_id_default)
                      : undefined;
                    return (
                      <tr
                        key={item.id}
                        className={`hover:bg-violet-50 dark:hover:bg-slate-800/60 transition-all cursor-default ${
                          idx % 2 === 0
                            ? "bg-white dark:bg-slate-900"
                            : "bg-gray-50 dark:bg-slate-800"
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="font-semibold text-gray-800 dark:text-slate-100">
                            {item.nama_produk}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">
                          {item.nama_satuan}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-slate-300">
                          {money(item.harga_jual_default)}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-slate-300">
                          {money(item.biaya_subkontrak_default)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">
                          {vendor?.nama_perusahaan || (
                            <span className="text-gray-400 dark:text-slate-500">
                              —
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">
                          <span className="inline-block px-2 py-1 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded font-semibold text-xs">
                            {item.metode_bayar_vendor_default}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">
                          {item.kategori || (
                            <span className="text-gray-400 dark:text-slate-500">
                              —
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {item.is_aktif === 1 ? (
                            <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-xs font-semibold">
                              <CheckIcon size={14} />
                              Aktif
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-3 py-1 bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 rounded-full text-xs font-semibold">
                              Non-Aktif
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-gray-700 dark:text-slate-300">
                          {item.urutan}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleEdit(item)}
                              className="p-2 text-indigo-600 dark:text-indigo-300 hover:bg-slate-100 dark:hover:bg-white/10 dark:bg-slate-800 rounded-lg transition-colors"
                              title="Edit"
                            >
                              <PencilIcon size={18} />
                            </button>
                            <button
                              onClick={() => handleDelete(item)}
                              className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors"
                              title="Hapus"
                            >
                              <TrashIcon size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showModal && (
        <ModalKatalogMaklon
          item={editingItem}
          vendors={vendors}
          onClose={() => setShowModal(false)}
          onSuccess={reload}
          showNotification={showMsg}
        />
      )}

      {notice && (
        <ToastNotifikasi type={notice.type} message={notice.message} />
      )}

      {confirmDialog?.show && (
        <DialogKonfirmasi
          show={confirmDialog.show}
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmText="Ya, Hapus"
          cancelText="Batal"
          type="danger"
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </>
  );
}
