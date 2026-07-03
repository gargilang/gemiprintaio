"use client";

import { useEffect, useState } from "react";
import ModalFormShell from "@/components/ModalFormShell";

interface ModalParkirKeranjangProps {
  open: boolean;
  defaultLabel: string;
  onClose: () => void;
  onConfirm: (label: string) => Promise<void> | void;
}

export default function ModalParkirKeranjang({
  open,
  defaultLabel,
  onClose,
  onConfirm,
}: ModalParkirKeranjangProps) {
  const [label, setLabel] = useState(defaultLabel);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setLabel(defaultLabel);
  }, [open, defaultLabel]);

  const handleConfirm = async () => {
    if (!label.trim()) return;
    setSaving(true);
    try {
      await onConfirm(label.trim());
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalFormShell
      open={open}
      onClose={onClose}
      maxWidthClass="max-w-md"
      header={
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
            Parkir Keranjang
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            aria-label="Tutup"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      }
      footer={
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving || !label.trim()}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold disabled:opacity-50"
          >
            {saving ? "Menyimpan..." : "Parkir"}
          </button>
        </div>
      }
    >
      <div className="px-6 py-4">
        <label className="block text-sm">
          <span className="text-slate-700 dark:text-slate-200">Label keranjang</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-slate-800 dark:text-slate-100"
            placeholder="Nama pelanggan · jumlah item · jam"
          />
        </label>
      </div>
    </ModalFormShell>
  );
}
