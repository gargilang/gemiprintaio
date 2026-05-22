/**
 * Reports Service
 * Universal API for Reports on Tauri and Web
 */

import "server-only";

import { db, getServerSupabaseClient } from "../db-unified";

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
    totalHpp: number;
    grossProfit: number;
    operationalExpenses: number;
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

export interface FormalAccountingReport {
  dateRange: {
    startDate: string;
    endDate: string;
  };
  cashReport: {
    totalDebit: number;
    totalCredit: number;
    netCashFlow: number;
    endingBalance: number;
    omzet: number;
    operationalExpenses: number;
    cogs: number;
    netProfit: number;
    cashOnHand: number;
    rows: Array<{
      date: string;
      category: string;
      description: string;
      debit: number;
      credit: number;
      balance: number;
      omzet: number;
      operationalExpenses: number;
      cogs: number;
      netProfit: number;
    }>;
  };
  profitLoss: {
    revenue: number;
    cogs: number;
    grossProfit: number;
    grossMargin: number;
    operationalExpenses: number;
    netProfit: number;
    netMargin: number;
    salesCount: number;
  };
  inventory: {
    totalItems: number;
    trackedItems: number;
    lowStockItems: number;
    inventoryValue: number;
    items: Array<{
      id: string;
      name: string;
      stock: number;
      unit: string;
      averageCost: number;
      value: number;
      lowStock: boolean;
    }>;
  };
  salesMargin: {
    invoiceCount: number;
    averageMargin: number;
    rows: Array<{
      invoice: string;
      date: string;
      customerName: string;
      revenue: number;
      cogs: number;
      grossProfit: number;
      grossMargin: number;
      itemCount: number;
    }>;
  };
  receivables: {
    count: number;
    totalOutstanding: number;
    rows: Array<{
      invoice: string;
      customerName: string;
      amount: number;
      paid: number;
      remaining: number;
      status: string;
      date: string;
    }>;
  };
  payables: {
    count: number;
    totalOutstanding: number;
    rows: Array<{
      purchaseNumber: string;
      invoiceNumber: string;
      vendorName: string;
      amount: number;
      paid: number;
      remaining: number;
      status: string;
      date: string;
    }>;
  };
  generatedAt: string;
}

// ============================================================================
// FUNCTIONS
// ============================================================================

