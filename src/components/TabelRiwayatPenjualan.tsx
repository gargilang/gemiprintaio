"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { TrashIcon } from "./icons/ContentIcons";
import DialogKonfirmasi from "./DialogKonfirmasi";
import MenuAksi from "./MenuAksi";
import { useClickOutside } from "@/hooks/useClickOutside";
import { updateSaleCustomerAction } from "@/app/produksi/spk/actions";
import {
  formatDimensiBarisThermal,
  formatUkuranCetakInput,
  mapPenjualanItemKeFaktur,
  qtySatuanCetakPenjualan,
} from "@/lib/dokumen-item-display";

interface SaleItemRow {
  barang_nama?: string;
  nama_satuan?: string;
  jumlah?: number;
  harga_satuan?: number;
  subtotal?: number;
  hpp_total?: number;
  panjang?: number | null;
  lebar?: number | null;
  deskripsi_pekerjaan?: string | null;
  tipe_item?: string | null;
  biaya_tambahan?: Array<{ label: string; nominal: number }>;
  billed_panjang?: number | null;
  billed_lebar?: number | null;
  jumlah_roll?: number | null;
}

interface Sale {
  id: string;
  nomor_faktur: string;
  pelanggan_nama: string | null;
  pelanggan_nama_snapshot?: string | null;
  pelanggan_kota?: string | null;
  total_jumlah: number;
  jumlah_dibayar?: number;
  metode_pembayaran: string;
  status_pembayaran: string;
  status_transaksi?: string;
  sisa_piutang: number;
  dibuat_pada: string;
  kasir_nama: string | null;
  has_pelunasan?: number; // 1 if has payment records, 0 if not
  items?: SaleItemRow[];
  biaya_tambahan?: Array<{ label: string; nominal: number }>;
}

interface SalesHistoryTableProps {
  sales: Sale[];
  loading: boolean;
  onDelete?: (saleId: string) => Promise<void>;
  onRevert?: (sale: Sale) => void;
  onPayReceivable?: () => void;
}

