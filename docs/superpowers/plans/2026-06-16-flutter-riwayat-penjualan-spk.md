# Flutter Riwayat Penjualan & SPK Rewrite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. After each task, invoke requesting-code-review before proceeding. Run parallel tasks within a phase simultaneously.

**Goal:** Build Riwayat Penjualan page (sales history), rewrite SPK page with Material 3 UI + status updates, extract shared invoice PDF widget. Add missing GET /api/pos/sales REST endpoint.

**Architecture:** Phase 1: 1 backend task + 2 Flutter service tasks in parallel. Phase 2: 2 Flutter page tasks in parallel. Keep existing production service, POS service, models, router, and theme unchanged.

**Tech Stack:** Next.js API routes + Flutter 3.x Dart, Riverpod, GoRouter, flutter_test, Material 3

**Execution model:** 2 phases. Phase 1: 3 tasks in parallel. Phase 2: 2 tasks in parallel (after Phase 1 complete).

---
---

## Phase 1 — Parallel (3 agents: 1 backend + 2 Flutter)

### Task 1: Add GET /api/pos/sales Handler

**Files:**
- Modify: `src/app/api/pos/sales/route.ts` (add GET handler)

**No file conflict with Tasks 2-3** (backend vs Flutter).

- [ ] **Step 1: Write failing API test**

Create `src/app/api/pos/sales/__tests__/get-sales.test.ts`:

```typescript
import { GET } from "../route";

// Mock getSales
jest.mock("@/lib/services/pos-service", () => ({
  __esModule: true,
  getSales: jest.fn().mockResolvedValue([
    {
      id: "s1",
      nomor_faktur: "INV-001",
      pelanggan_nama: "Budi",
      total_jumlah: 150000,
      metode_pembayaran: "CASH",
      status_transaksi: "LUNAS",
      dibuat_pada: "2026-06-01T10:00:00Z",
    },
  ]),
}));

describe("GET /api/pos/sales", () => {
  it("returns sales list", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sales).toBeDefined();
    expect(body.sales.length).toBe(1);
    expect(body.sales[0].nomor_faktur).toBe("INV-001");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/gemi/Projects/gemiprintaio && npx jest src/app/api/pos/sales/__tests__/get-sales.test.ts --no-coverage
```

Expected: FAIL — GET export not found or returns wrong response.

- [ ] **Step 3: Add GET handler**

Add to `src/app/api/pos/sales/route.ts` (after existing imports, before POST handler):

```typescript
import { getSales } from "@/lib/services/pos-service";

export async function GET() {
  try {
    const sales = await getSales(200);
    return NextResponse.json({ sales });
  } catch (error: any) {
    console.error("Gagal mengambil daftar penjualan:", error);
    return NextResponse.json(
      { error: error.message || "Gagal mengambil daftar penjualan" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/gemi/Projects/gemiprintaio && npx jest src/app/api/pos/sales/__tests__/get-sales.test.ts --no-coverage
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/gemi/Projects/gemiprintaio
git add src/app/api/pos/sales/route.ts src/app/api/pos/sales/__tests__/get-sales.test.ts
git commit -m "feat(api): tambah GET /api/pos/sales untuk daftar riwayat penjualan"
```

---

### Task 2: Extract Shared InvoicePreview Widget

**Files:**
- Create: `flutter/lib/widgets/invoice_preview.dart` (extracted from POS)
- Modify: `flutter/lib/features/pos/widgets/penawaran_preview.dart` (use new shared widget)
- Modify: `flutter/lib/features/pos/pos_page.dart` (update import if needed)

**No file conflict with Tasks 1, 3** (different files).

- [ ] **Step 1: Write failing widget test**

Create `flutter/test/widgets/invoice_preview_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:gemiprint/widgets/invoice_preview.dart';

void main() {
  test('InvoicePreview widget file exists and is importable', () {
    // This test just verifies the file compiles and the class exists
    expect(InvoicePreview, isNotNull);
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd flutter && flutter test test/widgets/invoice_preview_test.dart
```

Expected: FAIL — file not found.

- [ ] **Step 3: Create InvoicePreview widget**

First, read the current `_openPenawaran()` method in `pos_page.dart` and `penawaran_preview.dart` to understand the existing PDF generation logic. Then extract the PDF preview into a reusable widget.

