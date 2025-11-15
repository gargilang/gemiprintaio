/**
 * Finishing Options Service
 * Universal API untuk Finishing Options yang bekerja di Tauri dan Web
 */

import "server-only";

import { db } from "../db-unified";

export interface FinishingOption {
  id: string;
  nama: string;
  urutan_tampilan: number;
  aktif_status: number | boolean;
  dibuat_pada?: string;
  diperbarui_pada?: string;
}

// ============================================================================
// CRUD FUNCTIONS
// ============================================================================

/**
 * Get all finishing options (including inactive)
 */
export async function getFinishingOptions(): Promise<FinishingOption[]> {
  try {
    const result = await db.query("opsi_finishing", {
      orderBy: { column: "urutan_tampilan", ascending: true },
    });

    if (result.error) throw result.error;
    return result.data || [];
  } catch (error) {
    console.error("Error fetching finishing options:", error);
    throw error;
  }
}

/**
 * Create new finishing option
 */
export async function createFinishingOption(data: {
  nama: string;
}): Promise<FinishingOption> {
  try {
    if (!data.nama || !data.nama.trim()) {
      throw new Error("Nama opsi tidak boleh kosong");
    }

    // Check if nama already exists
    const existing = await db.query("opsi_finishing", {
      where: { nama: data.nama.trim() },
    });

    if (existing.data && existing.data.length > 0) {
      throw new Error("Opsi dengan nama ini sudah ada");
    }

    // Get max urutan_tampilan
    const allOptions = await db.query("opsi_finishing", {
      orderBy: { column: "urutan_tampilan", ascending: false },
      limit: 1,
    });

    const maxOrder =
      allOptions.data && allOptions.data.length > 0
        ? (allOptions.data[0] as any).urutan_tampilan || 0
        : 0;

    const newOrder = maxOrder + 1;

    const result = await db.insert("opsi_finishing", {
      nama: data.nama.trim(),
      urutan_tampilan: newOrder,
      aktif_status: 1,
    });

    if (result.error) throw result.error;
    return result.data as FinishingOption;
  } catch (error) {
    console.error("Error creating finishing option:", error);
    throw error;
  }
}

/**
 * Update finishing option name
 */
export async function updateFinishingOption(
  id: string,
  data: { nama: string }
): Promise<void> {
  try {
    if (!data.nama || !data.nama.trim()) {
      throw new Error("Nama opsi tidak boleh kosong");
    }

    // Check if nama already exists (excluding current)
    const existing = await db.queryRaw<any>(
      "SELECT id FROM opsi_finishing WHERE nama = ? AND id != ?",
      [data.nama.trim(), id]
    );

    if (existing && existing.length > 0) {
      throw new Error("Opsi dengan nama ini sudah ada");
    }

    const result = await db.update("opsi_finishing", id, {
      nama: data.nama.trim(),
      diperbarui_pada: new Date().toISOString(),
    });

    if (result.error) throw result.error;
  } catch (error) {
    console.error("Error updating finishing option:", error);
    throw error;
  }
}

/**
 * Delete finishing option (soft delete)
 */
export async function deleteFinishingOption(id: string): Promise<void> {
  try {
    const result = await db.update("opsi_finishing", id, {
      aktif_status: 0,
      diperbarui_pada: new Date().toISOString(),
    });

    if (result.error) throw result.error;
  } catch (error) {
    console.error("Error deleting finishing option:", error);
    throw error;
  }
}

/**
 * Reorder finishing options
 */
export async function reorderFinishingOptions(
  updates: Array<{ id: string; urutan_tampilan: number }>
): Promise<void> {
  try {
    for (const update of updates) {
      await db.update("opsi_finishing", update.id, {
        urutan_tampilan: update.urutan_tampilan,
        diperbarui_pada: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("Error reordering finishing options:", error);
    throw error;
  }
}
