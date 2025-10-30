# Quick Start - GemiPrintaIO (Pre-configured)

This project is already configured to use the "gemiprint" Supabase project.

## Project Configuration

- **Supabase Project**: gemiprint
- **Project ID**: ubhsxvhjkshggzmfgsyw
- **Project URL**: https://ubhsxvhjkshggzmfgsyw.supabase.co
- **Status**: ✅ Configured and ready to use

## Setup Steps

### 1. Install Dependencies

```bash
npm install
```

### 2. Setup Database (Required - First Time Only)

The Supabase project is currently empty. You need to run the database schema to create all necessary tables:

1. Open your Supabase dashboard: https://supabase.com/dashboard/project/ubhsxvhjkshggzmfgsyw
2. Click "SQL Editor" in the left sidebar
3. Click "New query"
4. Open the file `supabase/schema.sql` from this repository
5. Copy the entire contents (all ~600 lines)
6. Paste into the SQL Editor
7. Click "Run" to execute

This will create:
- 11 database tables
- All necessary indexes
- Row Level Security policies
- Automatic triggers

**Expected result**: You should see "Success. No rows returned" message after about 5-10 seconds.

### 3. Create Your First Admin User

After running the schema, create an admin user:

1. In Supabase dashboard, go to "Authentication" > "Users"
2. Click "Add user" > "Create new user"
3. Enter:
   - Email: your-email@example.com
   - Password: (choose a secure password)
4. Click "Create user"
5. **Copy the User ID** shown (e.g., `abc123-def456-...`)

6. Go back to "SQL Editor" and run this query (replace `YOUR_USER_ID` with the actual ID):

```sql
INSERT INTO public.profiles (id, email, full_name, role)
VALUES (
  'YOUR_USER_ID',
  'your-email@example.com',
  'Admin User',
  'admin'
);
```

### 4. Run the Application

```bash
npm run dev
```

Open http://localhost:3000 in your browser.

### 5. Login

Use the email and password you created in step 3.

## Environment Variables

The environment variables are already configured in `.env.local` and `.env.example`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://ubhsxvhjkshggzmfgsyw.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## What's Next?

After logging in, you can:

1. **Add Materials** - Go to "Data Bahan" to add products with pricing
2. **Add Customers** - Go to "Pelanggan" to add customers (individuals or companies)
3. **Add Vendors** - Go to "Vendor" to add suppliers
4. **Use POS** - Go to "POS/Kasir" to make sales transactions
5. **Track Finance** - Go to "Keuangan" to manage debts, receivables, and kasbon
6. **View Reports** - Go to "Laporan" to see financial summaries

## Troubleshooting

### "Error: relation 'public.profiles' does not exist"
- You haven't run the database schema yet. Go back to step 2.

### "Invalid login credentials"
- Make sure you created a profile entry in step 3
- Check that the email matches exactly

### "User already exists"
- The user was created but profile wasn't added
- Go to SQL Editor and run the INSERT INTO public.profiles query from step 3

### Build Errors
- Run `npm install` to ensure all dependencies are installed
- Check that `.env.local` file exists with correct credentials

## Database Schema Details

The schema includes these main tables:
- `profiles` - User accounts with roles
- `materials` - Products with 3-tier pricing
- `customers` - Customer database
- `vendors` - Supplier database
- `sales` & `sales_items` - POS transactions
- `purchases` & `purchase_items` - Purchase orders
- `financial_transactions` - Debts, receivables, kasbon
- `other_transactions` - Other income/expenses
- `inventory_movements` - Stock tracking

For detailed documentation, see DOCUMENTATION.md

## Support

If you encounter any issues:
1. Check this guide first
2. Review SETUP.md for detailed instructions
3. Check the console for error messages
4. Verify database schema was run successfully
