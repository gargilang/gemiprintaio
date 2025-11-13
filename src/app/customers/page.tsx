"use client";

import { useState, useEffect, useMemo, useRef, memo } from "react";
import { useRouter } from "next/navigation";
import { useClickOutside } from "@/hooks/useClickOutside";
import NotificationToast, {
  NotificationToastProps,
} from "@/components/NotificationToast";
import ConfirmDialog from "@/components/ConfirmDialog";
import { UsersIcon, CheckIcon } from "@/components/icons/ContentIcons";

// Memoized Customer Row Component - mencegah re-render yang tidak perlu
const CustomerRow = memo(
  ({
    customer,
    index,
    onEdit,
    onDelete,
  }: {
    customer: Customer;
    index: number;
    onEdit: (customer: Customer) => void;
    onDelete: (customer: Customer) => void;
  }) => {
    return (
      <tr
        className={`hover:bg-teal-50 transition-all cursor-default ${
          index % 2 === 0 ? "bg-white" : "bg-gray-50"
        }`}
      >
        <td className="px-4 py-3">
          <div className="font-semibold text-gray-800">
            {customer.nama || customer.nama_perusahaan}
          </div>
          {customer.nama && customer.nama_perusahaan && (
            <div className="text-xs text-gray-800 mt-1">
              {customer.nama_perusahaan}
            </div>
          )}
        </td>
        <td className="px-4 py-3 text-sm text-gray-700">{customer.email}</td>
        <td className="px-4 py-3 text-sm text-gray-700">{customer.telepon}</td>
        <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">
          {customer.alamat}
        </td>
        <td className="px-4 py-3 text-center">
          {customer.member_status === 1 ? (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold">
              <CheckIcon size={14} />
              Member
            </span>
          ) : (
            <span className="inline-flex items-center px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-semibold">
              Regular
            </span>
          )}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => onEdit(customer)}
              className="p-2 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
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
              onClick={() => onDelete(customer)}
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

CustomerRow.displayName = "CustomerRow";

interface User {
  id: string;
  username: string;
  role: string;
}

interface Customer {
  id: string;
  nama: string;
  email: string;
  telepon: string;
  alamat: string;
  nama_perusahaan?: string;
  tipe_pelanggan: string;
  npwp?: string;
  member_status: number;
  dibuat_pada: string;
  diperbarui_pada: string;
}

export default function CustomersPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [formData, setFormData] = useState({
    nama: "",
    email: "",
    telepon: "",
    alamat: "",
    nama_perusahaan: "",
    tipe_pelanggan: "RETAIL",
    npwp: "",
    member_status: 0,
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMember, setFilterMember] = useState<
    "all" | "member" | "non-member"
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
  const customerModalRef = useRef<HTMLDivElement>(null);
  useClickOutside(customerModalRef, () => setShowModal(false), showModal);

  // Virtualization state
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 50 });
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [scrollPosition, setScrollPosition] = useState(0);

  // Filtered customers based on search and filter
  const filteredCustomers = useMemo(() => {
    let filtered = [...customers];

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.nama.toLowerCase().includes(query) ||
          c.email.toLowerCase().includes(query) ||
          c.telepon.includes(query) ||
          (c.nama_perusahaan && c.nama_perusahaan.toLowerCase().includes(query))
      );
    }

    // Filter by member status
    if (filterMember === "member") {
      filtered = filtered.filter((c) => c.member_status === 1);
    } else if (filterMember === "non-member") {
      filtered = filtered.filter((c) => c.member_status === 0);
    }

    return filtered;
  }, [customers, searchQuery, filterMember]);

  // Visible customers - hanya render yang terlihat (virtualization)
  const visibleCustomers = useMemo(() => {
    if (filteredCustomers.length <= 100) return filteredCustomers;
    return filteredCustomers.slice(visibleRange.start, visibleRange.end);
  }, [filteredCustomers, visibleRange]);

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
        filteredCustomers.length,
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
  }, [filteredCustomers.length]);

  // Reset scroll position when search/filter changes
  useEffect(() => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTop = 0;
      setVisibleRange({ start: 0, end: 50 });
    }
  }, [searchQuery, filterMember]);

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
    loadCustomers();
  };

  const showMsg = (type: "success" | "error", message: string) => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 3000);
  };

  const loadCustomers = async () => {
    try {
      const res = await fetch("/api/customers");
      const data = await res.json();
      setCustomers(data.pelanggan || []);
    } catch (error) {
      console.error("Error loading customers:", error);
      showMsg("error", "Gagal memuat data pelanggan");
    }
  };

  const handleAdd = () => {
    setEditingCustomer(null);
    setFormData({
      nama: "",
      email: "",
      telepon: "",
      alamat: "",
      nama_perusahaan: "",
      tipe_pelanggan: "RETAIL",
      npwp: "",
      member_status: 0,
    });
    setShowModal(true);
  };

  const handleEdit = (customer: Customer) => {
    // Save scroll position before opening modal
    if (tableContainerRef.current) {
      setScrollPosition(tableContainerRef.current.scrollTop);
    }

    setEditingCustomer(customer);
    setFormData({
      nama: customer.nama || "",
      email: customer.email || "",
      telepon: customer.telepon || "",
      alamat: customer.alamat || "",
      nama_perusahaan: customer.nama_perusahaan || "",
      tipe_pelanggan: customer.tipe_pelanggan || "RETAIL",
      npwp: customer.npwp || "",
      member_status: customer.member_status,
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nama.trim()) {
      showMsg("error", "Nama pelanggan wajib diisi");
      return;
    }

    try {
      setSaving(true);
      const url = "/api/customers";
      const method = editingCustomer ? "PUT" : "POST";
      const payload = editingCustomer
        ? { ...formData, id: editingCustomer.id }
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
        editingCustomer
          ? "Pelanggan berhasil diupdate"
          : "Pelanggan berhasil ditambahkan"
      );
      setShowModal(false);
      loadCustomers();

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

  const handleDelete = (customer: Customer) => {
    setConfirmDialog({
      show: true,
      title: "Hapus Pelanggan",
      message: `Yakin ingin menghapus pelanggan "${customer.nama}"?\n\nEmail: ${
        customer.email
      }\nTelepon: ${customer.telepon}\nStatus: ${
        customer.member_status === 1 ? "Member" : "Regular"
      }\n\nData akan dihapus permanen dari database.`,
      confirmText: "Ya, Hapus",
      cancelText: "Batal",
      type: "danger",
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const res = await fetch(`/api/customers?id=${customer.id}`, {
            method: "DELETE",
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);

          showMsg("success", "Pelanggan berhasil dihapus");
          loadCustomers();
        } catch (error: any) {
          showMsg("error", error.message || "Gagal menghapus pelanggan");
        }
      },
    });
  };

  const totalCustomers = customers.length;
  const totalMembers = customers.filter((c) => c.member_status === 1).length;
  const totalNonMembers = totalCustomers - totalMembers;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-teal-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header Section */}
        <div className="bg-gradient-to-br from-teal-500 to-cyan-500 rounded-2xl shadow-lg p-6 text-white">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/20 rounded-xl">
              <UsersIcon size={32} className="text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold mb-1 font-twcenmt uppercase tracking-wide">
                Data Pelanggan
              </h2>
              <p className="text-white/90 text-sm">
                Kelola informasi pelanggan dan status membership
              </p>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Total Customers */}
          <div className="bg-gradient-to-br from-teal-500 to-cyan-500 rounded-xl shadow-lg p-6 text-white">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-white/20 rounded-lg">
                  <UsersIcon size={20} className="text-white" />
                </div>
                <h3 className="text-base font-semibold uppercase tracking-wide">
                  Total Pelanggan
                </h3>
              </div>
            </div>
            <p className="text-3xl font-bold">{totalCustomers}</p>
            <p className="text-sm mt-2 text-teal-100">Terdaftar di sistem</p>
          </div>

          {/* Members */}
          <div className="bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl shadow-lg p-6 text-white">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-white/20 rounded-lg">
                  <CheckIcon size={20} className="text-white" />
                </div>
                <h3 className="text-base font-semibold uppercase tracking-wide">
                  Member
                </h3>
              </div>
            </div>
            <p className="text-3xl font-bold">{totalMembers}</p>
            <p className="text-sm mt-2 text-amber-100">Mendapat harga khusus</p>
          </div>

          {/* Non-Members */}
          <div className="bg-gradient-to-br from-blue-500 to-indigo-500 rounded-xl shadow-lg p-6 text-white">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-white/20 rounded-lg">
                  <UsersIcon size={20} className="text-white" />
                </div>
                <h3 className="text-base font-semibold uppercase tracking-wide">
                  Non-Member
                </h3>
              </div>
            </div>
            <p className="text-3xl font-bold">{totalNonMembers}</p>
            <p className="text-sm mt-2 text-blue-100">Harga reguler</p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={handleAdd}
                className="px-4 py-2 bg-gradient-to-r from-teal-500 to-cyan-500 text-white rounded-lg hover:from-teal-600 hover:to-cyan-600 transition-all font-semibold shadow-md flex items-center gap-2"
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
                Tambah Pelanggan
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari nama, email, telepon..."
                  className="px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent w-64"
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
                value={filterMember}
                onChange={(e) => setFilterMember(e.target.value as any)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white font-semibold text-gray-700"
              >
                <option value="all">Semua Status</option>
                <option value="member">Member</option>
                <option value="non-member">Non-Member</option>
              </select>
            </div>
          </div>
        </div>

        {/* Customers Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div
            ref={tableContainerRef}
            className="overflow-x-auto max-h-[600px] overflow-y-auto"
            style={{ scrollBehavior: "smooth" }}
          >
            <table className="w-full">
              <thead className="bg-gradient-to-r from-teal-500 to-cyan-500 text-white sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-bold uppercase tracking-wider">
                    Nama
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-bold uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-bold uppercase tracking-wider">
                    Telepon
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-bold uppercase tracking-wider">
                    Perusahaan
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
                {filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center">
                      <div className="flex flex-col items-center justify-center text-gray-400">
                        <UsersIcon size={48} className="mb-3 opacity-50" />
                        <p className="text-lg font-semibold text-gray-600">
                          {searchQuery || filterMember !== "all"
                            ? "Tidak ada data yang sesuai"
                            : "Belum ada data pelanggan"}
                        </p>
                        <p className="text-sm mt-1">
                          {searchQuery || filterMember !== "all"
                            ? "Coba ubah pencarian atau filter"
                            : "Klik 'Tambah Pelanggan' untuk memulai"}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  visibleCustomers.map((customer, idx) => (
                    <CustomerRow
                      key={customer.id}
                      customer={customer}
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
            ref={customerModalRef}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="sticky top-0 bg-gradient-to-r from-teal-500 to-cyan-500 p-6 text-white">
              <h3 className="text-2xl font-bold">
                {editingCustomer ? "Edit Pelanggan" : "Tambah Pelanggan Baru"}
              </h3>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Nama Lengkap <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.nama}
                    onChange={(e) =>
                      setFormData({ ...formData, nama: e.target.value })
                    }
                    placeholder="Contoh: John Doe"
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    placeholder="email@example.com"
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
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
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Perusahaan / Instansi
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
                    placeholder="Nama perusahaan (opsional)"
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
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
                    placeholder="Alamat lengkap"
                    rows={3}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-lg border-2 border-amber-200">
                    <input
                      type="checkbox"
                      id="member_status"
                      checked={formData.member_status === 1}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          member_status: e.target.checked ? 1 : 0,
                        })
                      }
                      className="w-5 h-5 text-amber-600 border-gray-300 rounded focus:ring-amber-500"
                    />
                    <label
                      htmlFor="member_status"
                      className="flex-1 text-sm cursor-pointer"
                    >
                      <span className="font-semibold text-amber-900 block">
                        Member - Harga Khusus
                      </span>
                      <span className="text-xs text-amber-700">
                        Pelanggan member mendapat diskon khusus untuk semua
                        produk
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
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-teal-500 to-cyan-500 text-white rounded-lg hover:from-teal-600 hover:to-cyan-600 transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
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
    </>
  );
}
