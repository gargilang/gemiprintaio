"use server";

/**
 * Server Action untuk Halaman POS
 * Menyediakan operasi data sisi-server untuk komponen klien.
 */

import { requireAdminOrManager } from "@/lib/auth-guard-server";
import {
  getPOSInitData,
  createSale,
  deleteSale,
  voidSale,
  revertSalePayment,
  getReceivables,
  payReceivable,
  type Sale,
  type CreateSaleData,
} from "@/lib/services/pos-service";
import { createPelanggan } from "@/lib/services/customers-service";
import { getFinishingOptions } from "@/lib/services/finishing-options-service";

/**
 * Ambil data awal untuk POS (barang, pelanggan, dll.)
 */
export async function getPOSInitDataAction() {
  try {
    return await getPOSInitData();
  } catch (error) {
    console.error("Gagal getPOSInitDataAction:", error);
    throw error;
  }
}

/**
 * Buat penjualan baru
 */
export async function createSaleAction(data: CreateSaleData) {
  try {
    return await createSale(data);
  } catch (error) {
    console.error("Gagal createSaleAction:", error);
    throw error;
  }
}

/**
 * Hapus penjualan
 */
export async function deleteSaleAction(id: string): Promise<boolean> {
  try {
    await requireAdminOrManager();
    return await deleteSale(id);
  } catch (error) {
    console.error("Gagal deleteSaleAction:", error);
    throw error;
  }
}

export async function voidSaleAction(
  id: string,
  reason = "Penjualan dibatalkan"
): Promise<boolean> {
  try {
    const s = await requireAdminOrManager();
    return await voidSale(id, reason, s.uid);
  } catch (error) {
    console.error("Gagal voidSaleAction:", error);
    throw error;
  }
}

/**
 * Revert pembayaran penjualan (jadikan piutang aktif lagi)
 */
export async function revertSalePaymentAction(data: {
  sale_id: string;
}): Promise<number> {
  try {
    return await revertSalePayment(data);
  } catch (error) {
    console.error("Gagal revertSalePaymentAction:", error);
    throw error;
  }
}

/**
 * Buat pelanggan baru
 */
export async function createCustomerAction(data: {
  tipe_pelanggan: string;
  nama: string;
  nama_perusahaan?: string;
  telepon?: string;
  email?: string;
  alamat?: string;
  member_status: number;
}) {
  try {
    return await createPelanggan(data as any);
  } catch (error) {
    console.error("Gagal createCustomerAction:", error);
    throw error;
  }
}

/**
 * Ambil semua piutang aktif
 */
export async function getReceivablesAction() {
  try {
    return await getReceivables();
  } catch (error) {
    console.error("Gagal getReceivablesAction:", error);
    throw error;
  }
}

/**
 * Bayar piutang
 */
export async function payReceivableAction(data: {
  piutang_id: string;
  jumlah_bayar: number;
  tanggal_bayar: string;
  metode_pembayaran: string;
  referensi?: string;
  catatan?: string;
  dibuat_oleh?: string;
}) {
  try {
    return await payReceivable(data);
  } catch (error) {
    console.error("Gagal payReceivableAction:", error);
    throw error;
  }
}

/**
 * Ambil opsi finishing untuk modal finishing di POS
 */
export async function getFinishingOptionsAction() {
  try {
    return await getFinishingOptions();
  } catch (error) {
    console.error("Gagal getFinishingOptionsAction:", error);
    throw error;
  }
}

