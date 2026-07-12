# Flutter POS Web Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membawa perubahan POS/Kasir web setelah commit Flutter terakhir (`cec0a5d`) ke halaman Flutter yang relevan, dengan scope mobile-simple: kontrak transaksi benar, katalog maklon/extra existing dari web bisa dipakai, biaya tambahan modal terkirim, vendor `TRANSFER` didukung, dan riwayat/faktur memakai snapshot nama produk jual.

**Architecture:** Flutter tetap online-only melalui REST Next API. Backend REST `/api/pos/init-data` diekspos agar mengirim `katalogMaklon`, lalu Flutter memodelkan katalog maklon existing sebagai tile POS sederhana yang menghasilkan `CartItem` maklon. Flutter tidak punya UI/API untuk membuat, quick-add, edit, atau menghapus katalog; web app tetap source of truth. Payload checkout diselaraskan dengan kontrak web/backend tanpa mengubah Flutter menjadi full POS web desktop.

**Tech Stack:** Flutter 3/Dart SDK `^3.11.5`, Riverpod, Next.js App Router, TypeScript, Zod, Jest, `flutter_test`.

## Global Constraints

- Jangan implement fitur scope-out dari spec: parkir keranjang, PPN/NSFP, preview faktur sebelum checkout, popular sort, print thermal otomatis, tambah barang maklon/katalog extra, quick-add katalog, dan admin CRUD katalog maklon.
- UI/copy baru berbahasa Indonesia dan ringkas untuk layar mobile.
- Flutter tetap memakai REST API Next (`ApiClient`/`PosService`); jangan tambah Supabase client langsung.
- Payload harus backward-compatible: field baru opsional dan server lama yang tidak mengirim `katalogMaklon` harus tetap membuat Flutter POS berjalan dengan list kosong.
- `modal` biaya tambahan adalah data internal; tidak ditampilkan di dokumen customer.
- `TRANSFER` vendor maklon harus diterima backend schema sebelum Flutter mengirimnya.
- Jangan tambah POST/PUT/PATCH/DELETE katalog maklon untuk Flutter, dan jangan tambah UI Flutter untuk input nama/satuan/template katalog baru. Sheet katalog hanya untuk memilih/mengonfigurasi item katalog existing sebelum masuk cart.
- Jangan commit perubahan saat menjalankan plan kecuali user secara eksplisit meminta commit; bagian commit di tiap task bersifat opsional untuk operator yang memang diminta membuat commit.
- Setelah setiap task, jalankan test spesifik task. Verifikasi akhir: `npm run type-check`, `npx jest src/lib/__tests__/pos-schema-mobile-parity.test.ts`, `cd flutter && flutter test`.

---

## File Structure

### Backend web/API

- Modify: `src/app/api/pos/init-data/route.ts` — expose `katalogMaklon` ke Flutter.
- Modify: `src/lib/schemas/pos.ts` — schema checkout POS menerima `metode_bayar_vendor: "TRANSFER"`.
- Create: `src/lib/__tests__/pos-schema-mobile-parity.test.ts` — regression test kontrak mobile POS.

### Flutter models

- Modify: `flutter/lib/features/pos/models/cart_item.dart` — tambah field payload parity (`namaProdukJual`, `jumlahRoll`, `recommendedRollWidthM`, `katalogMaklonId`, `ItemBiaya.modal`).
- Create: `flutter/lib/features/pos/models/katalog_maklon.dart` — parser response `katalogMaklon`.
- Modify: `flutter/lib/models/sale.dart` — parse `nama_produk_jual` dan getter display label.

### Flutter POS UI

- Modify: `flutter/lib/features/pos/pos_page.dart` — load katalog maklon, filter/search kategori gabungan, route tap katalog, kirim payment metadata.
- Modify: `flutter/lib/features/pos/widgets/product_grid.dart` — tampilkan material + katalog maklon tile.
- Modify: `flutter/lib/features/pos/widgets/add_item_sheet.dart` — kirim snapshot produk jual/roll metadata dan input modal biaya tambahan.
- Create: `flutter/lib/features/pos/widgets/katalog_maklon_sheet.dart` — sheet pilih/konfigurasi item katalog maklon existing, termasuk dimensi/pending vendor; bukan sheet buat katalog baru.
- Modify: `flutter/lib/features/pos/widgets/maklon_form_sheet.dart` — opsi `TRANSFER` untuk maklon ad-hoc.
- Modify: `flutter/lib/features/pos/widgets/payment_sheet.dart` — prioritas + catatan.
- Modify: `flutter/lib/features/sales_history/sales_history_page.dart` — gunakan display label `namaProdukJual` pada item transaksi yang dirender di riwayat.
- Modify: `flutter/lib/core/penjualan_cetak_utils.dart` — gunakan display label `namaProdukJual` pada output cetak/faktur.

### Tests

- Modify: `flutter/test/pos/cart_item_test.dart`
- Create: `flutter/test/models/katalog_maklon_test.dart`
- Create: `flutter/test/models/sale_model_test.dart`
- Run existing targeted tests listed in Task 6; do not add brittle full POS widget tests unless a changed widget already has stable provider mocks.

---

### Task 1: Backend REST/schema parity untuk Flutter

**Files:**
- Modify: `src/app/api/pos/init-data/route.ts:7-16`
- Modify: `src/lib/schemas/pos.ts:35-58`
- Create: `src/lib/__tests__/pos-schema-mobile-parity.test.ts`

