"use client";

import { isTauriApp } from "./client-utils";

const AUTO_SYNC_INTERVAL_KEY = "sync.auto.interval.minutes";
const DEFAULT_INTERVAL_MINUTES = 20;
const MIN_INTERVAL_MINUTES = 5;
const MAX_INTERVAL_MINUTES = 1440;
const OFFLINE_QUEUE_KEY = "offline_queue";
const LAST_SYNC_SUCCESS_KEY = "sync.last.success.at";
const MAX_WEB_RETRY_ATTEMPTS = 8;
const BASE_RETRY_MS = 5000;
const MAX_RETRY_MS = 5 * 60 * 1000;

export interface ClientSyncStatus {
  isOnline: boolean;
  mode: "tauri" | "web";
  cloudBackup: "connected" | "disconnected" | "syncing";
  pendingChanges: number;
  lastSyncAt: string | null;
  intervalMinutes: number;
}

function canUseBrowserStorage() {
  return typeof window !== "undefined";
}

function clampInterval(minutes: number): number {
  if (!Number.isFinite(minutes)) return DEFAULT_INTERVAL_MINUTES;
  return Math.min(MAX_INTERVAL_MINUTES, Math.max(MIN_INTERVAL_MINUTES, Math.floor(minutes)));
}

export function getAutoSyncIntervalMinutes(): number {
  if (!canUseBrowserStorage()) return DEFAULT_INTERVAL_MINUTES;
  const raw = localStorage.getItem(AUTO_SYNC_INTERVAL_KEY);
  const parsed = raw ? Number(raw) : DEFAULT_INTERVAL_MINUTES;
  return clampInterval(parsed);
}

export function setAutoSyncIntervalMinutes(minutes: number): number {
  const normalized = clampInterval(minutes);
  if (canUseBrowserStorage()) {
    localStorage.setItem(AUTO_SYNC_INTERVAL_KEY, String(normalized));
    window.dispatchEvent(
      new CustomEvent("sync:interval-updated", { detail: { minutes: normalized } })
    );
  }
  return normalized;
}

export function getOfflineQueueCount(): number {
  if (!canUseBrowserStorage() || isTauriApp()) return 0;
  try {
    const queue = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!queue) return 0;
    const parsed = JSON.parse(queue);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

export function getLastSyncSuccessAt(): string | null {
  if (!canUseBrowserStorage()) return null;
  return localStorage.getItem(LAST_SYNC_SUCCESS_KEY);
}

function setLastSyncSuccessAt(value: string) {
  if (!canUseBrowserStorage()) return;
  localStorage.setItem(LAST_SYNC_SUCCESS_KEY, value);
}

function computeRetryDelayMs(attempts: number): number {
  return Math.min(MAX_RETRY_MS, BASE_RETRY_MS * Math.pow(2, Math.max(0, attempts - 1)));
}

async function syncWebOfflineQueue(): Promise<{ synced: number; failed: number }> {
  if (!canUseBrowserStorage()) return { synced: 0, failed: 0 };

  let queue: any[] = [];
  try {
    queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]");
  } catch {
    queue = [];
  }
  if (!Array.isArray(queue) || queue.length === 0) return { synced: 0, failed: 0 };

  const now = Date.now();
  const due: any[] = [];
  const deferred: any[] = [];
  for (const rawOp of queue) {
    const op = rawOp || {};
    const nextRetryAt = typeof op.nextRetryAt === "number" ? op.nextRetryAt : 0;
    if (nextRetryAt > now) {
      deferred.push(op);
      continue;
    }
    due.push(op);
  }

  if (due.length === 0) {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(deferred));
    return { synced: 0, failed: 0 };
  }

  try {
    const response = await fetch("/api/sync/offline-queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ queue: due }),
    });

    if (!response.ok) {
      localStorage.setItem(
        OFFLINE_QUEUE_KEY,
        JSON.stringify([...deferred, ...due])
      );
      return { synced: 0, failed: getOfflineQueueCount() };
    }

    const payload = await response.json();
    const remainingFromServer = Array.isArray(payload.remaining)
      ? payload.remaining
      : [];

    const withBackoff = remainingFromServer.map((op: any) => {
      const attempts = Number(op.attempts || 0);
      const delay =
        attempts < MAX_WEB_RETRY_ATTEMPTS
          ? computeRetryDelayMs(attempts)
          : MAX_RETRY_MS;
      return { ...op, nextRetryAt: Date.now() + delay };
    });

    const mergedRemaining = [...deferred, ...withBackoff];
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(mergedRemaining));

    return {
      synced: Number(payload.synced || 0),
      failed: Number(payload.failed || 0),
    };
  } catch {
    localStorage.setItem(
      OFFLINE_QUEUE_KEY,
      JSON.stringify([...deferred, ...due])
    );
    return { synced: 0, failed: getOfflineQueueCount() };
  }
}

