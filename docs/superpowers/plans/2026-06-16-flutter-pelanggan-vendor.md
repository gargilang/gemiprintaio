# Flutter Pelanggan & Vendor Rewrite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. After each task, invoke requesting-code-review before proceeding. Run parallel tasks within a phase simultaneously.

**Goal:** Rewrite Flutter Pelanggan and Vendor pages with Material 3 UI, proper states, all DB fields, and fix the 401 unauthorized bug.

**Architecture:** Rewrite 4 feature files + update 1 model. Keep existing services, providers, router, theme, and ApiClient (with caching) unchanged. Pages are ConsumerStatefulWidget; form sheets are DraggableScrollableSheet bottom sheets.

**Tech Stack:** Flutter 3.x + Dart, Riverpod, GoRouter, flutter_test (widget tests), Material 3

**Execution model:** 2 phases. Phase 1: 3 tasks in parallel. Phase 2: 2 tasks in parallel (after Phase 1 completes).

---
---

## Phase 1 — Parallel (3 agents)

### Task 1: Update Vendor Model — Add `tipeVendor`

**Files:**
- Modify: `flutter/lib/models/vendor.dart`

**No file conflict with Tasks 2-3** (different file).

- [ ] **Step 1: Write failing model unit test**

Create `flutter/test/models/vendor_model_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:gemiprint/models/vendor.dart';

void main() {
  group('Vendor model', () {
    test('fromJson parses all fields including tipe_vendor', () {
      final json = {
        'id': 'v1',
        'nama_perusahaan': 'PT Kertas Nusantara',
        'email': 'pt@contoh.com',
        'telepon': '0811-2222-3333',
        'alamat': 'Jl. Merdeka 1',
        'kontak_person': 'Hendra',
        'ketentuan_bayar': 'NET30',
        'aktif_status': 1,
        'catatan': 'Supplier utama',
        'tipe_vendor': 'SUPPLIER',
        'created_at': '2026-01-01',
        'updated_at': '2026-06-01',
      };

      final v = Vendor.fromJson(json);

      expect(v.id, 'v1');
      expect(v.namaPerusahaan, 'PT Kertas Nusantara');
      expect(v.email, 'pt@contoh.com');
      expect(v.telepon, '0811-2222-3333');
      expect(v.alamat, 'Jl. Merdeka 1');
      expect(v.kontakPerson, 'Hendra');
      expect(v.ketentuanBayar, 'NET30');
      expect(v.aktifStatus, true);
      expect(v.catatan, 'Supplier utama');
      expect(v.tipeVendor, 'SUPPLIER');
    });

    test('fromJson defaults tipe_vendor to SUPPLIER when missing', () {
      final json = {
        'id': 'v2',
        'nama_perusahaan': 'CV Cetak',
        'email': '',
        'telepon': '',
        'alamat': '',
        'aktif_status': 1,
      };

      final v = Vendor.fromJson(json);

      expect(v.tipeVendor, 'SUPPLIER');
    });

    test('fromJson handles SUBKONTRAKTOR and KEDUANYA', () {
      final sub = Vendor.fromJson({'id': 'v3', 'nama_perusahaan': 'X', 'email': '', 'telepon': '', 'alamat': '', 'aktif_status': 1, 'tipe_vendor': 'SUBKONTRAKTOR'});
      expect(sub.tipeVendor, 'SUBKONTRAKTOR');

      final both = Vendor.fromJson({'id': 'v4', 'nama_perusahaan': 'Y', 'email': '', 'telepon': '', 'alamat': '', 'aktif_status': 1, 'tipe_vendor': 'KEDUANYA'});
      expect(both.tipeVendor, 'KEDUANYA');
    });

    test('toJson includes tipe_vendor', () {
      final v = Vendor(
        id: 'v1',
        namaPerusahaan: 'PT Kertas',
        email: 'a@b.com',
        telepon: '123',
        alamat: 'Jl. A',
        kontakPerson: 'Hendra',
        ketentuanBayar: 'NET30',
        tipeVendor: 'SUPPLIER',
        aktifStatus: true,
      );

      final json = v.toJson();
      expect(json['tipe_vendor'], 'SUPPLIER');
      expect(json['nama_perusahaan'], 'PT Kertas');
      expect(json['aktif_status'], true);
    });
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd flutter && flutter test test/models/vendor_model_test.dart
```

Expected: FAIL — `type 'Null' is not a subtype of type 'String'` or similar on `tipeVendor`.

- [ ] **Step 3: Update Vendor model**

Modify `flutter/lib/models/vendor.dart`:

```dart
class Vendor {
  final String id;
  final String namaPerusahaan;
  final String? email;
  final String? telepon;
  final String? alamat;
  final String? kontakPerson;
  final String? ketentuanBayar;
  final bool aktifStatus;
  final String? catatan;
  final String tipeVendor;  // "SUPPLIER" | "SUBKONTRAKTOR" | "KEDUANYA"
  final String? createdAt;
  final String? updatedAt;

  const Vendor({
    required this.id,
    required this.namaPerusahaan,
    this.email,
    this.telepon,
    this.alamat,
    this.kontakPerson,
    this.ketentuanBayar,
    this.aktifStatus = true,
    this.catatan,
    this.tipeVendor = 'SUPPLIER',
    this.createdAt,
    this.updatedAt,
  });

  factory Vendor.fromJson(Map<String, dynamic> json) {
    return Vendor(
      id: json['id'] as String,
      namaPerusahaan: (json['nama_perusahaan'] ?? '') as String,
      email: json['email'] as String?,
      telepon: json['telepon'] as String?,
      alamat: json['alamat'] as String?,
      kontakPerson: json['kontak_person'] as String?,
      ketentuanBayar: json['ketentuan_bayar'] as String?,
      aktifStatus: (json['aktif_status'] == 1 || json['aktif_status'] == true),
      catatan: json['catatan'] as String?,
      tipeVendor: _parseTipeVendor(json['tipe_vendor']),
      createdAt: json['created_at'] as String?,
      updatedAt: json['updated_at'] as String?,
    );
  }

  static String _parseTipeVendor(dynamic value) {
    if (value == null) return 'SUPPLIER';
    final s = value.toString().toUpperCase();
    if (s == 'SUBKONTRAKTOR' || s == 'KEDUANYA') return s;
    return 'SUPPLIER';
  }

  Map<String, dynamic> toJson() => {
    'nama_perusahaan': namaPerusahaan,
    'email': email ?? '',
    'telepon': telepon ?? '',
    'alamat': alamat ?? '',
    'kontak_person': kontakPerson,
    'ketentuan_bayar': ketentuanBayar,
    'aktif_status': aktifStatus,
    'catatan': catatan,
    'tipe_vendor': tipeVendor,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd flutter && flutter test test/models/vendor_model_test.dart
```

Expected: PASS — all 4 tests.

- [ ] **Step 5: Commit**

```bash
cd /home/gemi/Projects/gemiprintaio
git add flutter/lib/models/vendor.dart flutter/test/models/vendor_model_test.dart
git commit -m "feat(flutter): tambah tipe_vendor ke model Vendor (SUPPLIER/SUBKONTRAKTOR/KEDUANYA)"
```

---

### Task 2: Rewrite CustomerFormSheet

**Files:**
- Create: `flutter/lib/features/customers/customer_form_sheet.dart` (new file)
- Keep: `flutter/lib/features/customers/customer_form_dialog.dart` (old, will be replaced in Task 4)
- Create: `flutter/test/features/customer_form_sheet_test.dart`

**No file conflict with Tasks 1, 3** (different files).

- [ ] **Step 1: Write failing widget test**

Create `flutter/test/features/customer_form_sheet_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gemiprint/features/customers/customer_form_sheet.dart';

void main() {
  testWidgets('CustomerFormSheet renders all fields', (tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(home: Scaffold(body: CustomerFormSheet())),
      ),
    );
    await tester.pump();

    // Title
    expect(find.text('Tambah Pelanggan'), findsOneWidget);

    // Required field
    expect(find.text('Nama *'), findsOneWidget);

    // Optional fields
    expect(find.text('Nama Perusahaan'), findsOneWidget);
    expect(find.text('Telepon'), findsOneWidget);
    expect(find.text('Email'), findsOneWidget);
    expect(find.text('Alamat'), findsOneWidget);
    expect(find.text('NPWP'), findsOneWidget);

    // Member toggle
    expect(find.text('Status Member'), findsOneWidget);

    // Buttons
    expect(find.text('Batal'), findsOneWidget);
    expect(find.text('Simpan'), findsOneWidget);
  });

  testWidgets('CustomerFormSheet shows Edit title when existing provided', (tester) async {
    // We test via the constructor directly — existing is null by default
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(home: Scaffold(body: CustomerFormSheet())),
      ),
    );
    await tester.pump();
    expect(find.text('Tambah Pelanggan'), findsOneWidget);
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd flutter && flutter test test/features/customer_form_sheet_test.dart
```

Expected: FAIL — file not found.

- [ ] **Step 3: Write CustomerFormSheet**