**Interfaces:**
- Produces REST response field `katalogMaklon: KatalogMaklon[]`.
- Produces schema checkout yang menerima `metode_bayar_vendor: "TRANSFER"` pada item maklon.
- Consumed by Task 4/5 Flutter katalog maklon and maklon checkout.

- [ ] **Step 1: Tulis failing schema test untuk mobile parity**

Buat `src/lib/__tests__/pos-schema-mobile-parity.test.ts`:

```ts
import { createSaleSchema } from "@/lib/schemas/pos";

describe("mobile POS parity schema", () => {
  const baseSale = {
    pelanggan_nama_snapshot: "Pelanggan Umum",
    items: [
      {
        barang_id: "barang-jasa-maklon",
        harga_satuan_id: "harga-jasa-maklon-pcs",
        jumlah: 1,
        nama_satuan: "pcs",
        nama_produk_jual: "Hardcover Custom",
        faktor_konversi: 1,
        harga_satuan: 120000,
        subtotal: 120000,
        tipe_item: "MAKLON",
        katalog_maklon_id: "kat-1",
        vendor_subkontrak_id: "vendor-1",
        biaya_subkontrak: 80000,
        metode_bayar_vendor: "TRANSFER",
        deskripsi_pekerjaan: "Hardcover Custom",
      },
    ],
    total_jumlah: 120000,
    jumlah_dibayar: 120000,
    jumlah_kembalian: 0,
    metode_pembayaran: "TRANSFER",
    prioritas: "NORMAL",
  };

  it("menerima vendor maklon TRANSFER", () => {
    expect(createSaleSchema.safeParse(baseSale).success).toBe(true);
  });

  it("menerima biaya tambahan dengan modal valid", () => {
    const sale = {
      ...baseSale,
      items: [
        {
          ...baseSale.items[0],
          biaya_tambahan: [{ label: "Ongkir", nominal: 20000, modal: 20000 }],
        },
      ],
      total_jumlah: 140000,
      jumlah_dibayar: 140000,
    };
    expect(createSaleSchema.safeParse(sale).success).toBe(true);
  });

  it("menolak modal biaya tambahan melebihi nominal", () => {
    const sale = {
      ...baseSale,
      items: [
        {
          ...baseSale.items[0],
          biaya_tambahan: [{ label: "Ongkir", nominal: 20000, modal: 25000 }],
        },
      ],
    };
    expect(createSaleSchema.safeParse(sale).success).toBe(false);
  });
});
```

- [ ] **Step 2: Jalankan test dan pastikan gagal karena `TRANSFER` belum diterima schema**

Run:

```bash
npx jest src/lib/__tests__/pos-schema-mobile-parity.test.ts -t "menerima vendor maklon TRANSFER"
```

Expected: FAIL dengan pesan enum `metode_bayar_vendor` tidak menerima `TRANSFER`.

- [ ] **Step 3: Update schema vendor maklon**

Di `src/lib/schemas/pos.ts`, ubah field `metode_bayar_vendor` dari:

```ts
metode_bayar_vendor: z.enum(["CASH", "NET30"]).nullable().optional(),
```

menjadi:

```ts
metode_bayar_vendor: z.enum(["CASH", "NET30", "TRANSFER"]).nullable().optional(),
```

- [ ] **Step 4: Expose `katalogMaklon` di REST init-data**

Di `src/app/api/pos/init-data/route.ts`, response JSON harus menjadi:

```ts
return NextResponse.json({
  success: true,
  customers: data.customers,
  materials: data.materials,
  sales: data.sales,
  subkontraktor: data.subkontraktor,
  katalogMaklon: data.katalogMaklon ?? [],
});
```

- [ ] **Step 5: Jalankan targeted test**

Run:

```bash
npx jest src/lib/__tests__/pos-schema-mobile-parity.test.ts
```

Expected: PASS 3 tests.

- [ ] **Step 6: Type-check backend**

Run:

```bash
npm run type-check
```

Expected: 0 TypeScript error.

- [ ] **Step 7: Optional commit if user requested commits**

```bash
git add src/app/api/pos/init-data/route.ts src/lib/schemas/pos.ts src/lib/__tests__/pos-schema-mobile-parity.test.ts
git commit -m "fix(pos): expose katalog maklon and vendor transfer for mobile"
```

---

### Task 2: Flutter model parity (`CartItem`, `KatalogMaklon`, `SaleItem`)

**Files:**
- Modify: `flutter/lib/features/pos/models/cart_item.dart:3-120`
- Create: `flutter/lib/features/pos/models/katalog_maklon.dart`
- Modify: `flutter/lib/models/sale.dart:87-158`
- Modify: `flutter/test/pos/cart_item_test.dart`
- Create: `flutter/test/models/katalog_maklon_test.dart`
- Create: `flutter/test/models/sale_model_test.dart`

**Interfaces:**
- Produces `KatalogMaklon.fromJson(Map<String, dynamic>)`.
- Produces `ItemBiaya(label, nominal, modal)` with `toJson()`.
- Produces `CartItem.toSalePayload()` fields required by spec.
- Produces `SaleItem.displayName` using `namaProdukJual ?? barangNama ?? barangId`.

- [ ] **Step 1: Add failing tests for `CartItem` payload**

Append to `flutter/test/pos/cart_item_test.dart`:

```dart
  group('mobile POS parity payload', () {
    test('ItemBiaya.toJson menyertakan modal hanya saat > 0', () {
      expect(
        const ItemBiaya(label: 'Ongkir', nominal: 20000, modal: 20000).toJson(),
        {'label': 'Ongkir', 'nominal': 20000.0, 'modal': 20000.0},
      );
      expect(
        const ItemBiaya(label: 'Editing', nominal: 15000).toJson(),
        {'label': 'Editing', 'nominal': 15000.0},
      );
    });

    test('toSalePayload mengirim nama_produk_jual, jumlah_roll, recommended roll, dan katalog_maklon_id', () {
      final item = CartItem(
        barangId: kIdBarangPlaceholderMaklon,
        barangNama: 'UV Board Maklon',
        hargaSatuanId: kIdHargaPlaceholderMaklon,
        namaSatuan: 'm²',
        namaProdukJual: 'UV Board Maklon',
        faktorKonversi: 1,
        hargaSatuan: 85000,
        originalHargaSatuan: 85000,
        butuhDimensi: true,
        panjang: 2,
        lebar: 1,
        jumlahRoll: 1,
        recommendedRollWidthM: 1,
        jumlah: 2,
        tipeItem: 'MAKLON',
        vendorSubkontrakId: 'vendor-1',
        biayaSubkontrak: 100000,
        metodeBayarVendor: 'TRANSFER',
        deskripsiPekerjaan: 'UV Board Maklon',
        katalogMaklonId: 'kat-2',
        biayaTambahan: const [
          ItemBiaya(label: 'Packing', nominal: 10000, modal: 6000),
        ],
      );

      final payload = item.toSalePayload(170000);
      expect(payload['nama_produk_jual'], 'UV Board Maklon');
      expect(payload['jumlah_roll'], 1);
      expect(payload['recommended_roll_width_m'], 1);
      expect(payload['katalog_maklon_id'], 'kat-2');
      expect(payload['metode_bayar_vendor'], 'TRANSFER');
      expect(payload['biaya_tambahan'], [
        {'label': 'Packing', 'nominal': 10000.0, 'modal': 6000.0},
      ]);
    });
  });
```

- [ ] **Step 2: Add failing test for `KatalogMaklon` parser**

Create `flutter/test/models/katalog_maklon_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:gemiprint/features/pos/models/katalog_maklon.dart';

void main() {
  test('KatalogMaklon.fromJson parses defaults and flags', () {
    final item = KatalogMaklon.fromJson({
      'id': 'kat-1',
      'nama_produk': 'Hardcover Custom',
      'nama_satuan': 'pcs',
      'harga_jual_default': 120000,
      'biaya_subkontrak_default': 80000,
      'vendor_subkontrak_id_default': 'vendor-1',
      'metode_bayar_vendor_default': 'TRANSFER',
      'kategori_nama': 'Lain-lain',
      'populer_status': 1,
      'butuh_dimensi_status': 1,
      'is_aktif': 1,
    });

    expect(item.id, 'kat-1');
    expect(item.namaProduk, 'Hardcover Custom');
    expect(item.namaSatuan, 'pcs');
    expect(item.hargaJualDefault, 120000);
    expect(item.biayaSubkontrakDefault, 80000);
    expect(item.vendorSubkontrakIdDefault, 'vendor-1');
    expect(item.metodeBayarVendorDefault, 'TRANSFER');
    expect(item.kategoriNama, 'Lain-lain');
    expect(item.isPopuler, true);
    expect(item.butuhDimensi, true);
    expect(item.isAktif, true);
  });
});
```

- [ ] **Step 3: Add failing test for `SaleItem.displayName`**

Create `flutter/test/models/sale_model_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:gemiprint/models/sale.dart';

void main() {
  test('SaleItem displayName prefers nama_produk_jual', () {
    final item = SaleItem.fromJson({
      'id': 'it-1',
      'penjualan_id': 'sale-1',
      'barang_id': 'barang-1',
      'barang_nama': 'Banner',
      'nama_produk_jual': 'Banner Flexi 280',
      'jumlah': 1,
      'harga_satuan': 25000,
      'subtotal': 25000,
      'nama_satuan': 'm²',
    });

    expect(item.namaProdukJual, 'Banner Flexi 280');
    expect(item.displayName, 'Banner Flexi 280');
  });
});
```

- [ ] **Step 4: Run tests and confirm failure**

Run:

```bash
cd flutter && flutter test test/pos/cart_item_test.dart test/models/katalog_maklon_test.dart test/models/sale_model_test.dart
```

Expected: FAIL because fields/classes do not exist yet.

- [ ] **Step 5: Implement `KatalogMaklon` model**

Create `flutter/lib/features/pos/models/katalog_maklon.dart`:

