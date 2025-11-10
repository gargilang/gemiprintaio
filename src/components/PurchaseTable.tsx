"use client";

import { useState, useMemo, memo } from "react";

interface Purchase {
  id: string;
  tanggal: string;
  nomor_faktur: string;
  id_vendor: string | null;
  vendor_name: string | null;
  catatan: string | null;
  total_harga: number;
  items: {
    id: string;
    id_barang: string;
    nama_barang: string;
    id_satuan: string;
    nama_satuan: string;
    faktor_konversi: number;
    jumlah: number;
    harga_beli: number;
  }[];
}

interface PurchaseTableProps {
  purchases: Purchase[];
  loading: boolean;
  onEdit: (purchase: Purchase) => void;
  onDelete: (purchase: Purchase) => void;
}

const PurchaseRow = memo(
  ({
    purchase,
    index,
    onEdit,
    onDelete,
  }: {
    purchase: Purchase;
    index: number;
    onEdit: (purchase: Purchase) => void;
    onDelete: (purchase: Purchase) => void;
  }) => {
    const [showDetails, setShowDetails] = useState(false);
    const tanggalFormatted = new Date(purchase.tanggal).toLocaleDateString(
      "id-ID",
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }
    );

    return (
      <>
        <tr
          className={`border-b border-gray-200 hover:bg-indigo-50 transition-all cursor-pointer ${
            index % 2 === 0 ? "bg-white" : "bg-gray-50"
          }`}
          onClick={() => setShowDetails(!showDetails)}
        >
          <td className="px-4 py-3 text-sm text-gray-700">
            {tanggalFormatted}
          </td>
          <td className="px-4 py-3">
            <div className="font-semibold text-gray-800">
              {purchase.nomor_faktur}
            </div>
            {purchase.catatan && (
              <div className="text-xs text-gray-500 mt-1 line-clamp-1">
                {purchase.catatan}
              </div>
            )}
          </td>
          <td className="px-4 py-3 text-sm text-gray-700">
            {purchase.vendor_name || (
              <span className="text-gray-400 italic">Tanpa Vendor</span>
            )}
          </td>
          <td className="px-4 py-3 text-center">
            <span className="inline-block px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs font-semibold">
              {purchase.items.length} item
            </span>
          </td>
          <td className="px-4 py-3 text-right font-semibold text-gray-800">
            Rp {purchase.total_harga.toLocaleString("id-ID")}
          </td>
          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => onEdit(purchase)}
                className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                title="Edit"
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
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
              </button>
              <button
                onClick={() => onDelete(purchase)}
                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Hapus"
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
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </div>
          </td>
        </tr>
        {showDetails && (
          <tr className="bg-gradient-to-r from-indigo-50/50 to-purple-50/50">
            <td colSpan={6} className="px-4 py-3">
              <div className="text-xs">
                <div className="font-semibold text-gray-700 mb-2">
                  Detail Item:
                </div>
                <div className="space-y-1">
                  {purchase.items.map((item, idx) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between py-1 px-2 bg-white/60 rounded"
                    >
                      <div className="flex-1">
                        <span className="font-semibold text-gray-800">
                          {idx + 1}. {item.nama_barang}
                        </span>
                        <span className="text-gray-500 ml-2">
                          ({item.nama_satuan})
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-gray-700">
                        <span>
                          Qty:{" "}
                          <span className="font-semibold">{item.jumlah}</span>
                        </span>
                        <span>×</span>
                        <span>
                          Rp{" "}
                          <span className="font-semibold">
                            {item.harga_beli.toLocaleString("id-ID")}
                          </span>
                        </span>
                        <span>=</span>
                        <span className="font-semibold text-indigo-700">
                          Rp{" "}
                          {(item.jumlah * item.harga_beli).toLocaleString(
                            "id-ID"
                          )}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </td>
          </tr>
        )}
      </>
    );
  }
);

PurchaseRow.displayName = "PurchaseRow";

export default function PurchaseTable({
  purchases,
  loading,
  onEdit,
  onDelete,
}: PurchaseTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "total">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Filter and sort
  const filteredPurchases = useMemo(() => {
    let filtered = [...purchases];

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.nomor_faktur.toLowerCase().includes(query) ||
          (p.vendor_name && p.vendor_name.toLowerCase().includes(query)) ||
          (p.catatan && p.catatan.toLowerCase().includes(query))
      );
    }

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;
      if (sortBy === "date") {
        comparison =
          new Date(a.tanggal).getTime() - new Date(b.tanggal).getTime();
      } else if (sortBy === "total") {
        comparison = a.total_harga - b.total_harga;
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });

    return filtered;
  }, [purchases, searchQuery, sortBy, sortOrder]);

  const totalPembelian = useMemo(() => {
    return filteredPurchases.reduce((sum, p) => sum + p.total_harga, 0);
  }, [filteredPurchases]);

  const handleSort = (field: "date" | "total") => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search and Stats */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 max-w-md">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nomor faktur, vendor, catatan..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-xs text-gray-500">Total Pembelian</div>
            <div className="text-lg font-bold text-indigo-700">
              Rp {totalPembelian.toLocaleString("id-ID")}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-500">Transaksi</div>
            <div className="text-lg font-bold text-gray-800">
              {filteredPurchases.length}
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      {filteredPurchases.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
          <div className="text-gray-400 mb-2">
            <svg
              className="w-16 h-16 mx-auto"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
              />
            </svg>
          </div>
          <p className="text-gray-600 font-semibold">
            {searchQuery
              ? "Tidak ada pembelian yang cocok dengan pencarian"
              : "Belum ada data pembelian"}
          </p>
          <p className="text-gray-500 text-sm mt-1">
            {searchQuery
              ? "Coba kata kunci lain"
              : "Tambahkan pembelian pertama Anda menggunakan form di atas"}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white">
              <tr>
                <th
                  className="px-4 py-3 text-left text-xs font-semibold cursor-pointer hover:bg-white/10 transition-colors"
                  onClick={() => handleSort("date")}
                >
                  <div className="flex items-center gap-1">
                    Tanggal
                    {sortBy === "date" && (
                      <span className="text-xs">
                        {sortOrder === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold">
                  Nomor Faktur
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold">
                  Vendor
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold">
                  Items
                </th>
                <th
                  className="px-4 py-3 text-right text-xs font-semibold cursor-pointer hover:bg-white/10 transition-colors"
                  onClick={() => handleSort("total")}
                >
                  <div className="flex items-center justify-end gap-1">
                    Total Harga
                    {sortBy === "total" && (
                      <span className="text-xs">
                        {sortOrder === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </div>
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredPurchases.map((purchase, index) => (
                <PurchaseRow
                  key={purchase.id}
                  purchase={purchase}
                  index={index}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Info Text */}
      {filteredPurchases.length > 0 && (
        <div className="text-xs text-gray-500 text-center">
          Klik baris untuk melihat detail item pembelian
        </div>
      )}
    </div>
  );
}
