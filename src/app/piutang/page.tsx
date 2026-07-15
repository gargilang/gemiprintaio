"use client";

import { useState, useMemo } from "react";
import { useCachedData, useInvalidate } from "@/lib/use-cached-data";
import { MoneyIcon } from "@/components/icons/PageIcons";
import ToastNotifikasi, {
  type NotificationToastProps,
} from "@/components/ToastNotifikasi";
import DialogKonfirmasi from "@/components/DialogKonfirmasi";
import type { ReceivableGroup } from "@/lib/services/pos-queries";
import { getPiutangGroupedAction, revertPiutangAction } from "./actions";
import ModalBayarLumpSum from "./ModalBayarLumpSum";
import ModalIsiNamaPelanggan from "./ModalIsiNamaPelanggan";

const CACHE_KEY = "piutang-grouped";

function formatRupiah(n: number): string {
  return n.toLocaleString("id-ID");
}

function StatusBadge({ status }: { status: string }) {
  if (status === "LUNAS")
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500 text-white">
        Lunas
      </span>
    );
  if (status === "SEBAGIAN")
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500 text-white">
        Sebagian
      </span>
    );
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-500 text-white">
      Aktif
    </span>
  );
}

export default function HalamanPiutang() {
  const { data: rawData, isLoading, mutate } = useCachedData<ReceivableGroup[]>(
    CACHE_KEY,
    getPiutangGroupedAction,
  );
  const invalidate = useInvalidate();
  const grup = useMemo(() => rawData ?? [], [rawData]);
  const loading = isLoading && !rawData;

  // Filter cari nama
  const [cariNama, setCariNama] = useState("");
  const grupFiltered = useMemo(
    () =>
      cariNama.trim()
        ? grup.filter((g) =>
            g.pelanggan_nama.toLowerCase().includes(cariNama.toLowerCase()),
          )
        : grup,
    [grup, cariNama],
  );

  // Expanded rows
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  // Modal bayar lump-sum
  const [bayarGrup, setBayarGrup] = useState<ReceivableGroup | null>(null);

  // Modal isi nama pelanggan
  const [isiNamaPenjualanId, setIsiNamaPenjualanId] = useState<string | null>(null);

  // Dialog konfirmasi revert
  const [konfirmasiRevert, setKonfirmasiRevert] = useState<{
    saleId: string;
    label: string;
  } | null>(null);
  const [reverting, setReverting] = useState(false);

  // Toast
  const [notice, setNotice] = useState<NotificationToastProps | null>(null);
  const showNotification = (tipe: "success" | "error", pesan: string) => {
    setNotice({ type: tipe, message: pesan });
  };

  const reload = async () => {
    await invalidate(CACHE_KEY);
    await mutate();
  };

  const handleRevert = async () => {
    if (!konfirmasiRevert) return;
    setReverting(true);
    try {
      const res = await revertPiutangAction({ sale_id: konfirmasiRevert.saleId });
      if (res.ok) {
        showNotification("success", "Pembayaran berhasil direvert");
        await reload();
      } else {
        showNotification("error", res.error ?? "Gagal revert pembayaran");
      }
    } catch (err: any) {
      showNotification("error", err.message ?? "Terjadi kesalahan");
    } finally {
      setReverting(false);
      setKonfirmasiRevert(null);
    }
  };

  // Ringkasan total
  const totalPiutang = useMemo(
    () => grup.reduce((sum, g) => sum + g.total_sisa, 0),
    [grup],
  );

  return (
    <div className="space-y-6">
      {/* Gradient title card */}
      <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl shadow-lg p-6 text-white">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 rounded-xl p-2.5">
              <MoneyIcon size={28} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold uppercase tracking-wide">
                Piutang
              </h1>
              <p className="text-emerald-100 text-sm">
                Piutang penjualan dikelompokkan per pelanggan — bayar lump-sum
                atau per tagihan
              </p>
            </div>
          </div>
        </div>

        {/* Ringkasan */}
        {!loading && (
          <div className="mt-5 flex flex-wrap gap-4">
            <div className="bg-white/20 rounded-xl px-4 py-3">
              <p className="text-emerald-100 text-xs uppercase tracking-wide font-semibold">
                Total Piutang
              </p>
              <p className="text-white text-xl font-bold">
                Rp {formatRupiah(totalPiutang)}
              </p>
            </div>
            <div className="bg-white/20 rounded-xl px-4 py-3">
              <p className="text-emerald-100 text-xs uppercase tracking-wide font-semibold">
                Jumlah Pelanggan
              </p>
              <p className="text-white text-xl font-bold">{grup.length}</p>
            </div>
          </div>
        )}
      </div>

      {/* Filter */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-4">
        <input
          type="search"
          placeholder="Cari nama pelanggan..."
          value={cariNama}
          onChange={(e) => setCariNama(e.target.value)}
          className="w-full sm:w-64 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
        />
      </div>

      {/* Daftar pelanggan */}
      <div className="space-y-3">
        {loading && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 text-center text-slate-500 dark:text-slate-400">
            Memuat data piutang...
          </div>
        )}

        {!loading && grupFiltered.length === 0 && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 text-center text-slate-500 dark:text-slate-400">
            {grup.length === 0
              ? "Tidak ada piutang aktif."
              : "Tidak ada pelanggan yang cocok dengan pencarian."}
          </div>
        )}

        {grupFiltered.map((g) => {
          const isExpanded = expanded.has(g.customerKey);
          return (
            <div
              key={g.customerKey}
              className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden"
            >
              {/* Baris ringkasan pelanggan */}
              <div className="flex items-center gap-3 p-4">
                {/* Toggle expand */}
                <button
                  type="button"
                  onClick={() => toggleExpand(g.customerKey)}
                  className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  aria-label={isExpanded ? "Ciutkan" : "Perluas"}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className={`w-4 h-4 text-slate-500 dark:text-slate-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>

                {/* Info pelanggan */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                      {g.pelanggan_nama}
                    </span>
                    {g.is_walk_in && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                        Umum
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {g.jumlah_tagihan} tagihan · Rp{" "}
                    {formatRupiah(g.total_sisa)}
                  </p>
                </div>

                {/* Total sisa */}
                <div className="hidden sm:block text-right flex-shrink-0">
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Total Sisa
                  </p>
                  <p className="font-bold text-slate-800 dark:text-slate-100">
                    Rp {formatRupiah(g.total_sisa)}
                  </p>
                </div>

                {/* Tombol bayar */}
                <button
                  type="button"
                  onClick={() => setBayarGrup(g)}
                  className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition"
                >
                  Bayar
                </button>
              </div>

              {/* Detail tagihan (expandable) */}
              {isExpanded && (
                <div className="border-t border-slate-100 dark:border-slate-800">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 dark:bg-slate-800">
                        <tr>
                          <th className="text-left px-4 py-2 text-slate-600 dark:text-slate-400 font-medium">
                            Faktur
                          </th>
                          <th className="text-left px-4 py-2 text-slate-600 dark:text-slate-400 font-medium">
                            Tanggal
                          </th>
                          <th className="text-right px-4 py-2 text-slate-600 dark:text-slate-400 font-medium">
                            Total
                          </th>
                          <th className="text-right px-4 py-2 text-slate-600 dark:text-slate-400 font-medium">
                            Terbayar
                          </th>
                          <th className="text-right px-4 py-2 text-slate-600 dark:text-slate-400 font-medium">
                            Sisa
                          </th>
                          <th className="text-center px-4 py-2 text-slate-600 dark:text-slate-400 font-medium">
                            Status
                          </th>
                          <th className="px-4 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {g.tagihan.map((t) => (
                          <tr
                            key={t.id}
                            className="border-t border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                          >
                            <td className="px-4 py-2 text-slate-800 dark:text-slate-200 font-medium">
                              {t.nomor_faktur || t.id}
                            </td>
                            <td className="px-4 py-2 text-slate-600 dark:text-slate-400">
                              {t.dibuat_pada
                                ? new Date(t.dibuat_pada).toLocaleDateString(
                                    "id-ID",
                                  )
                                : "—"}
                            </td>
                            <td className="px-4 py-2 text-right text-slate-700 dark:text-slate-300">
                              Rp {formatRupiah(Number(t.jumlah_piutang))}
                            </td>
                            <td className="px-4 py-2 text-right text-slate-700 dark:text-slate-300">
                              Rp {formatRupiah(Number(t.jumlah_terbayar))}
                            </td>
                            <td className="px-4 py-2 text-right font-semibold text-slate-800 dark:text-slate-100">
                              Rp {formatRupiah(Number(t.sisa_piutang))}
                            </td>
                            <td className="px-4 py-2 text-center">
                              <StatusBadge status={t.status} />
                            </td>
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-1 justify-end flex-wrap">
                                {/* Tombol isi nama walk-in tanpa nama */}
                                {g.is_walk_in &&
                                  g.customerKey === "__tanpa_nama__" && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setIsiNamaPenjualanId(t.id_penjualan)
                                      }
                                      className="px-2 py-1 text-xs rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition"
                                    >
                                      Isi Nama
                                    </button>
                                  )}
                                {/* Tombol revert */}
                                {t.jumlah_terbayar > 0 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setKonfirmasiRevert({
                                        saleId: t.id_penjualan,
                                        label: t.nomor_faktur || t.id,
                                      })
                                    }
                                    className="px-2 py-1 text-xs rounded-lg bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-700 hover:bg-rose-100 dark:hover:bg-rose-900/50 transition"
                                  >
                                    Revert
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal bayar lump-sum */}
      <ModalBayarLumpSum
        group={bayarGrup}
        onClose={() => setBayarGrup(null)}
        onSuccess={reload}
        showNotification={showNotification}
      />

      {/* Modal isi nama pelanggan */}
      <ModalIsiNamaPelanggan
        penjualanId={isiNamaPenjualanId}
        onClose={() => setIsiNamaPenjualanId(null)}
        onSuccess={reload}
        showNotification={showNotification}
      />

      {/* Dialog konfirmasi revert */}
      <DialogKonfirmasi
        show={konfirmasiRevert !== null}
        title="Revert Pembayaran"
        message={`Yakin ingin merevert pembayaran ${konfirmasiRevert?.label ?? ""}? Piutang akan kembali aktif.`}
        confirmText={reverting ? "Memproses..." : "Ya, Revert"}
        cancelText="Batal"
        type="danger"
        onConfirm={handleRevert}
        onCancel={() => setKonfirmasiRevert(null)}
      />

      {/* Toast notifikasi */}
      {notice && (
        <ToastNotifikasi type={notice.type} message={notice.message} />
      )}
    </div>
  );
}
