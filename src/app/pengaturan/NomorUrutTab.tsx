"use client";

/**
 * Tab "Nomor Urut" di halaman Settings → Master Data.
 *
 * Mengatur format penomoran otomatis untuk:
 *   - Faktur penjualan (INV)
 *   - Surat Perintah Kerja / SPK
 *
 * Konfigurasi disimpan di pengaturan_toko (singleton 'default').
 */

import { useState, useEffect } from "react";
import { useCachedData } from "@/lib/use-cached-data";
import {
  getNomorUrutSettingsAction,
  updateNomorUrutSettingsAction,
} from "@/app/pengaturan/actions";
import NotificationToast from "@/components/NotificationToast";

type NomorFormat = "PREFIX-DATE-SEQ" | "PREFIX-SEQ";
type NomorReset = "daily" | "monthly" | "yearly" | "never";

interface NomorUrutSettings {
  inv_prefix: string;
  inv_format: NomorFormat;
  inv_reset: NomorReset;
  inv_padding: number;
  inv_start_seq: number;
  spk_prefix: string;
  spk_format: NomorFormat;
  spk_reset: NomorReset;
  spk_padding: number;
  spk_start_seq: number;
}

const DEFAULTS: NomorUrutSettings = {
  inv_prefix: "INV",
  inv_format: "PREFIX-DATE-SEQ",
  inv_reset: "daily",
  inv_padding: 3,
  inv_start_seq: 1,
  spk_prefix: "SPK",
  spk_format: "PREFIX-SEQ",
  spk_reset: "never",
  spk_padding: 4,
  spk_start_seq: 1,
};

/** Buat contoh nomor berdasarkan konfigurasi saat ini */
function buildPreview(
  prefix: string,
  format: NomorFormat,
  padding: number,
  seq: number
): string {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  const dateStr = `${y}${m}${d}`;
  const seqStr = String(seq).padStart(Math.max(1, padding), "0");
  if (format === "PREFIX-DATE-SEQ") {
    return `${prefix}-${dateStr}-${seqStr}`;
  }
  return `${prefix}-${seqStr}`;
}

const FORMAT_OPTIONS: { value: NomorFormat; label: string; desc: string }[] = [
  {
    value: "PREFIX-DATE-SEQ",
    label: "Prefix + Tanggal + Urutan",
    desc: "Contoh: INV-20260524-001",
  },
  {
    value: "PREFIX-SEQ",
    label: "Prefix + Urutan saja",
    desc: "Contoh: INV-0001",
  },
];

const RESET_OPTIONS: { value: NomorReset; label: string }[] = [
  { value: "daily", label: "Setiap hari" },
  { value: "monthly", label: "Setiap bulan" },
  { value: "yearly", label: "Setiap tahun" },
  { value: "never", label: "Tidak pernah (urutan terus naik)" },
];

// ---------------------------------------------------------------------------
// Sub-component: satu blok konfigurasi (Faktur atau SPK)
// ---------------------------------------------------------------------------
interface NumberingBlockProps {
  title: string;
  subtitle: string;
  prefix: string;
  format: NomorFormat;
  reset: NomorReset;
  padding: number;
  startSeq: number;
  onPrefix: (v: string) => void;
  onFormat: (v: NomorFormat) => void;
  onReset: (v: NomorReset) => void;
  onPadding: (v: number) => void;
  onStartSeq: (v: number) => void;
}

