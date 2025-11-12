"use client";

import { useEffect, useRef } from "react";
import { useClickOutside } from "@/hooks/useClickOutside";
import { AlertIcon } from "./icons/ContentIcons";

interface ConfirmDialogProps {
  show: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  type?: "warning" | "danger" | "info" | "purchases" | "pos";
}

export default function ConfirmDialog({
  show,
  title,
  message,
  confirmText = "Ya, Lanjutkan",
  cancelText = "Batal",
  onConfirm,
  onCancel,
  type = "warning",
}: ConfirmDialogProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useClickOutside(
    modalRef,
    () => {
      if (onCancel) onCancel();
    },
    show
  );

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!show) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onConfirm();
      } else if (e.key === "Escape") {
        e.preventDefault();
        if (onCancel) onCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [show, onConfirm, onCancel]);

  if (!show) return null;

  const typeStyles = {
    warning: {
      gradient: "from-amber-500 to-orange-500",
      iconBg: "bg-white/20",
      icon: <AlertIcon size={24} className="text-white" />,
      confirmButton: "from-amber-500 to-orange-500",
    },
    danger: {
      gradient: "from-red-500 to-red-600",
      iconBg: "bg-white/20",
      icon: (
        <svg
          className="w-6 h-6 text-white"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>
      ),
      confirmButton: "from-red-500 to-red-600",
    },
    info: {
      gradient: "from-blue-500 to-indigo-600",
      iconBg: "bg-white/20",
      icon: (
        <svg
          className="w-6 h-6 text-white"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ),
      confirmButton: "from-blue-500 to-indigo-600",
    },
    purchases: {
      gradient: "from-indigo-500 to-purple-500",
      iconBg: "bg-white/20",
      icon: <AlertIcon size={24} className="text-white" />,
      confirmButton: "from-indigo-500 to-purple-500",
    },
    pos: {
      gradient: "from-[#00afef] to-[#2266ff]",
      iconBg: "bg-white/20",
      icon: (
        <svg
          className="w-6 h-6 text-white"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ),
      confirmButton: "from-[#00afef] to-[#2266ff]",
    },
  } as const;

  const styles =
    typeStyles[type as keyof typeof typeStyles] || typeStyles.warning;

  return (
    <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div
        ref={modalRef}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in zoom-in duration-200"
      >
        <div
          className={`p-6 border-b border-gray-200 bg-gradient-to-r ${styles.gradient} rounded-t-2xl`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-full ${styles.iconBg} flex items-center justify-center`}
            >
              {styles.icon}
            </div>
            <h3 className="text-xl font-bold text-white">{title}</h3>
          </div>
        </div>

        <div className="p-6">
          <p className="text-base text-gray-700 whitespace-pre-line leading-relaxed">
            {message}
          </p>
        </div>

        <div className="p-6 border-t border-gray-200 flex gap-3">
          {cancelText && (
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-100 transition-all font-semibold"
            >
              {cancelText}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            className={`${
              cancelText ? "flex-1" : "w-full"
            } px-4 py-3 bg-gradient-to-r ${
              styles.confirmButton
            } text-white rounded-xl hover:shadow-lg transition-all font-semibold`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
