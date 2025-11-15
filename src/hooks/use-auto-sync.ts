"use client";

import { useEffect, useRef } from "react";

/**
 * Auto-sync hook to process pending operations when connection is restored
 * This hook monitors online/offline status and triggers sync when coming back online
 */
export function useAutoSync() {
  const syncingRef = useRef(false);
  const lastSyncRef = useRef<number>(0);

  useEffect(() => {
    const handleOnline = async () => {
      // Prevent multiple simultaneous syncs
      if (syncingRef.current) {
        console.log("🔄 Sync already in progress, skipping...");
        return;
      }

      // Rate limit: don't sync more than once per 5 seconds
      const now = Date.now();
      if (now - lastSyncRef.current < 5000) {
        console.log("⏱️ Rate limited, skipping sync");
        return;
      }

      console.log("🌐 Connection restored, triggering auto-sync...");
      syncingRef.current = true;
      lastSyncRef.current = now;

      try {
        const response = await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "process-queue" }),
        });

        if (response.ok) {
          const result = await response.json();
          console.log("✅ Auto-sync completed:", result);
        } else {
          console.error("❌ Auto-sync failed:", await response.text());
        }
      } catch (error) {
        console.error("❌ Auto-sync error:", error);
      } finally {
        syncingRef.current = false;
      }
    };

    const handleOffline = () => {
      console.log("📴 Connection lost, operations will be queued");
    };

    // Listen to online/offline events
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Trigger initial sync if online
    if (navigator.onLine) {
      console.log("🌐 App started while online, checking for pending syncs...");
      handleOnline();
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);
}
