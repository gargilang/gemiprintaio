"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DialogKonfirmasi from "@/components/DialogKonfirmasi";
import {
  clearNotificationLogs,
  getNotificationLogs,
  NOTIFICATION_LOG_UPDATED_EVENT,
  type NotificationLogEntry,
  type NotificationLogType,
} from "@/lib/notification-log";
import { AuditLogIcon } from "@/components/icons/PageIcons";
import { PAGE_TITLE_MAP } from "@/components/menuConfig";
import { useCachedData } from "@/lib/use-cached-data";

type FilterType = "all" | NotificationLogType;

const NOTIFICATION_PAGE_LIMIT = 100;
const NOTIFICATION_CACHE_KEY = `notifikasi:${NOTIFICATION_PAGE_LIMIT}`;

type ApiNotification = {
  id: string;
  tipe: NotificationLogType;
  pesan: string;
  sumber_path: string | null;
  dibuat_pada: string;
};

function apiToLogEntry(item: ApiNotification): NotificationLogEntry {
  return {
    id: item.id,
    type: item.tipe,
    message: item.pesan,
    pathname: item.sumber_path || "/",
    createdAt: item.dibuat_pada,
  };
}

function getTypeLabel(type: NotificationLogType) {
  if (type === "error") return "Error";
  if (type === "success") return "Berhasil";
  if (type === "warning") return "Peringatan";
  return "Info";
}

function getTypeClasses(type: NotificationLogType) {
  if (type === "error") {
    return {
      dot: "bg-rose-500",
      badge: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-200",
    };
  }
  if (type === "success") {
    return {
      dot: "bg-emerald-500",
      badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
    };
  }
  if (type === "warning") {
    return {
      dot: "bg-amber-500",
      badge: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-200",
    };
  }
  return {
    dot: "bg-sky-500",
    badge: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-200",
  };
}

