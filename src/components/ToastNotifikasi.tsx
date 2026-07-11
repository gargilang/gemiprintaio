"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { addNotificationLog } from "@/lib/notification-log";

export interface NotificationToastProps {
  type: "success" | "error";
  message: string;
}

function ToastStatusIcon({ type }: { type: NotificationToastProps["type"] }) {
  if (type === "success") {
    return (
      <svg
        className="h-5 w-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.25}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M20 6L9 17l-5-5" />
      </svg>
    );
  }

  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  );
}

/**
 * ToastNotifikasi - Komponen notifikasi konsisten di seluruh aplikasi
 * Desain: latar hampir solid (sedikit blur) dengan border, lebar dibatasi
 * (max-w-md) dan teks panjang dibungkus rapi agar tidak menimpa header.
 *
 * Usage:
 * ```tsx
 * import ToastNotifikasi, { NotificationToastProps } from "@/components/ToastNotifikasi";
 *
 * const [notice, setNotice] = useState<NotificationToastProps | null>(null);
 *
 * const showMsg = (type: "success" | "error", message: string) => {
 *   setNotice({ type, message });
 *   setTimeout(() => setNotice(null), 3000);
 * };
 *
 * // In JSX:
 * {notice && <ToastNotifikasi type={notice.type} message={notice.message} />}
 * ```
 */
export default function ToastNotifikasi({
  type,
  message,
}: NotificationToastProps) {
  const pathname = usePathname();

  useEffect(() => {
    const entry = addNotificationLog({ type, message, pathname });
    if (!entry) return;

    void fetch("/api/notifikasi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: entry.id,
        tipe: entry.type,
        kategori: "toast",
        pesan: entry.message,
        sumber_path: entry.pathname,
        dibuat_pada: entry.createdAt,
      }),
    }).catch(() => {
      // Log lokal tetap menjadi fallback saat offline atau API belum siap.
    });
  }, [message, pathname, type]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed top-4 left-1/2 -translate-x-1/2 transform z-50 w-[calc(100vw-2rem)] max-w-md px-5 py-3 rounded-xl shadow-lg font-semibold text-base border-2 backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-300 ${
        type === "success"
          ? "bg-green-50/95 text-green-800 border-green-200 dark:bg-green-950/95 dark:text-green-200 dark:border-green-800"
          : "bg-red-50/95 text-red-800 border-red-200 dark:bg-red-950/95 dark:text-red-200 dark:border-red-800"
      }`}
    >
      <div className="flex items-start gap-2">
        <span className="shrink-0 mt-0.5">
          <ToastStatusIcon type={type} />
        </span>
        <span className="leading-snug break-words">{message}</span>
      </div>
    </div>
  );
}
