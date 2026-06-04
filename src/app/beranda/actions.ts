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
import { fetchKeuanganCashBookListActive } from "@/lib/server-data-supabase";

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
  const [posData, orders, cashBooks] = await Promise.all([
    getPOSInitData(),
    getProductionOrders(),
    fetchKeuanganCashBookListActive(),
  ]);

  const sales = posData.sales ?? [];

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
    (o: any) => o.status === "MENUNGGU" || o.status === "PROSES"
  ).length;

  const kilat = orders.filter(
    (o: any) =>
      (o.status === "MENUNGGU" || o.status === "PROSES") &&
      o.prioritas === "KILAT"
  ).length;

  let saldo = 0;
  if (cashBooks.length > 0) {
    saldo = Number((cashBooks[0] as any)?.saldo ?? 0);
  }

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
  vendor_ids?: string[]
): Promise<GenerateDraftPurchaseOrdersResult> {
  const session = await requireAdminOrManager();
  return generateDraftPurchaseOrders({
    vendor_ids,
    dibuat_oleh: session.uid,
  });
}
