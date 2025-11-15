"use server";

/**
 * Server Actions for POS Page
 * Provides server-side data operations for client components
 */

import {
  getPOSInitData,
  createSale,
  deleteSale,
  revertSalePayment,
  getReceivables,
  payReceivable,
  type Sale,
  type CreateSaleData,
} from "@/lib/services/pos-service";
import {
  createCustomer,
  type Customer,
} from "@/lib/services/customers-service";
import { getFinishingOptions } from "@/lib/services/finishing-options-service";

/**
 * Get initial data for POS (materials, customers, etc.)
 */
export async function getPOSInitDataAction() {
  try {
    return await getPOSInitData();
  } catch (error) {
    console.error("Error in getPOSInitDataAction:", error);
    throw error;
  }
}

/**
 * Create a new sale
 */
export async function createSaleAction(data: CreateSaleData) {
  try {
    return await createSale(data);
  } catch (error) {
    console.error("Error in createSaleAction:", error);
    throw error;
  }
}

/**
 * Delete a sale
 */
export async function deleteSaleAction(id: string): Promise<boolean> {
  try {
    return await deleteSale(id);
  } catch (error) {
    console.error("Error in deleteSaleAction:", error);
    throw error;
  }
}

/**
 * Revert sale payment (make receivable active again)
 */
export async function revertSalePaymentAction(data: {
  sale_id: string;
}): Promise<number> {
  try {
    return await revertSalePayment(data);
  } catch (error) {
    console.error("Error in revertSalePaymentAction:", error);
    throw error;
  }
}

/**
 * Create a new customer
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
    return await createCustomer(data as any);
  } catch (error) {
    console.error("Error in createCustomerAction:", error);
    throw error;
  }
}

/**
 * Get all active receivables
 */
export async function getReceivablesAction() {
  try {
    return await getReceivables();
  } catch (error) {
    console.error("Error in getReceivablesAction:", error);
    throw error;
  }
}

/**
 * Pay receivable (piutang)
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
    console.error("Error in payReceivableAction:", error);
    throw error;
  }
}

/**
 * Get finishing options for POS finishing modal
 */
export async function getFinishingOptionsAction() {
  try {
    return await getFinishingOptions();
  } catch (error) {
    console.error("Error in getFinishingOptionsAction:", error);
    throw error;
  }
}
