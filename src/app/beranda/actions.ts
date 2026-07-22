"use server";

import { requireAdminOrManager } from "@/lib/auth-guard-server";
import {
  generateDraftPurchaseOrders,
  getReorderSuggestions,
  groupSuggestionsByVendor,
  type GenerateDraftPurchaseOrdersResult,
  type ReorderSuggestion,
  type ReorderSuggestionGroup,
} from "@/lib/services/auto-po-service";
import { getPOSInitData } from "@/lib/services/pos-service";
import { getProductionOrders } from "@/lib/services/production-service";
import { getLatestPerFormulaKey } from "@/lib/services/transaction-computed-service";
import { db } from "@/lib/db-unified";

export interface DailySalesTrend {
  date: string; // "DD/MM"
  omzet: number;
  transaksi: number;
}

export interface DashboardStats {
  todaySalesCount: number;
  todayRevenue: number;
  totalSalesCount: number;
  activeOrders: number;
  kilat: number;
  saldo: number;
  activePiutang: number;
  totalPiutang: number;
  dailySalesTrend: DailySalesTrend[];
  recentSales: Array<{
    id: string;
    pelangganNama: string;
    totalJumlah: number;
    statusPembayaran: string;
    dibuatPada: string;
  }>;
  recentOrders: Array<{
    id: string;
    nomorSpk: string;
    pelangganNama: string;
    status: string;
    prioritas: string;
  }>;
}

export async function getDashboardStatsAction(): Promise<DashboardStats> {
  const [posData, orders, latestMap] = await Promise.all([
    getPOSInitData(),
    getProductionOrders(),
    getLatestPerFormulaKey(),
  ]);

  // Buang transaksi yang sudah dibatalkan (VOIDED) agar tidak ikut
  // menghitung statistik, tren, atau daftar terakhir di Beranda.
  const sales = (posData.sales ?? []).filter(
    (s: any) => s.status_transaksi !== "VOIDED",
  );

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const todaySales = sales.filter((s: any) => {
    const d = s.dibuat_pada || s.created_at || "";
    return d.startsWith(todayStr);
  });

  let todayRevenue = 0;
  for (const s of todaySales) {
    todayRevenue += Number(s.total_jumlah ?? 0);
  }

  const activeOrders = orders.filter(
    (o: any) => o.status === "MENUNGGU" || o.status === "PROSES",
  ).length;

  const kilat = orders.filter(
    (o: any) =>
      (o.status === "MENUNGGU" || o.status === "PROSES") &&
      o.prioritas === "KILAT",
  ).length;

  const saldo = latestMap.saldo ?? 0;

  let activePiutang = 0;
  let totalPiutang = 0;
  for (const s of sales) {
    const status = (s as any).status_pembayaran ?? "LUNAS";
    if (status === "AKTIF" || status === "SEBAGIAN") {
      activePiutang++;
      totalPiutang += Number((s as any).sisa_piutang ?? 0);
    }
  }

  // Build last-30-days daily trend
  const trendMap = new Map<string, { omzet: number; transaksi: number }>();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    trendMap.set(key, { omzet: 0, transaksi: 0 });
  }
  for (const s of sales) {
    const raw = (s as any).dibuat_pada || (s as any).created_at || "";
    const dateKey = raw.slice(0, 10);
    if (trendMap.has(dateKey)) {
      const entry = trendMap.get(dateKey)!;
      entry.omzet += Number((s as any).total_jumlah ?? 0);
      entry.transaksi += 1;
    }
  }
  const dailySalesTrend = Array.from(trendMap.entries()).map(([key, val]) => {
    const [, mm, dd] = key.split("-");
    return { date: `${dd}/${mm}`, omzet: val.omzet, transaksi: val.transaksi };
  });

  const recentSales = todaySales
    .slice(-5)
    .reverse()
    .map((s: any) => ({
      id: s.id,
      pelangganNama: s.pelanggan_nama || "Pelanggan Umum",
      totalJumlah: Number(s.total_jumlah ?? 0),
      statusPembayaran: s.status_pembayaran ?? "LUNAS",
      dibuatPada: s.dibuat_pada || s.created_at || "",
    }));

  const recentOrders = orders
    .filter((o: any) => o.status === "MENUNGGU" || o.status === "PROSES")
    .slice(0, 5)
    .map((o: any) => ({
      id: o.id,
      nomorSpk: o.nomor_spk || "-",
      pelangganNama: o.pelanggan_nama || "-",
      status: o.status,
      prioritas: o.prioritas || "NORMAL",
    }));

  return {
    todaySalesCount: todaySales.length,
    todayRevenue,
    totalSalesCount: sales.length,
    activeOrders,
    kilat,
    saldo,
    activePiutang,
    totalPiutang,
    dailySalesTrend,
    recentSales,
    recentOrders,
  };
}