Create `flutter/lib/widgets/invoice_preview.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

/// Shared invoice/preview PDF widget.
/// Used by POS (Penawaran), Riwayat Penjualan, and Riwayat Pembelian.
///
/// Takes a list of line items and optional header info, generates a PDF,
/// and shows a preview with share/print options.
class InvoicePreview {
  /// Opens a PDF preview for the given invoice data.
  static Future<void> show(
    BuildContext context, {
    required List<InvoiceLine> lines,
    required String title,
    String? customerName,
    String? customerAddress,
    String? invoiceNumber,
    String? date,
    double total = 0,
    List<InvoiceCharge> additionalCharges = const [],
  }) async {
    final doc = pw.Document();
    final font = await PdfGoogleFonts.nunitoRegular();
    final bold = await PdfGoogleFonts.nunitoBold();

    doc.addPage(
      pw.MultiPage(
        pageFormat: PdfPageFormat.roll80,
        build: (ctx) => [
          pw.Header(
            level: 0,
            child: pw.Text(title, style: pw.TextStyle(font: bold, fontSize: 14)),
          ),
          if (invoiceNumber != null)
            pw.Text('No: $invoiceNumber', style: pw.TextStyle(font: font, fontSize: 10)),
          if (date != null)
            pw.Text('Tanggal: $date', style: pw.TextStyle(font: font, fontSize: 10)),
          if (customerName != null)
            pw.Text('Pelanggan: $customerName', style: pw.TextStyle(font: font, fontSize: 10)),
          if (customerAddress != null)
            pw.Text(customerAddress!, style: pw.TextStyle(font: font, fontSize: 9)),
          pw.SizedBox(height: 10),
          ...lines.map((line) => pw.Row(
            children: [
              pw.Expanded(child: pw.Text(line.name, style: pw.TextStyle(font: font, fontSize: 9))),
              pw.Text('${line.qty} × ${line.priceFormatted}', style: pw.TextStyle(font: font, fontSize: 9)),
              pw.SizedBox(width: 10),
              pw.Text(line.subtotalFormatted, style: pw.TextStyle(font: font, fontSize: 9)),
            ],
          )),
          if (additionalCharges.isNotEmpty) ...[
            pw.SizedBox(height: 4),
            ...additionalCharges.map((c) => pw.Row(
              children: [
                pw.Expanded(child: pw.Text(c.label, style: pw.TextStyle(font: font, fontSize: 9))),
                pw.Text(c.amountFormatted, style: pw.TextStyle(font: font, fontSize: 9)),
              ],
            )),
          ],
          pw.Divider(),
          pw.Row(
            mainAxisAlignment: pw.MainAxisAlignment.end,
            children: [
              pw.Text('TOTAL: ', style: pw.TextStyle(font: bold, fontSize: 11)),
              pw.Text(_formatRupiah(total), style: pw.TextStyle(font: bold, fontSize: 11)),
            ],
          ),
        ],
      ),
    );

    await Printing.layoutPdf(
      onLayout: (format) async => doc.save(),
    );
  }

  static String _formatRupiah(double value) {
    final formatter = NumberFormat.currency(locale: 'id_ID', symbol: 'Rp ', decimalDigits: 0);
    return formatter.format(value);
  }
}

class InvoiceLine {
  final String name;
  final double qty;
  final double price;
  final double subtotal;

  const InvoiceLine({
    required this.name,
    required this.qty,
    required this.price,
    required this.subtotal,
  });

  String get priceFormatted => InvoicePreview._formatRupiah(price);
  String get subtotalFormatted => InvoicePreview._formatRupiah(subtotal);
}

class InvoiceCharge {
  final String label;
  final double amount;

  const InvoiceCharge({required this.label, required this.amount});

  String get amountFormatted => InvoicePreview._formatRupiah(amount);
}
```

Then update `flutter/lib/features/pos/widgets/penawaran_preview.dart` to delegate to `InvoicePreview.show()` instead of duplicating the PDF code. Replace the PDF generation logic with a call to `InvoicePreview.show(context, lines: ..., title: ..., ...)`.

- [ ] **Step 4: Run tests + flutter analyze**

```bash
cd flutter && flutter test test/widgets/invoice_preview_test.dart && flutter analyze lib/widgets/invoice_preview.dart lib/features/pos/
```

Expected: PASS tests, 0 analysis errors.

- [ ] **Step 5: Commit**

```bash
cd /home/gemi/Projects/gemiprintaio
git add flutter/lib/widgets/invoice_preview.dart flutter/test/widgets/invoice_preview_test.dart flutter/lib/features/pos/widgets/penawaran_preview.dart
git commit -m "feat(flutter): ekstrak InvoicePreview widget bersama dari POS (pakai ulang di Riwayat)"
```

---

### Task 3: Add getSales + voidSale to PosService

**Files:**
- Modify: `flutter/lib/services/pos_service.dart` (add getSales, voidSale methods)

**No file conflict with Tasks 1, 2** (different files).

- [ ] **Step 1: Write failing service test**

Create `flutter/test/services/pos_service_extended_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:gemiprint/services/pos_service.dart';

void main() {
  test('PosService has getSales method', () {
    // Just verifies the method exists — actual API call requires integration test
    final service = PosService(null as dynamic); // won't actually call API
    expect(service.getSales, isNotNull);
  });

  test('PosService has voidSale method', () {
    final service = PosService(null as dynamic);
    expect(service.voidSale, isNotNull);
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd flutter && flutter test test/services/pos_service_extended_test.dart
```

