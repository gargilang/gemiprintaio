"use client";

import { useState, useCallback, useMemo } from "react";
import ToastNotifikasi, {
  type NotificationToastProps,
} from "@/components/ToastNotifikasi";
import { useCachedData, useInvalidate } from "@/lib/use-cached-data";
import { UsersIcon } from "@/components/icons/PageIcons";
import { formatRupiah } from "@/lib/format-id";
import {
  listRingkasanKaryawanAction,
  type RingkasanKaryawan,
} from "./actions";
import ModalKomponenKompensasi from "./ModalKomponenKompensasi";
import ModalPinjamanKaryawan from "./ModalPinjamanKaryawan";
import ModalProsesGaji from "./ModalProsesGaji";

// MARKER_PAGE

const TIPE_LABEL: Record<string, string> = {
  GAJI_POKOK: "Gaji Pokok",
  TUNJANGAN: "Tunjangan",
  KOMISI: "Komisi",
  BONUS: "Bonus",
};

const TIPE_CHIP: Record<string, string> = {
  GAJI_POKOK:
    "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200",
  TUNJANGAN:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  KOMISI: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-200",
  BONUS: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
};

export default function PenggajianPage() {
  const [notice, setNotice] = useState<NotificationToastProps | null>(null);
  const [komponenTarget, setKomponenTarget] = useState<{
    id: string;
    nama: string;
  } | null>(null);
  const [kasbonTarget, setKasbonTarget] = useState<{
    id: string;
    nama: string;
  } | null>(null);
  const [showProsesGaji, setShowProsesGaji] = useState(false);
  const invalidate = useInvalidate();

  const showMsg = useCallback(
    (type: "success" | "error", message: string) => {
      setNotice({ type, message });
      setTimeout(() => setNotice(null), 3000);
    },
    []
  );

  const { data, isLoading, refresh } = useCachedData<RingkasanKaryawan[]>(
    "penggajian-ringkasan",
    () => listRingkasanKaryawanAction()
  );
  const karyawan = useMemo(() => data ?? [], [data]);

  const reload = useCallback(() => {
    invalidate("penggajian-ringkasan");
    void refresh();
  }, [invalidate, refresh]);

  const handleMuatUlang = useCallback(() => {
    reload();
    showMsg("success", "Data karyawan dimuat ulang.");
  }, [reload, showMsg]);

  return (
    <div className="space-y-6">
      {/* Kartu judul gradient */}
      <div className="bg-gradient-to-br from-indigo-600 to-emerald-600 rounded-2xl shadow-lg p-6 text-white">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-white/20 rounded-lg p-3">
              <UsersIcon size={28} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold uppercase tracking-wide">
                Penggajian
              </h1>
              <p className="text-indigo-100 dark:text-indigo-200 text-sm">
                Atur komponen gaji per karyawan, kasbon, dan proses penggajian
                bulanan.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setShowProsesGaji(true)}
              className="px-4 py-2 rounded-lg bg-white text-indigo-700 hover:bg-indigo-50 text-sm font-semibold transition-colors"
            >
              Proses Penggajian
            </button>
            <button
              type="button"
              onClick={handleMuatUlang}
              className="px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-white text-sm font-semibold transition-colors"
            >
              Muat Ulang
            </button>
          </div>
        </div>
      </div>

      {/* Daftar karyawan + ringkasan kompensasi */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Daftar Karyawan
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Komponen kompensasi aktif dan saldo kasbon tiap karyawan.
          </p>
        </div>

        {isLoading ? (
          <div className="p-10 text-center text-slate-500 dark:text-slate-400">
            Memuat data karyawan...
          </div>
        ) : karyawan.length === 0 ? (
          <div className="p-10 text-center text-slate-500 dark:text-slate-400">
            Belum ada karyawan aktif. Tambahkan orang lewat menu Pengaturan
            Keuangan &rarr; Pengurus.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="text-left px-6 py-3 font-medium">Nama</th>
                  <th className="text-left px-6 py-3 font-medium">Jabatan</th>
                  <th className="text-left px-6 py-3 font-medium">
                    Komponen Gaji
                  </th>
                  <th className="text-right px-6 py-3 font-medium">
                    Saldo Kasbon
                  </th>
                  <th className="text-right px-6 py-3 font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {karyawan.map((k) => (
                  <tr
                    key={k.actor_id}
                    className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <td className="px-6 py-3 font-medium text-slate-800 dark:text-slate-100">
                      {k.nama}
                    </td>
                    <td className="px-6 py-3 text-slate-600 dark:text-slate-400">
                      {k.role_code}
                    </td>
                    <td className="px-6 py-3">
                      {k.tipe_komponen.length === 0 ? (
                        <span className="text-slate-400 dark:text-slate-500 italic">
                          Belum diatur
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {k.tipe_komponen.map((t) => (
                            <span
                              key={t}
                              className={`px-2 py-0.5 rounded text-xs font-medium ${
                                TIPE_CHIP[t] ??
                                "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                              }`}
                            >
                              {TIPE_LABEL[t] ?? t}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums">
                      {k.saldo_pinjaman > 0 ? (
                        <span className="font-semibold text-cyan-700 dark:text-cyan-300">
                          {formatRupiah(k.saldo_pinjaman)}
                        </span>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500">
                          {formatRupiah(0)}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setKasbonTarget({ id: k.actor_id, nama: k.nama })
                          }
                          className="px-3 py-1.5 rounded-lg bg-cyan-50 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-200 hover:bg-cyan-100 dark:hover:bg-cyan-900/60 text-xs font-semibold"
                        >
                          Kasbon
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setKomponenTarget({ id: k.actor_id, nama: k.nama })
                          }
                          className="px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-200 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-xs font-semibold"
                        >
                          Atur Kompensasi
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {notice && <ToastNotifikasi {...notice} />}

      {komponenTarget && (
        <ModalKomponenKompensasi
          actor={komponenTarget}
          onClose={() => setKomponenTarget(null)}
          onSuccess={reload}
          showNotification={showMsg}
        />
      )}

      {kasbonTarget && (
        <ModalPinjamanKaryawan
          actor={kasbonTarget}
          onClose={() => setKasbonTarget(null)}
          onSuccess={reload}
          showNotification={showMsg}
        />
      )}

      {showProsesGaji && (
        <ModalProsesGaji
          onClose={() => setShowProsesGaji(false)}
          onSuccess={reload}
          showNotification={showMsg}
        />
      )}
    </div>
  );
}

