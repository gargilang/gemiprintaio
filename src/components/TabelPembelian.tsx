"use client";

import { useState, useMemo, memo } from "react";
import { ClockIcon, CheckIcon } from "./icons/ContentIcons";
import MenuAksi from "./MenuAksi";

interface Purchase {
  id: string;
  tanggal: string;
  nomor_pembelian?: string;
  nomor_faktur: string;
  id_vendor: string | null;
  vendor_name: string | null;
  vendor_alamat?: string | null;
  vendor_telepon?: string | null;
  vendor_kontak_person?: string | null;
  metode_pembayaran?: string;
  status_pembayaran?: string;
  status_transaksi?: string;
  catatan: string | null;
  diterima_oleh?: string | null;
  created_by_name?: string | null;
  total_harga: number;
  jumlah_dibayar?: number;
  dibuat_pada?: string;
  /** Tipe pembelian (BARANG default, MAKLON untuk pekerjaan subkontrak). */
  tipe_pembelian?: "BARANG" | "MAKLON";
  /** Sale ID that triggered this maklon PO (for back-link to invoice). */
  penjualan_id_sumber?: string | null;
  items: {
    id: string;
    id_barang: string;
    nama_barang: string;
    id_satuan: string;
    nama_satuan: string;
    faktor_konversi: number;
    jumlah: number;
    harga_beli: number;
    panjang?: number | null;
    lebar?: number | null;
    jumlah_roll?: number | null;
  }[];
}

interface PurchaseTableProps {
  purchases: Purchase[];
  loading: boolean;
  onEdit: (purchase: Purchase) => void;
  onDelete: (purchase: Purchase) => void;
  onRevert?: (purchase: Purchase) => void;
  onRetur?: (purchase: Purchase) => void;
  onError?: (msg: string) => void;
}

