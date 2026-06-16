# Flutter Pembelian + Riwayat Pembelian + Receivables — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. After each task, invoke requesting-code-review. All 3 tasks run in parallel — no dependencies.

**Goal:** Rewrite Pembelian purchase form (push page, Material 3), build Riwayat Pembelian page, add receivables to Riwayat Penjualan.

**Architecture:** 3 independent Flutter UI tasks — no backend changes needed (all APIs exist). Single parallel phase.

**Tech Stack:** Flutter 3.x Dart, Riverpod, GoRouter, flutter_test, Material 3

**Execution model:** Single phase. 3 tasks in parallel.

---
---

## Phase 1 — All 3 tasks in parallel

### Task 1: Rewrite Pembelian Purchase Form

**Files:**
- Rewrite: `flutter/lib/features/purchases/purchase_form_page.dart`
- Create: `flutter/test/features/purchase_form_page_test.dart`

**No dependencies** — uses existing `vendorsServiceProvider`, `purchasesServiceProvider`, `materialsServiceProvider`.

- [ ] **Step 1: Write widget test**

Create `flutter/test/features/purchase_form_page_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gemiprint/features/purchases/purchase_form_page.dart';

void main() {
  testWidgets('PurchaseFormPage renders title and vendor field', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: MaterialApp(home: PurchaseFormPage())));
    await tester.pump();
    expect(find.text('Pembelian Baru'), findsOneWidget);
    expect(find.text('Vendor'), findsOneWidget);
    expect(find.text('Simpan'), findsOneWidget);
  });
}
```

Run `cd flutter && flutter test test/features/purchase_form_page_test.dart` — should pass (existing page has these).

- [ ] **Step 2: Rewrite the form**

Replace `flutter/lib/features/purchases/purchase_form_page.dart` with a Material 3 push page. Key structure:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gemiprint/core/theme/app_theme.dart';
import 'package:gemiprint/models/vendor.dart';
import 'package:gemiprint/providers/providers.dart';
import 'package:gemiprint/services/api_client.dart';
import 'package:gemiprint/widgets/snackbar_helper.dart';
import 'package:intl/intl.dart';

class PurchaseFormPage extends ConsumerStatefulWidget {
  const PurchaseFormPage({super.key});
  @override
  ConsumerState<PurchaseFormPage> createState() => _PurchaseFormPageState();
}

class _LineItem {
  String? barangId;
  String? barangNama;
  double qty = 1;
  double hargaBeli = 0;
  double? panjang;
  double? lebar;
  String satuan = 'pcs';
}

class _PurchaseFormPageState extends ConsumerState<PurchaseFormPage> {
  final _formKey = GlobalKey<FormState>();
  Vendor? _selectedVendor;
  List<Vendor> _vendors = [];
  final List<_LineItem> _lines = [];
  String _metode = 'CASH';
  double _dibayar = 0;
  bool _isSaving = false;
  bool _isLoading = true;

  final _currencyFmt = NumberFormat.currency(locale: 'id_ID', symbol: 'Rp ', decimalDigits: 0);

  @override
  void initState() { super.initState(); _loadVendors(); }

  Future<void> _loadVendors() async {
    try {
      final data = await ref.read(vendorsServiceProvider).getAll();
      if (mounted) setState(() { _vendors = data; _isLoading = false; });
    } catch (_) { if (mounted) setState(() => _isLoading = false); }
  }

  double get _total => _lines.fold(0, (s, l) => s + (l.qty * l.hargaBeli));
  double get _sisa => _total - _dibayar;

  Future<void> _save() async {
    if (_selectedVendor == null) { showErrorSnackbar(context, 'Pilih vendor'); return; }
    if (_lines.isEmpty) { showErrorSnackbar(context, 'Tambahkan minimal 1 item'); return; }
    setState(() => _isSaving = true);
    try {
      await ref.read(purchasesServiceProvider).create({
        'vendor_id': _selectedVendor!.id,
        'metode_pembayaran': _metode,
        'total_harga': _total,
        'jumlah_dibayar': _dibayar,
        'items': _lines.map((l) => {
          'barang_id': l.barangId,
          'quantity': l.qty,
          'harga_satuan': l.hargaBeli,
          'panjang': l.panjang,
          'lebar': l.lebar,
        }).toList(),
      });
      if (mounted) { showSuccessSnackbar(context, 'Pembelian berhasil'); Navigator.of(context).pop(true); }
    } on ApiException catch (e) { if (mounted) { setState(() => _isSaving = false); showErrorSnackbar(context, e.message); } }
    catch (_) { if (mounted) { setState(() => _isSaving = false); showErrorSnackbar(context, 'Gagal menyimpan pembelian'); } }
  }

