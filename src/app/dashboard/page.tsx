"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  fetchSessionUser,
  getCachedSessionUser,
} from "@/lib/client-session";
import { useCachedData } from "@/lib/use-cached-data";
import { getDashboardStatsAction, type DashboardStats } from "./actions";

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
    LUNAS: "bg-emerald-100 text-emerald-700",
    AKTIF: "bg-amber-100 text-amber-700",
    SEBAGIAN: "bg-blue-100 text-blue-700",
    MENUNGGU: "bg-yellow-100 text-yellow-700",
    PROSES: "bg-blue-100 text-blue-700",
    SELESAI: "bg-emerald-100 text-emerald-700",
    KILAT: "bg-red-100 text-red-700",
    NORMAL: "bg-gray-100 text-gray-600",
  };
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${colors[status] || "bg-gray-100 text-gray-600"}`}
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
    "dashboard-stats",
    getDashboardStatsAction
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
          {/* Stats Row: Hari Ini */}
          <div>
            <h3 className="text-lg font-bold text-gray-800 mb-3 font-twcenmt">
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

          {/* Stats Row: Produksi */}
          <div>
            <h3 className="text-lg font-bold text-gray-800 mb-3 font-twcenmt">
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
            <div className="bg-white/40 backdrop-blur-sm border border-white/30 rounded-2xl shadow p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-800 font-twcenmt">
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
                      className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/60 border border-white/20"
                    >
                      <div>
                        <p className="font-semibold text-sm text-gray-800">
                          {s.pelangganNama}
                        </p>
                        <p className="text-xs text-gray-500">
                          {fmtTime(s.dibuatPada)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-sm text-gray-800">
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
            <div className="bg-white/40 backdrop-blur-sm border border-white/30 rounded-2xl shadow p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-800 font-twcenmt">
                  Produksi Aktif
                </h3>
                <Link
                  href="/production"
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
                      className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/60 border border-white/20"
                    >
                      <div>
                        <p className="font-semibold text-sm text-gray-800">
                          {o.nomorSpk}
                        </p>
                        <p className="text-xs text-gray-500">
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

          {/* Quick Access */}
          <div>
            <h3 className="text-lg font-bold text-gray-800 mb-3 font-twcenmt">
              Akses Cepat
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <QuickLink
                href="/pos"
                label="POS"
                icon="💳"
                color="from-[#00afef] to-[#2fd3ff]"
              />
              <QuickLink
                href="/production"
                label="Produksi"
                icon="🖨️"
                color="from-amber-500 to-amber-700"
              />
              <QuickLink
                href="/finance"
                label="Keuangan"
                icon="💰"
                color="from-emerald-500 to-emerald-700"
              />
              <QuickLink
                href="/materials"
                label="Barang"
                icon="📦"
                color="from-blue-500 to-blue-700"
              />
              <QuickLink
                href="/customers"
                label="Pelanggan"
                icon="👥"
                color="from-purple-500 to-purple-700"
              />
              <QuickLink
                href="/reports"
                label="Laporan"
                icon="📊"
                color="from-pink-500 to-pink-700"
              />
            </div>
          </div>
        </>
      ) : null}

      {/* Footer */}
      <div className="text-center pt-4 pb-2">
        <p className="text-[#6b7280] text-sm">
          <span className="font-bauhaus italic">
            <span className="text-[#00afef]">gemi</span>
            <span className="text-[#0a1b3d]">print</span>
          </span>{" "}
          — All-in-One Management System © 2025
        </p>
      </div>
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
    cyan: { bg: "bg-cyan-50", text: "text-[#00afef]", icon: "text-[#00afef]" },
    emerald: { bg: "bg-emerald-50", text: "text-emerald-600", icon: "text-emerald-500" },
    blue: { bg: "bg-blue-50", text: "text-blue-600", icon: "text-blue-500" },
    amber: { bg: "bg-amber-50", text: "text-amber-600", icon: "text-amber-500" },
    red: { bg: "bg-red-50", text: "text-red-600", icon: "text-red-500" },
  };

  const c = colorClasses[color] ?? colorClasses.cyan;

  return (
    <div className="bg-white/40 backdrop-blur-sm border border-white/30 rounded-2xl shadow p-5 flex items-start gap-4">
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
        <p className="text-sm text-gray-500 font-twcenmt">{title}</p>
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

function QuickLink({
  href,
  label,
  icon,
  color,
}: {
  href: string;
  label: string;
  icon: string;
  color: string;
}) {
  return (
    <Link
      href={href}
      className={`bg-gradient-to-br ${color} text-white rounded-xl p-4 text-center hover:shadow-lg transition-all hover:scale-[1.03] active:scale-95`}
    >
      <span className="text-2xl block mb-1">{icon}</span>
      <span className="font-semibold text-sm font-twcenmt">{label}</span>
    </Link>
  );
}
