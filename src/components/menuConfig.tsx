// Menu Items Configuration for MainShell
// Extracted to separate file for better code splitting and reusability

import {
  HomeIcon,
  CartIcon,
  PackageIcon,
  UsersIcon,
  BuildingIcon,
  MoneyIcon,
  ChartIcon,
  UserIcon,
  SettingsIcon,
  PrinterIcon,
} from "./icons/PageIcons";
import { BoxIcon } from "./icons/ContentIcons";
import type { UserRole } from "@/types/database";

export interface MenuItem {
  href: string;
  icon: React.ReactNode;
  label: string;
  color: string;
  /**
   * Roles that can see and access this menu item. If omitted, the item is
   * visible to every authenticated user (e.g. Dashboard).
   */
  allowedRoles?: UserRole[];
}

// Convenience role groups
const FULL_STAFF: UserRole[] = ["admin", "manager", "staff"];
const OPERATIONAL: UserRole[] = ["admin", "manager", "staff", "kasir", "operator"];
const FRONT_OF_HOUSE: UserRole[] = ["admin", "manager", "staff", "kasir"];
const ADMIN_ONLY: UserRole[] = ["admin", "manager"];

export const MENU_ITEMS: MenuItem[] = [
  {
    href: "/dashboard",
    icon: <HomeIcon size={20} />,
    label: "Dashboard",
    color: "from-[#00afef] to-[#2fd3ff]",
    // No allowedRoles -> visible to every role, including "user".
  },
  {
    href: "/pos",
    icon: <CartIcon size={20} />,
    label: "POS / Kasir",
    color: "from-[#00afef] to-[#2266ff]",
    allowedRoles: OPERATIONAL,
  },
  {
    href: "/production",
    icon: <PrinterIcon size={20} />,
    label: "Produksi",
    color: "from-amber-700 to-amber-900",
    allowedRoles: OPERATIONAL,
  },
  {
    href: "/materials",
    icon: <BoxIcon size={20} />,
    label: "Data Barang",
    color: "from-[#10b981] to-[#059669]",
    allowedRoles: FULL_STAFF,
  },
  {
    href: "/customers",
    icon: <UsersIcon size={20} />,
    label: "Pelanggan",
    color: "from-[#14b8a6] to-[#06b6d4]",
    allowedRoles: FRONT_OF_HOUSE,
  },
  {
    href: "/vendors",
    icon: <BuildingIcon size={20} />,
    label: "Vendor",
    color: "from-[#0a1b3d] to-[#2266ff]",
    allowedRoles: FULL_STAFF,
  },
  {
    href: "/purchases",
    icon: <PackageIcon size={20} />,
    label: "Pembelian",
    color: "from-[#6366f1] to-[#8b5cf6]",
    allowedRoles: FULL_STAFF,
  },
  {
    href: "/finance",
    icon: <MoneyIcon size={20} />,
    label: "Keuangan",
    color: "from-orange-500 to-pink-600",
    allowedRoles: FULL_STAFF,
  },
  {
    href: "/reports",
    icon: <ChartIcon size={20} />,
    label: "Laporan",
    color: "from-[#ff2f91] to-[#2266ff]",
    allowedRoles: FULL_STAFF,
  },
  {
    href: "/users",
    icon: <UserIcon size={20} />,
    label: "Manajemen User",
    color: "from-[#0a1b3d] to-[#00afef]",
    allowedRoles: ADMIN_ONLY,
  },
  {
    href: "/settings",
    icon: <SettingsIcon size={20} />,
    label: "Pengaturan",
    color: "from-gray-500 to-gray-600",
    allowedRoles: ADMIN_ONLY,
  },
];

export const PAGE_TITLE_MAP: { [key: string]: string } = {
  "/dashboard": "Dashboard",
  "/pos": "POS / Kasir",
  "/production": "Produksi",
  "/materials": "Data Bahan",
  "/customers": "Pelanggan",
  "/vendors": "Vendor",
  "/purchases": "Pembelian",
  "/finance": "Keuangan",
  "/reports": "Laporan",
  "/users": "Manajemen User",
  "/settings": "Pengaturan",
};

/** Find the menu item that owns a given pathname (longest prefix match). */
function findMenuForPath(pathname: string): MenuItem | undefined {
  let matched: MenuItem | undefined;
  for (const item of MENU_ITEMS) {
    if (pathname === item.href || pathname.startsWith(item.href + "/")) {
      if (!matched || item.href.length > matched.href.length) {
        matched = item;
      }
    }
  }
  return matched;
}

/**
 * Returns true if the given role can access the page that owns `pathname`.
 * Pages not registered in MENU_ITEMS (e.g. /, /auth/...) are allowed by
 * default — those are guarded elsewhere.
 */
export function canAccessPath(
  role: string | undefined | null,
  pathname: string
): boolean {
  if (!role) return false;
  const matched = findMenuForPath(pathname);
  if (!matched || !matched.allowedRoles) return true;
  return matched.allowedRoles.includes(role as UserRole);
}