export async function runSyncCycle(): Promise<{
  success: boolean;
  synced: number;
  pulled: number;
  failed: number;
  message: string;
}> {
  if (typeof window === "undefined") {
    return { success: false, synced: 0, pulled: 0, failed: 1, message: "Not in browser context" };
  }

  // Web flow:
  // 1) push browser offline queue
  // 2) let server process local fallback queue if any
  // 3) pull latest cloud rows to local mirror
  const webPush = await syncWebOfflineQueue();
  let serverSynced = 0;
  let serverFailed = 0;
  let pulled = 0;

  try {
    const response = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "process-queue" }),
    });
    if (response.ok) {
      const payload = await response.json();
      serverSynced = Number(payload?.synced || 0);
      serverFailed = Number(payload?.failed || 0);
    } else {
      serverFailed++;
    }
  } catch {
    serverFailed++;
  }

  try {
    const pullResponse = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "pull" }),
    });
    if (pullResponse.ok) {
      const payload = await pullResponse.json();
      pulled = Number(payload?.pulled || 0);
      serverFailed += Number(payload?.failed || 0);
    } else {
      serverFailed++;
    }
  } catch {
    serverFailed++;
  }

  const synced = webPush.synced + serverSynced;
  const failed = webPush.failed + serverFailed;
  if (synced > 0 || pulled > 0) {
    setLastSyncSuccessAt(new Date().toISOString());
  }
  return {
    success: failed === 0,
    synced,
    pulled,
    failed,
    message: `web_queue=${webPush.synced}/${webPush.failed}, server_queue=${serverSynced}, pull=${pulled}, failed=${failed}`,
  };
}

export async function runPullOnlyCycle(): Promise<{
  success: boolean;
  pulled: number;
  failed: number;
  message: string;
}> {
  if (typeof window === "undefined") {
    return { success: false, pulled: 0, failed: 1, message: "Not in browser context" };
  }

  try {
    const response = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "pull" }),
    });
    if (!response.ok) {
      return { success: false, pulled: 0, failed: 1, message: "Gagal menarik data cloud" };
    }
    const payload = await response.json();
    const pulled = Number(payload?.pulled || 0);
    const failed = Number(payload?.failed || 0);
    if (failed === 0) setLastSyncSuccessAt(new Date().toISOString());
    return {
      success: failed === 0,
      pulled,
      failed,
      message: payload?.message || `pull=${pulled}, failed=${failed}`,
    };
  } catch (error) {
    return {
      success: false,
      pulled: 0,
      failed: 1,
      message: error instanceof Error ? error.message : "Gagal menarik data cloud",
    };
  }
}

export function getClientSyncStatus(lastSyncAt: string | null): ClientSyncStatus {
  const online = typeof window !== "undefined" ? navigator.onLine : false;
  return {
    isOnline: online,
    mode: isTauriApp() ? "tauri" : "web",
    cloudBackup: online ? "connected" : "disconnected",
    pendingChanges: isTauriApp() ? 0 : getOfflineQueueCount(),
    lastSyncAt: lastSyncAt || getLastSyncSuccessAt(),
    intervalMinutes: getAutoSyncIntervalMinutes(),
  };
}
