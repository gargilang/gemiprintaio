"use client";

import { useState, useEffect } from "react";
import { isTauriApp } from "@/lib/client-utils";
import { getPendingSyncCountAction } from "@/app/pengaturan/actions";
import {
  getClientSyncStatus,
  getLastSyncSuccessAt,
  runSyncCycle,
} from "@/lib/sync-client";

interface SyncStatusProps {
  className?: string;
}

function formatLastSyncDayDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function StatusSinkronisasi({ className = "" }: SyncStatusProps) {
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [pendingOps, setPendingOps] = useState(0);
  const [isTauri, setIsTauri] = useState(false);
  const [cloudConnected, setCloudConnected] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Cek apakah jalan di Tauri
    const tauri = isTauriApp();
    setIsTauri(tauri);

    // Mode web: lewati semua polling. Widget tidak merender apa pun dan tidak ada
    // no local queue / cache to surface — Supabase is the source of truth.
    if (!tauri) return;

    setLastSync(getLastSyncSuccessAt());

    const checkOnline = () => setIsOnline(navigator.onLine);
    const checkCloudStatus = async () => {
      try {
        const response = await fetch("/api/sync");
        if (!response.ok) {
          setCloudConnected(false);
          return;
        }
        const payload = await response.json();
        setCloudConnected(payload?.cloudBackup === "connected");
      } catch {
        setCloudConnected(false);
      }
    };

    // Cek operasi yang pending
    const checkPending = async () => {
      try {
        const status = getClientSyncStatus(
          lastSync
        );
        let count = status.pendingChanges;
        if (isTauriApp()) {
          count = await getPendingSyncCountAction();
        }
        setPendingOps(count);
      } catch (error) {
        console.error("Failed to get pending sync count:", error);
        setPendingOps(0);
      }
    };

    // Cek awal
    checkOnline();
    checkPending();
    checkCloudStatus();

    // Dengarkan event online/offline
    window.addEventListener("online", checkOnline);
    window.addEventListener("offline", checkOnline);

    // Cek operasi yang pending periodically
    const interval = setInterval(() => {
      checkPending();
      checkCloudStatus();
    }, 5000);

    return () => {
      window.removeEventListener("online", checkOnline);
      window.removeEventListener("offline", checkOnline);
      clearInterval(interval);
    };
  }, [lastSync]);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const result = await runSyncCycle();
      console.debug("Sync result:", result);
      setLastSync(getLastSyncSuccessAt());
      const status = getClientSyncStatus(getLastSyncSuccessAt());
      setPendingOps(status.pendingChanges);
    } catch (error) {
      console.error("Sync failed:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  // Don't show in SSR
  if (typeof window === "undefined") return null;

  // Web users (Vercel / localhost browser) write directly to Supabase via
  // server actions — there is no local queue, no offline cache, and no
  // sync cycle to surface. Hide the widget entirely. The Tauri desktop
  // build still shows it because SQLite ↔ Supabase sync is meaningful there.
  if (!isTauri) return null;

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div
        className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
          cloudConnected
            ? "bg-green-100 text-green-700 border border-green-200 dark:bg-green-500/15 dark:text-green-300 dark:border-green-700/50"
            : "bg-red-100 text-red-700 border border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-700/50"
        }`}
      >
        {cloudConnected ? "Online" : "Mode Offline"}
      </div>

      {pendingOps > 0 && (
        <span className="text-xs text-gray-600 dark:text-slate-300">
          {pendingOps} perubahan menunggu sinkron
        </span>
      )}

      <button
        onClick={handleSync}
        disabled={!cloudConnected || isSyncing}
        className="px-3 py-1 text-xs bg-amber-50 dark:bg-slate-8000 text-white rounded hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSyncing ? "Menyinkronkan..." : "Sinkronkan"}
      </button>

      {lastSync && (
        <span className="text-xs text-gray-500 dark:text-slate-400">
          Sinkron terakhir: {formatLastSyncDayDate(lastSync)}
        </span>
      )}

      <span className="text-xs text-gray-400 dark:text-slate-500">
        {isTauri ? "Desktop" : "Web"}
      </span>
    </div>
  );
}