function toDateKey(value: unknown): string {
  if (!value) return "";
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

function inDateRange(
  value: unknown,
  startDate: string,
  endDate: string,
): boolean {
  const key = toDateKey(value);
  return Boolean(key && key >= startDate && key <= endDate);
}

function onOrBeforeDate(value: unknown, endDate: string): boolean {
  const key = toDateKey(value);
  return Boolean(key && key <= endDate);
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function marginPercent(profit: number, revenue: number): number {
  return revenue > 0 ? (profit / revenue) * 100 : 0;
}

/**
 * Get all archived periods
 */
export async function getArchivedPeriods(): Promise<Archive[]> {
  const sb = getServerSupabaseClient();
  if (sb) {
    const { data, error } = await sb
      .from("keuangan")
      .select("label_arsip, tanggal, diarsipkan_pada")
      .not("diarsipkan_pada", "is", null);
    if (error) throw error;

    const groups = new Map<
      string,
      { label: string; archived_at: string; dates: string[] }
    >();

    for (const row of data || []) {
      const lab = row.label_arsip as string | null;
      const at = row.diarsipkan_pada as string | null;
      const tanggal = row.tanggal as string | null;
      if (!lab || !at || !tanggal) continue;
      const key = `${lab}\0${at}`;
      let g = groups.get(key);
      if (!g) {
        g = { label: lab, archived_at: at, dates: [] };
        groups.set(key, g);
      }
      g.dates.push(tanggal);
    }

    return [...groups.values()]
      .map((g) => ({
        archived_label: g.label,
        count: g.dates.length,
        start_date: g.dates.reduce((a, b) => (a < b ? a : b)),
        end_date: g.dates.reduce((a, b) => (a > b ? a : b)),
        archived_at: g.archived_at,
      }))
      .sort((a, b) => b.archived_at.localeCompare(a.archived_at));
  }

  try {
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
  if (!data.startDate || !data.endDate || !data.label) {
    throw new Error("startDate, endDate, and label are required");
  }

  const now = new Date().toISOString();
  const sb = getServerSupabaseClient();

  if (sb) {
    const { error } = await sb
      .from("keuangan")
      .update({
        diarsipkan_pada: now,
        label_arsip: data.label,
      })
      .gte("tanggal", data.startDate)
      .lte("tanggal", data.endDate)
      .is("diarsipkan_pada", null);
    if (error) throw error;
    return { archived: 0 };
  }

  try {
    await db.executeRaw(
      `UPDATE keuangan 
       SET diarsipkan_pada = ?, label_arsip = ?
       WHERE tanggal >= ? AND tanggal <= ? AND diarsipkan_pada IS NULL`,
      [now, data.label, data.startDate, data.endDate],
    );
    return { archived: 0 };
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
  archivedAt: string,
): Promise<FinancialReport> {
  try {
    if (!label || !archivedAt) {
      throw new Error("Missing required params: label and archivedAt");
    }

    let cashBooks: any[];

    const sb = getServerSupabaseClient();
    if (sb) {
      const { data, error } = await sb
        .from("keuangan")
        .select("*")
        .eq("label_arsip", label)
        .eq("diarsipkan_pada", archivedAt)
        .order("tanggal", { ascending: true })
        .order("dibuat_pada", { ascending: true });
      if (error) throw error;
      cashBooks = data || [];
    } else {
      cashBooks =
        (await db.queryRaw<any>(
          `SELECT * FROM keuangan 
       WHERE label_arsip = ? AND diarsipkan_pada = ?
       ORDER BY tanggal ASC, dibuat_pada ASC`,
          [label, archivedAt],
        )) || [];
    }

    if (!cashBooks || cashBooks.length === 0) {
      throw new Error("No data found for this archive");
    }

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

      const category = row.kategori_transaksi || "Uncategorized";
      if (!categoryTotals[category]) {
        categoryTotals[category] = 0;
      }
      categoryTotals[category] += row.debit > 0 ? row.debit : row.kredit;
    });

    const latest = cashBooks[cashBooks.length - 1] || {};
    const totalOmzetMetric = Number(latest.omzet ?? 0);
    const totalHppMetric = Number(latest.biaya_bahan ?? 0);
    const operationalExpensesMetric = Number(latest.biaya_operasional ?? 0);
    const netProfitMetric = Number(latest.laba_bersih ?? 0);
    const reportIncome = totalOmzetMetric || totalIncome;
    const grossProfit = reportIncome - totalHppMetric;
    const reportExpenses = totalHppMetric + operationalExpensesMetric;
    const netProfit =
      totalOmzetMetric || totalHppMetric || operationalExpensesMetric
        ? netProfitMetric
        : totalIncome - totalExpenses;
    const profitMargin =
      reportIncome > 0 ? (netProfit / reportIncome) * 100 : 0;

    const categoryBreakdown = Object.entries(categoryTotals).map(
      ([category, amount]) => ({
        category,
        amount,
        percentage:
          totalIncome + totalExpenses > 0
            ? (amount / (totalIncome + totalExpenses)) * 100
            : 0,
      }),
    );

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
        totalIncome: reportIncome,
        totalExpenses: reportExpenses || totalExpenses,
        totalHpp: totalHppMetric,
        grossProfit,
        operationalExpenses: operationalExpensesMetric,
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
 * Formal accounting report for serious accounting views. Unlike the flexible
 * cashbook formulas, this is deterministic and calculated from source
 * transactions: sales, item HPP snapshots, inventory, receivables, and payables.
 */
export async function getFormalAccountingReport(data: {
  startDate: string;
  endDate: string;
}): Promise<FormalAccountingReport> {
  if (!data.startDate || !data.endDate) {
    throw new Error("startDate and endDate are required");
  }
  if (data.startDate > data.endDate) {
    throw new Error("startDate must be before or equal to endDate");
  }

  const [
    salesRes,
    saleItemsRes,
    materialsRes,
    cashbookRes,
    receivablesRes,
    payablesRes,
    purchasesRes,
    customersRes,
    vendorsRes,
  ] = await Promise.all([
    db.query<any>("penjualan", {}),
    db.query<any>("item_penjualan", {}),
    db.query<any>("barang", {}),
    db.query<any>("keuangan", {}),
    db.query<any>("piutang_penjualan", {}),
    db.query<any>("hutang_pembelian", {}),
    db.query<any>("pembelian", {}),
    db.query<any>("pelanggan", {}),
    db.query<any>("vendor", {}),
  ]);

  for (const result of [
    salesRes,
    saleItemsRes,
    materialsRes,
    cashbookRes,
    receivablesRes,
    payablesRes,
    purchasesRes,
    customersRes,
    vendorsRes,
  ]) {
    if (result.error) throw result.error;
  }

  const materials = materialsRes.data || [];
  const materialMap = new Map(materials.map((m: any) => [m.id, m]));
  const customers = customersRes.data || [];
  const customerMap = new Map(customers.map((c: any) => [c.id, c]));
  const vendors = vendorsRes.data || [];
  const vendorMap = new Map(vendors.map((v: any) => [v.id, v]));
  const purchases = purchasesRes.data || [];
  const purchaseMap = new Map(purchases.map((p: any) => [p.id, p]));

  const sales = (salesRes.data || []).filter((sale: any) =>
    inDateRange(sale.tanggal ?? sale.dibuat_pada, data.startDate, data.endDate),
  );
  const saleIdSet = new Set(sales.map((sale: any) => sale.id));
  const saleItems = (saleItemsRes.data || []).filter((item: any) =>
    saleIdSet.has(item.penjualan_id),
  );

  const itemsBySale = new Map<string, any[]>();
  for (const item of saleItems) {
    const arr = itemsBySale.get(item.penjualan_id) || [];
    arr.push(item);
    itemsBySale.set(item.penjualan_id, arr);
  }

  const revenue = sales.reduce((sum: number, sale: any) => {
    return sum + num(sale.total_jumlah);
  }, 0);

  let cogs = 0;
  for (const item of saleItems) {
    const material = materialMap.get(item.barang_id) as any;
    const fallbackHpp =
      num(item.jumlah) *
      (num(item.faktor_konversi) || 1) *
      num(material?.average_cost_per_base_unit);
    cogs += num(item.hpp_total) || fallbackHpp;
  }

  const operationalCategories = new Set(["BIAYA", "TABUNGAN", "KOMISI"]);
  const operationalExpenses = (cashbookRes.data || [])
    .filter((row: any) =>
      inDateRange(row.tanggal, data.startDate, data.endDate),
    )
    .filter((row: any) =>
      operationalCategories.has(String(row.kategori_transaksi)),
    )
    .reduce((sum: number, row: any) => sum + num(row.kredit), 0);

  const grossProfit = revenue - cogs;
  const netProfit = grossProfit - operationalExpenses;
  const cashbookRows = (cashbookRes.data || [])
    .filter((row: any) =>
      inDateRange(row.tanggal, data.startDate, data.endDate),
    )
    .sort((a: any, b: any) => {
      const dateCmp = toDateKey(a.tanggal).localeCompare(toDateKey(b.tanggal));
      if (dateCmp !== 0) return dateCmp;
      return String(a.dibuat_pada || "").localeCompare(
        String(b.dibuat_pada || ""),
      );
    });
  const latestCashbookRow = (cashbookRes.data || [])
    .filter((row: any) => onOrBeforeDate(row.tanggal, data.endDate))
    .sort((a: any, b: any) => {
      const orderCmp = num(a.urutan_tampilan) - num(b.urutan_tampilan);
      if (orderCmp !== 0) return orderCmp;
      const dateCmp = toDateKey(a.tanggal).localeCompare(toDateKey(b.tanggal));
      if (dateCmp !== 0) return dateCmp;
      return String(a.dibuat_pada || "").localeCompare(
        String(b.dibuat_pada || ""),
      );
    })
    .at(-1);
  const totalDebit = cashbookRows.reduce(
    (sum: number, row: any) => sum + num(row.debit),
    0,
  );
  const totalCredit = cashbookRows.reduce(
    (sum: number, row: any) => sum + num(row.kredit),
    0,
  );

  const inventoryItems = materials
    .filter((m: any) => Number(m.lacak_inventori_status) !== 0)
    .map((m: any) => {
      const stock = num(m.jumlah_stok);
      const averageCost = num(m.average_cost_per_base_unit);
      const value = stock * averageCost;
      const lowStock = stock <= num(m.level_stok_minimum);
      return {
        id: String(m.id),
        name: String(m.nama || ""),
        stock,
        unit: String(m.satuan_dasar || ""),
        averageCost,
        value,
        lowStock,
      };
    })
    .sort((a, b) => b.value - a.value);

  const salesMarginRows = sales
    .map((sale: any) => {
      const items = itemsBySale.get(sale.id) || [];
      const saleRevenue = num(sale.total_jumlah);
      const saleCogs = items.reduce((sum: number, item: any) => {
        const material = materialMap.get(item.barang_id) as any;
        const fallbackHpp =
          num(item.jumlah) *
          (num(item.faktor_konversi) || 1) *
          num(material?.average_cost_per_base_unit);
        return sum + (num(item.hpp_total) || fallbackHpp);
      }, 0);
      const saleGrossProfit = saleRevenue - saleCogs;
      const customer = sale.pelanggan_id
        ? (customerMap.get(sale.pelanggan_id) as any)
        : null;
      return {
        invoice: String(sale.nomor_invoice || ""),
        date: toDateKey(sale.tanggal ?? sale.dibuat_pada),
        customerName: String(
          customer?.nama || customer?.nama_perusahaan || "Walk-in",
        ),
        revenue: saleRevenue,
        cogs: saleCogs,
        grossProfit: saleGrossProfit,
        grossMargin: marginPercent(saleGrossProfit, saleRevenue),
        itemCount: items.length,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  const receivableRows = (receivablesRes.data || [])
    .filter((row: any) => ["AKTIF", "SEBAGIAN"].includes(String(row.status)))
    .filter((row: any) => onOrBeforeDate(row.dibuat_pada, data.endDate))
    .map((row: any) => {
      const sale = row.id_penjualan
        ? salesRes.data?.find((s: any) => s.id === row.id_penjualan)
        : null;
      const customer = sale?.pelanggan_id
        ? (customerMap.get(sale.pelanggan_id) as any)
        : null;
      return {
        invoice: String(sale?.nomor_invoice || ""),
        customerName: String(
          customer?.nama || customer?.nama_perusahaan || "Walk-in",
        ),
        amount: num(row.jumlah_piutang),
        paid: num(row.jumlah_terbayar),
        remaining: num(row.sisa_piutang),
        status: String(row.status || ""),
        date: toDateKey(sale?.tanggal ?? sale?.dibuat_pada ?? row.dibuat_pada),
      };
    })
    .sort((a, b) => b.remaining - a.remaining);

  const payableRows = (payablesRes.data || [])
    .filter(
      (row: any) =>
        ["AKTIF", "SEBAGIAN"].includes(String(row.status)) ||
        num(row.sisa_hutang) > 0,
    )
    .map((row: any) => {
      const purchase = row.id_pembelian
        ? (purchaseMap.get(row.id_pembelian) as any)
        : null;
      const vendor = purchase?.vendor_id
        ? (vendorMap.get(purchase.vendor_id) as any)
        : null;
      return {
        purchaseNumber: String(purchase?.nomor_pembelian || ""),
        invoiceNumber: String(purchase?.nomor_faktur || ""),
        vendorName: String(vendor?.nama_perusahaan || "-"),
        amount: num(row.jumlah_hutang),
        paid: num(row.jumlah_terbayar),
        remaining: num(row.sisa_hutang),
        status: String(row.status || ""),
        date: toDateKey(purchase?.tanggal ?? row.dibuat_pada),
      };
    })
    .filter((row) => !row.date || row.date <= data.endDate)
    .sort((a, b) => b.remaining - a.remaining);

  const inventoryValue = inventoryItems.reduce(
    (sum, item) => sum + item.value,
    0,
  );
  const receivableTotal = receivableRows.reduce(
    (sum, row) => sum + row.remaining,
    0,
  );
  const payableTotal = payableRows.reduce((sum, row) => sum + row.remaining, 0);

  return {
    dateRange: {
      startDate: data.startDate,
      endDate: data.endDate,
    },
    cashReport: {
      totalDebit,
      totalCredit,
      netCashFlow: totalDebit - totalCredit,
      endingBalance: num(latestCashbookRow?.saldo),
      omzet: revenue,
      operationalExpenses,
      cogs,
      netProfit,
      cashOnHand: num(latestCashbookRow?.kas ?? latestCashbookRow?.saldo),
      rows: cashbookRows.map((row: any) => ({
        date: toDateKey(row.tanggal),
        category: String(row.kategori_transaksi || ""),
        description: String(row.keperluan || ""),
        debit: num(row.debit),
        credit: num(row.kredit),
        balance: num(row.saldo),
        omzet: num(row.omzet),
        operationalExpenses: num(row.biaya_operasional),
        cogs: num(row.biaya_bahan),
        netProfit: num(row.laba_bersih),
      })),
    },
    profitLoss: {
      revenue,
      cogs,
      grossProfit,
      grossMargin: marginPercent(grossProfit, revenue),
      operationalExpenses,
      netProfit,
      netMargin: marginPercent(netProfit, revenue),
      salesCount: sales.length,
    },
    inventory: {
      totalItems: materials.length,
      trackedItems: inventoryItems.length,
      lowStockItems: inventoryItems.filter((item) => item.lowStock).length,
      inventoryValue,
      items: inventoryItems.slice(0, 50),
    },
    salesMargin: {
      invoiceCount: salesMarginRows.length,
      averageMargin: marginPercent(
        salesMarginRows.reduce((sum, row) => sum + row.grossProfit, 0),
        salesMarginRows.reduce((sum, row) => sum + row.revenue, 0),
      ),
      rows: salesMarginRows.slice(0, 50),
    },
    receivables: {
      count: receivableRows.length,
      totalOutstanding: receivableTotal,
      rows: receivableRows.slice(0, 50),
    },
    payables: {
      count: payableRows.length,
      totalOutstanding: payableTotal,
      rows: payableRows.slice(0, 50),
    },
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Restore archived transactions
 */
export async function restoreArchivedTransactions(
  label: string,
  archivedAt: string,
): Promise<{ restored: number }> {
  if (!label || !archivedAt) {
    throw new Error("Missing required params: label and archivedAt");
  }

  const sb = getServerSupabaseClient();
  if (sb) {
    const { error } = await sb
      .from("keuangan")
      .update({ diarsipkan_pada: null, label_arsip: null })
      .eq("label_arsip", label)
      .eq("diarsipkan_pada", archivedAt);
    if (error) throw error;
    return { restored: 0 };
  }

  try {
    await db.executeRaw(
      `UPDATE keuangan 
       SET diarsipkan_pada = NULL, label_arsip = NULL
       WHERE label_arsip = ? AND diarsipkan_pada = ?`,
      [label, archivedAt],
    );

    return { restored: 0 };
  } catch (error) {
    console.error("Error restoring archived transactions:", error);
    throw error;
  }
}
