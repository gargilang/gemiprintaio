/**
 * Reports Service
 * Universal API for Reports on Tauri and Web
 */

import "server-only";

import { db, getServerSupabaseClient } from "../db-unified";
import { listFinanceCategories } from "./finance-config-service";
import { stripReferenceId } from "@/lib/keperluan-display";
import { humanizeKategoriKode } from "@/app/keuangan/keuangan-utils";

// ============================================================================
// TYPES
// ============================================================================

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

function isPosted(row: any): boolean {
  return String(row?.status_transaksi || "POSTED").toUpperCase() !== "VOIDED";
}

function marginPercent(profit: number, revenue: number): number {
  return revenue > 0 ? (profit / revenue) * 100 : 0;
}

/**
 * Urutkan baris buku kas sesuai kaskade engine AST: `urutan_tampilan` dulu,
 * lalu `dibuat_pada` sebagai pemecah seri. Ini urutan yang sama dipakai
 * `cashbook-recalc` untuk menghitung running total, jadi nilai kumulatif
 * kolom (omzet, biaya, laba) konsisten dengan halaman Keuangan.
 */
function sortByCascade<T extends Record<string, unknown>>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const orderCmp = num(a.urutan_tampilan) - num(b.urutan_tampilan);
    if (orderCmp !== 0) return orderCmp;
    return String(a.dibuat_pada || "").localeCompare(String(b.dibuat_pada || ""));
  });
}

/**
 * Nilai kumulatif sebuah kolom AST (mis. "omzet") pada baris aktif TERAKHIR
 * yang tanggalnya memenuhi `predicate`. Kolom-kolom ini adalah running total
 * sepanjang seluruh buku kas, jadi nilai baris terakhir = akumulasi sejak awal.
 *
 * Angka periode dihitung sebagai selisih dua titik kumulatif:
 *   periode = cumulativeColumn(... ≤ endDate) − cumulativeColumn(... < startDate)
 */
function cumulativeColumn(
  sortedRows: any[],
  column: string,
  predicate: (dateKey: string) => boolean,
): number {
  for (let i = sortedRows.length - 1; i >= 0; i--) {
    const key = toDateKey(sortedRows[i].tanggal);
    if (key && predicate(key)) return num(sortedRows[i][column]);
  }
  return 0;
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
    financeCategories,
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
    listFinanceCategories(),
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
  const purchases = (purchasesRes.data || []).filter(isPosted);
  const purchaseMap = new Map(purchases.map((p: any) => [p.id, p]));
  const categoryLabelMap = new Map(
    financeCategories.map((c) => [c.category_code, c.display_name])
  );
  const labelKategori = (code: string) =>
    categoryLabelMap.get(code) || humanizeKategoriKode(code);

  const sales = (salesRes.data || [])
    .filter(isPosted)
    .filter((sale: any) =>
      inDateRange(
        sale.tanggal ?? sale.dibuat_pada,
        data.startDate,
        data.endDate,
      ),
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

  const activeCashbookRows = (cashbookRes.data || []).filter(isPosted);

  // Angka kartu uang dibaca dari kolom hasil engine AST (buku besar = sumber
  // kebenaran), bukan dihitung ulang dari tabel POS. Kolom-kolom ini running
  // total kumulatif, jadi nilai periode = selisih dua titik kumulatif.
  const sortedActiveRows = sortByCascade(activeCashbookRows);
  const beforeStart = (key: string) => key < data.startDate;
  const onOrBeforeEnd = (key: string) => key <= data.endDate;
  const periodColumn = (column: string) =>
    cumulativeColumn(sortedActiveRows, column, onOrBeforeEnd) -
    cumulativeColumn(sortedActiveRows, column, beforeStart);

  const omzetPeriode = periodColumn("omzet");
  const operationalExpenses = periodColumn("biaya_operasional");
  const cogsPeriode = periodColumn("biaya_bahan");
  const totalBiaya = operationalExpenses + cogsPeriode;
  const grossProfit = omzetPeriode - cogsPeriode;
  const netProfit = omzetPeriode - totalBiaya;
  const cashbookRows = activeCashbookRows
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
  const latestCashbookRow = activeCashbookRows
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
        invoice: String(sale.nomor_faktur || ""),
        date: toDateKey(sale.tanggal ?? sale.dibuat_pada),
        customerName: String(
          customer?.nama || customer?.nama_perusahaan || "Pelanggan Umum",
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
        invoice: String(sale?.nomor_faktur || ""),
        customerName: String(
          customer?.nama || customer?.nama_perusahaan || "Pelanggan Umum",
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
        category: labelKategori(String(row.kategori_transaksi || "")),
        description: stripReferenceId(row.keperluan) || "",
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
