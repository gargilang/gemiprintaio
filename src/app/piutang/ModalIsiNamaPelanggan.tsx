"use client";

import { useState, useEffect, useMemo } from "react";
import ModalFormShell from "@/components/ModalFormShell";
import PilihanCari from "@/components/PilihanCari";
import { UsersIcon } from "@/components/icons/PageIcons";
import { getPelangganAction } from "@/app/pelanggan/actions";
import { isiNamaPelangganAction } from "./actions";

interface Props {
  /** ID penjualan walk-in yang akan diisi namanya. null = modal tertutup. */
  penjualanId: string | null;
  onClose: () => void;
  onSuccess: () => void;
  showNotification: (tipe: "success" | "error", pesan: string) => void;
}

type Mode = "terdaftar" | "bebas";

export default function ModalIsiNamaPelanggan({
  penjualanId,
  onClose,
  onSuccess,
  showNotification,
}: Props) {
  const isOpen = penjualanId !== null;

  const [mode, setMode] = useState<Mode>("terdaftar");
  const [pelangganId, setPelangganId] = useState("");
  const [namaBebas, setNamaBebas] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Daftar pelanggan terdaftar untuk PilihanCari
  const [pelangganList, setPelangganList] = useState<
    Array<{ id: string; nama: string }>
  >([]);
  const [loadingPelanggan, setLoadingPelanggan] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    // Reset saat modal dibuka
    setMode("terdaftar");
    setPelangganId("");
    setNamaBebas("");
    // Muat daftar pelanggan
    setLoadingPelanggan(true);
    getPelangganAction()
      .then((list) => setPelangganList(list.map((p) => ({ id: p.id, nama: p.nama }))))
      .catch(() => showNotification("error", "Gagal memuat daftar pelanggan"))
      .finally(() => setLoadingPelanggan(false));
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const pelangganOptions = useMemo(
    () => pelangganList.map((p) => ({ value: p.id, label: p.nama })),
    [pelangganList],
  );

  const handleSubmit = async () => {
    if (!penjualanId) return;

    if (mode === "terdaftar" && !pelangganId) {
      showNotification("error", "Pilih pelanggan terlebih dahulu");
      return;
    }
    if (mode === "bebas" && !namaBebas.trim()) {
      showNotification("error", "Nama pelanggan tidak boleh kosong");
      return;
    }

    setSubmitting(true);
    try {
      const res = await isiNamaPelangganAction({
        penjualan_id: penjualanId,
        pelanggan_id: mode === "terdaftar" ? pelangganId : null,
        pelanggan_nama_snapshot: mode === "bebas" ? namaBebas.trim() : null,
      });

      if (res.ok) {
        showNotification("success", "Nama pelanggan berhasil disimpan");
        onSuccess();
        onClose();
      } else {
        showNotification("error", res.error ?? "Gagal menyimpan nama pelanggan");
      }
    } catch (err: any) {
      showNotification("error", err.message ?? "Terjadi kesalahan tak terduga");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalFormShell
      open={isOpen}
      onClose={onClose}
      maxWidthClass="max-w-md"
      header={
        <div className="flex items-center gap-3 px-6 py-4 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-t-2xl text-white">
          <div className="bg-white/20 rounded-lg p-2">
            <UsersIcon size={20} className="text-white" />
          </div>
          <div>
            <h2 className="font-bold text-lg">Isi Nama Pelanggan</h2>
            <p className="text-indigo-100 text-sm">Sinkron ke Riwayat Penjualan &amp; SPK</p>
          </div>
        </div>
      }
      footer={
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="px-5 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {submitting ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      }
    >
      <div className="p-6 space-y-4">
        {/* Pilih mode */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("terdaftar")}
            className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
              mode === "terdaftar"
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700"
            }`}
          >
            Pelanggan Terdaftar
          </button>
          <button
            type="button"
            onClick={() => setMode("bebas")}
            className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
              mode === "bebas"
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700"
            }`}
          >
            Nama Bebas
          </button>
        </div>

        {/* Input sesuai mode */}
        {mode === "terdaftar" ? (
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Pilih Pelanggan
            </label>
            {loadingPelanggan ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Memuat daftar pelanggan...
              </p>
            ) : (
              <PilihanCari
                options={pelangganOptions}
                value={pelangganId}
                onChange={setPelangganId}
                placeholder="Cari nama pelanggan..."
                emptyText="Pelanggan tidak ditemukan"
              />
            )}
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Nama Pelanggan
            </label>
            <input
              type="text"
              value={namaBebas}
              onChange={(e) => setNamaBebas(e.target.value)}
              placeholder="Mis. Pak Budi / CV Maju Jaya"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
        )}

        <p className="text-xs text-slate-500 dark:text-slate-400">
          Perubahan ini akan muncul di Riwayat Penjualan dan SPK terkait.
        </p>
      </div>
    </ModalFormShell>
  );
}
