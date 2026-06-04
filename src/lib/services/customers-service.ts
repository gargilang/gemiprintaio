/**
 * Layanan Pelanggan
 * API universal untuk Pelanggan di Tauri dan Web.
 */

import "server-only";

import { db } from "../db-unified";

export interface Pelanggan {
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
 * Ambil semua pelanggan
 */
export async function getPelanggan(): Promise<Pelanggan[]> {
  try {
    const result = await db.query<Pelanggan>("pelanggan", {
      orderBy: { column: "nama", ascending: true },
    });

    if (result.error) {
      throw result.error;
    }

    return result.data || [];
  } catch (error) {
    console.error("Gagal mengambil daftar pelanggan:", error);
    throw error;
  }
}

/**
 * Ambil satu pelanggan berdasarkan ID
 */
export async function getPelangganById(id: string): Promise<Pelanggan | null> {
  try {
    const result = await db.queryOne<Pelanggan>("pelanggan", {
      where: { id },
    });

    if (result.error) {
      throw result.error;
    }

    return result.data;
  } catch (error) {
    console.error("Gagal mengambil pelanggan:", error);
    return null;
  }
}

/**
 * Buat pelanggan baru
 */
export async function createPelanggan(
  pelanggan: Omit<Pelanggan, "id" | "dibuat_pada" | "diperbarui_pada">
): Promise<{ id: string } | null> {
  try {
    const pelangganId = crypto.randomUUID();

    const result = await db.insert("pelanggan", {
      id: pelangganId,
      ...pelanggan,
      dibuat_pada: new Date().toISOString(),
      diperbarui_pada: new Date().toISOString(),
    });

    if (result.error) {
      throw result.error;
    }

    return { id: pelangganId };
  } catch (error) {
    console.error("Gagal membuat pelanggan:", error);
    throw error;
  }
}

/**
 * Perbarui pelanggan
 */
export async function updatePelanggan(
  id: string,
  pelanggan: Partial<Pelanggan>
): Promise<boolean> {
  try {
    const { dibuat_pada, ...updateData } = pelanggan as any;

    const result = await db.update("pelanggan", id, {
      ...updateData,
      diperbarui_pada: new Date().toISOString(),
    });

    if (result.error) {
      throw result.error;
    }

    return true;
  } catch (error) {
    console.error("Gagal memperbarui pelanggan:", error);
    throw error;
  }
}

/**
 * Hapus pelanggan
 */
export async function deletePelanggan(id: string): Promise<boolean> {
  try {
    const result = await db.delete("pelanggan", id);

    if (result.error) {
      throw result.error;
    }

    return true;
  } catch (error) {
    console.error("Gagal menghapus pelanggan:", error);
    throw error;
  }
}
