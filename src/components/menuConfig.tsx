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
} from "./icons/PageIcons";
import { BoxIcon } from "./icons/ContentIcons";

export interface MenuItem {
  href: string;
  icon: React.ReactNode;
  label: string;
  color: string;
  managerOnly?: boolean;
}

export const MENU_ITEMS: MenuItem[] = [
  {
    href: "/dashboard",
    icon: <HomeIcon size={20} />,
    label: "Dashboard",
    color: "from-[#00afef] to-[#2fd3ff]",
  },
  {
    href: "/pos",
    icon: <CartIcon size={20} />,
    label: "POS / Kasir",
    color: "from-[#00afef] to-[#2266ff]",
  },
  {
    href: "/materials",
    icon: <BoxIcon size={20} />,
    label: "Data Bahan",
    color: "from-[#10b981] to-[#059669]",
  },
  {
    href: "/customers",
    icon: <UsersIcon size={20} />,
    label: "Pelanggan",
    color: "from-[#14b8a6] to-[#06b6d4]",
  },
  {
    href: "/vendors",
    icon: <BuildingIcon size={20} />,
    label: "Vendor",
    color: "from-[#0a1b3d] to-[#2266ff]",
  },
  {
    href: "/purchases",
    icon: <PackageIcon size={20} />,
    label: "Pembelian",
    color: "from-[#6366f1] to-[#8b5cf6]",
  },
  {
    href: "/finance",
    icon: <MoneyIcon size={20} />,
    label: "Keuangan",
    managerOnly: true,
    color: "from-orange-500 to-pink-600",
  },
  {
    href: "/reports",
    icon: <ChartIcon size={20} />,
    label: "Laporan",
    color: "from-[#ff2f91] to-[#2266ff]",
  },
  {
    href: "/users",
    icon: <UserIcon size={20} />,
    label: "Manajemen User",
    managerOnly: true,
    color: "from-[#0a1b3d] to-[#00afef]",
  },
  {
    href: "/settings",
    icon: <SettingsIcon size={20} />,
    label: "Pengaturan",
    managerOnly: true,
    color: "from-gray-500 to-gray-600",
  },
];

export const PAGE_TITLE_MAP: { [key: string]: string } = {
  "/dashboard": "Dashboard",
  "/pos": "POS / Kasir",
  "/materials": "Data Bahan",
  "/customers": "Pelanggan",
  "/vendors": "Vendor",
  "/purchases": "Pembelian",
  "/finance": "Keuangan",
  "/reports": "Laporan",
  "/users": "Manajemen User",
  "/settings": "Pengaturan",
};