```dart
class KatalogMaklon {
  final String id;
  final String namaProduk;
  final String namaSatuan;
  final double hargaJualDefault;
  final double biayaSubkontrakDefault;
  final String? vendorSubkontrakIdDefault;
  final String? metodeBayarVendorDefault;
  final String? kategori;
  final String? kategoriId;
  final String? kategoriNama;
  final int populerStatus;
  final bool butuhDimensi;
  final String? catatanInternal;
  final bool isAktif;

  const KatalogMaklon({
    required this.id,
    required this.namaProduk,
    required this.namaSatuan,
    required this.hargaJualDefault,
    required this.biayaSubkontrakDefault,
    this.vendorSubkontrakIdDefault,
    this.metodeBayarVendorDefault,
    this.kategori,
    this.kategoriId,
    this.kategoriNama,
    this.populerStatus = 0,
    this.butuhDimensi = false,
    this.catatanInternal,
    this.isAktif = true,
  });

  bool get isPopuler => populerStatus == 1;
  bool get hasCompleteVendorHpp =>
      (vendorSubkontrakIdDefault?.isNotEmpty ?? false) &&
      biayaSubkontrakDefault > 0 &&
      (metodeBayarVendorDefault?.isNotEmpty ?? false);

  factory KatalogMaklon.fromJson(Map<String, dynamic> json) {
    return KatalogMaklon(
      id: (json['id'] ?? '') as String,
      namaProduk: (json['nama_produk'] ?? '') as String,
      namaSatuan: (json['nama_satuan'] ?? 'pcs') as String,
      hargaJualDefault: (json['harga_jual_default'] as num?)?.toDouble() ?? 0,
      biayaSubkontrakDefault:
          (json['biaya_subkontrak_default'] as num?)?.toDouble() ?? 0,
      vendorSubkontrakIdDefault:
          json['vendor_subkontrak_id_default'] as String?,
      metodeBayarVendorDefault:
          json['metode_bayar_vendor_default'] as String?,
      kategori: json['kategori'] as String?,
      kategoriId: json['kategori_id'] as String?,
      kategoriNama: json['kategori_nama'] as String?,
      populerStatus: (json['populer_status'] as num?)?.toInt() ?? 0,
      butuhDimensi: _boolFromJson(json['butuh_dimensi_status']),
      catatanInternal: json['catatan_internal'] as String?,
      isAktif: _boolFromJson(json['is_aktif'], defaultValue: true),
    );
  }
}

bool _boolFromJson(Object? value, {bool defaultValue = false}) {
  if (value == null) return defaultValue;
  return value == true || value == 1 || value == '1';
}
```

- [ ] **Step 6: Extend `ItemBiaya` and `CartItem`**

In `flutter/lib/features/pos/models/cart_item.dart`, replace `ItemBiaya` with:

```dart
class ItemBiaya {
  final String label;
  final double nominal;
  final double modal;
  const ItemBiaya({
    required this.label,
    required this.nominal,
    this.modal = 0,
  });

  Map<String, dynamic> toJson() => {
        'label': label,
        'nominal': nominal,
        if (modal > 0) 'modal': modal,
      };
}
```

Add fields to `CartItem`:

```dart
final String? namaProdukJual;
final double? jumlahRoll;
final double? recommendedRollWidthM;
final String? katalogMaklonId;
```

Add constructor parameters:

```dart
this.namaProdukJual,
this.jumlahRoll,
this.recommendedRollWidthM,
this.katalogMaklonId,
```

Update `toSalePayload()` to include:

```dart
if (namaProdukJual != null && namaProdukJual!.trim().isNotEmpty)
  'nama_produk_jual': namaProdukJual!.trim(),
if (jumlahRoll != null) 'jumlah_roll': jumlahRoll,
if (recommendedRollWidthM != null)
  'recommended_roll_width_m': recommendedRollWidthM,
if (katalogMaklonId != null && katalogMaklonId!.trim().isNotEmpty)
  'katalog_maklon_id': katalogMaklonId,
```

Keep existing `selectedRollSize` emission for backward compatibility.

- [ ] **Step 7: Extend `SaleItem`**

In `flutter/lib/models/sale.dart`, add field:

```dart
final String? namaProdukJual;
```

Add constructor parameter:

```dart
this.namaProdukJual,
```

Add getter:

```dart
String get displayName {
  final produk = namaProdukJual?.trim();
  if (produk != null && produk.isNotEmpty) return produk;
  final barang = barangNama?.trim();
  if (barang != null && barang.isNotEmpty) return barang;
  return barangId;
}
```

In `SaleItem.fromJson`, parse:

```dart
namaProdukJual: json['nama_produk_jual'] as String?,
```

- [ ] **Step 8: Run model tests**

Run:

```bash
cd flutter && flutter test test/pos/cart_item_test.dart test/models/katalog_maklon_test.dart test/models/sale_model_test.dart
```

Expected: PASS.

- [ ] **Step 9: Optional commit if user requested commits**

```bash
git add flutter/lib/features/pos/models/cart_item.dart flutter/lib/features/pos/models/katalog_maklon.dart flutter/lib/models/sale.dart flutter/test/pos/cart_item_test.dart flutter/test/models/katalog_maklon_test.dart flutter/test/models/sale_model_test.dart
git commit -m "feat(flutter-pos): align sale item payload models"
```

---

### Task 3: Barang biasa — snapshot produk jual, roll metadata, dan biaya modal UI

**Files:**
- Modify: `flutter/lib/features/pos/widgets/add_item_sheet.dart:49-608`
- Modify: `flutter/lib/features/pos/pos_page.dart:129-160`
- Modify: `flutter/test/pos/cart_item_test.dart`

**Interfaces:**
- Consumes `CartItem.namaProdukJual`, `jumlahRoll`, `recommendedRollWidthM`, and `ItemBiaya.modal` from Task 2.
- Produces barang biasa payload matching backend web contract.

- [ ] **Step 1: Update material search to include product selling names**

In `flutter/lib/features/pos/pos_page.dart`, replace the search condition inside `_filtered` from:

```dart
return list.where((m) => m.nama.toLowerCase().contains(q)).toList();
```

with:

```dart
return list.where((m) {
  if (m.nama.toLowerCase().contains(q)) return true;
  return m.harga.any((p) => p.displayLabel.toLowerCase().contains(q));
}).toList();
```

- [ ] **Step 2: Add `namaProdukJual`, `jumlahRoll`, and `recommendedRollWidthM` when creating regular cart item**

In `_submit()` of `add_item_sheet.dart`, update `CartItem(...)` arguments:

```dart
namaProdukJual: _price.displayLabel,
jumlahRoll: _dim ? 1 : null,
recommendedRollWidthM: c.rollSize,
```

Place `namaProdukJual` near `namaSatuan`; place roll fields near dimension fields.

- [ ] **Step 3: Add modal input to biaya tambahan dialog**

In `_addBiaya()`, add controller:

```dart
final modalCtrl = TextEditingController();
```

Add a third `TextField` after nominal:

```dart
TextField(
  controller: modalCtrl,
  keyboardType: TextInputType.number,
  decoration: const InputDecoration(
    labelText: 'Modal (opsional)',
    prefixText: 'Rp ',
    helperText: 'Isi jika ada biaya pihak ketiga',
  ),
),
```

After dialog returns, replace current parsing block with:

```dart
if (ok == true) {
  final label = labelCtrl.text.trim();
  final nominal = double.tryParse(nominalCtrl.text) ?? 0;
  final modal = double.tryParse(modalCtrl.text) ?? 0;
  if (label.isEmpty || nominal <= 0) return;
  if (modal < 0 || modal > nominal) {
    setState(() => _error = 'Modal tidak boleh melebihi nominal biaya tambahan');
    return;
  }
  setState(() => _biayaTambahan.add(
        ItemBiaya(label: label, nominal: nominal, modal: modal),
      ));
}
```

- [ ] **Step 4: Show modal indicator in biaya list**

In the list rendering around lines `450-467`, replace the simple label text with a column:

```dart
Expanded(
  child: Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(e.value.label, style: const TextStyle(fontSize: 12)),
      if (e.value.modal > 0)
        Text(
          'Modal Rp ${formatPosUnitPrice(e.value.modal)}',
          style: TextStyle(fontSize: 10, color: Colors.grey.shade600),
        ),
    ],
  ),
),
```

- [ ] **Step 5: Run targeted Flutter tests**

Run:

```bash
cd flutter && flutter test test/pos/cart_item_test.dart
```

Expected: PASS.

- [ ] **Step 6: Optional commit if user requested commits**

```bash
git add flutter/lib/features/pos/widgets/add_item_sheet.dart flutter/lib/features/pos/pos_page.dart flutter/test/pos/cart_item_test.dart
git commit -m "feat(flutter-pos): send product snapshot and extra cost modal"
```

---

### Task 4: Tampilkan katalog maklon existing dan tambahkan ke cart

**Files:**
- Modify: `flutter/lib/features/pos/pos_page.dart`
- Modify: `flutter/lib/features/pos/widgets/product_grid.dart`
- Create: `flutter/lib/features/pos/widgets/katalog_maklon_sheet.dart`
- Uses: `flutter/lib/features/pos/models/katalog_maklon.dart`

**Interfaces:**
- Consumes `katalogMaklon` existing from REST init-data.
- Produces `CartItem` maklon with `katalogMaklonId` and optional pending vendor/HPP.
- Does **not** produce catalog creation/update/delete behavior.

Non-goals for this task:

- No POST/PUT/PATCH/DELETE route or client method for katalog maklon.
- No Flutter UI for new catalog name, satuan, default price, default vendor/HPP template, or category maintenance.
- No quick-add “Tambah Barang Maklon/Katalog Extra”; users must use web app for catalog management.

- [ ] **Step 1: Load katalog maklon existing in `PosPage`**

Add import:

```dart
import 'package:gemiprint/features/pos/models/katalog_maklon.dart';
import 'package:gemiprint/features/pos/widgets/katalog_maklon_sheet.dart';
```

Add state field:

```dart
List<KatalogMaklon> _katalogMaklon = [];
```

Inside `_load()` setState, parse:

```dart
_katalogMaklon = ((data['katalogMaklon'] as List?) ?? [])
    .map((j) => KatalogMaklon.fromJson(j as Map<String, dynamic>))
    .where((k) => k.isAktif)
    .toList();
```

- [ ] **Step 2: Merge categories**

In `_categories`, after collecting material categories, also collect katalog categories:

```dart
for (final k in _katalogMaklon) {
  final kategori = k.kategoriNama ?? k.kategori;
  if (kategori != null && kategori.isNotEmpty) names.add(kategori);
}
```

- [ ] **Step 3: Add filtered katalog getter**

Add getter to `PosPage`:

```dart
List<KatalogMaklon> get _filteredKatalogMaklon {
  var list = _katalogMaklon;
  if (_categoryFilter != 'ALL') {
    list = list.where((k) => (k.kategoriNama ?? k.kategori) == _categoryFilter).toList();
  }
  final q = _search.trim().toLowerCase();
  if (q.isEmpty) return list;
  return list.where((k) => k.namaProduk.toLowerCase().contains(q)).toList();
}
```

- [ ] **Step 4: Add tap handler for katalog maklon**

In `PosPage`, add:

```dart
Future<void> _addKatalogMaklon(KatalogMaklon katalog) async {
  final item = await showKatalogMaklonSheet(
    context,
    katalog: katalog,
    subkontraktor: _subkontraktor,
  );
  if (item != null) setState(() => _cart.add(item));
}
```