const PurchaseRow = memo(
  ({
    purchase,
    index,
    onEdit,
    onDelete,
    onRevert,
    onRetur,
    onError,
  }: {
    purchase: Purchase;
    index: number;
    onEdit: (purchase: Purchase) => void;
    onDelete: (purchase: Purchase) => void;
    onRevert?: (purchase: Purchase) => void;
    onRetur?: (purchase: Purchase) => void;
    onError?: (msg: string) => void;
  }) => {
    const [showDetails, setShowDetails] = useState(false);
    const [printing, setPrinting] = useState(false);

    const handlePreview = async (e?: React.MouseEvent) => {
      e?.stopPropagation();
      setPrinting(true);
      try {
        const { generateFakturPembelianHTML, formatUkuranPembelian } = await import(
          "@/lib/faktur-pembelian-print"
        );
        let shop:
          | { nama_toko?: string | null; slogan?: string | null }
          | undefined;
        try {
          const { getShopSettingsAction } = await import(
            "@/app/pengaturan/actions"
          );
          const settings = await getShopSettingsAction();
          shop = { nama_toko: settings.nama_toko, slogan: settings.slogan };
        } catch {
          // fallback to defaults
        }
        const html = generateFakturPembelianHTML({
          nomor_pembelian: purchase.nomor_pembelian || purchase.nomor_faktur,
          nomor_faktur_vendor: purchase.nomor_faktur,
          tanggal: purchase.tanggal,
          shop,
          vendor_nama: purchase.vendor_name || undefined,
          vendor_alamat: purchase.vendor_alamat || undefined,
          vendor_telepon: purchase.vendor_telepon || undefined,
          vendor_kontak: purchase.vendor_kontak_person || undefined,
          dibuat_oleh: purchase.created_by_name || undefined,
          diterima_oleh: purchase.diterima_oleh || undefined,
          catatan: purchase.catatan || undefined,
          items: purchase.items.map((item) => ({
            nama: item.nama_barang,
            ukuran: formatUkuranPembelian(item.panjang, item.lebar, item.jumlah_roll),
            qty: item.jumlah,
            satuan: item.nama_satuan,
            harga: item.harga_beli,
            jumlah: item.jumlah * item.harga_beli,
          })),
          total: purchase.total_harga,
          jumlah_dibayar: purchase.jumlah_dibayar ?? purchase.total_harga,
          status_pembayaran: purchase.status_pembayaran || "LUNAS",
        });
        window.dispatchEvent(
          new CustomEvent("gemi:preview-faktur", {
            detail: {
              html,
              title: `Bukti Pembelian ${purchase.nomor_pembelian || purchase.nomor_faktur}`,
            },
          })
        );
      } catch (e) {
        console.error("previewFakturPembelian error:", e);
        onError?.("Gagal menyiapkan preview.");
      } finally {
        setPrinting(false);
      }
    };

    const handlePrint = async (e?: React.MouseEvent) => {
      e?.stopPropagation();
      setPrinting(true);
      try {
        const { printFakturPembelian, formatUkuranPembelian } = await import(
          "@/lib/faktur-pembelian-print"
        );
        let shop:
          | { nama_toko?: string | null; slogan?: string | null }
          | undefined;
        try {
          const { getShopSettingsAction } = await import(
            "@/app/pengaturan/actions"
          );
          const settings = await getShopSettingsAction();
          shop = {
            nama_toko: settings.nama_toko,
            slogan: settings.slogan,
          };
        } catch (settingsError) {
          console.warn("Data usaha tidak bisa dimuat untuk print pembelian:", settingsError);
        }
        await printFakturPembelian({
          nomor_pembelian:
            purchase.nomor_pembelian || purchase.nomor_faktur,
          nomor_faktur_vendor: purchase.nomor_faktur,
          tanggal: purchase.tanggal,
          shop,
          vendor_nama: purchase.vendor_name || undefined,
          vendor_alamat: purchase.vendor_alamat || undefined,
          vendor_telepon: purchase.vendor_telepon || undefined,
          vendor_kontak: purchase.vendor_kontak_person || undefined,
          dibuat_oleh: purchase.created_by_name || undefined,
          diterima_oleh: purchase.diterima_oleh || undefined,
          catatan: purchase.catatan || undefined,
          items: purchase.items.map((item) => ({
            nama: item.nama_barang,
            ukuran: formatUkuranPembelian(item.panjang, item.lebar, item.jumlah_roll),
            qty: item.jumlah,
            satuan: item.nama_satuan,
            harga: item.harga_beli,
            jumlah: item.jumlah * item.harga_beli,
          })),
          total: purchase.total_harga,
          jumlah_dibayar: purchase.jumlah_dibayar ?? purchase.total_harga,
          status_pembayaran: purchase.status_pembayaran || "LUNAS",
        });
      } catch (e) {
        console.error("printFakturPembelian error:", e);
        onError?.("Gagal menyiapkan dokumen untuk dicetak.");
      } finally {
        setPrinting(false);
      }
    };
    // Parse tanggal sebagai tanggal lokal (format YYYY-MM-DD dari database)
    // Don't use new Date() directly as it treats YYYY-MM-DD as UTC midnight
    const [year, month, day] = purchase.tanggal.split("-").map(Number);
    const tanggalFormatted = new Date(year, month - 1, day).toLocaleDateString(
      "id-ID",
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }
    );

    const isVoid = purchase.status_transaksi === "VOIDED";

    return (
      <>
        <tr
          className={`border-b border-gray-200 dark:border-slate-800 hover:bg-indigo-50 transition-all cursor-pointer ${
            isVoid
              ? "bg-red-50/40 dark:bg-red-900/10 opacity-60"
              : index % 2 === 0
                ? "bg-white dark:bg-slate-900"
                : "bg-gray-50 dark:bg-slate-800"
          }`}
          onClick={() => setShowDetails(!showDetails)}
        >
          <td className="px-4 py-3 text-base text-gray-700 dark:text-slate-300">
            {tanggalFormatted}
          </td>
          <td className="px-4 py-3">
            <div className="font-semibold text-gray-800 dark:text-slate-100 flex items-center gap-2 flex-wrap">
              <span className={isVoid ? "line-through text-gray-500 dark:text-slate-400" : ""}>
                {purchase.nomor_faktur}
              </span>
              {purchase.tipe_pembelian === "MAKLON" && (
                <span
                  className="inline-block text-[9px] px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-[#0a1b3d] dark:text-slate-100 font-bold rounded uppercase tracking-wide"
                  title="Pembelian otomatis dari pekerjaan maklon"
                >
                  Maklon
                </span>
              )}
              {purchase.status_transaksi === "VOIDED" && (
                <span className="inline-block text-[9px] px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 font-bold rounded uppercase tracking-wide">
                  Void
                </span>
              )}
            </div>
            {purchase.catatan && (
              <div className="text-base text-gray-500 dark:text-slate-400 mt-1 line-clamp-1">
                {purchase.catatan}
              </div>
            )}
          </td>
          <td className="px-4 py-3 text-base text-gray-700 dark:text-slate-300">
            {purchase.vendor_name || (
              <span className="text-gray-400 italic">Tanpa Vendor</span>
            )}
          </td>
          <td className="px-4 py-3 text-center">
            <span className="inline-block px-2 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded text-base font-semibold">
              {purchase.items.length} item
            </span>
          </td>
          <td className="px-4 py-3 text-center">
            {purchase.status_pembayaran === "LUNAS" ? (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 rounded text-base font-semibold">
                <CheckIcon size={14} />
                LUNAS
              </span>
            ) : purchase.status_pembayaran === "HUTANG" ? (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded text-base font-semibold">
                <ClockIcon size={14} className="text-[#2266ff]" />
                TAGIHAN
              </span>
            ) : (
              <span className="inline-block px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-base font-semibold">
                {purchase.metode_pembayaran || "CASH"}
              </span>
            )}
          </td>
          <td className="px-4 py-3 text-right font-semibold text-gray-800 dark:text-slate-100">
            Rp {purchase.total_harga.toLocaleString("id-ID")}
          </td>
          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
            <MenuAksi
              labelMenu={`Aksi untuk ${purchase.nomor_faktur}`}
              aksi={[
                {
                  label: "Pratinjau Faktur",
                  judul: "Pratinjau faktur pembelian (jendela mengambang)",
                  disabled: printing,
                  onClick: handlePreview,
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
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                  ),
                },
                {
                  label: "Cetak Bukti Penerimaan",
                  judul: "Cetak Bukti Penerimaan Barang",
                  disabled: printing,
                  onClick: handlePrint,
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
                        d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                      />
                    </svg>
                  ),
                },
                {
                  label: "Edit",
                  judul: "Edit",
                  tampil:
                    purchase.status_transaksi !== "VOIDED" &&
                    (purchase.status_pembayaran !== "LUNAS" ||
                      purchase.metode_pembayaran === "CASH"),
                  onClick: () => onEdit(purchase),
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
                  label: "Kembalikan ke TAGIHAN",
                  judul: "Kembalikan ke Status TAGIHAN",
                  tampil:
                    purchase.status_transaksi !== "VOIDED" &&
                    purchase.status_pembayaran === "LUNAS" &&
                    purchase.metode_pembayaran !== "CASH" &&
                    !!onRevert,
                  onClick: () => onRevert?.(purchase),
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
                        d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                      />
                    </svg>
                  ),
                },
                {
                  label: "Retur ke Vendor",
                  judul: "Retur ke vendor",
                  tampil: purchase.status_transaksi !== "VOIDED" && !!onRetur,
                  onClick: () => onRetur?.(purchase),
                  ikon: (
                    <svg
                      className="w-5 h-5 text-amber-600 dark:text-amber-300"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 10h10a8 8 0 018 8v2M3 10l6-6m-6 6l6 6"
                      />
                    </svg>
                  ),
                },
                {
                  label: "Batalkan",
                  judul: "Batalkan",
                  varian: "bahaya",
                  disabled: purchase.status_transaksi === "VOIDED",
                  onClick: () => onDelete(purchase),
                  ikon: (
                    <svg
                      className="w-5 h-5 text-red-600"
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
                  ),
                },
              ]}
            />
          </td>
        </tr>
        {showDetails && (
          <tr className="bg-gradient-to-r from-indigo-50/50 to-purple-50/50">
            <td colSpan={7} className="px-4 py-3">
              <div className="text-base">
                <div className="font-semibold text-gray-700 dark:text-slate-300 mb-2">
                  Detail Item:
                </div>
                <div className="space-y-1">
                  {purchase.items.map((item, idx) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between py-1 px-2 bg-white dark:bg-slate-900/60 rounded"
                    >
                      <div className="flex-1">
                        <span className="font-semibold text-gray-800 dark:text-slate-100">
                          {idx + 1}. {item.nama_barang}
                        </span>
                        <span className="text-gray-500 dark:text-slate-400 ml-2">
                          ({item.nama_satuan})
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-gray-700 dark:text-slate-300">
                        <span>
                          Qty:{" "}
                          <span className="font-semibold">{item.jumlah}</span>
                        </span>
                        <span>×</span>
                        <span>
                          Rp{" "}
                          <span className="font-semibold">
                            {(item.harga_beli || 0).toLocaleString("id-ID")}
                          </span>
                        </span>
                        <span>=</span>
                        <span className="font-semibold text-indigo-700 dark:text-indigo-300">
                          Rp{" "}
                          {(
                            item.jumlah * (item.harga_beli || 0)
                          ).toLocaleString("id-ID")}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </td>
          </tr>
        )}
      </>
    );
  }
);

