"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  fetchSessionUser,
  getCachedSessionUser,
} from "@/lib/client-session";
import { useCachedData } from "@/lib/use-cached-data";
import {
  generateDraftPurchaseOrdersAction,
  getDashboardStatsAction,
  getReorderSuggestionsAction,
  type DashboardStats,
  type DailySalesTrend,
  type ReorderSuggestionsResponse,
} from "./actions";

interface User {
  id: string;
  nama_pengguna: string;
  email?: string | null;
  nama_lengkap?: string | null;
  role: string;
  aktif_status: number;
}

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);

const fmtTime = (iso: string) => {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "-";
  }
};

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    LUNAS: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300",
    AKTIF: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
    SEBAGIAN: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
    MENUNGGU: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700",
    PROSES: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
    SELESAI: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300",
    KILAT: "bg-red-100 dark:bg-red-900/30 text-red-700",
    NORMAL: "bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300",
  };
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${colors[status] || "bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300"}`}
    >
      {status}
    </span>
  );
}

export default function DashboardPage() {
  const initialUser =
    typeof window !== "undefined"
      ? (getCachedSessionUser() as User | null)
      : null;
  const [user, setUser] = useState<User | null>(initialUser);
  const [trendDays, setTrendDays] = useState<7 | 14 | 30>(30);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const u = await fetchSessionUser();
      if (!cancelled && u) setUser(u);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const { data: stats, isLoading } = useCachedData<DashboardStats>(
    "dashboard-stats-v2",
    getDashboardStatsAction
  );

  const {
    data: reorderData,
    mutate: mutateReorder,
  } = useCachedData<ReorderSuggestionsResponse>(
    "dashboard-reorder-v1",
    getReorderSuggestionsAction
  );

  return (
    <div className="space-y-6">
      {/* Welcome Card */}
      <div className="bg-gradient-to-br from-[#00afef] to-[#2266ff] rounded-2xl shadow-lg p-8 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold mb-2 font-twcenmt">
              Selamat Datang, {user?.nama_lengkap || user?.nama_pengguna}!
            </h2>
            <p className="text-white/90">
              <span className="font-bauhaus italic text-lg">
                <span className="text-white">gemi</span>
                <span className="text-white/80">print</span>
              </span>{" "}
              — Sistem Manajemen Percetakan
            </p>
          </div>
          <div className="hidden md:block">
            <Image
              src="/assets/images/logo-gemiprint-white.svg"
              alt="gemiprint"
              width={80}
              height={80}
              className="opacity-40"
            />
          </div>
        </div>
      </div>

      {isLoading && !stats ? (
        <div className="flex items-center justify-center py-16">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-[#00afef] border-t-transparent" />
        </div>
      ) : stats ? (
        <>
          {/* Stats row: today */}
          <div>
            <h3 className="text-lg font-bold text-gray-800 dark:text-slate-100 mb-3 font-twcenmt">
              Hari Ini
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Transaksi"
                value={String(stats.todaySalesCount)}
                subtitle="penjualan"
                icon="receipt"
                color="cyan"
              />
              <StatCard
                title="Omzet"
                value={fmtCurrency(stats.todayRevenue)}
                color="emerald"
                icon="trending"
              />
              <StatCard
                title="Total Penjualan"
                value={String(stats.totalSalesCount)}
                subtitle="sepanjang waktu"
                icon="chart"
                color="blue"
              />
              <StatCard
                title="Piutang Aktif"
                value={fmtCurrency(stats.totalPiutang)}
                subtitle={`${stats.activePiutang} transaksi`}
                icon="warning"
                color="amber"
              />
            </div>
          </div>

          {/* Sales Trend Chart */}
          <div className="bg-white dark:bg-slate-900/40 backdrop-blur-sm border border-white/30 rounded-2xl shadow p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-800 dark:text-slate-100 font-twcenmt">
                Tren Penjualan
              </h3>
              <div className="flex gap-1">
                {([7, 14, 30] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setTrendDays(d)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                      trendDays === d
                        ? "bg-[#00afef] text-white shadow"
                        : "bg-white dark:bg-slate-900/60 text-gray-500 dark:text-slate-400 hover:bg-white/80"
                    }`}
                  >
                    {d} hari
                  </button>
                ))}
              </div>
            </div>
            <SalesTrendChart
              data={(stats.dailySalesTrend ?? []).slice(-trendDays)}
              days={trendDays}
            />
          </div>

          {/* Stats Row: Produksi */}
          <div>
            <h3 className="text-lg font-bold text-gray-800 dark:text-slate-100 mb-3 font-twcenmt">
              Produksi
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Antrian Aktif"
                value={String(stats.activeOrders)}
                subtitle="order"
                icon="print"
                color="amber"
              />
              <StatCard
                title="Kilat / Mendesak"
                value={String(stats.kilat)}
                subtitle="order"
                icon="bolt"
                color="red"
              />
              <StatCard
                title="Saldo Kas"
                value={fmtCurrency(stats.saldo)}
                icon="wallet"
                color="cyan"
              />
              <div />
            </div>
          </div>

          {/* Tables Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Sales */}
            <div className="bg-white dark:bg-slate-900/40 backdrop-blur-sm border border-white/30 rounded-2xl shadow p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-800 dark:text-slate-100 font-twcenmt">
                  Penjualan Hari Ini
                </h3>
                <Link
                  href="/pos"
                  className="text-sm text-[#00afef] hover:underline font-semibold"
                >
                  Lihat Semua
                </Link>
              </div>
              {stats.recentSales.length === 0 ? (
                <p className="text-gray-400 text-sm py-4 text-center">
                  Belum ada penjualan hari ini
                </p>
              ) : (
                <div className="space-y-2">
                  {stats.recentSales.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between py-2 px-3 rounded-lg bg-white dark:bg-slate-900/60 border border-white/20"
                    >
                      <div>
                        <p className="font-semibold text-sm text-gray-800 dark:text-slate-100">
                          {s.pelangganNama}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-slate-400">
                          {fmtTime(s.dibuatPada)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-sm text-gray-800 dark:text-slate-100">
                          {fmtCurrency(s.totalJumlah)}
                        </p>
                        <StatusBadge status={s.statusPembayaran} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Active Production */}
            <div className="bg-white dark:bg-slate-900/40 backdrop-blur-sm border border-white/30 rounded-2xl shadow p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-800 dark:text-slate-100 font-twcenmt">
                  Produksi Aktif
                </h3>
                <Link
                  href="/produksi"
                  className="text-sm text-[#00afef] hover:underline font-semibold"
                >
                  Lihat Semua
                </Link>
              </div>
              {stats.recentOrders.length === 0 ? (
                <p className="text-gray-400 text-sm py-4 text-center">
                  Tidak ada order aktif
                </p>
              ) : (
                <div className="space-y-2">
                  {stats.recentOrders.map((o) => (
                    <div
                      key={o.id}
                      className="flex items-center justify-between py-2 px-3 rounded-lg bg-white dark:bg-slate-900/60 border border-white/20"
                    >
                      <div>
                        <p className="font-semibold text-sm text-gray-800 dark:text-slate-100">
                          {o.nomorSpk}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-slate-400">
                          {o.pelangganNama}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={o.status} />
                        {o.prioritas === "KILAT" && (
                          <StatusBadge status="KILAT" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Reorder Widget */}
          <ReorderWidget
            reorderData={reorderData ?? null}
            onChanged={() => {
              void mutateReorder();
            }}
          />

        </>
      ) : null}

      {/* Footer */}
      <div className="text-center pt-4 pb-2">
        <p className="text-[#6b7280] dark:text-slate-400 text-sm">
          <span className="font-bauhaus italic">
            <span className="text-[#00afef]">gemi</span>
            <span className="text-[#0a1b3d] dark:text-slate-100">print</span>
          </span>{" "}
          — Sistem Manajemen Terpadu © 2025
        </p>
      </div>
    </div>
  );
}

const fmtCurrencyShort = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}jt`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}rb`;
  return String(n);
};

function SalesTrendChart({ data, days }: { data: DailySalesTrend[]; days: 7 | 14 | 30 }) {
  // Show every 2nd label for 7d, every 3rd for 14d, every 5th for 30d
  const step = days === 7 ? 2 : days === 14 ? 3 : 5;
  const tickFormatter = (_: string, index: number) =>
    index % step === 0 ? data[index]?.date ?? "" : "";

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="omzetGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#00afef" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#00afef" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: "#6b7280" }}
          tickFormatter={tickFormatter}
          interval={0}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={fmtCurrencyShort}
          tick={{ fontSize: 11, fill: "#6b7280" }}
          axisLine={false}
          tickLine={false}
          width={48}
        />
        <Tooltip
          formatter={((value: number | string) => {
            const n = Number(value);
            return [
              new Intl.NumberFormat("id-ID", {
                style: "currency",
                currency: "IDR",
                minimumFractionDigits: 0,
              }).format(n),
              "Omzet",
            ];
          }) as any}
          labelStyle={{ fontWeight: 600, color: "#111827" }}
          contentStyle={{
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            fontSize: 12,
          }}
        />
        <Area
          type="monotone"
          dataKey="omzet"
          stroke="#00afef"
          strokeWidth={2}
          fill="url(#omzetGrad)"
          dot={false}
          activeDot={{ r: 4 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function ReorderWidget({
  reorderData,
  onChanged,
}: {
  reorderData: ReorderSuggestionsResponse | null;
  onChanged: () => void;
}) {
  const router = useRouter();
  const [generating, setGenerating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totalItems = reorderData?.total_items ?? 0;
  const groups = reorderData?.groups ?? [];
  const vendorGroups = groups.filter((g) => g.vendor_id);
  const unassignedGroup = groups.find((g) => !g.vendor_id);

  async function handleGenerate(vendorIds: string[] | null) {
    setError(null);
    setGenerating(vendorIds === null ? "all" : vendorIds.join(","));
    try {
      const result = await generateDraftPurchaseOrdersAction(
        vendorIds ?? undefined
      );
      onChanged();
      if (result.created.length > 0) {
        router.push("/pesanan-pembelian");
      } else {
        setError("Tidak ada draf pesanan pembelian yang dibuat. Pastikan vendor sudah aktif.");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Gagal membuat draf pesanan pembelian"
      );
    } finally {
      setGenerating(null);
    }
  }

  return (
    <div className="bg-white dark:bg-slate-900/40 backdrop-blur-sm border border-white/30 rounded-2xl shadow p-5">
      <div className="flex items-start justify-between mb-4 gap-3">
        <div>
          <h3 className="font-bold text-gray-800 dark:text-slate-100 font-twcenmt flex items-center gap-2">
            <svg
              className="w-5 h-5 text-amber-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
              />
            </svg>
            Barang Perlu Restock
          </h3>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
            {totalItems > 0
              ? `${totalItems} barang di bawah par level`
              : "Semua stok di atas par level"}
          </p>
        </div>
        {vendorGroups.length > 0 && (
          <button
            type="button"
            onClick={() => handleGenerate(null)}
            disabled={generating !== null}
            className="px-3 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-semibold hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 transition-all whitespace-nowrap"
          >
            {generating === "all" ? "Membuat..." : `Buat Semua (${vendorGroups.length})`}
          </button>
        )}
      </div>

      {error && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/40 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {totalItems === 0 ? (
        <div className="py-8 text-center text-sm text-gray-400 dark:text-slate-500">
          Tidak ada barang yang perlu di-restock saat ini.
        </div>
      ) : (
        <div className="space-y-2">
          {vendorGroups.map((group) => (
            <details
              key={group.vendor_id}
              className="group bg-gray-50 dark:bg-slate-800/60 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden"
            >
              <summary className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-800 list-none">
                <div className="flex items-center gap-2 min-w-0">
                  <svg
                    className="w-4 h-4 text-gray-500 dark:text-slate-400 group-open:rotate-90 transition-transform"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-gray-800 dark:text-slate-100 truncate">
                      {group.vendor_name || "Vendor"}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-slate-400">
                      {group.items.length} barang · estimasi{" "}
                      {fmtCurrency(group.total_estimasi)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (group.vendor_id) handleGenerate([group.vendor_id]);
                  }}
                  disabled={generating !== null}
                  className="px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  {generating === group.vendor_id ? "..." : "Buat Draf"}
                </button>
              </summary>
              <div className="border-t border-gray-200 dark:border-slate-700 divide-y divide-gray-100 dark:divide-slate-800">
                {group.items.map((item) => (
                  <div
                    key={item.barang_id}
                    className="flex items-center justify-between px-3 py-2 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-800 dark:text-slate-100 truncate">
                        {item.barang_nama}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-slate-400">
                        Stok {item.jumlah_stok.toLocaleString("id-ID")} / par{" "}
                        {item.level_stok_minimum.toLocaleString("id-ID")}{" "}
                        {item.satuan_dasar}
                        {item.pending_po_qty > 0 && (
                          <span className="text-blue-600 dark:text-blue-300">
                            {" "}
                            · {item.pending_po_qty.toLocaleString("id-ID")} di
                            PO pending
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="text-right ml-3 whitespace-nowrap">
                      <p className="text-sm font-semibold text-gray-800 dark:text-slate-100">
                        {item.suggested_qty.toLocaleString("id-ID")}{" "}
                        {item.satuan_dasar}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-slate-400">
                        @ {fmtCurrency(item.last_unit_price)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          ))}

          {unassignedGroup && unassignedGroup.items.length > 0 && (
            <details className="group bg-amber-50/50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-900/40 overflow-hidden">
              <summary className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-amber-100/50 dark:hover:bg-amber-950/40 list-none">
                <div className="flex items-center gap-2 min-w-0">
                  <svg
                    className="w-4 h-4 text-amber-600 dark:text-amber-400 group-open:rotate-90 transition-transform"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-amber-800 dark:text-amber-300">
                      Tanpa Saran Vendor ({unassignedGroup.items.length})
                    </p>
                    <p className="text-xs text-amber-700/80 dark:text-amber-400/80">
                      Belum ada riwayat pembelian. Buat pesanan pembelian manual.
                    </p>
                  </div>
                </div>
                <Link
                  href="/pesanan-pembelian"
                  className="px-3 py-1.5 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold whitespace-nowrap"
                >
                  Buat Manual
                </Link>
              </summary>
              <div className="border-t border-amber-200 dark:border-amber-900/40 divide-y divide-amber-100 dark:divide-amber-900/30">
                {unassignedGroup.items.map((item) => (
                  <div
                    key={item.barang_id}
                    className="flex items-center justify-between px-3 py-2 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-800 dark:text-slate-100 truncate">
                        {item.barang_nama}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-slate-400">
                        Stok {item.jumlah_stok.toLocaleString("id-ID")} / par{" "}
                        {item.level_stok_minimum.toLocaleString("id-ID")}{" "}
                        {item.satuan_dasar}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-gray-800 dark:text-slate-100 whitespace-nowrap ml-3">
                      Butuh {item.suggested_qty.toLocaleString("id-ID")}{" "}
                      {item.satuan_dasar}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  icon,
  color,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: string;
  color: string;
}) {
  const iconMap: Record<string, string> = {
    receipt: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
    trending: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6",
    chart: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
    warning: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
    print: "M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z",
    bolt: "M13 10V3L4 14h7v7l9-11h-7z",
    wallet: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z",
  };

  const colorClasses: Record<string, { bg: string; text: string; icon: string }> = {
    cyan: { bg: "bg-cyan-50 dark:bg-slate-800", text: "text-[#00afef]", icon: "text-[#00afef]" },
    emerald: { bg: "bg-emerald-50 dark:bg-slate-800", text: "text-emerald-600 dark:text-emerald-300", icon: "text-emerald-500" },
    blue: { bg: "bg-blue-50 dark:bg-slate-800", text: "text-blue-600 dark:text-blue-300", icon: "text-blue-500" },
    amber: { bg: "bg-amber-50 dark:bg-slate-800", text: "text-amber-600 dark:text-amber-300", icon: "text-amber-500" },
    red: { bg: "bg-red-50 dark:bg-red-950/40", text: "text-red-600", icon: "text-red-500" },
  };

  const c = colorClasses[color] ?? colorClasses.cyan;

  return (
    <div className="bg-white dark:bg-slate-900/40 backdrop-blur-sm border border-white/30 rounded-2xl shadow p-5 flex items-start gap-4">
      <div className={`${c.bg} p-3 rounded-xl shrink-0`}>
        <svg
          className={`w-6 h-6 ${c.icon}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={1.8}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d={iconMap[icon] || iconMap.chart}
          />
        </svg>
      </div>
      <div className="min-w-0">
        <p className="text-sm text-gray-500 dark:text-slate-400 font-twcenmt">{title}</p>
        <p className={`text-xl font-bold ${c.text} font-twcenmt truncate`}>
          {value}
        </p>
        {subtitle && (
          <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
