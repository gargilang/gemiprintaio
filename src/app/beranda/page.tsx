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
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { fetchSessionUser, getCachedSessionUser } from "@/lib/client-session";
import { useCachedData } from "@/lib/use-cached-data";
import { hitungPersenDonut } from "@/lib/dashboard-donut";
import {
  CartIcon,
  PurchaseOrderIcon,
  MoneyIcon,
  UsersIcon,
} from "@/components/icons/PageIcons";
import { canAccessPath } from "@/components/menuConfig";
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
    LUNAS:
      "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300",
    AKTIF:
      "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
    SEBAGIAN:
      "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
    MENUNGGU: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700",
    PROSES: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
    SELESAI:
      "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300",
    KILAT: "bg-red-100 dark:bg-red-900/30 text-red-700",
    NORMAL: "bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300",
  };
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-sm font-semibold ${colors[status] || "bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300"}`}
    >
      {status}
    </span>
  );
}

function DashboardHeader({ user }: { user: User | null }) {
  return (
    <div className="bg-gradient-to-r from-[#00afef] to-[#2266ff] rounded-2xl shadow-lg px-6 py-4 text-white flex items-center justify-between">
      <div className="min-w-0">
        <h2 className="text-xl sm:text-2xl font-bold font-twcenmt truncate">
          Selamat Datang,{" "}
          {user?.nama_lengkap || user?.nama_pengguna || "Pengguna"}!
        </h2>
        <p className="text-white/90 text-base">
          <span className="font-bauhaus italic">
            <span className="text-white">gemi</span>
            <span className="text-white/80">print</span>
          </span>{" "}
          — Sistem Manajemen Percetakan
        </p>
      </div>
      <div className="hidden md:block shrink-0">
        <Image
          src="/assets/images/logo-gemiprint-white.svg"
          alt="gemiprint"
          width={56}
          height={56}
          className="opacity-40"
        />
      </div>
    </div>
  );
}

function QuickActions({ user }: { user: User | null }) {
  const actions: Array<{
    label: string;
    href: string;
    Icon: (p: { size?: number; className?: string }) => React.ReactNode;
    gradient: string;
  }> = [
    {
      label: "Kasir",
      href: "/pos",
      Icon: CartIcon,
      gradient: "from-[#00afef] to-[#2266ff]",
    },
    {
      label: "Pembelian",
      href: "/pembelian",
      Icon: PurchaseOrderIcon,
      gradient: "from-[#6366f1] to-[#8b5cf6]",
    },
    {
      label: "Keuangan",
      href: "/keuangan",
      Icon: MoneyIcon,
      gradient: "from-[#ff2f91] to-orange-500",
    },
    {
      label: "Pelanggan",
      href: "/pelanggan",
      Icon: UsersIcon,
      gradient: "from-[#14b8a6] to-[#06b6d4]",
    },
  ];

  const visible = actions.filter((a) => canAccessPath(user?.role, a.href));
  if (visible.length === 0) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {visible.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          className="flex items-center gap-3 bg-white dark:bg-slate-900/40 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-2xl shadow p-4 hover:shadow-md hover:-translate-y-0.5 transition-all"
        >
          <span
            className={`bg-gradient-to-br ${a.gradient} p-2.5 rounded-xl text-white shrink-0`}
          >
            <a.Icon size={20} className="text-white" />
          </span>
          <span className="font-semibold text-gray-800 dark:text-slate-100 font-twcenmt">
            {a.label}
          </span>
        </Link>
      ))}
    </div>
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

  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const check = () =>
      setIsDark(document.documentElement.classList.contains("dark"));
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => obs.disconnect();
  }, []);

  const { data: stats, isLoading } = useCachedData<DashboardStats>(
    "dashboard-stats-v2",
    getDashboardStatsAction,
  );

  const { data: reorderData, mutate: mutateReorder } =
    useCachedData<ReorderSuggestionsResponse>(
      "dashboard-reorder-v1",
      getReorderSuggestionsAction,
    );

  // Paksa revalidasi saran restock saat Beranda ter-mount. Setelah membuat draf
  // PO dari widget ini, kita sengaja TIDAK memutasi cache di jalur navigasi
  // (balapan dengan router.push memantulkan pengguna balik ke Beranda). Sebagai
  // gantinya, saat pengguna kembali ke Beranda widget di-refresh di sini —
  // mutate() eksplisit melewati dedupingInterval SWR, jadi barang yang sudah
  // ter-cover draf langsung hilang dari daftar tanpa refresh manual.
  useEffect(() => {
    void mutateReorder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      {/* Header strip */}
      <DashboardHeader user={user} />

      {/* Quick Actions */}
      <QuickActions user={user} />

      {isLoading && !stats ? (
        <div className="flex items-center justify-center py-16">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-[#00afef] border-t-transparent" />
        </div>
      ) : stats ? (
        <>
          {/* Stat cards utama */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Omzet Hari Ini"
              value={fmtCurrency(stats.todayRevenue)}
              icon="trending"
              gradient="from-[#00afef] to-[#2266ff]"
            />
            <StatCard
              title="Transaksi Hari Ini"
              value={String(stats.todaySalesCount)}
              subtitle="penjualan"
              icon="receipt"
              gradient="from-emerald-500 to-teal-600"
            />
            <StatCard
              title="Saldo Kas"
              value={fmtCurrency(stats.saldo)}
              icon="wallet"
              gradient="from-amber-500 to-orange-500"
            />
            <StatCard
              title="Piutang Aktif"
              value={fmtCurrency(stats.totalPiutang)}
              subtitle={`${stats.activePiutang} transaksi`}
              icon="warning"
              gradient="from-[#ff2f91] to-[#0a1b3d]"
            />
          </div>

          {/* Analitik + Donut */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Tren Penjualan (kiri, lebih lebar) */}
            <div className="lg:col-span-2 bg-white dark:bg-slate-900/40 backdrop-blur-sm border border-white/30 dark:border-slate-700 rounded-2xl shadow p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-800 dark:text-slate-100 font-twcenmt">
                  Tren Penjualan
                </h3>
                <div className="flex gap-1">
                  {([7, 14, 30] as const).map((d) => (
                    <button
                      key={d}
                      onClick={() => setTrendDays(d)}
                      className={`px-3 py-1 rounded-lg text-sm font-semibold transition-all ${
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
                isDark={isDark}
              />
            </div>

            {/* Donut omzet (kanan) */}
            <RevenueDonut trend={stats.dailySalesTrend ?? []} isDark={isDark} />
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
                  className="text-base text-[#00afef] hover:underline font-semibold"
                >
                  Lihat Semua
                </Link>
              </div>
              {stats.recentSales.length === 0 ? (
                <p className="text-gray-400 text-base py-4 text-center">
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
                        <p className="font-semibold text-base text-gray-800 dark:text-slate-100">
                          {s.pelangganNama}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-slate-400">
                          {fmtTime(s.dibuatPada)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-base text-gray-800 dark:text-slate-100">
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
                <div>
                  <h3 className="font-bold text-gray-800 dark:text-slate-100 font-twcenmt">
                    Produksi Aktif
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                    Antrian: {stats.activeOrders} · Kilat: {stats.kilat}
                  </p>
                </div>
                <Link
                  href="/produksi"
                  className="text-base text-[#00afef] hover:underline font-semibold"
                >
                  Lihat Semua
                </Link>
              </div>
              {stats.recentOrders.length === 0 ? (
                <p className="text-gray-400 text-base py-4 text-center">
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

function SalesTrendChart({
  data,
  days,
  isDark,
}: {
  data: DailySalesTrend[];
  days: 7 | 14 | 30;
  isDark: boolean;
}) {
  const step = days === 7 ? 2 : days === 14 ? 3 : 5;
  const tickFormatter = (_: string, index: number) =>
    index % step === 0 ? (data[index]?.date ?? "") : "";

  const gridColor = isDark ? "#334155" : "#e5e7eb";
  const tickColor = isDark ? "#94a3b8" : "#6b7280";
  const labelColor = isDark ? "#e2e8f0" : "#111827";
  const tooltipBorder = isDark ? "#475569" : "#e5e7eb";

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="omzetGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#00afef" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#00afef" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: tickColor }}
          tickFormatter={tickFormatter}
          interval={0}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={fmtCurrencyShort}
          tick={{ fontSize: 11, fill: tickColor }}
          axisLine={false}
          tickLine={false}
          width={48}
        />
        <Tooltip
          formatter={
            ((value: number | string) => {
              const n = Number(value);
              return [
                new Intl.NumberFormat("id-ID", {
                  style: "currency",
                  currency: "IDR",
                  minimumFractionDigits: 0,
                }).format(n),
                "Omzet",
              ];
            }) as any
          }
          labelStyle={{ fontWeight: 600, color: labelColor }}
          contentStyle={{
            borderRadius: 10,
            border: `1px solid ${tooltipBorder}`,
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

function RevenueDonut({
  trend,
  isDark,
}: {
  trend: DailySalesTrend[];
  isDark: boolean;
}) {
  const n = trend.length;
  const hariIni = n > 0 ? trend[n - 1].omzet : 0;
  const kemarin = n > 1 ? trend[n - 2].omzet : 0;
  const persen = hitungPersenDonut(hariIni, kemarin);
  const terisi = Math.min(persen, 100);
  const data = [
    { name: "terisi", value: terisi },
    { name: "sisa", value: Math.max(100 - terisi, 0) },
  ];

  return (
    <div className="bg-white dark:bg-slate-900/40 backdrop-blur-sm border border-white/30 dark:border-slate-700 rounded-2xl shadow p-5 flex flex-col">
      <h3 className="font-bold text-gray-800 dark:text-slate-100 font-twcenmt mb-2">
        Omzet Hari Ini
      </h3>
      <div className="relative flex-1 min-h-[160px]">
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              innerRadius={55}
              outerRadius={75}
              startAngle={90}
              endAngle={-270}
              stroke="none"
            >
              <Cell fill="#00afef" />
              <Cell fill={isDark ? "#1e293b" : "#e5e7eb"} />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-bold text-[#00afef] font-twcenmt">
            {persen}%
          </span>
          <span className="text-xs text-gray-500 dark:text-slate-400">
            vs kemarin
          </span>
        </div>
      </div>
      <div className="mt-3 space-y-1 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-gray-500 dark:text-slate-400">Hari ini</span>
          <span className="font-semibold text-gray-800 dark:text-slate-100">
            {fmtCurrency(hariIni)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-500 dark:text-slate-400">Kemarin</span>
          <span className="font-semibold text-gray-800 dark:text-slate-100">
            {fmtCurrency(kemarin)}
          </span>
        </div>
      </div>
    </div>
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
        vendorIds ?? undefined,
      );
      if (result.created.length > 0) {
        // Navigasi ke Pesanan Pembelian. JANGAN panggil onChanged() di sini:
        // mutateReorder() pada tick yang sama dengan router.push() akan
        // me-render ulang ReorderWidget (yang masih ter-mount) dan membatalkan
        // transisi soft navigation App Router, sehingga navigasi tidak pernah
        // commit (server "rendering..." tak berhenti, pengguna tetap di Beranda).
        // Cache reorder Beranda otomatis di-revalidate saat kembali ke Beranda
        // (revalidateIfStale + revalidateOnFocus di SwrProvider).
        router.push("/pesanan-pembelian");
      } else {
        setError(
          "Tidak ada draf pesanan pembelian yang dibuat. Pastikan vendor sudah aktif.",
        );
        onChanged(); // tetap di Beranda: refresh widget (stok mungkin berubah oleh action)
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Gagal membuat draf pesanan pembelian",
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
            {generating === "all"
              ? "Membuat..."
              : `Buat Semua (${vendorGroups.length})`}
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
                      Belum ada riwayat pembelian. Buat pesanan pembelian
                      manual.
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

type StatIconName = "receipt" | "trending" | "wallet" | "warning";

function StatCard({
  title,
  value,
  subtitle,
  icon,
  gradient,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: StatIconName;
  gradient: string;
}) {
  const iconMap: Record<StatIconName, string> = {
    receipt:
      "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
    trending: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6",
    wallet:
      "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z",
    warning:
      "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
  };

  return (
    <div
      className={`bg-gradient-to-br ${gradient} rounded-2xl shadow-lg p-5 text-white`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-white/80 font-twcenmt">{title}</p>
          <p className="text-2xl font-bold font-twcenmt truncate">{value}</p>
          {subtitle && (
            <p className="text-xs text-white/70 mt-0.5">{subtitle}</p>
          )}
        </div>
        <span className="bg-white/20 rounded-lg p-2 shrink-0">
          <svg
            className="w-6 h-6 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={1.8}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d={iconMap[icon]}
            />
          </svg>
        </span>
      </div>
    </div>
  );
}
