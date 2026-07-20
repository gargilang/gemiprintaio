// Konfigurasi menu untuk MainShell.
// Dipisahkan agar code splitting dan pemakaian ulang lebih mudah.

import {
  HomeIcon,
  CartIcon,
  PurchaseOrderIcon,
  UsersIcon,
  BuildingIcon,
  MoneyIcon,
  ChartIcon,
  AuditLogIcon,
  UserIcon,
  SettingsIcon,
  PackageIcon,
  PrinterIcon,
  RelationsIcon,
  InventoryIcon,
  SparklesIcon,
  QuotationIcon,
  SalesReturnIcon,
  PurchaseReturnIcon,
  DebtIcon,
  StockAdjustmentIcon,
  StockOpnameIcon,
  MovementLedgerIcon,
  PurchaseOrderFlowIcon,
} from "./icons/PageIcons";
import { BoxIcon } from "./icons/ContentIcons";
import type { UserRole } from "@/types/database";

export interface MenuItem {
  href: string;
  icon: React.ReactNode;
  label: string;
  color: string;
  /**
   * Role yang bisa melihat dan membuka menu ini. Jika kosong, menu terlihat
   * untuk semua pengguna yang sudah login.
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

/** Ratakan link daun untuk pemeriksaan akses dan pencocokan route. */
export function* iterateMenuLeaves(
  entries: MenuEntry[],
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

// Grup role praktis untuk aturan akses menu.
// "demo" disertakan di semua grup sehingga pengguna demo dapat melihat
// seluruh menu (akses baca penuh), meskipun mutasi tetap diblokir di API.
const FULL_STAFF: UserRole[] = ["admin", "manager", "staff", "demo"];
const OPERATIONAL: UserRole[] = [
  "admin",
  "manager",
  "staff",
  "kasir",
  "operator",
  "demo",
];
const FRONT_OF_HOUSE: UserRole[] = [
  "admin",
  "manager",
  "staff",
  "kasir",
  "demo",
];
// Kasir dapat mengakses halaman transaksi penjualan + pembelian penuh,
// namun tidak ke laporan keuangan, penggajian, dan pengaturan.
const KASIR_PLUS: UserRole[] = [
  "admin",
  "manager",
  "staff",
  "kasir",
  "demo",
];
// Pesanan Pembelian: operator butuh ini untuk tindak lanjut restock.
const PURCHASE_ORDER_ACCESS: UserRole[] = [
  "admin",
  "manager",
  "staff",
  "kasir",
  "operator",
  "demo",
];
const ADMIN_ONLY: UserRole[] = ["admin", "manager", "demo"];

export const MENU_ENTRIES: MenuEntry[] = [
  {
    href: "/beranda",
    icon: <HomeIcon size={18} />,
    label: "Beranda",
    color: "from-[#00afef] to-[#2fd3ff]",
    // Tanpa allowedRoles berarti terlihat untuk semua role, termasuk "user".
  },
  {
    kind: "group",
    id: "penjualan",
    label: "Penjualan",
    icon: <CartIcon size={18} />,
    color: "from-[#00afef] to-[#2266ff]",
    children: [
      {
        href: "/pos",
        icon: <CartIcon size={18} />,
        label: "POS / Kasir",
        color: "from-[#00afef] to-[#2266ff]",
        allowedRoles: OPERATIONAL,
      },
      {
        href: "/surat-jalan",
        icon: <PurchaseOrderIcon size={18} />,
        label: "Surat Jalan",
        color: "from-[#0a1b3d] to-[#00afef]",
        allowedRoles: FRONT_OF_HOUSE,
      },
      {
        href: "/penawaran",
        icon: <QuotationIcon size={18} />,
        label: "Penawaran",
        color: "from-cyan-500 to-blue-600",
        allowedRoles: FRONT_OF_HOUSE,
      },
      {
        href: "/retur-penjualan",
        icon: <SalesReturnIcon size={18} />,
        label: "Retur Penjualan",
        color: "from-rose-500 to-pink-600",
        allowedRoles: KASIR_PLUS,
      },
      {
        href: "/piutang",
        icon: <MoneyIcon size={18} />,
        label: "Piutang",
        color: "from-emerald-500 to-teal-600",
        allowedRoles: KASIR_PLUS,
      },
    ],
  },
  {
    kind: "group",
    id: "produksi",
    label: "Produksi",
    icon: <PackageIcon size={18} />,
    color: "from-[#ef4444] to-[#dc2626]",
    children: [
      {
        href: "/produksi/spk",
        icon: <PrinterIcon size={18} />,
        label: "SPK",
        color: "from-[#f97316] to-[#dc2626]",
        allowedRoles: OPERATIONAL,
      },
      {
        href: "/produksi/pengambilan",
        icon: <PackageIcon size={18} />,
        label: "Pengambilan",
        color: "from-amber-500 to-red-600",
        allowedRoles: OPERATIONAL,
      },
      {
        href: "/produksi/ai-prompt",
        icon: <SparklesIcon size={18} />,
        label: "Prompt AI",
        color: "from-[#00afef] to-[#dc2626]",
        allowedRoles: OPERATIONAL,
      },
    ],
  },
  {
    kind: "group",
    id: "pembelian",
    label: "Pembelian",
    icon: <PurchaseOrderIcon size={18} />,
    color: "from-[#6366f1] to-[#8b5cf6]",
    children: [
      {
        href: "/pembelian",
        icon: <PurchaseOrderIcon size={18} />,
        label: "Pembelian",
        color: "from-[#6366f1] to-[#8b5cf6]",
        allowedRoles: KASIR_PLUS,
      },
      {
        href: "/retur-pembelian",
        icon: <PurchaseReturnIcon size={18} />,
        label: "Retur Pembelian",
        color: "from-amber-500 to-orange-600",
        allowedRoles: FULL_STAFF,
      },
      {
        href: "/pesanan-pembelian",
        icon: <PurchaseOrderFlowIcon size={18} />,
        label: "Pesanan Pembelian",
        color: "from-indigo-500 to-violet-600",
        allowedRoles: PURCHASE_ORDER_ACCESS,
      },
      {
        href: "/hutang",
        icon: <DebtIcon size={18} />,
        label: "Hutang",
        color: "from-rose-500 to-orange-500",
        allowedRoles: FULL_STAFF,
      },
    ],
  },
  {
    kind: "group",
    id: "inventori",
    label: "Inventori",
    icon: <InventoryIcon size={18} />,
    color: "from-[#10b981] to-[#059669]",
    children: [
      {
        href: "/barang",
        icon: <BoxIcon size={18} />,
        label: "Data Barang",
        color: "from-[#10b981] to-[#059669]",
        allowedRoles: FULL_STAFF,
      },
      {
        href: "/katalog-maklon",
        icon: <PrinterIcon size={18} />,
        label: "Katalog Extra",
        color: "from-violet-600 to-purple-700",
        allowedRoles: FULL_STAFF,
      },
      {
        href: "/inventori/adjustments",
        icon: <StockAdjustmentIcon size={18} />,
        label: "Penyesuaian Stok",
        color: "from-amber-500 to-orange-600",
        allowedRoles: FULL_STAFF,
      },
      {
        href: "/inventori/opname",
        icon: <StockOpnameIcon size={18} />,
        label: "Opname Stok",
        color: "from-lime-500 to-emerald-600",
        allowedRoles: FULL_STAFF,
      },
      {
        href: "/inventori/movements",
        icon: <MovementLedgerIcon size={18} />,
        label: "Riwayat Mutasi Stok",
        color: "from-slate-600 to-slate-800",
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
        href: "/pelanggan",
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
        allowedRoles: KASIR_PLUS,
      },
    ],
  },
  {
    kind: "group",
    id: "laporan",
    label: "Administrasi",
    icon: <MoneyIcon size={18} />,
    color: "from-[#ff2f91] to-orange-500",
    children: [
      {
        href: "/keuangan",
        icon: <MoneyIcon size={18} />,
        label: "Keuangan",
        color: "from-orange-500 to-pink-600",
        allowedRoles: FULL_STAFF,
      },
      {
        href: "/penggajian",
        icon: <UsersIcon size={18} />,
        label: "Karyawan",
        color: "from-indigo-500 to-emerald-500",
        allowedRoles: FULL_STAFF,
      },
      {
        href: "/aktivitas",
        icon: <AuditLogIcon size={18} />,
        label: "Log Audit",
        color: "from-slate-600 to-slate-700",
        allowedRoles: ADMIN_ONLY,
      },
      {
        href: "/laporan",
        icon: <ChartIcon size={18} />,
        label: "Laporan",
        color: "from-[#ff2f91] to-[#2266ff]",
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
        href: "/pengaturan",
        icon: <SettingsIcon size={18} />,
        label: "Umum",
        color: "from-gray-500 to-gray-600",
        allowedRoles: ADMIN_ONLY,
      },
      {
        href: "/pengaturan/notifikasi",
        icon: <AuditLogIcon size={18} />,
        label: "Notifikasi",
        color: "from-slate-600 to-slate-900",
        allowedRoles: ADMIN_ONLY,
      },
      {
        href: "/pengguna",
        icon: <UserIcon size={18} />,
        label: "Manajemen Pengguna",
        color: "from-[#0a1b3d] to-[#00afef]",
        allowedRoles: ADMIN_ONLY,
      },
    ],
  },
];

export const PAGE_TITLE_MAP: { [key: string]: string } = {
  "/beranda": "Beranda",
  "/pos": "POS / Kasir",
  "/surat-jalan": "Surat Jalan",
  "/penawaran": "Penawaran",
  "/katalog-maklon": "Katalog Extra",
  "/retur-penjualan": "Retur Penjualan",
  "/piutang": "Piutang",
  "/produksi": "Produksi",
  "/produksi/spk": "SPK",
  "/produksi/pengambilan": "Pengambilan",
  "/produksi/ai-prompt": "Prompt AI",
  "/barang": "Data Barang",
  "/inventori/adjustments": "Penyesuaian Stok",
  "/inventori/opname": "Opname Stok",
  "/inventori/movements": "Riwayat Mutasi Stok",
  "/pelanggan": "Pelanggan",
  "/vendors": "Vendor",
  "/pembelian": "Pembelian",
  "/retur-pembelian": "Retur Pembelian",
  "/pesanan-pembelian": "Pesanan Pembelian",
  "/hutang": "Hutang",
  "/keuangan": "Keuangan",
  "/penggajian": "Karyawan",
  "/laporan": "Laporan",
  "/laporan-ppn": "Laporan PPN",
  "/aktivitas": "Log Audit",
  "/pengguna": "Manajemen Pengguna",
  "/pengaturan/notifikasi": "Notifikasi",
  "/pengaturan": "Pengaturan",
};

const HIDDEN_ROUTE_ACCESS: Record<string, UserRole[]> = {
  "/laporan-ppn": ADMIN_ONLY,
};

/** Cari menu pemilik pathname dengan prefix terpanjang. */
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
 * Mengembalikan true jika role boleh membuka halaman pemilik `pathname`.
 * Halaman yang tidak terdaftar di MENU_ENTRIES (mis. / atau /auth/...) tetap
 * diizinkan karena guard-nya ada di tempat lain.
 */
export function canAccessPath(
  role: string | undefined | null,
  pathname: string,
): boolean {
  if (!role) return false;
  const hiddenRoles = Object.entries(HIDDEN_ROUTE_ACCESS).find(
    ([path]) => pathname === path || pathname.startsWith(path + "/"),
  )?.[1];
  if (hiddenRoles) return hiddenRoles.includes(role as UserRole);
  const matched = findMenuForPath(pathname);
  if (!matched || !matched.allowedRoles) return true;
  return matched.allowedRoles.includes(role as UserRole);
}
