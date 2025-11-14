/**
 * Vendors Service
 * Universal API untuk Vendors yang bekerja di Tauri dan Web
 */

import { db } from "../db-unified";

export interface Vendor {
  id: string;
  nama_perusahaan: string;
  email: string;
  telepon: string;
  alamat: string;
  kontak_person?: string | null;
  ketentuan_bayar?: string | null;
  aktif_status: number;
  catatan?: string | null;
  dibuat_pada?: string;
  diperbarui_pada?: string;
}

/**
 * Get all vendors
 */
export async function getVendors(): Promise<Vendor[]> {
  try {
    const result = await db.query<Vendor>("vendor", {
      orderBy: { column: "nama_perusahaan", ascending: true },
    });

    if (result.error) {
      throw result.error;
    }

    return result.data || [];
  } catch (error) {
    console.error("Error fetching vendors:", error);
    throw error;
  }
}

/**
 * Get single vendor by ID
 */
export async function getVendorById(id: string): Promise<Vendor | null> {
  try {
    const result = await db.queryOne<Vendor>("vendor", {
      where: { id },
    });

    if (result.error) {
      throw result.error;
    }

    return result.data;
  } catch (error) {
    console.error("Error fetching vendor:", error);
    return null;
  }
}

/**
 * Create new vendor
 */
export async function createVendor(
  vendor: Omit<Vendor, "id" | "dibuat_pada" | "diperbarui_pada">
): Promise<{ id: string } | null> {
  try {
    const vendorId = crypto.randomUUID();

    const result = await db.insert("vendor", {
      id: vendorId,
      ...vendor,
      dibuat_pada: new Date().toISOString(),
      diperbarui_pada: new Date().toISOString(),
    });

    if (result.error) {
      throw result.error;
    }

    return { id: vendorId };
  } catch (error) {
    console.error("Error creating vendor:", error);
    throw error;
  }
}

/**
 * Update vendor
 */
export async function updateVendor(
  id: string,
  vendor: Partial<Vendor>
): Promise<boolean> {
  try {
    const { dibuat_pada, ...updateData } = vendor as any;

    const result = await db.update("vendor", id, {
      ...updateData,
      diperbarui_pada: new Date().toISOString(),
    });

    if (result.error) {
      throw result.error;
    }

    return true;
  } catch (error) {
    console.error("Error updating vendor:", error);
    throw error;
  }
}

/**
 * Delete vendor
 */
export async function deleteVendor(id: string): Promise<boolean> {
  try {
    const result = await db.delete("vendor", id);

    if (result.error) {
      throw result.error;
    }

    return true;
  } catch (error) {
    console.error("Error deleting vendor:", error);
    throw error;
  }
}
