-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- User Roles Enum
create type user_role as enum ('admin', 'manager', 'user');

-- Customer Type Enum (Indonesian)
create type tipe_pelanggan as enum ('perorangan', 'perusahaan');

-- Transaction Category Enum (Indonesian)
create type kategori_transaksi as enum (
  'KAS',          -- Cash
  'BIAYA',        -- Expense
  'OMZET',        -- Revenue/Sales
  'INVESTOR',     -- Investment
  'SUBSIDI',      -- Subsidy
  'LUNAS',        -- Paid/Settled
  'SUPPLY',       -- Supply/Purchase
  'LABA',         -- Profit
  'KOMISI',       -- Commission
  'TABUNGAN',     -- Savings
  'HUTANG',       -- Debt (payable)
  'PIUTANG',      -- Receivable
  'PRIBADI-A',    -- Personal Add
  'PRIBADI-S'     -- Personal Subtract
);

-- Users table (extends Supabase auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  email text unique not null,
  full_name text,
  role user_role default 'user',
  is_active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Materials/Bahan table
create table public.materials (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  description text,
  unit text not null, -- unit of measurement (kg, meter, pcs, etc)
  purchase_price decimal(15,2) not null default 0,
  selling_price decimal(15,2) not null default 0,
  member_price decimal(15,2) not null default 0, -- discounted price for loyal customers
  stock_quantity decimal(15,3) not null default 0,
  min_stock_level decimal(15,3) default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Customers table
create table public.customers (
  id uuid default uuid_generate_v4() primary key,
  tipe_pelanggan tipe_pelanggan not null,
  name text not null,
  company_name text, -- for company type
  tax_id text, -- NPWP for Indonesian companies
  email text,
  phone text,
  address text,
  is_member boolean default false, -- for loyal customer status
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Vendors table
create table public.vendors (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  company_name text,
  email text,
  phone text,
  address text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Sales/POS Transactions (Penjualan)
create table public.penjualan (
  id uuid default uuid_generate_v4() primary key,
  nomor_invoice text unique not null,
  pelanggan_id uuid references public.pelanggan(id),
  total_jumlah decimal(15,2) not null,
  jumlah_dibayar decimal(15,2) not null default 0,
  jumlah_kembalian decimal(15,2) not null default 0,
  metode_pembayaran text, -- cash, transfer, etc
  kasir_id uuid references public.profil(id),
  catatan text,
  dibuat_pada timestamp with time zone default timezone('utc'::text, now()) not null,
  diperbarui_pada timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Sales Items (Item Penjualan)
create table public.item_penjualan (
  id uuid default uuid_generate_v4() primary key,
  penjualan_id uuid references public.penjualan(id) on delete cascade not null,
  bahan_id uuid references public.bahan(id) not null,
  harga_satuan_id uuid references public.harga_bahan_satuan(id), -- Reference ke harga satuan
  jumlah decimal(15,3) not null,
  nama_satuan text not null, -- Nama satuan yang digunakan
  faktor_konversi decimal(15,3) not null default 1, -- Konversi ke satuan dasar
  harga_satuan decimal(15,2) not null,
  subtotal decimal(15,2) not null,
  dibuat_pada timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Purchase Orders (Pembelian)
create table public.pembelian (
  id uuid default uuid_generate_v4() primary key,
  nomor_pembelian text unique not null,
  vendor_id uuid references public.vendor(id),
  total_jumlah decimal(15,2) not null,
  jumlah_dibayar decimal(15,2) not null default 0,
  metode_pembayaran text,
  catatan text,
  dibuat_oleh uuid references public.profil(id),
  dibuat_pada timestamp with time zone default timezone('utc'::text, now()) not null,
  diperbarui_pada timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Purchase Items (Item Pembelian)
create table public.item_pembelian (
  id uuid default uuid_generate_v4() primary key,
  pembelian_id uuid references public.pembelian(id) on delete cascade not null,
  bahan_id uuid references public.bahan(id) not null,
  harga_satuan_id uuid references public.harga_bahan_satuan(id), -- Reference ke harga satuan
  jumlah decimal(15,3) not null,
  nama_satuan text not null, -- Nama satuan yang digunakan
  faktor_konversi decimal(15,3) not null default 1, -- Konversi ke satuan dasar
  harga_satuan decimal(15,2) not null,
  subtotal decimal(15,2) not null,
  dibuat_pada timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Financial Transactions (for debts, receivables, kasbon, and other transactions)
create table public.financial_transactions (
  id uuid default uuid_generate_v4() primary key,
  kategori_transaksi kategori_transaksi not null,
  reference_type text, -- 'sale', 'purchase', 'kasbon', 'other'
  reference_id uuid, -- reference to sales, purchases, or profiles
  customer_id uuid references public.customers(id),
  vendor_id uuid references public.vendors(id),
  employee_id uuid references public.profiles(id), -- for kasbon
  amount decimal(15,2) not null,
  description text not null,
  is_paid boolean default false,
  payment_date timestamp with time zone,
  created_by uuid references public.profiles(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Additional Income/Expense (outside POS and inventory)
create table public.other_transactions (
  id uuid default uuid_generate_v4() primary key,
  kategori_transaksi kategori_transaksi not null,
  category text not null, -- e.g., 'utilities', 'rent', 'salary', 'other'
  amount decimal(15,2) not null,
  description text not null,
  transaction_date date not null,
  created_by uuid references public.profiles(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Inventory Movements (for tracking stock changes)
create table public.inventory_movements (
  id uuid default uuid_generate_v4() primary key,
  material_id uuid references public.materials(id) not null,
  movement_type text not null, -- 'in', 'out', 'adjustment'
  quantity decimal(15,3) not null,
  reference_type text, -- 'sale', 'purchase', 'adjustment'
  reference_id uuid,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security
alter table public.profiles enable row level security;
alter table public.bahan enable row level security;
alter table public.pelanggan enable row level security;
alter table public.vendor enable row level security;
alter table public.penjualan enable row level security;
alter table public.item_penjualan enable row level security;
alter table public.pembelian enable row level security;
alter table public.item_pembelian enable row level security;
alter table public.financial_transactions enable row level security;
alter table public.other_transactions enable row level security;
alter table public.inventory_movements enable row level security;

-- RLS Policies for profiles
create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- RLS Policies for materials (all authenticated users can read, only admin/manager can modify)
create policy "Authenticated users can view materials"
  on public.materials for select
  to authenticated
  using (true);

create policy "Admin and Manager can manage materials"
  on public.materials for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role in ('admin', 'manager')
    )
  );

-- RLS Policies for customers (all authenticated users can read, only admin/manager can modify)
create policy "Authenticated users can view customers"
  on public.customers for select
  to authenticated
  using (true);

create policy "Admin and Manager can manage customers"
  on public.customers for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role in ('admin', 'manager')
    )
  );

-- Similar policies for other tables
create policy "Authenticated users can view vendors"
  on public.vendors for select
  to authenticated
  using (true);

create policy "Admin and Manager can manage vendors"
  on public.vendors for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role in ('admin', 'manager')
    )
  );

-- Penjualan (Sales) policies
create policy "Authenticated users can view penjualan"
  on public.penjualan for select
  to authenticated
  using (true);

create policy "Authenticated users can create penjualan"
  on public.penjualan for insert
  to authenticated
  with check (true);

create policy "Admin and Manager can manage penjualan"
  on public.penjualan for all
  to authenticated
  using (
    exists (
      select 1 from public.profil
      where profil.id = auth.uid()
      and profil.role in ('admin', 'manager')
    )
  );

-- Item Penjualan (Sales items) policies
create policy "Authenticated users can view item penjualan"
  on public.item_penjualan for select
  to authenticated
  using (true);

create policy "Authenticated users can create item penjualan"
  on public.item_penjualan for insert
  to authenticated
  with check (true);

-- Pembelian (Purchases) policies
create policy "Authenticated users can view pembelian"
  on public.pembelian for select
  to authenticated
  using (true);

create policy "Admin and Manager can manage pembelian"
  on public.pembelian for all
  to authenticated
  using (
    exists (
      select 1 from public.profil
      where profil.id = auth.uid()
      and profil.role in ('admin', 'manager')
    )
  );

-- Item Pembelian (Purchase items) policies
create policy "Authenticated users can view item pembelian"
  on public.item_pembelian for select
  to authenticated
  using (true);

create policy "Authenticated users can create item pembelian"
  on public.item_pembelian for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role in ('admin', 'manager')
    )
  );

-- Financial transactions policies
create policy "Authenticated users can view financial transactions"
  on public.financial_transactions for select
  to authenticated
  using (true);

create policy "Admin and Manager can manage financial transactions"
  on public.financial_transactions for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role in ('admin', 'manager')
    )
  );

-- Other transactions policies
create policy "Authenticated users can view other transactions"
  on public.other_transactions for select
  to authenticated
  using (true);

create policy "Admin and Manager can manage other transactions"
  on public.other_transactions for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role in ('admin', 'manager')
    )
  );

-- Inventory movements policies
create policy "Authenticated users can view inventory movements"
  on public.inventory_movements for select
  to authenticated
  using (true);

create policy "Admin and Manager can create inventory movements"
  on public.inventory_movements for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role in ('admin', 'manager')
    )
  );