function mergeLogs(
  pusat: NotificationLogEntry[],
  lokal: NotificationLogEntry[],
): NotificationLogEntry[] {
  const byId = new Map<string, NotificationLogEntry>();
  for (const log of [...pusat, ...lokal]) {
    byId.set(log.id, log);
  }

  return [...byId.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

function formatTanggal(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Waktu tidak valid";

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
}

function resolvePageTitle(pathname: string) {
  const exact = PAGE_TITLE_MAP[pathname];
  if (exact) return exact;

  const matched = Object.keys(PAGE_TITLE_MAP)
    .filter((path) => pathname === path || pathname.startsWith(path + "/"))
    .sort((a, b) => b.length - a.length)[0];

  return matched ? PAGE_TITLE_MAP[matched] : pathname || "Halaman tidak diketahui";
}

async function fetchCentralNotificationLogs() {
  const response = await fetch(`/api/notifikasi?limit=${NOTIFICATION_PAGE_LIMIT}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    const error = new Error("API notifikasi tidak tersedia") as Error & {
      status?: number;
    };
    error.status = response.status;
    throw error;
  }

  const payload = (await response.json()) as { data?: ApiNotification[] };
  return (payload.data || []).map(apiToLogEntry);
}

export default function NotifikasiPage() {
  const [localLogs, setLocalLogs] = useState<NotificationLogEntry[]>([]);
  const [query, setQuery] = useState("");
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [confirmState, setConfirmState] = useState<{
    show: boolean;
    title: string;
    message: string;
    type: "warning" | "danger" | "info";
    onConfirm: () => void;
  }>({ show: false, title: "", message: "", type: "danger", onConfirm: () => {} });
  const closeConfirm = () => setConfirmState((s) => ({ ...s, show: false }));

  const {
    data: centralLogsData,
    error: centralLogsError,
    isLoading,
    refresh,
  } = useCachedData<NotificationLogEntry[]>(
    NOTIFICATION_CACHE_KEY,
    fetchCentralNotificationLogs,
    {
      dedupingInterval: 30_000,
      focusThrottleInterval: 60_000,
      keepPreviousData: true,
    },
  );
  const refreshRef = useRef(refresh);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    setLocalLogs(getNotificationLogs());

    const reloadLocal = () => {
      setLocalLogs(getNotificationLogs());
      void refreshRef.current();
    };
    window.addEventListener(NOTIFICATION_LOG_UPDATED_EVENT, reloadLocal);
    window.addEventListener("storage", reloadLocal);
    return () => {
      window.removeEventListener(NOTIFICATION_LOG_UPDATED_EVENT, reloadLocal);
      window.removeEventListener("storage", reloadLocal);
    };
  }, []);

  const logs = useMemo(
    () => mergeLogs(centralLogsData ?? [], localLogs),
    [centralLogsData, localLogs],
  );

  const sourceInfo = centralLogsError
    ? "API notifikasi belum tersedia/offline, jadi sementara menampilkan log lokal perangkat ini."
    : isLoading
      ? "Memuat 100 notifikasi pusat terakhir..."
      : "Menampilkan maksimal 100 notifikasi pusat terakhir. Log lokal tetap digabung sebagai fallback kalau ada toast yang belum sempat tersimpan ke server.";

  const filteredLogs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return logs.filter((log) => {
      if (filterType !== "all" && log.type !== filterType) return false;
      if (!normalizedQuery) return true;

      const pageTitle = resolvePageTitle(log.pathname).toLowerCase();
      return (
        log.message.toLowerCase().includes(normalizedQuery) ||
        log.pathname.toLowerCase().includes(normalizedQuery) ||
        pageTitle.includes(normalizedQuery)
      );
    });
  }, [filterType, logs, query]);

  const totalError = useMemo(
    () => logs.filter((log) => log.type === "error").length,
    [logs],
  );
  const totalSuccess = useMemo(
    () => logs.filter((log) => log.type === "success").length,
    [logs],
  );

  const handleClear = () => {
    setConfirmState({
      show: true,
      title: "Hapus Semua Log",
      message: "Hapus semua log notifikasi di perangkat ini?",
      type: "danger",
      onConfirm: () => {
        clearNotificationLogs();
        setLocalLogs([]);
        void refresh();
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-slate-600 to-slate-900 rounded-2xl shadow-lg p-6 text-white">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <div className="bg-white/20 rounded-lg p-3 text-white shrink-0">
              <AuditLogIcon size={30} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/75">
                Pengaturan
              </p>
              <h1 className="text-3xl font-bold mt-1">Notifikasi</h1>
              <p className="text-white/80 mt-2 max-w-3xl">
                Riwayat toast notifikasi yang muncul di aplikasi, lengkap dengan
                timestamp dan asal halaman agar pesan yang terlalu cepat hilang
                tetap bisa ditelusuri.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center md:min-w-80">
            <div className="rounded-xl bg-white/15 px-3 py-2">
              <div className="text-2xl font-bold">{logs.length}</div>
              <div className="text-xs text-white/75">Total</div>
            </div>
            <div className="rounded-xl bg-white/15 px-3 py-2">
              <div className="text-2xl font-bold">{totalError}</div>
              <div className="text-xs text-white/75">Error</div>
            </div>
            <div className="rounded-xl bg-white/15 px-3 py-2">
              <div className="text-2xl font-bold">{totalSuccess}</div>
              <div className="text-xs text-white/75">Berhasil</div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari pesan, halaman, atau path..."
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-2.5 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-[#00afef] focus:outline-none focus:ring-2 focus:ring-[#00afef]/20"
            />
            <select
              value={filterType}
              onChange={(event) => setFilterType(event.target.value as FilterType)}
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 focus:border-[#00afef] focus:outline-none focus:ring-2 focus:ring-[#00afef]/20"
            >
              <option value="all">Semua tipe</option>
              <option value="error">Error</option>
              <option value="success">Berhasil</option>
              <option value="warning">Peringatan</option>
              <option value="info">Info</option>
            </select>
          </div>
          <button
            type="button"
            onClick={handleClear}
            disabled={logs.length === 0}
            className="rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700"
          >
            Hapus Log Lokal
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          {sourceInfo} Log lokal di perangkat ini tetap dibatasi maksimal 300
          notifikasi terakhir, sedangkan query pusat dibatasi 100 notifikasi
          terakhir agar ringan untuk database.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        {filteredLogs.length === 0 ? (
          <div className="p-10 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
              <AuditLogIcon size={24} />
            </div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
              Belum ada notifikasi
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Toast yang muncul setelah fitur ini aktif akan otomatis masuk ke
              log di sini.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {filteredLogs.map((log) => {
              const typeClasses = getTypeClasses(log.type);
              const pageTitle = resolvePageTitle(log.pathname);

              return (
                <article key={log.id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="flex min-w-0 flex-1 gap-3">
                      <span
                        className={`mt-1 h-3 w-3 rounded-full shrink-0 ${typeClasses.dot}`}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase ${typeClasses.badge}`}
                          >
                            {getTypeLabel(log.type)}
                          </span>
                          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                            {pageTitle}
                          </span>
                          <span className="text-xs font-mono text-slate-400 dark:text-slate-500">
                            {log.pathname}
                          </span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-800 dark:text-slate-100">
                          {log.message}
                        </p>
                      </div>
                    </div>
                    <time className="shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400 md:text-right">
                      {formatTanggal(log.createdAt)}
                    </time>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
      <DialogKonfirmasi
        show={confirmState.show}
        title={confirmState.title}
        message={confirmState.message}
        confirmText="Ya, Hapus Semua"
        cancelText="Batal"
        onConfirm={() => { confirmState.onConfirm(); closeConfirm(); }}
        onCancel={closeConfirm}
        type={confirmState.type}
      />
    </div>
  );
}
