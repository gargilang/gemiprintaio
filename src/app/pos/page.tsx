"use client";

import MainShell from "@/components/MainShell";

export default function POSPage() {
  return (
    <MainShell title="POS / Kasir">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Point of Sale (POS)</h2>
        <p className="text-gray-600">
          🚧 Halaman ini sedang dalam pengembangan dengan SQLite offline.
        </p>
        <p className="text-gray-500 mt-2 text-sm">
          Fitur POS, transaksi penjualan, invoice akan diimplementasikan dengan
          API SQLite.
        </p>
      </div>
    </MainShell>
  );
}
