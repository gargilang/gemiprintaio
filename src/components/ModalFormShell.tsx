"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useFocusTrap } from "./useFocusTrap";

export interface ModalFormShellProps {
  open: boolean;
  onClose: () => void;
  header: ReactNode;
  footer: ReactNode;
  children: ReactNode;
  maxWidthClass?: string;
  /** Saat false, klik backdrop dan Escape tidak menutup dialog */
  allowDismiss?: boolean;
  zIndexClass?: string;
  backdropClassName?: string;
}

/**
 * Layout bersama: header tetap, body yang bisa di-scroll, footer tetap.
 * Klik backdrop + Escape menutup saat allowDismiss true.
 */
export default function ModalFormShell({
  open,
  onClose,
  header,
  footer,
  children,
  maxWidthClass = "max-w-5xl",
  allowDismiss = true,
  zIndexClass = "z-50",
  backdropClassName = "bg-black/50",
}: ModalFormShellProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const canDismiss = open && allowDismiss;

  // Jebak fokus keyboard di dalam modal selama terbuka (U-I3). Escape/backdrop
  // tetap ditangani di bawah supaya semantik allowDismiss tidak terduplikasi.
  useFocusTrap(modalRef, open);

  useClickOutside(
    modalRef,
    () => {
      onClose();
    },
    canDismiss
  );

  useEffect(() => {
    if (!open || !allowDismiss) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, allowDismiss, onClose]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 ${backdropClassName} flex items-center justify-center ${zIndexClass} p-4`}
    >
      <div
        ref={modalRef}
        className={`bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full ${maxWidthClass} max-h-[90vh] overflow-hidden flex flex-col`}
      >
        {header}
        <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
        {footer}
      </div>
    </div>
  );
}
