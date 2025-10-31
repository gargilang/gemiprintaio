export type UserRole = 'admin' | 'manager' | 'user';

export type CustomerType = 'individual' | 'company';

export type TransactionType = 'income' | 'expense' | 'debt' | 'receivable' | 'kasbon';

export interface Profile {
  id: string;
  email: string;
  full_name?: string;
  role: UserRole;
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
  customer_type: CustomerType;
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
  transaction_type: TransactionType;
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
  transaction_type: TransactionType;
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
  movement_type: 'in' | 'out' | 'adjustment';
  quantity: number;
  reference_type?: string;
  reference_id?: string;
  notes?: string;
  created_by?: string;
  created_at: string;
}