-- Create indexes for better performance
create index idx_pelanggan_nama on public.pelanggan(nama);
create index idx_pelanggan_tipe on public.pelanggan(tipe_pelanggan);
create index idx_vendor_nama on public.vendor(nama_perusahaan);
create index idx_penjualan_invoice on public.penjualan(nomor_invoice);
create index idx_penjualan_tanggal on public.penjualan(dibuat_pada);
create index idx_pembelian_nomor on public.pembelian(nomor_pembelian);
create index idx_pembelian_tanggal on public.pembelian(dibuat_pada);
create index idx_financial_transactions_kategori on public.financial_transactions(kategori_transaksi);
create index idx_financial_transactions_paid on public.financial_transactions(is_paid);
create index idx_other_transactions_kategori on public.other_transactions(kategori_transaksi);
create index idx_inventory_movements_material on public.inventory_movements(material_id);
create index idx_inventory_movements_date on public.inventory_movements(created_at);

-- Function to automatically update updated_at timestamp
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

-- Create triggers for updated_at
create trigger update_profiles_updated_at before update on public.profiles
  for each row execute function public.update_updated_at_column();

create trigger update_materials_updated_at before update on public.materials
  for each row execute function public.update_updated_at_column();

create trigger update_customers_updated_at before update on public.customers
  for each row execute function public.update_updated_at_column();

create trigger update_vendor_diperbarui_pada before update on public.vendor
  for each row execute function public.update_updated_at_column();

create trigger update_penjualan_diperbarui_pada before update on public.penjualan
  for each row execute function public.update_updated_at_column();

create trigger update_pembelian_diperbarui_pada before update on public.pembelian
  for each row execute function public.update_updated_at_column();

create trigger update_financial_transactions_updated_at before update on public.financial_transactions
  for each row execute function public.update_updated_at_column();

create trigger update_other_transactions_updated_at before update on public.other_transactions
  for each row execute function public.update_updated_at_column();
