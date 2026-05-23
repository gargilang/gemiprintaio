"use client";

import { useState, useEffect } from "react";
import { isTauriApp } from "@/lib/client-utils";
import { getPendingSyncCountAction } from "@/app/settings/actions";
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

export default function SyncStatus({ className = "" }: SyncStatusProps) {
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [pendingOps, setPendingOps] = useState(0);
  const [isTauri, setIsTauri] = useState(false);
  const [cloudConnected, setCloudConnected] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check if running in Tauri
    const tauri = isTauriApp();
    setIsTauri(tauri);

    // Web mode: skip all polling. The widget renders nothing and there's
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

    // Check pending operations
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

    // Initial check
    checkOnline();
    checkPending();
    checkCloudStatus();

    // Listen for online/offline events
    window.addEventListener("online", checkOnline);
    window.addEventListener("offline", checkOnline);

    // Check pending operations periodically
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
      console.log("Sync result:", result);
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
            ? "bg-green-100 text-green-700 border border-green-200"
            : "bg-red-100 text-red-700 border border-red-200"
        }`}
      >
        {cloudConnected ? "Online" : "Mode Offline"}
      </div>

      {pendingOps > 0 && (
        <span className="text-xs text-gray-600">
          {pendingOps} perubahan menunggu sinkron
        </span>
      )}

      <button
        onClick={handleSync}
        disabled={!cloudConnected || isSyncing}
        className="px-3 py-1 text-xs bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSyncing ? "Menyinkronkan..." : "Sinkronkan"}
      </button>

      {lastSync && (
        <span className="text-xs text-gray-500">
          Sinkron terakhir: {formatLastSyncDayDate(lastSync)}
        </span>
      )}

      <span className="text-xs text-gray-400">
        {isTauri ? "Desktop" : "Web"}
      </span>
    </div>
  );
}
