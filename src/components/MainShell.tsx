"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { LogoutIcon } from "./icons/PageIcons";
import { MENU_ITEMS, PAGE_TITLE_MAP } from "./menuConfig";
import { useTauriWindowClose } from "@/hooks/useTauriWindowClose";

interface User {
  id: string;
  nama_pengguna: string;
  email: string;
  nama_lengkap?: string;
  role: string;
  aktif_status: number;
}

interface SyncStatus {
  localDb: "active" | "error";
  cloudBackup: "connected" | "disconnected" | "syncing";
  lastSyncAt: string | null;
  pendingChanges: number;
}

// Helper function to format relative time
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "baru saja";
  if (diffMins < 60) return `${diffMins} menit lalu`;
  if (diffHours < 24) return `${diffHours} jam lalu`;
  if (diffDays < 7) return `${diffDays} hari lalu`;
  return date.toLocaleDateString("id-ID");
}

export default function MainShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navRef = useRef<HTMLDivElement | null>(null);

  // Sync status state
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    localDb: "active",
    cloudBackup: "disconnected",
    lastSyncAt: null,
    pendingChanges: 0,
  });
  const [isSyncing, setIsSyncing] = useState(false);

  // Clear user session when window/app is closed (Tauri + browser)
  useTauriWindowClose();

  useEffect(() => {
    try {
      const userSession = localStorage.getItem("user");
      if (!userSession) {
        // Redirect to login if not authenticated
        setLoading(false);
        router.push("/auth/login");
        return;
      }
      const userData = JSON.parse(userSession);
      if (!userData.aktif_status) {
        localStorage.removeItem("user");
        setLoading(false);
        router.push("/auth/login");
        return;
      }
      setUser(userData);
      setLoading(false);
    } catch (e) {
      localStorage.removeItem("user");
      setLoading(false);
      router.push("/auth/login");
    }
  }, [router]);

  // Restore sidebar scroll position before paint to prevent flicker
  useLayoutEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const saved = sessionStorage.getItem("sidebarScroll");
    if (saved) el.scrollTop = parseInt(saved, 10) || 0;
  }, [pathname]);

  // Separate effect for scroll saving (doesn't depend on pathname)
  useEffect(() => {
    const key = "sidebarScroll";
    const el = navRef.current;
    if (!el) return;

    // Save scroll position continuously
    const onScroll = () => {
      sessionStorage.setItem(key, String(el.scrollTop));
    };
    el.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      el.removeEventListener("scroll", onScroll);
    };
  }, []); // Empty deps - only runs once

  // Check sync status on mount and periodically
  useEffect(() => {
    const checkSyncStatus = async () => {
      try {
        // Call API to get sync status
        const response = await fetch("/api/sync/manual");

        if (response.ok) {
          const data = await response.json();

          if (data.success && data.status) {
            setSyncStatus({
              localDb: data.status.localDb,
              cloudBackup: data.status.cloudBackup,
              lastSyncAt: data.status.lastSyncAt,
              pendingChanges: data.status.pendingChanges,
            });
          }
        } else {
          // If API fails, mark as disconnected
          setSyncStatus((prev) => ({
            ...prev,
            cloudBackup: "disconnected",
          }));
        }
      } catch (error) {
        console.error("Error checking sync status:", error);
        setSyncStatus((prev) => ({
          ...prev,
          cloudBackup: "disconnected",
        }));
      }
    };

    checkSyncStatus();

    // Check every 30 seconds
    const interval = setInterval(checkSyncStatus, 30000);

    return () => clearInterval(interval);
  }, []);

  // Manual sync handler
  const handleManualSync = async () => {
    if (isSyncing) return;

    setIsSyncing(true);
    setSyncStatus((prev) => ({ ...prev, cloudBackup: "syncing" }));

    try {
      const response = await fetch("/api/sync/manual", {
        method: "POST",
      });

      if (response.ok) {
        const data = await response.json();

        if (data.success && data.result) {
          const { synced, errors } = data.result;

          // Refresh status to get updated counts
          const statusResponse = await fetch("/api/sync/manual");
          if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            if (statusData.success && statusData.status) {
              setSyncStatus({
                localDb: statusData.status.localDb,
                cloudBackup: "connected",
                lastSyncAt: statusData.status.lastSyncAt,
                pendingChanges: statusData.status.pendingChanges,
              });
            }
          }

          // Show success notification with details
          if (synced > 0) {
            alert(
              `Sinkronisasi berhasil!\n${synced} record berhasil di-sync${
                errors > 0 ? `\n${errors} error` : ""
              }`
            );
          } else {
            alert("Tidak ada perubahan untuk di-sync.");
          }
        }
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || "Sync failed");
      }
    } catch (error) {
      console.error("Sync error:", error);
      setSyncStatus((prev) => ({ ...prev, cloudBackup: "disconnected" }));
      alert(
        "Gagal sinkronisasi. " +
          (error instanceof Error
            ? error.message
            : "Periksa koneksi internet Anda.")
      );
    } finally {
      setIsSyncing(false);
    }
  };

  const computedTitle = useMemo(() => {
    if (!pathname) return "Dashboard";
    const exact = PAGE_TITLE_MAP[pathname];
    if (exact) return exact;
    const found = Object.keys(PAGE_TITLE_MAP).find((k) =>
      pathname.startsWith(k)
    );
    return found ? PAGE_TITLE_MAP[found] : "Dashboard";
  }, [pathname]);

  const handleLogout = useCallback(() => {
    localStorage.removeItem("user");
    router.push("/auth/login");
  }, [router]);

  // Development helper: Clear session with Ctrl+Shift+L
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "L") {
        console.log("🔓 [DEV] Clearing session and redirecting to login...");
        localStorage.removeItem("user");
        router.push("/auth/login");
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [router]);

  // Don't render anything while checking auth to prevent flicker
  if (loading || !user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-white flex">
      {/* Sidebar - permanent */}
      <aside className="w-80 bg-white shadow-2xl flex-shrink-0 h-screen sticky top-0">
        <div className="p-6 h-full flex flex-col">
          {/* Logo & Brand in Sidebar (static brand) */}
          <div className="flex items-center gap-3 mb-6">
            <Image
              src="/assets/images/logo-gemiprint-default.svg"
              alt="gemiprint Logo"
              width={40}
              height={40}
              className="w-10 h-10"
            />
            <span className="font-bauhaus text-2xl tracking-wide italic">
              <span className="text-[#00afef]">gemi</span>
              <span className="text-[#0a1b3d]">print</span>
            </span>
          </div>

          {/* User Info - Moved to top */}
          <div className="mb-6">
            <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-4 border-2 border-blue-100">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#00afef] to-[#2266ff] flex items-center justify-center font-bold text-xl text-white shadow-md">
                  {user?.nama_lengkap?.charAt(0) ||
                    user?.nama_pengguna?.charAt(0) ||
                    "U"}
                </div>
                <div className="flex-1">
                  <div className="font-bold text-base text-[#0a1b3d]">
                    {user?.nama_lengkap || user?.nama_pengguna}
                  </div>
                  <div className="text-xs text-[#6b7280]">
                    @{user?.nama_pengguna}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-blue-200">
                <span className="text-xs text-[#6b7280]">Role:</span>
                <span className="text-xs font-bold text-[#00afef] uppercase px-2 py-1 bg-white rounded-md">
                  {user?.role}
                </span>
              </div>
            </div>
          </div>

          {/* Navigation Menu - card-style buttons */}
          <nav ref={navRef} className="space-y-3 flex-1 overflow-y-auto">
            {MENU_ITEMS.map((item) => {
              if (
                item.managerOnly &&
                user?.role !== "admin" &&
                user?.role !== "manager" &&
                user?.role !== "chief"
              ) {
                return null;
              }
              const active =
                pathname === item.href || pathname?.startsWith(item.href + "/");
              if (active) {
                // Active item style like Users page: gradient strip + left border accent
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-[#00afef]/10 to-[#2266ff]/10 border-l-4 border-l-[#00afef] transition-all duration-200"
                  >
                    <span className="text-[#00afef]">{item.icon}</span>
                    <span className="font-twcenmt font-semibold text-[#00afef]">
                      {item.label}
                    </span>
                  </Link>
                );
              }
              // Inactive items use card-style buttons
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group block rounded-xl border p-3 transition-all duration-200 bg-gray-50 border-gray-200 hover:bg-white hover:border-[#00afef]/60 hover:shadow-md"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all shadow-sm text-white bg-gradient-to-br ${item.color} group-hover:shadow-lg`}
                    >
                      {item.icon}
                    </div>
                    <span className="font-twcenmt font-semibold transition-colors text-[#0a1b3d] group-hover:text-[#00afef]">
                      {item.label}
                    </span>
                  </div>
                </Link>
              );
            })}
          </nav>

          {/* User Info & Logout */}
          <div className="mt-auto pt-6 border-t border-gray-200">
            <button
              onClick={handleLogout}
              className="w-full bg-gradient-to-r from-red-500 to-red-600 text-white px-4 py-3 rounded-xl hover:from-red-600 hover:to-red-700 transition-all font-semibold shadow-lg flex items-center justify-center gap-2"
            >
              <LogoutIcon size={20} />
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Content Area */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Header with indicators */}
        <header className="bg-white shadow-sm sticky top-0 z-30 border-b border-gray-200">
          <div className="px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-[#0a1b3d] font-twcenmt uppercase tracking-wide">
                {computedTitle}
              </h1>
            </div>

            <div className="flex items-center gap-3">
              {/* Local Database Indicator */}
              <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-200">
                <svg
                  className="w-4 h-4 text-gray-700"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
                  />
                </svg>
                <div className="text-left">
                  <div className="text-xs font-semibold text-gray-700">
                    Database Lokal
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                    <span className="text-[10px] text-gray-600">Aktif</span>
                  </div>
                </div>
              </div>

              {/* Cloud Backup Indicator */}
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${
                  syncStatus.cloudBackup === "connected"
                    ? "bg-blue-50 border-blue-200"
                    : syncStatus.cloudBackup === "syncing"
                    ? "bg-amber-50 border-amber-200"
                    : "bg-gray-50 border-gray-200"
                }`}
              >
                {syncStatus.cloudBackup === "syncing" ? (
                  <svg
                    className="w-4 h-4 text-amber-600 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                ) : (
                  <svg
                    className={`w-4 h-4 ${
                      syncStatus.cloudBackup === "connected"
                        ? "text-blue-600"
                        : "text-gray-400"
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
                    />
                  </svg>
                )}
                <div className="text-left">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-xs font-semibold ${
                        syncStatus.cloudBackup === "connected"
                          ? "text-blue-700"
                          : syncStatus.cloudBackup === "syncing"
                          ? "text-amber-700"
                          : "text-gray-500"
                      }`}
                    >
                      Cloud Backup
                    </span>
                    {syncStatus.pendingChanges > 0 && (
                      <span className="px-1.5 py-0.5 text-[9px] font-bold bg-orange-500 text-white rounded-full">
                        {syncStatus.pendingChanges}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <div
                      className={`w-1.5 h-1.5 rounded-full ${
                        syncStatus.cloudBackup === "connected"
                          ? "bg-blue-500"
                          : syncStatus.cloudBackup === "syncing"
                          ? "bg-amber-500"
                          : "bg-gray-400"
                      }`}
                    ></div>
                    <span
                      className={`text-[10px] ${
                        syncStatus.cloudBackup === "connected"
                          ? "text-blue-600"
                          : syncStatus.cloudBackup === "syncing"
                          ? "text-amber-600"
                          : "text-gray-500"
                      }`}
                    >
                      {syncStatus.cloudBackup === "connected"
                        ? syncStatus.lastSyncAt
                          ? `Sync ${formatRelativeTime(syncStatus.lastSyncAt)}`
                          : "Tersambung"
                        : syncStatus.cloudBackup === "syncing"
                        ? "Sinkronisasi..."
                        : "Tidak Aktif"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Manual Sync Button */}
              <button
                onClick={handleManualSync}
                disabled={
                  isSyncing || syncStatus.cloudBackup === "disconnected"
                }
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border font-semibold text-xs transition-all ${
                  isSyncing || syncStatus.cloudBackup === "disconnected"
                    ? "bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed"
                    : "bg-blue-500 border-blue-600 text-white hover:bg-blue-600 hover:shadow-md active:scale-95"
                }`}
                title={
                  syncStatus.cloudBackup === "disconnected"
                    ? "Cloud backup tidak tersedia"
                    : "Sinkronisasi manual ke cloud"
                }
              >
                <svg
                  className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                <span>{isSyncing ? "Sync..." : "Sync"}</span>
              </button>
            </div>
          </div>
        </header>

        <main className="px-4 sm:px-6 lg:px-8 py-8 max-w-7xl mx-auto flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
