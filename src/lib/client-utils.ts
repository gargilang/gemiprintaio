/**
 * Client-Safe Utility Functions
 * Functions that can safely run in the browser without server-only dependencies
 */

/**
 * Check if code is running in browser environment
 */
export function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/**
 * Check if running inside Tauri desktop app
 */
export function isTauriApp(): boolean {
  if (!isBrowser()) return false;
  const w = window as any;
  return (
    "__TAURI__" in w ||
    "__TAURI_INTERNALS__" in w ||
    "__TAURI_METADATA__" in w ||
    navigator.userAgent.includes("Tauri")
  );
}

/**
 * Check if browser is online
 */
export function isOnline(): boolean {
  if (!isBrowser()) return true;
  return navigator.onLine;
}