Expected: FAIL — method not found.

- [ ] **Step 3: Add methods to PosService**

Read current `flutter/lib/services/pos_service.dart` first. Add these methods:

```dart
/// Get sales history list.
Future<List<Map<String, dynamic>>> getSales({int limit = 100}) async {
  final data = await _api.get('/api/pos/sales',
      queryParams: {'limit': limit.toString()}, forceRefresh: true);
  final list = data['sales'] as List? ?? [];
  return list.cast<Map<String, dynamic>>();
}

/// Void a sale by ID.
Future<void> voidSale(String id, String reason) async {
  await _api.delete('/api/pos/sales/$id',
      body: {'reason': reason});
}
```

- [ ] **Step 4: Run tests + flutter analyze**

```bash
cd flutter && flutter test test/services/pos_service_extended_test.dart && flutter analyze lib/services/pos_service.dart
```

Expected: PASS tests, 0 analysis errors.

- [ ] **Step 5: Commit**

```bash
cd /home/gemi/Projects/gemiprintaio
git add flutter/lib/services/pos_service.dart flutter/test/services/pos_service_extended_test.dart
git commit -m "feat(flutter): tambah getSales + voidSale ke PosService untuk Riwayat Penjualan"
```

---
---

## Phase 2 — Parallel (2 agents, after Phase 1 complete)

### Task 4: Build Riwayat Penjualan Page

**Files:**
- Create: `flutter/lib/features/sales_history/sales_history_page.dart` (new)
- Create: `flutter/test/features/sales_history_page_test.dart`
- Modify: `flutter/lib/core/router/app_router.dart` (add route)
- Modify: `flutter/lib/widgets/app_shell.dart` (add menu item)

**Depends on:** Tasks 1 (GET endpoint), 2 (InvoicePreview), 3 (PosService methods).

- [ ] **Step 1: Write widget test**

Create `flutter/test/features/sales_history_page_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gemiprint/features/sales_history/sales_history_page.dart';

void main() {
  testWidgets('SalesHistoryPage shows title and search bar', (tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(home: Scaffold(body: SalesHistoryPage())),
      ),
    );
    await tester.pump();

    expect(find.text('Riwayat Penjualan'), findsOneWidget);
    expect(find.byType(TextField), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });

  testWidgets('SalesHistoryPage has filter chips', (tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(home: Scaffold(body: SalesHistoryPage())),
      ),
    );
    await tester.pump();

    expect(find.text('Semua'), findsOneWidget);
    expect(find.text('Lunas'), findsOneWidget);
    expect(find.text('Void'), findsOneWidget);
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd flutter && flutter test test/features/sales_history_page_test.dart
```

Expected: FAIL — file not found.

- [ ] **Step 3: Build SalesHistoryPage**

