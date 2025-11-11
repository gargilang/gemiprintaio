"use client";

import { useState, useEffect, useMemo, useRef, memo } from "react";
import { useRouter } from "next/navigation";
import { useClickOutside } from "@/hooks/useClickOutside";
import MainShell from "@/components/MainShell";
import NotificationToast, {
  NotificationToastProps,
} from "@/components/NotificationToast";
import ConfirmDialog from "@/components/ConfirmDialog";
import { BuildingIcon } from "@/components/icons/PageIcons";
import { CheckIcon } from "@/components/icons/ContentIcons";

// Memoized Vendor Row Component - mencegah re-render yang tidak perlu
const VendorRow = memo(
  ({
    vendor,
    index,
    onEdit,
    onDelete,
  }: {
    vendor: Vendor;
    index: number;
    onEdit: (vendor: Vendor) => void;
    onDelete: (vendor: Vendor) => void;
  }) => {
    return (
      <tr
        className={`hover:bg-indigo-50 transition-all cursor-default ${
          index % 2 === 0 ? "bg-white" : "bg-gray-50"
        }`}
      >
        <td className="px-4 py-3">
          <div className="font-semibold text-gray-800">
            {vendor.nama_perusahaan}
          </div>
          <div className="text-xs text-gray-800 mt-1">
            CP: {vendor.kontak_person || "-"}
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-gray-700">{vendor.email}</td>
        <td className="px-4 py-3 text-sm text-gray-700">{vendor.telepon}</td>
        <td className="px-4 py-3 text-sm text-gray-600">
          {vendor.ketentuan_bayar || "-"}
        </td>
        <td className="px-4 py-3 text-center">
          {vendor.aktif_status === 1 ? (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
              <CheckIcon size={14} />
              Aktif
            </span>
          ) : (
            <span className="inline-flex items-center px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-semibold">
              Non-Aktif
            </span>
          )}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => onEdit(vendor)}
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
              onClick={() => onDelete(vendor)}
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
    );
  }
);

VendorRow.displayName = "VendorRow";

interface User {
  id: string;
  username: string;
  role: string;
}

interface Vendor {
  id: string;
  nama_perusahaan: string;
  email: string;
  telepon: string;
  alamat: string;
  kontak_person?: string;
  ketentuan_bayar?: string;
  aktif_status: number;
  catatan?: string;
  dibuat_pada: string;
}