export interface ReorderSuggestionsResponse {
  suggestions: ReorderSuggestion[];
  groups: ReorderSuggestionGroup[];
  total_items: number;
}

export async function getReorderSuggestionsAction(): Promise<ReorderSuggestionsResponse> {
  const suggestions = await getReorderSuggestions();
  const groups = groupSuggestionsByVendor(suggestions);
  return {
    suggestions,
    groups,
    total_items: suggestions.length,
  };
}

export async function generateDraftPurchaseOrdersAction(
  vendor_ids?: string[],
): Promise<GenerateDraftPurchaseOrdersResult> {
  const session = await requireAdminOrManager();
  return generateDraftPurchaseOrders({
    vendor_ids,
    dibuat_oleh: session.uid,
  });
}

// ── Barang paling laku dijual (Beranda) ──────────────────────────────────────

/** Rentang periode untuk perhitungan barang terlaku. */
export type PeriodeTerlaku = "30" | "90" | "semua";

/** Satu baris produk terlaku dengan metrik agregat. */
export interface ProdukTerlaku {
  /** Nama tampilan produk (Produk Jual untuk BARANG, nama produk untuk MAKLON). */
  nama: string;
  /** Total kuantitas terjual (Σ jumlah baris). */
  qtyTerjual: number;
  /** Total omzet dari produk ini (Σ subtotal). */
  omzet: number;
  /** Total margin/gross profit (Σ gross_profit). */
  margin: number;
  /** Margin dalam persen dari omzet (0 bila omzet 0). */
  marginPersen: number;
}

export interface TopSellingProductsResult {
  /** Produk produksi sendiri (baris tipe_item = BARANG), per Produk Jual. */
  dataBarang: ProdukTerlaku[];
  /** Produk maklon/subkontrak (baris tipe_item = MAKLON), per produk maklon. */
  katalogExtra: ProdukTerlaku[];
}

/**
 * Ambil 10 karakter tanggal (YYYY-MM-DD) dari nilai tanggal apa pun.
 * Mengembalikan string kosong bila tidak bisa diparse.
 */
