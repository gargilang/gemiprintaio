"use client";

import { useState, useCallback, useMemo } from "react";
import ToastNotifikasi, {
  type NotificationToastProps,
} from "@/components/ToastNotifikasi";
import MenuAksi from "@/components/MenuAksi";
import DialogKonfirmasi from "@/components/DialogKonfirmasi";
import { useCachedData, useInvalidate } from "@/lib/use-cached-data";
import { UsersIcon } from "@/components/icons/PageIcons";
import {
  UsersIcon as UsersContentIcon,
  CashIcon,
  BriefcaseIcon,
} from "@/components/icons/ContentIcons";
import { formatRupiah } from "@/lib/format-id";
import {
  listRingkasanKaryawanAction,
  getMetrikKasAction,
  nonaktifkanKaryawanAction,
  aktifkanKaryawanAction,
  hapusKaryawanAction,
  urutkanKaryawanAction,
  type RingkasanKaryawan,
} from "./actions";
import ModalKomponenKompensasi from "./ModalKomponenKompensasi";
import ModalPinjamanKaryawan from "./ModalPinjamanKaryawan";
import ModalBagiHasil from "./ModalBagiHasil";
import ModalProsesGaji from "./ModalProsesGaji";
import ModalTambahKaryawan from "./ModalTambahKaryawan";

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
  const [bagiHasilTarget, setBagiHasilTarget] = useState<{
    id: string;
    nama: string;
  } | null>(null);
  const [showProsesGaji, setShowProsesGaji] = useState(false);
  const [showTambah, setShowTambah] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [hapusTarget, setHapusTarget] = useState<RingkasanKaryawan | null>(
    null,
  );
  const [urutBusy, setUrutBusy] = useState(false);
  const invalidate = useInvalidate();

  const showMsg = useCallback((type: "success" | "error", message: string) => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 3000);
  }, []);

  const { data, isLoading, refresh } = useCachedData<RingkasanKaryawan[]>(
    `penggajian-ringkasan:${showInactive ? "all" : "active"}`,
    () => listRingkasanKaryawanAction(showInactive),
  );
  const { data: metrik, refresh: refreshMetrik } = useCachedData(
    "penggajian-metrik-kas",
    () => getMetrikKasAction(),
  );
  const karyawan = useMemo(
    () => (data ?? []).filter((k) => k.role_group !== "owner"),
    [data],
  );

  // Statistik untuk kartu ringkasan di atas tabel. Kas/Modal Kas/Saldo Kasbon
  // diambil dari AST engine (sumber kebenaran kolom buku kas).
  const totalKaryawan = karyawan.length;
  const kas = metrik?.kas ?? 0;
  const modalKas = metrik?.modal_kas ?? 0;
  const saldoKasbon = metrik?.saldo_kasbon ?? 0;

  const reload = useCallback(() => {
    invalidate("penggajian-ringkasan:active");
    invalidate("penggajian-ringkasan:all");
    invalidate("penggajian-metrik-kas");
    void refresh();
    void refreshMetrik();
  }, [invalidate, refresh, refreshMetrik]);

  const handleNonaktif = useCallback(
    async (k: RingkasanKaryawan) => {
      try {
        await nonaktifkanKaryawanAction(k.actor_id);
        showMsg("success", `${k.nama} dinonaktifkan.`);
        reload();
      } catch (e) {
        showMsg("error", (e as Error)?.message || "Gagal menonaktifkan.");
      }
    },
    [reload, showMsg],
  );

  const handleAktif = useCallback(
    async (k: RingkasanKaryawan) => {
      try {
        await aktifkanKaryawanAction(k.actor_id);
        showMsg("success", `${k.nama} diaktifkan kembali.`);
        reload();
      } catch (e) {
        showMsg("error", (e as Error)?.message || "Gagal mengaktifkan.");
      }
    },
    [reload, showMsg],
  );

  const handleHapus = useCallback(async () => {
    if (!hapusTarget) return;
    try {
      await hapusKaryawanAction(hapusTarget.actor_id);
      showMsg("success", `${hapusTarget.nama} dihapus.`);
      setHapusTarget(null);
      reload();
    } catch (e) {
      showMsg("error", (e as Error)?.message || "Gagal menghapus.");
      setHapusTarget(null);
    }
  }, [hapusTarget, reload, showMsg]);

  const handlePindahUrutan = useCallback(
    async (index: number, arah: -1 | 1) => {
      const target = index + arah;
      if (target < 0 || target >= karyawan.length || urutBusy) return;
      const berikut = [...karyawan];
      [berikut[index], berikut[target]] = [berikut[target], berikut[index]];
      try {
        setUrutBusy(true);
        await urutkanKaryawanAction(berikut.map((k) => k.actor_id));
        showMsg("success", "Urutan karyawan diperbarui.");
        reload();
      } catch (e) {
        showMsg("error", (e as Error)?.message || "Gagal memperbarui urutan.");
      } finally {
        setUrutBusy(false);
      }
    },
    [karyawan, reload, showMsg, urutBusy],
  );

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
                Karyawan
              </h1>
              <p className="text-indigo-100 dark:text-indigo-200 text-base">
                Kelola komponen gaji, kasbon, dan proses penggajian tiap
                karyawan.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setShowProsesGaji(true)}
              className="px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-white text-base font-semibold transition-colors"
            >
              Proses Penggajian
            </button>
            <button
              type="button"
              onClick={() => setShowTambah(true)}
              className="px-4 py-2 rounded-lg bg-white text-indigo-700 hover:bg-indigo-50 text-base font-semibold transition-colors"
            >
              + Tambah Karyawan
            </button>
          </div>
        </div>
      </div>

      {/* Kartu ringkasan */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total Karyawan */}
        <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-xl shadow-lg p-6 text-white">
          <div className="flex items-center gap-2 mb-2">
            <div className="bg-white/20 rounded-lg p-2">
              <UsersContentIcon size={20} className="text-white" />
            </div>
            <h3 className="text-base font-semibold uppercase tracking-wide">
              Total Karyawan
            </h3>
          </div>
          <p className="text-3xl font-bold">{totalKaryawan}</p>
          <p className="text-base mt-2 text-indigo-100">Karyawan terdaftar</p>
        </div>

        {/* Saldo Kasbon */}
        <div className="bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-xl shadow-lg p-6 text-white">
          <div className="flex items-center gap-2 mb-2">
            <div className="bg-white/20 rounded-lg p-2">
              <CashIcon size={20} className="text-white" />
            </div>
            <h3 className="text-base font-semibold uppercase tracking-wide">
              Saldo Kasbon
            </h3>
          </div>
          <p className="text-3xl font-bold tabular-nums">
            {formatRupiah(saldoKasbon)}
          </p>
          <p className="text-base mt-2 text-cyan-100">
            Total pinjaman berjalan semua karyawan
          </p>
        </div>

        {/* Kas */}
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl shadow-lg p-6 text-white">
          <div className="flex items-center gap-2 mb-2">
            <div className="bg-white/20 rounded-lg p-2">
              <BriefcaseIcon size={20} className="text-white" />
            </div>
            <h3 className="text-base font-semibold uppercase tracking-wide">
              Kas
            </h3>
          </div>
          <p className="text-3xl font-bold tabular-nums">{formatRupiah(kas)}</p>
          <p className="text-base mt-2 text-emerald-100">
            Modal Kas: {formatRupiah(modalKas)}
          </p>
        </div>
      </div>

      {/* Daftar karyawan + ringkasan kompensasi */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
              Daftar Karyawan
            </h2>
            <p className="text-base text-slate-500 dark:text-slate-400">
              Komponen kompensasi aktif dan saldo kasbon tiap karyawan.
            </p>
          </div>
          <label className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-2 select-none cursor-pointer">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Tampilkan nonaktif
          </label>
        </div>

        {isLoading ? (
          <div className="p-10 text-center text-slate-500 dark:text-slate-400 text-base">
            Memuat data karyawan...
          </div>
        ) : karyawan.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <div className="flex flex-col items-center justify-center text-slate-400 dark:text-slate-500">
              <UsersContentIcon size={48} className="mb-3 opacity-50" />
              <p className="text-lg font-semibold text-slate-600 dark:text-slate-300">
                Belum ada karyawan
              </p>
              <p className="text-base mt-1">
                Tekan &quot;+ Tambah Karyawan&quot; di atas untuk memulai
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-base">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="text-center px-3 py-3 font-medium w-20 text-sm uppercase tracking-wider">
                    Urutan
                  </th>
                  <th className="text-left px-6 py-3 font-medium text-sm uppercase tracking-wider">Nama</th>
                  <th className="text-left px-6 py-3 font-medium text-sm uppercase tracking-wider">Jabatan</th>
                  <th className="text-left px-6 py-3 font-medium text-sm uppercase tracking-wider">
                    Bagi Hasil &amp; Komponen
                  </th>
                  <th className="text-right px-6 py-3 font-medium text-sm uppercase tracking-wider">
                    Saldo Kasbon
                  </th>
                  <th className="text-center px-6 py-3 font-medium text-sm uppercase tracking-wider">Status</th>
                  <th className="text-right px-6 py-3 font-medium text-sm uppercase tracking-wider">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {karyawan.map((k, index) => (
                  <tr
                    key={k.actor_id}
                    className={`border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                      k.is_active === 0 ? "opacity-60" : ""
                    }`}
                  >
                    <td className="px-3 py-3">
                      <div className="flex flex-col items-center gap-1">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200 text-sm font-bold tabular-nums">
                          {index + 1}
                        </span>
                        <div className="flex flex-col gap-0.5">
                          <button
                            type="button"
                            onClick={() => handlePindahUrutan(index, -1)}
                            disabled={index === 0 || urutBusy}
                            aria-label={`Naikkan urutan ${k.nama}`}
                            className="p-0.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              aria-hidden
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 15l7-7 7 7"
                              />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePindahUrutan(index, 1)}
                            disabled={
                              index === karyawan.length - 1 || urutBusy
                            }
                            aria-label={`Turunkan urutan ${k.nama}`}
                            className="p-0.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              aria-hidden
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 9l-7 7-7-7"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3 font-medium text-slate-800 dark:text-slate-100">
                      {k.nama}
                    </td>
                    <td className="px-6 py-3 text-slate-600 dark:text-slate-400">
                      {k.role_label}
                    </td>
                    <td className="px-6 py-3">
                      {k.profit_share_percent === null &&
                      k.tipe_komponen.length === 0 ? (
                        <span className="text-slate-400 dark:text-slate-500 italic text-base">
                          Belum diatur
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {k.profit_share_percent !== null && (
                            <span className="px-2 py-0.5 rounded text-sm font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                              Bagi Hasil {k.profit_share_percent}%
                            </span>
                          )}
                          {k.tipe_komponen.map((t) => (
                            <span
                              key={t}
                              className={`px-2 py-0.5 rounded text-sm font-medium ${
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
                        <span className="text-slate-400 dark:text-slate-500 text-base">
                          {formatRupiah(0)}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-center">
                      {k.is_active === 1 ? (
                        <span className="text-sm text-emerald-700 dark:text-emerald-300">
                          Aktif
                        </span>
                      ) : (
                        <span className="text-sm text-slate-400 dark:text-slate-500">
                          Nonaktif
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
                          className="px-3 py-1.5 rounded-lg bg-cyan-50 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-200 hover:bg-cyan-100 dark:hover:bg-cyan-900/60 text-sm font-semibold"
                        >
                          Kasbon
                        </button>
                        {k.profit_share_percent != null && (
                          <button
                            type="button"
                            onClick={() =>
                              setBagiHasilTarget({
                                id: k.actor_id,
                                nama: k.nama,
                              })
                            }
                            className="px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/40 text-amber-700 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-sm font-semibold"
                          >
                            Bagi Hasil
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setKomponenTarget({ id: k.actor_id, nama: k.nama })
                          }
                          className="px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-200 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-sm font-semibold"
                        >
                          Atur Kompensasi
                        </button>
                        <MenuAksi
                          labelMenu={`Aksi untuk ${k.nama}`}
                          aksi={[
                            {
                              label: "Nonaktifkan",
                              judul: "Nonaktifkan karyawan",
                              tampil: k.is_active === 1,
                              onClick: () => handleNonaktif(k),
                              ikon: (
                                <svg
                                  className="w-5 h-5 text-amber-600 dark:text-amber-300"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                                  />
                                </svg>
                              ),
                            },
                            {
                              label: "Aktifkan Kembali",
                              judul: "Aktifkan kembali",
                              tampil: k.is_active !== 1,
                              onClick: () => handleAktif(k),
                              ikon: (
                                <svg
                                  className="w-5 h-5 text-emerald-600 dark:text-emerald-300"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                  />
                                </svg>
                              ),
                            },
                            {
                              label: "Hapus Permanen",
                              judul: "Hapus permanen",
                              varian: "bahaya",
                              onClick: () => setHapusTarget(k),
                              ikon: (
                                <svg
                                  className="w-5 h-5 text-rose-600"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                  />
                                </svg>
                              ),
                            },
                          ]}
                        />
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

      {bagiHasilTarget && (
        <ModalBagiHasil
          actor={bagiHasilTarget}
          onClose={() => setBagiHasilTarget(null)}
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

      {showTambah && (
        <ModalTambahKaryawan
          onClose={() => setShowTambah(false)}
          onCreated={(actorId, nama) => {
            setShowTambah(false);
            reload();
            setKomponenTarget({ id: actorId, nama });
          }}
          showNotification={showMsg}
        />
      )}

      <DialogKonfirmasi
        show={!!hapusTarget}
        title="Hapus karyawan?"
        message={`Hapus permanen "${hapusTarget?.nama ?? ""}"? Tindakan ini tidak bisa dibatalkan. Kalau masih ada komponen gaji aktif atau saldo kasbon, sistem akan menolak — nonaktifkan saja sebagai gantinya.`}
        type="danger"
        confirmText="Hapus permanen"
        onConfirm={handleHapus}
        onCancel={() => setHapusTarget(null)}
      />
    </div>
  );
}
