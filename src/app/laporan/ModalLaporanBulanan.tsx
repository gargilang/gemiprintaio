"use client";

import { useState, useEffect, useCallback } from "react";
import ModalFormShell from "@/components/ModalFormShell";
import PratinjauFakturMengambang from "@/components/PratinjauFakturMengambang";
import {
  getClosedAccountingPeriodsAction,
  generateLaporanBulananAction,
} from "./actions";
import { printLaporanBulanan } from "@/lib/laporan-bulanan-print";
import { formatPeriodKeyLabel } from "@/lib/laporan-bulanan-utils";
import { PrinterIcon } from "@/components/icons/ContentIcons";

interface ClosedPeriod {
  id: string;
  period_key: string;
  start_date: string;
  end_date: string;
}

interface Props {
  onClose: () => void;
  showNotification: (type: "success" | "error", message: string) => void;
}

function kataPembukaDefault(periodeLabel: string): string {
  return `Dengan hormat,\n\nBersama laporan ini kami sampaikan ringkasan kinerja keuangan dan operasional untuk periode ${periodeLabel}. Laporan ini disusun berdasarkan data transaksi yang telah diverifikasi oleh manajemen.`;
}

function kataPenutupDefault(): string {
  return `Demikian laporan ini kami sampaikan. Atas perhatian dan kepercayaan Anda, kami ucapkan terima kasih.`;
}

export default function ModalLaporanBulanan({ onClose, showNotification }: Props) {
  const [periods, setPeriods] = useState<ClosedPeriod[]>([]);
  const [loadingPeriods, setLoadingPeriods] = useState(true);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("");
  const [kataPembuka, setKataPembuka] = useState("");
  const [kataPenutup, setKataPenutup] = useState(kataPenutupDefault());
  const [generating, setGenerating] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    setLoadingPeriods(true);
    getClosedAccountingPeriodsAction()
      .then((data) => {
        setPeriods(data);
        if (data.length > 0) {
          setSelectedPeriodId(data[0].id);
        }
      })
      .catch(() => showNotification("error", "Gagal memuat daftar periode."))
      .finally(() => setLoadingPeriods(false));
  }, [showNotification]);

  useEffect(() => {
    if (!selectedPeriodId) return;
    const period = periods.find((p) => p.id === selectedPeriodId);
    if (!period) return;
    const label = formatPeriodKeyLabel(period.period_key);
    setKataPembuka(kataPembukaDefault(label));
  }, [selectedPeriodId, periods]);

  const handleGenerate = useCallback(
    async (mode: "preview" | "print") => {
      if (!selectedPeriodId) {
        showNotification("error", "Pilih periode terlebih dahulu.");
        return;
      }
      setGenerating(true);
      try {
        const html = await generateLaporanBulananAction({
          accounting_period_id: selectedPeriodId,
          kata_pembuka: kataPembuka,
          kata_penutup: kataPenutup,
          simpan_riwayat: mode === "print",
        });

        if (mode === "preview") {
          setPreviewHtml(html);
          setShowPreview(true);
        } else {
          const ok = printLaporanBulanan(html);
          if (!ok) {
            showNotification(
              "error",
              "Popup diblokir browser. Izinkan popup untuk situs ini lalu coba lagi."
            );
          }
        }
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Gagal membuat laporan.";
        showNotification("error", msg);
      } finally {
        setGenerating(false);
      }
    },
    [selectedPeriodId, kataPembuka, kataPenutup, showNotification]
  );

  const selectedPeriod = periods.find((p) => p.id === selectedPeriodId);
  const periodeLabel = selectedPeriod
    ? formatPeriodKeyLabel(selectedPeriod.period_key)
    : "";

  return (
    <>
      <ModalFormShell
        open
        onClose={onClose}
        allowDismiss={!generating}
        maxWidthClass="max-w-2xl"
        header={
          <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-6 py-4 flex items-center justify-between shrink-0">
            <h3 className="text-xl font-bold text-white">
              Laporan Manajemen Bulanan
            </h3>
            <button
              type="button"
              onClick={onClose}
              disabled={generating}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors shrink-0 disabled:opacity-50"
              aria-label="Tutup"
            >
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        }
        footer={
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={generating}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
            >
              Tutup
            </button>
            <button
              type="button"
              onClick={() => handleGenerate("preview")}
              disabled={generating || !selectedPeriodId}
              className="px-4 py-2 rounded-lg border border-indigo-400 text-indigo-700 dark:text-indigo-300 text-sm font-semibold hover:bg-indigo-50 dark:hover:bg-slate-700 disabled:opacity-50"
            >
              {generating ? "Memuat..." : "Pratinjau"}
            </button>
            <button
              type="button"
              onClick={() => handleGenerate("print")}
              disabled={generating || !selectedPeriodId}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
            >
              <PrinterIcon size={16} />
              {generating ? "Memuat..." : "Cetak / PDF"}
            </button>
          </div>
        }
      >
        <div className="space-y-5 p-1">
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
              Periode Akuntansi
            </label>
            {loadingPeriods ? (
              <div className="text-sm text-slate-500 dark:text-slate-400">
                Memuat daftar periode...
              </div>
            ) : periods.length === 0 ? (
              <div className="text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 border border-amber-200 dark:border-amber-700">
                Belum ada periode yang ditutup. Tutup periode terlebih dahulu di
                halaman Pengaturan → Tutup Periode.
              </div>
            ) : (
              <select
                value={selectedPeriodId}
                onChange={(e) => setSelectedPeriodId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {formatPeriodKeyLabel(p.period_key)}
                  </option>
                ))}
              </select>
            )}
          </div>

          {selectedPeriodId && (
            <>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  Kata Pembuka
                </label>
                <textarea
                  value={kataPembuka}
                  onChange={(e) => setKataPembuka(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  Kata Penutup
                </label>
                <textarea
                  value={kataPenutup}
                  onChange={(e) => setKataPenutup(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
                />
              </div>

              <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-lg px-4 py-3 text-sm text-indigo-800 dark:text-indigo-200">
                Laporan untuk: <strong>{periodeLabel}</strong>. Dokumen akan
                memuat ringkasan KPI, posisi hutang/piutang, dan riwayat buku
                kas selengkapnya.
              </div>
            </>
          )}
        </div>
      </ModalFormShell>

      {previewHtml && (
        <PratinjauFakturMengambang
          open={showPreview}
          html={previewHtml}
          title={`Laporan Bulanan — ${periodeLabel}`}
          orientation="portrait"
          onClose={() => setShowPreview(false)}
        />
      )}
    </>
  );
}
