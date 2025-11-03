"use client";

import MainShell from "@/components/MainShell";

export default function MaterialsPage() {
  return (
    <MainShell title="Data Bahan">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">
          Materials / Bahan Management
        </h2>
        <p className="text-gray-600">
          🚧 Halaman ini sedang dalam pengembangan dengan SQLite offline.
        </p>
        <p className="text-gray-500 mt-2 text-sm">
          Fitur CRUD materials, stock management akan diimplementasikan dengan
          API SQLite.
        </p>
      </div>
    </MainShell>
  );
}