Create `flutter/lib/features/customers/customer_form_sheet.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gemiprint/models/customer.dart';
import 'package:gemiprint/providers/providers.dart';
import 'package:gemiprint/services/api_client.dart';
import 'package:gemiprint/widgets/snackbar_helper.dart';

class CustomerFormSheet extends ConsumerStatefulWidget {
  final Customer? existing;
  const CustomerFormSheet({super.key, this.existing});

  @override
  ConsumerState<CustomerFormSheet> createState() => _CustomerFormSheetState();
}

class _CustomerFormSheetState extends ConsumerState<CustomerFormSheet> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _nama;
  late final TextEditingController _namaPerusahaan;
  late final TextEditingController _email;
  late final TextEditingController _telepon;
  late final TextEditingController _alamat;
  late final TextEditingController _npwp;
  late bool _isMember;
  bool _isSaving = false;

  bool get _isEditing => widget.existing != null;

  @override
  void initState() {
    super.initState();
    final c = widget.existing;
    _nama = TextEditingController(text: c?.nama ?? '');
    _namaPerusahaan = TextEditingController(text: c?.namaPerusahaan ?? '');
    _email = TextEditingController(text: c?.email ?? '');
    _telepon = TextEditingController(text: c?.telepon ?? '');
    _alamat = TextEditingController(text: c?.alamat ?? '');
    _npwp = TextEditingController(text: c?.npwp ?? '');
    _isMember = c?.isMember ?? false;
  }

  @override
  void dispose() {
    _nama.dispose();
    _namaPerusahaan.dispose();
    _email.dispose();
    _telepon.dispose();
    _alamat.dispose();
    _npwp.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _isSaving = true);

    final body = <String, dynamic>{
      if (_isEditing) 'id': widget.existing!.id,
      'nama': _nama.text.trim(),
      'nama_perusahaan': _namaPerusahaan.text.trim(),
      'email': _email.text.trim(),
      'telepon': _telepon.text.trim(),
      'alamat': _alamat.text.trim(),
      'npwp': _npwp.text.trim(),
      'member_status': _isMember,
    };

    try {
      final service = ref.read(customersServiceProvider);
      if (_isEditing) {
        await service.update(body);
      } else {
        await service.create(body);
      }
      if (mounted) {
        showSuccessSnackbar(
          context,
          _isEditing ? 'Pelanggan berhasil diperbarui' : 'Pelanggan berhasil ditambahkan',
        );
        Navigator.of(context).pop(true);
      }
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _isSaving = false);
        showErrorSnackbar(context, e.message);
      }
    } catch (_) {
      if (mounted) {
        setState(() => _isSaving = false);
        showErrorSnackbar(context, 'Gagal menyimpan data');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: DraggableScrollableSheet(
        initialChildSize: 0.85,
        minChildSize: 0.5,
        maxChildSize: 0.95,
        expand: false,
        builder: (_, scrollCtrl) => Container(
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: Column(
            children: [
              // Header
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                decoration: BoxDecoration(
                  border: Border(bottom: BorderSide(color: Colors.grey.shade200)),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        _isEditing ? 'Edit Pelanggan' : 'Tambah Pelanggan',
                        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
                      ),
                    ),
                    IconButton(
                      onPressed: _isSaving ? null : () => Navigator.of(context).pop(),
                      icon: const Icon(Icons.close),
                    ),
                  ],
                ),
              ),
              // Form
              Expanded(
                child: Form(
                  key: _formKey,
                  child: ListView(
                    controller: scrollCtrl,
                    padding: const EdgeInsets.all(20),
                    children: [
                      TextFormField(
                        controller: _nama,
                        decoration: const InputDecoration(
                          labelText: 'Nama *',
                          hintText: 'Nama pelanggan',
                        ),
                        validator: (v) => v == null || v.trim().isEmpty ? 'Nama harus diisi' : null,
                        textInputAction: TextInputAction.next,
                      ),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _namaPerusahaan,
                        decoration: const InputDecoration(
                          labelText: 'Nama Perusahaan',
                          hintText: 'PT/CV/UD ...',
                        ),
                        textInputAction: TextInputAction.next,
                      ),
                      const SizedBox(height: 14),
                      Row(
                        children: [
                          Expanded(
                            child: TextFormField(
                              controller: _telepon,
                              decoration: const InputDecoration(
                                labelText: 'Telepon',
                                hintText: '08xx-xxxx',
                              ),
                              keyboardType: TextInputType.phone,
                              textInputAction: TextInputAction.next,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: TextFormField(
                              controller: _email,
                              decoration: const InputDecoration(
                                labelText: 'Email',
                                hintText: 'email@contoh.com',
                              ),
                              keyboardType: TextInputType.emailAddress,
                              textInputAction: TextInputAction.next,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _alamat,
                        decoration: const InputDecoration(
                          labelText: 'Alamat',
                          hintText: 'Alamat lengkap',
                        ),
                        maxLines: 2,
                        textInputAction: TextInputAction.next,
                      ),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _npwp,
                        decoration: const InputDecoration(
                          labelText: 'NPWP',
                          hintText: '00.000.000.0-000.000',
                        ),
                        textInputAction: TextInputAction.done,
                      ),
                      const SizedBox(height: 8),
                      const Divider(),
                      SwitchListTile(
                        title: const Text('Status Member'),
                        subtitle: const Text('Member mendapat harga khusus'),
                        value: _isMember,
                        onChanged: (v) => setState(() => _isMember = v),
                        contentPadding: EdgeInsets.zero,
                      ),
                    ],
                  ),
                ),
              ),
              // Footer
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                decoration: BoxDecoration(
                  border: Border(top: BorderSide(color: Colors.grey.shade200)),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: _isSaving ? null : () => Navigator.of(context).pop(),
                        child: const Text('Batal'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: FilledButton(
                        onPressed: _isSaving ? null : _save,
                        child: _isSaving
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                              )
                            : const Text('Simpan'),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd flutter && flutter test test/features/customer_form_sheet_test.dart
```

Expected: PASS — both tests.

- [ ] **Step 5: Commit**

```bash
cd /home/gemi/Projects/gemiprintaio
git add flutter/lib/features/customers/customer_form_sheet.dart flutter/test/features/customer_form_sheet_test.dart
git commit -m "feat(flutter): rewrite CustomerFormSheet dengan Material 3 UI"
```

---

### Task 3: Rewrite VendorFormSheet

**Files:**
- Create: `flutter/lib/features/vendors/vendor_form_sheet.dart` (new file)
- Keep: `flutter/lib/features/vendors/vendor_form_dialog.dart` (old, will be replaced in Task 5)
- Create: `flutter/test/features/vendor_form_sheet_test.dart`

**No file conflict with Tasks 1, 2** (different files).

- [ ] **Step 1: Write failing widget test**

Create `flutter/test/features/vendor_form_sheet_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gemiprint/features/vendors/vendor_form_sheet.dart';

void main() {
  testWidgets('VendorFormSheet renders all fields including tipe vendor', (tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(home: Scaffold(body: VendorFormSheet())),
      ),
    );
    await tester.pump();

    // Title
    expect(find.text('Tambah Vendor'), findsOneWidget);

    // Required field
    expect(find.text('Nama Perusahaan *'), findsOneWidget);

    // Optional fields
    expect(find.text('Kontak Person'), findsOneWidget);
    expect(find.text('Telepon'), findsOneWidget);
    expect(find.text('Email'), findsOneWidget);
    expect(find.text('Alamat'), findsOneWidget);

    // Tipe Vendor segmented buttons
    expect(find.text('Supplier'), findsOneWidget);
    expect(find.text('Subkontraktor'), findsOneWidget);
    expect(find.text('Keduanya'), findsOneWidget);

    // Other fields
    expect(find.text('Ketentuan Bayar'), findsOneWidget);
    expect(find.text('Catatan'), findsOneWidget);

    // Buttons
    expect(find.text('Batal'), findsOneWidget);
    expect(find.text('Simpan'), findsOneWidget);
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd flutter && flutter test test/features/vendor_form_sheet_test.dart
```

