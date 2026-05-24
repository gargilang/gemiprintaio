"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { LogoutIcon } from "./icons/PageIcons";
import {
  MENU_ENTRIES,
  PAGE_TITLE_MAP,
  canAccessPath,
  isMenuGroup,
  iterateMenuLeaves,
  type MenuItem,
} from "./menuConfig";
import { useTauriWindowClose } from "@/hooks/useTauriWindowClose";
import SyncStatus from "./SyncStatus";
import FloatingCalculator from "./FloatingCalculator";
import {
  fetchSessionUser,
  getCachedSessionUser,
  logoutSession,
  type SessionUser,
} from "@/lib/client-session";

const SIDEBAR_COLLAPSED_KEY = "gemiprint_sidebar_collapsed";

export default function MainShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  // Do not read sessionStorage in useState — SSR and client must render the same (null) first.
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    {}
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const navRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      setSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const visibleLeaves = useMemo(
    () =>
      [...iterateMenuLeaves(MENU_ENTRIES)].filter((item) =>
        canAccessPath(user?.role, item.href)
      ),
    [user?.role]
  );

  // Clear user session when window/app is closed (Tauri + browser)
  useTauriWindowClose();

  useEffect(() => {
    let cancelled = false;

    const cached = getCachedSessionUser();
    if (cached?.aktif_status) {
      setUser(cached);
      setAuthReady(true);
    }

    (async () => {
      const userData = await fetchSessionUser();
      if (cancelled) return;
      if (!userData || !userData.aktif_status) {
        setUser(null);
        setAuthReady(true);
        router.push("/auth/login");
        return;
      }
      setUser(userData);
      setAuthReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  // Open sidebar group (e.g. Relasi) automatically when the active route is under it
  useEffect(() => {
    if (!pathname) return;
    for (const entry of MENU_ENTRIES) {
      if (!isMenuGroup(entry)) continue;
      const childActive = entry.children.some(
        (c) => pathname === c.href || pathname.startsWith(c.href + "/")
      );
      if (childActive) {
        setExpandedGroups((prev) =>
          prev[entry.id] ? prev : { ...prev, [entry.id]: true }
        );
      }
    }
  }, [pathname]);

  // Route-level role guard. Whenever the active page or current user
  // changes, kick the user back to /dashboard if they're not allowed
  // on this route. /dashboard is reachable by every role.
  useEffect(() => {
    if (!user || !pathname) return;
    if (pathname.startsWith("/auth/")) return;
    if (!canAccessPath(user.role, pathname)) {
      router.replace("/dashboard");
    }
  }, [user, pathname, router]);

  // Restore sidebar scroll position before paint to prevent flicker
  useLayoutEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const saved = sessionStorage.getItem("sidebarScroll");
    if (saved) el.scrollTop = parseInt(saved, 10) || 0;
  }, [pathname]);

  // Separate effect for scroll saving (doesn't depend on pathname)
  useEffect(() => {
    const key = "sidebarScroll";
    const el = navRef.current;
    if (!el) return;

    // Save scroll position continuously
    const onScroll = () => {
      sessionStorage.setItem(key, String(el.scrollTop));
    };
    el.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      el.removeEventListener("scroll", onScroll);
    };
  }, []); // Empty deps - only runs once


  const computedTitle = useMemo(() => {
    if (!pathname) return "Dashboard";
    const exact = PAGE_TITLE_MAP[pathname];
    if (exact) return exact;
    const found = Object.keys(PAGE_TITLE_MAP).find((k) =>
      pathname.startsWith(k)
    );
    return found ? PAGE_TITLE_MAP[found] : "Dashboard";
  }, [pathname]);

  const handleLogout = useCallback(() => {
    void (async () => {
      await logoutSession();
      router.push("/auth/login");
    })();
  }, [router]);

  // Development helper: Clear session with Ctrl+Shift+L
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "L") {
        console.log("🔓 [DEV] Clearing session and redirecting to login...");
        void logoutSession().then(() => router.push("/auth/login"));
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [router]);

  // Match SSR and first hydration output; show shell after mount + auth.
  if (!authReady || !user) {
    return null;
  }

  const navRowCore =
    "flex gap-2.5 py-2.5 px-2 -mx-2 rounded-lg transition-colors duration-150 w-full text-left";
  const navRowLeaf = `${navRowCore} items-center`;
  const navRowGroupBtn = `${navRowCore} items-start pt-1`;
  const navRowHover =
    "hover:bg-slate-50 active:bg-slate-100/80 dark:hover:bg-slate-800 dark:active:bg-slate-700/80";

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 flex">
      <aside
        className={`bg-white dark:bg-slate-900 shadow-lg flex-shrink-0 h-screen sticky top-0 z-40 border-r border-gray-100 dark:border-slate-800 overflow-x-visible transition-[width] duration-200 ease-out ${
          sidebarCollapsed ? "w-14" : "w-72"
        }`}
      >
        <div
          className={`h-full flex flex-col ${sidebarCollapsed ? "px-2 py-3" : "px-3 py-3"}`}
        >
          <div
            className={`flex-shrink-0 mb-3 ${sidebarCollapsed ? "flex flex-col items-center gap-2" : "flex items-center gap-2"}`}
          >
            <Image
              src="/assets/images/logo-gemiprint-default.svg"
              alt="gemiprint Logo"
              width={40}
              height={40}
              className={`shrink-0 ${sidebarCollapsed ? "w-8 h-8" : "w-9 h-9"}`}
            />
            {!sidebarCollapsed && (
              <span className="font-bauhaus text-2xl tracking-wide italic min-w-0 truncate">
                <span className="text-[#00afef]">gemi</span>
                <span className="text-[#0a1b3d] dark:text-slate-100">print</span>
              </span>
            )}
            <button
              type="button"
              onClick={toggleSidebar}
              title={
                sidebarCollapsed
                  ? "Perluas sidebar"
                  : "Ciutkan sidebar (ikon saja)"
              }
              aria-expanded={!sidebarCollapsed}
              aria-label={
                sidebarCollapsed ? "Perluas sidebar" : "Ciutkan sidebar"
              }
              className={`rounded-lg p-1 text-[#6b7280] dark:text-slate-400 dark:text-slate-400 hover:bg-slate-100 hover:text-[#0a1b3d] dark:hover:bg-slate-800 dark:hover:text-slate-100 transition-colors shrink-0 ${sidebarCollapsed ? "" : "ml-auto"}`}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.75}
                aria-hidden
              >
                <rect
                  x="3.5"
                  y="4.5"
                  width="17"
                  height="15"
                  rx="2"
                  strokeLinejoin="round"
                />
                <line
                  x1="9.75"
                  y1="5.25"
                  x2="9.75"
                  y2="18.75"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          {sidebarCollapsed ? (
            <nav
              ref={navRef}
              className="flex flex-col flex-1 overflow-y-auto gap-0.5 min-h-0 -mx-1 [scrollbar-gutter:stable] [scrollbar-width:thin] [scrollbar-color:rgb(203_213_225)_transparent]"
            >
              {visibleLeaves.map((item) => {
                const active =
                  pathname === item.href ||
                  pathname?.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.label}
                    className={`flex justify-center py-2 rounded-lg border-b border-gray-100 dark:border-slate-800 transition-colors ${navRowHover} ${
                      active
                        ? "border-b-2 border-b-[#00afef] bg-[#00afef]/5 dark:bg-[#00afef]/10"
                        : ""
                    }`}
                  >
                    <span
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shadow-sm text-white bg-gradient-to-br ${item.color}`}
                    >
                      {item.icon}
                    </span>
                  </Link>
                );
              })}
            </nav>
          ) : (
            <nav
              ref={navRef}
              className="flex flex-col flex-1 overflow-y-auto min-h-0 gap-0 [scrollbar-gutter:stable] [scrollbar-width:thin] [scrollbar-color:rgb(203_213_225)_transparent] pr-0.5"
            >
              {MENU_ENTRIES.map((entry) => {
                if (isMenuGroup(entry)) {
                  const visibleChildren = entry.children.filter((child) =>
                    canAccessPath(user?.role, child.href)
                  );
                  if (visibleChildren.length === 0) return null;

                  const expanded = expandedGroups[entry.id] ?? false;
                  const groupChildActive = visibleChildren.some(
                    (c) =>
                      pathname === c.href ||
                      pathname?.startsWith(c.href + "/")
                  );

                  return (
                    <div
                      key={entry.id}
                      className="border-b border-gray-100/90 dark:border-slate-800/80 pb-0.5 mb-0.5 last:border-b-0 last:mb-0 last:pb-0"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedGroups((p) => ({
                            ...p,
                            [entry.id]: !p[entry.id],
                          }))
                        }
                        className={`${navRowGroupBtn} ${navRowHover} border-b border-transparent ${
                          groupChildActive
                            ? "border-b-2 border-b-[#00afef]"
                            : ""
                        }`}
                        aria-expanded={expanded}
                      >
                        <span
                          className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 shadow-sm text-white bg-gradient-to-br mt-0.5 ${entry.color}`}
                        >
                          {entry.icon}
                        </span>
                        <span
                          className={`font-twcenmt font-semibold text-base flex-1 min-w-0 text-left leading-snug ${
                            groupChildActive
                              ? "text-[#00afef]"
                              : "text-[#0a1b3d] dark:text-slate-100"
                          }`}
                        >
                          {entry.label}
                        </span>
                        <svg
                          className={`w-4 h-4 shrink-0 text-[#9ca3af] dark:text-slate-500 transition-transform ${
                            expanded ? "rotate-180" : ""
                          }`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                          aria-hidden
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </button>
                      {expanded && (
                        <div className="mt-0.5 ml-2.5 pl-2.5 border-l border-[#00afef]/25 space-y-0">
                          {visibleChildren.map((item) => {
                            const active =
                              pathname === item.href ||
                              pathname?.startsWith(item.href + "/");
                            return (
                              <Link
                                key={item.href}
                                href={item.href}
                                className={`${navRowLeaf} ${navRowHover} ${
                                  active
                                    ? "border-b-2 border-b-[#00afef] -mb-px"
                                    : "border-b border-gray-100 dark:border-slate-800"
                                }`}
                              >
                                <span
                                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm text-white bg-gradient-to-br ${item.color}`}
                                >
                                  {item.icon}
                                </span>
                                <span
                                  className={`font-twcenmt font-semibold text-base truncate ${
                                    active
                                      ? "text-[#00afef]"
                                      : "text-[#0a1b3d] dark:text-slate-100"
                                  }`}
                                >
                                  {item.label}
                                </span>
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                }

                const item = entry as MenuItem;
                if (!canAccessPath(user?.role, item.href)) {
                  return null;
                }
                const active =
                  pathname === item.href ||
                  pathname?.startsWith(item.href + "/");
                return (
                  <div
                    key={item.href}
                    className="border-b border-gray-100/90 dark:border-slate-800/80 pb-0.5 mb-0.5 last:border-b-0 last:mb-0 last:pb-0"
                  >
                    <Link
                      href={item.href}
                      className={`${navRowLeaf} ${navRowHover} ${
                        active
                          ? "border-b-2 border-b-[#00afef] -mb-px"
                          : "border-b border-transparent"
                      }`}
                    >
                      <span
                        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 shadow-sm text-white bg-gradient-to-br ${item.color}`}
                      >
                        {item.icon}
                      </span>
                      <span
                        className={`font-twcenmt font-semibold text-base truncate ${
                          active
                            ? "text-[#00afef]"
                            : "text-[#0a1b3d] dark:text-slate-100"
                        }`}
                      >
                        {item.label}
                      </span>
                    </Link>
                  </div>
                );
              })}
            </nav>
          )}

          <div
            className={`flex-shrink-0 mt-auto pt-3 border-t border-gray-100 dark:border-slate-800 ${sidebarCollapsed ? "flex flex-col items-center gap-2" : ""}`}
          >
            {sidebarCollapsed ? (
              <>
                <div
                  className="w-9 h-9 rounded-full bg-gradient-to-br from-[#00afef] to-[#2266ff] flex items-center justify-center font-bold text-sm text-white shadow-md"
                  title={`${user?.nama_lengkap || user?.nama_pengguna} · @${user?.nama_pengguna} · ${user?.role}`}
                >
                  {user?.nama_lengkap?.charAt(0) ||
                    user?.nama_pengguna?.charAt(0) ||
                    "U"}
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  title="Logout"
                  aria-label="Logout"
                  className="p-1.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:bg-red-950/40 dark:hover:bg-red-500/10 transition-colors"
                >
                  <LogoutIcon size={17} />
                </button>
              </>
            ) : (
              <div className="rounded-xl border border-blue-100 dark:border-slate-700 bg-gradient-to-br from-blue-50/90 to-cyan-50/80 dark:from-slate-800/80 dark:to-slate-900/80 overflow-hidden">
                <div className="p-2.5 flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#00afef] to-[#2266ff] flex items-center justify-center font-bold text-sm text-white shadow-md shrink-0">
                    {user?.nama_lengkap?.charAt(0) ||
                      user?.nama_pengguna?.charAt(0) ||
                      "U"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm text-[#0a1b3d] dark:text-slate-100 truncate leading-tight">
                      {user?.nama_lengkap || user?.nama_pengguna}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                      <span className="text-xs text-[#6b7280] dark:text-slate-400 dark:text-slate-400 truncate">
                        @{user?.nama_pengguna}
                      </span>
                      <span className="text-[10px] font-bold text-[#00afef] uppercase px-1.5 py-0.5 bg-white/90 dark:bg-slate-900/80 rounded shrink-0">
                        {user?.role}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full text-red-600 dark:text-red-400 hover:bg-red-50 dark:bg-red-950/40 dark:hover:bg-red-500/10 flex items-center justify-center gap-2 py-2.5 text-base font-semibold border-t border-red-100 dark:border-red-900/40 transition-colors"
                >
                  <LogoutIcon size={20} />
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Content Area */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Header with indicators */}
        <header className="bg-white dark:bg-slate-900 shadow-sm sticky top-0 z-30 border-b border-gray-200 dark:border-slate-800">
          <div className="px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
            <div className="flex items-center gap-3 min-w-0">
              <h1 className="text-3xl font-bold text-[#0a1b3d] dark:text-slate-100 font-twcenmt uppercase tracking-wide truncate">
                {computedTitle}
              </h1>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setCalculatorOpen((open) => !open)}
                className={`w-10 h-10 rounded-lg border flex items-center justify-center transition-colors ${
                  calculatorOpen
                    ? "bg-[#00afef] border-[#00afef] text-white shadow-sm"
                    : "bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-[#0a1b3d] dark:text-slate-100 hover:bg-gray-100 dark:hover:bg-slate-700"
                }`}
                title="Buka kalkulator"
                aria-label="Buka kalkulator"
                aria-pressed={calculatorOpen}
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  aria-hidden
                >
                  <rect x="5" y="3" width="14" height="18" rx="2" />
                  <path d="M8 7h8M8 11h2M12 11h2M16 11h.01M8 15h2M12 15h2M16 15h.01M8 18h6" />
                </svg>
              </button>

              {/* Sync Status Component */}
              <SyncStatus className="px-3 py-1.5 bg-gray-50 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700" />
            </div>
          </div>
        </header>

        <main className="px-4 sm:px-6 lg:px-8 py-8 max-w-7xl mx-auto flex-1">
          {children}
        </main>
      </div>

      <FloatingCalculator
        open={calculatorOpen}
        onClose={() => setCalculatorOpen(false)}
      />
    </div>
  );
}
