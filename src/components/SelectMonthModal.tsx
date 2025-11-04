"use client";

import { useState, useEffect } from "react";

interface Archive {
  archived_label: string;
  count: number;
  start_date: string;
  end_date: string;
  archived_at: string;
}

interface SelectMonthModalProps {
  show: boolean;
  onClose: () => void;
  onSelectArchive: (archive: {
    label: string;
    archived_at: string;
    start_date: string;
    end_date: string;
  }) => void;
}

export default function SelectMonthModal({
  show,
  onClose,
  onSelectArchive,
}: SelectMonthModalProps) {
  const [archives, setArchives] = useState<Archive[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (show) {
      loadArchives();
    }
  }, [show]);

  const loadArchives = async () => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/cashbook/archive");
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Gagal memuat arsip");
      }

      setArchives(data.archives || []);
    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  };

  if (!show) return null;

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col animate-in fade-in zoom-in duration-200">
        <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-t-2xl">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            Pilih Arsip Bulan
          </h3>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center py-10">
              <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-purple-500 border-t-transparent"></div>
              <p className="mt-3 text-gray-600 font-medium">Memuat arsip...</p>
            </div>
          ) : error ? (
            <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 text-sm text-red-800 font-medium">
              {error}
            </div>
          ) : archives.length === 0 ? (
            <div className="text-center py-10">
              <svg
                className="w-24 h-24 mx-auto text-gray-300 mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                />
              </svg>
              <h4 className="text-lg font-semibold text-gray-700">
                Belum Ada Arsip
              </h4>
              <p className="text-gray-500 mt-1">
                Gunakan fitur "Tutup Buku" untuk mengarsipkan transaksi per
                periode.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {archives.map((archive, index) => (
                <button
                  key={index}
                  onClick={() => {
                    onSelectArchive({
                      label: archive.archived_label,
                      archived_at: archive.archived_at,
                      start_date: archive.start_date,
                      end_date: archive.end_date,
                    });
                    onClose();
                  }}
                  className="w-full text-left p-4 border-2 border-gray-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h4 className="font-bold text-gray-800 group-hover:text-blue-700 text-base">
                        {archive.archived_label}
                      </h4>
                      <p className="text-sm text-gray-600 mt-1">
                        {formatDate(archive.start_date)} -{" "}
                        {formatDate(archive.end_date)}
                      </p>
                      <p className="text-xs text-gray-500 mt-2 bg-gray-100 inline-block px-2 py-1 rounded-md">
                        {archive.count} transaksi
                      </p>
                    </div>
                    <div className="text-blue-500 group-hover:text-blue-600 transform transition-transform group-hover:translate-x-1">
                      <svg
                        className="w-6 h-6"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl text-gray-700 hover:bg-gray-100 transition-all font-semibold"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
