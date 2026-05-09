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
import { MENU_ITEMS, PAGE_TITLE_MAP, canAccessPath } from "./menuConfig";
import { useTauriWindowClose } from "@/hooks/useTauriWindowClose";
import SyncStatus from "./SyncStatus";

interface User {
  id: string;
  nama_pengguna: string;
  email: string;
  nama_lengkap?: string;
  role: string;
  aktif_status: number;
}

export default function MainShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navRef = useRef<HTMLDivElement | null>(null);

  // Clear user session when window/app is closed (Tauri + browser)
  useTauriWindowClose();

  useEffect(() => {
    try {
      const userSession = localStorage.getItem("user");
      if (!userSession) {
        // Redirect to login if not authenticated
        setLoading(false);
        router.push("/auth/login");
        return;
      }
      const userData = JSON.parse(userSession);
      if (!userData.aktif_status) {
        localStorage.removeItem("user");
        setLoading(false);
        router.push("/auth/login");
        return;
      }
      setUser(userData);
      setLoading(false);
    } catch (e) {
      localStorage.removeItem("user");
      setLoading(false);
      router.push("/auth/login");
    }
  }, [router]);

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
    localStorage.removeItem("user");
    router.push("/auth/login");
  }, [router]);

  // Development helper: Clear session with Ctrl+Shift+L
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "L") {
        console.log("🔓 [DEV] Clearing session and redirecting to login...");
        localStorage.removeItem("user");
        router.push("/auth/login");
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [router]);

  // Don't render anything while checking auth to prevent flicker
  if (loading || !user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-white flex">
      {/* Sidebar - permanent */}
      <aside className="w-80 bg-white shadow-2xl flex-shrink-0 h-screen sticky top-0">
        <div className="p-6 h-full flex flex-col">
          {/* Logo & Brand in Sidebar (static brand) */}
          <div className="flex items-center gap-3 mb-6">
            <Image
              src="/assets/images/logo-gemiprint-default.svg"
              alt="gemiprint Logo"
              width={40}
              height={40}
              className="w-10 h-10"
            />
            <span className="font-bauhaus text-2xl tracking-wide italic">
              <span className="text-[#00afef]">gemi</span>
              <span className="text-[#0a1b3d]">print</span>
            </span>
          </div>

          {/* Navigation Menu - card-style buttons */}
          <nav ref={navRef} className="space-y-3 flex-1 overflow-y-auto">
            {MENU_ITEMS.map((item) => {
              if (!canAccessPath(user?.role, item.href)) {
                return null;
              }
              const active =
                pathname === item.href || pathname?.startsWith(item.href + "/");
              if (active) {
                // Active item style like Users page: gradient strip + left border accent
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-[#00afef]/10 to-[#2266ff]/10 border-l-4 border-l-[#00afef] transition-all duration-200"
                  >
                    <span className="text-[#00afef]">{item.icon}</span>
                    <span className="font-twcenmt font-semibold text-[#00afef]">
                      {item.label}
                    </span>
                  </Link>
                );
              }
              // Inactive items use card-style buttons
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group block rounded-xl border p-3 transition-all duration-200 bg-gray-50 border-gray-200 hover:bg-white hover:border-[#00afef]/60 hover:shadow-md"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all shadow-sm text-white bg-gradient-to-br ${item.color} group-hover:shadow-lg`}
                    >
                      {item.icon}
                    </div>
                    <span className="font-twcenmt font-semibold transition-colors text-[#0a1b3d] group-hover:text-[#00afef]">
                      {item.label}
                    </span>
                  </div>
                </Link>
              );
            })}
          </nav>

          {/* User Info + Logout - merged card */}
          <div className="mt-auto pt-4">
            <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl border-2 border-blue-100 overflow-hidden shadow-sm">
              <div className="p-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#00afef] to-[#2266ff] flex items-center justify-center font-bold text-lg text-white shadow-md shrink-0">
                    {user?.nama_lengkap?.charAt(0) ||
                      user?.nama_pengguna?.charAt(0) ||
                      "U"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm text-[#0a1b3d] truncate leading-tight">
                      {user?.nama_lengkap || user?.nama_pengguna}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[11px] text-[#6b7280] truncate">
                        @{user?.nama_pengguna}
                      </span>
                      <span className="text-[9px] font-bold text-[#00afef] uppercase px-1.5 py-0.5 bg-white rounded-md shrink-0 tracking-wide">
                        {user?.role}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="w-full bg-gradient-to-r from-red-500 to-red-600 text-white px-4 py-2.5 hover:from-red-600 hover:to-red-700 transition-all font-semibold flex items-center justify-center gap-2 border-t-2 border-red-700/20"
              >
                <LogoutIcon size={18} />
                Logout
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Content Area */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Header with indicators */}
        <header className="bg-white shadow-sm sticky top-0 z-30 border-b border-gray-200">
          <div className="px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-[#0a1b3d] font-twcenmt uppercase tracking-wide">
                {computedTitle}
              </h1>
            </div>

            <div className="flex items-center gap-3">
              {/* Sync Status Component */}
              <SyncStatus className="px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-200" />
            </div>
          </div>
        </header>

        <main className="px-4 sm:px-6 lg:px-8 py-8 max-w-7xl mx-auto flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
