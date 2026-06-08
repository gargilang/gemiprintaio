"use client";

export interface NotificationToastProps {
  type: "success" | "error";
  message: string;
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
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed top-4 left-1/2 -translate-x-1/2 transform z-50 w-[calc(100vw-2rem)] max-w-md px-5 py-3 rounded-xl shadow-lg font-semibold text-sm border-2 backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-300 ${
        type === "success"
          ? "bg-green-50/95 text-green-800 border-green-200 dark:bg-green-950/95 dark:text-green-200 dark:border-green-800"
          : "bg-red-50/95 text-red-800 border-red-200 dark:bg-red-950/95 dark:text-red-200 dark:border-red-800"
      }`}
    >
      <div className="flex items-start gap-2">
        <span className="text-lg leading-none shrink-0 mt-0.5">
          {type === "success" ? "✓" : "✕"}
        </span>
        <span className="leading-snug break-words">{message}</span>
      </div>
    </div>
  );
}
