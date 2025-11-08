export type UserRole = "admin" | "manager" | "chief" | "user";

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
  | "PRIBADI-A" // Personal Add
  | "PRIBADI-S"; // Personal Subtract

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
  total_amount: number;
  paid_amount: number;
  change_amount: number;
  payment_method?: string;
  cashier_id?: string;
  notes?: string;
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
  material_id: string;
  movement_type: "in" | "out" | "adjustment";
  quantity: number;
  reference_type?: string;
  reference_id?: string;
  notes?: string;
  created_by?: string;
  created_at: string;
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
  kasbon_anwar: number;
  kasbon_suri: number;
  kasbon_cahaya: number;
  kasbon_dinil: number;
  bagi_hasil_anwar: number;
  bagi_hasil_suri: number;
  bagi_hasil_gemi: number;
  catatan?: string;
  dibuat_oleh?: string;
  dibuat_pada: string;
  diperbarui_pada: string;
}