Create `flutter/lib/features/sales_history/sales_history_page.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gemiprint/core/constants/roles.dart';
import 'package:gemiprint/core/theme/app_theme.dart';
import 'package:gemiprint/models/sale.dart';
import 'package:gemiprint/providers/providers.dart';
import 'package:gemiprint/services/api_client.dart';
import 'package:gemiprint/widgets/confirm_dialog.dart';
import 'package:gemiprint/widgets/empty_state.dart';
import 'package:gemiprint/widgets/invoice_preview.dart';
import 'package:gemiprint/widgets/snackbar_helper.dart';
import 'package:intl/intl.dart';

class SalesHistoryPage extends ConsumerStatefulWidget {
  const SalesHistoryPage({super.key});

  @override
  ConsumerState<SalesHistoryPage> createState() => _SalesHistoryPageState();
}

class _SalesHistoryPageState extends ConsumerState<SalesHistoryPage> {
  List<Map<String, dynamic>> _sales = [];
  bool _isLoading = true;
  String _search = '';
  String _activeFilter = 'Semua'; // 'Semua', 'Lunas', 'Void'

  final _currencyFmt = NumberFormat.currency(locale: 'id_ID', symbol: 'Rp ', decimalDigits: 0);
  final _dateFmt = DateFormat('dd/MM/yy HH:mm', 'id_ID');

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final data = await ref.read(posServiceProvider).getSales();
      if (mounted) {
        setState(() {
          _sales = data;
          _isLoading = false;
        });
      }
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        if (e.isUnauthorized) {
          ref.read(authStateProvider.notifier).logout();
          return;
        }
        showErrorSnackbar(context, e.message);
      }
    } catch (_) {
      if (mounted) {
        setState(() => _isLoading = false);
        showErrorSnackbar(context, 'Gagal memuat riwayat penjualan');
      }
    }
  }

  List<Map<String, dynamic>> get _filtered {
    var result = _sales;

    if (_activeFilter == 'Lunas') {
      result = result.where((s) => s['status_transaksi'] != 'VOIDED').toList();
    } else if (_activeFilter == 'Void') {
      result = result.where((s) => s['status_transaksi'] == 'VOIDED').toList();
    }

    if (_search.isNotEmpty) {
      final q = _search.toLowerCase();
      result = result.where((s) {
        final faktur = (s['nomor_faktur'] ?? '').toString().toLowerCase();
        final nama = (s['pelanggan_nama'] ?? '').toString().toLowerCase();
        return faktur.contains(q) || nama.contains(q);
      }).toList();
    }

    return result;
  }

  Future<void> _handleVoid(Map<String, dynamic> sale) async {
    if (!_canUseRiskyActions) return;
    final faktur = sale['nomor_faktur'] ?? sale['id'];
    final ok = await showConfirmDialog(
      context,
      title: 'Batalkan Penjualan',
      message: 'Yakin ingin membatalkan penjualan "$faktur"?\n\nTindakan ini akan mengembalikan stok dan menandai transaksi sebagai VOID.',
      isDangerous: true,
    );
    if (!ok) return;

    try {
      await ref.read(posServiceProvider).voidSale(sale['id'], 'Dibatalkan dari mobile');
      if (mounted) {
        showSuccessSnackbar(context, 'Penjualan berhasil dibatalkan');
        _loadData();
      }
    } on ApiException catch (e) {
      if (mounted) showErrorSnackbar(context, e.message);
    }
  }

  bool get _canUseRiskyActions {
    final role = ref.read(authStateProvider).valueOrNull?.role;
    return role != null && RoleGroups.adminOnly.contains(role);
  }

  void _showDetail(Map<String, dynamic> sale) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _DetailSheet(sale: sale, currencyFmt: _currencyFmt, dateFmt: _dateFmt, onVoid: () => _handleVoid(sale), canVoid: _canUseRiskyActions),
    );
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filtered;

    return Stack(
      children: [
        Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
              child: Row(
                children: [
                  const Text('Riwayat Penjualan', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                    decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
                    child: Text('${_sales.length}', style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w600, fontSize: 13)),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
              child: TextField(
                decoration: InputDecoration(
                  hintText: 'Cari faktur atau pelanggan...',
                  prefixIcon: const Icon(Icons.search, size: 20),
                  suffixIcon: _search.isNotEmpty ? IconButton(icon: const Icon(Icons.clear, size: 18), onPressed: () => setState(() => _search = '')) : null,
                  filled: true,
                  fillColor: Theme.of(context).colorScheme.surfaceContainerHighest.withValues(alpha: 0.3),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(28), borderSide: BorderSide.none),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                ),
                onChanged: (v) => setState(() => _search = v),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: ['Semua', 'Lunas', 'Void'].map((label) {
                    final isSelected = _activeFilter == label;
                    return Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: FilterChip(
                        label: Text(label, style: TextStyle(fontSize: 12, fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal)),
                        selected: isSelected,
                        onSelected: (_) => setState(() => _activeFilter = label),
                        selectedColor: AppColors.primary.withValues(alpha: 0.15),
                        checkmarkColor: AppColors.primary,
                        visualDensity: VisualDensity.compact,
                      ),
                    );
                  }).toList(),
                ),
              ),
            ),
            Expanded(child: _buildBody(filtered)),
          ],
        ),
      ],
    );
  }

  Widget _buildBody(List<Map<String, dynamic>> filtered) {
    if (_isLoading) return const Center(child: CircularProgressIndicator());
    if (_sales.isEmpty) return EmptyState(icon: Icons.receipt_long_rounded, title: 'Belum ada riwayat penjualan');
    if (filtered.isEmpty) return EmptyState(icon: Icons.search_off_rounded, title: 'Tidak ditemukan', subtitle: 'Coba kata kunci lain atau ubah filter');
    return RefreshIndicator(
      onRefresh: _loadData,
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 80),
        itemCount: filtered.length,
        itemBuilder: (_, i) => _buildCard(filtered[i]),
      ),
    );
  }

  Widget _buildCard(Map<String, dynamic> s) {
    final isVoid = s['status_transaksi'] == 'VOIDED';
    final faktur = s['nomor_faktur'] ?? s['id'] ?? '-';
    final nama = s['pelanggan_nama'] ?? 'Pelanggan Umum';
    final total = (s['total_jumlah'] as num?)?.toDouble() ?? 0;
    final metode = s['metode_pembayaran'] ?? '-';
    final tgl = s['dibuat_pada'] ?? s['created_at'];

    return Card(
      margin: const EdgeInsets.only(bottom: 6),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => _showDetail(s),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(child: Text(faktur, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14), overflow: TextOverflow.ellipsis)),
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: isVoid ? AppColors.error.withValues(alpha: 0.1) : AppColors.success.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(isVoid ? 'Void' : 'Lunas', style: TextStyle(color: isVoid ? AppColors.error : AppColors.success, fontSize: 10, fontWeight: FontWeight.w600)),
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text('$nama · ${_currencyFmt.format(total)}', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                    const SizedBox(height: 1),
                    Row(
                      children: [
                        if (tgl != null) Text(_dateFmt.format(DateTime.parse(tgl.toString())), style: TextStyle(fontSize: 10, color: Colors.grey.shade500)),
                        const SizedBox(width: 8),
                        Text(metode, style: TextStyle(fontSize: 10, color: Colors.grey.shade500)),
                      ],
                    ),
                  ],
                ),
              ),
              if (!isVoid && _canUseRiskyActions)
                IconButton(icon: const Icon(Icons.cancel_outlined, size: 20), color: AppColors.error.withValues(alpha: 0.6), onPressed: () => _handleVoid(s), visualDensity: VisualDensity.compact),
              Icon(Icons.chevron_right, color: Colors.grey.shade400, size: 20),
            ],
          ),
        ),
      ),
    );
  }
}

class _DetailSheet extends StatelessWidget {
  final Map<String, dynamic> sale;
  final NumberFormat currencyFmt;
  final DateFormat dateFmt;
  final VoidCallback onVoid;
  final bool canVoid;

  const _DetailSheet({required this.sale, required this.currencyFmt, required this.dateFmt, required this.onVoid, required this.canVoid});

  @override
  Widget build(BuildContext context) {
    final isVoid = sale['status_transaksi'] == 'VOIDED';
    final faktur = sale['nomor_faktur'] ?? sale['id'] ?? '-';
    final nama = sale['pelanggan_nama'] ?? 'Pelanggan Umum';
    final total = (sale['total_jumlah'] as num?)?.toDouble() ?? 0;
    final dibayar = (sale['jumlah_dibayar'] as num?)?.toDouble() ?? 0;
    final kembalian = (sale['jumlah_kembalian'] as num?)?.toDouble() ?? 0;
    final metode = sale['metode_pembayaran'] ?? '-';
    final tgl = sale['dibuat_pada'] ?? sale['created_at'];
    final items = (sale['items'] as List?) ?? [];

    return DraggableScrollableSheet(
      initialChildSize: 0.85,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      expand: false,
      builder: (_, scrollCtrl) => Container(
        decoration: const BoxDecoration(color: Colors.white, borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
        child: Column(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
              decoration: BoxDecoration(border: Border(bottom: BorderSide(color: Colors.grey.shade200))),
              child: Row(
                children: [
                  Expanded(child: Text(faktur, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600))),
                  IconButton(onPressed: () => Navigator.of(context).pop(), icon: const Icon(Icons.close)),
                ],
              ),
            ),
            Expanded(
              child: ListView(
                controller: scrollCtrl,
                padding: const EdgeInsets.all(20),
                children: [
                  _infoRow('Pelanggan', nama),
                  if (tgl != null) _infoRow('Tanggal', dateFmt.format(DateTime.parse(tgl.toString()))),
                  _infoRow('Metode', metode),
                  _infoRow('Status', isVoid ? 'VOID' : 'Lunas'),
                  const SizedBox(height: 12),
                  const Text('Item', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                  const SizedBox(height: 8),
                  ...items.map((item) => Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: Row(
                      children: [
                        Expanded(child: Text(item['barang_nama'] ?? item['nama_barang'] ?? '-', style: const TextStyle(fontSize: 13))),
                        Text('${item['quantity'] ?? item['jumlah'] ?? 0} × ${currencyFmt.format((item['harga_satuan'] as num?)?.toDouble() ?? 0)}', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                      ],
                    ),
                  )),
                  const Divider(),
                  _totalRow('Total', currencyFmt.format(total)),
                  _totalRow('Dibayar', currencyFmt.format(dibayar)),
                  _totalRow('Kembalian', currencyFmt.format(kembalian)),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () {
                            Navigator.of(context).pop();
                            InvoicePreview.show(context, title: 'Invoice $faktur', invoiceNumber: faktur, customerName: nama, date: tgl != null ? dateFmt.format(DateTime.parse(tgl.toString())) : null, total: total, lines: items.map((item) => InvoiceLine(name: item['barang_nama'] ?? item['nama_barang'] ?? '-', qty: (item['quantity'] ?? item['jumlah'] ?? 0).toDouble(), price: (item['harga_satuan'] as num?)?.toDouble() ?? 0, subtotal: ((item['quantity'] ?? item['jumlah'] ?? 0).toDouble() * ((item['harga_satuan'] as num?)?.toDouble() ?? 0)))).toList());
                          },
                          icon: const Icon(Icons.share, size: 16),
                          label: const Text('Bagikan Invoice'),
                        ),
                      ),
                      if (!isVoid && canVoid) ...[
                        const SizedBox(width: 12),
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: () {
                              Navigator.of(context).pop();
                              onVoid();
                            },
                            icon: const Icon(Icons.cancel_outlined, size: 16),
                            label: const Text('Batalkan'),
                            style: OutlinedButton.styleFrom(foregroundColor: AppColors.error),
                          ),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _infoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        children: [
          SizedBox(width: 80, child: Text(label, style: TextStyle(fontSize: 12, color: Colors.grey.shade600))),
          Expanded(child: Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500))),
        ],
      ),
    );
  }

  Widget _totalRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 2),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(fontSize: 13)),
          Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}
```

