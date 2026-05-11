"use client";

import { useEffect } from "react";
import { logoutSession } from "@/lib/client-session";

/**
 * Tauri: end server session when the desktop window close is requested.
 * Browser: session persists across reloads (HTTP-only cookie).
 */
export function useTauriWindowClose() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const isTauri = "__TAURI__" in window;

    let cleanupFn: (() => void) | undefined;

    if (isTauri) {
      import("@tauri-apps/api/event")
        .then(async ({ listen }) => {
          const unlisten = await listen("tauri://close-requested", () => {
            void logoutSession();
          });
          cleanupFn = unlisten;
        })
        .catch((error) => {
          console.error("Failed to setup Tauri window close listener:", error);
        });
    }

    return () => {
      if (cleanupFn) cleanupFn();
    };
  }, []);
}
