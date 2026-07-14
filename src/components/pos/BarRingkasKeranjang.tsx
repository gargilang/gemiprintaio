"use client";

import DropdownKeranjangTersimpan from "@/app/pos/DropdownKeranjangTersimpan";
import type { ParkedCart } from "@/lib/services/keranjang-tersimpan-service";

export interface BarRingkasKeranjangProps {
  itemCount: number;
  total: number;
  onOpenOverlay: () => void;
  onParkClick?: () => void;
  parkedCarts?: ParkedCart[];
  onLoadParked?: (id: string) => void;
  onJadikanPenawaran?: (id: string) => void;
  onDeleteParked?: (id: string) => void;
}

/**
 * Bar ringkas keranjang yang menempel (sticky) di bawah area kerja POS.
 * Menampilkan jumlah item, total, dan aksi cepat: Simpan (parkir),
 * Tersimpan (dropdown), serta tombol utama untuk membuka overlay keranjang.
 */
export default function BarRingkasKeranjang({
  itemCount,
  total,
  onOpenOverlay,
  onParkClick,
  parkedCarts = [],
  onLoadParked,
  onJadikanPenawaran,
  onDeleteParked,
}: BarRingkasKeranjangProps) {
  const kosong = itemCount === 0;

  return (
    <div className="sticky bottom-0 z-30 -mx-1 px-1 pb-1">
      <div className="flex items-center gap-3 rounded-2xl border-2 border-[#00afef]/30 bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-slate-800 dark:to-slate-900 shadow-lg px-4 py-3">
        {/* Ikon keranjang */}
        <div className="bg-gradient-to-br from-[#00afef] to-[#0088cc] p-2 rounded-lg shadow-sm shrink-0">
          <svg
            className="w-5 h-5 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
        </div>

        {/* Jumlah item + total */}
        <div className="min-w-0">
          <p className="text-sm text-gray-500 dark:text-slate-400 leading-tight">
            {itemCount} item
          </p>
          <p className="text-lg font-bold text-[#00afef] leading-tight">
            Rp {total.toLocaleString("id-ID")}
          </p>
        </div>

        {/* Aksi cepat */}
        <div className="flex items-center gap-2 ml-auto flex-wrap justify-end">
          {onParkClick && (
            <button
              type="button"
              onClick={onParkClick}
              disabled={kosong}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-sm font-semibold disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed transition-colors hover:bg-emerald-200 dark:hover:bg-emerald-900/50"
              title="Simpan keranjang"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                />
              </svg>
              Simpan
            </button>
          )}

          {onLoadParked && onJadikanPenawaran && onDeleteParked && (
            <DropdownKeranjangTersimpan
              parkedCarts={parkedCarts}
              onLoad={onLoadParked}
              onJadikanPenawaran={onJadikanPenawaran}
              onDelete={onDeleteParked}
            />
          )}

          <button
            type="button"
            onClick={onOpenOverlay}
            disabled={kosong}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-[#00afef] to-[#2266ff] text-white font-bold text-base hover:from-[#0099dd] hover:to-[#1955ee] transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            Lihat Keranjang / Bayar
          </button>
        </div>
      </div>
    </div>
  );
}
