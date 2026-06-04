"use client";

import { useState } from "react";
import ModalFormShell from "@/components/ModalFormShell";

interface ImportCsvModalProps {
  show: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onImportCsv: (csvContent: string, append: boolean) => Promise<any>;
}

export default function ImportCsvModal({
  show,
  onClose,
  onSuccess,
  onImportCsv,
}: ImportCsvModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [append, setAppend] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [error, setError] = useState<string>("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith(".csv")) {
        setError("File harus berformat CSV");
        return;
      }
      setFile(selectedFile);
      setError("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!file) {
      setError("Pilih file CSV terlebih dahulu");
      return;
    }

    setUploading(true);
    setProgress("Membaca file...");
    setError("");

    try {
      const csvText = await file.text();

      setProgress("Mengimpor data...");

      const result = await onImportCsv(csvText, append);

      if (!result.success) {
        throw new Error(result.message);
      }

      setProgress(result.message);

      if (result.errors && result.errors.length > 0) {
        console.warn("Import warnings:", result.errors);
      }

      setTimeout(() => {
        onSuccess();
        handleClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan saat import");
      setUploading(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setAppend(false);
    setUploading(false);
    setProgress("");
    setError("");
    onClose();
  };

  const dismissDisabled = uploading;

  return (
    <ModalFormShell
      open={show}
      onClose={handleClose}
      allowDismiss={!dismissDisabled}
      maxWidthClass="max-w-md"
      header={
        <div className="p-6 border-b border-gray-200 dark:border-slate-800 bg-gradient-to-r from-orange-500 to-pink-600 shrink-0 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-2 bg-white/20 dark:bg-slate-900/20 rounded-lg shrink-0">
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white truncate">
              Impor dari CSV
            </h3>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={dismissDisabled}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors shrink-0 disabled:opacity-50"
            aria-label="Tutup"
          >
            <svg
              className="w-6 h-6 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
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
        <div className="bg-gray-50 dark:bg-slate-800 px-6 py-4 flex items-center justify-end gap-3 border-t border-gray-200 dark:border-slate-800 shrink-0">
          <button
            type="button"
            onClick={handleClose}
            disabled={dismissDisabled}
            className="px-6 py-2 bg-white dark:bg-slate-900 border-2 border-gray-300 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-100 transition-colors font-semibold disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="submit"
            form="import-csv-form"
            disabled={dismissDisabled || !file}
            className="px-6 py-2 bg-gradient-to-r from-orange-500 to-pink-600 text-white rounded-lg font-semibold hover:from-orange-600 hover:to-pink-700 hover:shadow-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? "Mengimport..." : "Simpan"}
          </button>
        </div>
      }
    >
      <form
        id="import-csv-form"
        onSubmit={handleSubmit}
        className="p-6 space-y-4"
      >
        <div className="bg-orange-50 dark:bg-slate-800 border-2 border-orange-200 dark:border-orange-800/50 rounded-xl p-4 text-sm text-orange-800 dark:text-orange-200">
          <div className="font-bold mb-2">Format CSV yang Didukung:</div>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li>
              <strong>Header:</strong> TANGGAL, KATEGORI, DEBIT, KREDIT,
              KEPERLUAN
            </li>
            <li>
              <strong>Tanggal:</strong> MM/DD/YYYY (contoh: 12/31/2024)
            </li>
            <li>
              <strong>Currency:</strong> Rp5,085,464 atau 5085464
            </li>
          </ul>
        </div>

        <div>
          <label
            htmlFor="csv-file-input"
            className="block text-sm font-semibold text-[#0a1b3d] dark:text-slate-100 mb-2"
          >
            Pilih File CSV
          </label>
          <input
            id="csv-file-input"
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            disabled={uploading}
            className="block w-full text-sm text-gray-500 dark:text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-pink-50 file:text-pink-700 hover:file:bg-pink-100 cursor-pointer border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
          {file && (
            <p className="mt-2 text-xs text-gray-600 dark:text-slate-300">
              File dipilih:{" "}
              <span className="font-medium text-gray-800 dark:text-slate-100">{file.name}</span>
            </p>
          )}
        </div>

        <div className="flex items-center pt-2">
          <input
            type="checkbox"
            id="append"
            checked={append}
            onChange={(e) => setAppend(e.target.checked)}
            disabled={uploading}
            className="w-4 h-4 text-pink-600 bg-gray-100 dark:bg-slate-800 border-gray-300 rounded focus:ring-pink-600"
          />
          <label htmlFor="append" className="ml-3 text-sm text-gray-700 dark:text-slate-300">
            Tambahkan ke data yang ada (jangan hapus data lama).
          </label>
        </div>

        {!append && (
          <div className="bg-yellow-50 dark:bg-slate-800 border-2 border-yellow-200 dark:border-yellow-800/50 rounded-xl p-3 text-sm text-yellow-800 dark:text-yellow-200">
            ⚠️ Tanpa ini, semua data aktif akan dihapus & diganti data CSV.
          </div>
        )}

        {progress && (
          <div className="bg-green-50 dark:bg-slate-800 border-2 border-green-200 dark:border-slate-700 rounded-xl p-3 text-sm text-green-800 dark:text-green-200 font-medium">
            {progress}
          </div>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-950/40 border-2 border-red-200 dark:border-red-800/50 rounded-xl p-3 text-sm text-red-800 dark:text-red-200 font-medium">
            {error}
          </div>
        )}
      </form>
    </ModalFormShell>
  );
}