- [ ] **Step 5: Pass katalog to `ProductGrid`**

Update `ProductGrid(` call:

```dart
katalogMaklon: _filteredKatalogMaklon,
onTapKatalogMaklon: _addKatalogMaklon,
```

- [ ] **Step 6: Update `ProductGrid` signature**

In `product_grid.dart`, add import:

```dart
import 'package:gemiprint/features/pos/models/katalog_maklon.dart';
```

Add fields:

```dart
final List<KatalogMaklon> katalogMaklon;
final void Function(KatalogMaklon) onTapKatalogMaklon;
```

Add required constructor args.

Update grid count:

```dart
itemCount: materials.length + katalogMaklon.length + 1,
```

Update builder:

```dart
if (i < materials.length) return _card(materials[i]);
final katalogIndex = i - materials.length;
if (katalogIndex < katalogMaklon.length) {
  return _katalogMaklonCard(katalogMaklon[katalogIndex]);
}
return _maklonTile();
```

Add card widget:

```dart
Widget _katalogMaklonCard(KatalogMaklon k) {
  return GestureDetector(
    onTap: () => onTapKatalogMaklon(k),
    child: Container(
      decoration: BoxDecoration(
        color: Colors.purple.shade50,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.purple.shade200),
      ),
      padding: const EdgeInsets.all(8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  k.namaProduk,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 12,
                    color: Colors.purple.shade800,
                  ),
                ),
              ),
              if (k.butuhDimensi)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                  decoration: BoxDecoration(
                    color: Colors.blue.shade50,
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text('m²', style: TextStyle(fontSize: 8, color: Colors.blue.shade700)),
                ),
            ],
          ),
          const Spacer(),
          Text('Maklon · ${k.namaSatuan}', style: TextStyle(fontSize: 10, color: Colors.purple.shade400)),
          Text(
            'Rp ${formatPosUnitPrice(k.hargaJualDefault)}${k.butuhDimensi ? '/m²' : ''}',
            style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.bold, fontSize: 13),
          ),
        ],
      ),
    ),
  );
}
```

- [ ] **Step 7: Create `showKatalogMaklonSheet` untuk item existing**

Create `flutter/lib/features/pos/widgets/katalog_maklon_sheet.dart` with a small stateful bottom sheet for configuring an existing catalog item before adding it to cart. This sheet must not create or mutate katalog maklon records. Implement these exact rules:

```dart
Future<CartItem?> showKatalogMaklonSheet(
  BuildContext context, {
  required KatalogMaklon katalog,
  required List<SubkontraktorOption> subkontraktor,
})
```

The sheet must:

- Show the selected `katalog.namaProduk` as fixed context, not as an editable field for creating/renaming a catalog entry.
- Keep `_qtyCtrl = TextEditingController(text: '1')`, `_lebarCtrl`, `_panjangCtrl`, `_hargaCtrl` initialized from `katalog.hargaJualDefault.toStringAsFixed(0)`.
- Compute `jumlah`:
  - non-dimensi: `qty`
  - dimensi: `lebar * panjang * qty`
- Block only invalid qty/dimensions/harga jual (`<= 0`).
- Do not require vendor or biaya when `katalog.hasCompleteVendorHpp == false`.
- Before returning, resolve `vendorName` with an explicit loop:

```dart
String? vendorName;
if (katalog.hasCompleteVendorHpp) {
  for (final v in subkontraktor) {
    if (v.id == katalog.vendorSubkontrakIdDefault) {
      vendorName = v.namaPerusahaan;
      break;
    }
  }
}
```

- On submit, return:

```dart
CartItem(
  barangId: kIdBarangPlaceholderMaklon,
  barangNama: katalog.namaProduk,
  hargaSatuanId: kIdHargaPlaceholderMaklon,
  namaSatuan: katalog.namaSatuan,
  namaProdukJual: katalog.namaProduk,
  faktorKonversi: 1,
  hargaSatuan: harga,
  originalHargaSatuan: katalog.hargaJualDefault,
  butuhDimensi: katalog.butuhDimensi,
  panjang: katalog.butuhDimensi ? panjang : null,
  lebar: katalog.butuhDimensi ? lebar : null,
  jumlahRoll: katalog.butuhDimensi ? qty : null,
  jumlah: jumlah,
  tipeItem: 'MAKLON',
  vendorSubkontrakId: katalog.hasCompleteVendorHpp ? katalog.vendorSubkontrakIdDefault : null,
  vendorSubkontrakNama: katalog.hasCompleteVendorHpp ? vendorName : null,
  biayaSubkontrak: katalog.hasCompleteVendorHpp ? katalog.biayaSubkontrakDefault : null,
  metodeBayarVendor: katalog.hasCompleteVendorHpp ? katalog.metodeBayarVendorDefault : null,
  deskripsiPekerjaan: katalog.namaProduk,
  katalogMaklonId: katalog.id,
)
```

- [ ] **Step 8: Run analyzer/test smoke**

Run:

```bash
cd flutter && flutter test test/models/katalog_maklon_test.dart test/pos/cart_item_test.dart
```

Expected: PASS.

- [ ] **Step 9: Optional commit if user requested commits**

```bash
git add flutter/lib/features/pos/pos_page.dart flutter/lib/features/pos/widgets/product_grid.dart flutter/lib/features/pos/widgets/katalog_maklon_sheet.dart
git commit -m "feat(flutter-pos): use existing katalog maklon items"
```

