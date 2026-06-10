"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import ModalFormShell from "@/components/ModalFormShell";
import DialogKonfirmasi from "@/components/DialogKonfirmasi";
import { useCachedData, useInvalidate } from "@/lib/use-cached-data";
import { formatRupiah } from "@/lib/format-id";
import {
  listKomponenAction,
  simpanKomponenAction,
  hapusKomponenAction,
  getInfoBagiHasilAction,
  setBagiHasilAction,
} from "./actions";
import type {
  KomponenKompensasi,
  TipeKomponen,
  MetodeKomponen,
} from "@/lib/services/komponen-kompensasi-service";

// MARKER_MODAL

/** Sumber nilai untuk komponen PERSEN (dipakai komisi/bonus). */
const SUMBER_OPSI: { key: string; label: string }[] = [
  { key: "omzet", label: "Omzet (penjualan)" },
  { key: "laba_bersih", label: "Laba bersih" },
];

const TIPE_OPSI: { key: TipeKomponen; label: string }[] = [
  { key: "GAJI_POKOK", label: "Gaji Pokok" },
  { key: "TUNJANGAN", label: "Tunjangan" },
  { key: "KOMISI", label: "Komisi" },
  { key: "BONUS", label: "Bonus" },
];

export interface ModalKomponenKompensasiProps {
  actor: { id: string; nama: string };
  onClose: () => void;
  onSuccess: () => void;
  showNotification: (type: "success" | "error", message: string) => void;
}

