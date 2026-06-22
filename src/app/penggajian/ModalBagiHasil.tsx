"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import ModalFormShell from "@/components/ModalFormShell";
import DialogKonfirmasi from "@/components/DialogKonfirmasi";
import { useCachedData, useInvalidate } from "@/lib/use-cached-data";
import { formatRupiah } from "@/lib/format-id";
import { getTodayJakarta } from "@/lib/date-utils";
import {
  listPinjamanAction,
  potongBagiHasilAction,
  batalkanPotongBagiHasilAction,
} from "./actions";
import { slugifyActorName } from "@/lib/slug-utils";
import type { PinjamanKaryawan } from "@/lib/services/pinjaman-karyawan-service";

function bulanIni(): string {
  return getTodayJakarta().slice(0, 7);
}

export interface ModalBagiHasilProps {
  actor: { id: string; nama: string };
  onClose: () => void;
  onSuccess: () => void;
  showNotification: (type: "success" | "error", message: string) => void;
}

interface PinjamanData {
  pinjaman: PinjamanKaryawan[];
  saldo: number | null;
}

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

export default function ModalBagiHasil({
  actor,
  onClose,
  onSuccess,
  showNotification,
}: ModalBagiHasilProps) {
  const invalidate = useInvalidate();
  const cacheKey = `pinjaman:${actor.id}`;

  const { data, isLoading, refresh } = useCachedData<PinjamanData>(
    cacheKey,
    () => listPinjamanAction(actor.id),
  );
  const riwayat = useMemo(() => data?.pinjaman ?? [], [data]);
  const saldo = data?.saldo ?? 0;

  const [periode, setPeriode] = useState(bulanIni());
  const [bagiHasil, setBagiHasil] = useState<number | null>(null);
  const [loadingBagiHasil, setLoadingBagiHasil] = useState(false);
  const [jumlah, setJumlah] = useState("");
  const [tanggal, setTanggal] = useState(getTodayJakarta());
  const [keterangan, setKeterangan] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [batalTarget, setBatalTarget] = useState<PinjamanKaryawan | null>(null);

  const slug = slugifyActorName(actor.nama);
  const formulaKey = `bagi_hasil_${slug}`;

  // Fetch bagi hasil value whenever periode changes
  useEffect(() => {
    let cancelled = false;
    setLoadingBagiHasil(true);
    setBagiHasil(null);
    fetch(`/api/keuangan/summary-v2?month=${periode}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        // bagi_hasil is in rows[i].metrics[formulaKey] for the matching actor
        const rows: Array<{
          actorId?: string;
          metrics: Record<string, number>;
        }> = json?.rows ?? [];
        const actorRow = rows.find((r) => r.actorId === actor.id);
        const val = actorRow?.metrics?.[formulaKey] ?? null;
        setBagiHasil(typeof val === "number" ? val : null);
        if (typeof val === "number" && val > 0 && !jumlah) {
          setJumlah(String(Math.min(saldo, val)));
        }
      })
      .catch(() => {
        if (!cancelled) setBagiHasil(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingBagiHasil(false);
      });
    return () => {
      cancelled = true;
    };
    // 'saldo' sengaja tidak dimasukkan: pre-fill hanya boleh jalan sekali
    // (dijaga oleh guard !jumlah) — memasukkannya akan menimpa input pengguna
    // setiap kali saldo berubah karena mutasi komitmen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periode, formulaKey, actor.id, jumlah]);

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
    if (saldo <= 0) {
      showNotification("error", "Tidak ada saldo kasbon yang perlu dilunasi.");
      return;
    }
    try {
      setSubmitting(true);
      await potongBagiHasilAction({
        actorId: actor.id,
        jumlah: nominal,
        tanggal,
        periode,
        keterangan: keterangan.trim() || undefined,
      });
      showNotification("success", "Potongan bagi hasil dicatat.");
      setJumlah("");
      setKeterangan("");
      reloadList();
      onSuccess();
    } catch (e: any) {
      showNotification(
        "error",
        e?.message || "Gagal mencatat potongan bagi hasil.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [
    jumlah,
    saldo,
    actor.id,
    tanggal,
    periode,
    keterangan,
    reloadList,
    onSuccess,
    showNotification,
  ]);

  const handleBatal = useCallback(async () => {
    if (!batalTarget) return;
    try {
      await batalkanPotongBagiHasilAction(batalTarget.id);
      showNotification("success", "Potongan bagi hasil dibatalkan.");
      setBatalTarget(null);
      reloadList();
      onSuccess();
    } catch (e: any) {
      showNotification("error", e?.message || "Gagal membatalkan.");
    }
  }, [batalTarget, reloadList, onSuccess, showNotification]);

  const header = (
    <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-gradient-to-r from-amber-500 to-amber-600 text-white">
      <div>
        <h2 className="text-lg font-semibold">Bagi Hasil &amp; Kasbon</h2>
        <p className="text-sm text-amber-100">{actor.nama}</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Tutup"
        className="text-amber-100 hover:text-white text-2xl leading-none"
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
          {/* Saldo kasbon */}
          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-5 py-4">
            <p className="text-xs uppercase tracking-wide text-amber-700 dark:text-amber-300 font-medium">
              Sisa Kasbon Berjalan
            </p>
            <p className="text-2xl font-bold text-amber-800 dark:text-amber-200 tabular-nums">
              {formatRupiah(saldo)}
            </p>
          </div>

          {/* Form potong bagi hasil */}
          {saldo > 0 ? (
            <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-4">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Gunakan Bagi Hasil untuk Melunasi Kasbon
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Periode Bagi Hasil (YYYY-MM)
                  </label>
                  <input
                    type="month"
                    value={periode}
                    onChange={(e) => setPeriode(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
                  />
                  {!loadingBagiHasil && bagiHasil !== null && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                      Bagi hasil periode ini: {formatRupiah(bagiHasil)}
                    </p>
                  )}
                  {loadingBagiHasil && (
                    <p className="text-xs text-slate-400 mt-1">
                      Memuat bagi hasil...
                    </p>
                  )}
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
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Jumlah Dipotong (Rp)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={
                      bagiHasil !== null ? Math.min(saldo, bagiHasil) : saldo
                    }
                    value={jumlah}
                    onChange={(e) => setJumlah(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Keterangan (opsional)
                  </label>
                  <input
                    type="text"
                    value={keterangan}
                    onChange={(e) => setKeterangan(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleSimpan}
                  className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold disabled:opacity-60"
                >
                  {submitting ? "Menyimpan..." : "Catat Potongan"}
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-5 py-4">
              <p className="text-sm text-emerald-700 dark:text-emerald-300">
                Tidak ada saldo kasbon. Tidak ada yang perlu dilunasi.
              </p>
            </div>
          )}

          {/* Riwayat */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
              Riwayat
            </h3>
            {isLoading ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Memuat...
              </p>
            ) : riwayat.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500 italic">
                Belum ada riwayat.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
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
                      {p.jenis === "POTONG_BAGI_HASIL" && (
                        <button
                          type="button"
                          onClick={() => setBatalTarget(p)}
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
          </div>
        </div>
      </ModalFormShell>

      <DialogKonfirmasi
        show={!!batalTarget}
        title="Batalkan potongan bagi hasil?"
        message="Baris buku kas terkait akan dihapus dan saldo kasbon disesuaikan. Lanjutkan?"
        type="danger"
        confirmText="Batalkan"
        onConfirm={handleBatal}
        onCancel={() => setBatalTarget(null)}
      />
    </>
  );
}
