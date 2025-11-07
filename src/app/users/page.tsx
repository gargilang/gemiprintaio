"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import MainShell from "@/components/MainShell";
import ConfirmDialog from "@/components/ConfirmDialog";
import type { NotificationToastProps } from "@/components/MainShell";
import {
  UsersIcon,
  CheckIcon,
  CrownIcon,
  KeyIcon,
} from "@/components/icons/ContentIcons";

interface User {
  id: string;
  nama_pengguna: string;
  email: string;
  nama_lengkap: string;
  role: "admin" | "manager" | "chief" | "user";
  aktif_status: number;
  dibuat_pada?: string;
}

export default function UsersPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    nama_pengguna: "",
    email: "",
    nama_lengkap: "",
    password: "",
    role: "user" as "admin" | "manager" | "chief" | "user",
    aktif_status: 1,
  });

  // Password Manager state
  interface Credential {
    id: string;
    owner_id: string;
    service_name: string;
    account_username: string;
    notes: string;
    is_private: boolean;
    can_view_password: boolean;
  }
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [showCredModal, setShowCredModal] = useState(false);
  const [editingCred, setEditingCred] = useState<Credential | null>(null);
  const [credForm, setCredForm] = useState({
    service_name: "",
    account_username: "",
    password: "",
    notes: "",
    is_private: true,
  });
  const [notice, setNotice] = useState<NotificationToastProps | null>(null);
  const [visiblePasswords, setVisiblePasswords] = useState<{
    [key: string]: string;
  }>({});
  const [showingPasswordId, setShowingPasswordId] = useState<string | null>(
    null
  );
  const [showUserPassword, setShowUserPassword] = useState(false);
  const [showCredPassword, setShowCredPassword] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    show: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: "warning" | "danger" | "info";
    onConfirm: () => void;
  } | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  // Handle ESC key to close modals
  useEffect(() => {
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showModal) {
          handleCloseModal();
        } else if (showCredModal) {
          setShowCredModal(false);
          setEditingCred(null);
          setShowCredPassword(false);
          setCredForm({
            service_name: "",
            account_username: "",
            password: "",
            notes: "",
            is_private: true,
          });
        } else if (confirmDialog?.show) {
          setConfirmDialog(null);
        }
      }
    };

    window.addEventListener("keydown", handleEscKey);
    return () => window.removeEventListener("keydown", handleEscKey);
  }, [showModal, showCredModal, confirmDialog]);

  const checkAuth = () => {
    const userSession = localStorage.getItem("user");
    if (!userSession) {
      router.push("/auth/login");
      return;
    }

    const user = JSON.parse(userSession);
    setCurrentUser(user);
    setLoading(false);
    // Load initial data
    loadUsers(user);
    loadCredentials(user);
  };

  const showMsg = (type: "success" | "error", message: string) => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 2500);
  };

  const loadUsers = async (viewer?: User) => {
    if (viewer && viewer.role !== "admin" && viewer.role !== "manager") {
      // Only admins can view/manage users table
      setUsers([]);
      return;
    }
    try {
      const res = await fetch("/api/users", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Gagal memuat users");
      setUsers(data.users || []);
    } catch (err) {
      console.error("Gagal memuat users:", err);
      showMsg("error", "Tidak bisa memuat data users dari database.");
    }
  };

  const loadCredentials = async (viewer?: User) => {
    const v = viewer || currentUser;
    if (!v) return;
    try {
      const res = await fetch(`/api/passwords`, {
        cache: "no-store",
        headers: { "x-user-id": v.id },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Gagal memuat kredensial");
      setCredentials(data.credentials || []);
    } catch (err) {
      console.error(err);
      showMsg("error", "Tidak bisa memuat kredensial.");
    }
  };

  const handleOpenModal = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        nama_pengguna: user.nama_pengguna,
        email: user.email,
        nama_lengkap: user.nama_lengkap,
        password: "",
        role: user.role,
        aktif_status: user.aktif_status,
      });
    } else {
      setEditingUser(null);
      setFormData({
        nama_pengguna: "",
        email: "",
        nama_lengkap: "",
        password: "",
        role: "user",
        aktif_status: 1,
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingUser(null);
    setShowUserPassword(false);
    setFormData({
      nama_pengguna: "",
      email: "",
      nama_lengkap: "",
      password: "",
      role: "user",
      aktif_status: 1,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (editingUser) {
        // Update existing user via API
        const payload: any = {
          nama_pengguna: editingUser.nama_pengguna,
          email: formData.email,
          nama_lengkap: formData.nama_lengkap,
          role: formData.role,
          aktif_status: formData.aktif_status,
        };
        if (formData.password) payload.password = formData.password;

        const res = await fetch(`/api/users/${editingUser.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Gagal update user");
        showMsg("success", "User berhasil diupdate!");
      } else {
        // Create new user via API
        const res = await fetch(`/api/users`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Gagal menambah user");
        showMsg("success", "User berhasil ditambahkan!");
      }

      await loadUsers();
      handleCloseModal();
    } catch (err) {
      console.error(err);
      showMsg(
        "error",
        `Terjadi kesalahan saat menyimpan user: ${
          err instanceof Error ? err.message : "Unknown"
        }`
      );
    }
  };

  const handleDelete = async (userToDelete: User) => {
    const userId = userToDelete.id;
    console.log("Delete clicked for userId:", userId);
    console.log("Current user ID:", currentUser?.id);

    if (userId === currentUser?.id) {
      showMsg("error", "❌ Tidak bisa menghapus user yang sedang login!");
      return;
    }

    setConfirmDialog({
      show: true,
      title: "Hapus User",
      message: `Yakin ingin menghapus user berikut?\n\nNama: ${userToDelete.nama_lengkap}\nUsername: @${userToDelete.nama_pengguna}\nEmail: ${userToDelete.email}\n\nTindakan ini tidak dapat dibatalkan!`,
      confirmText: "Ya, Hapus",
      cancelText: "Batal",
      type: "danger",
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const res = await fetch(`/api/users/${userId}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nama_pengguna: userToDelete.nama_pengguna }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data?.error || "Gagal menghapus user");

          showMsg("success", "User berhasil dihapus!");
          await loadUsers(currentUser!);
        } catch (err) {
          console.error(err);
          showMsg(
            "error",
            `Terjadi kesalahan saat menghapus user: ${
              err instanceof Error ? err.message : "Unknown"
            }`
          );
        }
      },
    });
  };

  const handleToggleActive = async (userId: string) => {
    if (userId === currentUser?.id) {
      showMsg("error", "❌ Tidak bisa menonaktifkan user yang sedang login!");
      return;
    }

    const target = users.find((u) => u.id === userId);
    if (!target) return;

    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aktif_status: target.aktif_status ? 0 : 1 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Gagal update status");
      await loadUsers(currentUser!);
    } catch (err) {
      console.error(err);
      showMsg(
        "error",
        `Terjadi kesalahan saat mengubah status: ${
          err instanceof Error ? err.message : "Unknown"
        }`
      );
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("user");
    router.push("/auth/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-100 via-blue-100 to-cyan-100">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
          <p className="mt-4 text-[#0a1b3d] font-semibold">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <MainShell title="Manajemen User" notice={notice}>
      {/* Main Content */}
      {currentUser?.role === "admin" && (
        <>
          <div className="bg-gradient-to-br from-[#0a1b3d] to-[#00afef] rounded-2xl shadow-lg p-6 mb-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold mb-1 font-twcenmt uppercase tracking-wide">
                  Kelola Pengguna
                </h2>
                <p className="text-white/90">
                  Tambah, edit, atau hapus pengguna sistem
                </p>
              </div>
              <button
                onClick={() => handleOpenModal()}
                className="px-6 py-3 bg-white text-[#0a1b3d] rounded-xl font-semibold hover:shadow-xl transition-all flex items-center gap-2"
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
                    d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                  />
                </svg>
                Tambah User
              </button>
            </div>
          </div>

          {/* Users Table */}
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-[#0a1b3d]/10 to-[#00afef]/10">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-[#0a1b3d]">
                      User
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-[#0a1b3d]">
                      Email
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-[#0a1b3d]">
                      Role
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-[#0a1b3d]">
                      Status
                    </th>
                    <th className="px-6 py-4 text-right text-sm font-semibold text-[#0a1b3d]">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.map((user) => (
                    <tr
                      key={user.id}
                      className="hover:bg-sky-50/50 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#0a1b3d] to-[#00afef] flex items-center justify-center text-white font-bold">
                            {user.nama_lengkap.charAt(0)}
                          </div>
                          <div>
                            <div className="font-semibold text-[#0a1b3d]">
                              {user.nama_lengkap}
                            </div>
                            <div className="text-sm text-[#6b7280]">
                              @{user.nama_pengguna}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-[#6b7280]">{user.email}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            user.role === "admin"
                              ? "bg-purple-100 text-purple-700"
                              : user.role === "manager"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {user.role}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleToggleActive(user.id)}
                          className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                            user.aktif_status
                              ? "bg-green-100 text-green-700 hover:bg-green-200"
                              : "bg-red-100 text-red-700 hover:bg-red-200"
                          }`}
                        >
                          {user.aktif_status ? "Aktif" : "Nonaktif"}
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenModal(user)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
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
                            onClick={() => handleDelete(user)}
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
                  ))}
                </tbody>
              </table>
            </div>

            {users.length === 0 && (
              <div className="text-center py-12 text-[#6b7280]">
                <p>Belum ada user.</p>
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
            <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-l-[#00afef]">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-[#6b7280] font-semibold">Total Users</h4>
                <UsersIcon size={28} className="text-[#00afef]" />
              </div>
              <p className="text-3xl font-bold text-[#0a1b3d]">
                {users.length}
              </p>
            </div>

            <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-l-green-500">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-[#6b7280] font-semibold">Aktif</h4>
                <CheckIcon size={28} className="text-green-600" />
              </div>
              <p className="text-3xl font-bold text-[#0a1b3d]">
                {users.filter((u) => u.aktif_status).length}
              </p>
            </div>

            <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-l-purple-500">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-[#6b7280] font-semibold">Admin</h4>
                <CrownIcon size={28} className="text-purple-600" />
              </div>
              <p className="text-3xl font-bold text-[#0a1b3d]">
                {users.filter((u) => u.role === "admin").length}
              </p>
            </div>
          </div>
        </>
      )}

      {/* Password Manager (Admins, Managers, Users) */}
      <div className="bg-gradient-to-br from-[#0a1b3d]/90 to-[#00afef]/90 rounded-2xl shadow-lg p-6 mt-10 mb-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-1 font-twcenmt uppercase tracking-wide">
              Password Manager
            </h2>
            <p className="text-white/90">
              Simpan kredensial login untuk layanan internal
            </p>
          </div>
          <button
            onClick={() => {
              setEditingCred(null);
              setShowCredPassword(false);
              setCredForm({
                service_name: "",
                account_username: "",
                password: "",
                notes: "",
                is_private: true,
              });
              setShowCredModal(true);
            }}
            className="px-6 py-3 bg-white text-[#0a1b3d] rounded-xl font-semibold hover:shadow-xl transition-all flex items-center gap-2"
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
                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
              />
            </svg>
            Tambah Kredensial
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-[#0a1b3d]/10 to-[#00afef]/10">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-[#0a1b3d]">
                  Layanan
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-[#0a1b3d]">
                  Akun
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-[#0a1b3d]">
                  Password
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-[#0a1b3d]">
                  Visibilitas
                </th>
                <th className="px-6 py-4 text-right text-sm font-semibold text-[#0a1b3d]">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {credentials.map((c) => (
                <tr key={c.id} className="hover:bg-sky-50/40 transition-colors">
                  <td className="px-6 py-4 text-[#0a1b3d] font-semibold">
                    {c.service_name}
                  </td>
                  <td className="px-6 py-4 text-[#6b7280]">
                    {c.account_username}
                  </td>
                  <td className="px-6 py-4">
                    {c.can_view_password ? (
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-[#0a1b3d]">
                          {showingPasswordId === c.id && visiblePasswords[c.id]
                            ? visiblePasswords[c.id]
                            : "••••••••"}
                        </span>
                        <button
                          onClick={async () => {
                            if (showingPasswordId === c.id) {
                              setShowingPasswordId(null);
                              return;
                            }
                            try {
                              const res = await fetch(
                                `/api/passwords/${c.id}`,
                                {
                                  headers: { "x-user-id": currentUser!.id },
                                }
                              );
                              const data = await res.json();
                              if (!res.ok)
                                throw new Error(
                                  data?.error || "Gagal ambil password"
                                );
                              setVisiblePasswords((prev) => ({
                                ...prev,
                                [c.id]: data.password,
                              }));
                              setShowingPasswordId(c.id);
                            } catch (err) {
                              console.error(err);
                              showMsg(
                                "error",
                                "Tidak bisa menampilkan password"
                              );
                            }
                          }}
                          className="p-1 text-[#00afef] hover:bg-sky-50 rounded transition-colors"
                          title={
                            showingPasswordId === c.id
                              ? "Sembunyikan"
                              : "Tampilkan"
                          }
                        >
                          {showingPasswordId === c.id ? (
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                              />
                            </svg>
                          ) : (
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                              />
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                              />
                            </svg>
                          )}
                        </button>
                      </div>
                    ) : (
                      <span className="text-[#6b7280] text-sm italic">
                        Tidak ada akses
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        c.is_private
                          ? "bg-red-100 text-red-700"
                          : "bg-green-100 text-green-700"
                      }`}
                    >
                      {c.is_private ? "Private" : "Tim"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      {c.can_view_password && (
                        <button
                          onClick={async () => {
                            try {
                              let password = visiblePasswords[c.id];
                              if (!password) {
                                const res = await fetch(
                                  `/api/passwords/${c.id}`,
                                  {
                                    headers: {
                                      "x-user-id": currentUser!.id,
                                    },
                                  }
                                );
                                const data = await res.json();
                                if (!res.ok)
                                  throw new Error(
                                    data?.error || "Gagal ambil password"
                                  );
                                password = data.password;
                                setVisiblePasswords((prev) => ({
                                  ...prev,
                                  [c.id]: password,
                                }));
                              }
                              navigator.clipboard.writeText(password);
                              showMsg(
                                "success",
                                "Password disalin ke clipboard"
                              );
                            } catch (err) {
                              console.error(err);
                              showMsg(
                                "error",
                                "Tidak bisa menampilkan password"
                              );
                            }
                          }}
                          className="p-2 text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                          title="Salin Password"
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
                              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                            />
                          </svg>
                        </button>
                      )}
                      {/* Edit */}
                      <button
                        onClick={() => {
                          setEditingCred(c);
                          setShowCredPassword(false);
                          setCredForm({
                            service_name: c.service_name,
                            account_username: c.account_username,
                            password: "",
                            notes: c.notes,
                            is_private: c.is_private,
                          });
                          setShowCredModal(true);
                        }}
                        className="p-2 text-[#00afef] hover:bg-sky-50 rounded-lg transition-colors"
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
                      {/* Delete */}
                      <button
                        onClick={() => {
                          setConfirmDialog({
                            show: true,
                            title: "Hapus Kredensial",
                            message: `Yakin ingin menghapus kredensial berikut?\n\nLayanan: ${c.service_name}\nAkun: ${c.account_username}\n\nTindakan ini tidak dapat dibatalkan!`,
                            confirmText: "Ya, Hapus",
                            cancelText: "Batal",
                            type: "danger",
                            onConfirm: async () => {
                              setConfirmDialog(null);
                              try {
                                const res = await fetch(
                                  `/api/passwords/${c.id}`,
                                  {
                                    method: "DELETE",
                                    headers: {
                                      "x-user-id": currentUser!.id,
                                    },
                                  }
                                );
                                const data = await res.json();
                                if (!res.ok)
                                  throw new Error(
                                    data?.error || "Gagal menghapus"
                                  );
                                showMsg("success", "Kredensial dihapus");
                                await loadCredentials();
                              } catch (err) {
                                console.error(err);
                                showMsg(
                                  "error",
                                  "Tidak bisa menghapus kredensial"
                                );
                              }
                            },
                          });
                        }}
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
              ))}
            </tbody>
          </table>
        </div>

        {credentials.length === 0 && (
          <div className="text-center py-12 text-[#6b7280]">
            <p>Belum ada kredensial.</p>
          </div>
        )}
      </div>

      {/* Modal Form - Manage Users */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-[#0a1b3d] to-[#00afef] rounded-t-2xl">
              <h3 className="text-xl font-bold text-white">
                {editingUser ? "✏️ Edit User" : "Tambah User Baru"}
              </h3>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-[#0a1b3d] mb-2">
                  Username
                </label>
                <input
                  type="text"
                  value={formData.nama_pengguna}
                  onChange={(e) =>
                    setFormData({ ...formData, nama_pengguna: e.target.value })
                  }
                  required
                  disabled={!!editingUser}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00afef] focus:border-[#00afef] transition disabled:bg-gray-100"
                  placeholder="username"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#0a1b3d] mb-2">
                  Nama Lengkap
                </label>
                <input
                  type="text"
                  value={formData.nama_lengkap}
                  onChange={(e) =>
                    setFormData({ ...formData, nama_lengkap: e.target.value })
                  }
                  required
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00afef] focus:border-[#00afef] transition"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#0a1b3d] mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  required
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00afef] focus:border-[#00afef] transition"
                  placeholder="email@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#0a1b3d] mb-2">
                  Password {editingUser && "(kosongkan jika tidak diubah)"}
                </label>
                <div className="relative">
                  <input
                    type={showUserPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={(e) =>
                      setFormData({ ...formData, password: e.target.value })
                    }
                    required={!editingUser}
                    className="w-full px-4 py-2 pr-12 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00afef] focus:border-[#00afef] transition"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowUserPassword(!showUserPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-[#00afef] transition-colors"
                  >
                    {showUserPassword ? (
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
                          d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                        />
                      </svg>
                    ) : (
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
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#0a1b3d] mb-2">
                  Role
                </label>
                <select
                  value={formData.role}
                  onChange={(e) =>
                    setFormData({ ...formData, role: e.target.value as any })
                  }
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00afef] focus:border-[#00afef] transition"
                >
                  <option value="user">User</option>
                  <option value="manager">Manager</option>
                  <option value="chief">Chief</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div className="flex items-center gap-3">
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
                  className="w-4 h-4 text-[#00afef] border-gray-300 rounded focus:ring-[#00afef]"
                />
                <label
                  htmlFor="aktif_status"
                  className="text-sm font-medium text-[#0a1b3d]"
                >
                  User Aktif
                </label>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 px-4 py-2 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-[#0a1b3d] to-[#00afef] text-white rounded-lg hover:shadow-lg transition-all font-semibold"
                >
                  {editingUser ? "Update" : "Tambah"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Form - Password Manager */}
      {showCredModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-[#0a1b3d]/90 to-[#00afef]/90 rounded-t-2xl">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <KeyIcon size={24} className="text-white" />
                {editingCred ? "Edit Kredensial" : "Tambah Kredensial"}
              </h3>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!currentUser) return;
                try {
                  if (editingCred) {
                    const res = await fetch(
                      `/api/passwords/${editingCred.id}`,
                      {
                        method: "PUT",
                        headers: {
                          "Content-Type": "application/json",
                          "x-user-id": currentUser.id,
                        },
                        body: JSON.stringify(credForm),
                      }
                    );
                    const data = await res.json();
                    if (!res.ok)
                      throw new Error(data?.error || "Gagal update kredensial");
                    showMsg("success", "Kredensial berhasil diupdate!");
                  } else {
                    const res = await fetch(`/api/passwords`, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        "x-user-id": currentUser.id,
                      },
                      body: JSON.stringify(credForm),
                    });
                    const data = await res.json();
                    if (!res.ok)
                      throw new Error(
                        data?.error || "Gagal menambah kredensial"
                      );
                    showMsg("success", "Kredensial berhasil ditambahkan!");
                  }
                  setShowCredModal(false);
                  setEditingCred(null);
                  setShowCredPassword(false);
                  setCredForm({
                    service_name: "",
                    account_username: "",
                    password: "",
                    notes: "",
                    is_private: true,
                  });
                  await loadCredentials();
                } catch (err) {
                  console.error(err);
                  showMsg(
                    "error",
                    `Terjadi kesalahan: ${
                      err instanceof Error ? err.message : "Unknown"
                    }`
                  );
                }
              }}
              className="p-6 space-y-4"
            >
              <div>
                <label className="block text-sm font-semibold text-[#0a1b3d] mb-2">
                  Nama Layanan
                </label>
                <input
                  type="text"
                  value={credForm.service_name}
                  onChange={(e) =>
                    setCredForm({ ...credForm, service_name: e.target.value })
                  }
                  required
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition"
                  placeholder="Microsoft, Google, GitHub, BCA, dll."
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#0a1b3d] mb-2">
                  Akun (Email/Username)
                </label>
                <input
                  type="text"
                  value={credForm.account_username}
                  onChange={(e) =>
                    setCredForm({
                      ...credForm,
                      account_username: e.target.value,
                    })
                  }
                  required
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition"
                  placeholder="email@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#0a1b3d] mb-2">
                  Password {editingCred && "(kosongkan jika tidak diubah)"}
                </label>
                <div className="relative">
                  <input
                    type={showCredPassword ? "text" : "password"}
                    value={credForm.password}
                    onChange={(e) =>
                      setCredForm({ ...credForm, password: e.target.value })
                    }
                    required={!editingCred}
                    className="w-full px-4 py-2 pr-12 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCredPassword(!showCredPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-emerald-600 transition-colors"
                  >
                    {showCredPassword ? (
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
                          d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                        />
                      </svg>
                    ) : (
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
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#0a1b3d] mb-2">
                  Catatan
                </label>
                <textarea
                  value={credForm.notes}
                  onChange={(e) =>
                    setCredForm({ ...credForm, notes: e.target.value })
                  }
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition"
                  placeholder="Keterangan tambahan"
                />
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="cred_private"
                  checked={credForm.is_private}
                  onChange={(e) =>
                    setCredForm({ ...credForm, is_private: e.target.checked })
                  }
                  className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                />
                <label
                  htmlFor="cred_private"
                  className="text-sm font-medium text-[#0a1b3d]"
                >
                  Sembunyikan dari user lain
                </label>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowCredModal(false);
                    setEditingCred(null);
                    setShowCredPassword(false);
                    setCredForm({
                      service_name: "",
                      account_username: "",
                      password: "",
                      notes: "",
                      is_private: true,
                    });
                  }}
                  className="flex-1 px-4 py-2 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-[#0a1b3d]/90 to-[#00afef]/90 text-white rounded-lg hover:shadow-lg transition-all font-semibold"
                >
                  {editingCred ? "Update" : "Tambah"}
                </button>
              </div>
            </form>
          </div>
        </div>
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
    </MainShell>
  );
}