Add route in `flutter/lib/core/router/app_router.dart`:

```dart
import 'package:gemiprint/features/sales_history/sales_history_page.dart';

// In routes list, add:
GoRoute(
  path: '/sales-history',
  builder: (context, state) => const SalesHistoryPage(),
),
```

Add menu item in `flutter/lib/widgets/app_shell.dart` — add a "Riwayat Penjualan" entry under the Penjualan group.

- [ ] **Step 4: Run tests + flutter analyze**

```bash
cd flutter && flutter test test/features/sales_history_page_test.dart && flutter analyze lib/features/sales_history/ lib/core/router/ lib/widgets/
```

Expected: PASS tests, 0 analysis errors.

- [ ] **Step 5: Commit**

```bash
cd /home/gemi/Projects/gemiprintaio
git add flutter/lib/features/sales_history/ flutter/test/features/sales_history_page_test.dart flutter/lib/core/router/app_router.dart flutter/lib/widgets/app_shell.dart
git commit -m "feat(flutter): halaman Riwayat Penjualan dengan detail + void + bagikan invoice"
```

---

### Task 5: Rewrite SPK/Production Page

**Files:**
- Modify: `flutter/lib/features/production/production_page.dart` (rewrite)
- Create: `flutter/test/features/production_page_test.dart`

