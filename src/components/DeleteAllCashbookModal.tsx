"use client";

interface DeleteAllCashbookModalProps {
  show: boolean;
  onClose: () => void;
  onConfirm: () => void;
  deleting: boolean;
}

export default function DeleteAllCashbookModal({
  show,
  onClose,
  onConfirm,
  deleting,
}: DeleteAllCashbookModalProps) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in duration-200">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
              <svg
                className="w-6 h-6 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-[#0a1b3d]">
              Hapus Semua Data
            </h3>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-base text-gray-600">
            Aksi ini akan menghapus semua transaksi dari buku keuangan aktif
            secara permanen.
          </p>
          <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl p-4 text-sm text-yellow-800">
            <strong>Peringatan:</strong> Aksi ini tidak dapat dibatalkan.
            Pastikan Anda sudah melakukan backup jika diperlukan.
          </div>
          <div className="bg-blue-50 border-2 border-blue-300 rounded-xl p-4 text-sm">
            <p className="font-bold text-blue-800 mb-2">
              Data berikut TIDAK akan terpengaruh:
            </p>
            <ul className="list-disc list-inside pl-2 text-blue-700">
              <li>Arsip Tutup Buku</li>
              <li>Data Pelanggan, Material, Vendor</li>
              <li>Data Invoice</li>
              <li>Data Pengguna</li>
            </ul>
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="flex-1 px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-100 transition-all font-semibold disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="flex-1 px-4 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl hover:shadow-lg hover:from-red-600 hover:to-red-700 transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {deleting ? "Menghapus..." : "Ya, Hapus Semua"}
          </button>
        </div>
      </div>
    </div>
  );
}