export default function ModalKomponenKompensasi({
  actor,
  onClose,
  onSuccess,
  showNotification,
}: ModalKomponenKompensasiProps) {
  const invalidate = useInvalidate();
  const cacheKey = `komponen:${actor.id}`;

  const { data, isLoading, refresh } = useCachedData<KomponenKompensasi[]>(
    cacheKey,
    () => listKomponenAction(actor.id)
  );
  const komponen = useMemo(() => data ?? [], [data]);

  // Form tambah komponen baru.
  const [tipe, setTipe] = useState<TipeKomponen>("GAJI_POKOK");
  const [nama, setNama] = useState("");
  const [metode, setMetode] = useState<MetodeKomponen>("TETAP");
  const [nominal, setNominal] = useState("");
  const [persen, setPersen] = useState("");
  const [sumber, setSumber] = useState(SUMBER_OPSI[0].key);
  const [submitting, setSubmitting] = useState(false);
  const [hapusTarget, setHapusTarget] = useState<KomponenKompensasi | null>(
    null
  );

  // Bagi hasil (sumber kebenaran: pegawai.profit_share_percent). Diatur di sini
  // supaya non-Pemilik bisa diberi bagi hasil tanpa bolak-balik ke tab Pengurus.
  const [bagiHasilInput, setBagiHasilInput] = useState("");
  const [sisaBagiHasil, setSisaBagiHasil] = useState(100);
  const [bagiHasilSaving, setBagiHasilSaving] = useState(false);

  const { data: infoBagiHasil, refresh: refreshBagiHasil } = useCachedData(
    `bagi-hasil:${actor.id}`,
    () => getInfoBagiHasilAction(actor.id)
  );

  useEffect(() => {
    if (infoBagiHasil) {
      setBagiHasilInput(
        infoBagiHasil.persen != null ? String(infoBagiHasil.persen) : ""
      );
      setSisaBagiHasil(infoBagiHasil.sisa);
    }
  }, [infoBagiHasil]);

  const handleSimpanBagiHasil = useCallback(async () => {
    const trimmed = bagiHasilInput.trim();
    const persen = trimmed === "" ? null : Number(trimmed);
    if (persen !== null && (!Number.isFinite(persen) || persen < 0)) {
      showNotification("error", "Persentase bagi hasil tidak valid.");
      return;
    }
    try {
      setBagiHasilSaving(true);
      await setBagiHasilAction(actor.id, persen);
      showNotification(
        "success",
        persen === null ? "Bagi hasil dihapus." : "Bagi hasil disimpan."
      );
      invalidate(`bagi-hasil:${actor.id}`);
      void refreshBagiHasil();
      onSuccess();
    } catch (e: any) {
      showNotification("error", e?.message || "Gagal menyimpan bagi hasil.");
    } finally {
      setBagiHasilSaving(false);
    }
  }, [actor.id, bagiHasilInput, invalidate, refreshBagiHasil, onSuccess, showNotification]);

  const resetForm = useCallback(() => {
    setTipe("GAJI_POKOK");
    setNama("");
    setMetode("TETAP");
    setNominal("");
    setPersen("");
    setSumber(SUMBER_OPSI[0].key);
  }, []);

  const reloadList = useCallback(() => {
    invalidate(cacheKey);
    void refresh();
  }, [invalidate, cacheKey, refresh]);

  const handleTambah = useCallback(async () => {
    const namaFinal =
      nama.trim() || TIPE_OPSI.find((t) => t.key === tipe)?.label || "Komponen";
    try {
      setSubmitting(true);
      await simpanKomponenAction({
        actor_id: actor.id,
        tipe,
        nama: namaFinal,
        metode,
        nominal: metode === "TETAP" ? Number(nominal) || 0 : 0,
        persen: metode === "PERSEN" ? Number(persen) || 0 : 0,
        sumber_formula_key: metode === "PERSEN" ? sumber : null,
      });
      showNotification("success", "Komponen kompensasi ditambahkan.");
      resetForm();
      reloadList();
      onSuccess();
    } catch (e: any) {
      showNotification("error", e?.message || "Gagal menyimpan komponen.");
    } finally {
      setSubmitting(false);
    }
  }, [
    actor.id,
    tipe,
    nama,
    metode,
    nominal,
    persen,
    sumber,
    resetForm,
    reloadList,
    onSuccess,
    showNotification,
  ]);

  const handleHapus = useCallback(async () => {
    if (!hapusTarget) return;
    try {
      await hapusKomponenAction(hapusTarget.id);
      showNotification("success", "Komponen dihapus.");
      setHapusTarget(null);
      reloadList();
      onSuccess();
    } catch (e: any) {
      showNotification("error", e?.message || "Gagal menghapus komponen.");
    }
  }, [hapusTarget, reloadList, onSuccess, showNotification]);

  const header = (
    <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
      <div>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
          Komponen Kompensasi
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {actor.nama}
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Tutup"
        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-2xl leading-none"
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
          {/* Bagi Hasil — sumber kebenaran pegawai.profit_share_percent */}
          <div className="rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/30 p-4">
            <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-1">
              Bagi Hasil
            </h3>
            <p className="text-xs text-amber-700 dark:text-amber-300/80 mb-3">
              Persentase laba bersih untuk orang ini. Kosongkan bila tidak
              menerima bagi hasil. Sisa jatah tersedia:{" "}
              <strong>{sisaBagiHasil}%</strong> (total semua orang maksimal
              100%).
            </p>
            <div className="flex items-end gap-3">
              <div className="flex-1 max-w-[160px]">
                <label className="block text-xs font-medium text-amber-700 dark:text-amber-300 mb-1">
                  Persentase (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={bagiHasilInput}
                  onChange={(e) => setBagiHasilInput(e.target.value)}
                  placeholder="Mis. 50"
                  className="w-full rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
                />
              </div>
              <button
                type="button"
                disabled={bagiHasilSaving}
                onClick={handleSimpanBagiHasil}
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold disabled:opacity-60"
              >
                {bagiHasilSaving ? "Menyimpan..." : "Simpan Bagi Hasil"}
              </button>
            </div>
          </div>

          {/* Daftar komponen yang ada */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
              Komponen aktif
            </h3>
            {isLoading ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Memuat...
              </p>
            ) : komponen.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500 italic">
                Belum ada komponen. Tambahkan di bawah.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
                {komponen.map((k) => (
                  <li
                    key={k.id}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <div>
                      <p className="font-medium text-slate-800 dark:text-slate-100">
                        {k.nama}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {TIPE_OPSI.find((t) => t.key === k.tipe)?.label ??
                          k.tipe}
                        {" \u00b7 "}
                        {k.metode === "TETAP"
                          ? formatRupiah(k.nominal)
                          : `${k.persen}% dari ${
                              SUMBER_OPSI.find(
                                (s) => s.key === k.sumber_formula_key
                              )?.label ?? k.sumber_formula_key
                            }`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setHapusTarget(k)}
                      className="text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 text-sm font-medium"
                    >
                      Hapus
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Form tambah komponen */}
          <div className="border-t border-slate-200 dark:border-slate-700 pt-5">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">
              Tambah komponen
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Jenis
                </label>
                <select
                  value={tipe}
                  onChange={(e) => setTipe(e.target.value as TipeKomponen)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
                >
                  {TIPE_OPSI.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Nama (opsional)
                </label>
                <input
                  type="text"
                  value={nama}
                  onChange={(e) => setNama(e.target.value)}
                  placeholder={
                    TIPE_OPSI.find((t) => t.key === tipe)?.label ?? ""
                  }
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Metode
                </label>
                <select
                  value={metode}
                  onChange={(e) => setMetode(e.target.value as MetodeKomponen)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
                >
                  <option value="TETAP">Nominal tetap</option>
                  <option value="PERSEN">Persentase dari sumber</option>
                </select>
              </div>
              {metode === "TETAP" ? (
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Nominal (Rp)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={nominal}
                    onChange={(e) => setNominal(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Persen (%)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      value={persen}
                      onChange={(e) => setPersen(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Sumber
                    </label>
                    <select
                      value={sumber}
                      onChange={(e) => setSumber(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
                    >
                      {SUMBER_OPSI.map((s) => (
                        <option key={s.key} value={s.key}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                disabled={submitting}
                onClick={handleTambah}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white text-sm font-semibold disabled:opacity-60"
              >
                {submitting ? "Menyimpan..." : "Tambah Komponen"}
              </button>
            </div>
          </div>
        </div>
      </ModalFormShell>

      <DialogKonfirmasi
        show={!!hapusTarget}
        title="Hapus komponen?"
        message={`Hapus komponen "${hapusTarget?.nama ?? ""}"? Tindakan ini tidak memengaruhi penggajian yang sudah dibayar.`}
        type="danger"
        confirmText="Hapus"
        onConfirm={handleHapus}
        onCancel={() => setHapusTarget(null)}
      />
    </>
  );
}