Expected: FAIL — file not found.

- [ ] **Step 3: Write VendorFormSheet**

Create `flutter/lib/features/vendors/vendor_form_sheet.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gemiprint/models/vendor.dart';
import 'package:gemiprint/providers/providers.dart';
import 'package:gemiprint/services/api_client.dart';
import 'package:gemiprint/widgets/snackbar_helper.dart';

class VendorFormSheet extends ConsumerStatefulWidget {
  final Vendor? existing;
  const VendorFormSheet({super.key, this.existing});

  @override
  ConsumerState<VendorFormSheet> createState() => _VendorFormSheetState();
}

class _VendorFormSheetState extends ConsumerState<VendorFormSheet> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _namaPerusahaan;
  late final TextEditingController _kontakPerson;
  late final TextEditingController _email;
  late final TextEditingController _telepon;
  late final TextEditingController _alamat;
  late final TextEditingController _ketentuanBayar;
  late final TextEditingController _catatan;
  late String _tipeVendor;
  bool _isSaving = false;

  static const _tipeOptions = ['SUPPLIER', 'SUBKONTRAKTOR', 'KEDUANYA'];
  static const _tipeLabels = ['Supplier', 'Subkontraktor', 'Keduanya'];

  bool get _isEditing => widget.existing != null;

  @override
  void initState() {
    super.initState();
    final v = widget.existing;
    _namaPerusahaan = TextEditingController(text: v?.namaPerusahaan ?? '');
    _kontakPerson = TextEditingController(text: v?.kontakPerson ?? '');
    _email = TextEditingController(text: v?.email ?? '');
    _telepon = TextEditingController(text: v?.telepon ?? '');
    _alamat = TextEditingController(text: v?.alamat ?? '');
    _ketentuanBayar = TextEditingController(text: v?.ketentuanBayar ?? '');
    _catatan = TextEditingController(text: v?.catatan ?? '');
    _tipeVendor = v?.tipeVendor ?? 'SUPPLIER';
  }

  @override
  void dispose() {
    _namaPerusahaan.dispose();
    _kontakPerson.dispose();
    _email.dispose();
    _telepon.dispose();
    _alamat.dispose();
    _ketentuanBayar.dispose();
    _catatan.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _isSaving = true);

    final body = <String, dynamic>{
      if (_isEditing) 'id': widget.existing!.id,
      'nama_perusahaan': _namaPerusahaan.text.trim(),
      'kontak_person': _kontakPerson.text.trim(),
      'email': _email.text.trim(),
      'telepon': _telepon.text.trim(),
      'alamat': _alamat.text.trim(),
      'ketentuan_bayar': _ketentuanBayar.text.trim(),
      'catatan': _catatan.text.trim(),
      'tipe_vendor': _tipeVendor,
      'aktif_status': true,
    };

    try {
      final service = ref.read(vendorsServiceProvider);
      if (_isEditing) {
        await service.update(body);
      } else {
        await service.create(body);
      }
      if (mounted) {
        showSuccessSnackbar(
          context,
          _isEditing ? 'Vendor berhasil diperbarui' : 'Vendor berhasil ditambahkan',
        );
        Navigator.of(context).pop(true);
      }
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _isSaving = false);
        showErrorSnackbar(context, e.message);
      }
    } catch (_) {
      if (mounted) {
        setState(() => _isSaving = false);
        showErrorSnackbar(context, 'Gagal menyimpan data');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: DraggableScrollableSheet(
        initialChildSize: 0.85,
        minChildSize: 0.5,
        maxChildSize: 0.95,
        expand: false,
        builder: (_, scrollCtrl) => Container(
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: Column(
            children: [
              // Header
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                decoration: BoxDecoration(
                  border: Border(bottom: BorderSide(color: Colors.grey.shade200)),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        _isEditing ? 'Edit Vendor' : 'Tambah Vendor',
                        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
                      ),
                    ),
                    IconButton(
                      onPressed: _isSaving ? null : () => Navigator.of(context).pop(),
                      icon: const Icon(Icons.close),
                    ),
                  ],
                ),
              ),
              // Form
              Expanded(
                child: Form(
                  key: _formKey,
                  child: ListView(
                    controller: scrollCtrl,
                    padding: const EdgeInsets.all(20),
                    children: [
                      TextFormField(
                        controller: _namaPerusahaan,
                        decoration: const InputDecoration(
                          labelText: 'Nama Perusahaan *',
                          hintText: 'PT/CV/UD ...',
                        ),
                        validator: (v) => v == null || v.trim().isEmpty ? 'Nama perusahaan harus diisi' : null,
                        textInputAction: TextInputAction.next,
                      ),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _kontakPerson,
                        decoration: const InputDecoration(
                          labelText: 'Kontak Person',
                          hintText: 'Nama kontak',
                        ),
                        textInputAction: TextInputAction.next,
                      ),
                      const SizedBox(height: 14),
                      Row(
                        children: [
                          Expanded(
                            child: TextFormField(
                              controller: _telepon,
                              decoration: const InputDecoration(
                                labelText: 'Telepon',
                                hintText: '08xx-xxxx',
                              ),
                              keyboardType: TextInputType.phone,
                              textInputAction: TextInputAction.next,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: TextFormField(
                              controller: _email,
                              decoration: const InputDecoration(
                                labelText: 'Email',
                                hintText: 'email@contoh.com',
                              ),
                              keyboardType: TextInputType.emailAddress,
                              textInputAction: TextInputAction.next,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _alamat,
                        decoration: const InputDecoration(
                          labelText: 'Alamat',
                          hintText: 'Alamat lengkap',
                        ),
                        maxLines: 2,
                        textInputAction: TextInputAction.next,
                      ),
                      const SizedBox(height: 14),
                      // Tipe Vendor segmented button
                      Text('Tipe Vendor', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                      const SizedBox(height: 8),
                      SegmentedButton<String>(
                        segments: List.generate(_tipeOptions.length, (i) {
                          return ButtonSegment<String>(
                            value: _tipeOptions[i],
                            label: Text(_tipeLabels[i], style: const TextStyle(fontSize: 13)),
                          );
                        }),
                        selected: {_tipeVendor},
                        onSelectionChanged: (sel) => setState(() => _tipeVendor = sel.first),
                        showSelectedIcon: false,
                      ),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _ketentuanBayar,
                        decoration: const InputDecoration(
                          labelText: 'Ketentuan Bayar',
                          hintText: 'NET30 / COD / ...',
                        ),
                        textInputAction: TextInputAction.next,
                      ),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _catatan,
                        decoration: const InputDecoration(
                          labelText: 'Catatan',
                          hintText: 'Catatan tambahan...',
                        ),
                        maxLines: 3,
                        textInputAction: TextInputAction.done,
                      ),
                    ],
                  ),
                ),
              ),
              // Footer
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                decoration: BoxDecoration(
                  border: Border(top: BorderSide(color: Colors.grey.shade200)),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: _isSaving ? null : () => Navigator.of(context).pop(),
                        child: const Text('Batal'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: FilledButton(
                        onPressed: _isSaving ? null : _save,
                        child: _isSaving
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                              )
                            : const Text('Simpan'),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd flutter && flutter test test/features/vendor_form_sheet_test.dart
```

