# Flutter Riwayat Penjualan & SPK Rewrite — Design Spec

**Date:** 2026-06-16
**Status:** Approved

## Goal

Build a new Riwayat Penjualan page (sales history) and rewrite the existing SPK/Production page with Material 3 UI. Extract the POS Penawaran PDF code into a reusable shared component for invoice preview.

## Scope

| In scope | Out of scope |
|---|---|
| Riwayat Penjualan: list + search + status filter + detail sheet + void + share invoice | Edit sales, create new sales, batch void |
| SPK: list + search + status filter + detail sheet + status update | Create SPK, print SPK, cancel SPK |
| Extract shared invoice PDF widget from POS | Dark mode (deferred to Pengaturan phase) |
| Both pages: loading/empty/error states, pull-to-refresh, 401 handling | |
| Material 3 UI consistent with Pelanggan/Vendor | |

## Architecture

```
Flutter App (Riverpod + GoRouter)
├── widgets/
│   └── invoice_preview.dart           ← NEW: extracted from POS, shared component
├── features/
│   ├── pos/widgets/penawaran_preview.dart  ← MODIFY: use shared invoice_preview
│   ├── sales_history/
│   │   └── sales_history_page.dart    ← NEW: Riwayat Penjualan
│   └── production/
│       └── production_page.dart       ← REWRITE: SPK with Material 3 UI
├── services/
│   ├── pos_service.dart               ← existing (has createSale, voidSale should be added if missing)
│   └── production_service.dart        ← existing (has getOrders, updateOrderStatus, updateItemStatus)
├── models/
│   ├── sale.dart                      ← existing
│   └── production.dart                ← existing
└── providers/
    └── providers.dart                  ← unchanged
```

## Router

Add new route in `app_router.dart`:
- `/sales-history` → `SalesHistoryPage`
- Keep `/production` → `ProductionPage` (rewritten)

## UI Design (Material 3)

### Riwayat Penjualan List
- Title: "Riwayat Penjualan"
- Search: invoice number, customer name
- Filter chips: Semua | Lunas | Void
- Cards: nomor_faktur (bold), customer name, date, total (Rp formatted), payment method badge, status badge (Lunas=green, Void=red)
- Tap → detail bottom sheet
- FAB or swipe action: void (admin/manager only, with confirmation)
- Share invoice button in detail sheet → uses `InvoicePreview`

### Riwayat Penjualan Detail Sheet
- Invoice number, date, customer
- Items list: product name, qty, price, subtotal
- Additional charges (biaya_tambahan)
- Total, payment method, amount paid, change
- Status badge
- [Bagikan Invoice] button → opens InvoicePreview
- [Batalkan] button (admin/manager) → confirm → void

### SPK List
- Title: "SPK"
- Search: SPK number, customer name
- Filter chips: Semua | Menunggu | Proses | Selesai | Dibatalkan
- Cards: nomor_spk (bold), customer name, item count, status badge (color-coded), priority badge
- Tap → detail bottom sheet
- FAB: none (SPK created from POS, not manually)

### SPK Detail Sheet
- SPK number, invoice reference, customer
- Items list: product name, qty, status
- Current order status with color-coded badge
- [Lanjutkan ke Proses] / [Tandai Selesai] button (operator-role, conditional on current status)

### SPK Status Colors
| Status | Color |
|---|---|
| MENUNGGU | amber/orange |
| PROSES | blue |
| SELESAI | green |
| DIBATALKAN | red/grey |

### SPK Status Transitions
- MENUNGGU → PROSES (operator can start production)
- PROSES → SELESAI (operator can complete)

### Shared Invoice Preview Widget
- Extracted from `pos_page.dart` `_openPenawaran()` method
- File: `flutter/lib/widgets/invoice_preview.dart`
- Takes: cart items, customer info, totals
- Generates PDF and shows preview/share dialog
- Used by: POS (existing), Riwayat Penjualan (new), Riwayat Pembelian (future)

## Data Flow

### Riwayat Penjualan
1. **Load**: `posServiceProvider.getAllSales()` or new service method → GET `/api/pos/sales` or `/api/penjualan`
2. **Void**: `posServiceProvider.voidSale(id, reason)` → POST/PATCH `/api/pos/void` → cache invalidated → reload
3. **Invoice**: `InvoicePreview` widget → generates PDF client-side from sale data

### SPK
1. **Load**: `productionServiceProvider.getOrders()` → GET `/api/produksi` → cache invalidated on mutation
2. **Status update**: `productionServiceProvider.updateOrderStatus(id, status)` → PATCH `/api/produksi/$id`

## API Endpoints

| Endpoint | Method | Purpose | Status |
|---|---|---|---|
| `/api/produksi` | GET | List SPK orders | ✅ Exists |
| `/api/produksi/$id` | PATCH | Update order status | ✅ Exists |
| `/api/produksi/items/$id` | PATCH | Update item status | ✅ Exists |
| `/api/pos/sales` | GET | List sales history | ⚠️ Need to add handler |
| `/api/pos/sales/[id]` | DELETE | Void a sale | ✅ Exists |

**Note:** `getSales(limit)` exists in `pos-queries.ts` but was never wired to a REST GET handler (web app uses server actions). Flutter needs a REST endpoint — adding a 10-line GET handler to `src/app/api/pos/sales/route.ts`.

## Error Handling

| Scenario | Behavior |
|---|---|
| API 401 | Clear token, redirect to `/login` |
| API 400 (cannot void) | Show server error message |
| Network error | "Tidak dapat terhubung ke server" |
| Unknown error | "Gagal memuat data" / "Gagal membatalkan penjualan" |

## States Per Page

| State | Widget |
|---|---|
| Loading | `CircularProgressIndicator` centered |
| Empty (no data) | `EmptyState` with icon + appropriate message |
| Empty (no search results) | `EmptyState` with "Tidak ditemukan" |
| Error | Snackbar + pull-to-refresh retry |
| Data | `ListView.builder` with cards |