**Depends on:** Nothing new — uses existing `productionServiceProvider` and `ProductionOrder` model.

- [ ] **Step 1: Write widget test**

Create `flutter/test/features/production_page_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gemiprint/features/production/production_page.dart';

void main() {
  testWidgets('ProductionPage shows title and search bar', (tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(home: Scaffold(body: ProductionPage())),
      ),
    );
    await tester.pump();

    expect(find.text('SPK'), findsOneWidget);
    expect(find.byType(TextField), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });

  testWidgets('ProductionPage has status filter chips', (tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(home: Scaffold(body: ProductionPage())),
      ),
    );
    await tester.pump();

    expect(find.text('Semua'), findsOneWidget);
    expect(find.text('Menunggu'), findsOneWidget);
    expect(find.text('Proses'), findsOneWidget);
  });
}
```

- [ ] **Step 2: Run test to verify it fails (or passes baseline)**

```bash
cd flutter && flutter test test/features/production_page_test.dart
```

Expected: Should show existing page has these elements at minimum.

- [ ] **Step 3: Rewrite ProductionPage**

Replace `flutter/lib/features/production/production_page.dart` with a Material 3 rewrite. Keep the existing `ProductionService` and `ProductionOrder` model. Follow the same pattern as `customers_page.dart` (header + total badge, search bar, filter chips, card list with status badges, detail bottom sheet).

Key differences from CustomersPage:
- No FAB (SPK created from POS)
- Domain color: orange (`Color(0xFFE65100)`)
- Status filter: Semua | Menunggu | Proses | Selesai | Dibatalkan
- Status colors: MENUNGGU=amber, PROSES=blue, SELESAI=green, DIBATALKAN=grey
- Cards show: nomor_spk, pelanggan_nama, item count, status badge
- Detail sheet: items with qty + status, [Lanjutkan Proses] or [Tandai Selesai] button
- Status transitions: MENUNGGU → PROSES, PROSES → SELESAI
- Uses: `productionServiceProvider.getOrders()`, `productionServiceProvider.updateOrderStatus()`
- Import: `ProductionOrder` from models, `ProductionService` from providers

Full implementation (replace entire file):

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gemiprint/core/theme/app_theme.dart';
import 'package:gemiprint/models/production.dart';
import 'package:gemiprint/providers/providers.dart';
import 'package:gemiprint/services/api_client.dart';
import 'package:gemiprint/widgets/empty_state.dart';
import 'package:gemiprint/widgets/snackbar_helper.dart';
import 'package:intl/intl.dart';

class ProductionPage extends ConsumerStatefulWidget {
  const ProductionPage({super.key});
  @override
  ConsumerState<ProductionPage> createState() => _ProductionPageState();
}

class _ProductionPageState extends ConsumerState<ProductionPage> {
  List<ProductionOrder> _orders = [];
  bool _isLoading = true;
  String _search = '';
  String _activeFilter = 'Semua';

  static const _statuses = ['Semua', 'Menunggu', 'Proses', 'Selesai', 'Dibatalkan'];
  final _dateFmt = DateFormat('dd/MM/yy', 'id_ID');

