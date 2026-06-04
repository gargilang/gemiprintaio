"use server";

/**
 * Server Actions for Finance Page
 * Provides server-side data operations for client components
 */

import {
  deleteAllCashbook,
  deleteCashBookEntry,
  importCashbookFromCSV,
  createCashBookEntry,
} from "@/lib/services/finance-service";
import {
  restoreArchivedTransactions,
  getArchivedPeriods,
  archiveCashbook,
} from "@/lib/services/reports-service";
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
 * Restore archived transactions for a specific period
 */
export async function restoreArchivedTransactionsAction(
  bulan: string,
  tahun: string
) {
  try {
    return await restoreArchivedTransactions(bulan, tahun);
  } catch (error) {
    console.error("Error in restoreArchivedTransactionsAction:", error);
    throw error;
  }
}

/**
 * Import cashbook entries from CSV
 */
export async function importCashbookFromCSVAction(
  csvContent: string,
  append: boolean
) {
  try {
    return await importCashbookFromCSV(csvContent, append);
  } catch (error) {
    console.error("Error in importCashbookFromCSVAction:", error);
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

/**
 * Get archived periods for month selection
 */
export async function getArchivedPeriodsAction() {
  try {
    return await getArchivedPeriods();
  } catch (error) {
    console.error("Error in getArchivedPeriodsAction:", error);
    throw error;
  }
}

/**
 * Archive cashbook entries for a period
 */
export async function archiveCashbookAction(data: {
  startDate: string;
  endDate: string;
  label: string;
}) {
  try {
    return await archiveCashbook(data);
  } catch (error) {
    console.error("Error in archiveCashbookAction:", error);
    throw error;
  }
}
