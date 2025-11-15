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
  return "__TAURI__" in window;
}

/**
 * Check if browser is online
 */
export function isOnline(): boolean {
  if (!isBrowser()) return true;
  return navigator.onLine;
}
