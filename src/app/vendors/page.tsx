"use client";

import MainShell from "@/components/MainShell";

export default function VendorsPage() {
  return (
    <MainShell title="Vendor">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Vendor Management</h2>
        <p className="text-gray-600">
          🚧 Halaman ini sedang dalam pengembangan dengan SQLite offline.
        </p>
        <p className="text-gray-500 mt-2 text-sm">
          Fitur CRUD vendors akan diimplementasikan dengan API SQLite.
        </p>
      </div>
    </MainShell>
  );
}
