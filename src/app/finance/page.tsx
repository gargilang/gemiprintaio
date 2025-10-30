'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { FinancialTransaction, OtherTransaction, Profile, Customer, Vendor } from '@/types/database';

export default function FinancePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'financial' | 'other'>('financial');
  const [financialTransactions, setFinancialTransactions] = useState<FinancialTransaction[]>([]);
  const [otherTransactions, setOtherTransactions] = useState<OtherTransaction[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<'financial' | 'other'>('financial');
  const [loading, setLoading] = useState(false);

  const [financialFormData, setFinancialFormData] = useState({
    transaction_type: 'debt' as 'debt' | 'receivable' | 'kasbon',
    customer_id: '',
    vendor_id: '',
    employee_id: '',
    amount: '',
    description: '',
  });

  const [otherFormData, setOtherFormData] = useState({
    transaction_type: 'income' as 'income' | 'expense',
    category: '',
    amount: '',
    description: '',
    transaction_date: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    checkAuth();
    loadData();
  }, []);

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/auth/login');
    }
  };

  const loadData = async () => {
    const [financialRes, otherRes, customersRes, vendorsRes, employeesRes] = await Promise.all([
      supabase.from('financial_transactions').select('*').order('created_at', { ascending: false }),
      supabase.from('other_transactions').select('*').order('transaction_date', { ascending: false }),
      supabase.from('customers').select('*').order('name'),
      supabase.from('vendors').select('*').order('name'),
      supabase.from('profiles').select('*').order('full_name'),
    ]);

    if (financialRes.data) setFinancialTransactions(financialRes.data);
    if (otherRes.data) setOtherTransactions(otherRes.data);
    if (customersRes.data) setCustomers(customersRes.data);
    if (vendorsRes.data) setVendors(vendorsRes.data);
    if (employeesRes.data) setEmployees(employeesRes.data);
  };

  const handleFinancialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const dataToSave = {
        transaction_type: financialFormData.transaction_type,
        customer_id: financialFormData.customer_id || null,
        vendor_id: financialFormData.vendor_id || null,
        employee_id: financialFormData.employee_id || null,
        amount: parseFloat(financialFormData.amount),
        description: financialFormData.description,
        is_paid: false,
        created_by: user?.id,
      };

      const { error } = await supabase
        .from('financial_transactions')
        .insert(dataToSave);

      if (error) throw error;

      setShowForm(false);
      resetFinancialForm();
      loadData();
    } catch (error) {
      console.error('Error:', error);
      alert('Terjadi kesalahan');
    } finally {
      setLoading(false);
    }
  };

  const handleOtherSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const dataToSave = {
        transaction_type: otherFormData.transaction_type,
        category: otherFormData.category,
        amount: parseFloat(otherFormData.amount),
        description: otherFormData.description,
        transaction_date: otherFormData.transaction_date,
        created_by: user?.id,
      };

      const { error } = await supabase
        .from('other_transactions')
        .insert(dataToSave);

      if (error) throw error;

      setShowForm(false);
      resetOtherForm();
      loadData();
    } catch (error) {
      console.error('Error:', error);
      alert('Terjadi kesalahan');
    } finally {
      setLoading(false);
    }
  };

  const markAsPaid = async (id: string) => {
    try {
      const { error } = await supabase
        .from('financial_transactions')
        .update({ is_paid: true, payment_date: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      loadData();
    } catch (error) {
      console.error('Error:', error);
      alert('Terjadi kesalahan');
    }
  };

  const resetFinancialForm = () => {
    setFinancialFormData({
      transaction_type: 'debt',
      customer_id: '',
      vendor_id: '',
      employee_id: '',
      amount: '',
      description: '',
    });
  };

  const resetOtherForm = () => {
    setOtherFormData({
      transaction_type: 'income',
      category: '',
      amount: '',
      description: '',
      transaction_date: new Date().toISOString().split('T')[0],
    });
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Manajemen Keuangan</h1>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setShowForm(true);
                setFormType(activeTab);
              }}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
            >
              Tambah Transaksi
            </button>
            <Link
              href="/dashboard"
              className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700"
            >
              Kembali
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tabs */}
        <div className="mb-6 border-b border-gray-200">
          <nav className="flex space-x-8">
            <button
              onClick={() => setActiveTab('financial')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'financial'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Hutang, Piutang & Kasbon
            </button>
            <button
              onClick={() => setActiveTab('other')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'other'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Pemasukan & Pengeluaran Lain
            </button>
          </nav>
        </div>

        {/* Forms */}
        {showForm && formType === 'financial' && (
          <div className="bg-white p-6 rounded-lg shadow mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Tambah Transaksi Keuangan
            </h2>
            <form onSubmit={handleFinancialSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Jenis Transaksi *
                </label>
                <select
                  value={financialFormData.transaction_type}
                  onChange={(e) => setFinancialFormData({ ...financialFormData, transaction_type: e.target.value as 'debt' | 'receivable' | 'kasbon' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="debt">Hutang (ke Vendor)</option>
                  <option value="receivable">Piutang (dari Pelanggan)</option>
                  <option value="kasbon">Kasbon Pegawai</option>
                </select>
              </div>

              {financialFormData.transaction_type === 'debt' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Vendor
                  </label>
                  <select
                    value={financialFormData.vendor_id}
                    onChange={(e) => setFinancialFormData({ ...financialFormData, vendor_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Pilih vendor...</option>
                    {vendors.map(vendor => (
                      <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {financialFormData.transaction_type === 'receivable' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Pelanggan
                  </label>
                  <select
                    value={financialFormData.customer_id}
                    onChange={(e) => setFinancialFormData({ ...financialFormData, customer_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Pilih pelanggan...</option>
                    {customers.map(customer => (
                      <option key={customer.id} value={customer.id}>{customer.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {financialFormData.transaction_type === 'kasbon' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Pegawai
                  </label>
                  <select
                    value={financialFormData.employee_id}
                    onChange={(e) => setFinancialFormData({ ...financialFormData, employee_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Pilih pegawai...</option>
                    {employees.map(employee => (
                      <option key={employee.id} value={employee.id}>
                        {employee.full_name || employee.email}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Jumlah *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={financialFormData.amount}
                  onChange={(e) => setFinancialFormData({ ...financialFormData, amount: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Keterangan *
                </label>
                <textarea
                  value={financialFormData.description}
                  onChange={(e) => setFinancialFormData({ ...financialFormData, description: e.target.value })}
                  required
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="md:col-span-2 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    resetFinancialForm();
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {loading ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        )}

        {showForm && formType === 'other' && (
          <div className="bg-white p-6 rounded-lg shadow mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Tambah Pemasukan/Pengeluaran Lain
            </h2>
            <form onSubmit={handleOtherSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Jenis *
                </label>
                <select
                  value={otherFormData.transaction_type}
                  onChange={(e) => setOtherFormData({ ...otherFormData, transaction_type: e.target.value as 'income' | 'expense' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="income">Pemasukan</option>
                  <option value="expense">Pengeluaran</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kategori *
                </label>
                <input
                  type="text"
                  value={otherFormData.category}
                  onChange={(e) => setOtherFormData({ ...otherFormData, category: e.target.value })}
                  required
                  placeholder="e.g., Listrik, Sewa, Lain-lain"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tanggal *
                </label>
                <input
                  type="date"
                  value={otherFormData.transaction_date}
                  onChange={(e) => setOtherFormData({ ...otherFormData, transaction_date: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Jumlah *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={otherFormData.amount}
                  onChange={(e) => setOtherFormData({ ...otherFormData, amount: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Keterangan *
                </label>
                <textarea
                  value={otherFormData.description}
                  onChange={(e) => setOtherFormData({ ...otherFormData, description: e.target.value })}
                  required
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="md:col-span-2 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    resetOtherForm();
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {loading ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Content based on active tab */}
        {activeTab === 'financial' && (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Jenis
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pihak Terkait
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Jumlah
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Keterangan
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {financialTransactions.map(transaction => {
                  let relatedParty = '';
                  if (transaction.customer_id) {
                    const customer = customers.find(c => c.id === transaction.customer_id);
                    relatedParty = customer?.name || '';
                  } else if (transaction.vendor_id) {
                    const vendor = vendors.find(v => v.id === transaction.vendor_id);
                    relatedParty = vendor?.name || '';
                  } else if (transaction.employee_id) {
                    const employee = employees.find(e => e.id === transaction.employee_id);
                    relatedParty = employee?.full_name || employee?.email || '';
                  }

                  return (
                    <tr key={transaction.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {transaction.transaction_type === 'debt' && 'Hutang'}
                        {transaction.transaction_type === 'receivable' && 'Piutang'}
                        {transaction.transaction_type === 'kasbon' && 'Kasbon'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {relatedParty || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        Rp {transaction.amount.toLocaleString('id-ID')}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {transaction.description}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {transaction.is_paid ? (
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                            Lunas
                          </span>
                        ) : (
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                            Belum Lunas
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        {!transaction.is_paid && (
                          <button
                            onClick={() => markAsPaid(transaction.id)}
                            className="text-green-600 hover:text-green-900"
                          >
                            Tandai Lunas
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'other' && (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tanggal
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Jenis
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Kategori
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Jumlah
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Keterangan
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {otherTransactions.map(transaction => (
                  <tr key={transaction.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(transaction.transaction_date).toLocaleDateString('id-ID')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {transaction.transaction_type === 'income' ? (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                          Pemasukan
                        </span>
                      ) : (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                          Pengeluaran
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {transaction.category}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      Rp {transaction.amount.toLocaleString('id-ID')}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {transaction.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
