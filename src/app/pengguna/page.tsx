"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import ModalFormShell from "@/components/ModalFormShell";
import DialogKonfirmasi from "@/components/DialogKonfirmasi";
import ToastNotifikasi, {
  NotificationToastProps,
} from "@/components/ToastNotifikasi";
import {
  UsersIcon,
  CheckIcon,
  CrownIcon,
  KeyIcon,
} from "@/components/icons/ContentIcons";
import {
  getUsersAction,
  createUserAction,
  updateUserAction,
  deleteUserAction,
  changePasswordAction,
} from "./actions";
import {
  fetchSessionUser,
  getCachedSessionUser,
} from "@/lib/client-session";
import { useCachedData } from "@/lib/use-cached-data";

type AppRole =
  | "admin"
  | "manager"
  | "staff"
  | "kasir"
  | "operator"
  | "user";

interface User {
  id: string;
  nama_pengguna: string;
  email?: string | null;
  nama_lengkap?: string;
  role: AppRole;
  aktif_status: number;
  dibuat_pada?: string;
  created_at?: string;
  updated_at?: string;
}

export default function UsersPage() {
  const router = useRouter();
  const initialUser =
    typeof window !== "undefined"
      ? (getCachedSessionUser() as User | null)
      : null;
  const [currentUser, setCurrentUser] = useState<User | null>(initialUser);
  const isPrivileged =
    initialUser?.role === "admin" || initialUser?.role === "manager";
  const {
    data: usersData,
    isLoading: usersLoading,
    mutate: mutateUsers,
  } = useCachedData<User[]>(isPrivileged ? "users" : null, async () => {
    const u = await getUsersAction();
    return (u as User[]) || [];
  });
  const users = usersData ?? [];
  const setUsers = useCallback<
    (next: User[] | ((prev: User[]) => User[])) => void
  >(
    (next) => {
      void mutateUsers(
        (prev) => {
          const base = (prev as User[] | undefined) ?? [];
          return typeof next === "function"
            ? (next as (p: User[]) => User[])(base)
            : next;
        },
        { revalidate: false }
      );
    },
    [mutateUsers]
  );
  const loading = currentUser === null && usersLoading;
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    nama_pengguna: "",
    email: "",
    nama_lengkap: "",
    password: "",
    role: "user" as AppRole,
    aktif_status: 1,
  });

  // Password Manager state
  interface Credential {
    id: string;
    pemilik_id: string;
    nama_layanan: string;
    nama_pengguna_akun: string;
    catatan: string;
    privat_status: boolean;
    dapat_melihat_password: boolean;
  }
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [showCredModal, setShowCredModal] = useState(false);
  const [editingCred, setEditingCred] = useState<Credential | null>(null);
  const [credForm, setCredForm] = useState({
    nama_layanan: "",
    nama_pengguna_akun: "",
    password: "",
    catatan: "",
    privat_status: true,
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

  // Click outside to close modals
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const user = await fetchSessionUser();
      if (cancelled) return;
      if (!user) {
        router.push("/auth/login");
        return;
      }
      setCurrentUser(user as User);
      const isAllowed = user.role === "admin" || user.role === "manager";
      if (isAllowed) {
        await mutateUsers();
      }
      await loadCredentials(user as User);
    })();
    return () => {
      cancelled = true;
    };
  }, [router, mutateUsers]);

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
            nama_layanan: "",
            nama_pengguna_akun: "",
            password: "",
            catatan: "",
            privat_status: true,
          });
        } else if (confirmDialog?.show) {
          setConfirmDialog(null);
        }
      }
    };

    window.addEventListener("keydown", handleEscKey);
    return () => window.removeEventListener("keydown", handleEscKey);
  }, [showModal, showCredModal, confirmDialog]);

  const showMsg = (type: "success" | "error", message: string) => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 2500);
  };

  const loadUsers = async (viewer?: User) => {
    if (viewer && viewer.role !== "admin" && viewer.role !== "manager") {
      setUsers([]);
      return;
    }
    try {
      await mutateUsers();
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
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Gagal memuat kredensial");
      setCredentials(data.kredensial || []);
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
        email: user.email || "",
        nama_lengkap: user.nama_lengkap || "",
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

  const handleCloseCredModal = () => {
    setShowCredModal(false);
    setEditingCred(null);
    setShowCredPassword(false);
    setCredForm({
      nama_layanan: "",
      nama_pengguna_akun: "",
      password: "",
      catatan: "",
      privat_status: true,
    });
  };

  const handleCredSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    try {
      if (editingCred) {
        const res = await fetch(`/api/passwords/${editingCred.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify(credForm),
        });
        const data = await res.json();
        if (!res.ok)
          throw new Error(data?.error || "Gagal update kredensial");

        if (credForm.password && credForm.password.trim() !== "") {
          setVisiblePasswords((prev) => {
            const updated = { ...prev };
            delete updated[editingCred.id];
            return updated;
          });
          if (showingPasswordId === editingCred.id) {
            setShowingPasswordId(null);
          }
        }

        showMsg("success", "Kredensial berhasil diupdate!");
      } else {
        const res = await fetch(`/api/passwords`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify(credForm),
        });
        const data = await res.json();
        if (!res.ok)
          throw new Error(data?.error || "Gagal menambah kredensial");
        showMsg("success", "Kredensial berhasil ditambahkan!");
      }
      handleCloseCredModal();
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
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (editingUser) {
        // Update existing user via service
        const updateData: any = {
          email: formData.email || null,
          nama_lengkap: formData.nama_lengkap,
          role: formData.role,
          aktif_status: formData.aktif_status,
        };

        await updateUserAction(editingUser.id, updateData);

        // Change password separately if provided
        if (formData.password) {
          await changePasswordAction(editingUser.id, "", formData.password);
        }

        showMsg("success", "User berhasil diupdate!");
      } else {
        // Create new user via service
        await createUserAction({
          nama_pengguna: formData.nama_pengguna,
          email: formData.email || undefined,
          nama_lengkap: formData.nama_lengkap,
          password: formData.password,
          role: formData.role,
          aktif_status: formData.aktif_status,
        });
        showMsg("success", "User berhasil ditambahkan!");
      }

      await loadUsers();
      handleCloseModal();
    } catch (err) {
      console.error("Error creating/updating user:", err);
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
      showMsg("error", "Tidak bisa menghapus user yang sedang login!");
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
          await deleteUserAction(userId);
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
      showMsg("error", "Tidak bisa menonaktifkan user yang sedang login!");
      return;
    }

    const target = users.find((u) => u.id === userId);
    if (!target) return;

    try {
      await updateUserAction(userId, {
        aktif_status: target.aktif_status ? 0 : 1,
      });
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

  if (loading && users.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
          <p className="mt-4 text-[#0a1b3d] dark:text-slate-100 font-semibold">Memuat...</p>
        </div>
      </div>
    );
  }

  return (
    <>
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
                className="px-6 py-3 bg-white dark:bg-slate-900 text-[#0a1b3d] dark:text-slate-100 rounded-xl font-semibold hover:shadow-xl transition-all flex items-center gap-2"
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
                Tambah Pengguna
              </button>
            </div>
          </div>

          {/* Users Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-[#0a1b3d]/10 to-[#00afef]/10">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-[#0a1b3d] dark:text-slate-100">
                      User
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-[#0a1b3d] dark:text-slate-100">
                      Email
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-[#0a1b3d] dark:text-slate-100">
                      Role
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-[#0a1b3d] dark:text-slate-100">
                      Status
                    </th>
                    <th className="px-6 py-4 text-right text-sm font-semibold text-[#0a1b3d] dark:text-slate-100">
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
                            {user.nama_lengkap?.charAt(0) ||
                              user.nama_pengguna.charAt(0)}
                          </div>
                          <div>
                            <div className="font-semibold text-[#0a1b3d] dark:text-slate-100">
                              {user.nama_lengkap || user.nama_pengguna}
                            </div>
                            <div className="text-sm text-[#6b7280] dark:text-slate-400">
                              @{user.nama_pengguna}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-[#6b7280] dark:text-slate-400">{user.email}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            user.role === "admin"
                              ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
                              : user.role === "manager"
                              ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                              : user.role === "staff"
                              ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                              : user.role === "kasir"
                              ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
                              : user.role === "operator"
                              ? "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700"
                              : "bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300"
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
                              ? "bg-green-100 dark:bg-green-900/30 text-green-700 hover:bg-green-200"
                              : "bg-red-100 dark:bg-red-900/30 text-red-700 hover:bg-red-200"
                          }`}
                        >
                          {user.aktif_status ? "Aktif" : "Nonaktif"}
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenModal(user)}
                            className="p-2 text-blue-600 dark:text-blue-300 hover:bg-slate-100 dark:hover:bg-white/10 dark:bg-slate-800 rounded-lg transition-colors"
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
                  ))}
                </tbody>
              </table>
            </div>

            {users.length === 0 && (
              <div className="text-center py-12 text-[#6b7280] dark:text-slate-400">
                <p>Belum ada user.</p>
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="flex flex-wrap gap-3 mt-4">
            <div className="flex items-center gap-2 bg-white dark:bg-slate-900 rounded-lg px-4 py-2.5 border-l-4 border-l-[#00afef] shadow-sm">
              <UsersIcon size={16} className="text-[#00afef] shrink-0" />
              <span className="text-sm text-slate-500 dark:text-slate-400">Total Pengguna</span>
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{users.length}</span>
            </div>
            <div className="flex items-center gap-2 bg-white dark:bg-slate-900 rounded-lg px-4 py-2.5 border-l-4 border-l-green-500 shadow-sm">
              <CheckIcon size={16} className="text-green-600 shrink-0" />
              <span className="text-sm text-slate-500 dark:text-slate-400">Aktif</span>
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{users.filter((u) => u.aktif_status).length}</span>
            </div>
            <div className="flex items-center gap-2 bg-white dark:bg-slate-900 rounded-lg px-4 py-2.5 border-l-4 border-l-purple-500 shadow-sm">
              <CrownIcon size={16} className="text-purple-600 dark:text-purple-300 shrink-0" />
              <span className="text-sm text-slate-500 dark:text-slate-400">Admin</span>
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{users.filter((u) => u.role === "admin").length}</span>
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
                nama_layanan: "",
                nama_pengguna_akun: "",
                password: "",
                catatan: "",
                privat_status: true,
              });
              setShowCredModal(true);
            }}
            className="px-6 py-3 bg-white dark:bg-slate-900 text-[#0a1b3d] dark:text-slate-100 rounded-xl font-semibold hover:shadow-xl transition-all flex items-center gap-2"
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

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-[#0a1b3d]/10 to-[#00afef]/10">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-[#0a1b3d] dark:text-slate-100">
                  Layanan
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-[#0a1b3d] dark:text-slate-100">
                  Akun
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-[#0a1b3d] dark:text-slate-100">
                  Password
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-[#0a1b3d] dark:text-slate-100">
                  Visibilitas
                </th>
                <th className="px-6 py-4 text-right text-sm font-semibold text-[#0a1b3d] dark:text-slate-100">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {credentials.map((c) => (
                <tr key={c.id} className="hover:bg-sky-50/40 transition-colors">
                  <td className="px-6 py-4 text-[#0a1b3d] dark:text-slate-100 font-semibold">
                    {c.nama_layanan}
                  </td>
                  <td className="px-6 py-4 text-[#6b7280] dark:text-slate-400">
                    {c.nama_pengguna_akun}
                  </td>
                  <td className="px-6 py-4">
                    {c.dapat_melihat_password ? (
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-[#0a1b3d] dark:text-slate-100">
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
                                  credentials: "include",
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
                      <span className="text-[#6b7280] dark:text-slate-400 text-sm italic">
                        Tidak ada akses
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        c.privat_status
                          ? "bg-red-100 dark:bg-red-900/30 text-red-700"
                          : "bg-green-100 dark:bg-green-900/30 text-green-700"
                      }`}
                    >
                      {c.privat_status ? "Private" : "Tim"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      {c.dapat_melihat_password && (
                        <button
                          onClick={async () => {
                            try {
                              let password = visiblePasswords[c.id];
                              if (!password) {
                                const res = await fetch(
                                  `/api/passwords/${c.id}`,
                                  {
                                    credentials: "include",
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
                          className="p-2 text-emerald-700 dark:text-emerald-300 hover:bg-slate-100 dark:hover:bg-white/10 dark:bg-slate-800 rounded-lg transition-colors"
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
                            nama_layanan: c.nama_layanan,
                            nama_pengguna_akun: c.nama_pengguna_akun,
                            password: "",
                            catatan: c.catatan,
                            privat_status: c.privat_status,
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
                            message: `Yakin ingin menghapus kredensial berikut?\n\nLayanan: ${c.nama_layanan}\nAkun: ${c.nama_pengguna_akun}\n\nTindakan ini tidak dapat dibatalkan!`,
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
                                    credentials: "include",
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
              ))}
            </tbody>
          </table>
        </div>

        {credentials.length === 0 && (
          <div className="text-center py-12 text-[#6b7280] dark:text-slate-400">
            <p>Belum ada kredensial.</p>
          </div>
        )}
      </div>

      <ModalFormShell
        open={showModal}
        onClose={handleCloseModal}
        maxWidthClass="max-w-md"
        header={
          <div className="p-6 border-b border-gray-200 dark:border-slate-800 bg-gradient-to-r from-[#0a1b3d] to-[#00afef] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 bg-white/20 dark:bg-slate-900/20 rounded-lg shrink-0">
                <UsersIcon size={28} className="text-white" />
              </div>
              <h3 className="text-xl font-bold text-white truncate">
                {editingUser ? "Edit Pengguna" : "Tambah Pengguna Baru"}
              </h3>
            </div>
            <button
              type="button"
              onClick={handleCloseModal}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors shrink-0"
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
              onClick={handleCloseModal}
              className="px-6 py-2 bg-white dark:bg-slate-900 border-2 border-gray-300 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-100 transition-colors font-semibold"
            >
              Batal
            </button>
            <button
              type="submit"
              form="users-manage-form"
              className="px-6 py-2 bg-gradient-to-r from-[#0a1b3d] to-[#00afef] text-white rounded-lg hover:shadow-lg transition-all font-semibold"
            >
              Simpan
            </button>
          </div>
        }
      >
            <form
              id="users-manage-form"
              onSubmit={handleSubmit}
              className="p-6 space-y-4"
            >
              <div>
                <label className="block text-sm font-semibold text-[#0a1b3d] dark:text-slate-100 mb-2">
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
                  className="w-full px-4 py-2 border-2 border-gray-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00afef] focus:border-[#00afef] transition disabled:bg-gray-100 dark:bg-slate-800 dark:text-slate-100"
                  placeholder="username"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#0a1b3d] dark:text-slate-100 mb-2">
                  Nama Lengkap
                </label>
                <input
                  type="text"
                  value={formData.nama_lengkap}
                  onChange={(e) =>
                    setFormData({ ...formData, nama_lengkap: e.target.value })
                  }
                  required
                  className="w-full px-4 py-2 border-2 border-gray-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00afef] focus:border-[#00afef] transition dark:bg-slate-800 dark:text-slate-100"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#0a1b3d] dark:text-slate-100 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  required
                  className="w-full px-4 py-2 border-2 border-gray-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00afef] focus:border-[#00afef] transition dark:bg-slate-800 dark:text-slate-100"
                  placeholder="email@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#0a1b3d] dark:text-slate-100 mb-2">
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
                    className="w-full px-4 py-2 pr-12 border-2 border-gray-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00afef] focus:border-[#00afef] transition dark:bg-slate-800 dark:text-slate-100"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowUserPassword(!showUserPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-slate-400 hover:text-[#00afef] transition-colors"
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
                <label className="block text-sm font-semibold text-[#0a1b3d] dark:text-slate-100 mb-2">
                  Role
                </label>
                <select
                  value={formData.role}
                  onChange={(e) =>
                    setFormData({ ...formData, role: e.target.value as AppRole })
                  }
                  className="w-full px-4 py-2 border-2 border-gray-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00afef] focus:border-[#00afef] transition dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="user">Pengguna</option>
                  <option value="operator">Operator</option>
                  <option value="kasir">Kasir</option>
                  <option value="staff">Staf</option>
                  <option value="manager">Manajer</option>
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
                  className="text-sm font-medium text-[#0a1b3d] dark:text-slate-100"
                >
                  User Aktif
                </label>
              </div>

            </form>
      </ModalFormShell>

      <ModalFormShell
        open={showCredModal}
        onClose={handleCloseCredModal}
        maxWidthClass="max-w-md"
        header={
          <div className="p-6 border-b border-gray-200 dark:border-slate-800 bg-gradient-to-r from-[#0a1b3d]/90 to-[#00afef]/90 flex items-center justify-between shrink-0 gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-2 bg-white/20 dark:bg-slate-900/20 rounded-lg shrink-0">
                <KeyIcon size={24} className="text-white" />
              </div>
              <h3 className="text-xl font-bold text-white truncate">
                {editingCred ? "Edit Kredensial" : "Tambah Kredensial"}
              </h3>
            </div>
            <button
              type="button"
              onClick={handleCloseCredModal}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors shrink-0"
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
              onClick={handleCloseCredModal}
              className="px-6 py-2 bg-white dark:bg-slate-900 border-2 border-gray-300 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-100 transition-colors font-semibold"
            >
              Batal
            </button>
            <button
              type="submit"
              form="cred-manager-form"
              className="px-6 py-2 bg-gradient-to-r from-[#0a1b3d]/90 to-[#00afef]/90 text-white rounded-lg hover:shadow-lg transition-all font-semibold"
            >
              Simpan
            </button>
          </div>
        }
      >
            <form
              id="cred-manager-form"
              onSubmit={handleCredSubmit}
              className="p-6 space-y-4"
            >
              <div>
                <label className="block text-sm font-semibold text-[#0a1b3d] dark:text-slate-100 mb-2">
                  Nama Layanan
                </label>
                <input
                  type="text"
                  value={credForm.nama_layanan}
                  onChange={(e) =>
                    setCredForm({ ...credForm, nama_layanan: e.target.value })
                  }
                  required
                  className="w-full px-4 py-2 border-2 border-gray-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition dark:bg-slate-800 dark:text-slate-100"
                  placeholder="Microsoft, Google, GitHub, BCA, dll."
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#0a1b3d] dark:text-slate-100 mb-2">
                  Akun (Email/Username)
                </label>
                <input
                  type="text"
                  value={credForm.nama_pengguna_akun}
                  onChange={(e) =>
                    setCredForm({
                      ...credForm,
                      nama_pengguna_akun: e.target.value,
                    })
                  }
                  required
                  className="w-full px-4 py-2 border-2 border-gray-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition dark:bg-slate-800 dark:text-slate-100"
                  placeholder="email@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#0a1b3d] dark:text-slate-100 mb-2">
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
                    className="w-full px-4 py-2 pr-12 border-2 border-gray-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition dark:bg-slate-800 dark:text-slate-100"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCredPassword(!showCredPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-slate-400 hover:text-emerald-600 dark:text-emerald-300 transition-colors"
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
                <label className="block text-sm font-semibold text-[#0a1b3d] dark:text-slate-100 mb-2">
                  Catatan
                </label>
                <textarea
                  value={credForm.catatan}
                  onChange={(e) =>
                    setCredForm({ ...credForm, catatan: e.target.value })
                  }
                  className="w-full px-4 py-2 border-2 border-gray-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition dark:bg-slate-800 dark:text-slate-100"
                  placeholder="Keterangan tambahan"
                />
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="cred_private"
                  checked={credForm.privat_status}
                  onChange={(e) =>
                    setCredForm({
                      ...credForm,
                      privat_status: e.target.checked,
                    })
                  }
                  className="w-4 h-4 text-emerald-600 dark:text-emerald-300 border-gray-300 rounded focus:ring-emerald-500"
                />
                <label
                  htmlFor="cred_private"
                  className="text-sm font-medium text-[#0a1b3d] dark:text-slate-100"
                >
                  Sembunyikan dari user lain
                </label>
              </div>
            </form>
      </ModalFormShell>

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
