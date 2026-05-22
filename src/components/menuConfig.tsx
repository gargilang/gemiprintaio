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
  RelationsIcon,
  InventoryIcon,
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

export interface MenuGroup {
  kind: "group";
  id: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  children: MenuItem[];
}

export type MenuEntry = MenuItem | MenuGroup;

export function isMenuGroup(entry: MenuEntry): entry is MenuGroup {
  return "kind" in entry && (entry as MenuGroup).kind === "group";
}

/** Flatten leaf links for access checks and route matching. */
export function* iterateMenuLeaves(
  entries: MenuEntry[]
): Generator<MenuItem, void, unknown> {
  for (const entry of entries) {
    if (isMenuGroup(entry)) {
      for (const child of entry.children) {
        yield child;
      }
    } else {
      yield entry;
    }
  }
}

// Convenience role groups
const FULL_STAFF: UserRole[] = ["admin", "manager", "staff"];
const OPERATIONAL: UserRole[] = ["admin", "manager", "staff", "kasir", "operator"];
const FRONT_OF_HOUSE: UserRole[] = ["admin", "manager", "staff", "kasir"];
const ADMIN_ONLY: UserRole[] = ["admin", "manager"];

export const MENU_ENTRIES: MenuEntry[] = [
  {
    href: "/dashboard",
    icon: <HomeIcon size={18} />,
    label: "Dashboard",
    color: "from-[#00afef] to-[#2fd3ff]",
    // No allowedRoles -> visible to every role, including "user".
  },
  {
    href: "/pos",
    icon: <CartIcon size={18} />,
    label: "POS / Kasir",
    color: "from-[#00afef] to-[#2266ff]",
    allowedRoles: OPERATIONAL,
  },
  {
    href: "/production",
    icon: <PrinterIcon size={18} />,
    label: "Produksi",
    color: "from-amber-700 to-amber-900",
    allowedRoles: OPERATIONAL,
  },
  {
    kind: "group",
    id: "inventori",
    label: "Inventori",
    icon: <InventoryIcon size={18} />,
    color: "from-[#10b981] to-[#6366f1]",
    children: [
      {
        href: "/materials",
        icon: <BoxIcon size={18} />,
        label: "Data Barang",
        color: "from-[#10b981] to-[#059669]",
        allowedRoles: FULL_STAFF,
      },
      {
        href: "/purchases",
        icon: <PackageIcon size={18} />,
        label: "Pembelian",
        color: "from-[#6366f1] to-[#8b5cf6]",
        allowedRoles: FULL_STAFF,
      },
    ],
  },
  {
    kind: "group",
    id: "relasi",
    label: "Relasi",
    icon: <RelationsIcon size={18} />,
    color: "from-[#14b8a6] to-[#0a1b3d]",
    children: [
      {
        href: "/customers",
        icon: <UsersIcon size={18} />,
        label: "Pelanggan",
        color: "from-[#14b8a6] to-[#06b6d4]",
        allowedRoles: FRONT_OF_HOUSE,
      },
      {
        href: "/vendors",
        icon: <BuildingIcon size={18} />,
        label: "Vendor",
        color: "from-[#0a1b3d] to-[#2266ff]",
        allowedRoles: FULL_STAFF,
      },
    ],
  },
  {
    kind: "group",
    id: "laporan",
    label: "Laporan & Keuangan",
    icon: <ChartIcon size={18} />,
    color: "from-[#ff2f91] to-orange-500",
    children: [
      {
        href: "/reports",
        icon: <ChartIcon size={18} />,
        label: "Laporan",
        color: "from-[#ff2f91] to-[#2266ff]",
        allowedRoles: FULL_STAFF,
      },
      {
        href: "/finance",
        icon: <MoneyIcon size={18} />,
        label: "Keuangan",
        color: "from-orange-500 to-pink-600",
        allowedRoles: FULL_STAFF,
      },
    ],
  },
  {
    kind: "group",
    id: "pengaturan",
    label: "Pengaturan",
    icon: <SettingsIcon size={18} />,
    color: "from-gray-500 to-[#0a1b3d]",
    children: [
      {
        href: "/settings",
        icon: <SettingsIcon size={18} />,
        label: "Umum",
        color: "from-gray-500 to-gray-600",
        allowedRoles: ADMIN_ONLY,
      },
      {
        href: "/users",
        icon: <UserIcon size={18} />,
        label: "Manajemen User",
        color: "from-[#0a1b3d] to-[#00afef]",
        allowedRoles: ADMIN_ONLY,
      },
    ],
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
  for (const item of iterateMenuLeaves(MENU_ENTRIES)) {
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
 * Pages not registered under MENU_ENTRIES leaves (e.g. /, /auth/...) are allowed by
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
