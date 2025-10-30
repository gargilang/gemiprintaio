'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface SalesReport {
  total_sales: number;
  total_profit: number;
  transaction_count: number;
}

interface InventoryReport {
  total_value: number;
  low_stock_count: number;
}

interface FinancialSummary {
  total_debt: number;
  total_receivable: number;
  total_kasbon: number;
  other_income: number;
  other_expense: number;
}

export default function ReportsPage() {
  const router = useRouter();
  const [dateFrom, setDateFrom] = useState(new Date(new Date().setDate(1)).toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
  const [salesReport, setSalesReport] = useState<SalesReport | null>(null);
  const [inventoryReport, setInventoryReport] = useState<InventoryReport | null>(null);
  const [financialSummary, setFinancialSummary] = useState<FinancialSummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkAuth();
    generateReports();
  }, []);

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/auth/login');
    }
  };

  const generateReports = async () => {
    setLoading(true);
    try {
      await Promise.all([
        generateSalesReport(),
        generateInventoryReport(),
        generateFinancialSummary(),
      ]);
    } catch (error) {
      console.error('Error generating reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateSalesReport = async () => {
    const { data: sales } = await supabase
      .from('sales')
      .select('id, total_amount, created_at')
      .gte('created_at', `${dateFrom}T00:00:00`)
      .lte('created_at', `${dateTo}T23:59:59`);

    if (!sales) return;

    const total_sales = sales.reduce((sum, sale) => sum + sale.total_amount, 0);
    const transaction_count = sales.length;

    // Calculate profit (simplified - would need more complex calculation with costs)
    const { data: items } = await supabase
      .from('sales_items')
      .select('sale_id, material_id, quantity, unit_price, subtotal')
      .in('sale_id', sales.map(s => s.id));

    let total_cost = 0;
    if (items) {
      for (const item of items) {
        const { data: material } = await supabase
          .from('materials')
          .select('purchase_price')
          .eq('id', item.material_id)
          .single();
        
        if (material) {
          total_cost += material.purchase_price * item.quantity;
        }
      }
    }

    setSalesReport({
      total_sales,
      total_profit: total_sales - total_cost,
      transaction_count,
    });
  };

  const generateInventoryReport = async () => {
    const { data: materials } = await supabase
      .from('materials')
      .select('*');

    if (!materials) return;

    const total_value = materials.reduce(
      (sum, m) => sum + (m.stock_quantity * m.purchase_price),
      0
    );

    const low_stock_count = materials.filter(
      m => m.stock_quantity <= m.min_stock_level
    ).length;

    setInventoryReport({
      total_value,
      low_stock_count,
    });
  };

  const generateFinancialSummary = async () => {
    const [financialRes, otherRes] = await Promise.all([
      supabase
        .from('financial_transactions')
        .select('transaction_type, amount, is_paid')
        .gte('created_at', `${dateFrom}T00:00:00`)
        .lte('created_at', `${dateTo}T23:59:59`),
      supabase
        .from('other_transactions')
        .select('transaction_type, amount')
        .gte('transaction_date', dateFrom)
        .lte('transaction_date', dateTo),
    ]);

    const financial = financialRes.data || [];
    const other = otherRes.data || [];

    const total_debt = financial
      .filter(f => f.transaction_type === 'debt' && !f.is_paid)
      .reduce((sum, f) => sum + f.amount, 0);

    const total_receivable = financial
      .filter(f => f.transaction_type === 'receivable' && !f.is_paid)
      .reduce((sum, f) => sum + f.amount, 0);

    const total_kasbon = financial
      .filter(f => f.transaction_type === 'kasbon' && !f.is_paid)
      .reduce((sum, f) => sum + f.amount, 0);

    const other_income = other
      .filter(o => o.transaction_type === 'income')
      .reduce((sum, o) => sum + o.amount, 0);

    const other_expense = other
      .filter(o => o.transaction_type === 'expense')
      .reduce((sum, o) => sum + o.amount, 0);

    setFinancialSummary({
      total_debt,
      total_receivable,
      total_kasbon,
      other_income,
      other_expense,
    });
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Laporan Keuangan</h1>
          <Link
            href="/dashboard"
            className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700"
          >
            Kembali
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Date Filter */}
        <div className="bg-white p-6 rounded-lg shadow mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Periode Laporan</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Dari Tanggal
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sampai Tanggal
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={generateReports}
                disabled={loading}
                className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400"
              >
                {loading ? 'Memuat...' : 'Generate Laporan'}
              </button>
            </div>
          </div>
        </div>

        {/* Sales Report */}
        <div className="bg-white p-6 rounded-lg shadow mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Laporan Penjualan</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Total Penjualan</p>
              <p className="text-2xl font-bold text-blue-600">
                Rp {(salesReport?.total_sales || 0).toLocaleString('id-ID')}
              </p>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Laba Kotor</p>
              <p className="text-2xl font-bold text-green-600">
                Rp {(salesReport?.total_profit || 0).toLocaleString('id-ID')}
              </p>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Jumlah Transaksi</p>
              <p className="text-2xl font-bold text-purple-600">
                {salesReport?.transaction_count || 0}
              </p>
            </div>
          </div>
        </div>

        {/* Inventory Report */}
        <div className="bg-white p-6 rounded-lg shadow mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Laporan Inventori</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-indigo-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Nilai Total Stok</p>
              <p className="text-2xl font-bold text-indigo-600">
                Rp {(inventoryReport?.total_value || 0).toLocaleString('id-ID')}
              </p>
            </div>
            <div className="bg-red-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Bahan Stok Rendah</p>
              <p className="text-2xl font-bold text-red-600">
                {inventoryReport?.low_stock_count || 0} item
              </p>
            </div>
          </div>
        </div>

        {/* Financial Summary */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Ringkasan Keuangan</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-red-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Total Hutang (Belum Lunas)</p>
              <p className="text-2xl font-bold text-red-600">
                Rp {(financialSummary?.total_debt || 0).toLocaleString('id-ID')}
              </p>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Total Piutang (Belum Lunas)</p>
              <p className="text-2xl font-bold text-green-600">
                Rp {(financialSummary?.total_receivable || 0).toLocaleString('id-ID')}
              </p>
            </div>
            <div className="bg-yellow-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Total Kasbon (Belum Lunas)</p>
              <p className="text-2xl font-bold text-yellow-600">
                Rp {(financialSummary?.total_kasbon || 0).toLocaleString('id-ID')}
              </p>
            </div>
            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Pemasukan Lain</p>
              <p className="text-2xl font-bold text-blue-600">
                Rp {(financialSummary?.other_income || 0).toLocaleString('id-ID')}
              </p>
            </div>
            <div className="bg-orange-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Pengeluaran Lain</p>
              <p className="text-2xl font-bold text-orange-600">
                Rp {(financialSummary?.other_expense || 0).toLocaleString('id-ID')}
              </p>
            </div>
            <div className="bg-teal-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Saldo Bersih</p>
              <p className="text-2xl font-bold text-teal-600">
                Rp {(
                  (salesReport?.total_profit || 0) +
                  (financialSummary?.other_income || 0) -
                  (financialSummary?.other_expense || 0)
                ).toLocaleString('id-ID')}
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
