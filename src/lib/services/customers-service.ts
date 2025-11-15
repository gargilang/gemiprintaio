/**
 * Customers Service
 * Universal API untuk Customers yang bekerja di Tauri dan Web
 */

import "server-only";

import { db } from "../db-unified";

export interface Customer {
  id: string;
  tipe_pelanggan: string;
  nama: string;
  nama_perusahaan?: string | null;
  npwp?: string | null;
  email: string;
  telepon: string;
  alamat: string;
  member_status: number;
  dibuat_pada?: string;
  diperbarui_pada?: string;
}

/**
 * Get all customers
 */
export async function getCustomers(): Promise<Customer[]> {
  try {
    const result = await db.query<Customer>("pelanggan", {
      orderBy: { column: "nama", ascending: true },
    });

    if (result.error) {
      throw result.error;
    }

    return result.data || [];
  } catch (error) {
    console.error("Error fetching customers:", error);
    throw error;
  }
}

/**
 * Get single customer by ID
 */
export async function getCustomerById(id: string): Promise<Customer | null> {
  try {
    const result = await db.queryOne<Customer>("pelanggan", {
      where: { id },
    });

    if (result.error) {
      throw result.error;
    }

    return result.data;
  } catch (error) {
    console.error("Error fetching customer:", error);
    return null;
  }
}

/**
 * Create new customer
 */
export async function createCustomer(
  customer: Omit<Customer, "id" | "dibuat_pada" | "diperbarui_pada">
): Promise<{ id: string } | null> {
  try {
    const customerId = crypto.randomUUID();

    const result = await db.insert("pelanggan", {
      id: customerId,
      ...customer,
      dibuat_pada: new Date().toISOString(),
      diperbarui_pada: new Date().toISOString(),
    });

    if (result.error) {
      throw result.error;
    }

    return { id: customerId };
  } catch (error) {
    console.error("Error creating customer:", error);
    throw error;
  }
}

/**
 * Update customer
 */
export async function updateCustomer(
  id: string,
  customer: Partial<Customer>
): Promise<boolean> {
  try {
    const { dibuat_pada, ...updateData } = customer as any;

    const result = await db.update("pelanggan", id, {
      ...updateData,
      diperbarui_pada: new Date().toISOString(),
    });

    if (result.error) {
      throw result.error;
    }

    return true;
  } catch (error) {
    console.error("Error updating customer:", error);
    throw error;
  }
}

/**
 * Delete customer
 */
export async function deleteCustomer(id: string): Promise<boolean> {
  try {
    const result = await db.delete("pelanggan", id);

    if (result.error) {
      throw result.error;
    }

    return true;
  } catch (error) {
    console.error("Error deleting customer:", error);
    throw error;
  }
}
