"use client";

import { useState } from "react";
import MainShell from "@/components/MainShell";
import AddMaterialModal from "@/components/AddMaterialModal";
import { BoxIcon } from "@/components/icons/ContentIcons";

export default function MaterialsPage() {
  const [showModal, setShowModal] = useState(false);

  const handleSuccess = () => {
    // TODO: Reload materials data
    console.log("Material saved successfully!");
  };

  return (
    <MainShell title="Data Bahan">
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Total Items */}
          <div className="bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl shadow-lg p-6 text-white">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-white/20 rounded-lg">
                  <BoxIcon size={20} className="text-white" />
                </div>
                <h3 className="text-sm font-semibold uppercase tracking-wide">
                  Total Jenis Bahan
                </h3>
              </div>
            </div>
            <p className="text-3xl font-bold">0</p>
            <p className="text-xs mt-2 text-emerald-100">Item terdaftar</p>
          </div>

          {/* Total Stock Value */}
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg p-6 text-white">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-white/20 rounded-lg">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                    />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold uppercase tracking-wide">
                  Nilai Stok
                </h3>
              </div>
            </div>
            <p className="text-3xl font-bold">Rp 0</p>
            <p className="text-xs mt-2 text-blue-100">Total nilai inventory</p>
          </div>

          {/* Low Stock Alert */}
          <div className="bg-gradient-to-br from-orange-500 to-red-500 rounded-xl shadow-lg p-6 text-white">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-white/20 rounded-lg">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold uppercase tracking-wide">
                  Stok Menipis
                </h3>
              </div>
            </div>
            <p className="text-3xl font-bold">0</p>
            <p className="text-xs mt-2 text-orange-100">Item perlu restock</p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowModal(true)}
                className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-lg hover:from-emerald-600 hover:to-green-700 transition-all font-semibold shadow-md flex items-center gap-2"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                Tambah Bahan
              </button>

              <button className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all font-semibold flex items-center gap-2">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                Import CSV
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Cari bahan..."
                  className="px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
                <svg
                  className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>

              <button className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all font-semibold flex items-center gap-2">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                  />
                </svg>
                Filter
              </button>
            </div>
          </div>
        </div>

        {/* Materials Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-emerald-500 to-green-600 text-white">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-bold uppercase tracking-wider">
                    Nama Bahan
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-bold uppercase tracking-wider">
                    Unit
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-bold uppercase tracking-wider">
                    Stok
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-bold uppercase tracking-wider">
                    Harga Beli
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-bold uppercase tracking-wider">
                    Harga Jual
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-bold uppercase tracking-wider">
                    Harga Member
                  </th>
                  <th className="px-4 py-3 text-center text-sm font-bold uppercase tracking-wider">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-12 text-center text-gray-500"
                  >
                    <div className="flex flex-col items-center gap-3">
                      <BoxIcon size={48} className="text-gray-300" />
                      <p className="text-lg font-semibold">
                        Belum ada data bahan
                      </p>
                      <p className="text-sm">
                        Klik tombol "Tambah Bahan" untuk menambahkan data baru
                      </p>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Add Material Modal */}
        <AddMaterialModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          onSuccess={handleSuccess}
        />
      </div>
    </MainShell>
  );
}
