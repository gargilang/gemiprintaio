/**
 * Auth Service
 */

import { db } from "../db-unified";
import crypto from "crypto";

export interface LoginResult {
  success: boolean;
  user?: {
    id: string;
    nama_pengguna: string;
    email?: string | null;
    nama_lengkap?: string;
    role: string;
    aktif_status: number;
  };
  error?: string;
}

async function simpleHash(text: string): Promise<string> {
  return crypto.createHash("sha256").update(text).digest("hex");
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

    // Get user by username
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

    // Verify password
    const passwordHash = await simpleHash(password);

    if (user.password_hash !== passwordHash) {
      return {
        success: false,
        error: "Password salah",
      };
    }

    // Remove password_hash from response
    const { password_hash, ...userWithoutPassword } = user;

    return {
      success: true,
      user: userWithoutPassword,
    };
  } catch (error: any) {
    console.error("Login error:", error);
    return {
      success: false,
      error: error.message || "Login gagal",
    };
  }
}

/**
 * Verify session (placeholder - implement based on your session strategy)
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
