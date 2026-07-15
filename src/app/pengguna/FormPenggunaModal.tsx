"use client";

import { useState } from "react";
import ModalFormShell from "@/components/ModalFormShell";
import { UsersIcon } from "@/components/icons/ContentIcons";
import {
  createUserAction,
  updateUserAction,
  changePasswordAction,
} from "./actions";

export type AppRole =
  | "admin"
  | "manager"
  | "staff"
  | "kasir"
  | "operator"
  | "user"
  | "demo";

export interface PenggunaForm {
  id: string;
  nama_pengguna: string;
  email?: string | null;
  nama_lengkap?: string;
  role: AppRole;
  aktif_status: number;
}

interface Props {
  /** null = mode tambah; objek = mode edit. */
  pengguna: PenggunaForm | null;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
  showNotification: (type: "success" | "error", message: string) => void;
}
// MARKER_BODY

/**
 * Modal tambah/edit pengguna. Diekstrak dari pengguna/page.tsx (U-I1) supaya
 * state form + visibilitas password + logika submit terisolasi. Mode ditentukan
 * oleh prop `pengguna` (null = tambah). Setelah sukses, parent me-reload daftar.
 */
export default function FormPenggunaModal({
  pengguna,
  onClose,
  onSuccess,
  showNotification,
}: Props) {
  const isEdit = !!pengguna;
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    nama_pengguna: pengguna?.nama_pengguna ?? "",
    email: pengguna?.email ?? "",
    nama_lengkap: pengguna?.nama_lengkap ?? "",
    password: "",
    role: (pengguna?.role ?? "user") as AppRole,
    aktif_status: pengguna?.aktif_status ?? 1,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (pengguna) {
        await updateUserAction(pengguna.id, {
          email: form.email || null,
          nama_lengkap: form.nama_lengkap,
          role: form.role,
          aktif_status: form.aktif_status,
        });
        if (form.password) {
          await changePasswordAction(pengguna.id, "", form.password);
        }
        showNotification("success", "User berhasil diupdate!");
      } else {
        await createUserAction({
          nama_pengguna: form.nama_pengguna,
          email: form.email || undefined,
          nama_lengkap: form.nama_lengkap,
          password: form.password,
          role: form.role,
          aktif_status: form.aktif_status,
        });
        showNotification("success", "User berhasil ditambahkan!");
      }
      await onSuccess();
      onClose();
    } catch (err) {
      console.error("Error creating/updating user:", err);
      showNotification(
        "error",
        `Terjadi kesalahan saat menyimpan user: ${
          err instanceof Error ? err.message : "Unknown"
        }`,
      );
    }
  };

  return (
    <ModalFormShell
      open
      onClose={onClose}
      maxWidthClass="max-w-md"
      header={
        <div className="p-6 border-b border-gray-200 dark:border-slate-800 bg-gradient-to-r from-[#0a1b3d] to-[#00afef] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-white/20 dark:bg-slate-900/20 rounded-lg shrink-0">
              <UsersIcon size={28} className="text-white" />
            </div>
            <h3 className="text-xl font-bold text-white truncate">
              {isEdit ? "Edit Pengguna" : "Tambah Pengguna Baru"}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
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
            onClick={onClose}
            className="px-6 py-2 bg-white dark:bg-slate-900 border-2 border-gray-300 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors font-semibold"
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
            value={form.nama_pengguna}
            onChange={(e) =>
              setForm({ ...form, nama_pengguna: e.target.value })
            }
            required
            disabled={isEdit}
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
            value={form.nama_lengkap}
            onChange={(e) => setForm({ ...form, nama_lengkap: e.target.value })}
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
            value={form.email ?? ""}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
            className="w-full px-4 py-2 border-2 border-gray-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00afef] focus:border-[#00afef] transition dark:bg-slate-800 dark:text-slate-100"
            placeholder="email@example.com"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-[#0a1b3d] dark:text-slate-100 mb-2">
            Password {isEdit && "(kosongkan jika tidak diubah)"}
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required={!isEdit}
              className="w-full px-4 py-2 pr-12 border-2 border-gray-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00afef] focus:border-[#00afef] transition dark:bg-slate-800 dark:text-slate-100"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-slate-400 hover:text-[#00afef] transition-colors"
              aria-label={
                showPassword ? "Sembunyikan password" : "Tampilkan password"
              }
            >
              {showPassword ? (
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
            value={form.role}
            onChange={(e) =>
              setForm({ ...form, role: e.target.value as AppRole })
            }
            className="w-full px-4 py-2 border-2 border-gray-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00afef] focus:border-[#00afef] transition dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="user">Pengguna</option>
            <option value="operator">Operator</option>
            <option value="kasir">Kasir</option>
            <option value="staff">Staf</option>
            <option value="manager">Manajer</option>
            <option value="admin">Admin</option>
            <option value="demo">Demo (Hanya Lihat)</option>
          </select>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="aktif_status"
            checked={form.aktif_status === 1}
            onChange={(e) =>
              setForm({ ...form, aktif_status: e.target.checked ? 1 : 0 })
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
  );
}
