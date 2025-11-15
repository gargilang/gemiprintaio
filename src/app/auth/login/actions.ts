"use server";

/**
 * Server Actions for Login Page
 */

import { login } from "@/lib/services/auth-service";
import { createUser, type User } from "@/lib/services/users-service";

/**
 * Login user with username and password
 */
export async function loginAction(username: string, password: string) {
  try {
    return await login(username, password);
  } catch (error) {
    console.error("Error in loginAction:", error);
    throw error;
  }
}

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
