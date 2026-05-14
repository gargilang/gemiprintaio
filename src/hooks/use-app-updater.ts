"use client";

import { useEffect, useRef } from "react";
import { isTauriApp } from "@/lib/client-utils";

/**
 * Checks for a new desktop release once per app session (5 min after startup).
 * If an update is available the user is shown a native dialog and can choose
 * to download + install immediately, or defer until the next restart.
 */
export function useAppUpdater() {
  const checked = useRef(false);

  useEffect(() => {
    if (!isTauriApp() || checked.current) return;
    checked.current = true;

    const timer = setTimeout(async () => {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const { ask } = await import("@tauri-apps/plugin-dialog");
        const { relaunch } = await import("@tauri-apps/plugin-process");

        const update = await check();
        if (!update?.available) return;

        const yes = await ask(
          `Versi baru tersedia: ${update.version}\n\n${update.body ?? ""}\n\nInstal sekarang?`,
          { title: "Update gemiprint", kind: "info" }
        );

        if (yes) {
          await update.downloadAndInstall();
          await relaunch();
        }
      } catch {
        // Silently ignore — no network, or updater not configured yet.
      }
    }, 5 * 60 * 1000); // 5 minutes after app load

    return () => clearTimeout(timer);
  }, []);
}
