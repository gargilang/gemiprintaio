"use server";

/**
 * Server Actions for Login Page
 */

import { createUser } from "@/lib/services/users-service";

/**
 * Create a new user (for initial setup)
 */
export async function createUserAction(data: {
  nama_pengguna: string;
  email?: string;
  nama_lengkap?: string;
  password: string;
  role?: string;
  aktif_status?: number;
}) {
  try {
    return await createUser(data);
  } catch (error) {
    console.error("Error in createUserAction:", error);
    throw error;
  }
}
