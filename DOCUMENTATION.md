# Dokumentasi API & Struktur Data

## Database Schema

### Tabel: profiles
Menyimpan data profil pengguna dengan role mereka.

**Kolom:**
- `id` (UUID) - Primary key, referensi ke auth.users
- `email` (TEXT) - Email pengguna (unique)
- `full_name` (TEXT) - Nama lengkap
- `role` (user_role) - Role: 'admin', 'manager', 'user'
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

### Tabel: materials
Menyimpan data bahan/material dengan multi-tier pricing.

**Kolom:**
- `id` (UUID) - Primary key
- `name` (TEXT) - Nama bahan
- `description` (TEXT) - Deskripsi
- `unit` (TEXT) - Satuan (kg, meter, pcs, dll)
- `purchase_price` (DECIMAL) - Harga beli
- `selling_price` (DECIMAL) - Harga jual reguler
- `member_price` (DECIMAL) - Harga untuk member
- `stock_quantity` (DECIMAL) - Jumlah stok
- `min_stock_level` (DECIMAL) - Batas minimum stok
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

### Tabel: customers
Menyimpan data pelanggan (perorangan dan perusahaan).

**Kolom:**
- `id` (UUID) - Primary key
- `customer_type` (customer_type) - 'individual' atau 'company'
- `name` (TEXT) - Nama lengkap/kontak
- `company_name` (TEXT) - Nama perusahaan (untuk type company)
- `tax_id` (TEXT) - NPWP
- `email` (TEXT)
- `phone` (TEXT)
- `address` (TEXT)
- `is_member` (BOOLEAN) - Status member/pelanggan setia
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

### Tabel: vendors
Menyimpan data vendor/supplier.

**Kolom:**
- `id` (UUID) - Primary key
- `name` (TEXT) - Nama kontak
- `company_name` (TEXT) - Nama perusahaan
- `email` (TEXT)
- `phone` (TEXT)
- `address` (TEXT)
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

### Tabel: sales
Header transaksi penjualan dari POS.

**Kolom:**
- `id` (UUID) - Primary key
- `invoice_number` (TEXT) - Nomor invoice (unique)
- `customer_id` (UUID) - Referensi ke customers (nullable)
- `total_amount` (DECIMAL) - Total penjualan
- `paid_amount` (DECIMAL) - Jumlah yang dibayar
- `change_amount` (DECIMAL) - Kembalian
- `payment_method` (TEXT) - Metode pembayaran
- `cashier_id` (UUID) - Referensi ke profiles
- `notes` (TEXT)
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

### Tabel: sales_items
Detail item dalam transaksi penjualan.

**Kolom:**
- `id` (UUID) - Primary key
- `sale_id` (UUID) - Referensi ke sales
- `material_id` (UUID) - Referensi ke materials
- `quantity` (DECIMAL) - Jumlah
- `unit_price` (DECIMAL) - Harga per unit
- `subtotal` (DECIMAL) - Subtotal
- `created_at` (TIMESTAMP)

### Tabel: purchases
Header transaksi pembelian dari vendor.

**Kolom:**
- `id` (UUID) - Primary key
- `purchase_number` (TEXT) - Nomor pembelian (unique)
- `vendor_id` (UUID) - Referensi ke vendors
- `total_amount` (DECIMAL) - Total pembelian
- `paid_amount` (DECIMAL) - Jumlah yang dibayar
- `payment_method` (TEXT)
- `notes` (TEXT)
- `created_by` (UUID) - Referensi ke profiles
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

### Tabel: purchase_items
Detail item dalam transaksi pembelian.

**Kolom:**
- `id` (UUID) - Primary key
- `purchase_id` (UUID) - Referensi ke purchases
- `material_id` (UUID) - Referensi ke materials
- `quantity` (DECIMAL) - Jumlah
- `unit_price` (DECIMAL) - Harga per unit
- `subtotal` (DECIMAL) - Subtotal
- `created_at` (TIMESTAMP)

### Tabel: financial_transactions
Transaksi keuangan (hutang, piutang, kasbon).

**Kolom:**
- `id` (UUID) - Primary key
- `transaction_type` (transaction_type) - 'debt', 'receivable', 'kasbon'
- `reference_type` (TEXT) - Tipe referensi
- `reference_id` (UUID) - ID referensi
- `customer_id` (UUID) - Referensi ke customers
- `vendor_id` (UUID) - Referensi ke vendors
- `employee_id` (UUID) - Referensi ke profiles (untuk kasbon)
- `amount` (DECIMAL) - Jumlah
- `description` (TEXT) - Keterangan
- `is_paid` (BOOLEAN) - Status pelunasan
- `payment_date` (TIMESTAMP) - Tanggal pelunasan
- `created_by` (UUID) - Referensi ke profiles
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