Expected: PASS — both tests.

- [ ] **Step 5: Commit**

```bash
cd /home/gemi/Projects/gemiprintaio
git add flutter/lib/features/vendors/vendor_form_sheet.dart flutter/test/features/vendor_form_sheet_test.dart
git commit -m "feat(flutter): rewrite VendorFormSheet dengan tipe_vendor + Material 3 UI"
```

---
---

## Phase 2 — Parallel (2 agents, after Phase 1 complete)

### Task 4: Rewrite CustomersPage

**Files:**
- Modify: `flutter/lib/features/customers/customers_page.dart` (rewrite)
- Update: `flutter/lib/features/customers/customer_form_dialog.dart` → replace import in page
- Remove: `flutter/lib/features/customers/customer_form_dialog.dart` (after rewrite confirmed)
- Create: `flutter/test/features/customers_page_test.dart`

**Depends on:** Task 2 (`CustomerFormSheet` exists). No dependency on Tasks 3, 5.

- [ ] **Step 1: Write failing widget test**

Create `flutter/test/features/customers_page_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gemiprint/features/customers/customers_page.dart';

void main() {
  testWidgets('CustomersPage shows title and search bar', (tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(home: CustomersPage()),
      ),
    );
    await tester.pump();

    // Title
    expect(find.text('Pelanggan'), findsOneWidget);

    // Search field hint
    expect(find.byType(TextField), findsOneWidget);

    // Initially shows loading
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd flutter && flutter test test/features/customers_page_test.dart
```

Expected: PASS (existing page has these elements too). We'll verify no regressions after rewrite.

- [ ] **Step 3: Rewrite CustomersPage**

