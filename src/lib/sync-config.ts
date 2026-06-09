export const SYNC_ENGINE_V2 = process.env.SYNC_ENGINE_V2 === "1";
export const REALTIME_PULL_ENABLED = process.env.REALTIME_PULL_ENABLED === "1";
export const WEB_SERVER_MEDIATED_ONLY =
  process.env.WEB_SERVER_MEDIATED_ONLY !== "0";
export const SYNC_WAVE = Number(process.env.SYNC_WAVE || "1");

export const CORE_SYNC_TABLES = [
  "penjualan",
  "item_penjualan",
  "penawaran",
  "item_penawaran",
  "pembelian",
  "item_pembelian",
  "purchase_orders",
  "purchase_order_items",
  "retur_penjualan",
  "item_retur_penjualan",
  "retur_pembelian",
  "item_retur_pembelian",
  "stock_opnames",
  "stock_opname_items",
  "inventory_movements",
  "production_material_consumptions",
  "keuangan",
] as const;

export const BALANCE_SYNC_TABLES = [
  "piutang_penjualan",
  "pelunasan_piutang",
  "hutang_pembelian",
  "pelunasan_hutang",
] as const;

export const MASTER_SYNC_TABLES = [
  "barang",
  "barang_roll_variants",
  "harga_barang_satuan",
  "pelanggan",
  "vendor",
  "kategori_barang",
  "subkategori_barang",
  "satuan_barang",
  "spesifikasi_cepat_barang",
  "opsi_finishing",
  "pengaturan_toko",
  "nsfp_pool",
  "lokasi",
  "accounting_periods",
] as const;

// Modul Penggajian. Urutan: master komponen dulu, lalu run sebelum
// slip/pinjaman (FK proses_gaji_id).
export const PAYROLL_SYNC_TABLES = [
  "komponen_kompensasi",
  "proses_gaji",
  "slip_gaji",
  "pinjaman_karyawan",
] as const;

export const ALL_SYNC_TABLES = [
  ...CORE_SYNC_TABLES,
  ...BALANCE_SYNC_TABLES,
  ...MASTER_SYNC_TABLES,
  ...PAYROLL_SYNC_TABLES,
] as const;

export type SyncTable = (typeof ALL_SYNC_TABLES)[number];