  Future<void> _pickVendor() async {
    final picked = await showModalBottomSheet<Vendor>(
      context: context, isScrollControlled: true, useSafeArea: true, backgroundColor: Colors.transparent,
      builder: (_) => Container(
        decoration: const BoxDecoration(color: Colors.white, borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
        child: Column(children: [
          Padding(padding: const EdgeInsets.all(16), child: TextField(
            decoration: InputDecoration(hintText: 'Cari vendor...', prefixIcon: const Icon(Icons.search, size: 20),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(28), borderSide: BorderSide.none), filled: true),
            onChanged: (_) {}, // filter logic
          )),
          Expanded(child: ListView.builder(itemCount: _vendors.length, itemBuilder: (_, i) => ListTile(
            title: Text(_vendors[i].namaPerusahaan),
            subtitle: Text(_vendors[i].tipeVendor == 'SUPPLIER' ? 'Supplier' : _vendors[i].tipeVendor),
            onTap: () => Navigator.pop(context, _vendors[i]),
          ))),
        ]),
      ),
    );
    if (picked != null) setState(() => _selectedVendor = picked);
  }

  void _addLine() => setState(() => _lines.add(_LineItem()));
  void _removeLine(int i) => setState(() => _lines.removeAt(i));

  @override
  Widget build(BuildContext context) {
    if (_isLoading) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    return Scaffold(
      appBar: AppBar(title: const Text('Pembelian Baru'), actions: [
        TextButton(onPressed: _isSaving ? null : _save, child: _isSaving ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Text('Simpan', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600))),
      ]),
      body: Form(key: _formKey, child: ListView(padding: const EdgeInsets.all(16), children: [
        // Vendor section
        Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Vendor', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
          const SizedBox(height: 8),
          InkWell(onTap: _pickVendor, child: Container(
            width: double.infinity, padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(border: Border.all(color: Colors.grey.shade300), borderRadius: BorderRadius.circular(10)),
            child: Text(_selectedVendor?.namaPerusahaan ?? 'Pilih vendor...', style: TextStyle(color: _selectedVendor != null ? Colors.black : Colors.grey.shade500, fontSize: 14)),
          )),
        ]))),
        const SizedBox(height: 12),
        // Item lines
        Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const Expanded(child: Text('Item Pembelian', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15))),
            TextButton.icon(onPressed: _addLine, icon: const Icon(Icons.add, size: 18), label: const Text('Tambah')),
          ]),
          ..._lines.asMap().entries.map((e) {
            final i = e.key; final l = e.value;
            return Card(
              margin: const EdgeInsets.only(bottom: 8),
              child: Padding(padding: const EdgeInsets.all(10), child: Column(children: [
                Row(children: [
                  Expanded(child: TextFormField(
                    decoration: const InputDecoration(labelText: 'Nama Barang', isDense: true),
                    initialValue: l.barangNama,
                    onChanged: (v) => l.barangNama = v,
                  )),
                  IconButton(icon: const Icon(Icons.close, size: 18), onPressed: () => _removeLine(i)),
                ]),
                const SizedBox(height: 8),
                Row(children: [
                  Expanded(child: TextFormField(
                    decoration: const InputDecoration(labelText: 'Qty', isDense: true),
                    keyboardType: TextInputType.number,
                    initialValue: l.qty.toString(),
                    onChanged: (v) => l.qty = double.tryParse(v) ?? 0,
                  )),
                  const SizedBox(width: 8),
                  Expanded(child: TextFormField(
                    decoration: const InputDecoration(labelText: 'Harga Beli', isDense: true, prefixText: 'Rp'),
                    keyboardType: TextInputType.number,
                    initialValue: l.hargaBeli > 0 ? l.hargaBeli.toString() : '',
                    onChanged: (v) => l.hargaBeli = double.tryParse(v) ?? 0,
                  )),
                ]),
                const SizedBox(height: 8),
                Row(children: [
                  Expanded(child: TextFormField(
                    decoration: const InputDecoration(labelText: 'Panjang (m)', isDense: true),
                    keyboardType: TextInputType.number,
                    onChanged: (v) => l.panjang = double.tryParse(v),
                  )),
                  const SizedBox(width: 8),
                  Expanded(child: TextFormField(
                    decoration: const InputDecoration(labelText: 'Lebar (m)', isDense: true),
                    keyboardType: TextInputType.number,
                    onChanged: (v) => l.lebar = double.tryParse(v),
                  )),
                ]),
              ])),
            );
          }),
          const Divider(),
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            const Text('Total', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
            Text(_currencyFmt.format(_total), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: AppColors.primary)),
          ]),
        ]))),
        const SizedBox(height: 12),
        // Payment section
        Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Pembayaran', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
          const SizedBox(height: 8),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'CASH', label: Text('Tunai')),
              ButtonSegment(value: 'TRANSFER', label: Text('Transfer')),
              ButtonSegment(value: 'NET30', label: Text('NET30')),
            ],
            selected: {_metode},
            onSelectionChanged: (v) => setState(() => _metode = v.first),
            showSelectedIcon: false,
          ),
          const SizedBox(height: 8),
          TextFormField(
            decoration: const InputDecoration(labelText: 'Jumlah Dibayar', prefixText: 'Rp'),
            keyboardType: TextInputType.number,
            initialValue: _dibayar > 0 ? _dibayar.toString() : '',
            onChanged: (v) => setState(() => _dibayar = double.tryParse(v) ?? 0),
          ),
          if (_metode == 'NET30' && _sisa > 0)
            Padding(padding: const EdgeInsets.only(top: 8), child: Text('Sisa hutang: ${_currencyFmt.format(_sisa)}', style: TextStyle(color: AppColors.error, fontSize: 12))),
        ]))),
        const SizedBox(height: 80),
      ])),
      bottomNavigationBar: SafeArea(child: Padding(padding: const EdgeInsets.all(16), child: SizedBox(width: double.infinity, child: FilledButton(onPressed: _isSaving ? null : _save, child: _isSaving ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Text('Simpan Pembelian')))),
    );
  }
}
```

**Key simplifications vs old form:**
- No inline create vendor/material — pick from existing lists only
- Text fields for item name (not full material picker) — simplifies mobile entry
- Dimensions (panjang × lebar) preserved
- SegmentedButton for payment method
- Loading state while saving

- [ ] **Step 3: Run tests + flutter analyze**

```bash
cd flutter && flutter test test/features/purchase_form_page_test.dart && flutter analyze lib/features/purchases/
```

- [ ] **Step 4: Commit**

```bash
git add flutter/lib/features/purchases/purchase_form_page.dart flutter/test/features/purchase_form_page_test.dart
git commit -m "feat(flutter): rewrite form Pembelian dengan Material 3 UI"
```

---

### Task 2: Build Riwayat Pembelian Page

**Files:**
- Create: `flutter/lib/features/purchase_history/purchase_history_page.dart` (new)
- Create: `flutter/test/features/purchase_history_page_test.dart`
- Modify: `flutter/lib/core/router/app_router.dart` (add route)
- Modify: `flutter/lib/widgets/app_shell.dart` (add menu item + title)

**No dependencies** — uses existing `purchasesServiceProvider`.

- [ ] **Step 1: Write widget test**

Create `flutter/test/features/purchase_history_page_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gemiprint/features/purchase_history/purchase_history_page.dart';

