"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import MainShell from "@/components/MainShell";
import {
  CartIcon,
  PackageIcon,
  UsersIcon,
  BuildingIcon,
  MoneyIcon,
  ChartIcon,
  UserIcon,
} from "@/components/icons/PageIcons";

interface User {
  id: string;
  username: string;
  email: string;
  full_name?: string;
  role: string;
  is_active: number;
}

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    try {
      const userSession = localStorage.getItem("user");
      if (userSession) setUser(JSON.parse(userSession));
    } catch {}
  }, []);

  const quickAccessItems = [
    {
      href: "/pos",
      icon: <CartIcon size={28} />,
      label: "POS / Kasir",
      color: "from-[#00afef] to-[#2fd3ff]",
      description: "Point of Sale",
    },
    {
      href: "/materials",
      icon: <PackageIcon size={28} />,
      label: "Data Bahan",
      color: "from-[#2266ff] to-[#00afef]",
      description: "Material Inventory",
    },
    {
      href: "/customers",
      icon: <UsersIcon size={28} />,
      label: "Pelanggan",
      color: "from-[#2fd3ff] to-[#00afef]",
      description: "Customer Data",
    },
    {
      href: "/vendors",
      icon: <BuildingIcon size={28} />,
      label: "Vendor",
      color: "from-[#0a1b3d] to-[#2266ff]",
      description: "Vendor Management",
    },
    {
      href: "/finance",
      icon: <MoneyIcon size={28} />,
      label: "Keuangan",
      color: "from-[#ffd400] to-[#ff2f91]",
      description: "Financial Management",
    },
    {
      href: "/reports",
      icon: <ChartIcon size={28} />,
      label: "Laporan",
      color: "from-[#ff2f91] to-[#2266ff]",
      description: "Reports & Analytics",
    },
    {
      href: "/users",
      icon: <UserIcon size={28} />,
      label: "Manajemen User",
      color: "from-[#0a1b3d] to-[#00afef]",
      description: "User Management",
      managerOnly: true,
    },
  ];

  return (
    <MainShell title="Dashboard">
      {/* Welcome Card */}
      <div className="bg-gradient-to-br from-[#00afef] to-[#2266ff] rounded-2xl shadow-lg p-8 mb-8 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold mb-2 font-twcenmt">
              Selamat Datang, {user?.full_name || user?.username}! 👋
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

      {/* Quick Access Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {quickAccessItems.map((item) => {
          // Filter based on role
          if (
            item.managerOnly &&
            user?.role !== "admin" &&
            user?.role !== "manager"
          ) {
            return null;
          }

          return (
            <Link key={item.href} href={item.href} className="group">
              <div className="bg-white rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 p-6 border-2 border-transparent hover:border-[#00afef] transform hover:-translate-y-1">
                <div className="flex items-center gap-4 mb-4">
                  <div
                    className={`w-14 h-14 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center shadow-lg text-white`}
                  >
                    {item.icon}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-[#0a1b3d] font-twcenmt group-hover:text-[#00afef] transition-colors">
                      {item.label}
                    </h3>
                    <p className="text-xs text-[#6b7280]">{item.description}</p>
                  </div>
                </div>
                <div className="flex items-center text-[#00afef] font-semibold text-sm">
                  Buka modul
                  <svg
                    className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </div>
            </Link>
          );
        })}
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
    </MainShell>
  );
}
