"use server";

import { getPOSInitData } from "@/lib/services/pos-service";
import { getProductionOrders } from "@/lib/services/production-service";
import { fetchKeuanganCashBookListActive } from "@/lib/server-data-supabase";

export interface DashboardStats {
  todaySalesCount: number;
  todayRevenue: number;
  totalSalesCount: number;
  activeOrders: number;
  kilat: number;
  saldo: number;
  activePiutang: number;
  totalPiutang: number;
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

  const recentSales = todaySales
    .slice(-5)
    .reverse()
    .map((s: any) => ({
      id: s.id,
      pelangganNama: s.pelanggan_nama || "Walk-in",
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
    recentSales,
    recentOrders,
  };
}
