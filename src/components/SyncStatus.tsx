"use client";

import { useState, useEffect } from "react";
import { isTauriApp } from "@/lib/client-utils";
import {
  getPendingSyncCountAction,
  syncToCloudAction,
  processOfflineQueueAction,
} from "@/app/settings/actions";

interface SyncStatusProps {
  className?: string;
}

export default function SyncStatus({ className = "" }: SyncStatusProps) {
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [pendingOps, setPendingOps] = useState(0);
  const [isTauri, setIsTauri] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check if running in Tauri
    setIsTauri(isTauriApp());

    // Check online status
    const checkOnline = () => {
      setIsOnline(navigator.onLine);
    };

    // Check pending operations
    const checkPending = async () => {
      try {
        const count = await getPendingSyncCountAction();
        setPendingOps(count);
      } catch (error) {
        console.error("Failed to get pending sync count:", error);
        setPendingOps(0);
      }
    };

    // Initial check
    checkOnline();
    checkPending();

    // Listen for online/offline events
    window.addEventListener("online", checkOnline);
    window.addEventListener("offline", checkOnline);

    // Check pending operations periodically
    const interval = setInterval(checkPending, 5000);

    return () => {
      window.removeEventListener("online", checkOnline);
      window.removeEventListener("offline", checkOnline);
      clearInterval(interval);
    };
  }, []);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      if (isTauriApp()) {
        // Sync SQLite to Supabase
        const result = await syncToCloudAction();
        console.log("Sync result:", result);
      } else {
        // Process offline queue
        const result = await processOfflineQueueAction();
        console.log("Queue processed:", result);
      }
      setLastSync(new Date());
      setPendingOps(0);
    } catch (error) {
      console.error("Sync failed:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  // Don't show in SSR
  if (typeof window === "undefined") return null;

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Online Status Indicator */}
      <div className="flex items-center gap-2">
        <div
          className={`w-2 h-2 rounded-full ${
            isOnline ? "bg-green-500" : "bg-red-500"
          } ${isOnline ? "animate-pulse" : ""}`}
        />
        <span className="text-sm text-gray-600">
          {isOnline ? "Online" : "Offline"}
        </span>
      </div>

      {/* Pending Operations */}
      {pendingOps > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-amber-600">{pendingOps} pending</span>
          <button
            onClick={handleSync}
            disabled={!isOnline || isSyncing}
            className="px-3 py-1 text-xs bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSyncing ? "Syncing..." : "Sync Now"}
          </button>
        </div>
      )}

      {/* Last Sync Time */}
      {lastSync && (
        <span className="text-xs text-gray-500">
          Last sync: {lastSync.toLocaleTimeString()}
        </span>
      )}

      {/* Tauri/Web Mode Indicator */}
      <span className="text-xs text-gray-400">
        {isTauri ? "Desktop" : "Web"}
      </span>
    </div>
  );
}