  @override
  void initState() { super.initState(); _loadData(); }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final raw = await ref.read(productionServiceProvider).getOrders(forceRefresh: true);
      if (mounted) setState(() { _orders = raw.map((j) => ProductionOrder.fromJson(j as Map<String, dynamic>)).toList(); _isLoading = false; });
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        if (e.isUnauthorized) { ref.read(authStateProvider.notifier).logout(); return; }
        showErrorSnackbar(context, e.message);
      }
    } catch (_) {
      if (mounted) { setState(() => _isLoading = false); showErrorSnackbar(context, 'Gagal memuat data SPK'); }
    }
  }

  List<ProductionOrder> get _filtered {
    var result = _orders;
    if (_activeFilter == 'Menunggu') result = result.where((o) => o.status == 'MENUNGGU').toList();
    else if (_activeFilter == 'Proses') result = result.where((o) => o.status == 'PROSES' || o.status == 'DALAM_PROSES').toList();
    else if (_activeFilter == 'Selesai') result = result.where((o) => o.status == 'SELESAI').toList();
    else if (_activeFilter == 'Dibatalkan') result = result.where((o) => o.status == 'DIBATALKAN').toList();
    if (_search.isNotEmpty) {
      final q = _search.toLowerCase();
      result = result.where((o) => (o.nomorSpk ?? '').toLowerCase().contains(q) || (o.pelangganNama ?? '').toLowerCase().contains(q)).toList();
    }
    return result;
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'MENUNGGU': return const Color(0xFFF59E0B);
      case 'PROSES': case 'DALAM_PROSES': return AppColors.accent;
      case 'SELESAI': return AppColors.success;
      default: return Colors.grey;
    }
  }

  String _statusLabel(String s) {
    switch (s) {
      case 'MENUNGGU': return 'Menunggu';
      case 'PROSES': case 'DALAM_PROSES': return 'Proses';
      case 'SELESAI': return 'Selesai';
      case 'DIBATALKAN': return 'Dibatalkan';
      default: return s;
    }
  }

  Future<void> _updateStatus(ProductionOrder order, String newStatus) async {
    try {
      await ref.read(productionServiceProvider).updateOrderStatus(order.id, newStatus);
      if (mounted) { showSuccessSnackbar(context, 'Status SPK diperbarui'); _loadData(); }
    } on ApiException catch (e) {
      if (mounted) showErrorSnackbar(context, e.message);
    } catch (_) {
      if (mounted) showErrorSnackbar(context, 'Gagal memperbarui status');
    }
  }

  void _showDetail(ProductionOrder order) {
    final color = _statusColor(order.status);
    showModalBottomSheet(
      context: context, isScrollControlled: true, useSafeArea: true, backgroundColor: Colors.transparent,
      builder: (_) => DraggableScrollableSheet(
        initialChildSize: 0.85, minChildSize: 0.5, maxChildSize: 0.95, expand: false,
        builder: (_, scrollCtrl) => Container(
          decoration: const BoxDecoration(color: Colors.white, borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
          child: Column(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                decoration: BoxDecoration(border: Border(bottom: BorderSide(color: Colors.grey.shade200))),
                child: Row(children: [
                  Expanded(child: Text(order.nomorSpk ?? 'SPK', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600))),
                  IconButton(onPressed: () => Navigator.of(context).pop(), icon: const Icon(Icons.close)),
                ]),
              ),
              Expanded(child: ListView(controller: scrollCtrl, padding: const EdgeInsets.all(20), children: [
                _infoRow('Pelanggan', order.pelangganNama ?? '-'),
                if (order.nomorInvoice != null) _infoRow('Invoice', order.nomorInvoice!),
                _infoRow('Prioritas', order.prioritas),
                _infoRow('Status', _statusLabel(order.status)),
                const SizedBox(height: 12),
                const Text('Item Produksi', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                const SizedBox(height: 8),
                ...order.items.map((item) => Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Row(children: [
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(item.barangNama ?? '-', style: const TextStyle(fontSize: 13)),
                      Text('Qty: ${item.quantity} · ${_statusLabel(item.status)}', style: TextStyle(fontSize: 11, color: Colors.grey.shade600)),
                    ])),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(color: _statusColor(item.status).withValues(alpha: 0.1), borderRadius: BorderRadius.circular(8)),
                      child: Text(_statusLabel(item.status), style: TextStyle(color: _statusColor(item.status), fontSize: 10, fontWeight: FontWeight.w600)),
                    ),
                  ]),
                )),
                const SizedBox(height: 16),
                if (order.status == 'MENUNGGU')
                  SizedBox(width: double.infinity, child: FilledButton.icon(onPressed: () { Navigator.of(context).pop(); _updateStatus(order, 'PROSES'); }, icon: const Icon(Icons.play_arrow, size: 18), label: const Text('Lanjutkan ke Proses'))),
                if (order.status == 'PROSES' || order.status == 'DALAM_PROSES')
                  SizedBox(width: double.infinity, child: FilledButton.icon(onPressed: () { Navigator.of(context).pop(); _updateStatus(order, 'SELESAI'); }, icon: const Icon(Icons.check, size: 18), label: const Text('Tandai Selesai'), style: FilledButton.styleFrom(backgroundColor: AppColors.success))),
              ])),
            ],
          ),
        ),
      ),
    );
  }

  Widget _infoRow(String label, String value) => Padding(
    padding: const EdgeInsets.only(bottom: 4),
    child: Row(children: [
      SizedBox(width: 80, child: Text(label, style: TextStyle(fontSize: 12, color: Colors.grey.shade600))),
      Expanded(child: Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500))),
    ]),
  );

  @override
  Widget build(BuildContext context) {
    final filtered = _filtered;
    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
        child: Row(children: [
          const Text('SPK', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
            decoration: BoxDecoration(color: const Color(0xFFE65100).withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
            child: Text('${_orders.length}', style: const TextStyle(color: Color(0xFFE65100), fontWeight: FontWeight.w600, fontSize: 13)),
          ),
        ]),
      ),
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
        child: TextField(
          decoration: InputDecoration(
            hintText: 'Cari SPK atau pelanggan...', prefixIcon: const Icon(Icons.search, size: 20),
            suffixIcon: _search.isNotEmpty ? IconButton(icon: const Icon(Icons.clear, size: 18), onPressed: () => setState(() => _search = '')) : null,
            filled: true, fillColor: Theme.of(context).colorScheme.surfaceContainerHighest.withValues(alpha: 0.3),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(28), borderSide: BorderSide.none),
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          ),
          onChanged: (v) => setState(() => _search = v),
        ),
      ),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        child: SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(children: _statuses.map((label) {
            final isSelected = _activeFilter == label;
            return Padding(
              padding: const EdgeInsets.only(right: 6),
              child: FilterChip(
                label: Text(label, style: TextStyle(fontSize: 12, fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal)),
                selected: isSelected, onSelected: (_) => setState(() => _activeFilter = label),
                selectedColor: const Color(0xFFE65100).withValues(alpha: 0.15), checkmarkColor: const Color(0xFFE65100),
                visualDensity: VisualDensity.compact,
              ),
            );
          }).toList()),
        ),
      ),
      Expanded(child: _buildBody(filtered)),
    ]);
  }

  Widget _buildBody(List<ProductionOrder> filtered) {
    if (_isLoading) return const Center(child: CircularProgressIndicator());
    if (_orders.isEmpty) return EmptyState(icon: Icons.print_rounded, title: 'Belum ada SPK');
    if (filtered.isEmpty) return EmptyState(icon: Icons.search_off_rounded, title: 'Tidak ditemukan', subtitle: 'Coba kata kunci lain atau ubah filter');
    return RefreshIndicator(onRefresh: _loadData, child: ListView.builder(padding: const EdgeInsets.fromLTRB(16, 4, 16, 16), itemCount: filtered.length, itemBuilder: (_, i) => _buildCard(filtered[i])));
  }

  Widget _buildCard(ProductionOrder o) {
    final color = _statusColor(o.status);
    return Card(
      margin: const EdgeInsets.only(bottom: 6),
      child: InkWell(
        borderRadius: BorderRadius.circular(12), onTap: () => _showDetail(o),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(children: [
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Flexible(child: Text(o.nomorSpk ?? '-', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14), overflow: TextOverflow.ellipsis)),
                const SizedBox(width: 6),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(8)),
                  child: Text(_statusLabel(o.status), style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w600)),
                ),
              ]),
              const SizedBox(height: 2),
              Text('${o.pelangganNama ?? '-'} · ${o.items.length} item', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
              if (o.createdAt != null) Text(_dateFmt.format(DateTime.parse(o.createdAt!)), style: TextStyle(fontSize: 10, color: Colors.grey.shade500)),
            ])),
            Icon(Icons.chevron_right, color: Colors.grey.shade400, size: 20),
          ]),
        ),
      ),
    );
  }
}
```

- [ ] **Step 4: Run tests + flutter analyze**

```bash
cd flutter && flutter test test/features/production_page_test.dart && flutter analyze lib/features/production/
```

Expected: PASS tests, 0 analysis errors.

- [ ] **Step 5: Commit**

```bash
cd /home/gemi/Projects/gemiprintaio
git add flutter/lib/features/production/production_page.dart flutter/test/features/production_page_test.dart
git commit -m "feat(flutter): rewrite SPK page dengan Material 3 UI + update status"
```

---
---

## Final Verification (after all tasks)

- [ ] **Full test suite:**

```bash
cd flutter && flutter test
```

Expected: all tests pass.

- [ ] **Flutter analyze:**

```bash
cd flutter && flutter analyze
```

Expected: 0 issues.

- [ ] **Backend tests:**

```bash
npx jest src/app/api/pos/sales/ --no-coverage
```

Expected: API test passes.