function tanggalKey(value: unknown): string {
  if (typeof value === "string" && value.length >= 10) return value.slice(0, 10);
  if (value instanceof Date && !isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  return "";
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Akumulasi metrik per produk saat mengelompokkan baris penjualan. */
interface AkumulatorProduk {
  nama: string;
  qtyTerjual: number;
  omzet: number;
  margin: number;
}

/**
 * Ubah peta akumulator menjadi daftar top-N produk terlaku,
 * diurutkan berdasarkan kuantitas terjual (desc).
 */
function ringkasTerlaku(
  map: Map<string, AkumulatorProduk>,
  limit: number,
): ProdukTerlaku[] {
  return Array.from(map.values())
    .sort((a, b) => b.qtyTerjual - a.qtyTerjual)
    .slice(0, limit)
    .map((acc) => ({
      nama: acc.nama,
      qtyTerjual: acc.qtyTerjual,
      omzet: acc.omzet,
      margin: acc.margin,
      marginPersen: acc.omzet > 0 ? (acc.margin / acc.omzet) * 100 : 0,
    }));
}

/**
 * Hitung 5 produk paling laku dijual dalam periode tertentu, dipisah antara
 * Data Barang (produksi sendiri, tipe_item = BARANG, dikelompokkan per Produk
 * Jual) dan Katalog Extra (maklon, tipe_item = MAKLON, dikelompokkan per produk
 * maklon). Transaksi VOIDED tidak dihitung.
 */
export async function getTopSellingProductsAction(
  periode: PeriodeTerlaku = "90",
): Promise<TopSellingProductsResult> {
  const [salesRes, itemsRes, unitPricesRes] = await Promise.all([
    db.query<any>("penjualan"),
    db.query<any>("item_penjualan"),
    db.query<any>("harga_barang_satuan"),
  ]);

  const sales = salesRes.data || [];
  const items = itemsRes.data || [];

  // Nama Produk Jual per harga_satuan_id (fallback resolusi nama BARANG).
  const unitPriceNameMap = new Map<string, string>();
  for (const up of unitPricesRes.data || []) {
    if (up.nama_produk_jual) unitPriceNameMap.set(up.id, up.nama_produk_jual);
  }

  // Ambang bawah tanggal (inklusif) untuk periode 30/90 hari; null = semua.
  let startKey: string | null = null;
  if (periode !== "semua") {
    const hari = periode === "30" ? 30 : 90;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (hari - 1));
    startKey = tanggalKey(start);
  }

  // Kumpulkan id penjualan non-VOIDED yang masuk periode.
  const saleIdSet = new Set<string>();
  for (const s of sales) {
    const status = String(s.status_transaksi || "POSTED").toUpperCase();
    if (status === "VOIDED") continue;
    if (startKey) {
      const key = tanggalKey(s.dibuat_pada ?? s.created_at);
      if (!key || key < startKey) continue;
    }
    saleIdSet.add(s.id);
  }

  const barang = new Map<string, AkumulatorProduk>();
  const maklon = new Map<string, AkumulatorProduk>();

  for (const item of items) {
    if (!saleIdSet.has(item.penjualan_id)) continue;

    const tipe = String(item.tipe_item || "BARANG").toUpperCase();
    // JASA tidak masuk ke salah satu panel (bukan produk terlaku).
    if (tipe !== "BARANG" && tipe !== "MAKLON") continue;

    const qty = toNumber(item.jumlah);
    const omzet = toNumber(item.subtotal);
    const margin = toNumber(item.gross_profit);

    if (tipe === "MAKLON") {
      const key = item.katalog_maklon_id
        ? `katalog:${item.katalog_maklon_id}`
        : `nama:${(item.nama_produk_jual || item.nama_satuan || "Produk Maklon").toLowerCase()}`;
      const nama =
        item.nama_produk_jual || item.nama_satuan || "Produk Maklon";
      const acc = maklon.get(key) || {
        nama,
        qtyTerjual: 0,
        omzet: 0,
        margin: 0,
      };
      acc.qtyTerjual += qty;
      acc.omzet += omzet;
      acc.margin += margin;
      maklon.set(key, acc);
    } else {
      // Kelompokkan per Produk Jual (harga_satuan_id), bukan master barang.
      const namaProdukJual =
        item.nama_produk_jual ||
        (item.harga_satuan_id
          ? unitPriceNameMap.get(item.harga_satuan_id)
          : null) ||
        item.nama_satuan ||
        "Produk";
      const key = item.harga_satuan_id
        ? `harga:${item.harga_satuan_id}`
        : `nama:${namaProdukJual.toLowerCase()}`;
      const acc = barang.get(key) || {
        nama: namaProdukJual,
        qtyTerjual: 0,
        omzet: 0,
        margin: 0,
      };
      acc.qtyTerjual += qty;
      acc.omzet += omzet;
      acc.margin += margin;
      barang.set(key, acc);
    }
  }

  return {
    dataBarang: ringkasTerlaku(barang, 5),
    katalogExtra: ringkasTerlaku(maklon, 5),
  };
}
