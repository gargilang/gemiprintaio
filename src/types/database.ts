export type UserRole =
  | "admin"
  | "manager"
  | "staff"
  | "kasir"
  | "operator"
  | "user"
  | "demo";

// Indonesian Types
export type TipePelanggan = "perorangan" | "perusahaan";

export type KategoriTransaksi =
  | "KAS" // Cash
  | "BIAYA" // Expense
  | "OMZET" // Revenue/Sales
  | "INVESTOR" // Investment
  | "SUBSIDI" // Subsidy
  | "LUNAS" // Paid/Settled
  | "SUPPLY" // Supply/Purchase
  | "LABA" // Profit
  | "KOMISI" // Commission
  | "TABUNGAN" // Savings
  | "HUTANG" // Debt (payable)
  | "PIUTANG" // Receivable
  | "MAKLON" // Subcontract printing payout (outbound subcontracted job)
  | "RETUR_PENJUALAN"
  | "RETUR_PENJUALAN_NONCASH"
  | "RETUR_HPP"
  | "RETUR_PEMBELIAN"
  | (string & {}); // allow dynamic categories per company

export interface Profile {
  id: string;
  username: string;
  email: string;
  full_name?: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Material {
  id: string;
  name: string;
  description?: string;
  unit: string;
  purchase_price: number;
  selling_price: number;
  member_price: number;
  stock_quantity: number;
  average_cost_per_base_unit?: number;
  roll_inventory_status?: number;
  min_stock_level: number;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  tipe_pelanggan: TipePelanggan;
  name: string;
  company_name?: string;
  tax_id?: string;
  email?: string;
  phone?: string;
  address?: string;
  is_member: boolean;
  created_at: string;
  updated_at: string;
}

export interface Vendor {
  id: string;
  name: string;
  company_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  created_at: string;
  updated_at: string;
}

export interface Sale {
  id: string;
  invoice_number: string;
  customer_id?: string;
  customer_name_snapshot?: string;
  customer_city?: string;
  total_amount: number;
  paid_amount: number;
  change_amount: number;
  payment_method?: string;
  cashier_id?: string;
  notes?: string;
  status_transaksi?: "DRAFT" | "POSTED" | "VOIDED";
  voided_at?: string | null;
  voided_by?: string | null;
  void_reason?: string | null;
  // PPN keluaran
  kena_ppn?: number;
  ppn_persen?: number;
  ppn_metode?: PpnMetode;
  dpp_total?: number;
  ppn_total?: number;
  nsfp_kode_transaksi?: string | null;
  nsfp_tahun?: string | null;
  nsfp_nomor_seri?: string | null;
  tanggal_faktur_pajak?: string | null;
  pelanggan_npwp_snapshot?: string | null;
  pelanggan_alamat_npwp_snapshot?: string | null;
  pelanggan_nama_npwp_snapshot?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  material_id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  hpp_satuan?: number;
  hpp_total?: number;
  gross_profit?: number;
  gross_margin?: number;
  panjang?: number | null;
  lebar?: number | null;
  created_at: string;
}

export interface Purchase {
  id: string;
  purchase_number: string;
  vendor_id?: string;
  total_amount: number;
  paid_amount: number;
  payment_method?: string;
  notes?: string;
  created_by?: string;
  status_transaksi?: "DRAFT" | "POSTED" | "VOIDED";
  voided_at?: string | null;
  voided_by?: string | null;
  void_reason?: string | null;
  // PPN masukan
  kena_ppn?: number;
  ppn_persen?: number;
  ppn_metode?: PpnMetode;
  dpp_total?: number;
  ppn_total?: number;
  dapat_dikreditkan?: number;
  nomor_faktur_pajak_vendor?: string | null;
  tanggal_faktur_pajak?: string | null;
  vendor_npwp_snapshot?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseItem {
  id: string;
  purchase_id: string;
  material_id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  created_at: string;
}

export interface FinancialTransaction {
  id: string;
  kategori_transaksi: KategoriTransaksi;
  reference_type?: string;
  reference_id?: string;
  customer_id?: string;
  vendor_id?: string;
  employee_id?: string;
  amount: number;
  description: string;
  is_paid: boolean;
  payment_date?: string;
  status_transaksi?: "POSTED" | "VOIDED";
  voided_at?: string | null;
  voided_by?: string | null;
  void_reason?: string | null;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface OtherTransaction {
  id: string;
  kategori_transaksi: KategoriTransaksi;
  category: string;
  amount: number;
  description: string;
  transaction_date: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface InventoryMovement {
  id: string;
  barang_id: string;
  tanggal: string;
  movement_type:
    | "OPENING_BALANCE"
    | "PURCHASE_RECEIPT"
    | "SALE_ISSUE"
    | "SALE_VOID"
    | "SALE_RETURN"
    | "PURCHASE_VOID"
    | "PURCHASE_RETURN"
    | "ADJUSTMENT"
    | "WASTE"
    | "ROLL_CONVERSION_OUT"
    | "ROLL_CONVERSION_IN"
    | "PRODUCTION_ISSUE"
    | "PRODUCTION_WASTE";
  qty_delta: number;
  unit_cost: number;
  value_delta: number;
  qty_before: number;
  qty_after: number;
  avg_cost_before: number;
  avg_cost_after: number;
  source_type: string;
  source_id: string;
  source_line_id?: string | null;
  reversal_of_id?: string | null;
  roll_variant_id?: string | null;
  roll_width_m?: number | null;
  linear_delta_m?: number | null;
  catatan?: string | null;
  dibuat_oleh?: string | null;
  dibuat_pada: string;
  diperbarui_pada?: string;
}

export interface CashBook {
  id: string;
  tanggal: string;
  kategori_transaksi: KategoriTransaksi;
  debit: number;
  kredit: number;
  keperluan?: string;
  omzet: number;
  biaya_operasional: number;
  biaya_bahan: number;
  saldo: number;
  laba_bersih: number;
  catatan?: string;
  dibuat_oleh?: string;
  dibuat_pada: string;
  diperbarui_pada: string;
}

export type PpnMetode = "EKSKLUSIF" | "INKLUSIF";

export interface PengaturanToko {
  id: string;
  nama_toko: string;
  slogan?: string | null;
  alamat?: string | null;
  telepon?: string | null;
  email?: string | null;
  website?: string | null;
  bank_nama?: string | null;
  bank_nomor?: string | null;
  bank_atas_nama?: string | null;
  catatan_faktur?: string | null;
  catatan_struk?: string | null;
  npwp?: string | null;
  alamat_npwp?: string | null;
  status_pkp: number;
  ppn_persen_default: number;
  ppn_metode_default: PpnMetode;
  ppn_default_aktif: number;
  nsfp_kode_transaksi_default: string;
  nsfp_tahun_aktif?: string | null;
  nsfp_seri_terakhir?: string | null;
  // Nomor urut faktur (invoice)
  inv_prefix?: string | null;
  inv_format?: "PREFIX-DATE-SEQ" | "PREFIX-SEQ" | null;
  inv_date_format?:
    | "YYYYMMDD"
    | "YYMMDD"
    | "DDMMYYYY"
    | "DDMMYY"
    | "YYYY-MM-DD"
    | "YYYY/MM/DD"
    | "YYYYMM"
    | "YYMM"
    | "MMYYYY"
    | "MMYY"
    | "DDMM"
    | "MMDD"
    | null;
  inv_reset?: "daily" | "monthly" | "yearly" | "never" | null;
  inv_padding?: number | null;
  inv_start_seq?: number | null;
  // Nomor urut SPK
  spk_prefix?: string | null;
  spk_format?: "PREFIX-DATE-SEQ" | "PREFIX-SEQ" | null;
  spk_date_format?:
    | "YYYYMMDD"
    | "YYMMDD"
    | "DDMMYYYY"
    | "DDMMYY"
    | "YYYY-MM-DD"
    | "YYYY/MM/DD"
    | "YYYYMM"
    | "YYMM"
    | "MMYYYY"
    | "MMYY"
    | "DDMM"
    | "MMDD"
    | null;
  spk_reset?: "daily" | "monthly" | "yearly" | "never" | null;
  spk_padding?: number | null;
  spk_start_seq?: number | null;
  dibuat_pada?: string;
  diperbarui_pada?: string;
}

export interface NsfpPool {
  id: string;
  tahun: string;
  kode_transaksi: string;
  nomor_seri: string;
  status: "TERSEDIA" | "TERPAKAI" | "BATAL";
  penjualan_id?: string | null;
  catatan?: string | null;
  dibuat_pada?: string;
  diperbarui_pada?: string;
}

export interface RollVariant {
  id: string;
  barang_id: string;
  lebar_m: number;
  panjang_tersedia_m: number;
  average_cost_per_m2: number;
  aktif_status: number;
}

export interface Penawaran {
  id: string;
  nomor_penawaran: string;
  pelanggan_id?: string | null;
  status: "DRAFT" | "SENT" | "ACCEPTED" | "CONVERTED" | "CANCELLED" | "EXPIRED";
  total_jumlah: number;
  tanggal: string;
}

export interface PurchaseOrder {
  id: string;
  nomor_po: string;
  vendor_id?: string | null;
  status: "DRAFT" | "SENT" | "PARTIAL_RECEIVED" | "RECEIVED" | "CANCELLED";
  total_jumlah: number;
  tanggal: string;
}

export interface StockOpname {
  id: string;
  nomor_opname: string;
  tanggal: string;
  status: "DRAFT" | "POSTED" | "CANCELLED";
  total_delta_qty: number;
  total_delta_value: number;
}

/**
 * Format NSFP komposit: "010.000-25.00000001". Pertimbangkan ini cuma cara
 * tampil; field nsfp_kode_transaksi/nsfp_tahun/nsfp_nomor_seri adalah sumber
 * kebenaran di database.
 */
export function formatNsfp(
  kodeTransaksi: string | null | undefined,
  tahun: string | null | undefined,
  nomorSeri: string | null | undefined,
): string {
  if (!kodeTransaksi || !tahun || !nomorSeri) return "";
  const seri8 = String(nomorSeri).padStart(8, "0");
  return `${kodeTransaksi}0.000-${tahun}.${seri8}`;
}
