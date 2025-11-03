/**
 * Tauri Helper Utilities
 * Provides compatibility layer between Tauri and Node.js environments
 */

/**
 * Check if app is running in Tauri desktop environment
 */
export function isTauriApp(): boolean {
  if (typeof window === "undefined") {
    return false; // Server-side
  }
  return "__TAURI__" in window;
}

/**
 * Check if running in development mode (Node.js/Next.js dev server)
 */
export function isDevMode(): boolean {
  return process.env.NODE_ENV === "development" && !isTauriApp();
}

/**
 * Get appropriate API endpoint
 * @param path API path (e.g., '/sync', '/users')
 */
export function getApiEndpoint(path: string): string {
  if (isTauriApp()) {
    // In Tauri, no API routes - use Tauri commands instead
    return "";
  }
  return `/api${path}`;
}

/**
 * Unified function to call either Tauri command or Next.js API route
 * @param commandName Command/endpoint name
 * @param args Arguments to pass
 */
export async function invokeOrFetch(
  commandName: string,
  args?: any
): Promise<any> {
  if (isTauriApp()) {
    // Use Tauri command
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke(commandName, args);
  } else {
    // Fallback to API route for development
    const response = await fetch(`/api/${commandName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args || {}),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    return await response.json();
  }
}

/**
 * Get app data directory path
 * In Tauri: Uses system app data folder
 * In Node.js: Uses process.cwd()/database
 */
export async function getAppDataDir(): Promise<string> {
  if (isTauriApp()) {
    const { appDataDir } = await import("@tauri-apps/api/path");
    return await appDataDir();
  } else {
    // Development mode - use project directory
    return process.cwd();
  }
}

/**
 * Read text file
 * In Tauri: Uses Tauri FS API
 * In Node.js: Uses fs module
 */
export async function readTextFile(filePath: string): Promise<string> {
  if (isTauriApp()) {
    const { readTextFile: tauriRead } = await import("@tauri-apps/plugin-fs");
    return await tauriRead(filePath);
  } else {
    // Development mode
    const fs = require("fs");
    return fs.readFileSync(filePath, "utf-8");
  }
}

/**
 * Write text file
 */
export async function writeTextFile(
  filePath: string,
  content: string
): Promise<void> {
  if (isTauriApp()) {
    const { writeTextFile: tauriWrite } = await import("@tauri-apps/plugin-fs");
    await tauriWrite(filePath, content);
  } else {
    const fs = require("fs");
    fs.writeFileSync(filePath, content, "utf-8");
  }
}

/**
 * Check if file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  if (isTauriApp()) {
    const { exists } = await import("@tauri-apps/plugin-fs");
    return await exists(filePath);
  } else {
    const fs = require("fs");
    return fs.existsSync(filePath);
  }
}

/**
 * Create directory
 */
export async function createDir(dirPath: string): Promise<void> {
  if (isTauriApp()) {
    const { mkdir } = await import("@tauri-apps/plugin-fs");
    await mkdir(dirPath, { recursive: true });
  } else {
    const fs = require("fs");
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Show native notification
 */
export async function showNotification(
  title: string,
  message: string
): Promise<void> {
  if (isTauriApp()) {
    const { sendNotification } = await import(
      "@tauri-apps/plugin-notification"
    );
    await sendNotification({ title, body: message });
  } else {
    // Fallback to browser notification API
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body: message });
    } else {
      console.log(`Notification: ${title} - ${message}`);
    }
  }
}

/**
 * Get platform info
 */
export async function getPlatform(): Promise<string> {
  if (isTauriApp()) {
    const { platform } = await import("@tauri-apps/plugin-os");
    return await platform();
  } else {
    return process.platform || "unknown";
  }
}

/**
 * Open external URL
 */
export async function openExternal(url: string): Promise<void> {
  if (isTauriApp()) {
    const { open } = await import("@tauri-apps/plugin-shell");
    await open(url);
  } else {
    window.open(url, "_blank");
  }
}

/**
 * Get app version
 */
export async function getAppVersion(): Promise<string> {
  if (isTauriApp()) {
    const { getVersion } = await import("@tauri-apps/api/app");
    return await getVersion();
  } else {
    return process.env.NEXT_PUBLIC_APP_VERSION || "1.0.0";
  }
}

/**
 * Check for updates (Tauri only)
 */
export async function checkForUpdates(): Promise<any> {
  if (!isTauriApp()) {
    return {
      available: false,
      message: "Updates only available in desktop app",
    };
  }

  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();

    if (update?.available) {
      return {
        available: true,
        version: update.version,
        currentVersion: update.currentVersion,
        install: async () => {
          if (update.downloadAndInstall) {
            await update.downloadAndInstall();
          }
        },
      };
    }

    return { available: false };
  } catch (error) {
    console.error("Update check failed:", error);
    return { available: false, error };
  }
}

/**
 * Log to console (with Tauri-specific handling)
 */
export function log(
  level: "info" | "warn" | "error",
  message: string,
  data?: any
): void {
  const logMessage = data ? `${message} ${JSON.stringify(data)}` : message;

  switch (level) {
    case "info":
      console.log(`[${level.toUpperCase()}]`, logMessage);
      break;
    case "warn":
      console.warn(`[${level.toUpperCase()}]`, logMessage);
      break;
    case "error":
      console.error(`[${level.toUpperCase()}]`, logMessage);
      break;
  }
}

/**
 * Save to local storage (with fallback)
 */
export function saveToStorage(key: string, value: any): void {
  try {
    if (typeof window !== "undefined") {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch (error) {
    log("error", "Failed to save to storage", { key, error });
  }
}

/**
 * Load from local storage
 */
export function loadFromStorage<T>(key: string, defaultValue?: T): T | null {
  try {
    if (typeof window !== "undefined") {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue ?? null;
    }
    return defaultValue ?? null;
  } catch (error) {
    log("error", "Failed to load from storage", { key, error });
    return defaultValue ?? null;
  }
}