export default function VendorsPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [formData, setFormData] = useState({
    nama_perusahaan: "",
    email: "",
    telepon: "",
    alamat: "",
    kontak_person: "",
    ketentuan_bayar: "",
    aktif_status: 1,
    catatan: "",
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [filterActive, setFilterActive] = useState<
    "all" | "active" | "inactive"
  >("all");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<NotificationToastProps | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    show: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: "warning" | "danger" | "info";
    onConfirm: () => void;
  } | null>(null);

  // Click outside to close modal
  const vendorModalRef = useRef<HTMLDivElement>(null);
  useClickOutside(vendorModalRef, () => setShowModal(false), showModal);

  // Virtualization state
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 50 });
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [scrollPosition, setScrollPosition] = useState(0);

  // Filtered vendors based on search and filter
  const filteredVendors = useMemo(() => {
    let filtered = [...vendors];

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (v) =>
          v.nama_perusahaan.toLowerCase().includes(query) ||
          v.email.toLowerCase().includes(query) ||
          v.telepon.includes(query) ||
          (v.kontak_person && v.kontak_person.toLowerCase().includes(query))
      );
    }

    // Filter by active status
    if (filterActive === "active") {
      filtered = filtered.filter((v) => v.aktif_status === 1);
    } else if (filterActive === "inactive") {
      filtered = filtered.filter((v) => v.aktif_status === 0);
    }

    return filtered;
  }, [vendors, searchQuery, filterActive]);

  // Visible vendors - hanya render yang terlihat (virtualization)
  const visibleVendors = useMemo(() => {
    if (filteredVendors.length <= 100) return filteredVendors;
    return filteredVendors.slice(visibleRange.start, visibleRange.end);
  }, [filteredVendors, visibleRange]);

  useEffect(() => {
    checkAuth();
  }, []);

  // Scroll handler untuk lazy loading rows (virtualization)
  useEffect(() => {
    const handleScroll = () => {
      if (!tableContainerRef.current) return;

      const container = tableContainerRef.current;
      const scrollTop = container.scrollTop;
      const rowHeight = 60;
      const visibleRows = Math.ceil(container.clientHeight / rowHeight);
      const buffer = 10;

      const start = Math.max(0, Math.floor(scrollTop / rowHeight) - buffer);
      const end = Math.min(
        filteredVendors.length,
        start + visibleRows + buffer * 2
      );

      setVisibleRange({ start, end });
    };

    const container = tableContainerRef.current;
    if (container) {
      container.addEventListener("scroll", handleScroll);
      handleScroll();
      return () => container.removeEventListener("scroll", handleScroll);
    }
  }, [filteredVendors.length]);

  // Reset scroll position when search/filter changes
  useEffect(() => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTop = 0;
      setVisibleRange({ start: 0, end: 50 });
    }
  }, [searchQuery, filterActive]);

  // Handle ESC key to close modals
  useEffect(() => {
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showModal) {
          setShowModal(false);
        } else if (confirmDialog?.show) {
          setConfirmDialog(null);
        }
      }
    };

    window.addEventListener("keydown", handleEscKey);
    return () => window.removeEventListener("keydown", handleEscKey);
  }, [showModal, confirmDialog]);

  const checkAuth = () => {
    const userSession = localStorage.getItem("user");
    if (!userSession) {
      router.push("/auth/login");
      return;
    }
    const user = JSON.parse(userSession);
    setCurrentUser(user);
    setLoading(false);
    loadVendors();
  };

  const showMsg = (type: "success" | "error", message: string) => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 3000);
  };

  const loadVendors = async () => {
    try {
      const res = await fetch("/api/vendors");
      const data = await res.json();
      setVendors(data.vendor || []);
    } catch (error) {
      console.error("Error loading vendors:", error);
      showMsg("error", "Gagal memuat data vendor");
    }
  };

  const handleAdd = () => {
    setEditingVendor(null);
    setFormData({
      nama_perusahaan: "",
      email: "",
      telepon: "",
      alamat: "",
      kontak_person: "",
      ketentuan_bayar: "",
      aktif_status: 1,
      catatan: "",
    });
    setShowModal(true);
  };

  const handleEdit = (vendor: Vendor) => {
    // Save scroll position before opening modal
    if (tableContainerRef.current) {
      setScrollPosition(tableContainerRef.current.scrollTop);
    }

    setEditingVendor(vendor);
    setFormData({
      nama_perusahaan: vendor.nama_perusahaan || "",
      email: vendor.email || "",
      telepon: vendor.telepon || "",
      alamat: vendor.alamat || "",
      kontak_person: vendor.kontak_person || "",
      ketentuan_bayar: vendor.ketentuan_bayar || "",
      aktif_status: vendor.aktif_status,
      catatan: vendor.catatan || "",
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nama_perusahaan.trim()) {
      showMsg("error", "Nama perusahaan wajib diisi");
      return;
    }

    try {
      setSaving(true);
      const url = "/api/vendors";
      const method = editingVendor ? "PUT" : "POST";
      const payload = editingVendor
        ? { ...formData, id: editingVendor.id }
        : formData;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showMsg(
        "success",
        editingVendor
          ? "Vendor berhasil diupdate"
          : "Vendor berhasil ditambahkan"
      );
      setShowModal(false);
      loadVendors();

      // Restore scroll position after reload
      setTimeout(() => {
        if (tableContainerRef.current && scrollPosition > 0) {
          tableContainerRef.current.scrollTop = scrollPosition;
        }
      }, 100);
    } catch (error: any) {
      showMsg("error", error.message || "Gagal menyimpan data");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (vendor: Vendor) => {
    setConfirmDialog({
      show: true,
      title: "Hapus Vendor",
      message: `Yakin ingin menghapus vendor "${
        vendor.nama_perusahaan
      }"?\n\nEmail: ${vendor.email}\nTelepon: ${vendor.telepon}\nStatus: ${
        vendor.aktif_status === 1 ? "Aktif" : "Non-Aktif"
      }\n\nData akan dihapus permanen dari database.`,
      confirmText: "Ya, Hapus",
      cancelText: "Batal",
      type: "danger",
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const res = await fetch(`/api/vendors?id=${vendor.id}`, {
            method: "DELETE",
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);

          showMsg("success", "Vendor berhasil dihapus");
          loadVendors();
        } catch (error: any) {
          showMsg("error", error.message || "Gagal menghapus vendor");
        }
      },
    });
  };

  const totalVendors = vendors.length;
  const activeVendors = vendors.filter((v) => v.aktif_status === 1).length;
  const inactiveVendors = totalVendors - activeVendors;

  if (loading) {
    return (
      <MainShell title="Vendor">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
        </div>
      </MainShell>
    );
  }

  return (
    <MainShell title="Vendor">
      <div className="space-y-6">
        {/* Header Section */}
        <div className="bg-gradient-to-br from-[#0a1b3d] to-[#2266ff] rounded-2xl shadow-lg p-6 text-white">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/20 rounded-xl">
              <BuildingIcon size={32} className="text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold mb-1 font-twcenmt uppercase tracking-wide">
                Data Vendor
              </h2>
              <p className="text-white/90 text-sm">
                Kelola informasi supplier dan status kerja sama
              </p>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Total Vendors */}
          <div className="bg-gradient-to-br from-[#0a1b3d] to-[#2266ff] rounded-xl shadow-lg p-6 text-white">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-white/20 rounded-lg">
                  <BuildingIcon size={20} className="text-white" />
                </div>
                <h3 className="text-base font-semibold uppercase tracking-wide">
                  Total Vendor
                </h3>
              </div>
            </div>
            <p className="text-3xl font-bold">{totalVendors}</p>
            <p className="text-sm mt-2 text-blue-100">Terdaftar di sistem</p>
          </div>

          {/* Active Vendors */}
          <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl shadow-lg p-6 text-white">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-white/20 rounded-lg">
                  <CheckIcon size={20} className="text-white" />
                </div>
                <h3 className="text-base font-semibold uppercase tracking-wide">
                  Aktif
                </h3>
              </div>
            </div>
            <p className="text-3xl font-bold">{activeVendors}</p>
            <p className="text-sm mt-2 text-green-100">
              Vendor yang beroperasi
            </p>
          </div>

          {/* Inactive Vendors */}
          <div className="bg-gradient-to-br from-gray-500 to-gray-600 rounded-xl shadow-lg p-6 text-white">
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
                      d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                    />
                  </svg>
                </div>
                <h3 className="text-base font-semibold uppercase tracking-wide">
                  Non-Aktif
                </h3>
              </div>
            </div>
            <p className="text-3xl font-bold">{inactiveVendors}</p>
            <p className="text-sm mt-2 text-gray-100">Tidak lagi beroperasi</p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={handleAdd}
                className="px-4 py-2 bg-gradient-to-r from-[#0a1b3d] to-[#2266ff] text-white rounded-lg hover:from-[#0a1b3d]/90 hover:to-[#2266ff]/90 transition-all font-semibold shadow-md flex items-center gap-2"
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
                Tambah Vendor
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari nama, email, telepon..."
                  className="px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-64"
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

              <select
                value={filterActive}
                onChange={(e) => setFilterActive(e.target.value as any)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-gray-700"
              >
                <option value="all">Semua Status</option>
                <option value="active">Aktif</option>
                <option value="inactive">Non-Aktif</option>
              </select>
            </div>
          </div>
        </div>

        {/* Vendors Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div
            ref={tableContainerRef}
            className="overflow-x-auto max-h-[600px] overflow-y-auto"
            style={{ scrollBehavior: "smooth" }}
          >
            <table className="w-full">
              <thead className="bg-gradient-to-r from-[#0a1b3d] to-[#2266ff] text-white sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-bold uppercase tracking-wider">
                    Nama Vendor
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-bold uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-bold uppercase tracking-wider">
                    Telepon
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-bold uppercase tracking-wider">
                    Ketentuan Bayar
                  </th>
                  <th className="px-4 py-3 text-center text-sm font-bold uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-center text-sm font-bold uppercase tracking-wider">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredVendors.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center">
                      <div className="flex flex-col items-center justify-center text-gray-400">
                        <BuildingIcon size={48} className="mb-3 opacity-50" />
                        <p className="text-lg font-semibold text-gray-600">
                          {searchQuery || filterActive !== "all"
                            ? "Tidak ada data yang sesuai"
                            : "Belum ada data vendor"}
                        </p>
                        <p className="text-sm mt-1">
                          {searchQuery || filterActive !== "all"
                            ? "Coba ubah pencarian atau filter"
                            : "Klik 'Tambah Vendor' untuk memulai"}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  visibleVendors.map((vendor, idx) => (
                    <VendorRow
                      key={vendor.id}
                      vendor={vendor}
                      index={visibleRange.start + idx}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div
            ref={vendorModalRef}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="sticky top-0 bg-gradient-to-r from-[#0a1b3d] to-[#2266ff] p-6 text-white">
              <h3 className="text-2xl font-bold">
                {editingVendor ? "Edit Vendor" : "Tambah Vendor Baru"}
              </h3>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Nama Perusahaan <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.nama_perusahaan}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        nama_perusahaan: e.target.value,
                      })
                    }
                    placeholder="Contoh: PT. Supplier Indonesia"
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Contact Person
                  </label>
                  <input
                    type="text"
                    value={formData.kontak_person}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        kontak_person: e.target.value,
                      })
                    }
                    placeholder="Nama PIC"
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Telepon
                  </label>
                  <input
                    type="tel"
                    value={formData.telepon}
                    onChange={(e) =>
                      setFormData({ ...formData, telepon: e.target.value })
                    }
                    placeholder="08xx-xxxx-xxxx"
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    placeholder="vendor@example.com"
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Alamat
                  </label>
                  <textarea
                    value={formData.alamat}
                    onChange={(e) =>
                      setFormData({ ...formData, alamat: e.target.value })
                    }
                    placeholder="Alamat lengkap vendor"
                    rows={3}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Ketentuan Bayar
                  </label>
                  <input
                    type="text"
                    value={formData.ketentuan_bayar}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        ketentuan_bayar: e.target.value,
                      })
                    }
                    placeholder="Contoh: NET 30, COD, TOP 14 hari"
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Syarat pembayaran (contoh: NET 30 = bayar 30 hari setelah
                    invoice)
                  </p>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Catatan
                  </label>
                  <textarea
                    value={formData.catatan}
                    onChange={(e) =>
                      setFormData({ ...formData, catatan: e.target.value })
                    }
                    placeholder="Catatan tambahan (opsional)"
                    rows={2}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg border-2 border-green-200">
                    <input
                      type="checkbox"
                      id="aktif_status"
                      checked={formData.aktif_status === 1}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          aktif_status: e.target.checked ? 1 : 0,
                        })
                      }
                      className="w-5 h-5 text-green-600 border-gray-300 rounded focus:ring-green-500"
                    />
                    <label
                      htmlFor="aktif_status"
                      className="flex-1 text-sm cursor-pointer"
                    >
                      <span className="font-semibold text-green-900 block">
                        Vendor Aktif
                      </span>
                      <span className="text-xs text-green-700">
                        Vendor aktif dapat dipilih saat melakukan pembelian
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-[#0a1b3d] to-[#2266ff] text-white rounded-lg hover:from-[#0a1b3d]/90 hover:to-[#2266ff]/90 transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? "Menyimpan..." : "Simpan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Notification Toast */}
      {notice && (
        <NotificationToast type={notice.type} message={notice.message} />
      )}

      {/* Confirm Dialog */}
      {confirmDialog?.show && (
        <ConfirmDialog
          show={confirmDialog.show}
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmText={confirmDialog.confirmText}
          cancelText={confirmDialog.cancelText}
          type={confirmDialog.type}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}

      {/* Notification Toast */}
      {notice && (
        <NotificationToast type={notice.type} message={notice.message} />
      )}
    </MainShell>
  );
}
