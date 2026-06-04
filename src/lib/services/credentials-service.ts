/**
 * Kredensial tersimpan — dimediasi server lewat db-unified (Supabase + fallback SQLite).
 */

import "server-only";

import crypto from "crypto";

import { db } from "../db-unified";
import { encryptText, decryptText } from "@/lib/crypto";

export interface CredentialListItem {
  id: string;
  pemilik_id: string;
  nama_layanan: string;
  nama_pengguna_akun: string;
  catatan: string;
  privat_status: boolean;
  dapat_melihat_password: boolean;
}

async function getViewerRole(
  viewerId: string | undefined
): Promise<string> {
  if (!viewerId) return "user";
  const r = await db.queryOne<{ role: string }>("profil", {
    select: "role",
    where: { id: viewerId },
  });
  return r.data?.role || "user";
}

/**
 * List kredensial yang terlihat oleh penampil (publik + baris privat milik sendiri).
 */
export async function listCredentials(
  viewerId: string | undefined
): Promise<CredentialListItem[]> {
  const viewerRole = await getViewerRole(viewerId);

  const publicRes = await db.query<Record<string, unknown>>("kredensial", {
    select:
      "id, pemilik_id, nama_layanan, nama_pengguna_akun, password_terenkripsi, catatan, privat_status, dibuat_pada, diperbarui_pada",
    where: { privat_status: 0 },
    orderBy: { column: "diperbarui_pada", ascending: false },
  });
  if (publicRes.error) throw publicRes.error;

  let own: Record<string, unknown>[] = [];
  if (viewerId) {
    const ownRes = await db.query<Record<string, unknown>>("kredensial", {
      select:
        "id, pemilik_id, nama_layanan, nama_pengguna_akun, password_terenkripsi, catatan, privat_status, dibuat_pada, diperbarui_pada",
      where: { pemilik_id: viewerId },
      orderBy: { column: "diperbarui_pada", ascending: false },
    });
    if (ownRes.error) throw ownRes.error;
    own = ownRes.data || [];
  }

  const merged = new Map<string, Record<string, unknown>>();
  for (const r of publicRes.data || []) merged.set(String(r.id), r);
  for (const r of own) merged.set(String(r.id), r);

  const rows = Array.from(merged.values()).sort((a, b) => {
    const ta = String(a.diperbarui_pada || "");
    const tb = String(b.diperbarui_pada || "");
    return tb.localeCompare(ta);
  });

  return rows.map((r) => {
    const isOwner = viewerId === r.pemilik_id;
    const isPrivate = !!Number(r.privat_status);
    const isAdminOrManager =
      viewerRole === "admin" || viewerRole === "manager";
    const canView = isOwner || (isAdminOrManager && !isPrivate);

    return {
      id: String(r.id),
      pemilik_id: String(r.pemilik_id),
      nama_layanan: String(r.nama_layanan),
      nama_pengguna_akun: String(r.nama_pengguna_akun),
      catatan: String(r.catatan ?? ""),
      privat_status: isPrivate,
      dapat_melihat_password: canView && !!r.password_terenkripsi,
    };
  });
}

export async function createCredential(input: {
  viewerId: string;
  nama_layanan: string;
  nama_pengguna_akun: string;
  password: string;
  catatan?: string;
  privat_status?: number;
}): Promise<{ id: string }> {
  const id = crypto.randomUUID();
  const password_terenkripsi = encryptText(input.password);

  const row = {
    id,
    pemilik_id: input.viewerId,
    nama_layanan: input.nama_layanan,
    nama_pengguna_akun: input.nama_pengguna_akun,
    password_terenkripsi,
    catatan: input.catatan ?? "",
    privat_status: input.privat_status !== undefined ? (input.privat_status ? 1 : 0) : 1,
  };

  const ins = await db.insert("kredensial", row);
  if (ins.error) throw ins.error;
  return { id };
}

export async function getDecryptedPassword(
  credentialId: string,
  viewerId: string | undefined
): Promise<string> {
  const existing = await db.queryOne<{
    id: string;
    pemilik_id: string;
    password_terenkripsi: string;
    privat_status: number;
  }>("kredensial", {
    select: "id, pemilik_id, password_terenkripsi, privat_status",
    where: { id: credentialId },
  });

  if (existing.error) throw existing.error;
  if (!existing.data) {
    throw new Error("NOT_FOUND");
  }

  const viewer = viewerId
    ? await db.queryOne<{ role: string }>("profil", {
        select: "role",
        where: { id: viewerId },
      })
    : { data: null };

  const isOwner = viewerId === existing.data.pemilik_id;
  const isAdminOrManager =
    viewer.data &&
    (viewer.data.role === "admin" || viewer.data.role === "manager");
  const isPrivate = existing.data.privat_status === 1;

  if (!isOwner && (!isAdminOrManager || isPrivate)) {
    throw new Error("FORBIDDEN");
  }

  return decryptText(existing.data.password_terenkripsi);
}

export async function updateCredential(
  credentialId: string,
  viewerId: string | undefined,
  patch: {
    nama_layanan?: string;
    nama_pengguna_akun?: string;
    password?: string;
    catatan?: string;
    privat_status?: number;
  }
): Promise<void> {
  const existing = await db.queryOne<{
    id: string;
    pemilik_id: string;
    privat_status: number;
  }>("kredensial", {
    select: "id, pemilik_id, privat_status",
    where: { id: credentialId },
  });

  if (existing.error) throw existing.error;
  if (!existing.data) {
    throw new Error("NOT_FOUND");
  }

  if (existing.data.privat_status && viewerId !== existing.data.pemilik_id) {
    throw new Error("FORBIDDEN");
  }

  const payload: Record<string, unknown> = {};
  if (typeof patch.nama_layanan !== "undefined")
    payload.nama_layanan = patch.nama_layanan;
  if (typeof patch.nama_pengguna_akun !== "undefined")
    payload.nama_pengguna_akun = patch.nama_pengguna_akun;
  if (typeof patch.catatan !== "undefined") payload.catatan = patch.catatan || "";
  if (typeof patch.privat_status !== "undefined")
    payload.privat_status = patch.privat_status ? 1 : 0;
  if (typeof patch.password !== "undefined" && patch.password !== "") {
    payload.password_terenkripsi = encryptText(patch.password);
  }

  if (Object.keys(payload).length === 0) {
    throw new Error("NO_CHANGES");
  }

  const upd = await db.update("kredensial", credentialId, payload);
  if (upd.error) throw upd.error;
}

export async function deleteCredential(
  credentialId: string,
  viewerId: string | undefined
): Promise<void> {
  const existing = await db.queryOne<{
    id: string;
    pemilik_id: string;
  }>("kredensial", {
    select: "id, pemilik_id",
    where: { id: credentialId },
  });

  if (existing.error) throw existing.error;
  if (!existing.data) {
    throw new Error("NOT_FOUND");
  }

  if (viewerId !== existing.data.pemilik_id) {
    throw new Error("FORBIDDEN");
  }

  const del = await db.delete("kredensial", credentialId);
  if (del.error) throw del.error;
}
