"use client";

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

export interface AksiItem {
  /** Label teks yang menjelaskan aksi (wajib, untuk a11y + mode menu). */
  label: string;
  /** Ikon opsional di kiri label. */
  ikon?: React.ReactNode;
  onClick: () => void;
  /** Sembunyikan item ini sepenuhnya bila false. Default true. */
  tampil?: boolean;
  disabled?: boolean;
  /** Varian warna. "bahaya" untuk aksi destruktif (hapus/batal). */
  varian?: "normal" | "bahaya";
  /** Tooltip tambahan saat mode inline (hover ikon). */
  judul?: string;
}

interface MenuAksiProps {
  aksi: AksiItem[];
  /**
   * Ambang jumlah aksi: bila jumlah aksi yang tampil <= ambang, render
   * inline sebagai ikon. Bila lebih, render menu kebab. Default 2.
   */
  ambangInline?: number;
  /** Label aksesibilitas untuk tombol kebab. */
  labelMenu?: string;
}

/**
 * Komponen aksi tabel yang adaptif:
 * - <= ambangInline aksi  -> tampilkan ikon inline (dengan tooltip)
 * - >  ambangInline aksi  -> tampilkan tombol titik-tiga (kebab) yang
 *   membuka daftar vertikal berisi ikon + label.
 *
 * Menu dirender lewat portal + position: fixed supaya tidak terpotong
 * oleh kontainer scroll (mis. tabel dengan overflow-y-auto).
 */
export default function MenuAksi({
  aksi,
  ambangInline = 2,
  labelMenu = "Aksi lainnya",
}: MenuAksiProps) {
  const visibleAksi = aksi.filter((a) => a.tampil !== false);

  if (visibleAksi.length === 0) return null;

  if (visibleAksi.length <= ambangInline) {
    return (
      <div className="flex items-center justify-center gap-1">
        {visibleAksi.map((a, i) => (
          <button
            key={i}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              a.onClick();
            }}
            disabled={a.disabled}
            title={a.judul || a.label}
            aria-label={a.label}
            className={`p-2 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
              a.varian === "bahaya"
                ? "text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30"
                : "text-gray-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10"
            }`}
          >
            {a.ikon ?? <span className="text-xs font-semibold">{a.label}</span>}
          </button>
        ))}
      </div>
    );
  }

  return <MenuKebab aksi={visibleAksi} labelMenu={labelMenu} />;
}

function MenuKebab({
  aksi,
  labelMenu,
}: {
  aksi: AksiItem[];
  labelMenu: string;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    maxHeight: number;
  } | null>(null);

  const close = useCallback(() => setOpen(false), []);

  // Hitung posisi menu relatif terhadap tombol (koordinat viewport untuk
  // position: fixed). Memutuskan buka ke bawah atau ke atas berdasarkan
  // ruang yang tersedia, dan membatasi tinggi agar tidak keluar layar.
  const computePosition = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const menuWidth = 224; // w-56
    const margin = 8; // jarak aman dari tepi layar
    const gap = 6; // jarak menu ke tombol

    // Posisi horizontal: buka ke kiri-bawah tombol, jaga tetap di layar.
    let left = rect.right - menuWidth;
    if (left < margin) left = margin;
    if (left + menuWidth > window.innerWidth - margin) {
      left = window.innerWidth - margin - menuWidth;
    }

    // Tinggi sebenarnya menu (kalau sudah ter-render); kalau belum, perkirakan.
    const measured = menuRef.current?.offsetHeight ?? 0;
    const estimated = aksi.length * 44 + 8;
    const menuHeight = measured || estimated;

    const spaceBelow = window.innerHeight - rect.bottom - gap - margin;
    const spaceAbove = rect.top - gap - margin;

    let top: number;
    let maxHeight: number;
    // Muat di bawah, atau ruang bawah lebih lega daripada atas → buka ke bawah.
    if (menuHeight <= spaceBelow || spaceBelow >= spaceAbove) {
      top = rect.bottom + gap;
      maxHeight = spaceBelow;
    } else {
      // Buka ke atas.
      maxHeight = spaceAbove;
      top = rect.top - gap - Math.min(menuHeight, maxHeight);
    }
    setPos({ top, left, maxHeight });
  }, [aksi.length]);

  // Ukur dua tahap: render dulu (pos sementara), lalu ukur tinggi nyata dan
  // hitung ulang posisi/flip berdasarkan tinggi sebenarnya.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    computePosition();
  }, [open, computePosition]);

  // Tahap kedua: setelah menu ter-render, ukur tinggi sebenarnya dan
  // sesuaikan posisi sekali lagi (mis. keputusan flip ke atas/bawah).
  useLayoutEffect(() => {
    if (!open || !pos) return;
    const id = requestAnimationFrame(() => computePosition());
    return () => cancelAnimationFrame(id);
    // Sengaja hanya bergantung pada `open`: jalan sekali tiap kali dibuka,
    // bukan tiap perubahan `pos` (mencegah loop tak berujung).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Tutup saat klik di luar, scroll, resize, atau tekan Escape.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (buttonRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    const onReposition = () => computePosition();

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onReposition);
    // capture: tangkap scroll dari kontainer mana pun (mis. tabel).
    window.addEventListener("scroll", onReposition, true);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, close, computePosition]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={labelMenu}
        title={labelMenu}
        className={`p-2 rounded-lg transition-all ${
          open
            ? "bg-slate-100 dark:bg-white/10"
            : "hover:bg-slate-100 dark:hover:bg-white/10"
        } text-gray-600 dark:text-slate-300`}
      >
        <svg
          className="w-5 h-5"
          fill="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>

      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            data-floating-menu
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              maxHeight: pos.maxHeight,
            }}
            className="z-[80] w-56 py-1 overflow-y-auto bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 animate-in fade-in zoom-in-95 duration-150"
          >
            {aksi.map((a, i) => (
              <button
                key={i}
                type="button"
                role="menuitem"
                disabled={a.disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  close();
                  a.onClick();
                }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  a.varian === "bahaya"
                    ? "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                    : "text-gray-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10"
                }`}
              >
                {a.ikon && (
                  <span className="shrink-0 flex items-center justify-center w-5 h-5">
                    {a.ikon}
                  </span>
                )}
                <span className="flex-1">{a.label}</span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
