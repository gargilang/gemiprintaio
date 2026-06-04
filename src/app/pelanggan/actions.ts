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

export async function getCustomersAction() {
  try {
    return await getPelanggan();
  } catch (error) {
    console.error("Gagal getCustomersAction:", error);
    throw error;
  }
}

export async function createCustomerAction(data: Omit<Pelanggan, "id" | "dibuat_pada" | "diperbarui_pada">) {
  try {
    return await createPelanggan(data);
  } catch (error) {
    console.error("Gagal createCustomerAction:", error);
    throw error;
  }
}

export async function updateCustomerAction(id: string, data: Partial<Pelanggan>) {
  try {
    return await updatePelanggan(id, data);
  } catch (error) {
    console.error("Gagal updateCustomerAction:", error);
    throw error;
  }
}

export async function deleteCustomerAction(id: string) {
  try {
    return await deletePelanggan(id);
  } catch (error) {
    console.error("Gagal deleteCustomerAction:", error);
    throw error;
  }
}
