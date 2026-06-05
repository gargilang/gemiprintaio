"use client";

import { useState, useEffect, useMemo, useRef, useCallback, memo } from "react";
import { useRouter } from "next/navigation";
import ModalFormShell from "@/components/ModalFormShell";
import ToastNotifikasi, {
  NotificationToastProps,
} from "@/components/ToastNotifikasi";
import DialogKonfirmasi from "@/components/DialogKonfirmasi";
import { UsersIcon, CheckIcon } from "@/components/icons/ContentIcons";
import type { Pelanggan } from "@/lib/services/customers-service";
import {
  getPelangganAction,
  createPelangganAction,
  updatePelangganAction,
  deletePelangganAction,
} from "./actions";
import {
  fetchSessionUser,
  getCachedSessionUser,
  type SessionUser,
} from "@/lib/client-session";
import { useCachedData } from "@/lib/use-cached-data";

// Komponen baris pelanggan yang di-memoisasi — hindari render ulang yang tidak perlu
const PelangganRow = memo(
  ({
    customer,
    index,
    onEdit,
    onDelete,
  }: {
    customer: Pelanggan;
    index: number;
    onEdit: (customer: Pelanggan) => void;
    onDelete: (customer: Pelanggan) => void;
  }) => {
    return (
      <tr
        className={`hover:bg-teal-50 transition-all cursor-default ${
          index % 2 === 0 ? "bg-white dark:bg-slate-900" : "bg-gray-50 dark:bg-slate-800"
        }`}
      >
        <td className="px-4 py-3">
          <div className="font-semibold text-gray-800 dark:text-slate-100">
            {customer.nama || customer.nama_perusahaan}
          </div>
          {customer.nama && customer.nama_perusahaan && (
            <div className="text-xs text-gray-800 dark:text-slate-100 mt-1">
              {customer.nama_perusahaan}
            </div>
          )}
        </td>
        <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">{customer.email}</td>
        <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">{customer.telepon}</td>
        <td className="px-4 py-3 text-sm text-gray-600 dark:text-slate-300 max-w-xs truncate">
          {customer.alamat}
        </td>
        <td className="px-4 py-3 text-center">
          {customer.member_status === 1 ? (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-full text-xs font-semibold">
              <CheckIcon size={14} />
              Member
            </span>
          ) : (
            <span className="inline-flex items-center px-3 py-1 bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 rounded-full text-xs font-semibold">
              Regular
            </span>
          )}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => onEdit(customer)}
              className="p-2 text-teal-600 dark:text-teal-300 hover:bg-slate-100 dark:hover:bg-white/10 dark:bg-slate-800 rounded-lg transition-colors"
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
              className="p-2 text-red-600 hover:bg-red-50 dark:bg-red-950/40 rounded-lg transition-colors"
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

PelangganRow.displayName = "PelangganRow";

export default function PelangganPage() {
  const router = useRouter();
  const initialUser =
    typeof window !== "undefined" ? getCachedSessionUser() : null;
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(
    initialUser
  );
  const {
    data: pelangganData,
    isLoading: pelangganLoading,
    mutate: mutatePelanggan,
  } = useCachedData<Pelanggan[]>("pelanggan", async () => {
    const result = await getPelangganAction();
    return (result as Pelanggan[]) || [];
  });
  const customers = useMemo(() => pelangganData ?? [], [pelangganData]);
  const setDaftarPelanggan = useCallback<
    (next: Pelanggan[] | ((prev: Pelanggan[]) => Pelanggan[])) => void
  >(
    (next) => {
      void mutatePelanggan(
        (prev) => {
          const base = (prev as Pelanggan[] | undefined) ?? [];
          return typeof next === "function"
            ? (next as (p: Pelanggan[]) => Pelanggan[])(base)
            : next;
        },
        { revalidate: false }
      );
    },
    [mutatePelanggan]
  );
  const loading = currentUser === null && pelangganLoading;
  const [showModal, setShowModal] = useState(false);
  const [editingPelanggan, setEditingPelanggan] = useState<Pelanggan | null>(null);
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

  // Virtualization state
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 50 });
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Helper function to update a single customer in state without reloading
  function updatePelangganInState(updated: Pelanggan) {
    setDaftarPelanggan((prev: Pelanggan[]) =>
      prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
    );
  }

  // Filtered customers based on search and filter
  const filteredPelanggan = useMemo(() => {
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

  // Visible customers — only render visible rows (virtualization)
  const visiblePelanggan = useMemo(() => {
    if (filteredPelanggan.length <= 100) return filteredPelanggan;
    return filteredPelanggan.slice(visibleRange.start, visibleRange.end);
  }, [filteredPelanggan, visibleRange]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const user = await fetchSessionUser();
      if (cancelled) return;
      if (!user) {
        router.push("/auth/login");
        return;
      }
      setCurrentUser(user);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // Scroll handler for lazy-loading rows (virtualization)
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
        filteredPelanggan.length,
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
  }, [filteredPelanggan.length]);

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

  const showMsg = (type: "success" | "error", message: string) => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 3000);
  };

  const loadPelanggan = async () => {
    try {
      await mutatePelanggan();
    } catch (error) {
      console.error("Error loading customers:", error);
      showMsg("error", "Gagal memuat data pelanggan");
    }
  };

  const handleAdd = () => {
    setEditingPelanggan(null);
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

  const handleEdit = (customer: Pelanggan) => {
    setEditingPelanggan(customer);
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

      if (editingPelanggan) {
        // Update existing customer
        await updatePelangganAction(editingPelanggan.id, formData);
        const successMessage = "Pelanggan berhasil diupdate";
        setShowModal(false);
        await loadPelanggan();
        showMsg("success", successMessage);
      } else {
        // Create new customer
        await createPelangganAction(formData);
        const successMessage = "Pelanggan berhasil ditambahkan";
        setShowModal(false);
        await loadPelanggan();
        showMsg("success", successMessage);
      }
    } catch (error: any) {
      showMsg("error", error.message || "Gagal menyimpan data");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (customer: Pelanggan) => {
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
          await deletePelangganAction(customer.id);
          setDaftarPelanggan((prev: Pelanggan[]) =>
            prev.filter((c) => c.id !== customer.id)
          );
          showMsg("success", "Pelanggan berhasil dihapus");
        } catch (error: any) {
          showMsg("error", error.message || "Gagal menghapus pelanggan");
        }
      },
    });
  };

  const totalPelanggan = customers.length;
  const totalMembers = customers.filter((c) => c.member_status === 1).length;
  const totalNonMembers = totalPelanggan - totalMembers;

  if (loading && customers.length === 0) {
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
          {/* Total Pelanggan */}
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
            <p className="text-3xl font-bold">{totalPelanggan}</p>
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
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-800 p-4">
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
                  className="px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent w-64 dark:bg-slate-800 dark:text-slate-100"
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
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white dark:bg-slate-900 font-semibold text-gray-700 dark:text-slate-300"
              >
                <option value="all">Semua Status</option>
                <option value="member">Member</option>
                <option value="non-member">Non-Member</option>
              </select>
            </div>
          </div>
        </div>

        {/* Tabel Pelanggan */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-800 overflow-hidden">
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
                {filteredPelanggan.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center">
                      <div className="flex flex-col items-center justify-center text-gray-400">
                        <UsersIcon size={48} className="mb-3 opacity-50" />
                        <p className="text-lg font-semibold text-gray-600 dark:text-slate-300">
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
                  visiblePelanggan.map((customer, idx) => (
                    <PelangganRow
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

      <ModalFormShell
        open={showModal}
        onClose={() => setShowModal(false)}
        allowDismiss={!saving}
        maxWidthClass="max-w-2xl"
        header={
          <div className="bg-gradient-to-r from-teal-500 to-cyan-500 px-6 py-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 bg-white/20 rounded-lg shrink-0">
                <UsersIcon size={28} className="text-white" />
              </div>
              <h3 className="text-2xl font-bold text-white truncate">
                {editingPelanggan ? "Edit Pelanggan" : "Tambah Pelanggan Baru"}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setShowModal(false)}
              disabled={saving}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors shrink-0 disabled:opacity-50"
              aria-label="Tutup"
            >
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        }
        footer={
          <div className="bg-gray-50 dark:bg-slate-800 px-6 py-4 flex items-center justify-end gap-3 border-t border-gray-200 dark:border-slate-800 shrink-0">
            <button
              type="button"
              onClick={() => setShowModal(false)}
              disabled={saving}
              className="px-6 py-2 bg-white dark:bg-slate-900 border-2 border-gray-300 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-100 transition-colors font-semibold disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              form="customers-modal-form"
              disabled={saving}
              className="px-6 py-2 bg-gradient-to-r from-teal-500 to-cyan-500 text-white rounded-lg hover:from-teal-600 hover:to-cyan-600 transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        }
      >
            <form
              id="customers-modal-form"
              onSubmit={handleSave}
              className="p-6 space-y-4"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">
                    Nama Lengkap <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.nama}
                    onChange={(e) =>
                      setFormData({ ...formData, nama: e.target.value })
                    }
                    placeholder="Contoh: John Doe"
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 dark:bg-slate-800 dark:text-slate-100"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    placeholder="email@example.com"
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">
                    Telepon
                  </label>
                  <input
                    type="tel"
                    value={formData.telepon}
                    onChange={(e) =>
                      setFormData({ ...formData, telepon: e.target.value })
                    }
                    placeholder="08xx-xxxx-xxxx"
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">
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
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">
                    Alamat
                  </label>
                  <textarea
                    value={formData.alamat}
                    onChange={(e) =>
                      setFormData({ ...formData, alamat: e.target.value })
                    }
                    placeholder="Alamat lengkap"
                    rows={3}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <div className="md:col-span-2">
                  <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-slate-800 rounded-lg border-2 border-amber-200 dark:border-amber-800/50">
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
                      className="w-5 h-5 text-amber-600 dark:text-amber-300 border-gray-300 rounded focus:ring-amber-500"
                    />
                    <label
                      htmlFor="member_status"
                      className="flex-1 text-sm cursor-pointer"
                    >
                      <span className="font-semibold text-amber-900 block">
                        Member - Harga Khusus
                      </span>
                      <span className="text-xs text-amber-700 dark:text-amber-300">
                        Pelanggan member mendapat diskon khusus untuk semua
                        produk
                      </span>
                    </label>
                  </div>
                </div>
              </div>

            </form>
      </ModalFormShell>

      {/* Notification Toast */}
      {notice && (
        <ToastNotifikasi type={notice.type} message={notice.message} />
      )}

      {/* Confirm Dialog */}
      {confirmDialog?.show && (
        <DialogKonfirmasi
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
        <ToastNotifikasi type={notice.type} message={notice.message} />
      )}
    </>
  );
}
