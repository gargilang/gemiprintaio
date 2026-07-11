export type NotificationLogType = "success" | "error" | "info" | "warning";

export interface NotificationLogEntry {
  id: string;
  type: NotificationLogType;
  message: string;
  pathname: string;
  createdAt: string;
}

export const NOTIFICATION_LOG_STORAGE_KEY = "gemiprint_notification_log";
export const NOTIFICATION_LOG_UPDATED_EVENT = "gemi:notification-log-updated";
const MAX_NOTIFICATION_LOG_ITEMS = 300;
const DEDUPE_WINDOW_MS = 1000;

function canUseStorage() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function readStoredNotificationLogs(): NotificationLogEntry[] {
  if (!canUseStorage()) return [];

  try {
    const raw = localStorage.getItem(NOTIFICATION_LOG_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((item): item is NotificationLogEntry => {
      return (
        item &&
        typeof item.id === "string" &&
        (item.type === "success" ||
          item.type === "error" ||
          item.type === "info" ||
          item.type === "warning") &&
        typeof item.message === "string" &&
        typeof item.pathname === "string" &&
        typeof item.createdAt === "string"
      );
    });
  } catch {
    return [];
  }
}

function writeStoredNotificationLogs(logs: NotificationLogEntry[]) {
  if (!canUseStorage()) return;

  localStorage.setItem(
    NOTIFICATION_LOG_STORAGE_KEY,
    JSON.stringify(logs.slice(0, MAX_NOTIFICATION_LOG_ITEMS)),
  );
  window.dispatchEvent(new Event(NOTIFICATION_LOG_UPDATED_EVENT));
}

export function getNotificationLogs() {
  return readStoredNotificationLogs();
}

export function addNotificationLog(input: {
  type: NotificationLogType;
  message: string;
  pathname?: string | null;
}): NotificationLogEntry | null {
  if (!canUseStorage()) return null;

  const now = new Date();
  const pathname = input.pathname || window.location.pathname || "/";
  const logs = readStoredNotificationLogs();
  const latest = logs[0];

  if (
    latest &&
    latest.type === input.type &&
    latest.message === input.message &&
    latest.pathname === pathname &&
    now.getTime() - new Date(latest.createdAt).getTime() < DEDUPE_WINDOW_MS
  ) {
    return null;
  }

  const entry: NotificationLogEntry = {
    id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    type: input.type,
    message: input.message,
    pathname,
    createdAt: now.toISOString(),
  };

  writeStoredNotificationLogs([entry, ...logs]);
  return entry;
}

export function clearNotificationLogs() {
  writeStoredNotificationLogs([]);
}