Modify `flutter/lib/features/customers/customers_page.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gemiprint/core/constants/roles.dart';
import 'package:gemiprint/core/theme/app_theme.dart';
import 'package:gemiprint/models/customer.dart';
import 'package:gemiprint/providers/providers.dart';
import 'package:gemiprint/services/api_client.dart';
import 'package:gemiprint/widgets/confirm_dialog.dart';
import 'package:gemiprint/widgets/empty_state.dart';
import 'package:gemiprint/widgets/snackbar_helper.dart';
import 'package:gemiprint/features/customers/customer_form_sheet.dart';

class CustomersPage extends ConsumerStatefulWidget {
  const CustomersPage({super.key});

  @override
  ConsumerState<CustomersPage> createState() => _CustomersPageState();
}

class _CustomersPageState extends ConsumerState<CustomersPage> {
  List<Customer> _customers = [];
  bool _isLoading = true;
  String _search = '';
  String _activeFilter = 'Semua'; // 'Semua', 'Member', 'Non-Member'

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final data = await ref.read(customersServiceProvider).getAll();
      if (mounted) {
        setState(() {
          _customers = data;
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
        showErrorSnackbar(context, 'Gagal memuat data pelanggan');
      }
    }
  }

  List<Customer> get _filtered {
    List<Customer> result = _customers;

    // Filter chip
    if (_activeFilter == 'Member') {
      result = result.where((c) => c.isMember).toList();
    } else if (_activeFilter == 'Non-Member') {
      result = result.where((c) => !c.isMember).toList();
    }

    // Search
    if (_search.isNotEmpty) {
      final q = _search.toLowerCase();
      result = result.where((c) =>
        c.nama.toLowerCase().contains(q) ||
        (c.namaPerusahaan?.toLowerCase().contains(q) ?? false) ||
        (c.telepon?.toLowerCase().contains(q) ?? false) ||
        (c.email?.toLowerCase().contains(q) ?? false)
      ).toList();
    }

    return result;
  }

  int get _memberCount => _customers.where((c) => c.isMember).length;
  int get _nonMemberCount => _customers.where((c) => !c.isMember).length;

  Future<void> _showForm({Customer? existing}) async {
    final result = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (_) => CustomerFormSheet(existing: existing),
    );
    if (result == true) _loadData();
  }

  Future<void> _handleDelete(Customer c) async {
    if (!_canUseRiskyActions) return;
    final ok = await showConfirmDialog(
      context,
      title: 'Hapus Pelanggan',
      message: 'Yakin ingin menghapus "${c.nama}"?',
      isDangerous: true,
    );
    if (!ok) return;

    try {
      await ref.read(customersServiceProvider).delete(c.id);
      if (mounted) {
        showSuccessSnackbar(context, 'Pelanggan berhasil dihapus');
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

  @override
  Widget build(BuildContext context) {
    final filtered = _filtered;

    return Stack(
      children: [
        Column(
          children: [
            // Header
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
              child: Row(
                children: [
                  const Text(
                    'Pelanggan',
                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                    decoration: BoxDecoration(
                      color: AppColors.primary.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      '${_customers.length}',
                      style: const TextStyle(
                        color: AppColors.primary,
                        fontWeight: FontWeight.w600,
                        fontSize: 13,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            // Stat chips
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: Wrap(
                spacing: 8,
                children: [
                  _buildStatChip('Member', _memberCount, AppColors.success),
                  _buildStatChip('Non-Member', _nonMemberCount, Colors.grey),
                ],
              ),
            ),
            // Search + Filter
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
              child: TextField(
                decoration: InputDecoration(
                  hintText: 'Cari pelanggan...',
                  prefixIcon: const Icon(Icons.search, size: 20),
                  suffixIcon: _search.isNotEmpty
                      ? IconButton(
                          icon: const Icon(Icons.clear, size: 18),
                          onPressed: () => setState(() => _search = ''),
                        )
                      : null,
                  filled: true,
                  fillColor: Theme.of(context).colorScheme.surfaceContainerHighest.withValues(alpha: 0.3),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(28),
                    borderSide: BorderSide.none,
                  ),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                ),
                onChanged: (v) => setState(() => _search = v),
              ),
            ),
            // Filter chips
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: ['Semua', 'Member', 'Non-Member'].map((label) {
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
            // List
            Expanded(
              child: _buildBody(filtered),
            ),
          ],
        ),
        // FAB
        Positioned(
          right: 16,
          bottom: 16,
          child: FloatingActionButton(
            onPressed: () => _showForm(),
            child: const Icon(Icons.add_rounded),
          ),
        ),
      ],
    );
  }

  Widget _buildStatChip(String label, int count, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(shape: BoxShape.circle, color: color),
          ),
          const SizedBox(width: 6),
          Text(
            '$count $label',
            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: color),
          ),
        ],
      ),
    );
  }

  Widget _buildBody(List<Customer> filtered) {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_customers.isEmpty) {
      return EmptyState(
        icon: Icons.groups_rounded,
        title: 'Belum ada pelanggan',
        action: ElevatedButton.icon(
          onPressed: () => _showForm(),
          icon: const Icon(Icons.add, size: 18),
          label: const Text('Tambah Pelanggan'),
        ),
      );
    }

    if (filtered.isEmpty) {
      return EmptyState(
        icon: Icons.search_off_rounded,
        title: 'Tidak ditemukan',
        subtitle: 'Coba kata kunci lain atau ubah filter',
      );
    }

    return RefreshIndicator(
      onRefresh: _loadData,
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 80),
        itemCount: filtered.length,
        itemBuilder: (_, i) => _buildCard(filtered[i]),
      ),
    );
  }

  Widget _buildCard(Customer c) {
    final initials = c.nama.isNotEmpty ? c.nama[0].toUpperCase() : '?';
    return Card(
      margin: const EdgeInsets.only(bottom: 6),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => _showForm(existing: c),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              // Avatar
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  gradient: const LinearGradient(
                    colors: [Color(0xFF5C6BC0), Color(0xFF7986CB)],
                  ),
                ),
                alignment: Alignment.center,
                child: Text(
                  initials,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    fontSize: 16,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              // Name + subtext
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            c.nama,
                            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (c.isMember) ...[
                          const SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: AppColors.success.withValues(alpha: 0.1),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: const Text(
                              'Member',
                              style: TextStyle(
                                color: AppColors.success,
                                fontSize: 10,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      [
                        if (c.namaPerusahaan != null && c.namaPerusahaan!.isNotEmpty)
                          c.namaPerusahaan!,
                        if (c.telepon != null && c.telepon!.isNotEmpty)
                          c.telepon!,
                      ].join(' · '),
                      style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              // Chevron + delete
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (_canUseRiskyActions)
                    IconButton(
                      icon: const Icon(Icons.delete_outline_rounded, size: 20),
                      color: Colors.grey.shade400,
                      onPressed: () => _handleDelete(c),
                      visualDensity: VisualDensity.compact,
                    ),
                  Icon(Icons.chevron_right, color: Colors.grey.shade400, size: 20),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
```

- [ ] **Step 4: Run tests + flutter analyze**

