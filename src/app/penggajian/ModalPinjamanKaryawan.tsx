"use client";

import { useState, useCallback, useMemo } from "react";
import ModalFormShell from "@/components/ModalFormShell";
import DialogKonfirmasi from "@/components/DialogKonfirmasi";
import { useCachedData, useInvalidate } from "@/lib/use-cached-data";
import { formatRupiah } from "@/lib/format-id";
import { getTodayJakarta } from "@/lib/date-utils";
import {
  listPinjamanAction,
  catatTarikPinjamanAction,
  bayarPinjamanTunaiAction,
  revertPinjamanAction,
} from "./actions";
import type { PinjamanKaryawan } from "@/lib/services/pinjaman-karyawan-service";

// MARKER_MODAL

const JENIS_LABEL: Record<string, string> = {
  TARIK: "Tarik Kasbon",
  POTONG_GAJI: "Potong Gaji",
  BAYAR_TUNAI: "Bayar Tunai",
  POTONG_BAGI_HASIL: "Potong Bagi Hasil",
};

const JENIS_CHIP: Record<string, string> = {
  TARIK: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200",
  POTONG_GAJI:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
  BAYAR_TUNAI:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
  POTONG_BAGI_HASIL:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
};

export interface ModalPinjamanKaryawanProps {
  actor: { id: string; nama: string };
  onClose: () => void;
  onSuccess: () => void;
  showNotification: (type: "success" | "error", message: string) => void;
}

interface PinjamanData {
  pinjaman: PinjamanKaryawan[];
  totalRiwayat: number;
  saldo: number | null;
}

