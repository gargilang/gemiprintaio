"use client";

import { useState } from "react";

interface ImportCsvModalProps {
  show: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ImportCsvModal({
  show,
  onClose,
  onSuccess,
}: ImportCsvModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [append, setAppend] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [error, setError] = useState<string>("");

  if (!show) return null;

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
    setProgress("Mengupload file...");
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("append", append.toString());

      const res = await fetch("/api/cashbook/import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Gagal mengimpor CSV");
      }

      setProgress(data.message || "Import berhasil!");
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

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in duration-200">
        <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600">
          <h3 className="text-xl font-bold text-white">Import dari CSV</h3>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Info Box */}
          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 text-sm text-blue-800">
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

          {/* File Input */}
          <div>
            <label
              htmlFor="csv-file-input"
              className="block text-sm font-semibold text-[#0a1b3d] mb-2"
            >
              Pilih File CSV
            </label>
            <input
              id="csv-file-input"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              disabled={uploading}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100 cursor-pointer border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            {file && (
              <p className="mt-2 text-xs text-gray-600">
                File dipilih:{" "}
                <span className="font-medium text-gray-800">{file.name}</span>
              </p>
            )}
          </div>

          {/* Append Option */}
          <div className="flex items-center pt-2">
            <input
              type="checkbox"
              id="append"
              checked={append}
              onChange={(e) => setAppend(e.target.checked)}
              disabled={uploading}
              className="w-4 h-4 text-purple-600 bg-gray-100 border-gray-300 rounded focus:ring-purple-500"
            />
            <label htmlFor="append" className="ml-3 text-sm text-gray-700">
              Tambahkan ke data yang ada (jangan hapus data lama).
            </label>
          </div>

          {!append && (
            <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-3 text-sm text-yellow-800">
              ⚠️ Tanpa ini, semua data aktif akan dihapus & diganti data CSV.
            </div>
          )}

          {/* Progress */}
          {progress && (
            <div className="bg-green-50 border-2 border-green-200 rounded-xl p-3 text-sm text-green-800 font-medium">
              {progress}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 border-2 border-red-200 rounded-xl p-3 text-sm text-red-800 font-medium">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={uploading}
              className="flex-1 px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-100 transition-all font-semibold disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={uploading || !file}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? "Mengimport..." : "Import"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
