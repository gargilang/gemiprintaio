# Flutter Pembelian + Riwayat Pembelian + Receivables — Design Spec

**Date:** 2026-06-16
**Status:** Approved

## Goal

Rewrite the Pembelian purchase form with Material 3 UI, build a new Riwayat Pembelian page (purchase history), and add receivable payment/revert to the existing Riwayat Penjualan page.

## Scope

| In scope | Out of scope |
|---|---|
| Pembelian: vendor picker, item lines with dimensions, payment method, push page form | Inline vendor creation, inline material creation |
| Riwayat Pembelian: list + search + filter + detail sheet + void + pay debt | Create new purchases (handled by Pembelian page) |
| Receivables: add to Riwayat Penjualan — pay + revert | Full accounting ledger |
| Material 3 UI consistent with other pages | Dark mode |

## Architecture

```
Flutter App (Riverpod + GoRouter)
├── features/purchases/
│   └── purchase_form_page.dart       ← REWRITE: Material 3, push page
├── features/purchase_history/
│   └── purchase_history_page.dart    ← NEW: Riwayat Pembelian
├── features/sales_history/
│   └── sales_history_page.dart       ← MODIFY: add receivables tab/section
├── services/
│   ├── purchases_service.dart        ← existing (has getAll, create, delete, getDebts, payDebt)
│   ├── pos_service.dart              ← existing (has getReceivables, payReceivable, revertPayment)
│   └── vendors_service.dart          ← existing (getAll for vendor picker)
└── providers/providers.dart          ← unchanged
```

## Router

Add route in `app_router.dart`:
- `/purchase-history` → `PurchaseHistoryPage`

Add menu item in `app_shell.dart`:
- "Riwayat Pembelian" under Pembelian group

## UI Design

### Pembelian Form (Push Page)
- Full page with Material 3 styling
- **Vendor picker**: search + select from existing vendors (calls `vendorsService.getAll()`)
- **Item lines**: add/remove line items. Each line: material picker, qty, harga beli, dimensions (panjang × lebar for roll items). Auto-calculate subtotal
- **Payment section**: metode pembayaran (CASH/TRANSFER/NET30), jumlah dibayar
- **Submit**: validates → `purchasesService.create()` → success snackbar → pop back
- Loading state while submitting

### Riwayat Pembelian (List Page)
- Same Material 3 pattern as Riwayat Penjualan
- Title "Riwayat Pembelian" + total badge
- Search: nomor_pembelian, vendor name
- Filter chips: Semua | Lunas | Hutang | Void
- Cards: nomor_pembelian (bold), vendor name, total (Rp), payment status badge (LUNAS=green, HUTANG=red, SEBAGIAN=amber, VOID=grey), date
- Tap → detail bottom sheet
- Pull-to-refresh, loading/empty/error states, 401 handling

### Riwayat Pembelian Detail Sheet
- Nomor pembelian, vendor, date
- Items list: product name, qty × price, subtotal
- Total, status badge, amount paid
- If HUTANG/SEBAGIAN: [Bayar Hutang] button → pay dialog
- If not VOID: [Batalkan] button (admin/manager) → confirm → void

### Pay Debt Dialog
- Simple dialog: enter amount (numeric), Bayar button
- Calls `purchasesService.payDebt()`

### Receivables in Riwayat Penjualan (Modification)
- Add second tab or section at top: "Piutang" filter
- List receivables: customer name, sale reference, amount owed
- Tap → pay receivable dialog
- Pay dialog: amount field → `posService.payReceivable()`
- Revert button on paid receivables → confirm → `posService.revertPayment()`

## API Endpoints

| Endpoint | Method | Purpose | Status |
|---|---|---|---|
| `/api/pembelian` | GET | List purchases | ✅ Exists |
| `/api/pembelian` | POST | Create purchase | ✅ Exists |
| `/api/pembelian/$id` | DELETE | Void purchase | ✅ Exists |
| `/api/pembelian/debts` | GET | List debts | ✅ Exists |
| `/api/pembelian/pay-debt` | POST | Pay debt | ✅ Exists |
| `/api/pos/receivables` | GET | List receivables | ✅ Exists |
| `/api/pos/pay-receivable` | POST | Pay receivable | ✅ Exists |
| `/api/pos/sales/revert-payment` | POST | Revert payment | ✅ Exists |
| `/api/vendors` | GET | List vendors | ✅ Exists |

**No new endpoints needed** — all backend APIs already exist.

## Error Handling

| Scenario | Behavior |
|---|---|
| API 401 | Clear token, redirect to `/login` |
| API 400 | Show server error message in snackbar |
| Network error | "Tidak dapat terhubung ke server" |
| Unknown error | "Gagal memuat data" / snackbar |

## States

| State | Widget |
|---|---|
| Loading | `CircularProgressIndicator` centered |
| Empty | `EmptyState` with icon + message |
| Empty (search) | `EmptyState` with "Tidak ditemukan" |
| Error | Snackbar + pull-to-refresh |
| Data | `ListView.builder` with cards |