### Tabel: other_transactions
Pemasukan dan pengeluaran di luar POS dan inventori.

**Kolom:**
- `id` (UUID) - Primary key
- `transaction_type` (transaction_type) - 'income' atau 'expense'
- `category` (TEXT) - Kategori transaksi
- `amount` (DECIMAL) - Jumlah
- `description` (TEXT) - Keterangan
- `transaction_date` (DATE) - Tanggal transaksi
- `created_by` (UUID) - Referensi ke profiles
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

### Tabel: inventory_movements
Tracking pergerakan stok.

**Kolom:**
- `id` (UUID) - Primary key
- `material_id` (UUID) - Referensi ke materials
- `movement_type` (TEXT) - 'in', 'out', 'adjustment'
- `quantity` (DECIMAL) - Jumlah pergerakan
- `reference_type` (TEXT) - Tipe referensi
- `reference_id` (UUID) - ID referensi
- `notes` (TEXT) - Catatan
- `created_by` (UUID) - Referensi ke profiles
- `created_at` (TIMESTAMP)

## Row Level Security (RLS) Policies

### Akses Berdasarkan Role

**Admin & Manager:**
- Full access ke semua tabel
- Dapat create, read, update, delete

**User:**
- Dapat melakukan transaksi POS
- Dapat melihat data materials, customers, vendors
- Tidak dapat mengubah data master

### Policy Details

Setiap tabel memiliki policies yang membatasi akses berdasarkan:
1. Authenticated user
2. User role (dari tabel profiles)
3. Ownership (untuk data pribadi)

## Supabase Client Usage

### Initialize Client

```typescript
import { supabase } from '@/lib/supabase';
```

### Authentication

```typescript
// Sign in
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password'
});

// Get current user
const { data: { user } } = await supabase.auth.getUser();

// Sign out
await supabase.auth.signOut();
```

### CRUD Operations

```typescript
// Create
const { data, error } = await supabase
  .from('materials')
  .insert({ name: 'Kertas HVS', unit: 'rim' });

// Read
const { data, error } = await supabase
  .from('materials')
  .select('*')
  .order('name');

// Update
const { data, error } = await supabase
  .from('materials')
  .update({ stock_quantity: 100 })
  .eq('id', materialId);

// Delete
const { data, error } = await supabase
  .from('materials')
  .delete()
  .eq('id', materialId);
```

## Business Logic

### POS Transaction Flow

1. User selects customer (optional)
2. User adds materials to cart
3. System calculates price based on customer type:
   - Member: uses `member_price`
   - Non-member: uses `selling_price`
4. User enters paid amount
5. System calculates change
6. On checkout:
   - Create sale record
   - Create sale_items records
   - Update material stock
   - Create inventory_movements records

### Inventory Management

Stok material di-update otomatis ketika:
1. Transaksi penjualan (stok berkurang)
2. Pembelian dari vendor (stok bertambah)
3. Adjustment manual

Setiap perubahan stok dicatat di `inventory_movements`.

### Financial Reports

Reports menghitung:
1. **Total Sales**: Sum dari sales.total_amount
2. **Profit**: Sales - (Materials cost × quantity sold)
3. **Inventory Value**: Sum dari (material.stock × material.purchase_price)
4. **Outstanding Debts**: financial_transactions WHERE type='debt' AND not paid
5. **Outstanding Receivables**: financial_transactions WHERE type='receivable' AND not paid
6. **Outstanding Kasbon**: financial_transactions WHERE type='kasbon' AND not paid
7. **Other Income/Expense**: Sum dari other_transactions

## TypeScript Types

Semua types tersedia di `src/types/database.ts` dan match dengan database schema.

```typescript
import { Material, Customer, Sale } from '@/types/database';
```

## Best Practices

1. **Always check authentication** di setiap page
2. **Use transactions** untuk operasi multi-step (POS checkout)
3. **Validate input** di frontend dan backend (RLS)
4. **Handle errors gracefully** dengan user-friendly messages
5. **Keep inventory movements** untuk audit trail
6. **Use indexes** untuk queries yang sering digunakan
7. **Regular backup** database melalui Supabase dashboard

## Performance Tips

1. Use `.select()` dengan specific columns jika tidak perlu semua data
2. Implementasi pagination untuk list yang panjang
3. Add indexes untuk kolom yang sering di-query
4. Cache data yang jarang berubah di client side
5. Use Supabase Realtime untuk live updates (optional future enhancement)
