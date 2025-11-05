"use client";

import MainShell from "@/components/MainShell";

export default function PurchasesPage() {
  return (
    <MainShell title="Purchase Orders">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">
          Purchase Orders Management
        </h2>
        <p className="text-gray-600">
          🚧 Halaman ini sedang dalam pengembangan dengan SQLite offline.
        </p>
        <p className="text-gray-500 mt-2 text-sm">
          Fitur pembelian barang dari vendor, pencatatan stok masuk, dan
          pembayaran (cash/hutang) akan diimplementasikan dengan API SQLite.
        </p>
      </div>
    </MainShell>
  );
}
