/**
 * Auth Service
 */

import "server-only";

import { db } from "../db-unified";
import {
  hashPassword,
  isLegacySha256Hash,
  verifyPassword,
} from "../password-hash";

export interface LoginResult {
  success: boolean;
  user?: {
    id: string;
    nama_pengguna: string;
    email?: string | null;
    nama_lengkap?: string | null;
    role: string;
    aktif_status: number;
  };
  error?: string;
}

/**
 * Login user
 */
export async function login(
  username: string,
  password: string
): Promise<LoginResult> {
  try {
    if (!username || !password) {
      return {
        success: false,
        error: "Username dan password diperlukan",
      };
    }

    const result = await db.queryOne<any>("profil", {
      where: { nama_pengguna: username },
    });

    if (result.error || !result.data) {
      return {
        success: false,
        error: "Username tidak ditemukan",
      };
    }

    const user = result.data;

    if (!user.aktif_status) {
      return {
        success: false,
        error: "Akun tidak aktif. Hubungi administrator.",
      };
    }

    const storedHash = String(user.password_hash || "");
    const ok = await verifyPassword(password, storedHash);

    if (!ok) {
      return {
        success: false,
        error: "Password salah",
      };
    }

    if (isLegacySha256Hash(storedHash)) {
      const newHash = await hashPassword(password);
      const upd = await db.update("profil", user.id, { password_hash: newHash });
      if (upd.error) {
        console.error("Lazy password migration failed:", upd.error);
      }
    }

    const { password_hash: _pw, ...userWithoutPassword } = user;

    return {
      success: true,
      user: userWithoutPassword,
    };
  } catch (error: unknown) {
    console.error("Login error:", error);
    return {
      success: false,
      error: "Login gagal",
    };
  }
}

/**
 * Verify session user still exists and is active
 */
export async function verifySession(userId: string): Promise<boolean> {
  try {
    const result = await db.queryOne("profil", {
      where: { id: userId, aktif_status: 1 },
    });

    return !!result.data;
  } catch (error) {
    console.error("Session verification error:", error);
    return false;
  }
}
