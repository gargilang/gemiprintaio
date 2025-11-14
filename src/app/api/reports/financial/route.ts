/**
 * DEPRECATED: Use getFinancialReport() from reports-service.ts
 * @see /src/lib/services/reports-service.ts
 */
import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import { join } from "path";

const DB_FILE = join(process.cwd(), "database", "gemiprint.db");

interface CashBookRow {
  id: string;
  tanggal: string;
  kategori_transaksi: string;
  debit: number;
  kredit: number;
  keperluan: string;
  saldo: number;
  omzet: number;
  biaya_operasional: number;
  biaya_bahan: number;
  laba_bersih: number;
  kasbon_anwar: number;
  kasbon_suri: number;
  kasbon_cahaya: number;
  kasbon_dinil: number;
  bagi_hasil_anwar: number;
  bagi_hasil_suri: number;
  bagi_hasil_gemi: number;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const label = searchParams.get("label");
    const at = searchParams.get("at");

    if (!label || !at) {
      return NextResponse.json(
        { error: "Missing required params: label and at" },
        { status: 400 }
      );
    }

    const db = new Database(DB_FILE);

    const cashBooks = db
      .prepare(
        `SELECT * FROM cash_book 
         WHERE archived_label = ? AND archived_at = ?
         ORDER BY tanggal ASC, created_at ASC`
      )
      .all(label, at) as CashBookRow[];

    db.close();

    if (!cashBooks || cashBooks.length === 0) {
      return NextResponse.json(
        { error: "No data found for this archive" },
        { status: 404 }
      );
    }

    // Calculate summary
    const lastRow = cashBooks[cashBooks.length - 1];

    // Calculate totals from transactions
    let totalIncome = 0;
    let totalExpenses = 0;
    const categoryTotals: { [key: string]: number } = {};

    cashBooks.forEach((row) => {
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
    const transactions = cashBooks.map((row) => ({
      date: row.tanggal,
      description: row.keperluan || "No description",
      category: row.kategori_transaksi || "Uncategorized",
      amount: row.debit > 0 ? row.debit : row.kredit,
      type: row.debit > 0 ? "income" : ("expense" as "income" | "expense"),
    }));

    // Return JSON data in expected format
    return NextResponse.json({
      dateRange: {
        startDate: cashBooks[0].tanggal,
        endDate: lastRow.tanggal,
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
    });
  } catch (error: any) {
    console.error("Generate financial report error:", error);
    return NextResponse.json(
      {
        error: "Failed to generate report",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
