# Flutter Pelanggan & Vendor Rewrite — Design Spec

**Date:** 2026-06-16
**Status:** Approved
**Brainstorming mockups:** Approved (Material 3 card-based)

## Goal

Rewrite the Flutter Pelanggan (`customers_page.dart`) and Vendor (`vendors_page.dart`) pages with a clean Material 3 UI, proper error/loading states, and all DB fields. Fix the Vendor POST "unauthorized" bug. Keep the existing service layer, routing, auth, and theme unchanged.

## Scope

| In scope | Out of scope |
|---|---|
| Pelanggan list + search + filter chips + stat counters | Gradient title cards, virtual scrolling, dark mode toggle |
| Vendor list + search + filter chips + stat counters | Inline editing, bulk actions, export |
| Bottom sheet CRUD forms for both | Web-app-level complex tables |
| Delete confirmation dialog | Rebuilding other Flutter pages |
| Pull-to-refresh | |
| Loading skeleton, empty state, error state | |
| Vendor `tipe_vendor` field (currently missing in Flutter model) | |
| Fix 401 on Vendor POST | |
| Cache (already handled by ApiClient) | |

## Architecture

```
Flutter App (Riverpod + GoRouter)
├── features/customers/customers_page.dart    ← rewrite
├── features/customers/customer_form_sheet.dart ← rewrite
├── features/vendors/vendors_page.dart        ← rewrite
├── features/vendors/vendor_form_sheet.dart   ← rewrite
├── models/customer.dart                      ← minor: no changes needed (already has fields)
├── models/vendor.dart                        ← add tipe_vendor field
├── services/customers_service.dart           ← unchanged
├── services/vendors_service.dart             ← unchanged
└── providers/providers.dart                  ← unchanged
```

Calls flow: `Page → Service → ApiClient (JWT Bearer) → Next.js API → Supabase`

## UI Design (Material 3)

### Pelanggan List
- Title row: "Pelanggan" + total badge (elevated chip)
- Stat chips: Member count, Non-Member count (optional, cheap to add)
- Search bar: Material search with clear button
- Filter chips: Semua | Member | Non-Member (Wrap of `FilterChip`)
- Card list: `ListView.builder` with `RefreshIndicator`
- Each card: squircle gradient avatar (first letter), name (bold), company · phone, member badge chip, chevron →
- FAB: bottom-right, opens form sheet
- States: loading → empty state → error → data

### Pelanggan Form (Bottom Sheet)
- Header: "Tambah Pelanggan" / "Edit Pelanggan" + ✕ close
- Scrollable form fields matching DB columns:
  - Nama * (required)
  - Nama Perusahaan, Telepon & Email (side-by-side), Alamat, NPWP
  - Member toggle (Switch with subtitle)
- Footer: Batal + Simpan buttons, loading spinner while saving

### Vendor List
- Same structure as Pelanggan
- Domain color: deep-purple (`AppColors.accent` = `#2266FF`)
- Stat chips: Supplier count, Subkontraktor count, Keduanya count
- Filter chips: Semua | Supplier | Subkontraktor | Keduanya
- Each card: company name, contact person · phone, `tipe_vendor` badge

### Vendor Form
- Header: "Tambah Vendor" / "Edit Vendor" + ✕
- Fields: Nama Perusahaan *, Kontak Person, Telepon & Email, Alamat
- Tipe Vendor: segmented button (Supplier / Subkontraktor / Keduanya)
- Ketentuan Bayar, Catatan (textarea)
- Footer: Batal + Simpan

## Data Flow

1. **List load**: `Service.getAll()` → cached GET via `ApiClient` → instant paint from cache → background revalidate
2. **Create/Update**: POST/PUT → `_invalidateRelated()` busts cache → next GET is fresh
3. **Delete**: DELETE with confirmation dialog → reload list
4. **Errors**: `ApiException` → `showErrorSnackbar(context, e.message)`. 401 → redirect to `/login`

## Backend API Compatibility

| Endpoint | Method | Guard | Flutter Service |
|---|---|---|---|
| `/api/pelanggan` | GET | none | `customersService.getAll()` |
| `/api/pelanggan` | POST | `requireSession()` | `customersService.create()` |
| `/api/pelanggan` | PUT | none | `customersService.update()` |
| `/api/pelanggan?id=X` | DELETE | none | `customersService.delete()` |
| `/api/vendors` | GET | none | `vendorsService.getAll()` |
| `/api/vendors` | POST | `requireSession()` | `vendorsService.create()` |
| `/api/vendors` | PUT | none | `vendorsService.update()` |
| `/api/vendors?id=X` | DELETE | none | `vendorsService.delete()` |

**401 Fix**: The `requireSession()` guard on POST endpoints reads the JWT from `Authorization: Bearer <token>`. If the Flutter token is expired or missing, the server returns 401. Fix: ensure `authStateProvider` has a valid token, and add 401 handling in pages.

## Models

### Customer (existing — no changes needed)
```dart
class Customer {
  final String id;
  final String tipePelanggan;
  final String nama;
  final String? namaPerusahaan;
  final String? npwp;
  final String? email;
  final String? telepon;
  final String? alamat;
  final bool isMember;
}
```

### Vendor (updated — add tipeVendor)
```dart
class Vendor {
  final String id;
  final String namaPerusahaan;
  final String? email;
  final String? telepon;
  final String? alamat;
  final String? kontakPerson;
  final String? ketentuanBayar;
  final String? catatan;
  final String tipeVendor;        // "SUPPLIER" | "SUBKONTRAKTOR" | "KEDUANYA"
  final bool aktifStatus;
}
```

## Error Handling

| Scenario | Behavior |
|---|---|
| API 401 | Clear token, redirect to `/login` |
| API 400 (duplicate) | Show server error message in snackbar |
| API 400 (has transactions) | Show server error message (delete blocked) |
| Network error | "Tidak dapat terhubung ke server" snackbar |
| Unknown error | "Gagal memuat data" / "Gagal menyimpan data" snackbar |

## States Per Page

| State | Widget |
|---|---|
| Loading | `CircularProgressIndicator` centered |
| Empty (no data) | `EmptyState` with icon + "Belum ada pelanggan/vendor" + "Tambah" button |
| Empty (no search results) | `EmptyState` with "Tidak ditemukan" |
| Error | Snackbar error + retry via pull-to-refresh |
| Data | `ListView.builder` with cards |