export default function ModalPinjamanKaryawan({
  actor,
  onClose,
  onSuccess,
  showNotification,
}: ModalPinjamanKaryawanProps) {
  const invalidate = useInvalidate();
  const cacheKey = `pinjaman:${actor.id}`;

  const { data, isLoading, refresh } = useCachedData<PinjamanData>(
    cacheKey,
    () => listPinjamanAction(actor.id),
  );
  const riwayat = useMemo(() => data?.pinjaman ?? [], [data]);
  const totalRiwayat = data?.totalRiwayat ?? 0;
  const saldo = data?.saldo ?? 0;

  const [mode, setMode] = useState<"TARIK" | "BAYAR_TUNAI">("TARIK");
  const [jumlah, setJumlah] = useState("");
  const [tanggal, setTanggal] = useState(getTodayJakarta());
  const [keterangan, setKeterangan] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [revertTarget, setRevertTarget] = useState<PinjamanKaryawan | null>(
    null,
  );

  const reloadList = useCallback(() => {
    invalidate(cacheKey);
    void refresh();
  }, [invalidate, cacheKey, refresh]);

  const handleSimpan = useCallback(async () => {
    const nominal = Number(jumlah) || 0;
    if (!(nominal > 0)) {
      showNotification("error", "Jumlah harus lebih dari 0.");
      return;
    }
    try {
      setSubmitting(true);
      const payload = {
        actorId: actor.id,
        actorNama: actor.nama,
        jumlah: nominal,
        tanggal,
        keterangan: keterangan.trim() || undefined,
      };
      if (mode === "TARIK") {
        await catatTarikPinjamanAction(payload);
        showNotification("success", "Kasbon dicatat.");
      } else {
        await bayarPinjamanTunaiAction(payload);
        showNotification("success", "Pembayaran kasbon dicatat.");
      }
      setJumlah("");
      setKeterangan("");
      reloadList();
      onSuccess();
    } catch (e: any) {
      showNotification(
        "error",
        e?.message || "Gagal menyimpan transaksi kasbon.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [
    jumlah,
    actor.id,
    tanggal,
    keterangan,
    mode,
    reloadList,
    onSuccess,
    showNotification,
  ]);

  const handleRevert = useCallback(async () => {
    if (!revertTarget) return;
    try {
      await revertPinjamanAction(revertTarget.id);
      showNotification("success", "Transaksi kasbon dibatalkan.");
      setRevertTarget(null);
      reloadList();
      onSuccess();
    } catch (e: any) {
      showNotification("error", e?.message || "Gagal membatalkan transaksi.");
    }
  }, [revertTarget, reloadList, onSuccess, showNotification]);

  const header = (
    <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-gradient-to-r from-cyan-600 to-cyan-700 text-white">
      <div>
        <h2 className="text-lg font-semibold">Kasbon / Pinjaman Karyawan</h2>
        <p className="text-sm text-cyan-100">{actor.nama}</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Tutup"
        className="text-cyan-100 hover:text-white text-2xl leading-none"
      >
        &times;
      </button>
    </div>
  );

  const footer = (
    <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-end">
      <button
        type="button"
        onClick={onClose}
        className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 font-medium"
      >
        Tutup
      </button>
    </div>
  );

  return (
    <>
      <ModalFormShell
        open
        onClose={onClose}
        header={header}
        footer={footer}
        maxWidthClass="max-w-2xl"
      >
        <div className="p-6 space-y-6">
          {/* Saldo berjalan */}
          <div className="rounded-xl bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-800 px-5 py-4">
            <p className="text-xs uppercase tracking-wide text-cyan-700 dark:text-cyan-300 font-medium">
              Sisa Kasbon Berjalan
            </p>
            <p className="text-2xl font-bold text-cyan-800 dark:text-cyan-200 tabular-nums">
              {formatRupiah(saldo)}
            </p>
          </div>

          {/* Form catat transaksi */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <div className="flex gap-2 mb-4">
              <button
                type="button"
                onClick={() => setMode("TARIK")}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold ${
                  mode === "TARIK"
                    ? "bg-cyan-600 text-white"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                }`}
              >
                Tarik Kasbon
              </button>
              <button
                type="button"
                onClick={() => setMode("BAYAR_TUNAI")}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold ${
                  mode === "BAYAR_TUNAI"
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                }`}
              >
                Bayar Tunai
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Jumlah (Rp)
                </label>
                <input
                  type="number"
                  min={0}
                  value={jumlah}
                  onChange={(e) => setJumlah(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void handleSimpan()}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Tanggal
                </label>
                <input
                  type="date"
                  value={tanggal}
                  onChange={(e) => setTanggal(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Keterangan (opsional)
                </label>
                <input
                  type="text"
                  value={keterangan}
                  onChange={(e) => setKeterangan(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void handleSimpan()}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                disabled={submitting}
                onClick={handleSimpan}
                className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold disabled:opacity-60"
              >
                {submitting ? "Menyimpan..." : "Catat"}
              </button>
            </div>
          </div>

          {/* Riwayat */}
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Riwayat
              </h3>
              {totalRiwayat > riwayat.length && (
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  Menampilkan {riwayat.length} dari {totalRiwayat} transaksi terbaru
                </span>
              )}
            </div>
            {isLoading ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Memuat...
              </p>
            ) : riwayat.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500 italic">
                Belum ada transaksi kasbon.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg max-h-64 overflow-y-auto">
                {riwayat.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            JENIS_CHIP[p.jenis] ??
                            "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                          }`}
                        >
                          {JENIS_LABEL[p.jenis] ?? p.jenis}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {p.tanggal}
                        </span>
                      </div>
                      {p.keterangan && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          {p.keterangan}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                        {formatRupiah(p.jumlah)}
                      </span>
                      {p.jenis !== "POTONG_GAJI" &&
                        p.jenis !== "POTONG_BAGI_HASIL" && (
                          <button
                            type="button"
                            onClick={() => setRevertTarget(p)}
                            className="text-rose-600 hover:text-rose-700 dark:text-rose-400 text-xs font-medium"
                          >
                            Batalkan
                          </button>
                        )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
              Potongan gaji hanya bisa dibatalkan lewat pembatalan proses gaji.
            </p>
          </div>
        </div>
      </ModalFormShell>

      <DialogKonfirmasi
        show={!!revertTarget}
        title="Batalkan transaksi kasbon?"
        message="Baris buku kas terkait akan dihapus dan saldo kasbon disesuaikan. Lanjutkan?"
        type="danger"
        confirmText="Batalkan"
        onConfirm={handleRevert}
        onCancel={() => setRevertTarget(null)}
      />
    </>
  );
}