export default function TabelRiwayatPenjualan({
  sales,
  loading,
  onDelete,
  onRevert,
  onPayReceivable,
}: SalesHistoryTableProps) {
  const [expandedSale, setExpandedSale] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  // Secara bawaan transaksi yang dibatalkan (VOID) disembunyikan supaya
  // daftar utama bersih. Data tidak dihapus, hanya disembunyikan dari tampilan.
  const [tampilkanVoid, setTampilkanVoid] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    show: boolean;
    saleId: string;
    invoiceNumber: string;
  } | null>(null);
  const [fakturPromptSale, setFakturPromptSale] = useState<Sale | null>(null);
  const [fakturPromptMode, setFakturPromptMode] = useState<"preview" | "print">(
    "print",
  );
  const [fakturPromptInput, setFakturPromptInput] = useState({
    nama: "",
    kota: "Bekasi",
  });
  const fakturPromptRef = useRef<HTMLDivElement>(null);

  const closeFakturPrompt = useCallback(() => {
    setFakturPromptSale(null);
  }, []);

  const submitFakturPrompt = useCallback(async () => {
    const sale = fakturPromptSale;
    const nama = fakturPromptInput.nama.trim();
    const kota = fakturPromptInput.kota.trim() || "Bekasi";
    if (!sale || !nama) return;
    // Simpan nama ke transaksi supaya sinkron dengan SPK (operator) — bukan
    // lagi print-only. Nama bebas -> snapshot.
    try {
      await updateSaleCustomerAction(sale.id, {
        pelanggan_nama_snapshot: nama,
      });
    } catch (e) {
      console.error("Gagal menyimpan nama pelanggan:", e);
    }
    setFakturPromptSale(null);
    if (fakturPromptMode === "preview") {
      previewFaktur(sale, nama, kota);
    } else {
      reprintFaktur(sale, nama, kota);
    }
  }, [fakturPromptSale, fakturPromptInput, fakturPromptMode]);

  // Tutup prompt faktur saat klik di luar
  useClickOutside(fakturPromptRef, closeFakturPrompt, !!fakturPromptSale);

  // Pintasan keyboard: Enter konfirmasi, Escape batal
  useEffect(() => {
    if (!fakturPromptSale) return;
    // Jeda kecil supaya Enter yang membuka prompt tidak langsung konfirmasi.
    let isReady = false;
    const readyTimeout = setTimeout(() => {
      isReady = true;
    }, 200);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && isReady) {
        e.preventDefault();
        submitFakturPrompt();
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeFakturPrompt();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      clearTimeout(readyTimeout);
    };
  }, [fakturPromptSale, submitFakturPrompt, closeFakturPrompt]);

  // Cocokkan kata kunci pencarian (faktur / nama pelanggan).
  const cocokPencarian = (sale: Sale) =>
    sale.nomor_faktur.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sale.pelanggan_nama?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sale.pelanggan_nama_snapshot
      ?.toLowerCase()
      .includes(searchTerm.toLowerCase());

  const isVoid = (sale: Sale) => sale.status_transaksi === "VOIDED";

  // Hasil pencarian sebelum filter VOID (untuk menghitung jumlah VOID).
  const sesuaiPencarian = sales.filter(cocokPencarian);
  const jumlahVoid = sesuaiPencarian.filter(isVoid).length;

  // Daftar yang tampil di tabel: sembunyikan VOID kecuali toggle dinyalakan.
  const filteredSales = tampilkanVoid
    ? sesuaiPencarian
    : sesuaiPencarian.filter((sale) => !isVoid(sale));

  const formatRupiah = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      LUNAS:
        "bg-green-100 dark:bg-green-900/30 text-green-700 border-green-200 dark:border-slate-700",
      AKTIF:
        "bg-red-100 dark:bg-red-900/30 text-red-700 border-red-200 dark:border-red-800/50",
      SEBAGIAN:
        "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 border-yellow-200 dark:border-yellow-800/50",
    };

    return (
      <span
        className={`px-2 py-1 rounded-lg text-sm font-semibold border ${
          styles[status as keyof typeof styles] ||
          "bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300"
        }`}
      >
        {status}
      </span>
    );
  };

  const getPaymentMethodIcon = (method: string) => {
    const iconMap: { [key: string]: React.ReactNode } = {
      CASH: (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z"
            clipRule="evenodd"
          />
        </svg>
      ),
      TRANSFER: (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
          <path
            fillRule="evenodd"
            d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z"
            clipRule="evenodd"
          />
        </svg>
      ),
      QRIS: (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M3 4a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm2 2V5h1v1H5zM3 13a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1H4a1 1 0 01-1-1v-3zm2 2v-1h1v1H5zM13 3a1 1 0 00-1 1v3a1 1 0 001 1h3a1 1 0 001-1V4a1 1 0 00-1-1h-3zm1 2v1h1V5h-1z"
            clipRule="evenodd"
          />
          <path d="M11 4a1 1 0 10-2 0v1a1 1 0 002 0V4zM10 7a1 1 0 011 1v1h2a1 1 0 110 2h-3a1 1 0 01-1-1V8a1 1 0 011-1zM16 9a1 1 0 100 2 1 1 0 000-2zM9 13a1 1 0 011-1h1a1 1 0 110 2v2a1 1 0 11-2 0v-3zM7 11a1 1 0 100-2H4a1 1 0 100 2h3zM17 13a1 1 0 01-1 1h-2a1 1 0 110-2h2a1 1 0 011 1zM16 17a1 1 0 100-2h-3a1 1 0 100 2h3z" />
        </svg>
      ),
      DEBIT: (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
          <path
            fillRule="evenodd"
            d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z"
            clipRule="evenodd"
          />
        </svg>
      ),
      DOWN_PAYMENT: (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z"
            clipRule="evenodd"
          />
        </svg>
      ),
      NET30: (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z"
            clipRule="evenodd"
          />
        </svg>
      ),
    };

    return iconMap[method] || iconMap.CASH;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#00afef]"></div>
      </div>
    );
  }

  const reprintThermal = async (sale: Sale) => {
    setPrintingId(sale.id);
    try {
      const { printThermalInvoice } = await import("@/lib/thermal-print");
      let shop:
        | {
            nama_toko?: string | null;
            slogan?: string | null;
            telepon?: string | null;
            email?: string | null;
            website?: string | null;
            catatan_struk?: string | null;
          }
        | undefined;
      try {
        const { getShopSettingsAction } =
          await import("@/app/pengaturan/actions");
        const settings = await getShopSettingsAction();
        shop = {
          nama_toko: settings.nama_toko,
          slogan: settings.slogan,
          telepon: settings.telepon,
          email: settings.email,
          website: settings.website,
          catatan_struk: settings.catatan_struk,
        };
      } catch (settingsError) {
        console.warn(
          "Data usaha tidak bisa dimuat untuk reprint thermal:",
          settingsError,
        );
      }
      const items = (sale.items || []).map((item) => {
        const subtotal = Number(item.subtotal || 0);
        const harga = Number(item.harga_satuan || 0);
        const cetakInput = {
          jumlah: Number(item.jumlah || 0),
          nama_satuan: item.nama_satuan || "",
          panjang: item.panjang,
          lebar: item.lebar,
        };
        const { qty, satuan } = qtySatuanCetakPenjualan(cetakInput);
        return {
          nama:
            item.tipe_item === "MAKLON" && item.deskripsi_pekerjaan
              ? item.deskripsi_pekerjaan
              : item.barang_nama || "-",
          jumlah: qty,
          satuan,
          harga: qty > 0 ? subtotal / qty : harga,
          subtotal,
          dimensi: formatDimensiBarisThermal(cetakInput),
          biaya_tambahan: (item.biaya_tambahan || [])
            .filter((b) => b.label?.trim() && b.nominal > 0)
            .map((b) => ({
              label: b.label.trim(),
              nominal: Number(b.nominal),
            })),
        };
      });
      const total = sale.total_jumlah;
      const bayar =
        sale.jumlah_dibayar ?? sale.total_jumlah - sale.sisa_piutang;
      printThermalInvoice({
        nomor_faktur: sale.nomor_faktur,
        tanggal: sale.dibuat_pada,
        shop,
        pelanggan_nama:
          sale.pelanggan_nama || sale.pelanggan_nama_snapshot || undefined,
        kasir_nama: sale.kasir_nama || "Kasir",
        items,
        total,
        jumlah_bayar: bayar,
        kembalian: Math.max(0, bayar - total),
        metode_pembayaran: sale.metode_pembayaran,
        biaya_tambahan: undefined,
      });
    } catch (e) {
      console.error("reprintThermal error:", e);
      alert("Gagal menyiapkan struk untuk dicetak.");
    } finally {
      setPrintingId(null);
    }
  };

  const previewFaktur = async (
    sale: Sale,
    overrideNama?: string,
    overrideKota?: string,
  ) => {
    const nama =
      overrideNama || sale.pelanggan_nama || sale.pelanggan_nama_snapshot || "";
    if (!nama) {
      setFakturPromptInput({
        nama: "",
        kota: sale.pelanggan_kota || "Bekasi",
      });
      setFakturPromptMode("preview");
      setFakturPromptSale(sale);
      return;
    }
    setPrintingId(sale.id);
    try {
      const { generateFakturHTML } = await import("@/lib/faktur-print");
      let shop:
        | {
            nama_toko?: string | null;
            slogan?: string | null;
            alamat?: string | null;
            telepon?: string | null;
            email?: string | null;
            website?: string | null;
            bank_nama?: string | null;
            bank_nomor?: string | null;
            bank_atas_nama?: string | null;
            catatan_faktur?: string | null;
            npwp?: string | null;
            alamat_npwp?: string | null;
          }
        | undefined;
      try {
        const { getShopSettingsAction } =
          await import("@/app/pengaturan/actions");
        const settings = await getShopSettingsAction();
        shop = {
          nama_toko: settings.nama_toko,
          slogan: settings.slogan,
          alamat: settings.alamat,
          telepon: settings.telepon,
          email: settings.email,
          website: settings.website,
          bank_nama: settings.bank_nama,
          bank_nomor: settings.bank_nomor,
          bank_atas_nama: settings.bank_atas_nama,
          catatan_faktur: settings.catatan_faktur,
          npwp: settings.npwp,
          alamat_npwp: settings.alamat_npwp,
        };
      } catch (settingsError) {
        console.warn(
          "Data usaha tidak bisa dimuat untuk preview faktur:",
          settingsError,
        );
      }
      const items = (sale.items || []).map((item) =>
        mapPenjualanItemKeFaktur({
          barang_nama: item.barang_nama,
          tipe_item: item.tipe_item ?? undefined,
          deskripsi_pekerjaan: item.deskripsi_pekerjaan,
          jumlah: Number(item.jumlah || 0),
          nama_satuan: item.nama_satuan || "",
          panjang: item.panjang,
          lebar: item.lebar,
          harga_satuan: Number(item.harga_satuan || 0),
          subtotal: Number(item.subtotal || 0),
          biaya_tambahan: (item.biaya_tambahan || [])
            .filter((b) => b.label?.trim() && b.nominal > 0)
            .map((b) => ({
              label: b.label.trim(),
              nominal: Number(b.nominal),
            })),
        }),
      );
      const total = sale.total_jumlah;
      const bayar =
        sale.jumlah_dibayar ?? sale.total_jumlah - sale.sisa_piutang;
      const sisa = Math.max(0, total - bayar);
      const html = generateFakturHTML({
        nomor_faktur: sale.nomor_faktur,
        tanggal: sale.dibuat_pada,
        pelanggan_nama: nama,
        kota: overrideKota || sale.pelanggan_kota || "Bekasi",
        items,
        total,
        bayar,
        sisa,
        shop,
      });
      window.dispatchEvent(
        new CustomEvent("gemi:preview-faktur", {
          detail: { html, title: `Faktur ${sale.nomor_faktur}` },
        }),
      );
    } catch (e) {
      console.error("previewFaktur error:", e);
      alert("Gagal menyiapkan preview faktur.");
    } finally {
      setPrintingId(null);
    }
  };

  const reprintFaktur = async (
    sale: Sale,
    overrideNama?: string,
    overrideKota?: string,
  ) => {
    const nama =
      overrideNama || sale.pelanggan_nama || sale.pelanggan_nama_snapshot || "";
    if (!nama) {
      // Buka prompt untuk penjualan lama tanpa data snapshot
      setFakturPromptInput({
        nama: "",
        kota: sale.pelanggan_kota || "Bekasi",
      });
      setFakturPromptMode("print");
      setFakturPromptSale(sale);
      return;
    }
    setPrintingId(sale.id);
    try {
      const { printFaktur } = await import("@/lib/faktur-print");
      let shop:
        | {
            nama_toko?: string | null;
            slogan?: string | null;
            alamat?: string | null;
            telepon?: string | null;
            email?: string | null;
            website?: string | null;
            bank_nama?: string | null;
            bank_nomor?: string | null;
            bank_atas_nama?: string | null;
            catatan_faktur?: string | null;
            npwp?: string | null;
            alamat_npwp?: string | null;
          }
        | undefined;
      try {
        const { getShopSettingsAction } =
          await import("@/app/pengaturan/actions");
        const settings = await getShopSettingsAction();
        shop = {
          nama_toko: settings.nama_toko,
          slogan: settings.slogan,
          alamat: settings.alamat,
          telepon: settings.telepon,
          email: settings.email,
          website: settings.website,
          bank_nama: settings.bank_nama,
          bank_nomor: settings.bank_nomor,
          bank_atas_nama: settings.bank_atas_nama,
          catatan_faktur: settings.catatan_faktur,
          npwp: settings.npwp,
          alamat_npwp: settings.alamat_npwp,
        };
      } catch (settingsError) {
        console.warn(
          "Data usaha tidak bisa dimuat untuk reprint faktur:",
          settingsError,
        );
      }
      const items = (sale.items || []).map((item) =>
        mapPenjualanItemKeFaktur({
          barang_nama: item.barang_nama,
          tipe_item: item.tipe_item ?? undefined,
          deskripsi_pekerjaan: item.deskripsi_pekerjaan,
          jumlah: Number(item.jumlah || 0),
          nama_satuan: item.nama_satuan || "",
          panjang: item.panjang,
          lebar: item.lebar,
          harga_satuan: Number(item.harga_satuan || 0),
          subtotal: Number(item.subtotal || 0),
          biaya_tambahan: (item.biaya_tambahan || [])
            .filter((b) => b.label?.trim() && b.nominal > 0)
            .map((b) => ({
              label: b.label.trim(),
              nominal: Number(b.nominal),
            })),
        }),
      );
      const total = sale.total_jumlah;
      const bayar =
        sale.jumlah_dibayar ?? sale.total_jumlah - sale.sisa_piutang;
      const sisa = Math.max(0, total - bayar);
      await printFaktur({
        nomor_faktur: sale.nomor_faktur,
        tanggal: sale.dibuat_pada,
        pelanggan_nama: nama,
        kota: overrideKota || sale.pelanggan_kota || "Bekasi",
        items,
        total,
        bayar,
        sisa,
        shop,
      });
    } catch (e) {
      console.error("reprintFaktur error:", e);
      alert("Gagal menyiapkan faktur untuk dicetak.");
    } finally {
      setPrintingId(null);
    }
  };

  // Total dan piutang SELALU mengecualikan transaksi VOID, baik toggle
  // tampilkan-void menyala atau tidak. Transaksi yang dibatalkan tidak
  // boleh ikut menambah angka penjualan/piutang.
  const salesUntukTotal = sesuaiPencarian.filter((sale) => !isVoid(sale));
  const totalPenjualan = salesUntukTotal.reduce(
    (sum, sale) => sum + sale.total_jumlah,
    0,
  );
  const totalPiutang = salesUntukTotal
    .filter(
      (s) =>
        s.status_pembayaran === "AKTIF" || s.status_pembayaran === "SEBAGIAN",
    )
    .reduce((sum, sale) => sum + sale.sisa_piutang, 0);

  return (
    <div className="space-y-4">
      {/* Search and Stats */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 max-w-md">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari faktur atau pelanggan..."
            className="w-full px-4 py-2.5 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00afef] dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
        <div className="flex items-center gap-3">
          {totalPiutang > 0 && onPayReceivable && (
            <button
              onClick={onPayReceivable}
              className="px-4 py-2.5 bg-gradient-to-r from-[#00afef] to-[#2266ff] text-white rounded-lg font-semibold hover:from-[#0099dd] hover:to-[#1955ee] transition-all shadow-md text-base flex items-center gap-2"
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
                  d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
              Terima Piutang
            </button>
          )}
          <div className="text-right">
            <div className="text-sm text-gray-500 dark:text-slate-400">
              Total Penjualan
            </div>
            <div className="text-xl font-bold text-[#00afef]">
              Rp {totalPenjualan.toLocaleString("id-ID")}
            </div>
          </div>
          {totalPiutang > 0 && (
            <div className="text-right">
              <div className="text-sm text-gray-500 dark:text-slate-400">
                Total Piutang
              </div>
              <div className="text-xl font-bold text-red-600">
                Rp {totalPiutang.toLocaleString("id-ID")}
              </div>
            </div>
          )}
          <div className="text-right">
            <div className="text-sm text-gray-500 dark:text-slate-400">
              Transaksi
            </div>
            <div className="text-xl font-bold text-gray-800 dark:text-slate-100">
              {filteredSales.length}
            </div>
          </div>
        </div>
      </div>

      {/* Toggle tampilkan transaksi yang dibatalkan (VOID) */}
      {jumlahVoid > 0 && (
        <div className="flex items-center justify-end">
          <label className="inline-flex items-center gap-2 cursor-pointer text-sm font-semibold text-gray-600 dark:text-slate-300 select-none">
            <input
              type="checkbox"
              checked={tampilkanVoid}
              onChange={(e) => setTampilkanVoid(e.target.checked)}
              className="rounded border-gray-300 dark:border-slate-600 text-[#00afef] focus:ring-[#00afef]"
            />
            Tampilkan transaksi dibatalkan ({jumlahVoid})
          </label>
        </div>
      )}

      {/* Table */}
      {filteredSales.length === 0 ? (
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
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <p className="text-gray-600 dark:text-slate-300 font-semibold">
            Belum ada transaksi
          </p>
          <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">
            Transaksi akan muncul di sini
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 dark:border-slate-800 rounded-lg max-h-[700px] overflow-y-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-[#00afef] to-[#2266ff] text-white">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold">
                  Faktur
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold">
                  Pelanggan
                </th>
                <th className="px-4 py-3 text-right text-sm font-semibold">
                  Total
                </th>
                <th className="px-4 py-3 text-center text-sm font-semibold">
                  Pembayaran
                </th>
                <th className="px-4 py-3 text-center text-sm font-semibold">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold">
                  Tanggal
                </th>
                <th className="px-4 py-3 text-center text-sm font-semibold">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredSales.map((sale, index) => (
                <React.Fragment key={sale.id}>
                  <tr
                    onClick={() =>
                      setExpandedSale(expandedSale === sale.id ? null : sale.id)
                    }
                    className={`border-b border-gray-200 dark:border-slate-800 hover:bg-cyan-50 transition-all cursor-pointer ${
                      isVoid(sale)
                        ? "bg-red-50/40 dark:bg-red-900/10 opacity-60"
                        : index % 2 === 0
                          ? "bg-white dark:bg-slate-900"
                          : "bg-gray-50 dark:bg-slate-800"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div
                        className={`font-bold text-base text-gray-800 dark:text-slate-100 ${
                          isVoid(sale)
                            ? "line-through text-gray-500 dark:text-slate-400"
                            : ""
                        }`}
                      >
                        {sale.nomor_faktur}
                      </div>
                      {sale.status_transaksi === "VOIDED" && (
                        <span className="inline-block mt-1 px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 rounded text-xs font-semibold">
                          VOID
                        </span>
                      )}
                      {sale.kasir_nama && (
                        <div className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                          Kasir: {sale.kasir_nama}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-base text-gray-800 dark:text-slate-100">
                        {sale.pelanggan_nama ||
                          sale.pelanggan_nama_snapshot || (
                            <span className="text-gray-400 italic">Umum</span>
                          )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="font-bold text-base text-gray-800 dark:text-slate-100">
                        {formatRupiah(sale.total_jumlah)}
                      </div>
                      {sale.sisa_piutang > 0 && (
                        <div className="text-sm text-red-600 mt-1">
                          Sisa: {formatRupiah(sale.sisa_piutang)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-100 dark:bg-slate-800 rounded-lg text-sm font-semibold text-gray-700 dark:text-slate-300">
                        {getPaymentMethodIcon(sale.metode_pembayaran)}
                        {sale.metode_pembayaran}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {getStatusBadge(sale.status_pembayaran)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-base text-gray-700 dark:text-slate-300">
                        {formatDate(sale.dibuat_pada)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <MenuAksi
                        labelMenu={`Aksi untuk ${sale.nomor_faktur}`}
                        aksi={[
                          {
                            label: "Pratinjau Faktur",
                            judul: "Pratinjau faktur (jendela mengambang)",
                            disabled: printingId === sale.id,
                            onClick: () => previewFaktur(sale),
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
                            label: "Cetak Struk (80mm)",
                            judul: "Cetak ulang struk thermal (80mm)",
                            disabled: printingId === sale.id,
                            onClick: () => reprintThermal(sale),
                            ikon: (
                              <svg
                                className="w-5 h-5 text-cyan-600"
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
                            label: "Cetak Faktur (A4)",
                            judul: "Cetak faktur A4 (buka tab baru)",
                            disabled: printingId === sale.id,
                            onClick: () => reprintFaktur(sale),
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
                            label: "Buat Surat Jalan",
                            judul: "Buat surat jalan dari transaksi ini",
                            onClick: () => {
                              window.location.href = `/surat-jalan?from=${sale.id}`;
                            },
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
                                  d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z"
                                />
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1"
                                />
                              </svg>
                            ),
                          },
                          // Aksi kembalikan pembayaran: hanya tampil bila ada
                          // riwayat pelunasan yang bisa dibatalkan.
                          {
                            label:
                              sale.status_pembayaran === "LUNAS"
                                ? "Kembalikan Pembayaran"
                                : "Batalkan Pembayaran Sebagian",
                            judul:
                              sale.status_pembayaran === "LUNAS"
                                ? "Kembalikan pembayaran piutang (ke status AKTIF)"
                                : "Batalkan pembayaran sebagian",
                            tampil:
                              sale.status_transaksi !== "VOIDED" &&
                              sale.has_pelunasan === 1 &&
                              !!onRevert,
                            onClick: () => onRevert?.(sale),
                            ikon: (
                              <svg
                                className={`w-5 h-5 ${
                                  sale.status_pembayaran === "LUNAS"
                                    ? "text-blue-600 dark:text-blue-300"
                                    : "text-orange-600 dark:text-orange-300"
                                }`}
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
                            label: "Batalkan Transaksi",
                            judul: "Batalkan Transaksi",
                            varian: "bahaya",
                            tampil: !!onDelete,
                            disabled:
                              deletingId === sale.id ||
                              sale.status_transaksi === "VOIDED",
                            onClick: () =>
                              setConfirmDialog({
                                show: true,
                                saleId: sale.id,
                                invoiceNumber: sale.nomor_faktur,
                              }),
                            ikon:
                              deletingId === sale.id ? (
                                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-red-500"></div>
                              ) : (
                                <TrashIcon size={20} className="text-red-500" />
                              ),
                          },
                        ]}
                      />
                    </td>
                  </tr>

                  {/* Expanded Row - Items */}
                  {expandedSale === sale.id && sale.items && (
                    <tr className="bg-gradient-to-r from-cyan-50/50 to-blue-50/50">
                      <td colSpan={7} className="px-4 py-3">
                        <div className="text-sm">
                          <div className="font-semibold text-gray-700 dark:text-slate-300 mb-2">
                            Detail Item:
                          </div>
                          <div className="space-y-1">
                            {sale.items.map((item, idx) => {
                              const cetakInput = {
                                jumlah: Number(item.jumlah || 0),
                                nama_satuan: item.nama_satuan || "",
                                panjang: item.panjang,
                                lebar: item.lebar,
                                billed_panjang: item.billed_panjang,
                                billed_lebar: item.billed_lebar,
                                jumlah_roll: item.jumlah_roll,
                              };
                              const { qty: qtyCetak, satuan: satuanCetak } =
                                qtySatuanCetakPenjualan(cetakInput);
                              const ukuranCetak = formatUkuranCetakInput(
                                cetakInput as any,
                              );
                              const biayaItem = (item.biaya_tambahan || [])
                                .filter((b) => b.label?.trim() && b.nominal > 0)
                                .map((b) => ({
                                  label: b.label.trim(),
                                  nominal: Number(b.nominal),
                                }));
                              return (
                                <div
                                  key={idx}
                                  className="py-1 px-2 bg-white dark:bg-slate-900/60 rounded"
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                      <span className="font-semibold text-gray-800 dark:text-slate-100">
                                        {idx + 1}.{" "}
                                        {item.tipe_item === "MAKLON" &&
                                        item.deskripsi_pekerjaan
                                          ? item.deskripsi_pekerjaan
                                          : item.barang_nama}
                                      </span>
                                      {ukuranCetak ? (
                                        <span className="text-gray-500 dark:text-slate-400 ml-2">
                                          Ukuran: {ukuranCetak}
                                        </span>
                                      ) : (
                                        <span className="text-gray-500 dark:text-slate-400 ml-2">
                                          ({item.nama_satuan})
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-4 text-gray-700 dark:text-slate-300">
                                      <span>
                                        Qty:{" "}
                                        <span className="font-semibold">
                                          {qtyCetak}
                                          {satuanCetak ? ` ${satuanCetak}` : ""}
                                        </span>
                                      </span>
                                      <span>×</span>
                                      <span>
                                        Rp{" "}
                                        <span className="font-semibold">
                                          {(qtyCetak > 0
                                            ? (item.subtotal ?? 0) / qtyCetak
                                            : (item.harga_satuan ?? 0)
                                          ).toLocaleString("id-ID")}
                                        </span>
                                      </span>
                                      <span>=</span>
                                      <span className="font-semibold text-[#00afef]">
                                        Rp{" "}
                                        {(item.subtotal ?? 0).toLocaleString(
                                          "id-ID",
                                        )}
                                      </span>
                                      {typeof item.hpp_total === "number" && (
                                        <span className="text-slate-500">
                                          HPP Rp{" "}
                                          {item.hpp_total.toLocaleString(
                                            "id-ID",
                                          )}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  {biayaItem.length > 0 && (
                                    <div className="mt-1 pl-3 space-y-0.5 text-sm text-gray-600 dark:text-slate-300">
                                      {biayaItem.map((b, bIdx) => (
                                        <div
                                          key={bIdx}
                                          className="flex justify-between"
                                        >
                                          <span>+ {b.label}</span>
                                          <span className="text-amber-700 dark:text-amber-300">
                                            Rp{" "}
                                            {b.nominal.toLocaleString("id-ID")}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          {sale.biaya_tambahan &&
                            sale.biaya_tambahan.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-gray-200 dark:border-slate-700">
                                <div className="font-semibold text-gray-700 dark:text-slate-300 mb-1">
                                  Biaya Tambahan:
                                </div>
                                <div className="space-y-0.5">
                                  {sale.biaya_tambahan.map((b, bIdx) => (
                                    <div
                                      key={bIdx}
                                      className="flex justify-between py-0.5 px-2 bg-amber-50 dark:bg-amber-900/20 rounded"
                                    >
                                      <span className="text-gray-700 dark:text-slate-300">
                                        {b.label}
                                      </span>
                                      <span className="font-semibold text-amber-700 dark:text-amber-300">
                                        Rp {b.nominal.toLocaleString("id-ID")}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Info Text */}
      {filteredSales.length > 0 && (
        <div className="text-sm text-gray-500 dark:text-slate-400 text-center">
          Klik baris untuk melihat detail item penjualan
        </div>
      )}

      {/* Confirm Dialog */}
      {confirmDialog && (
        <DialogKonfirmasi
          show={confirmDialog.show}
          title="Batalkan Transaksi"
          message={`Apakah Anda yakin ingin membatalkan transaksi ${confirmDialog.invoiceNumber}?\n\nTransaksi tidak akan dihapus permanen. Stok akan dikembalikan lewat jurnal pembalik, dan data keuangan terkait ditandai VOID.`}
          onConfirm={async () => {
            setConfirmDialog(null);
            setDeletingId(confirmDialog.saleId);
            try {
              if (onDelete) {
                await onDelete(confirmDialog.saleId);
              }
            } finally {
              setDeletingId(null);
            }
          }}
          onCancel={() => setConfirmDialog(null)}
          type="danger"
        />
      )}

      {fakturPromptSale && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div
            ref={fakturPromptRef}
            className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
          >
            <div className="bg-gradient-to-r from-[#00afef] to-[#2266ff] px-5 py-4">
              <h3 className="text-white font-bold text-lg">
                {fakturPromptMode === "preview"
                  ? "Info untuk Pratinjau Faktur"
                  : "Info untuk Faktur"}
              </h3>
              <p className="text-white/90 text-sm mt-0.5">
                Transaksi {fakturPromptSale.nomor_faktur} tidak menyimpan data
                pelanggan. Isi info untuk{" "}
                {fakturPromptMode === "preview" ? "ditampilkan" : "dicetak"} di
                faktur.
              </p>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-600 dark:text-slate-300 mb-1">
                  Kepada Yth.
                </label>
                <input
                  type="text"
                  value={fakturPromptInput.nama}
                  onChange={(e) =>
                    setFakturPromptInput((prev) => ({
                      ...prev,
                      nama: e.target.value,
                    }))
                  }
                  placeholder="Nama / nama perusahaan"
                  className="w-full px-3 py-2.5 text-base bg-white dark:bg-slate-900 text-black dark:text-slate-100 border-2 border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:border-[#00afef]"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-600 dark:text-slate-300 mb-1">
                  Kota
                </label>
                <input
                  type="text"
                  value={fakturPromptInput.kota}
                  onChange={(e) =>
                    setFakturPromptInput((prev) => ({
                      ...prev,
                      kota: e.target.value,
                    }))
                  }
                  placeholder="Bekasi"
                  className="w-full px-3 py-2.5 text-base bg-white dark:bg-slate-900 text-black dark:text-slate-100 border-2 border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:border-[#00afef]"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeFakturPrompt}
                  className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 font-semibold hover:bg-gray-200 text-base"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={submitFakturPrompt}
                  disabled={!fakturPromptInput.nama.trim()}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#00afef] to-[#2266ff] text-white font-bold hover:from-[#0099dd] hover:to-[#1955ee] disabled:opacity-50 disabled:cursor-not-allowed text-base"
                >
                  {fakturPromptMode === "preview"
                    ? "Pratinjau"
                    : "Cetak Faktur"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