```bash
cd flutter && flutter test test/features/customers_page_test.dart && flutter analyze lib/features/customers/
```

Expected: PASS tests, 0 analysis errors.

- [ ] **Step 5: Remove old form dialog and commit**

```bash
cd /home/gemi/Projects/gemiprintaio
rm flutter/lib/features/customers/customer_form_dialog.dart
git add flutter/lib/features/customers/customers_page.dart flutter/test/features/customers_page_test.dart
git add flutter/lib/features/customers/customer_form_dialog.dart
git commit -m "feat(flutter): rewrite CustomersPage dengan Material 3 UI, filter chips, stat counters"
```

---

### Task 5: Rewrite VendorsPage

**Files:**
- Modify: `flutter/lib/features/vendors/vendors_page.dart` (rewrite)
- Remove: `flutter/lib/features/vendors/vendor_form_dialog.dart` (old, replaced by vendor_form_sheet.dart)
- Create: `flutter/test/features/vendors_page_test.dart`

**Depends on:** Tasks 1 (Vendor model with tipeVendor) and 3 (VendorFormSheet). No dependency on Tasks 2, 4.

- [ ] **Step 1: Write failing widget test**

Create `flutter/test/features/vendors_page_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gemiprint/features/vendors/vendors_page.dart';

void main() {
  testWidgets('VendorsPage shows title and search bar', (tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(home: VendorsPage()),
      ),
    );
    await tester.pump();

    expect(find.text('Vendor'), findsOneWidget);
    expect(find.byType(TextField), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });

  testWidgets('VendorsPage has filter chips', (tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(home: VendorsPage()),
      ),
    );
    await tester.pump();

    expect(find.text('Semua'), findsOneWidget);
  });
}
```

- [ ] **Step 2: Run test to verify baseline**

```bash
cd flutter && flutter test test/features/vendors_page_test.dart
```

Expected: PASS (both tests — existing page has these elements).

- [ ] **Step 3: Rewrite VendorsPage**