---

### Task 5: Maklon ad-hoc `TRANSFER`, payment catatan/prioritas

**Files:**
- Modify: `flutter/lib/features/pos/widgets/maklon_form_sheet.dart:45-180`
- Modify: `flutter/lib/features/pos/widgets/payment_sheet.dart:5-201`
- Modify: `flutter/lib/features/pos/pos_page.dart:246-277`

**Interfaces:**
- Produces maklon ad-hoc with `metodeBayarVendor: "TRANSFER"`.
- Produces checkout payload with `catatan` and selected `prioritas`.

- [ ] **Step 1: Add `TRANSFER` chip to maklon ad-hoc**

In `maklon_form_sheet.dart`, after the `NET30` chip, add:

```dart
const SizedBox(width: 6),
ChoiceChip(
  label: const Text('TRANSFER', style: TextStyle(fontSize: 11)),
  selected: _metode == 'TRANSFER',
  onSelected: (_) => setState(() => _metode = 'TRANSFER'),
),
```

Keep vendor and biaya required for ad-hoc maklon.

- [ ] **Step 2: Extend `PaymentResult`**

In `payment_sheet.dart`, update class:

```dart
class PaymentResult {
  final String metode;
  final double dibayar;
  final double kembalian;
  final String prioritas;
  final String? catatan;
  const PaymentResult({
    required this.metode,
    required this.dibayar,
    required this.kembalian,
    this.prioritas = 'NORMAL',
    this.catatan,
  });
}
```

- [ ] **Step 3: Add controllers/state to payment sheet**

In `_PaymentBodyState`, add:

```dart
String _prioritas = 'NORMAL';
final _catatanCtrl = TextEditingController();
```

Dispose:

```dart
_catatanCtrl.dispose();
```

- [ ] **Step 4: Include fields in `PaymentResult`**

In `_process()`, return:

```dart
PaymentResult(
  metode: _metode,
  dibayar: _metode == 'NET30' ? 0 : _bayar,
  kembalian: _kembalian,
  prioritas: _prioritas,
  catatan: _catatanCtrl.text.trim().isEmpty ? null : _catatanCtrl.text.trim(),
)
```

- [ ] **Step 5: Add UI for priority and notes**

In payment sheet UI after method chips, add:

```dart
const SizedBox(height: 16),
const Text('PRIORITAS', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
const SizedBox(height: 6),
Wrap(
  spacing: 6,
  children: [
    ChoiceChip(
      label: const Text('Normal', style: TextStyle(fontSize: 12)),
      selected: _prioritas == 'NORMAL',
      selectedColor: AppColors.primary,
      onSelected: (_) => setState(() => _prioritas = 'NORMAL'),
    ),
    ChoiceChip(
      label: const Text('Kilat', style: TextStyle(fontSize: 12)),
      selected: _prioritas == 'KILAT',
      selectedColor: AppColors.primary,
      onSelected: (_) => setState(() => _prioritas = 'KILAT'),
    ),
  ],
),
const SizedBox(height: 16),
TextField(
  controller: _catatanCtrl,
  decoration: const InputDecoration(
    labelText: 'Catatan (opsional)',
    isDense: true,
  ),
  minLines: 1,
  maxLines: 3,
),
```

If selected chip text becomes unreadable, mirror style from metode chips with conditional text color.

- [ ] **Step 6: Send payment metadata in checkout**

In `pos_page.dart`, replace hard-coded priority:

```dart
'prioritas': 'NORMAL',
```

with:

```dart
'prioritas': payment.prioritas,
if (payment.catatan != null && payment.catatan!.isNotEmpty)
  'catatan': payment.catatan,
```

- [ ] **Step 7: Run targeted Flutter tests**

Run:

```bash
cd flutter && flutter test test/pos/cart_item_test.dart test/features/sales_history_page_test.dart
```

Expected: PASS.

- [ ] **Step 8: Optional commit if user requested commits**

```bash
git add flutter/lib/features/pos/widgets/maklon_form_sheet.dart flutter/lib/features/pos/widgets/payment_sheet.dart flutter/lib/features/pos/pos_page.dart
git commit -m "feat(flutter-pos): add vendor transfer and payment metadata"
```

---

### Task 6: Pertahankan “Lihat Faktur” dan pakai snapshot `nama_produk_jual`

**Files:**
- Modify: `flutter/lib/features/sales_history/sales_history_page.dart`
- Modify: `flutter/lib/core/penjualan_cetak_utils.dart`
- Test: `flutter/test/models/sale_model_test.dart`
- Run existing: `flutter/test/features/sales_history_page_test.dart`, `flutter/test/penjualan_cetak_utils_test.dart`, `flutter/test/widgets/faktur_preview_page_test.dart`

**Interfaces:**
- Consumes `SaleItem.displayName` from Task 2.
- Produces customer-facing item names consistent with web snapshot.
- Keeps existing `Lihat Faktur` path in Sales History detail; does not add pre-checkout faktur preview.

- [ ] **Step 1: Verify existing `Lihat Faktur` remains available**

Confirm `flutter/lib/features/sales_history/sales_history_page.dart` still imports/uses `FakturPreviewPage` and still renders the `Lihat Faktur` button in the sales detail sheet. Do not remove or replace this flow. Checkout POS may remain snackbar-only.

- [ ] **Step 2: Search current item display usage**

Run:

