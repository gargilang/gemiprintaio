"use client";

import { useEffect, useRef } from "react";
import { getBrowserSupabaseForTauri } from "@/lib/supabase";
import { REALTIME_PULL_ENABLED } from "@/lib/sync-config";
import {
  getAutoSyncIntervalMinutes,
  runSyncCycle as runSyncCycleClient,
} from "@/lib/sync-client";

declare global {
  interface Window {
    __gemiSyncInFlight?: boolean;
    __gemiLastSyncAt?: number;
  }
}

/**
 * Auto-sync hook to process pending operations when connection is restored
 * This hook monitors online/offline status and triggers sync when coming back online
 */
export function useAutoSync() {
  const syncingRef = useRef(false);
  const lastSyncRef = useRef<number>(0);

  useEffect(() => {
    let timer: number | null = null;
    const startIntervalSync = () => {
      if (timer) window.clearInterval(timer);
      timer = window.setInterval(() => {
        if (navigator.onLine) {
          runSyncTrigger("interval");
        }
      }, getAutoSyncIntervalMinutes() * 60 * 1000);
    };

    const runSyncTrigger = async (reason: string) => {
      // Prevent multiple simultaneous syncs
      if (syncingRef.current || window.__gemiSyncInFlight) {
        console.log("🔄 Sync already in progress, skipping...");
        return;
      }

      // Rate limit: don't sync more than once per 5 seconds
      const now = Date.now();
      const globalLastSyncAt = window.__gemiLastSyncAt || 0;
      if (now - lastSyncRef.current < 5000 || now - globalLastSyncAt < 5000) {
        console.log("⏱️ Rate limited, skipping sync");
        return;
      }

      console.log(`🔄 Triggering sync cycle (${reason})...`);
      syncingRef.current = true;
      window.__gemiSyncInFlight = true;
      lastSyncRef.current = now;
      window.__gemiLastSyncAt = now;

      try {
        const result = await runSyncCycleClient();
        if (result.success) console.log("✅ Sync cycle completed:", result);
        else console.error("❌ Sync cycle failed:", result.message);
      } catch (error) {
        console.error("❌ Sync cycle error:", error);
      } finally {
        syncingRef.current = false;
        window.__gemiSyncInFlight = false;
      }
    };

    const handleOffline = () => {
      console.log("📴 Connection lost, operations will be queued");
    };
    const handleFocus = () => {
      if (navigator.onLine) {
        runSyncTrigger("focus");
      }
    };
    const handleVisible = () => {
      if (!document.hidden && navigator.onLine) {
        runSyncTrigger("resume");
      }
    };

    const handleOnline = () => runSyncTrigger("online");

    // Listen to online/offline events
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisible);

    startIntervalSync();
    const handleStorage = (event: StorageEvent) => {
      if (event.key === "sync.auto.interval.minutes") {
        startIntervalSync();
      }
    };
    const handleIntervalUpdated = () => startIntervalSync();
    window.addEventListener("storage", handleStorage);
    window.addEventListener("sync:interval-updated", handleIntervalUpdated);

    let unsubscribeRealtime: (() => void) | null = null;
    if (REALTIME_PULL_ENABLED) {
      const tauriSupabase = getBrowserSupabaseForTauri();
      if (tauriSupabase) {
        const channel = tauriSupabase
          .channel("tauri-sync-realtime")
          .on(
            "postgres_changes",
            { event: "*", schema: "public" },
            () => runSyncTrigger("realtime")
          )
          .subscribe();
        unsubscribeRealtime = () => {
          void tauriSupabase.removeChannel(channel);
        };
      }
    }

    // Trigger initial sync if online
    if (navigator.onLine) {
      console.log("🌐 App started while online, checking for pending syncs...");
      runSyncTrigger("startup");
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisible);
      if (timer) window.clearInterval(timer);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("sync:interval-updated", handleIntervalUpdated);
      if (unsubscribeRealtime) {
        unsubscribeRealtime();
      }
    };
  }, []);
}
