"use client";

import { useEffect } from "react";

/**
 * Custom hook to handle Tauri window close event
 * Clears localStorage and sessionStorage when app is closed
 */
export function useTauriWindowClose() {
  useEffect(() => {
    // Only run on client side
    if (typeof window === "undefined") return;

    // Check if running in Tauri
    const isTauri = "__TAURI__" in window;

    let cleanupFn: (() => void) | undefined;

    if (isTauri) {
      // Import Tauri event API dynamically
      import("@tauri-apps/api/event")
        .then(async ({ listen }) => {
          // Listen for window close event
          const unlisten = await listen("tauri://close-requested", () => {
            console.log("Tauri window closing - clearing user session...");
            localStorage.removeItem("user");
            sessionStorage.clear();
          });

          cleanupFn = unlisten;
        })
        .catch((error) => {
          console.error("Failed to setup Tauri window close listener:", error);
        });
    }

    // Fallback for browser: use beforeunload
    const handleBeforeUnload = () => {
      console.log("Window unloading - clearing user session...");
      localStorage.removeItem("user");
      sessionStorage.clear();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (cleanupFn) cleanupFn();
    };
  }, []);
}