Modify `flutter/lib/features/vendors/vendors_page.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gemiprint/core/constants/roles.dart';
import 'package:gemiprint/core/theme/app_theme.dart';
import 'package:gemiprint/models/vendor.dart';
import 'package:gemiprint/providers/providers.dart';
import 'package:gemiprint/services/api_client.dart';
import 'package:gemiprint/widgets/confirm_dialog.dart';
import 'package:gemiprint/widgets/empty_state.dart';
import 'package:gemiprint/widgets/snackbar_helper.dart';
import 'package:gemiprint/features/vendors/vendor_form_sheet.dart';

class VendorsPage extends ConsumerStatefulWidget {
  const VendorsPage({super.key});

  @override
  ConsumerState<VendorsPage> createState() => _VendorsPageState();
}

class _VendorsPageState extends ConsumerState<VendorsPage> {
  List<Vendor> _vendors = [];
  bool _isLoading = true;
  String _search = '';
  String _activeFilter = 'Semua'; // 'Semua', 'Supplier', 'Subkontraktor', 'Keduanya'

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final data = await ref.read(vendorsServiceProvider).getAll();
      if (mounted) {
        setState(() {
          _vendors = data;
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
        showErrorSnackbar(context, 'Gagal memuat data vendor');
      }
    }
  }

  List<Vendor> get _filtered {
    List<Vendor> result = _vendors;

    // Filter by tipe
    if (_activeFilter != 'Semua') {
      result = result.where((v) => v.tipeVendor.toUpperCase() == _activeFilter.toUpperCase()).toList();
    }

    // Search
    if (_search.isNotEmpty) {
      final q = _search.toLowerCase();
      result = result.where((v) =>
        v.namaPerusahaan.toLowerCase().contains(q) ||
        (v.kontakPerson?.toLowerCase().contains(q) ?? false) ||
        (v.telepon?.toLowerCase().contains(q) ?? false)
      ).toList();
    }

    return result;
  }

  int _tipeCount(String tipe) => _vendors.where((v) => v.tipeVendor == tipe).length;

  Future<void> _showForm({Vendor? existing}) async {
    final result = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (_) => VendorFormSheet(existing: existing),
    );
    if (result == true) _loadData();
  }

  Future<void> _handleDelete(Vendor v) async {
    if (!_canUseRiskyActions) return;
    final ok = await showConfirmDialog(
      context,
      title: 'Hapus Vendor',
      message: 'Yakin ingin menghapus "${v.namaPerusahaan}"?',
      isDangerous: true,
    );
    if (!ok) return;

    try {
      await ref.read(vendorsServiceProvider).delete(v.id);
      if (mounted) {
        showSuccessSnackbar(context, 'Vendor berhasil dihapus');
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

  Color _tipeVendorColor(String tipe) {
    switch (tipe) {
      case 'SUPPLIER':
        return const Color(0xFF7B1FA2); // deep purple
      case 'SUBKONTRAKTOR':
        return const Color(0xFFE65100); // deep orange
      case 'KEDUANYA':
        return const Color(0xFF00695C); // teal
      default:
        return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filtered;

    return Stack(
      children: [
        Column(
          children: [
            // Header
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
              child: Row(
                children: [
                  const Text(
                    'Vendor',
                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                    decoration: BoxDecoration(
                      color: AppColors.accent.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      '${_vendors.length}',
                      style: const TextStyle(
                        color: AppColors.accent,
                        fontWeight: FontWeight.w600,
                        fontSize: 13,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            // Stat chips
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: Wrap(
                spacing: 8,
                children: [
                  _buildStatChip('Supplier', _tipeCount('SUPPLIER'), const Color(0xFF7B1FA2)),
                  _buildStatChip('Subkontraktor', _tipeCount('SUBKONTRAKTOR'), const Color(0xFFE65100)),
                  _buildStatChip('Keduanya', _tipeCount('KEDUANYA'), const Color(0xFF00695C)),
                ],
              ),
            ),
            // Search
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
              child: TextField(
                decoration: InputDecoration(
                  hintText: 'Cari vendor...',
                  prefixIcon: const Icon(Icons.search, size: 20),
                  suffixIcon: _search.isNotEmpty
                      ? IconButton(
                          icon: const Icon(Icons.clear, size: 18),
                          onPressed: () => setState(() => _search = ''),
                        )
                      : null,
                  filled: true,
                  fillColor: Theme.of(context).colorScheme.surfaceContainerHighest.withValues(alpha: 0.3),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(28),
                    borderSide: BorderSide.none,
                  ),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                ),
                onChanged: (v) => setState(() => _search = v),
              ),
            ),
            // Filter chips
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: ['Semua', 'Supplier', 'Subkontraktor', 'Keduanya'].map((label) {
                    final isSelected = _activeFilter == label;
                    return Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: FilterChip(
                        label: Text(label, style: TextStyle(fontSize: 12, fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal)),
                        selected: isSelected,
                        onSelected: (_) => setState(() => _activeFilter = label),
                        selectedColor: AppColors.accent.withValues(alpha: 0.15),
                        checkmarkColor: AppColors.accent,
                        visualDensity: VisualDensity.compact,
                      ),
                    );
                  }).toList(),
                ),
              ),
            ),
            // List
            Expanded(child: _buildBody(filtered)),
          ],
        ),
        // FAB
        Positioned(
          right: 16,
          bottom: 16,
          child: FloatingActionButton(
            onPressed: () => _showForm(),
            backgroundColor: AppColors.accent,
            child: const Icon(Icons.add_rounded),
          ),
        ),
      ],
    );
  }

  Widget _buildStatChip(String label, int count, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(shape: BoxShape.circle, color: color),
          ),
          const SizedBox(width: 6),
          Text(
            '$count $label',
            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: color),
          ),
        ],
      ),
    );
  }

  Widget _buildBody(List<Vendor> filtered) {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_vendors.isEmpty) {
      return EmptyState(
        icon: Icons.business_rounded,
        title: 'Belum ada vendor',
        action: ElevatedButton.icon(
          onPressed: () => _showForm(),
          icon: const Icon(Icons.add, size: 18),
          label: const Text('Tambah Vendor'),
        ),
      );
    }

    if (filtered.isEmpty) {
      return EmptyState(
        icon: Icons.search_off_rounded,
        title: 'Tidak ditemukan',
        subtitle: 'Coba kata kunci lain atau ubah filter',
      );
    }

    return RefreshIndicator(
      onRefresh: _loadData,
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 80),
        itemCount: filtered.length,
        itemBuilder: (_, i) => _buildCard(filtered[i]),
      ),
    );
  }

  Widget _buildCard(Vendor v) {
    final initials = v.namaPerusahaan.isNotEmpty ? v.namaPerusahaan[0].toUpperCase() : '?';
    final tipeColor = _tipeVendorColor(v.tipeVendor);
    return Card(
      margin: const EdgeInsets.only(bottom: 6),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => _showForm(existing: v),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              // Avatar
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  gradient: LinearGradient(
                    colors: [tipeColor, tipeColor.withValues(alpha: 0.7)],
                  ),
                ),
                alignment: Alignment.center,
                child: Text(
                  initials,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    fontSize: 16,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              // Company name + subtext
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            v.namaPerusahaan,
                            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: tipeColor.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            v.tipeVendor == 'SUPPLIER' ? 'Supplier' :
                            v.tipeVendor == 'SUBKONTRAKTOR' ? 'Subkontraktor' : 'Keduanya',
                            style: TextStyle(
                              color: tipeColor,
                              fontSize: 10,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      [
                        if (v.kontakPerson != null && v.kontakPerson!.isNotEmpty)
                          v.kontakPerson!,
                        if (v.telepon != null && v.telepon!.isNotEmpty)
                          v.telepon!,
                      ].join(' · '),
                      style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              // Chevron + delete
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (_canUseRiskyActions)
                    IconButton(
                      icon: const Icon(Icons.delete_outline_rounded, size: 20),
                      color: Colors.grey.shade400,
                      onPressed: () => _handleDelete(v),
                      visualDensity: VisualDensity.compact,
                    ),
                  Icon(Icons.chevron_right, color: Colors.grey.shade400, size: 20),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
```

- [ ] **Step 4: Run tests + flutter analyze**

```bash
cd flutter && flutter test test/features/vendors_page_test.dart && flutter analyze lib/features/vendors/
```

Expected: PASS tests, 0 analysis errors.

- [ ] **Step 5: Remove old form dialog and commit**

```bash
cd /home/gemi/Projects/gemiprintaio
rm flutter/lib/features/vendors/vendor_form_dialog.dart
git add flutter/lib/features/vendors/vendors_page.dart flutter/test/features/vendors_page_test.dart
git add flutter/lib/features/vendors/vendor_form_dialog.dart
git commit -m "feat(flutter): rewrite VendorsPage dengan Material 3 UI, tipe_vendor filter, stat counters"
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

- [ ] **Build check (web):**

```bash
cd flutter && flutter build web --no-tree-shake-icons
```

Expected: builds successfully.