PurchaseRow.displayName = "PurchaseRow";

export default function TabelPembelian({
  purchases,
  loading,
  onEdit,
  onDelete,
  onRevert,
  onRetur,
  onError,
}: PurchaseTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  // Secara bawaan pembelian yang dibatalkan (VOID) disembunyikan dari daftar
  // utama. Data tidak dihapus, hanya disembunyikan dari tampilan.
  const [tampilkanVoid, setTampilkanVoid] = useState(false);
  const [sortBy, setSortBy] = useState<"date" | "total" | "status" | "created">(
    "created"
  );
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Filter dan urutkan
  const filteredPurchases = useMemo(() => {
    let filtered = [...purchases];

    // Filter pencarian
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.nomor_faktur.toLowerCase().includes(query) ||
          (p.vendor_name && p.vendor_name.toLowerCase().includes(query)) ||
          (p.catatan && p.catatan.toLowerCase().includes(query))
      );
    }

    // Sembunyikan pembelian VOID kecuali toggle dinyalakan.
    if (!tampilkanVoid) {
      filtered = filtered.filter((p) => p.status_transaksi !== "VOIDED");
    }

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;
      if (sortBy === "date") {
        comparison =
          new Date(a.tanggal).getTime() - new Date(b.tanggal).getTime();
      } else if (sortBy === "total") {
        comparison = a.total_harga - b.total_harga;
      } else if (sortBy === "status") {
        // Urutkan berdasarkan status: HUTANG > SEBAGIAN > LUNAS
        const statusOrder = { HUTANG: 0, SEBAGIAN: 1, LUNAS: 2 };
        const aStatus = a.status_pembayaran || "LUNAS";
        const bStatus = b.status_pembayaran || "LUNAS";
        comparison =
          (statusOrder[aStatus as keyof typeof statusOrder] || 3) -
          (statusOrder[bStatus as keyof typeof statusOrder] || 3);
        // Kalau status sama, urut tanggal (terlama duluan untuk hutang)
        if (comparison === 0) {
          comparison =
            new Date(a.tanggal).getTime() - new Date(b.tanggal).getTime();
        }
      } else if (sortBy === "created") {
        // Urut berdasarkan tanggal pembuatan (dibuat_pada)
        const aTime = a.dibuat_pada ? new Date(a.dibuat_pada).getTime() : 0;
        const bTime = b.dibuat_pada ? new Date(b.dibuat_pada).getTime() : 0;
        comparison = aTime - bTime;
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });

    return filtered;
  }, [purchases, searchQuery, sortBy, sortOrder, tampilkanVoid]);

  // Jumlah pembelian VOID (setelah filter pencarian) untuk label toggle.
  const jumlahVoid = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return purchases.filter(
      (p) =>
        p.status_transaksi === "VOIDED" &&
        (!query ||
          p.nomor_faktur.toLowerCase().includes(query) ||
          (p.vendor_name && p.vendor_name.toLowerCase().includes(query)) ||
          (p.catatan && p.catatan.toLowerCase().includes(query)))
    ).length;
  }, [purchases, searchQuery]);

  // Total pembelian SELALU mengecualikan transaksi VOID, baik toggle
  // tampilkan-void menyala atau tidak.
  const totalPembelian = useMemo(() => {
    return filteredPurchases
      .filter((p) => p.status_transaksi !== "VOIDED")
      .reduce((sum, p) => sum + p.total_harga, 0);
  }, [filteredPurchases]);

  const handleSort = (field: "date" | "total" | "status") => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder(field === "status" ? "asc" : "desc");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search and Stats */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 max-w-md">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nomor faktur, vendor, catatan..."
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-base text-gray-500 dark:text-slate-400">Total Pembelian</div>
            <div className="text-lg font-bold text-indigo-700 dark:text-indigo-300">
              Rp {totalPembelian.toLocaleString("id-ID")}
            </div>
          </div>
          <div className="text-right">
            <div className="text-base text-gray-500 dark:text-slate-400">Transaksi</div>
            <div className="text-lg font-bold text-gray-800 dark:text-slate-100">
              {filteredPurchases.length}
            </div>
          </div>
        </div>
      </div>

      {/* Toggle tampilkan pembelian yang dibatalkan (VOID) */}
      {jumlahVoid > 0 && (
        <div className="flex items-center justify-end">
          <label className="inline-flex items-center gap-2 cursor-pointer text-base font-semibold text-gray-600 dark:text-slate-300 select-none">
            <input
              type="checkbox"
              checked={tampilkanVoid}
              onChange={(e) => setTampilkanVoid(e.target.checked)}
              className="rounded border-gray-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
            />
            Tampilkan pembelian dibatalkan ({jumlahVoid})
          </label>
        </div>
      )}

      {/* Table */}
      {filteredPurchases.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-800">
          <div className="text-gray-400 mb-2">
            <svg
              className="w-16 h-16 mx-auto"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
              />
            </svg>
          </div>
          <p className="text-gray-600 dark:text-slate-300 font-semibold">
            {searchQuery
              ? "Tidak ada pembelian yang cocok dengan pencarian"
              : "Belum ada data pembelian"}
          </p>
          <p className="text-gray-500 dark:text-slate-400 text-base mt-1">
            {searchQuery
              ? "Coba kata kunci lain"
              : "Tambahkan pembelian pertama Anda menggunakan form di atas"}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 dark:border-slate-800 rounded-lg max-h-[700px] overflow-y-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white">
              <tr>
                <th
                  className="px-4 py-3 text-left text-base font-semibold cursor-pointer hover:bg-white/10 transition-colors"
                  onClick={() => handleSort("date")}
                >
                  <div className="flex items-center gap-1">
                    Tanggal
                    {sortBy === "date" && (
                      <span className="text-base">
                        {sortOrder === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-base font-semibold">
                  Nomor Faktur
                </th>
                <th className="px-4 py-3 text-left text-base font-semibold">
                  Vendor
                </th>
                <th className="px-4 py-3 text-center text-base font-semibold">
                  Items
                </th>
                <th
                  className="px-4 py-3 text-center text-base font-semibold cursor-pointer hover:bg-white/10 transition-colors"
                  onClick={() => handleSort("status")}
                >
                  <div className="flex items-center justify-center gap-1">
                    Status
                    {sortBy === "status" && (
                      <span className="text-base">
                        {sortOrder === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-right text-base font-semibold cursor-pointer hover:bg-white/10 transition-colors"
                  onClick={() => handleSort("total")}
                >
                  <div className="flex items-center justify-end gap-1">
                    Total Harga
                    {sortBy === "total" && (
                      <span className="text-base">
                        {sortOrder === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </div>
                </th>
                <th className="px-4 py-3 text-center text-base font-semibold">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredPurchases.map((purchase, index) => (
                <PurchaseRow
                  key={purchase.id}
                  purchase={purchase}
                  index={index}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onRevert={onRevert}
                  onRetur={onRetur}
                  onError={onError}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Info Text */}
      {filteredPurchases.length > 0 && (
        <div className="text-base text-gray-500 dark:text-slate-400 text-center">
          Klik baris untuk melihat detail item pembelian
        </div>
      )}
    </div>
  );
}
