"use client";

import { useState, useEffect, useMemo } from "react";
import ModalFormShell from "@/components/ModalFormShell";
import {
  listPeranKaryawanAction,
  tambahKaryawanAction,
  listPengurusBelumDigajiAction,
} from "./actions";

export interface ModalTambahKaryawanProps {
  onClose: () => void;
  /** Dipanggil setelah karyawan dibuat/dipilih; induk membuka Atur Kompensasi. */
  onCreated: (actorId: string, nama: string) => void;
  showNotification: (type: "success" | "error", message: string) => void;
}

interface PeranOpsi {
  id: string;
  role_code: string;
  role_label: string;
  role_group: string;
}

interface PengurusOpsi {
  actor_id: string;
  nama: string;
  role_code: string;
}

export default function ModalTambahKaryawan({
  onClose,
  onCreated,
  showNotification,
}: ModalTambahKaryawanProps) {
  const [mode, setMode] = useState<"baru" | "pengurus">("baru");
  const [roles, setRoles] = useState<PeranOpsi[]>([]);
  const [pengurus, setPengurus] = useState<PengurusOpsi[]>([]);
  const [pengurusId, setPengurusId] = useState("");
  const [nama, setNama] = useState("");
  const [roleCode, setRoleCode] = useState("");
  const [catatan, setCatatan] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    listPeranKaryawanAction()
      .then((r) => {
        setRoles(r as PeranOpsi[]);
        if (r.length > 0) setRoleCode((r as PeranOpsi[])[0].role_code);
      })
      .catch(() => {});
    listPengurusBelumDigajiAction()
      .then((r) => setPengurus(r))
      .catch(() => {});
  }, []);

  const canSubmit = useMemo(() => {
    if (submitting) return false;
    if (mode === "pengurus") return pengurusId.length > 0;
    return nama.trim().length > 0 && roleCode.length > 0;
  }, [mode, pengurusId, nama, roleCode, submitting]);

  async function handleSimpan() {
    if (!canSubmit) return;
    // Mode "pengurus": orang sudah ada, langsung lanjut atur gajinya.
    if (mode === "pengurus") {
      const p = pengurus.find((x) => x.actor_id === pengurusId);
      if (!p) return;
      onCreated(p.actor_id, p.nama);
      return;
    }
    try {
      setSubmitting(true);
      const res = await tambahKaryawanAction({
        display_name: nama.trim(),
        role_code: roleCode,
        notes: catatan.trim() || undefined,
      });
      showNotification("success", `${res.nama} ditambahkan.`);
      onCreated(res.actor_id, res.nama);
    } catch (e) {
      showNotification(
        "error",
        (e as Error)?.message || "Gagal menambah karyawan."
      );
    } finally {
      setSubmitting(false);
    }
  }

  const header = (
    <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-gradient-to-r from-indigo-600 to-emerald-600 text-white">
      <div>
        <h2 className="text-lg font-semibold">Tambah Karyawan</h2>
        <p className="text-sm text-indigo-100">
          Setelah disimpan, atur komponen gajinya.
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Tutup"
        className="text-indigo-100 hover:text-white text-2xl leading-none"
      >
        &times;
      </button>
    </div>
  );

  const footer = (
    <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2">
      <button
        type="button"
        onClick={onClose}
        className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 font-medium"
      >
        Batal
      </button>
      <button
        type="button"
        disabled={!canSubmit}
        onClick={handleSimpan}
        className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-60"
      >
        {submitting
          ? "Menyimpan..."
          : mode === "pengurus"
            ? "Lanjut Atur Gaji"
            : "Simpan & Atur Gaji"}
      </button>
    </div>
  );

  return (
    <ModalFormShell open onClose={onClose} header={header} footer={footer} maxWidthClass="max-w-lg">
      <div className="p-6 space-y-4">
        {pengurus.length > 0 && (
          <div className="flex rounded-lg border border-slate-300 dark:border-slate-600 overflow-hidden text-sm">
            <button
              type="button"
              onClick={() => setMode("baru")}
              className={`flex-1 px-3 py-2 font-medium transition-colors ${
                mode === "baru"
                  ? "bg-indigo-600 text-white"
                  : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
              }`}
            >
              Orang Baru
            </button>
            <button
              type="button"
              onClick={() => setMode("pengurus")}
              className={`flex-1 px-3 py-2 font-medium transition-colors ${
                mode === "pengurus"
                  ? "bg-indigo-600 text-white"
                  : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
              }`}
            >
              Pengurus yang Sudah Ada
            </button>
          </div>
        )}

        {mode === "pengurus" ? (
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Pilih pengurus untuk juga digaji
            </label>
            <select
              value={pengurusId}
              onChange={(e) => setPengurusId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
            >
              <option value="">— Pilih orang —</option>
              {pengurus.map((p) => (
                <option key={p.actor_id} value={p.actor_id}>
                  {p.nama} ({p.role_code})
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              Orang ini sudah terdaftar sebagai pengurus (penerima bagi hasil).
              Setelah ini Anda atur komponen gajinya, lalu dia juga bisa pinjam
              kasbon lewat halaman Karyawan.
            </p>
          </div>
        ) : (
          <>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Nama
              </label>
              <input
                type="text"
                autoFocus
                value={nama}
                onChange={(e) => setNama(e.target.value)}
                placeholder="Mis. Andi"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Jabatan
              </label>
              <select
                value={roleCode}
                onChange={(e) => setRoleCode(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.role_code}>
                    {r.role_label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Catatan (opsional)
              </label>
              <input
                type="text"
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
              />
            </div>
          </>
        )}
      </div>
    </ModalFormShell>
  );
}