void main() {
  testWidgets('PurchaseHistoryPage shows title and search', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: MaterialApp(home: Scaffold(body: PurchaseHistoryPage()))));
    await tester.pump();
    expect(find.text('Riwayat Pembelian'), findsOneWidget);
    expect(find.byType(TextField), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });
  testWidgets('PurchaseHistoryPage has filter chips', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: MaterialApp(home: Scaffold(body: PurchaseHistoryPage()))));
    await tester.pump();
    expect(find.text('Semua'), findsOneWidget);
    expect(find.text('Lunas'), findsOneWidget);
    expect(find.text('Hutang'), findsOneWidget);
  });
}
```

Run `cd flutter && flutter test test/features/purchase_history_page_test.dart` — should fail (file not found).

- [ ] **Step 2: Build the page**

Follow the exact same pattern as `sales_history_page.dart`. Create `flutter/lib/features/purchase_history/purchase_history_page.dart` with:

- Title "Riwayat Pembelian" + total badge (AppColors.accent themed)
- Search by nomor_pembelian, vendor name
- Filter chips: Semua | Lunas | Hutang | Void
- Cards: nomor_pembelian (bold), vendor, total (Rp), payment status badge (LUNAS=green, HUTANG=red, SEBAGIAN=amber, VOID=grey), date
- Payment status colors: `_paymentStatusColor()` — LUNAS→success, HUTANG→error, SEBAGIAN→warning, default→grey
- Tap → detail sheet: items list, total, paid, status, [Bayar Hutang] button, [Batalkan] button
- Pay debt dialog: amount field → `purchasesService.payDebt()`
- Void: admin/manager only, confirm → `purchasesService.delete(id)`
- Load via: `purchasesService.getAll()` → map to `Purchase.fromJson()`
- Pull-to-refresh, loading/empty/error states, 401 → logout

Use `Purchase` model from `package:gemiprint/models/purchase.dart`. The model already has: id, nomorPembelian, vendorNama, totalHarga, dibayar, statusPembayaran, statusTransaksi, items.

The detail sheet should show:
- Items from `purchase.items`: `barangNama`, `quantity`, `hargaSatuan`, `subtotal`
- Payment status, amount paid, total
- If `statusPembayaran == 'HUTANG' || 'SEBAGIAN'`: [Bayar Hutang] button
- If `statusTransaksi != 'VOIDED'`: [Batalkan] button (admin/manager)

- [ ] **Step 3: Add route and menu**

In `app_router.dart`: `GoRoute(path: '/purchase-history', builder: (context, state) => const PurchaseHistoryPage())`

In `app_shell.dart`: Add `_MenuItemData(path: '/purchase-history', icon: Icons.receipt_long_rounded, label: 'Riwayat Pembelian', allowedRoles: RoleGroups.fullStaff)` under Pembelian group. Add `'/purchase-history': 'Riwayat Pembelian'` to title map.

- [ ] **Step 4: Run tests + flutter analyze**

```bash
cd flutter && flutter test test/features/purchase_history_page_test.dart && flutter analyze lib/features/purchase_history/ lib/core/router/ lib/widgets/
```

- [ ] **Step 5: Commit**

```bash
git add flutter/lib/features/purchase_history/ flutter/test/features/purchase_history_page_test.dart flutter/lib/core/router/app_router.dart flutter/lib/widgets/app_shell.dart
git commit -m "feat(flutter): halaman Riwayat Pembelian dengan detail + void + bayar hutang"
```

---

### Task 3: Add Receivables to Riwayat Penjualan

**Files:**
- Modify: `flutter/lib/features/sales_history/sales_history_page.dart`
- Create: `flutter/test/features/sales_history_receivable_test.dart` (optional)

**No dependencies** — uses existing `posServiceProvider` methods (getReceivables, payReceivable, revertPayment).

- [ ] **Step 1: Write test**

Create `flutter/test/features/sales_history_receivable_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:gemiprint/features/sales_history/sales_history_page.dart';

