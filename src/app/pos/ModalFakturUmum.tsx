"use client";

// Modal info pelanggan umum untuk cetak faktur. Diekstrak dari pos/page.tsx (Fase 6 C2 step 2).
// Muncul saat kasir mau cetak faktur tapi belum memilih pelanggan terdaftar.
// Murni presentational: induk pegang state + alur checkout.

export interface FakturUmumInput {
  nama: string;
  kota: string;
}

export interface ModalFakturUmumProps {
  open: boolean;
  value: FakturUmumInput;
  onChange: (value: FakturUmumInput) => void;
  onClose: () => void;
  /** Simpan info pelanggan umum lalu lanjut proses bayar. */
  onConfirm: () => void;
}

export default function ModalFakturUmum({
  open,
  value,
  onChange,
  onClose,
  onConfirm,
}: ModalFakturUmumProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-gradient-to-r from-[#00afef] to-[#2266ff] px-5 py-4">
          <h3 className="text-white font-bold text-lg">Info untuk Faktur</h3>
          <p className="text-white/90 text-xs mt-0.5">
            Pelanggan tidak dipilih. Isi data berikut untuk dicetak di faktur.
          </p>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-600 dark:text-slate-300 mb-1">
              Kepada Yth.
            </label>
            <input
              type="text"
              value={value.nama}
              onChange={(e) => onChange({ ...value, nama: e.target.value })}
              placeholder="Nama / nama perusahaan"
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 text-black dark:text-slate-100 border-2 border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:border-[#00afef]"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 dark:text-slate-300 mb-1">
              Kota
            </label>
            <input
              type="text"
              value={value.kota}
              onChange={(e) => onChange({ ...value, kota: e.target.value })}
              placeholder="Bekasi"
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 text-black dark:text-slate-100 border-2 border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:border-[#00afef]"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 font-semibold hover:bg-gray-200"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#00afef] to-[#2266ff] text-white font-bold hover:from-[#0099dd] hover:to-[#1955ee]"
            >
              Lanjut Bayar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
