/**
 * Reports Service
 * Universal API untuk Reports yang bekerja di Tauri dan Web
 */

import "server-only";

import { db } from "../db-unified";

// ============================================================================
// TYPES
// ============================================================================

export interface Archive {
  archived_label: string;
  count: number;
  start_date: string;
  end_date: string;
  archived_at: string;
}

export interface FinancialReport {
  dateRange: {
    startDate: string;
    endDate: string;
  };
  summary: {
    totalIncome: number;
    totalExpenses: number;
    netProfit: number;
    profitMargin: number;
  };
  categoryBreakdown: Array<{
    category: string;
    amount: number;
    percentage: number;
  }>;
  transactions: Array<{
    date: string;
    description: string;
    category: string;
    amount: number;
    type: "income" | "expense";
  }>;
  generatedAt: string;
}

// ============================================================================
// FUNCTIONS
// ============================================================================

/**
 * Get all archived periods
 */
export async function getArchivedPeriods(): Promise<Archive[]> {
  try {
    // Query for grouped archives
    const result = await db.queryRaw<any>(`
      SELECT 
        label_arsip as archived_label,
        COUNT(*) as count,
        MIN(tanggal) as start_date,
        MAX(tanggal) as end_date,
        diarsipkan_pada as archived_at
      FROM keuangan
      WHERE diarsipkan_pada IS NOT NULL
      GROUP BY label_arsip, diarsipkan_pada
      ORDER BY diarsipkan_pada DESC
    `);

    return result || [];
  } catch (error) {
    console.error("Error getting archived periods:", error);
    throw error;
  }
}

/**
 * Archive transactions for a date range
 */
export async function archiveCashbook(data: {
  startDate: string;
  endDate: string;
  label: string;
}): Promise<{ archived: number }> {
  try {
    if (!data.startDate || !data.endDate || !data.label) {
      throw new Error("startDate, endDate, and label are required");
    }

    const now = new Date().toISOString();

    // Update keuangan records to mark as archived
    const result = await db.executeRaw(
      `UPDATE keuangan 
       SET diarsipkan_pada = ?, label_arsip = ?
       WHERE tanggal >= ? AND tanggal <= ? AND diarsipkan_pada IS NULL`,
      [now, data.label, data.startDate, data.endDate]
    );

    // Result from executeRaw is not standardized, so we'll assume success
    return { archived: 0 }; // We can't get the exact count easily
  } catch (error) {
    console.error("Error archiving cashbook:", error);
    throw error;
  }
}

/**
 * Get financial report for archived period
 */
export async function getFinancialReport(
  label: string,
  archivedAt: string
): Promise<FinancialReport> {
  try {
    if (!label || !archivedAt) {
      throw new Error("Missing required params: label and archivedAt");
    }

    // Get archived cashbook entries
    // Note: We're using 'keuangan' table as the source
    const cashBooks = await db.queryRaw<any>(
      `SELECT * FROM keuangan 
       WHERE label_arsip = ? AND diarsipkan_pada = ?
       ORDER BY tanggal ASC, created_at ASC`,
      [label, archivedAt]
    );

    if (!cashBooks || cashBooks.length === 0) {
      throw new Error("No data found for this archive");
    }

    // Calculate summary
    let totalIncome = 0;
    let totalExpenses = 0;
    const categoryTotals: { [key: string]: number } = {};

    cashBooks.forEach((row: any) => {
      if (row.debit > 0) {
        totalIncome += row.debit;
      }
      if (row.kredit > 0) {
        totalExpenses += row.kredit;
      }

      // Group by category
      const category = row.kategori_transaksi || "Uncategorized";
      if (!categoryTotals[category]) {
        categoryTotals[category] = 0;
      }
      categoryTotals[category] += row.debit > 0 ? row.debit : row.kredit;
    });

    const netProfit = totalIncome - totalExpenses;
    const profitMargin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;

    // Transform category totals to array with percentages
    const categoryBreakdown = Object.entries(categoryTotals).map(
      ([category, amount]) => ({
        category,
        amount,
        percentage:
          totalIncome + totalExpenses > 0
            ? (amount / (totalIncome + totalExpenses)) * 100
            : 0,
      })
    );

    // Transform transactions to expected format
    const transactions = cashBooks.map((row: any) => ({
      date: row.tanggal,
      description: row.keperluan || "No description",
      category: row.kategori_transaksi || "Uncategorized",
      amount: row.debit > 0 ? row.debit : row.kredit,
      type: (row.debit > 0 ? "income" : "expense") as "income" | "expense",
    }));

    return {
      dateRange: {
        startDate: cashBooks[0].tanggal,
        endDate: cashBooks[cashBooks.length - 1].tanggal,
      },
      summary: {
        totalIncome,
        totalExpenses,
        netProfit,
        profitMargin,
      },
      categoryBreakdown,
      transactions,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Error generating financial report:", error);
    throw error;
  }
}

/**
 * Restore archived transactions
 */
export async function restoreArchivedTransactions(
  label: string,
  archivedAt: string
): Promise<{ restored: number }> {
  try {
    if (!label || !archivedAt) {
      throw new Error("Missing required params: label and archivedAt");
    }

    // Unarchive transactions
    await db.executeRaw(
      `UPDATE keuangan 
       SET diarsipkan_pada = NULL, label_arsip = NULL
       WHERE label_arsip = ? AND diarsipkan_pada = ?`,
      [label, archivedAt]
    );

    return { restored: 0 }; // Can't get exact count easily
  } catch (error) {
    console.error("Error restoring archived transactions:", error);
    throw error;
  }
}