void main() {
  test('SalesHistoryPage has Piutang filter', () {
    // Verify filter list includes Piutang
    expect(SalesHistoryPage.filters, contains('Piutang'));
  });
}
```

- [ ] **Step 2: Modify sales_history_page.dart**

Add a `Piutang` tab using a simple toggle (add a `_showReceivables` bool to state, or add "Piutang" to the filter chips list). When Piutang is selected:

1. Load receivables: `posService.getReceivables()` → list of `{ penjualan_id, pelanggan_nama, nomor_faktur, sisa_piutang, status }`
2. Show receivable cards: customer name, invoice number, amount owed, [Bayar] button
3. Pay dialog: amount field → `posService.payReceivable({ piutang_id, jumlah_bayar })`
4. Revert button on paid receivables → confirm → `posService.revertPayment({ sale_id })`

The simplest approach: add "Piutang" as a 4th filter chip in the existing filter row. When selected, show receivables list instead of sales list.

Add to the `_filtered` getter or create a separate `_receivables` list. When `_activeFilter == 'Piutang'`:
- Load receivables from `posService.getReceivables()`
- Display as cards with [Bayar] button
- Pay dialog similar to pay-debt in purchase history

Add `static const List<String> filters = ['Semua', 'Lunas', 'Void', 'Piutang'];` for the test.

- [ ] **Step 3: Run tests + analyze**

```bash
cd flutter && flutter test test/features/sales_history_page_test.dart test/features/sales_history_receivable_test.dart && flutter analyze lib/features/sales_history/
```

- [ ] **Step 4: Commit**

```bash
git add flutter/lib/features/sales_history/sales_history_page.dart flutter/test/features/sales_history_receivable_test.dart
git commit -m "feat(flutter): tambah fitur piutang (bayar + revert) ke Riwayat Penjualan"
```

---
---

## Final Verification

- [ ] `cd flutter && flutter test` — all tests pass
- [ ] `cd flutter && flutter analyze` — 0 issues
