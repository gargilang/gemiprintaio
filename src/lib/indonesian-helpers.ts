// Helper functions untuk mapping antara English dan Indonesian database values

import { TipePelanggan, KategoriTransaksi } from "@/types/database";

// ============================================
// Customer Type Mapping
// ============================================

export const tipePelangganLabels: Record<TipePelanggan, string> = {
  perorangan: "Perorangan",
  perusahaan: "Perusahaan/PT",
};

export const tipePelangganOptions = [
  { value: "perorangan" as TipePelanggan, label: "Perorangan", icon: "👤" },
  { value: "perusahaan" as TipePelanggan, label: "Perusahaan/PT", icon: "🏢" },
];

// ============================================
// Transaction Category Mapping
// ============================================

export const kategoriTransaksiLabels: Record<KategoriTransaksi, string> = {
  KAS: "Kas",
  BIAYA: "Biaya",
  OMZET: "Omzet",
  INVESTOR: "Investor",
  SUBSIDI: "Subsidi",
  LUNAS: "Lunas",
  SUPPLY: "Supply",
  LABA: "Laba",
  KOMISI: "Komisi",
  TABUNGAN: "Tabungan",
  HUTANG: "Hutang",
  PIUTANG: "Piutang",
  "PRIBADI-A": "Pribadi (Tambah)",
  "PRIBADI-S": "Pribadi (Kurang)",
};

export const kategoriTransaksiIcons: Record<KategoriTransaksi, string> = {
  KAS: "💵",
  BIAYA: "💸",
  OMZET: "💰",
  INVESTOR: "👔",
  SUBSIDI: "🎁",
  LUNAS: "✅",
  SUPPLY: "📦",
  LABA: "📈",
  KOMISI: "🤝",
  TABUNGAN: "🏦",
  HUTANG: "🔴",
  PIUTANG: "🟡",
  "PRIBADI-A": "👤",
  "PRIBADI-S": "👤",
};

export const kategoriTransaksiColors: Record<KategoriTransaksi, string> = {
  KAS: "blue",
  BIAYA: "red",
  OMZET: "green",
  INVESTOR: "purple",
  SUBSIDI: "pink",
  LUNAS: "green",
  SUPPLY: "orange",
  LABA: "green",
  KOMISI: "yellow",
  TABUNGAN: "blue",
  HUTANG: "red",
  PIUTANG: "yellow",
  "PRIBADI-A": "gray",
  "PRIBADI-S": "gray",
};

export const kategoriTransaksiOptions = [
  {
    value: "KAS" as KategoriTransaksi,
    label: "Kas",
    icon: "💵",
    color: "blue",
    group: "Umum",
  },
  {
    value: "OMZET" as KategoriTransaksi,
    label: "Omzet",
    icon: "💰",
    color: "green",
    group: "Pemasukan",
  },
  {
    value: "BIAYA" as KategoriTransaksi,
    label: "Biaya",
    icon: "💸",
    color: "red",
    group: "Pengeluaran",
  },
  {
    value: "SUPPLY" as KategoriTransaksi,
    label: "Supply",
    icon: "📦",
    color: "orange",
    group: "Pengeluaran",
  },
  {
    value: "HUTANG" as KategoriTransaksi,
    label: "Hutang",
    icon: "🔴",
    color: "red",
    group: "Keuangan",
  },
  {
    value: "PIUTANG" as KategoriTransaksi,
    label: "Piutang",
    icon: "🟡",
    color: "yellow",
    group: "Keuangan",
  },
  {
    value: "LUNAS" as KategoriTransaksi,
    label: "Lunas",
    icon: "✅",
    color: "green",
    group: "Keuangan",
  },
  {
    value: "INVESTOR" as KategoriTransaksi,
    label: "Investor",
    icon: "👔",
    color: "purple",
    group: "Lainnya",
  },
  {
    value: "SUBSIDI" as KategoriTransaksi,
    label: "Subsidi",
    icon: "🎁",
    color: "pink",
    group: "Lainnya",
  },
  {
    value: "LABA" as KategoriTransaksi,
    label: "Laba",
    icon: "📈",
    color: "green",
    group: "Lainnya",
  },
  {
    value: "KOMISI" as KategoriTransaksi,
    label: "Komisi",
    icon: "🤝",
    color: "yellow",
    group: "Lainnya",
  },
  {
    value: "TABUNGAN" as KategoriTransaksi,
    label: "Tabungan",
    icon: "🏦",
    color: "blue",
    group: "Lainnya",
  },
  {
    value: "PRIBADI-A" as KategoriTransaksi,
    label: "Pribadi (Tambah)",
    icon: "👤",
    color: "gray",
    group: "Pribadi",
  },
  {
    value: "PRIBADI-S" as KategoriTransaksi,
    label: "Pribadi (Kurang)",
    icon: "👤",
    color: "gray",
    group: "Pribadi",
  },
];

