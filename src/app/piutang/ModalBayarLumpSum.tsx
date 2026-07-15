"use client";

import { useState, useMemo } from "react";
import ModalFormShell from "@/components/ModalFormShell";
import { MoneyIcon } from "@/components/icons/PageIcons";
import type { ReceivableGroup } from "@/lib/services/pos-queries";
import { bayarPiutangLumpSumAction } from "./actions";

interface Props {
  group: ReceivableGroup | null;
  onClose: () => void;
  onSuccess: () => void;
  showNotification: (tipe: "success" | "error", pesan: string) => void;
}

const METODE_OPTIONS = [
  { value: "CASH", label: "Tunai" },
  { value: "TRANSFER", label: "Transfer Bank" },
  { value: "QRIS", label: "QRIS" },
  { value: "DEBIT", label: "Kartu Debit" },
];

function formatRupiah(n: number): string {
  return n.toLocaleString("id-ID");
}

export default function ModalBayarLumpSum({
  group,
  onClose,
  onSuccess,
  showNotification,
}: Props) {
  const [jumlah, setJumlah] = useState("");
  const [metode, setMetode] = useState("CASH");
  const [tanggal, setTanggal] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [catatan, setCatatan] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isOpen = group !== null;
  const tagihan = useMemo(() => group?.tagihan ?? [], [group]);
  const totalSisa = group?.total_sisa ?? 0;
  const jumlahNum = parseFloat(jumlah.replace(/[^0-9.]/g, "")) || 0;

  /** Pratinjau alokasi FIFO berdasarkan jumlah yang diketik. */
  const pratinjau = useMemo(() => {
    let sisa = jumlahNum;
    return tagihan.map((t) => {
      const bayar = Math.min(sisa, Number(t.sisa_piutang));
      sisa = Math.max(0, sisa - bayar);
      const lunas = bayar >= Number(t.sisa_piutang);
      return {
        id: t.id,
        nomor_faktur: t.nomor_faktur,
        sisa_piutang: Number(t.sisa_piutang),
        dibayar: bayar,
        lunas,
        tidak_tersentuh: bayar === 0,
      };
    });
  }, [tagihan, jumlahNum]);

  const kelebihan = jumlahNum > totalSisa ? jumlahNum - totalSisa : 0;

  const handleSubmit = async () => {
    if (!group) return;
    if (!jumlahNum || jumlahNum <= 0) {
      showNotification("error", "Jumlah pembayaran harus lebih dari 0");
      return;
    }

    setSubmitting(true);
    try {
      const res = await bayarPiutangLumpSumAction({
        tagihan_ids: group.tagihan.map((t) => t.id),
        jumlah_bayar: jumlahNum,
        metode_pembayaran: metode,
        tanggal_bayar: tanggal,
        catatan: catatan.trim() || undefined,
      });

      if (res.ok) {
        const lunas = res.alokasi.filter((a) => a.status_baru === "LUNAS").length;
        showNotification(
          "success",
          `Pembayaran Rp ${formatRupiah(res.total_dialokasikan)} berhasil. ${lunas} tagihan lunas.${res.sisa_uang > 0 ? ` Kelebihan Rp ${formatRupiah(res.sisa_uang)} tidak disimpan.` : ""}`,
        );
        onSuccess();
        onClose();
      } else {
        showNotification("error", res.error ?? "Gagal menyimpan pembayaran");
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
      maxWidthClass="max-w-2xl"
      header={
        <div className="flex items-center gap-3 px-6 py-4 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-t-2xl text-white">
          <div className="bg-white/20 rounded-lg p-2">
            <MoneyIcon size={22} className="text-white" />
          </div>
          <div>
            <h2 className="font-bold text-lg">Bayar Piutang</h2>
            {group && (
              <p className="text-emerald-100 text-sm">{group.pelanggan_nama}</p>
            )}
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
            disabled={submitting || jumlahNum <= 0}
            className="px-5 py-2 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {submitting ? "Memproses..." : "Simpan Pembayaran"}
          </button>
        </div>
      }
    >
      {group && (
        <div className="p-6 space-y-5">
          {/* Daftar tagihan (read-only) */}
          <div>
            <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-2">
              Tagihan ({group.jumlah_tagihan}) — urut FIFO
            </h3>
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800">
                  <tr>
                    <th className="text-left px-3 py-2 text-slate-600 dark:text-slate-400 font-medium">
                      Faktur
                    </th>
                    <th className="text-right px-3 py-2 text-slate-600 dark:text-slate-400 font-medium">
                      Sisa Piutang
                    </th>
                    <th className="text-right px-3 py-2 text-slate-600 dark:text-slate-400 font-medium">
                      Pratinjau
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pratinjau.map((p) => (
                    <tr
                      key={p.id}
                      className="border-t border-slate-100 dark:border-slate-700"
                    >
                      <td className="px-3 py-2 text-slate-800 dark:text-slate-200">
                        {p.nomor_faktur || p.id}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-300">
                        Rp {formatRupiah(p.sisa_piutang)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {p.tidak_tersentuh ? (
                          <span className="text-slate-400 dark:text-slate-500 text-xs">
                            —
                          </span>
                        ) : p.lunas ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold text-xs">
                            Lunas
                          </span>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-400 text-xs">
                            +Rp {formatRupiah(p.dibayar)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 font-semibold">
                    <td className="px-3 py-2 text-slate-800 dark:text-slate-200">
                      Total Piutang
                    </td>
                    <td className="px-3 py-2 text-right text-slate-800 dark:text-slate-200">
                      Rp {formatRupiah(totalSisa)}
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Form input */}
          <div className="space-y-4">
            {/* Jumlah */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Jumlah Dibayar
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={0}
                  value={jumlah}
                  onChange={(e) => setJumlah(e.target.value)}
                  placeholder="0"
                  className="flex-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
                <button
                  type="button"
                  onClick={() => setJumlah(String(totalSisa))}
                  className="px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-sm font-medium border border-emerald-200 dark:border-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition"
                >
                  Lunas Semua
                </button>
              </div>
              {kelebihan > 0 && (
                <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                  Perhatian: kelebihan Rp {formatRupiah(kelebihan)} tidak
                  disimpan sebagai saldo.
                </p>
              )}
            </div>

            {/* Metode */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Metode Pembayaran
              </label>
              <select
                value={metode}
                onChange={(e) => setMetode(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              >
                {METODE_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Tanggal */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Tanggal Pembayaran
              </label>
              <input
                type="date"
                value={tanggal}
                onChange={(e) => setTanggal(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>

            {/* Catatan */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Catatan <span className="text-slate-400">(opsional)</span>
              </label>
              <textarea
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
                rows={2}
                placeholder="Mis. Transfer ke BCA a/n Budi"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none"
              />
            </div>
          </div>
        </div>
      )}
    </ModalFormShell>
  );
}
