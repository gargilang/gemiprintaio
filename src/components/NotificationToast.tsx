"use client";

export interface NotificationToastProps {
  type: "success" | "error";
  message: string;
}

/**
 * NotificationToast - Komponen notifikasi yang konsisten di seluruh aplikasi
 * Design: Transparan dengan border, lebih soft dan modern
 *
 * Usage:
 * ```tsx
 * import NotificationToast, { NotificationToastProps } from "@/components/NotificationToast";
 *
 * const [notice, setNotice] = useState<NotificationToastProps | null>(null);
 *
 * const showMsg = (type: "success" | "error", message: string) => {
 *   setNotice({ type, message });
 *   setTimeout(() => setNotice(null), 3000);
 * };
 *
 * // In JSX:
 * {notice && <NotificationToast type={notice.type} message={notice.message} />}
 * ```
 */
export default function NotificationToast({
  type,
  message,
}: NotificationToastProps) {
  return (
    <div
      className={`fixed top-4 left-1/2 -translate-x-1/2 transform z-50 px-6 py-3 rounded-xl shadow-lg font-semibold text-sm border-2 animate-in fade-in slide-in-from-top-2 duration-300 ${
        type === "success"
          ? "bg-green-50 text-green-800 border-green-200"
          : "bg-red-50 text-red-800 border-red-200"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-lg">{type === "success" ? "✓" : "✕"}</span>
        <span>{message}</span>
      </div>
    </div>
  );
}
