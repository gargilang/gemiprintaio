"use server";

/**
 * Server Actions for Finance Page
 * Provides server-side data operations for client components
 */

import {
  deleteAllCashbook,
  deleteCashBookEntry,
  createCashBookEntry,
} from "@/lib/services/finance-service";
import { getDebts } from "@/lib/services/purchases-service";
import { getReceivables } from "@/lib/services/pos-service";

/**
 * Get all active debts
 */
export async function getDebtsAction() {
  try {
    return await getDebts();
  } catch (error) {
    console.error("Error in getDebtsAction:", error);
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
 * Delete all cashbook entries (admin action)
 */
export async function deleteAllCashbookAction() {
  try {
    return await deleteAllCashbook();
  } catch (error) {
    console.error("Error in deleteAllCashbookAction:", error);
    throw error;
  }
}

/**
 * Delete a single cashbook entry
 */
export async function deleteCashBookEntryAction(id: string) {
  try {
    return await deleteCashBookEntry(id);
  } catch (error) {
    console.error("Error in deleteCashBookEntryAction:", error);
    throw error;
  }
}

/**
 * Create a new cashbook entry
 */
export async function createCashBookEntryAction(data: {
  tanggal: string;
  kategori_transaksi: string;
  debit: number;
  kredit: number;
  keperluan: string;
  catatan?: string;
  dibuat_oleh?: string;
}) {
  try {
    return await createCashBookEntry(data);
  } catch (error) {
    console.error("Error in createCashBookEntryAction:", error);
    throw error;
  }
}
