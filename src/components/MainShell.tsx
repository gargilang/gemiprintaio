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
import dynamic from "next/dynamic";
import { LogoutIcon } from "./icons/PageIcons";
import { MENU_ITEMS, PAGE_TITLE_MAP } from "./menuConfig";

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

  useEffect(() => {
    try {
      const userSession = localStorage.getItem("user");
      if (!userSession) {
        // Redirect to login if not authenticated
        router.push("/auth/login");
        return;
      }
      const userData = JSON.parse(userSession);
      if (!userData.aktif_status) {
        localStorage.removeItem("user");
        router.push("/auth/login");
        return;
      }
      setUser(userData);
    } catch (e) {
      localStorage.removeItem("user");
      router.push("/auth/login");
    } finally {
      setLoading(false);
    }
  }, [router]);

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
          <p className="mt-4 text-[#0a1b3d] font-semibold">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-100 via-blue-100 to-cyan-100 flex">
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

          {/* User Info - Moved to top */}
          <div className="mb-6">
            <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-4 border-2 border-blue-100">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#00afef] to-[#2266ff] flex items-center justify-center font-bold text-xl text-white shadow-md">
                  {user?.nama_lengkap?.charAt(0) ||
                    user?.nama_pengguna?.charAt(0) ||
                    "U"}
                </div>
                <div className="flex-1">
                  <div className="font-bold text-base text-[#0a1b3d]">
                    {user?.nama_lengkap || user?.nama_pengguna}
                  </div>
                  <div className="text-xs text-[#6b7280]">
                    @{user?.nama_pengguna}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-blue-200">
                <span className="text-xs text-[#6b7280]">Role:</span>
                <span className="text-xs font-bold text-[#00afef] uppercase px-2 py-1 bg-white rounded-md">
                  {user?.role}
                </span>
              </div>
            </div>
          </div>

          {/* Navigation Menu - card-style buttons */}
          <nav ref={navRef} className="space-y-3 flex-1 overflow-y-auto">
            {MENU_ITEMS.map((item) => {
              if (
                item.managerOnly &&
                user?.role !== "admin" &&
                user?.role !== "manager" &&
                user?.role !== "chief"
              ) {
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

          {/* User Info & Logout */}
          <div className="mt-auto pt-6 border-t border-gray-200">
            <button
              onClick={handleLogout}
              className="w-full bg-gradient-to-r from-red-500 to-red-600 text-white px-4 py-3 rounded-xl hover:from-red-600 hover:to-red-700 transition-all font-semibold shadow-lg flex items-center justify-center gap-2"
            >
              <LogoutIcon size={20} />
              Logout
            </button>
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

            <div className="flex items-center gap-4">
              {/* Database Indicator */}
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
                <span className="text-lg">💾</span>
                <div className="text-left">
                  <div className="text-xs font-semibold text-[#0a1b3d]">
                    SQLite
                  </div>
                  <div className="text-xs text-[#6b7280]">Offline</div>
                </div>
              </div>

              {/* Status Indicator */}
              <div className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-lg border border-green-200">
                <span className="text-lg">⚡</span>
                <div className="text-left">
                  <div className="text-xs font-semibold text-green-700">
                    Active
                  </div>
                  <div className="text-xs text-green-600">Online</div>
                </div>
              </div>
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