// ============================================
// Helper Functions
// ============================================

export function getKategoriTransaksiLabel(kategori: KategoriTransaksi): string {
  return kategoriTransaksiLabels[kategori] || kategori;
}

export function getKategoriTransaksiIcon(kategori: KategoriTransaksi): string {
  return kategoriTransaksiIcons[kategori] || "📄";
}

export function getKategoriTransaksiColor(kategori: KategoriTransaksi): string {
  return kategoriTransaksiColors[kategori] || "gray";
}

export function getTipePelangganLabel(tipe: TipePelanggan): string {
  return tipePelangganLabels[tipe] || tipe;
}

// ============================================
// Kategori Groups untuk UI
// ============================================

export const kategoriTransaksiGroups = {
  Umum: ["KAS"],
  Pemasukan: ["OMZET"],
  Pengeluaran: ["BIAYA", "SUPPLY"],
  Keuangan: ["HUTANG", "PIUTANG", "LUNAS"],
  Lainnya: ["INVESTOR", "SUBSIDI", "LABA", "KOMISI", "TABUNGAN"],
  Pribadi: ["PRIBADI-A", "PRIBADI-S"],
};

// ============================================
// Transaction Type Analysis
// ============================================

export function isIncome(kategori: KategoriTransaksi): boolean {
  return [
    "OMZET",
    "INVESTOR",
    "SUBSIDI",
    "LABA",
    "KOMISI",
    "PIUTANG",
    "PRIBADI-A",
  ].includes(kategori);
}

export function isExpense(kategori: KategoriTransaksi): boolean {
  return ["BIAYA", "SUPPLY", "HUTANG", "PRIBADI-S"].includes(kategori);
}

export function isBalance(kategori: KategoriTransaksi): boolean {
  return ["KAS", "TABUNGAN", "LUNAS"].includes(kategori);
}

// ============================================
// CSS Classes Helper
// ============================================

export function getKategoriTransaksiClasses(kategori: KategoriTransaksi): {
  bg: string;
  text: string;
  border: string;
} {
  const colorMap: Record<string, { bg: string; text: string; border: string }> =
    {
      blue: {
        bg: "bg-blue-100",
        text: "text-blue-800",
        border: "border-blue-300",
      },
      green: {
        bg: "bg-green-100",
        text: "text-green-800",
        border: "border-green-300",
      },
      red: { bg: "bg-red-100", text: "text-red-800", border: "border-red-300" },
      yellow: {
        bg: "bg-yellow-100",
        text: "text-yellow-800",
        border: "border-yellow-300",
      },
      purple: {
        bg: "bg-purple-100",
        text: "text-purple-800",
        border: "border-purple-300",
      },
      pink: {
        bg: "bg-pink-100",
        text: "text-pink-800",
        border: "border-pink-300",
      },
      orange: {
        bg: "bg-orange-100",
        text: "text-orange-800",
        border: "border-orange-300",
      },
      gray: {
        bg: "bg-gray-100",
        text: "text-gray-800",
        border: "border-gray-300",
      },
    };

  const color = getKategoriTransaksiColor(kategori);
  return colorMap[color] || colorMap.gray;
}

// ============================================
// Format Display Helper
// ============================================

export function formatKategoriTransaksi(kategori: KategoriTransaksi): string {
  const icon = getKategoriTransaksiIcon(kategori);
  const label = getKategoriTransaksiLabel(kategori);
  return `${icon} ${label}`;
}

export function formatTipePelanggan(tipe: TipePelanggan): string {
  const option = tipePelangganOptions.find((opt) => opt.value === tipe);
  return option ? `${option.icon} ${option.label}` : tipe;
}

// ============================================
// Currency Formatting (Rupiah)
// ============================================

/**
 * Format number sebagai Rupiah (IDR)
 * @param amount - Angka yang akan diformat
 * @param includePrefix - Apakah menyertakan prefix "Rp" (default: true)
 * @returns String dengan format Rupiah, contoh: "Rp 1.234.567"
 */
export function formatRupiah(
  amount: number | string,
  includePrefix: boolean = true
): string {
  const numAmount = typeof amount === "string" ? parseFloat(amount) : amount;

  if (isNaN(numAmount)) {
    return includePrefix ? "Rp 0" : "0";
  }

  const formatted = numAmount.toLocaleString("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  return includePrefix ? `Rp ${formatted}` : formatted;
}

/**
 * Parse string Rupiah menjadi number
 * @param rupiahString - String Rupiah yang akan di-parse
 * @returns Number hasil parsing
 */
export function parseRupiah(rupiahString: string): number {
  // Remove "Rp", spaces, and dots (thousand separators)
  const cleaned = rupiahString
    .replace(/Rp/g, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(/,/g, ".");

  return parseFloat(cleaned) || 0;
}
