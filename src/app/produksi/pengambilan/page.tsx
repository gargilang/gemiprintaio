"use client";

import { useEffect, useMemo, useState } from "react";
import { PackageIcon } from "@/components/icons/PageIcons";
import ModalBayarPiutang from "@/components/ModalBayarPiutang";
import { useCachedData, useInvalidate } from "@/lib/use-cached-data";
import { fetchSessionUser, getCachedSessionUser } from "@/lib/client-session";
import type { PengambilanRow } from "@/lib/services/pengambilan-service";
import {
  listPengambilanBelumAction,
  listPengambilanSudahAction,
  markSudahDiambilAction,
  payReceivablePengambilanAction,
  getReceivableForOrderAction,
} from "./actions";

const money = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const badgeBayar = (status: PengambilanRow["status_bayar"]) => {
  switch (status) {
    case "LUNAS":
      return "bg-emerald-500 text-white";
    case "SEBAGIAN":
      return "bg-amber-500 text-white";
    default:
      return "bg-rose-500 text-white";
  }
};

export default function PengambilanPage() {
  const [tab, setTab] = useState<"belum" | "sudah">("belum");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [piutangRow, setPiutangRow] = useState<PengambilanRow | null>(null);
  const invalidate = useInvalidate();

  const {
    data: belumData,
    isLoading: belumLoading,
    mutate: mutateBelum,
  } = useCachedData<PengambilanRow[]>(
    "pengambilan-belum",
    listPengambilanBelumAction,
  );
  const {
    data: sudahData,
    isLoading: sudahLoading,
    mutate: mutateSudah,
  } = useCachedData<PengambilanRow[]>(
    "pengambilan-sudah",
    listPengambilanSudahAction,
  );

  const belum = useMemo(() => belumData ?? [], [belumData]);
  const sudah = useMemo(() => sudahData ?? [], [sudahData]);
  const rows = tab === "belum" ? belum : sudah;
  const loading =
    tab === "belum" ? belumLoading && !belumData : sudahLoading && !sudahData;

  useEffect(() => {
    const cached = getCachedSessionUser();
    if (cached?.id) setCurrentUserId(cached.id);
    fetchSessionUser().then((u) => {
      if (u?.id) setCurrentUserId(u.id);
    });
  }, []);

  const reload = async () => {
    await Promise.all([mutateBelum(), mutateSudah()]);
    invalidate("production-orders");
    invalidate("pos-init");
  };

  const handleSudahDiambil = async (row: PengambilanRow) => {
    const ok = window.confirm(
      `Tandai SPK ${row.nomor_spk} sudah diambil pelanggan?`,
    );
    if (!ok) return;
    setSaving(true);
    setNotice("");
    try {
      const hasil = await markSudahDiambilAction(row.order_id);
      if (hasil.terhalang.length > 0) {
        const nama = hasil.terhalang.map((t) => t.nama).join(", ");
        setNotice(
          `Beberapa item belum bisa diselesaikan: ${nama}. Konfirmasi roll dulu jika perlu.`,
        );
      } else {
        setNotice(`SPK ${row.nomor_spk} ditandai sudah diambil.`);
      }
      await reload();
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Gagal menandai diambil",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-amber-500 to-red-600 rounded-2xl shadow-lg p-6 text-white">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <PackageIcon size={28} className="text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold uppercase tracking-wide">
                Pengambilan
              </h2>
              <p className="text-white/90 text-sm">
                SPK siap diambil, status bayar faktur, dan tandai sudah diambil
                pelanggan.
              </p>
            </div>
          </div>
          {notice ? (
            <div className="rounded-md bg-white/20 px-3 py-2 text-sm text-white max-w-md">
              {notice}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab("belum")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            tab === "belum"
              ? "bg-amber-600 text-white"
              : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
          }`}
        >
          Belum Diambil ({belum.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("sudah")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            tab === "sudah"
              ? "bg-amber-600 text-white"
              : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
          }`}
        >
          Sudah Diambil ({sudah.length})
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800 text-left text-slate-600 dark:text-slate-300">
            <tr>
              <th className="p-3">No. SPK</th>
              <th className="p-3">No. Faktur</th>
              <th className="p-3">Pelanggan</th>
              <th className="p-3">Item</th>
              <th className="p-3">Status Bayar</th>
              <th className="p-3 text-right">Sisa Tagihan</th>
              <th className="p-3">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  className="p-4 text-slate-500 dark:text-slate-400"
                  colSpan={7}
                >
                  Memuat...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  className="p-4 text-slate-500 dark:text-slate-400"
                  colSpan={7}
                >
                  {tab === "belum"
                    ? "Tidak ada SPK siap diambil."
                    : "Belum ada riwayat pengambilan."}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.order_id}
                  className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-800/60 text-slate-800 dark:text-slate-200"
                >
                  <td className="p-3 font-medium">{row.nomor_spk}</td>
                  <td className="p-3">{row.nomor_faktur}</td>
                  <td className="p-3">{row.pelanggan_nama}</td>
                  <td className="p-3">
                    <div>{row.jumlah_item} item</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[220px]">
                      {row.item_ringkas}
                    </div>
                  </td>
                  <td className="p-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${badgeBayar(row.status_bayar)}`}
                    >
                      {row.status_bayar}
                    </span>
                  </td>
                  <td className="p-3 text-right">{money(row.sisa_piutang)}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2">
                      {row.sisa_piutang > 0 && row.piutang_id ? (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => setPiutangRow(row)}
                          className="rounded bg-indigo-600 px-2 py-1 text-xs text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                          Terima Piutang
                        </button>
                      ) : null}
                      {tab === "belum" ? (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => handleSudahDiambil(row)}
                          className="rounded bg-amber-600 px-2 py-1 text-xs text-white hover:bg-amber-700 disabled:opacity-50"
                        >
                          Sudah Diambil
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ModalBayarPiutang
        isOpen={!!piutangRow}
        onClose={() => setPiutangRow(null)}
        onSuccess={async () => {
          setPiutangRow(null);
          setNotice("Pembayaran piutang tersimpan.");
          await reload();
        }}
        currentUserId={currentUserId}
        onGetReceivables={() =>
          piutangRow
            ? getReceivableForOrderAction(piutangRow.penjualan_id)
            : Promise.resolve([])
        }
        onPayReceivable={payReceivablePengambilanAction}
      />
    </div>
  );
}
