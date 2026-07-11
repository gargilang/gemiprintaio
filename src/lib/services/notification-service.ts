import "server-only";

import { db, generateId } from "@/lib/db-unified";

export type NotificationType = "success" | "error" | "info" | "warning";
export type NotificationCategory = "toast" | "bank" | "sistem";

export interface NotificationRecord {
  id: string;
  tipe: NotificationType;
  kategori: NotificationCategory;
  judul: string | null;
  pesan: string;
  sumber_path: string | null;
  sumber_judul: string | null;
  ref_tipe: string | null;
  ref_id: string | null;
  metadata_json: string | Record<string, unknown> | null;
  dibuat_oleh: string | null;
  dibuat_pada: string;
  diperbarui_pada?: string | null;
}

export interface CreateNotificationInput {
  id?: string;
  tipe: NotificationType;
  kategori?: NotificationCategory;
  judul?: string | null;
  pesan: string;
  sumber_path?: string | null;
  sumber_judul?: string | null;
  ref_tipe?: string | null;
  ref_id?: string | null;
  metadata_json?: Record<string, unknown> | null;
  dibuat_oleh?: string | null;
  dibuat_pada?: string | null;
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 100;
const MAX_STORED_TOAST_NOTIFICATIONS = 2000;

function clampLimit(limit?: number) {
  if (!Number.isFinite(limit || 0)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(limit || DEFAULT_LIMIT), 1), MAX_LIMIT);
}

export async function getNotifications(options: { limit?: number } = {}) {
  const result = await db.query<NotificationRecord>("notifikasi", {
    where: { is_deleted: 0 },
    orderBy: { column: "dibuat_pada", ascending: false },
    limit: clampLimit(options.limit),
  });

  if (result.error) {
    throw result.error;
  }

  return result.data ?? [];
}

async function pruneToastNotifications() {
  const oldRows = await db.query<NotificationRecord>("notifikasi", {
    where: { kategori: "toast", is_deleted: 0 },
    orderBy: { column: "dibuat_pada", ascending: false },
    offset: MAX_STORED_TOAST_NOTIFICATIONS,
    limit: 100,
  });

  if (oldRows.error || !oldRows.data?.length) return;

  for (const row of oldRows.data) {
    await db.delete("notifikasi", row.id);
  }
}

export async function createNotification(input: CreateNotificationInput) {
  const id = input.id || generateId();
  const metadata = input.metadata_json
    ? JSON.stringify(input.metadata_json)
    : undefined;

  const result = await db.insert("notifikasi", {
    id,
    tipe: input.tipe,
    kategori: input.kategori || "toast",
    judul: input.judul || null,
    pesan: input.pesan,
    sumber_path: input.sumber_path || null,
    sumber_judul: input.sumber_judul || null,
    ref_tipe: input.ref_tipe || null,
    ref_id: input.ref_id || null,
    metadata_json: metadata,
    dibuat_oleh: input.dibuat_oleh || null,
    dibuat_pada: input.dibuat_pada || undefined,
  });

  if (result.error) {
    const message = result.error.message || "";
    if (message.toLowerCase().includes("duplicate")) {
      return { id };
    }
    throw result.error;
  }

  if ((input.kategori || "toast") === "toast") {
    await pruneToastNotifications();
  }

  return { id };
}
