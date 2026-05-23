export const SYNC_ENGINE_V2 = process.env.SYNC_ENGINE_V2 === "1";
export const REALTIME_PULL_ENABLED = process.env.REALTIME_PULL_ENABLED === "1";
export const WEB_SERVER_MEDIATED_ONLY =
  process.env.WEB_SERVER_MEDIATED_ONLY !== "0";
export const SYNC_WAVE = Number(process.env.SYNC_WAVE || "1");

export const CORE_SYNC_TABLES = [
  "penjualan",
  "item_penjualan",
  "pembelian",
  "item_pembelian",
  "inventory_movements",
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
  "harga_barang_satuan",
  "pelanggan",
  "vendor",
  "kategori_barang",
  "subkategori_barang",
  "satuan_barang",
  "spesifikasi_cepat_barang",
  "opsi_finishing",
] as const;

export const ALL_SYNC_TABLES = [
  ...CORE_SYNC_TABLES,
  ...BALANCE_SYNC_TABLES,
  ...MASTER_SYNC_TABLES,
] as const;

export type SyncTable = (typeof ALL_SYNC_TABLES)[number];
