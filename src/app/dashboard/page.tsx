'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Profile } from '@/types/database';

export default function DashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        router.push('/auth/login');
        return;
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileData) {
        setProfile(profileData);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/auth/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">GemiPrintaIO</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">
              {profile?.full_name || profile?.email} ({profile?.role})
            </span>
            <button
              onClick={handleLogout}
              className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-8">Dashboard</h2>

        {/* Menu Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* POS */}
          <Link
            href="/pos"
            className="bg-white p-6 rounded-lg shadow hover:shadow-lg transition-shadow"
          >
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              🛒 POS / Kasir
            </h3>
            <p className="text-gray-600">
              Sistem Point of Sale untuk transaksi penjualan
            </p>
          </Link>

          {/* Materials */}
          <Link
            href="/materials"
            className="bg-white p-6 rounded-lg shadow hover:shadow-lg transition-shadow"
          >
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              📦 Data Bahan
            </h3>
            <p className="text-gray-600">
              Kelola bahan dengan harga beli, jual, dan member
            </p>
          </Link>

          {/* Customers */}
          <Link
            href="/customers"
            className="bg-white p-6 rounded-lg shadow hover:shadow-lg transition-shadow"
          >
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              👥 Pelanggan
            </h3>
            <p className="text-gray-600">
              Kelola data pelanggan perorangan dan PT
            </p>
          </Link>

          {/* Vendors */}
          <Link
            href="/vendors"
            className="bg-white p-6 rounded-lg shadow hover:shadow-lg transition-shadow"
          >
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              🏢 Vendor
            </h3>
            <p className="text-gray-600">
              Kelola data vendor dan supplier
            </p>
          </Link>

          {/* Finance */}
          <Link
            href="/finance"
            className="bg-white p-6 rounded-lg shadow hover:shadow-lg transition-shadow"
          >
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              💰 Keuangan
            </h3>
            <p className="text-gray-600">
              Hutang, piutang, kasbon pegawai, dan transaksi lainnya
            </p>
          </Link>

          {/* Reports */}
          <Link
            href="/reports"
            className="bg-white p-6 rounded-lg shadow hover:shadow-lg transition-shadow"
          >
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              📊 Laporan
            </h3>
            <p className="text-gray-600">
              Laporan keuangan dan inventori
            </p>
          </Link>
        </div>
      </main>
    </div>
  );
}
