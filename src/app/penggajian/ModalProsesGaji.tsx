"use client";

import { useState, useCallback, useMemo } from "react";
import ModalFormShell from "@/components/ModalFormShell";
import DialogKonfirmasi from "@/components/DialogKonfirmasi";
import { useCachedData, useInvalidate } from "@/lib/use-cached-data";
import { formatRupiah } from "@/lib/format-id";
import { getTodayJakarta } from "@/lib/date-utils";
import { printSlipGaji } from "@/lib/slip-gaji-print";
import {
  daftarProsesGajiAction,
  hitungDraftGajiAction,
  simpanDraftGajiAction,
  bayarProsesGajiAction,
  batalkanProsesGajiAction,
  getShopSettingsForSlipAction,
} from "./actions";
import type {
  DraftGaji,
  DraftSlipGaji,
  ProsesGajiDetail,
} from "@/lib/services/penggajian-service";

// MARKER_MODAL

const STATUS_CHIP: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  DIBAYAR:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
  VOIDED: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200",
};

function bulanIni(): string {
  return getTodayJakarta().slice(0, 7);
}

export interface ModalProsesGajiProps {
  onClose: () => void;
  onSuccess: () => void;
  showNotification: (type: "success" | "error", message: string) => void;
}

export default function ModalProsesGaji({
  onClose,
  onSuccess,
  showNotification,
}: ModalProsesGajiProps) {
  const invalidate = useInvalidate();

  const { data, isLoading, refresh } = useCachedData<ProsesGajiDetail[]>(
    "proses-gaji",
    () => daftarProsesGajiAction()
  );
  const runs = useMemo(() => data ?? [], [data]);

  // Wizard state.
  const [periode, setPeriode] = useState(bulanIni());
  const [omzet, setOmzet] = useState("");
  const [draft, setDraft] = useState<DraftGaji | null>(null);
  const [potongan, setPotongan] = useState<Record<string, number>>({});
  const [tanggalBayar, setTanggalBayar] = useState(getTodayJakarta());
  const [metodeBayar, setMetodeBayar] = useState<"CASH" | "TRANSFER">("CASH");
  const [busy, setBusy] = useState(false);
  const [confirmBayar, setConfirmBayar] = useState(false);
  const [voidTarget, setVoidTarget] = useState<ProsesGajiDetail | null>(null);

  const reloadRuns = useCallback(() => {
    invalidate("proses-gaji");
    void refresh();
  }, [invalidate, refresh]);

  // Hitung ulang draft dari server (potongan default = min(saldo, bruto)).
  const handleHitung = useCallback(async () => {
    try {
      setBusy(true);
      const sumber: Record<string, number> = omzet
        ? { omzet: Number(omzet) || 0 }
        : {};
      const result = await hitungDraftGajiAction(periode, {
        sumberNilai: sumber,
        potonganPerActor: {},
      });
      setDraft(result);
      // Default potongan = saldo penuh yang termuat di draft.
      const init: Record<string, number> = {};
      for (const s of result.slips) init[s.actor_id] = s.potongan_kasbon;
      setPotongan(init);
    } catch (e: any) {
      showNotification("error", e?.message || "Gagal menghitung draft gaji.");
    } finally {
      setBusy(false);
    }
  }, [periode, omzet, showNotification]);

  // Slip yang sudah disesuaikan potongannya oleh owner (clamp ke min(saldo,bruto)).
  const slipsAdjusted: DraftSlipGaji[] = useMemo(() => {
    if (!draft) return [];
    return draft.slips.map((s) => {
      const diminta = potongan[s.actor_id] ?? s.potongan_kasbon;
      const pot = Math.max(0, Math.min(diminta, s.saldo_pinjaman, s.bruto));
      return { ...s, potongan_kasbon: pot, neto: s.bruto - pot };
    });
  }, [draft, potongan]);

  const totalAdjusted = useMemo(() => {
    return slipsAdjusted.reduce(
      (acc, s) => {
        acc.bruto += s.bruto;
        acc.potongan += s.potongan_kasbon;
        acc.neto += s.neto;
        return acc;
      },
      { bruto: 0, potongan: 0, neto: 0 }
    );
  }, [slipsAdjusted]);

  // Simpan draft lalu langsung bayar (alur owner: konfirmasi "Bayar").
  const handleBayar = useCallback(async () => {
    if (!draft) return;
    setConfirmBayar(false);
    try {
      setBusy(true);
      const payload: DraftGaji = {
        periode: draft.periode,
        slips: slipsAdjusted,
        total_bruto: totalAdjusted.bruto,
        total_potongan_kasbon: totalAdjusted.potongan,
        total_neto: totalAdjusted.neto,
      };
      const saved = await simpanDraftGajiAction(payload);
      await bayarProsesGajiAction(saved.run_id, tanggalBayar, metodeBayar);
      showNotification("success", "Penggajian berhasil dibayar.");
      setDraft(null);
      setPotongan({});
      reloadRuns();
      onSuccess();
    } catch (e: any) {
      showNotification("error", e?.message || "Gagal memproses pembayaran gaji.");
    } finally {
      setBusy(false);
    }
  }, [
    draft,
    slipsAdjusted,
    totalAdjusted,
    tanggalBayar,
    metodeBayar,
    reloadRuns,
    onSuccess,
    showNotification,
  ]);

  const handleVoid = useCallback(async () => {
    if (!voidTarget) return;
    try {
      await batalkanProsesGajiAction(voidTarget.id);
      showNotification("success", "Proses gaji dibatalkan.");
      setVoidTarget(null);
      reloadRuns();
      onSuccess();
    } catch (e: any) {
      showNotification("error", e?.message || "Gagal membatalkan proses gaji.");
    }
  }, [voidTarget, reloadRuns, onSuccess, showNotification]);

  const handleCetakSlip = useCallback(
    async (run: ProsesGajiDetail, slip: ProsesGajiDetail["slips"][number]) => {
      try {
        const shop = await getShopSettingsForSlipAction();
        let komponen: { nama: string; tipe?: string; nilai: number }[] = [];
        try {
          const parsed = JSON.parse(slip.komponen_snapshot || "[]");
          if (Array.isArray(parsed)) {
            komponen = parsed.map((k: any) => ({
              nama: k.nama,
              tipe: k.tipe,
              nilai: Number(k.nilai) || 0,
            }));
          }
        } catch {
          komponen = [];
        }
        printSlipGaji({
          nama_toko: shop.nama_toko || "gemiprint",
          periode: run.periode,
          tanggal_bayar: run.tanggal_bayar,
          nama_karyawan: (slip as any).nama || slip.actor_id,
          komponen,
          bruto: slip.bruto,
          potongan_kasbon: slip.potongan_kasbon,
          neto: slip.neto,
          metode_bayar: (slip as any).metode_bayar,
          shop,
        });
      } catch (e: any) {
        showNotification("error", e?.message || "Gagal mencetak slip.");
      }
    },
    [showNotification]
  );

  const header = (
    <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-gradient-to-r from-indigo-600 to-emerald-600 text-white">
      <h2 className="text-lg font-semibold">Proses Penggajian</h2>
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
    <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-between">
      <button
        type="button"
        onClick={onClose}
        className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 font-medium"
      >
        Tutup
      </button>
      {draft && slipsAdjusted.length > 0 && (
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirmBayar(true)}
          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold disabled:opacity-60"
        >
          {busy ? "Memproses..." : "Bayar Gaji"}
        </button>
      )}
    </div>
  );

  return (
    <>
      <ModalFormShell
        open
        onClose={onClose}
        header={header}
        footer={footer}
        maxWidthClass="max-w-3xl"
        allowDismiss={!busy}
      >
        <div className="p-6 space-y-6">
          {/* MARKER_WIZARD */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">
              Hitung gaji periode
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Periode (YYYY-MM)
                </label>
                <input
                  type="month"
                  value={periode}
                  onChange={(e) => setPeriode(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Omzet periode (untuk komisi, opsional)
                </label>
                <input
                  type="number"
                  min={0}
                  value={omzet}
                  onChange={(e) => setOmzet(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
                />
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={handleHitung}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-60"
              >
                {busy ? "Menghitung..." : "Hitung Draft"}
              </button>
            </div>

            {draft && (
              <div className="mt-5">
                {slipsAdjusted.length === 0 ? (
                  <p className="text-sm text-slate-400 dark:text-slate-500 italic">
                    Tidak ada karyawan dengan komponen gaji aktif.
                  </p>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="text-slate-500 dark:text-slate-400 text-xs uppercase">
                          <tr>
                            <th className="text-left py-2">Karyawan</th>
                            <th className="text-right py-2">Bruto</th>
                            <th className="text-right py-2">Saldo Kasbon</th>
                            <th className="text-right py-2">Potong Kasbon</th>
                            <th className="text-right py-2">Neto</th>
                          </tr>
                        </thead>
                        <tbody>
                          {slipsAdjusted.map((s) => (
                            <tr
                              key={s.actor_id}
                              className="border-t border-slate-100 dark:border-slate-800"
                            >
                              <td className="py-2 text-slate-800 dark:text-slate-100">
                                {s.nama}
                              </td>
                              <td className="py-2 text-right tabular-nums">
                                {formatRupiah(s.bruto)}
                              </td>
                              <td className="py-2 text-right tabular-nums text-cyan-700 dark:text-cyan-300">
                                {formatRupiah(s.saldo_pinjaman)}
                              </td>
                              <td className="py-2 text-right">
                                <input
                                  type="number"
                                  min={0}
                                  max={Math.min(s.saldo_pinjaman, s.bruto)}
                                  value={
                                    potongan[s.actor_id] ?? s.potongan_kasbon
                                  }
                                  onChange={(e) =>
                                    setPotongan((prev) => ({
                                      ...prev,
                                      [s.actor_id]: Number(e.target.value) || 0,
                                    }))
                                  }
                                  className="w-28 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-2 py-1 text-sm text-right"
                                />
                              </td>
                              <td className="py-2 text-right tabular-nums font-semibold text-emerald-700 dark:text-emerald-300">
                                {formatRupiah(s.neto)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-slate-200 dark:border-slate-700 font-semibold">
                            <td className="py-2">Total</td>
                            <td className="py-2 text-right tabular-nums">
                              {formatRupiah(totalAdjusted.bruto)}
                            </td>
                            <td></td>
                            <td className="py-2 text-right tabular-nums text-rose-600 dark:text-rose-400">
                              {formatRupiah(totalAdjusted.potongan)}
                            </td>
                            <td className="py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-300">
                              {formatRupiah(totalAdjusted.neto)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                          Tanggal bayar
                        </label>
                        <input
                          type="date"
                          value={tanggalBayar}
                          onChange={(e) => setTanggalBayar(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                          Metode bayar
                        </label>
                        <select
                          value={metodeBayar}
                          onChange={(e) =>
                            setMetodeBayar(e.target.value as "CASH" | "TRANSFER")
                          }
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
                        >
                          <option value="CASH">Tunai</option>
                          <option value="TRANSFER">Transfer</option>
                        </select>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          {/* MARKER_HISTORY */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
              Riwayat Penggajian
            </h3>
            {isLoading ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Memuat...
              </p>
            ) : runs.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500 italic">
                Belum ada proses gaji.
              </p>
            ) : (
              <div className="space-y-3">
                {runs.map((run) => (
                  <div
                    key={run.id}
                    className="border border-slate-200 dark:border-slate-700 rounded-xl p-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800 dark:text-slate-100">
                          {run.periode}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            STATUS_CHIP[run.status] ?? STATUS_CHIP.DRAFT
                          }`}
                        >
                          {run.status}
                        </span>
                        {run.tanggal_bayar && (
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {run.tanggal_bayar}
                          </span>
                        )}
                      </div>
                      {run.status === "DIBAYAR" && (
                        <button
                          type="button"
                          onClick={() => setVoidTarget(run)}
                          className="text-rose-600 hover:text-rose-700 dark:text-rose-400 text-xs font-medium"
                        >
                          Batalkan
                        </button>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                      Bruto {formatRupiah(run.total_bruto)} &middot; Potongan{" "}
                      {formatRupiah(run.total_potongan_kasbon)} &middot; Neto{" "}
                      <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                        {formatRupiah(run.total_neto)}
                      </span>
                    </div>
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                      {run.slips.map((slip) => (
                        <li
                          key={slip.id}
                          className="flex items-center justify-between py-2 text-sm"
                        >
                          <span className="text-slate-700 dark:text-slate-200">
                            {(slip as any).nama || slip.actor_id}
                          </span>
                          <div className="flex items-center gap-3">
                            <span className="tabular-nums text-slate-600 dark:text-slate-400">
                              {formatRupiah(slip.neto)}
                            </span>
                            {run.status === "DIBAYAR" && (
                              <button
                                type="button"
                                onClick={() => handleCetakSlip(run, slip)}
                                className="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 text-xs font-medium"
                              >
                                Cetak Slip
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </ModalFormShell>

      <DialogKonfirmasi
        show={confirmBayar}
        title="Bayar gaji sekarang?"
        message={`Total dibayar (neto) ${formatRupiah(totalAdjusted.neto)}. Beban gaji ${formatRupiah(totalAdjusted.bruto)} akan tercatat. Lanjutkan?`}
        type="warning"
        confirmText="Bayar"
        onConfirm={handleBayar}
        onCancel={() => setConfirmBayar(false)}
      />

      <DialogKonfirmasi
        show={!!voidTarget}
        title="Batalkan proses gaji?"
        message="Semua entri buku kas dan potongan kasbon dari run ini akan dibalik. Lanjutkan?"
        type="danger"
        confirmText="Batalkan"
        onConfirm={handleVoid}
        onCancel={() => setVoidTarget(null)}
      />
    </>
  );
}

