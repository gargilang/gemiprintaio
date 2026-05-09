"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useClickOutside } from "@/hooks/useClickOutside";

export interface ModalFormShellProps {
  open: boolean;
  onClose: () => void;
  header: ReactNode;
  footer: ReactNode;
  children: ReactNode;
  maxWidthClass?: string;
  /** When false, backdrop click and Escape do not close the dialog */
  allowDismiss?: boolean;
  zIndexClass?: string;
  backdropClassName?: string;
}

/**
 * Shared layout: fixed header, scrollable body, fixed footer.
 * Backdrop click + Escape close when allowDismiss is true.
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
        className={`bg-white rounded-2xl shadow-2xl w-full ${maxWidthClass} max-h-[90vh] overflow-hidden flex flex-col`}
      >
        {header}
        <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
        {footer}
      </div>
    </div>
  );
}
