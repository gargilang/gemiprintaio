"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";

interface User {
  id: string;
  nama_pengguna: string;
  email: string;
  nama_lengkap?: string;
  role: string;
  aktif_status: number;
}

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    try {
      const userSession = localStorage.getItem("user");
      if (userSession) setUser(JSON.parse(userSession));
    } catch {}
  }, []);

  return (
    <>
      {/* Welcome Card */}
      <div className="bg-gradient-to-br from-[#00afef] to-[#2266ff] rounded-2xl shadow-lg p-8 mb-8 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold mb-2 font-twcenmt">
              Selamat Datang, {user?.nama_lengkap || user?.nama_pengguna}! 👋
            </h2>
            <p className="text-white/90 font-twcenmt">
              Sistem Manajemen Internal gemiprint
            </p>
          </div>
          <div className="hidden md:block">
            <Image
              src="/assets/images/logo-gemiprint-white.svg"
              alt="gemiprint"
              width={80}
              height={80}
              className="opacity-40"
            />
          </div>
        </div>
      </div>

      {/* Under Development Notice */}
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="mb-6">
            <svg
              className="w-24 h-24 mx-auto text-gray-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
              />
            </svg>
          </div>
          <h3 className="text-2xl font-bold text-gray-800 mb-2">
            Dashboard Dalam Pengembangan
          </h3>
          <p className="text-gray-600 mb-8">
            Halaman dashboard sedang dalam proses pengembangan.
            <br />
            Gunakan menu navigasi untuk mengakses fitur-fitur yang tersedia.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link
              href="/pos"
              className="px-6 py-3 bg-gradient-to-r from-[#00afef] to-[#2fd3ff] text-white rounded-xl font-semibold hover:shadow-lg transition-all"
            >
              Buka POS
            </Link>
            <Link
              href="/production"
              className="px-6 py-3 bg-gradient-to-r from-amber-700 to-amber-900 text-white rounded-xl font-semibold hover:shadow-lg transition-all"
            >
              Lihat Produksi
            </Link>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="mt-12 text-center">
        <p className="text-[#6b7280] text-sm">
          <span className="font-bauhaus italic">
            <span className="text-[#00afef]">gemi</span>
            <span className="text-[#0a1b3d]">print</span>
          </span>{" "}
          - All-in-One Management System © 2025
        </p>
      </div>
    </>
  );
}
