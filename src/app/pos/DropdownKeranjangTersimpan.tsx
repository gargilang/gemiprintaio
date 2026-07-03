"use client";

import { useMemo, useState } from "react";
import type { ParkedCart } from "@/lib/services/keranjang-tersimpan-service";

interface DropdownKeranjangTersimpanProps {
  parkedCarts: ParkedCart[];
  onLoad: (id: string) => void;
  onJadikanPenawaran: (id: string) => void;
  onDelete: (id: string) => void;
}

function formatJam(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export default function DropdownKeranjangTersimpan({
  parkedCarts,
  onLoad,
  onJadikanPenawaran,
  onDelete,
}: DropdownKeranjangTersimpanProps) {
  const [open, setOpen] = useState(false);
  const count = parkedCarts.length;
  const showWarning = count > 30;

  const sorted = useMemo(
    () => [...parkedCarts].sort((a, b) => b.dibuat_pada.localeCompare(a.dibuat_pada)),
    [parkedCarts],
  );

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-[10px] font-semibold"
        title="Keranjang tersimpan"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
        </svg>
        Tersimpan ({count})
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40"
            aria-label="Tutup daftar"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full mt-1 z-50 w-80 max-h-96 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-2">
            {showWarning && (
              <p className="text-[10px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 px-2 py-1.5 rounded mb-2">
                Finalisasi atau jadikan penawaran dulu — sudah lebih dari 30 keranjang tersimpan.
              </p>
            )}
            {sorted.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 px-2 py-3 text-center">
                Belum ada keranjang tersimpan
              </p>
            ) : (
              sorted.map((p) => {
                const itemCount = Array.isArray(p.cart_snapshot)
                  ? p.cart_snapshot.length
                  : 0;
                const status =
                  p.status === "KEDALUWARSA" ? "KEDALUWARSA" : p.status;
                return (
                  <div
                    key={p.id}
                    className="border border-slate-100 dark:border-slate-800 rounded-lg p-2 mb-2 last:mb-0"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
                          {p.label}
                        </p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">
                          {itemCount} item · {formatJam(p.dibuat_pada)}
                        </p>
                        <span
                          className={`inline-block mt-1 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                            status === "KEDALUWARSA"
                              ? "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                              : "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
                          }`}
                        >
                          {status}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            onLoad(p.id);
                            setOpen(false);
                          }}
                          className="text-[10px] px-2 py-0.5 rounded bg-indigo-600 text-white font-semibold"
                        >
                          Muat
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onJadikanPenawaran(p.id);
                            setOpen(false);
                          }}
                          className="text-[10px] px-2 py-0.5 rounded bg-purple-600 text-white font-semibold"
                        >
                          Jadikan Penawaran
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onDelete(p.id);
                            setOpen(false);
                          }}
                          className="text-[10px] px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 font-semibold"
                          aria-label="Hapus"
                        >
                          Hapus
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
