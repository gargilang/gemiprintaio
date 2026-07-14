"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface FinishingItem {
  jenis_finishing: string;
}

interface DropdownFinishingProps {
  options: string[];
  selected: FinishingItem[];
  onChange: (finishing: FinishingItem[]) => void;
}

/**
 * Tombol + popover finishing — chip toggle via createPortal.
 * Tidak mendorong konten di bawahnya (posisi fixed, lepas dari ancestor).
 */
export default function DropdownFinishing({
  options,
  selected,
  onChange,
}: DropdownFinishingProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    width: number;
  }>({ top: 0, left: 0, width: 240 });
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    // Tampilkan di atas tombol supaya tidak tertutup tombol "Tambah ke Keranjang"
    setCoords({
      top: rect.top,
      left: rect.left,
      width: Math.max(rect.width, 240),
    });
  }, [open]);

  // Tutup saat scroll/resize
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const toggle = (opt: string) => {
    const aktif = selected.some((f) => f.jenis_finishing === opt);
    onChange(
      aktif
        ? selected.filter((f) => f.jenis_finishing !== opt)
        : [...selected, { jenis_finishing: opt }],
    );
  };

  const jumlah = selected.length;

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`w-full py-1.5 rounded-lg text-sm font-semibold transition-all border-2 flex items-center justify-center gap-1 ${
          jumlah > 0
            ? "border-amber-500 bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200"
            : "border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-600 dark:text-slate-300 hover:border-amber-400"
        }`}
      >
        <svg
          className="w-3 h-3 shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
          />
        </svg>
        {jumlah > 0 ? `Finishing (${jumlah})` : "+ Finishing"}
      </button>

      {open &&
        createPortal(
          <>
            {/* Backdrop transparan untuk klik-luar */}
            <button
              type="button"
              className="fixed inset-0 z-[90]"
              aria-label="Tutup finishing"
              onClick={() => setOpen(false)}
            />
            {/* Popup chip */}
            <div
              className="fixed z-[100] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl p-3"
              style={{
                top: coords.top,
                left: coords.left,
                width: coords.width,
                // Geser ke atas dari tombol supaya tidak tertutup elemen bawah
                transform: "translateY(-100%) translateY(-6px)",
              }}
            >
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-2">
                Finishing
              </p>
              {options.length === 0 ? (
                <p className="text-xs text-slate-400">Belum ada opsi finishing</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {options.map((opt) => {
                    const aktif = selected.some(
                      (f) => f.jenis_finishing === opt,
                    );
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => toggle(opt)}
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                          aktif
                            ? "border-amber-500 bg-amber-500 text-white"
                            : "border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-600 dark:text-slate-300 hover:border-amber-400 dark:hover:border-amber-500"
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
