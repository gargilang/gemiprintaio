"use server";

/**
 * Server Action untuk Halaman Pelanggan
 */

import {
  getPelanggan,
  createPelanggan,
  updatePelanggan,
  deletePelanggan,
  type Pelanggan,
} from "@/lib/services/customers-service";

export async function getPelangganAction() {
  try {
    return await getPelanggan();
  } catch (error) {
    console.error("Gagal getPelangganAction:", error);
    throw error;
  }
}

export async function createPelangganAction(data: Omit<Pelanggan, "id" | "dibuat_pada" | "diperbarui_pada">) {
  try {
    return await createPelanggan(data);
  } catch (error) {
    console.error("Gagal createPelangganAction:", error);
    throw error;
  }
}

export async function updatePelangganAction(id: string, data: Partial<Pelanggan>) {
  try {
    return await updatePelanggan(id, data);
  } catch (error) {
    console.error("Gagal updatePelangganAction:", error);
    throw error;
  }
}

export async function deletePelangganAction(id: string) {
  try {
    return await deletePelanggan(id);
  } catch (error) {
    console.error("Gagal deletePelangganAction:", error);
    throw error;
  }
}
