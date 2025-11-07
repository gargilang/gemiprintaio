# Role Permissions - GemiPrint AIO

## Role Hierarchy & Permissions

### 👑 **Admin** (Developer)

**Full Access** - Semua fitur tanpa batasan

- ✅ Semua akses Manager
- ✅ Semua akses Chief
- ✅ Semua akses User
- ✅ Kelola pengguna (create, update, delete users)
- ✅ Konfigurasi sistem
- ✅ Database management
- ✅ Akses ke semua modul

**Username Default**: `gemi`

---

### 📊 **Manager**

**Data & Pricing Management** - Kelola data master dan harga

- ✅ Input data awal:
  - Kategori bahan
  - Subkategori bahan
  - Data vendor
  - Data pelanggan
- ✅ Ubah harga bahan
- ✅ Kelola inventory
- ✅ Lihat laporan
- ✅ Semua akses User
- ❌ Tidak bisa kelola pengguna
- ❌ Tidak bisa konfigurasi sistem

---

### 💼 **Chief**

**Financial Read-Only** - Monitoring keuangan tanpa transaksi

- ✅ Lihat dashboard keuangan
- ✅ Lihat laporan:
  - Penjualan
  - Pembelian
  - Piutang
  - Hutang
  - Arus kas
- ✅ Export laporan
- ✅ Analisis performa
- ❌ Tidak bisa tambah transaksi keuangan
- ❌ Tidak bisa ubah data transaksi
- ❌ Tidak bisa hapus transaksi
- ❌ Tidak bisa akses POS
- ❌ Tidak bisa kelola data master

**Use Case**: Owner/Supervisor yang hanya perlu monitoring tanpa operasional

---

### 👤 **User**

**Operational Only** - Operasional harian (POS & Pembelian)

- ✅ Akses POS (Point of Sale)
- ✅ Input pembelian bahan
- ✅ Tambah bahan baru
- ✅ Lihat inventory
- ❌ Tidak bisa ubah harga
- ❌ Tidak bisa hapus transaksi
- ❌ Tidak bisa lihat laporan keuangan lengkap
- ❌ Tidak bisa kelola data master

**Use Case**: Staff operasional yang handle transaksi harian

---

## Implementation Checklist

### ✅ Database Schema

- [x] Role constraint: `CHECK(role IN ('admin', 'manager', 'chief', 'user'))`
- [x] Default role: `user`

### ✅ Frontend

- [x] Dropdown role dengan deskripsi
- [x] Form validation untuk role

### 🔲 Backend (To Do)

- [ ] Middleware untuk check role permissions
- [ ] Route protection berdasarkan role
- [ ] API endpoint authorization

### 🔲 Feature Access Control (To Do)

```typescript
// Example middleware structure
const permissions = {
  admin: ["*"], // all permissions
  manager: [
    "view:all",
    "edit:materials",
    "edit:prices",
    "edit:vendors",
    "edit:customers",
  ],
  chief: ["view:financial", "export:reports"],
  user: ["pos", "purchase", "add:materials", "view:inventory"],
};
```

---

## Testing Users

| Username | Password       | Role    | Purpose                  |
| -------- | -------------- | ------- | ------------------------ |
| gemi     | 5555           | admin   | Development & Testing    |
| suri     | (set password) | manager | Testing manager features |
| Anwar    | (set password) | manager | Testing manager features |

---

## Next Steps

1. **Implement Role Middleware**

   - Create `src/middleware/checkRole.ts`
   - Add to protected API routes

2. **Update Components**

   - Hide/show features based on `currentUser.role`
   - Disable buttons for unauthorized actions

3. **Add Audit Logs**

   - Track who did what (especially for chief/manager)

4. **Testing**
   - Create test users for each role
   - Verify permissions work correctly
