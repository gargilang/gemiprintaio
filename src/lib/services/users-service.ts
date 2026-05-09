/**
 * Users Service
 */

import "server-only";

import { db } from "../db-unified";
import crypto from "crypto";

export interface User {
  id: string;
  nama_pengguna: string;
  email?: string | null;
  nama_lengkap?: string;
  role: string;
  aktif_status: number;
  dibuat_pada?: string;
  diperbarui_pada?: string;
}

async function simpleHash(text: string): Promise<string> {
  return crypto.createHash("sha256").update(text).digest("hex");
}

/**
 * Get all users (without password)
 */
export async function getUsers(): Promise<User[]> {
  try {
    const result = await db.query<User>("profil", {
      select:
        "id, nama_pengguna, email, nama_lengkap, role, aktif_status, dibuat_pada, diperbarui_pada",
      orderBy: { column: "dibuat_pada", ascending: false },
    });

    if (result.error) throw result.error;
    return result.data || [];
  } catch (error) {
    console.error("Error fetching users:", error);
    throw error;
  }
}

/**
 * Get single user
 */
export async function getUser(id: string): Promise<User | null> {
  try {
    const result = await db.queryOne<User>("profil", {
      select:
        "id, nama_pengguna, email, nama_lengkap, role, aktif_status, dibuat_pada, diperbarui_pada",
      where: { id },
    });

    if (result.error) throw result.error;
    return result.data;
  } catch (error) {
    console.error("Error fetching user:", error);
    throw error;
  }
}

/**
 * Create new user
 */
export async function createUser(data: {
  nama_pengguna: string;
  email?: string;
  nama_lengkap?: string;
  password: string;
  role?: string;
  aktif_status?: number;
}): Promise<{ id: string }> {
  try {
    // Validate
    if (!data.nama_pengguna || !data.password) {
      throw new Error("nama_pengguna dan password wajib diisi");
    }

    // Normalize email
    const normalizedEmail = data.email?.trim() || null;

    // Check uniqueness
    const byUsername = await db.queryOne("profil", {
      where: { nama_pengguna: data.nama_pengguna },
    });

    if (byUsername.data) {
      throw new Error("Nama pengguna sudah digunakan");
    }

    if (normalizedEmail) {
      const byEmail = await db.queryOne("profil", {
        where: { email: normalizedEmail },
      });

      if (byEmail.data) {
        throw new Error("Email sudah digunakan");
      }
    }

    // Hash password
    const password_hash = await simpleHash(data.password);

    const id = crypto.randomUUID();

    const aktifStatus =
      data.aktif_status !== undefined ? (data.aktif_status ? 1 : 0) : 1;

    const user = {
      id,
      nama_pengguna: data.nama_pengguna,
      email: normalizedEmail,
      nama_lengkap: data.nama_lengkap?.trim() || null,
      password_hash,
      role: data.role || "user",
      aktif_status: aktifStatus,
    };

    const result = await db.insert("profil", user);
    if (result.error) throw result.error;

    return { id };
  } catch (error: any) {
    console.error("Error creating user:", error);
    throw error;
  }
}

/**
 * Update user
 */
export async function updateUser(
  id: string,
  data: Partial<User>
): Promise<void> {
  try {
    const result = await db.update("profil", id, data);
    if (result.error) throw result.error;
  } catch (error) {
    console.error("Error updating user:", error);
    throw error;
  }
}

/**
 * Delete user
 */
export async function deleteUser(id: string): Promise<void> {
  try {
    const result = await db.delete("profil", id);
    if (result.error) throw result.error;
  } catch (error) {
    console.error("Error deleting user:", error);
    throw error;
  }
}

/**
 * Change password
 */
export async function changePassword(
  id: string,
  newPassword: string
): Promise<void> {
  try {
    const password_hash = await simpleHash(newPassword);

    const result = await db.update("profil", id, { password_hash });
    if (result.error) throw result.error;
  } catch (error) {
    console.error("Error changing password:", error);
    throw error;
  }
}

/**
 * Resolve profil id from URL param, with optional username fallback (legacy clients).
 */
export async function resolveProfilId(
  paramId: string,
  namaPenggunaFallback?: string
): Promise<string | null> {
  const byId = await db.queryOne<{ id: string }>("profil", {
    select: "id",
    where: { id: paramId },
  });
  if (byId.data?.id) return byId.data.id;
  if (namaPenggunaFallback) {
    const byUser = await db.queryOne<{ id: string }>("profil", {
      select: "id",
      where: { nama_pengguna: namaPenggunaFallback },
    });
    if (byUser.data?.id) return byUser.data.id;
  }
  return null;
}

export type PatchProfilInput = {
  email?: unknown;
  nama_lengkap?: unknown;
  role?: unknown;
  aktif_status?: unknown;
  password?: string;
  nama_pengguna?: string;
};

/**
 * Partial update for profil (used by /api/users/[id]).
 */
export async function patchProfil(
  paramId: string,
  body: PatchProfilInput
): Promise<User | null> {
  const resolvedId = await resolveProfilId(paramId, body.nama_pengguna);
  if (!resolvedId) return null;

  const payload: Record<string, unknown> = {};
  if (typeof body.email !== "undefined") payload.email = body.email;
  if (typeof body.nama_lengkap !== "undefined")
    payload.nama_lengkap = body.nama_lengkap || null;
  if (typeof body.role !== "undefined") payload.role = body.role;
  if (typeof body.aktif_status !== "undefined")
    payload.aktif_status = body.aktif_status ? 1 : 0;
  if (body.password) {
    payload.password_hash = await simpleHash(body.password);
  }

  if (Object.keys(payload).length === 0) {
    throw new Error("Tidak ada perubahan");
  }

  const result = await db.update("profil", resolvedId, payload as any);
  if (result.error) throw result.error;

  return getUser(resolvedId);
}

/**
 * Delete profil with the same id / username resolution as the HTTP API.
 */
export async function deleteProfil(
  paramId: string,
  namaPenggunaFallback?: string
): Promise<boolean> {
  const id = await resolveProfilId(paramId, namaPenggunaFallback);
  if (!id) return false;
  const result = await db.delete("profil", id);
  if (result.error) throw result.error;
  return true;
}