function NumberingBlock({
  title,
  subtitle,
  prefix,
  format,
  reset,
  padding,
  startSeq,
  onPrefix,
  onFormat,
  onReset,
  onPadding,
  onStartSeq,
}: NumberingBlockProps) {
  const preview = buildPreview(prefix || "???", format, padding, startSeq);

  return (
    <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-5 border border-gray-200 dark:border-slate-700 space-y-4">
      {/* Header */}
      <div>
        <h3 className="text-base font-bold text-gray-800 dark:text-slate-100">{title}</h3>
        <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
      </div>

      {/* Preview */}
      <div className="flex items-center gap-3 bg-white dark:bg-slate-900 rounded-lg px-4 py-3 border border-gray-200 dark:border-slate-700">
        <span className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide">
          Contoh
        </span>
        <span className="font-mono text-sm font-bold text-blue-600 dark:text-blue-400">
          {preview}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Prefix */}
        <label className="block">
          <span className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">
            Prefix
          </span>
          <input
            type="text"
            value={prefix}
            onChange={(e) => onPrefix(e.target.value.toUpperCase())}
            maxLength={10}
            placeholder="INV"
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none bg-white dark:bg-slate-900 text-gray-800 dark:text-slate-100 font-mono"
          />
        </label>

        {/* Format */}
        <label className="block">
          <span className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">
            Format Nomor
          </span>
          <select
            value={format}
            onChange={(e) => onFormat(e.target.value as NomorFormat)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none bg-white dark:bg-slate-900 text-gray-800 dark:text-slate-100"
          >
            {FORMAT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
            {FORMAT_OPTIONS.find((o) => o.value === format)?.desc}
          </p>
        </label>

        {/* Reset */}
        <label className="block">
          <span className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">
            Reset Urutan
          </span>
          <select
            value={reset}
            onChange={(e) => onReset(e.target.value as NomorReset)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none bg-white dark:bg-slate-900 text-gray-800 dark:text-slate-100"
          >
            {RESET_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        {/* Padding */}
        <label className="block">
          <span className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">
            Digit Urutan (padding)
          </span>
          <input
            type="number"
            value={padding}
            min={1}
            max={8}
            onChange={(e) => onPadding(Math.max(1, Math.min(8, parseInt(e.target.value) || 1)))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none bg-white dark:bg-slate-900 text-gray-800 dark:text-slate-100"
          />
          <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
            {padding} digit → {String(startSeq).padStart(padding, "0")}
          </p>
        </label>

        {/* Start sequence */}
        <label className="block">
          <span className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">
            Nomor Awal Urutan
          </span>
          <input
            type="number"
            value={startSeq}
            min={1}
            onChange={(e) => onStartSeq(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none bg-white dark:bg-slate-900 text-gray-800 dark:text-slate-100"
          />
          <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
            Urutan mulai dari angka ini setelah reset
          </p>
        </label>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function NomorUrutTab() {
  const {
    data: shopSettings,
    isLoading,
    mutate,
  } = useCachedData<any>(
    "settings:shop",
    () => getNomorUrutSettingsAction()
  );

  const [form, setForm] = useState<NomorUrutSettings>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (shopSettings) {
      setForm({
        inv_prefix: shopSettings.inv_prefix ?? DEFAULTS.inv_prefix,
        inv_format: shopSettings.inv_format ?? DEFAULTS.inv_format,
        inv_reset: shopSettings.inv_reset ?? DEFAULTS.inv_reset,
        inv_padding: shopSettings.inv_padding ?? DEFAULTS.inv_padding,
        inv_start_seq: shopSettings.inv_start_seq ?? DEFAULTS.inv_start_seq,
        spk_prefix: shopSettings.spk_prefix ?? DEFAULTS.spk_prefix,
        spk_format: shopSettings.spk_format ?? DEFAULTS.spk_format,
        spk_reset: shopSettings.spk_reset ?? DEFAULTS.spk_reset,
        spk_padding: shopSettings.spk_padding ?? DEFAULTS.spk_padding,
        spk_start_seq: shopSettings.spk_start_seq ?? DEFAULTS.spk_start_seq,
      });
    }
  }, [shopSettings]);

  const handleSave = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const updated = await updateNomorUrutSettingsAction({
        inv_prefix: form.inv_prefix.trim() || "INV",
        inv_format: form.inv_format,
        inv_reset: form.inv_reset,
        inv_padding: form.inv_padding,
        inv_start_seq: form.inv_start_seq,
        spk_prefix: form.spk_prefix.trim() || "SPK",
        spk_format: form.spk_format,
        spk_reset: form.spk_reset,
        spk_padding: form.spk_padding,
        spk_start_seq: form.spk_start_seq,
      });
      await mutate(updated, { revalidate: false });
      setNotice({ type: "success", message: "Pengaturan nomor urut berhasil disimpan" });
    } catch (err) {
      console.error("Gagal menyimpan nomor urut:", err);
      setNotice({ type: "error", message: "Gagal menyimpan pengaturan nomor urut" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {notice && (
        <NotificationToast type={notice.type} message={notice.message} />
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="p-3 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl">
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
          </svg>
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-slate-100">Nomor Urut</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Format penomoran otomatis untuk faktur penjualan dan SPK produksi
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-gray-500 dark:text-slate-400 py-8 text-center">
          Memuat pengaturan...
        </div>
      ) : (
        <>
          {/* Blok faktur penjualan */}
          <NumberingBlock
            title="Faktur Penjualan"
            subtitle="Nomor yang tercetak di faktur penjualan dan struk"
            prefix={form.inv_prefix}
            format={form.inv_format}
            reset={form.inv_reset}
            padding={form.inv_padding}
            startSeq={form.inv_start_seq}
            onPrefix={(v) => setForm((f) => ({ ...f, inv_prefix: v }))}
            onFormat={(v) => setForm((f) => ({ ...f, inv_format: v }))}
            onReset={(v) => setForm((f) => ({ ...f, inv_reset: v }))}
            onPadding={(v) => setForm((f) => ({ ...f, inv_padding: v }))}
            onStartSeq={(v) => setForm((f) => ({ ...f, inv_start_seq: v }))}
          />

          {/* SPK block */}
          <NumberingBlock
            title="Surat Perintah Kerja (SPK)"
            subtitle="Nomor yang tercetak di dokumen SPK produksi"
            prefix={form.spk_prefix}
            format={form.spk_format}
            reset={form.spk_reset}
            padding={form.spk_padding}
            startSeq={form.spk_start_seq}
            onPrefix={(v) => setForm((f) => ({ ...f, spk_prefix: v }))}
            onFormat={(v) => setForm((f) => ({ ...f, spk_format: v }))}
            onReset={(v) => setForm((f) => ({ ...f, spk_reset: v }))}
            onPadding={(v) => setForm((f) => ({ ...f, spk_padding: v }))}
            onStartSeq={(v) => setForm((f) => ({ ...f, spk_start_seq: v }))}
          />

          {/* Info box */}
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-4 text-sm text-amber-800 dark:text-amber-300">
            <p className="font-semibold mb-1">Catatan penting</p>
            <ul className="list-disc list-inside space-y-1 text-amber-700 dark:text-amber-400">
              <li>Perubahan format hanya berlaku untuk nomor <strong>baru</strong> — nomor yang sudah terbit tidak berubah.</li>
              <li>Reset urutan terjadi otomatis saat periode baru dimulai (hari/bulan/tahun berikutnya).</li>
              <li>Jika format diubah dari <em>Prefix+Tanggal+Urutan</em> ke <em>Prefix+Urutan</em>, pastikan prefix cukup unik untuk menghindari duplikasi.</li>
            </ul>
          </div>

          {/* Save button */}
          <div className="flex justify-end pt-2 border-t border-gray-200 dark:border-slate-700">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg font-semibold hover:shadow-lg disabled:opacity-60 transition-all"
            >
              {saving ? "Menyimpan..." : "Simpan Pengaturan"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