```bash
grep -R "barangNama\|barang_nama\|namaBarang" flutter/lib/features/sales_history flutter/lib/core/penjualan_cetak_utils.dart flutter/lib/widgets flutter/lib/features -n
```

Expected: list of current display spots. Replace only spots that render sale item name to customer/cashier; do not rename unrelated variables.

- [ ] **Step 3: Use `displayName` in sales history item rows and detail sheet**

Where sale item row currently displays `item.barangNama ?? ...`, replace with:

```dart
item.displayName
```

If the file maps raw `Map<String, dynamic>` instead of `SaleItem`, define a local variable before rendering:

```dart
final name = (raw['nama_produk_jual'] ??
        raw['barang_nama'] ??
        raw['nama_barang'] ??
        '-')
    .toString();
```

Display `name` in the existing `Text(...)` widget.

- [ ] **Step 4: Use `displayName` in print/faktur utility and `FakturPreviewPage` data mapping**

In `flutter/lib/core/penjualan_cetak_utils.dart`, replace item name fallback with:

```dart
final itemName = item.displayName;
```

If the utility or faktur preview mapping uses maps, use the same raw map fallback from Step 3. In particular, replace fallbacks like `raw['barang_nama'] ?? raw['nama_barang'] ?? '-'` and `item['barang_nama'] ?? item['nama_barang'] ?? '-'` with `nama_produk_jual` first.

- [ ] **Step 5: Run targeted display tests**

Run:

```bash
cd flutter && flutter test test/models/sale_model_test.dart test/features/sales_history_page_test.dart test/penjualan_cetak_utils_test.dart test/widgets/faktur_preview_page_test.dart
```

Expected: PASS.

- [ ] **Step 6: Optional commit if user requested commits**

```bash
git add flutter/lib/features/sales_history/sales_history_page.dart flutter/lib/core/penjualan_cetak_utils.dart flutter/test/models/sale_model_test.dart
git commit -m "fix(flutter-sales): display product sale snapshots"
```

---

### Task 7: Full verification and manual regression checklist

**Files:**
- No source changes expected unless verification finds a bug caused by previous tasks.

**Interfaces:**
- Produces confidence that backend contract and Flutter POS parity work end-to-end.

- [ ] **Step 1: Backend type-check**

Run from repo root:

```bash
npm run type-check
```

Expected: 0 errors.

- [ ] **Step 2: Backend targeted Jest**

Run:

```bash
npx jest src/lib/__tests__/pos-schema-mobile-parity.test.ts
```

Expected: PASS.

- [ ] **Step 3: Flutter full test**

Run:

```bash
cd flutter && flutter test
```

Expected: PASS all tests.

- [ ] **Step 4: Manual POS regression on a dev server**

Use a test account and run through these transactions:

1. Barang biasa non-dimensi, no biaya tambahan → checkout succeeds.
2. Barang dimensi with roll → payload includes `jumlah_roll: 1`, `recommended_roll_width_m`, and invoice/SPK still show dimensions.
3. Barang biasa with biaya tambahan no modal → checkout succeeds, no visible customer change.
4. Barang biasa with biaya tambahan modal equal nominal → checkout succeeds, customer total includes nominal.
5. Maklon ad-hoc with vendor `TRANSFER` → checkout succeeds.
6. Katalog maklon existing lengkap → checkout succeeds and creates downstream PO/SPK/HPP as backend already does.
7. Katalog maklon existing pending vendor/HPP → checkout succeeds, no forced vendor/biaya in Flutter.
8. Katalog maklon existing berdimensi → checkout succeeds with `jumlah = lebar × panjang × jumlahRoll`.
9. Riwayat Penjualan detail → tombol `Lihat Faktur` tetap ada dan item labels prefer `nama_produk_jual`.

- [ ] **Step 5: Confirm no scope-out slipped in**

Check diff manually:

```bash
git diff --stat cec0a5d152426dc3460a96bc927522cc45e8ae3e..HEAD -- flutter src/app/api/pos/init-data/route.ts src/lib/schemas/pos.ts
```

Ensure implementation did not add parkir keranjang, PPN/NSFP, print thermal, tambah/quick-add katalog extra, or admin CRUD katalog maklon to Flutter.

- [ ] **Step 6: Optional commit verification fixes if user requested commits**

If user requested commits and Step 1-4 required source fixes, review `git status --short`, stage only the files changed by those fixes, and commit with message `fix(flutter-pos): stabilize mobile POS parity`. If no fixes were needed, do not create an empty commit.

---

## Plan Self-Review

- Spec coverage: Task 1 covers REST/schema; Task 2 covers model contract; Task 3 covers regular item payload and biaya modal; Task 4 covers using existing katalog maklon/pending/dimensi without catalog CRUD; Task 5 covers `TRANSFER`, catatan, prioritas; Task 6 covers preserving `Lihat Faktur` and riwayat/faktur display; Task 7 covers verification.
- Placeholder scan: no `TBD`, no unfinished steps, no unspecified commands.
- Type consistency: field names align with spec (`namaProdukJual` → `nama_produk_jual`, `jumlahRoll` → `jumlah_roll`, `recommendedRollWidthM` → `recommended_roll_width_m`, `katalogMaklonId` → `katalog_maklon_id`).
- Scope check: intentionally excludes parkir keranjang, PPN, preview faktur before checkout, popular sort, tambah/quick-add katalog extra, admin CRUD katalog maklon, and print thermal.
