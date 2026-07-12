# Flutter Data Barang dan Katalog Extra Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Selaraskan Data Barang Flutter dengan perubahan web yang relevan dan tambahkan halaman Katalog Extra Flutter lengkap dengan CRUD sederhana serta pending Vendor/HPP reconcile.

**Architecture:** Flutter tetap memakai pola mobile app saat ini: model Dart, service berbasis `ApiClient`, provider Riverpod, route GoRouter, dan halaman Material 3 berbasis kartu. Backend hanya ditambah route API tipis untuk pending/reconcile karena service server sudah ada tetapi saat ini hanya diekspos ke web via server action.

**Tech Stack:** Next.js API routes, TypeScript, Zod, Jest, Flutter, Dart, Riverpod, GoRouter, Material 3.

## Global Constraints

- Bahasa Indonesia untuk UI, komentar baru, dan dokumen internal.
- Flutter hanya memanggil Next.js API routes dengan JWT Bearer melalui `ApiClient`; jangan panggil Supabase langsung.
- Mutating API route harus role-guarded dan handle `AuthGuardError`.
- Validasi hot-path mutation dengan Zod; invalid payload mengembalikan 422.
- Mobile app tetap sederhana: list + search/filter, CRUD via form page/bottom sheet, delete confirmation, loading/empty/error states, pull-to-refresh.
- Jangan menambahkan fitur inventori berat ke Flutter Data Barang pada plan ini: riwayat stok, adjustment stok, catat rusak, dan konversi roll tetap web-only.
- Jangan commit kecuali owner meminta. Commit steps di bawah adalah instruksi untuk executor ketika eksekusi plan.

---

## File Structure

- Create: `src/app/api/katalog-maklon/pending/route.ts`
  - API read-only queue pending Vendor/HPP untuk Flutter.
- Create: `src/app/api/katalog-maklon/pending/[id]/reconcile/route.ts`
  - API mutation reconcile pending Vendor/HPP untuk Flutter.
- Create: `src/app/api/katalog-maklon/__tests__/pending-route.test.ts`
  - Regression tests untuk route pending dan reconcile.
- Create: `flutter/lib/models/katalog_maklon.dart`
  - Model `KatalogMaklon` dan `PendingMaklon`.
- Create: `flutter/lib/services/katalog_maklon_service.dart`
  - Client API Katalog Extra.
- Create: `flutter/lib/features/katalog_extra/katalog_extra_page.dart`
  - Halaman list Katalog Extra + pending queue.
- Create: `flutter/lib/features/katalog_extra/katalog_maklon_form_sheet.dart`
  - Form tambah/edit Katalog Extra.
- Create: `flutter/lib/features/katalog_extra/reconcile_pending_sheet.dart`
  - Form reconcile pending Vendor/HPP.
- Modify: `flutter/lib/providers/providers.dart`
  - Tambah provider `katalogMaklonServiceProvider`.
- Modify: `flutter/lib/core/router/app_router.dart`
  - Tambah route `/katalog-extra`.
- Modify: `flutter/lib/widgets/app_shell.dart`
  - Tambah menu dan title Katalog Extra.
- Modify: `flutter/lib/services/api_client.dart`
  - Tambah invalidasi cache untuk `/api/katalog-maklon`.
- Modify: `flutter/lib/features/materials/materials_page.dart`
  - Tambah filter chips dan tampilan kartu Data Barang yang lebih informatif.
- Modify: `flutter/lib/models/material_item.dart`
  - Pastikan field yang dibutuhkan kartu Data Barang tersedia dan parsing kompatibel.
- Create: `flutter/test/models/katalog_maklon_model_test.dart`
- Create: `flutter/test/features/katalog_extra_page_test.dart`
- Create: `flutter/test/features/katalog_maklon_form_sheet_test.dart`
- Modify/Create: `flutter/test/features/materials_page_test.dart`

---

### Task 1: API Pending Katalog Extra untuk Flutter

**Files:**
- Create: `src/app/api/katalog-maklon/pending/route.ts`
- Create: `src/app/api/katalog-maklon/pending/[id]/reconcile/route.ts`
- Create: `src/app/api/katalog-maklon/__tests__/pending-route.test.ts`

**Interfaces:**
- Consumes: `listPendingMaklon()`, `reconcilePendingMaklonItem()`, `reconcilePendingMaklonInputSchema` from `src/lib/services/pending-maklon-service.ts`.
- Produces: `GET /api/katalog-maklon/pending` returns `{ pending: PendingMaklonRow[] }`.
- Produces: `POST /api/katalog-maklon/pending/[id]/reconcile` accepts `{ vendor_subkontrak_id: string, biaya_subkontrak: number|string, metode_bayar_vendor: "CASH"|"TRANSFER"|"NET30" }` and returns `{ message: string }`.

- [ ] **Step 1: Write failing route tests**

Create `src/app/api/katalog-maklon/__tests__/pending-route.test.ts`:

```ts
jest.mock("@/lib/auth-guard-server", () => ({
  AuthGuardError: class AuthGuardError extends Error {
    status: number;
    constructor(message: string, status = 401) {
      super(message);
      this.status = status;
    }
  },
  requireSession: jest.fn(),
  requireOperationalRole: jest.fn(),
}));

jest.mock("@/lib/services/pending-maklon-service", () => ({
  listPendingMaklon: jest.fn(),
  reconcilePendingMaklonItem: jest.fn(),
  reconcilePendingMaklonInputSchema: jest.requireActual(
    "@/lib/services/pending-maklon-service",
  ).reconcilePendingMaklonInputSchema,
}));

import { NextRequest } from "next/server";
import { GET } from "../pending/route";
import { POST } from "../pending/[id]/reconcile/route";
import {
  requireOperationalRole,
  requireSession,
} from "@/lib/auth-guard-server";
import {
  listPendingMaklon,
  reconcilePendingMaklonItem,
} from "@/lib/services/pending-maklon-service";

const mockRequireSession = requireSession as jest.Mock;
const mockRequireOperationalRole = requireOperationalRole as jest.Mock;
const mockListPendingMaklon = listPendingMaklon as jest.Mock;
const mockReconcilePendingMaklonItem = reconcilePendingMaklonItem as jest.Mock;

function jsonReq(body: unknown) {
  return new NextRequest("http://localhost/api/katalog-maklon/pending/it-1/reconcile", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("/api/katalog-maklon/pending", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireSession.mockResolvedValue({ uid: "u-1" });
    mockRequireOperationalRole.mockResolvedValue({ uid: "u-2" });
  });

  it("returns pending maklon rows for logged-in users", async () => {
    mockListPendingMaklon.mockResolvedValue([
      {
        id: "it-1",
        penjualan_id: "sale-1",
        tipe_item: "MAKLON",
        katalog_maklon_id: "km-1",
        deskripsi_pekerjaan: "Banner",
        jumlah: 2,
        harga_satuan: 50000,
        subtotal: 100000,
        pending_vendor_hpp: 1,
        nomor_faktur: "INV-1",
        tanggal: "2026-07-12",
        pelanggan_nama: "Pelanggan Umum",
      },
    ]);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.pending).toHaveLength(1);
    expect(body.pending[0].id).toBe("it-1");
    expect(mockRequireSession).toHaveBeenCalled();
  });

  it("rejects invalid reconcile payload with 422", async () => {
    const res = await POST(jsonReq({ biaya_subkontrak: 0 }), {
      params: Promise.resolve({ id: "it-1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error).toBe("Data reconcile pending maklon tidak valid");
    expect(mockReconcilePendingMaklonItem).not.toHaveBeenCalled();
  });

  it("reconciles pending maklon using guarded session uid", async () => {
    const res = await POST(
      jsonReq({
        vendor_subkontrak_id: "v-1",
        biaya_subkontrak: "75000",
        metode_bayar_vendor: "TRANSFER",
      }),
      { params: Promise.resolve({ id: "it-1" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.message).toBe("Pending maklon berhasil direconcile");
    expect(mockRequireOperationalRole).toHaveBeenCalled();
    expect(mockReconcilePendingMaklonItem).toHaveBeenCalledWith("it-1", {
      vendor_subkontrak_id: "v-1",
      biaya_subkontrak: 75000,
      metode_bayar_vendor: "TRANSFER",
      dibuat_oleh: "u-2",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/app/api/katalog-maklon/__tests__/pending-route.test.ts`

Expected: FAIL because `../pending/route` and `../pending/[id]/reconcile/route` do not exist.

- [ ] **Step 3: Implement pending list route**

Create `src/app/api/katalog-maklon/pending/route.ts`:

```ts
import { NextResponse } from "next/server";

import { AuthGuardError, requireSession } from "@/lib/auth-guard-server";
import { listPendingMaklon } from "@/lib/services/pending-maklon-service";

export async function GET() {
  try {
    await requireSession();
    const pending = await listPendingMaklon();
    return NextResponse.json({ pending });
  } catch (error: any) {
    if (error instanceof AuthGuardError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("Error fetching pending maklon:", error);
    return NextResponse.json(
      { error: error.message || "Gagal memuat pending maklon" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 4: Implement reconcile route**

Create `src/app/api/katalog-maklon/pending/[id]/reconcile/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";

import {
  AuthGuardError,
  requireOperationalRole,
} from "@/lib/auth-guard-server";
import {
  reconcilePendingMaklonInputSchema,
  reconcilePendingMaklonItem,
} from "@/lib/services/pending-maklon-service";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const params = await context.params;
  try {
    const session = await requireOperationalRole();
    const body = await req.json();
    const parsed = reconcilePendingMaklonInputSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Data reconcile pending maklon tidak valid",
          issues: parsed.error.issues,
        },
        { status: 422 },
      );
    }

    await reconcilePendingMaklonItem(params.id, {
      ...parsed.data,
      dibuat_oleh: session.uid,
    });

    return NextResponse.json({
      message: "Pending maklon berhasil direconcile",
    });
  } catch (error: any) {
    if (error instanceof AuthGuardError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("Error reconciling pending maklon:", error);
    return NextResponse.json(
      { error: error.message || "Gagal menyimpan reconcile pending maklon" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 5: Run route tests**

Run: `npx jest src/app/api/katalog-maklon/__tests__/pending-route.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/katalog-maklon/pending src/app/api/katalog-maklon/__tests__/pending-route.test.ts
git commit -m "feat(api): expose pending katalog extra for flutter"
```

---

### Task 2: Flutter Model, Service, Provider, Route, dan Cache

**Files:**
- Create: `flutter/lib/models/katalog_maklon.dart`
- Create: `flutter/lib/services/katalog_maklon_service.dart`
- Modify: `flutter/lib/providers/providers.dart`
- Modify: `flutter/lib/core/router/app_router.dart`
- Modify: `flutter/lib/widgets/app_shell.dart`
- Modify: `flutter/lib/services/api_client.dart`
- Create: `flutter/test/models/katalog_maklon_model_test.dart`

**Interfaces:**
- Produces: `KatalogMaklon.fromJson(Map<String, dynamic>)`.
- Produces: `PendingMaklon.fromJson(Map<String, dynamic>)`.
- Produces: `KatalogMaklonService.getAll`, `create`, `update`, `delete`, `getPending`, `reconcilePending`.
- Route `/katalog-extra` will be consumed by Task 4 page.

- [ ] **Step 1: Write failing model tests**

Create `flutter/test/models/katalog_maklon_model_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:gemiprint/models/katalog_maklon.dart';

void main() {
  group('KatalogMaklon', () {
    test('fromJson parses katalog extra fields', () {
      final item = KatalogMaklon.fromJson({
        'id': 'km-1',
        'nama_produk': 'Cetak Banner',
        'nama_satuan': 'm2',
        'harga_jual_default': 50000,
        'biaya_subkontrak_default': 30000,
        'vendor_subkontrak_id_default': 'v-1',
        'metode_bayar_vendor_default': 'TRANSFER',
        'kategori': 'Banner',
        'kategori_id': 'kat-1',
        'kategori_nama': 'Banner',
        'populer_status': 1,
        'butuh_dimensi_status': 1,
        'catatan_internal': 'Vendor A',
        'is_aktif': 1,
        'urutan': 3,
        'dibuat_pada': '2026-07-12',
        'diperbarui_pada': '2026-07-12',
      });

      expect(item.id, 'km-1');
      expect(item.namaProduk, 'Cetak Banner');
      expect(item.metodeBayarVendorDefault, 'TRANSFER');
      expect(item.populerStatus, true);
      expect(item.butuhDimensiStatus, true);
      expect(item.isAktif, true);
    });

    test('toPayload locks satuan to m2 when dimension is enabled', () {
      const item = KatalogMaklon(
        id: 'km-1',
        namaProduk: 'Banner',
        namaSatuan: 'pcs',
        hargaJualDefault: 10000,
        biayaSubkontrakDefault: 5000,
        metodeBayarVendorDefault: 'CASH',
        butuhDimensiStatus: true,
      );

      final payload = item.toPayload();
      expect(payload['nama_satuan'], 'm2');
      expect(payload['butuh_dimensi_status'], 1);
    });
  });

  group('PendingMaklon', () {
    test('fromJson parses pending row fields', () {
      final row = PendingMaklon.fromJson({
        'id': 'it-1',
        'penjualan_id': 'sale-1',
        'tipe_item': 'MAKLON',
        'katalog_maklon_id': 'km-1',
        'deskripsi_pekerjaan': 'Banner',
        'jumlah': 2,
        'harga_satuan': 50000,
        'subtotal': 100000,
        'pending_vendor_hpp': 1,
        'nomor_faktur': 'INV-1',
        'tanggal': '2026-07-12',
        'pelanggan_nama': 'Pelanggan Umum',
      });

      expect(row.id, 'it-1');
      expect(row.deskripsiPekerjaan, 'Banner');
      expect(row.jumlah, 2);
      expect(row.subtotal, 100000);
      expect(row.pendingVendorHpp, true);
    });
  });
}
```

- [ ] **Step 2: Run model test to verify it fails**

Run: `cd flutter && flutter test test/models/katalog_maklon_model_test.dart`

Expected: FAIL because `models/katalog_maklon.dart` does not exist.

- [ ] **Step 3: Implement model**

Create `flutter/lib/models/katalog_maklon.dart`:

```dart
class KatalogMaklon {
  final String id;
  final String namaProduk;
  final String namaSatuan;
  final double hargaJualDefault;
  final double biayaSubkontrakDefault;
  final String? vendorSubkontrakIdDefault;
  final String metodeBayarVendorDefault;
  final String? kategori;
  final String? kategoriId;
  final String? kategoriNama;
  final bool populerStatus;
  final bool butuhDimensiStatus;
  final String? catatanInternal;
  final bool isAktif;
  final int urutan;
  final String? dibuatPada;
  final String? diperbaruiPada;

  const KatalogMaklon({
    required this.id,
    required this.namaProduk,
    required this.namaSatuan,
    required this.hargaJualDefault,
    required this.biayaSubkontrakDefault,
    this.vendorSubkontrakIdDefault,
    this.metodeBayarVendorDefault = 'CASH',
    this.kategori,
    this.kategoriId,
    this.kategoriNama,
    this.populerStatus = false,
    this.butuhDimensiStatus = false,
    this.catatanInternal,
    this.isAktif = true,
    this.urutan = 0,
    this.dibuatPada,
    this.diperbaruiPada,
  });

  factory KatalogMaklon.fromJson(Map<String, dynamic> json) {
    return KatalogMaklon(
      id: json['id'] as String,
      namaProduk: (json['nama_produk'] ?? '') as String,
      namaSatuan: (json['nama_satuan'] ?? 'pcs') as String,
      hargaJualDefault:
          (json['harga_jual_default'] as num?)?.toDouble() ?? 0,
      biayaSubkontrakDefault:
          (json['biaya_subkontrak_default'] as num?)?.toDouble() ?? 0,
      vendorSubkontrakIdDefault:
          json['vendor_subkontrak_id_default'] as String?,
      metodeBayarVendorDefault:
          _parseMetodeBayar(json['metode_bayar_vendor_default']),
      kategori: json['kategori'] as String?,
      kategoriId: json['kategori_id'] as String?,
      kategoriNama: json['kategori_nama'] as String?,
      populerStatus: _boolFromJson(json['populer_status']),
      butuhDimensiStatus: _boolFromJson(json['butuh_dimensi_status']),
      catatanInternal: json['catatan_internal'] as String?,
      isAktif: _boolFromJson(json['is_aktif'], defaultValue: true),
      urutan: (json['urutan'] as num?)?.toInt() ?? 0,
      dibuatPada: json['dibuat_pada'] as String?,
      diperbaruiPada: json['diperbarui_pada'] as String?,
    );
  }

  Map<String, dynamic> toPayload() => {
        'nama_produk': namaProduk.trim(),
        'nama_satuan': butuhDimensiStatus ? 'm2' : namaSatuan.trim(),
        'harga_jual_default': hargaJualDefault,
        'biaya_subkontrak_default': biayaSubkontrakDefault,
        'vendor_subkontrak_id_default': vendorSubkontrakIdDefault,
        'metode_bayar_vendor_default': metodeBayarVendorDefault,
        'kategori': kategori,
        'kategori_id': kategoriId,
        'populer_status': populerStatus ? 1 : 0,
        'butuh_dimensi_status': butuhDimensiStatus ? 1 : 0,
        'catatan_internal': catatanInternal,
        'is_aktif': isAktif ? 1 : 0,
        'urutan': urutan,
      };
}

class PendingMaklon {
  final String id;
  final String penjualanId;
  final String tipeItem;
  final String? katalogMaklonId;
  final String? deskripsiPekerjaan;
  final double jumlah;
  final double hargaSatuan;
  final double subtotal;
  final bool pendingVendorHpp;
  final String? nomorFaktur;
  final String? tanggal;
  final String? pelangganNama;

  const PendingMaklon({
    required this.id,
    required this.penjualanId,
    required this.tipeItem,
    this.katalogMaklonId,
    this.deskripsiPekerjaan,
    this.jumlah = 0,
    this.hargaSatuan = 0,
    this.subtotal = 0,
    this.pendingVendorHpp = false,
    this.nomorFaktur,
    this.tanggal,
    this.pelangganNama,
  });

  factory PendingMaklon.fromJson(Map<String, dynamic> json) {
    return PendingMaklon(
      id: json['id'] as String,
      penjualanId: (json['penjualan_id'] ?? '') as String,
      tipeItem: (json['tipe_item'] ?? '') as String,
      katalogMaklonId: json['katalog_maklon_id'] as String?,
      deskripsiPekerjaan: json['deskripsi_pekerjaan'] as String?,
      jumlah: (json['jumlah'] as num?)?.toDouble() ?? 0,
      hargaSatuan: (json['harga_satuan'] as num?)?.toDouble() ?? 0,
      subtotal: (json['subtotal'] as num?)?.toDouble() ?? 0,
      pendingVendorHpp: _boolFromJson(json['pending_vendor_hpp']),
      nomorFaktur: json['nomor_faktur'] as String?,
      tanggal: json['tanggal'] as String?,
      pelangganNama: json['pelanggan_nama'] as String?,
    );
  }
}

bool _boolFromJson(Object? value, {bool defaultValue = false}) {
  if (value == null) return defaultValue;
  return value == true || value == 1 || value == '1';
}

String _parseMetodeBayar(Object? value) {
  final s = value?.toString().toUpperCase();
  if (s == 'TRANSFER' || s == 'NET30') return s!;
  return 'CASH';
}
```

- [ ] **Step 4: Implement service**

Create `flutter/lib/services/katalog_maklon_service.dart`:

```dart
import 'package:gemiprint/models/katalog_maklon.dart';
import 'package:gemiprint/services/api_client.dart';

class KatalogMaklonService {
  final ApiClient _api;
  KatalogMaklonService(this._api);

  Future<List<KatalogMaklon>> getAll({
    bool includeInactive = true,
    bool forceRefresh = false,
  }) async {
    final data = await _api.get(
      '/api/katalog-maklon',
      queryParams: includeInactive ? {'include_inactive': '1'} : null,
      forceRefresh: forceRefresh,
    );
    final list = data['katalog'] as List? ?? [];
    return list
        .map((j) => KatalogMaklon.fromJson(j as Map<String, dynamic>))
        .toList();
  }

  Future<KatalogMaklon> create(Map<String, dynamic> body) async {
    final data = await _api.post('/api/katalog-maklon', body: body);
    return KatalogMaklon.fromJson(data['katalog'] as Map<String, dynamic>);
  }

  Future<void> update(String id, Map<String, dynamic> body) async {
    await _api.put('/api/katalog-maklon/$id', body: body);
  }

  Future<void> delete(String id) async {
    await _api.delete('/api/katalog-maklon/$id');
  }

  Future<List<PendingMaklon>> getPending({bool forceRefresh = false}) async {
    final data = await _api.get(
      '/api/katalog-maklon/pending',
      forceRefresh: forceRefresh,
    );
    final list = data['pending'] as List? ?? [];
    return list
        .map((j) => PendingMaklon.fromJson(j as Map<String, dynamic>))
        .toList();
  }

  Future<void> reconcilePending(
    String itemPenjualanId,
    Map<String, dynamic> body,
  ) async {
    await _api.post(
      '/api/katalog-maklon/pending/$itemPenjualanId/reconcile',
      body: body,
    );
  }
}
```

- [ ] **Step 5: Register provider**

Modify `flutter/lib/providers/providers.dart`:

```dart
import 'package:gemiprint/services/katalog_maklon_service.dart';
```

Add after `materialsServiceProvider`:

```dart
final katalogMaklonServiceProvider = Provider<KatalogMaklonService>((ref) {
  return KatalogMaklonService(ref.watch(apiClientProvider));
});
```

- [ ] **Step 6: Add route placeholder import and route**

Modify `flutter/lib/core/router/app_router.dart`:

```dart
import 'package:gemiprint/features/katalog_extra/katalog_extra_page.dart';
```

Add inside `ShellRoute.routes`:

```dart
GoRoute(
  path: '/katalog-extra',
  builder: (context, state) => const KatalogExtraPage(),
),
```

If `KatalogExtraPage` does not exist yet, create a temporary placeholder that Task 4 replaces:

```dart
import 'package:flutter/material.dart';

class KatalogExtraPage extends StatelessWidget {
  const KatalogExtraPage({super.key});

  @override
  Widget build(BuildContext context) {
    return const Center(child: Text('Katalog Extra'));
  }
}
```

- [ ] **Step 7: Add menu and title**

Modify `flutter/lib/widgets/app_shell.dart`:

In group `Penjualan`, add after `Riwayat Penjualan`:

```dart
_MenuItemData(
  path: '/katalog-extra',
  icon: Icons.auto_awesome_motion_rounded,
  label: 'Katalog Extra',
  allowedRoles: RoleGroups.fullStaff,
),
```

In `_titleForPath`, add:

```dart
'/katalog-extra': 'Katalog Extra',
```

- [ ] **Step 8: Add cache invalidation**

Modify `flutter/lib/services/api_client.dart` inside `_invalidateRelated` before `/barang` branch:

```dart
} else if (path.contains('/katalog-maklon')) {
  _cache.invalidatePrefix(AppConfig.apiUrl('/api/katalog-maklon'));
  _cache.invalidatePrefix(AppConfig.apiUrl('/api/pos/'));
  _cache.invalidatePrefix(AppConfig.apiUrl('/api/keuangan/'));
  _cache.invalidatePrefix(AppConfig.apiUrl('/api/penjualan'));
  _cache.invalidatePrefix(AppConfig.apiUrl('/api/produksi'));
```

- [ ] **Step 9: Run tests and analyze**

Run:

```bash
cd flutter
flutter test test/models/katalog_maklon_model_test.dart
flutter analyze
```

Expected: model test PASS and analyze has 0 issues. If analyzer fails because Task 4 placeholder exists, keep the placeholder valid until Task 4 replaces it.

- [ ] **Step 10: Commit**

```bash
git add flutter/lib/models/katalog_maklon.dart flutter/lib/services/katalog_maklon_service.dart flutter/lib/providers/providers.dart flutter/lib/core/router/app_router.dart flutter/lib/widgets/app_shell.dart flutter/lib/services/api_client.dart flutter/test/models/katalog_maklon_model_test.dart
git commit -m "feat(flutter): add katalog extra data layer"
```

---

### Task 3: Data Barang Flutter Mobile Parity

**Files:**
- Modify: `flutter/lib/models/material_item.dart`
- Modify: `flutter/lib/features/materials/materials_page.dart`
- Create/Modify: `flutter/test/features/materials_page_test.dart`

**Interfaces:**
- Consumes: existing `MaterialsService.getAll()`.
- Produces: `MaterialsPage` with filter chips and richer cards.
- Produces: helper state enum/string `_filter`.

- [ ] **Step 1: Write failing widget test**

Create `flutter/test/features/materials_page_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gemiprint/features/materials/materials_page.dart';

void main() {
  testWidgets('MaterialsPage shows search and mobile filter chips', (tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(home: Scaffold(body: MaterialsPage())),
      ),
    );
    await tester.pump();

    expect(find.byType(TextField), findsOneWidget);
    expect(find.text('Semua'), findsOneWidget);
    expect(find.text('Dilacak'), findsOneWidget);
    expect(find.text('Dimensi'), findsOneWidget);
    expect(find.text('Stok Menipis'), findsOneWidget);
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd flutter && flutter test test/features/materials_page_test.dart`

Expected: FAIL because filter chips are not present.

- [ ] **Step 3: Extend model fields only if needed**

Inspect `flutter/lib/models/material_item.dart`. If `levelStokMinimum` and `spesifikasi` are missing, add:

```dart
final double levelStokMinimum;
final String? spesifikasi;
```

Add constructor defaults:

```dart
this.levelStokMinimum = 0,
this.spesifikasi,
```

Add parsing in `fromJson`:

```dart
spesifikasi: json['spesifikasi'] as String?,
levelStokMinimum:
    (json['level_stok_minimum'] as num?)?.toDouble() ?? 0,
```

- [ ] **Step 4: Add filter state and filter logic**

Modify `_MaterialsPageState` in `flutter/lib/features/materials/materials_page.dart`:

```dart
String _filter = 'semua';
```

Replace `_filtered` getter with:

```dart
List<MaterialItem> get _filtered {
  final q = _search.toLowerCase();
  return _materials.where((m) {
    final matchesSearch =
        q.isEmpty ||
        m.nama.toLowerCase().contains(q) ||
        (m.kategoriNama?.toLowerCase().contains(q) ?? false) ||
        (m.subkategoriNama?.toLowerCase().contains(q) ?? false) ||
        (m.deskripsi?.toLowerCase().contains(q) ?? false);

    final matchesFilter = switch (_filter) {
      'dilacak' => m.trackStock,
      'dimensi' => m.dimensiRequired,
      'stok_menipis' => m.trackStock && m.stok <= m.levelStokMinimum,
      _ => true,
    };

    return matchesSearch && matchesFilter;
  }).toList();
}
```

- [ ] **Step 5: Add filter chips below search**

In `build`, after search row padding, add:

```dart
Padding(
  padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
  child: SingleChildScrollView(
    scrollDirection: Axis.horizontal,
    child: Row(
      children: [
        _filterChip('semua', 'Semua'),
        _filterChip('dilacak', 'Dilacak'),
        _filterChip('dimensi', 'Dimensi'),
        _filterChip('stok_menipis', 'Stok Menipis'),
      ],
    ),
  ),
),
```

Add helper:

```dart
Widget _filterChip(String value, String label) {
  final selected = _filter == value;
  return Padding(
    padding: const EdgeInsets.only(right: 8),
    child: FilterChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => setState(() => _filter = value),
      selectedColor: AppColors.success.withValues(alpha: 0.16),
      checkmarkColor: AppColors.success,
    ),
  );
}
```

- [ ] **Step 6: Improve card display**

In `_buildCard`, compute:

```dart
final visiblePrices = m.harga.take(2).toList();
final hiddenCount = m.harga.length > visiblePrices.length
    ? m.harga.length - visiblePrices.length
    : 0;
final isLowStock = m.trackStock && m.stok <= m.levelStokMinimum;
```

Replace the default-price-only display with:

```dart
if (visiblePrices.isNotEmpty) ...[
  const Divider(height: 20),
  Wrap(
    spacing: 8,
    runSpacing: 8,
    children: [
      ...visiblePrices.map(
        (p) => _priceChip(
          p.displayLabel,
          _currencyFormat.format(p.hargaJual),
          AppColors.primary,
        ),
      ),
      if (hiddenCount > 0)
        _plainChip('+$hiddenCount produk jual lainnya'),
    ],
  ),
],
```

Add stock/HPP/badge block:

```dart
const SizedBox(height: 8),
Wrap(
  spacing: 8,
  runSpacing: 8,
  children: [
    if (!m.trackStock) _plainChip('No Tracking'),
    if (m.dimensiRequired) _plainChip('Dimensi'),
    if (isLowStock) _dangerChip('Stok Menipis'),
  ],
),
if (m.trackStock) ...[
  const SizedBox(height: 8),
  Text(
    'Stok: ${m.stok.toStringAsFixed(0)} ${m.satuanNama ?? ''}',
    style: TextStyle(fontSize: 13, color: Colors.grey.shade700),
  ),
],
const SizedBox(height: 4),
Text(
  'HPP: ${_currencyFormat.format(m.averageCostPerBaseUnit)} / ${m.satuanNama ?? 'satuan'}',
  style: TextStyle(fontSize: 13, color: Colors.grey.shade700),
),
```

Add helpers:

```dart
Widget _plainChip(String label) {
  return Chip(
    label: Text(label),
    visualDensity: VisualDensity.compact,
    labelStyle: const TextStyle(fontSize: 12),
  );
}

Widget _dangerChip(String label) {
  return Chip(
    label: Text(label),
    visualDensity: VisualDensity.compact,
    backgroundColor: AppColors.error.withValues(alpha: 0.12),
    labelStyle: const TextStyle(
      fontSize: 12,
      color: AppColors.error,
      fontWeight: FontWeight.w600,
    ),
  );
}
```

- [ ] **Step 7: Ensure delete errors remain friendly**

Confirm `_handleDelete` keeps:

```dart
} on ApiException catch (e) {
  if (mounted) showErrorSnackbar(context, e.message);
}
```

Do not replace it with a generic error.

- [ ] **Step 8: Run Flutter tests**

Run:

```bash
cd flutter
flutter test test/features/materials_page_test.dart
flutter analyze
```

Expected: PASS and 0 analyzer issues.

- [ ] **Step 9: Commit**

```bash
git add flutter/lib/models/material_item.dart flutter/lib/features/materials/materials_page.dart flutter/test/features/materials_page_test.dart
git commit -m "feat(flutter): align data barang mobile cards"
```

---

### Task 4: Katalog Extra Page, Form, dan Pending Reconcile UI

**Files:**
- Create/Replace: `flutter/lib/features/katalog_extra/katalog_extra_page.dart`
- Create: `flutter/lib/features/katalog_extra/katalog_maklon_form_sheet.dart`
- Create: `flutter/lib/features/katalog_extra/reconcile_pending_sheet.dart`
- Create: `flutter/test/features/katalog_extra_page_test.dart`
- Create: `flutter/test/features/katalog_maklon_form_sheet_test.dart`

**Interfaces:**
- Consumes: `katalogMaklonServiceProvider`, `vendorsServiceProvider`, `apiClientProvider`.
- Produces: UI route `/katalog-extra`.
- Produces: `KatalogMaklonFormSheet(existing: item)` returning `true` on save.
- Produces: `ReconcilePendingSheet(item: pending, vendors: vendors)` returning `true` on save.

- [ ] **Step 1: Write failing page smoke test**

Create `flutter/test/features/katalog_extra_page_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gemiprint/features/katalog_extra/katalog_extra_page.dart';

void main() {
  testWidgets('KatalogExtraPage shows search, filters, and loading state', (tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(home: Scaffold(body: KatalogExtraPage())),
      ),
    );
    await tester.pump();

    expect(find.byType(TextField), findsOneWidget);
    expect(find.text('Semua'), findsOneWidget);
    expect(find.text('Aktif'), findsOneWidget);
    expect(find.text('Non-Aktif'), findsOneWidget);
    expect(find.text('Pending'), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsWidgets);
  });
}
```

- [ ] **Step 2: Write failing form smoke test**

Create `flutter/test/features/katalog_maklon_form_sheet_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gemiprint/features/katalog_extra/katalog_maklon_form_sheet.dart';

void main() {
  testWidgets('KatalogMaklonFormSheet renders required fields', (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(home: KatalogMaklonFormSheet()),
      ),
    );
    await tester.pump();

    expect(find.text('Tambah Katalog Extra'), findsOneWidget);
    expect(find.text('Nama Produk *'), findsOneWidget);
    expect(find.text('Butuh dimensi (harga per m2)'), findsOneWidget);
    expect(find.text('Harga Jual'), findsOneWidget);
    expect(find.text('Biaya Subkontrak'), findsOneWidget);
    expect(find.text('Metode Bayar ke Vendor'), findsOneWidget);
    expect(find.text('TRANSFER'), findsOneWidget);
    expect(find.text('Simpan'), findsOneWidget);
  });
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
cd flutter
flutter test test/features/katalog_extra_page_test.dart test/features/katalog_maklon_form_sheet_test.dart
```

Expected: FAIL because UI files do not exist or are placeholders.

- [ ] **Step 4: Implement form sheet**

Create `flutter/lib/features/katalog_extra/katalog_maklon_form_sheet.dart` with these required elements:

```dart
class KatalogMaklonFormSheet extends ConsumerStatefulWidget {
  final KatalogMaklon? existing;
  const KatalogMaklonFormSheet({super.key, this.existing});

  @override
  ConsumerState<KatalogMaklonFormSheet> createState() =>
      _KatalogMaklonFormSheetState();
}
```

State controllers:

```dart
final _namaCtrl = TextEditingController();
final _satuanCtrl = TextEditingController(text: 'pcs');
final _hargaJualCtrl = TextEditingController(text: '0');
final _biayaCtrl = TextEditingController(text: '0');
final _catatanCtrl = TextEditingController();
String? _kategoriId;
String? _kategoriNama;
String? _vendorId;
String _metodeBayar = 'CASH';
bool _butuhDimensi = false;
bool _aktif = true;
bool _saving = false;
List<dynamic> _categories = [];
List<Vendor> _vendors = [];
```

Submit payload:

```dart
final payload = {
  'nama_produk': nama,
  'nama_satuan': _butuhDimensi ? 'm2' : _satuanCtrl.text.trim(),
  'harga_jual_default': double.tryParse(_hargaJualCtrl.text) ?? 0,
  'biaya_subkontrak_default': double.tryParse(_biayaCtrl.text) ?? 0,
  'vendor_subkontrak_id_default': _vendorId,
  'metode_bayar_vendor_default': _metodeBayar,
  'kategori': _kategoriNama,
  'kategori_id': _kategoriId,
  'populer_status': widget.existing?.populerStatus == true ? 1 : 0,
  'butuh_dimensi_status': _butuhDimensi ? 1 : 0,
  'catatan_internal': _catatanCtrl.text.trim().isEmpty
      ? null
      : _catatanCtrl.text.trim(),
  'is_aktif': _aktif ? 1 : 0,
  'urutan': widget.existing?.urutan ?? 0,
};
```

The visible form must include:

```dart
TextFormField(
  controller: _namaCtrl,
  decoration: const InputDecoration(labelText: 'Nama Produk *'),
),
SwitchListTile(
  title: const Text('Butuh dimensi (harga per m2)'),
  subtitle: const Text('Harga dihitung dari lebar x panjang x jumlah.'),
  value: _butuhDimensi,
  onChanged: (v) => setState(() {
    _butuhDimensi = v;
    if (v) _satuanCtrl.text = 'm2';
  }),
),
```

Metode bayar dropdown must include:

```dart
DropdownButtonFormField<String>(
  initialValue: _metodeBayar,
  decoration: const InputDecoration(labelText: 'Metode Bayar ke Vendor'),
  items: const [
    DropdownMenuItem(value: 'CASH', child: Text('CASH')),
    DropdownMenuItem(value: 'TRANSFER', child: Text('TRANSFER')),
    DropdownMenuItem(value: 'NET30', child: Text('NET30')),
  ],
  onChanged: (v) => setState(() => _metodeBayar = v ?? 'CASH'),
),
```

- [ ] **Step 5: Implement reconcile sheet**

Create `flutter/lib/features/katalog_extra/reconcile_pending_sheet.dart`:

```dart
class ReconcilePendingSheet extends ConsumerStatefulWidget {
  final PendingMaklon item;
  final List<Vendor> vendors;
  const ReconcilePendingSheet({
    super.key,
    required this.item,
    required this.vendors,
  });

  @override
  ConsumerState<ReconcilePendingSheet> createState() =>
      _ReconcilePendingSheetState();
}
```

Submit payload:

```dart
await ref.read(katalogMaklonServiceProvider).reconcilePending(widget.item.id, {
  'vendor_subkontrak_id': _vendorId,
  'biaya_subkontrak': double.tryParse(_biayaCtrl.text) ?? 0,
  'metode_bayar_vendor': _metodeBayar,
});
```

Validate before submit:

```dart
if (_vendorId == null) {
  showErrorSnackbar(context, 'Vendor subkontrak wajib dipilih');
  return;
}
if ((double.tryParse(_biayaCtrl.text) ?? 0) <= 0) {
  showErrorSnackbar(context, 'Biaya subkontrak harus lebih dari 0');
  return;
}
```

- [ ] **Step 6: Implement Katalog Extra page**

Replace placeholder `flutter/lib/features/katalog_extra/katalog_extra_page.dart`.

Minimum state:

```dart
List<KatalogMaklon> _items = [];
List<PendingMaklon> _pending = [];
List<Vendor> _vendors = [];
bool _isLoading = true;
String _search = '';
String _filter = 'semua';
String? _kategoriFilter;
```

Load data:

```dart
Future<void> _loadData({bool forceRefresh = false}) async {
  if (_items.isEmpty && _pending.isEmpty) {
    setState(() => _isLoading = true);
  }
  try {
    final results = await Future.wait([
      ref.read(katalogMaklonServiceProvider).getAll(forceRefresh: forceRefresh),
      ref.read(katalogMaklonServiceProvider).getPending(forceRefresh: forceRefresh),
      ref.read(vendorsServiceProvider).getAll(forceRefresh: forceRefresh),
    ]);
    if (!mounted) return;
    setState(() {
      _items = results[0] as List<KatalogMaklon>;
      _pending = results[1] as List<PendingMaklon>;
      _vendors = results[2] as List<Vendor>;
      _isLoading = false;
    });
  } on ApiException catch (e) {
    if (!mounted) return;
    setState(() => _isLoading = false);
    showErrorSnackbar(context, e.message);
  } catch (_) {
    if (!mounted) return;
    setState(() => _isLoading = false);
    showErrorSnackbar(context, 'Gagal memuat katalog extra');
  }
}
```

Filter chips:

```dart
_filterChip('semua', 'Semua'),
_filterChip('aktif', 'Aktif'),
_filterChip('nonaktif', 'Non-Aktif'),
_filterChip('pending', 'Pending'),
```

Card must show:

```dart
Text(item.namaProduk)
Text(item.kategoriNama ?? item.kategori ?? 'Tanpa kategori')
Text(_currencyFormat.format(item.hargaJualDefault))
Text('HPP: ${_currencyFormat.format(item.biayaSubkontrakDefault)}')
Text(vendor?.namaPerusahaan ?? 'Pilih saat transaksi')
```

FAB:

```dart
FloatingActionButton(
  backgroundColor: const Color(0xFF00AFEF),
  onPressed: () => _showForm(),
  child: const Icon(Icons.add_rounded),
),
```

Pending section:

```dart
if (_pending.isNotEmpty || _filter == 'pending')
  _buildPendingSection(),
```

Delete handler:

```dart
final ok = await showConfirmDialog(
  context,
  title: 'Hapus Katalog Extra',
  message: 'Yakin ingin menghapus "${item.namaProduk}"?',
  isDangerous: true,
);
if (!ok) return;
await ref.read(katalogMaklonServiceProvider).delete(item.id);
```

- [ ] **Step 7: Run page tests**

Run:

```bash
cd flutter
flutter test test/features/katalog_extra_page_test.dart test/features/katalog_maklon_form_sheet_test.dart
flutter analyze
```

Expected: PASS and 0 analyzer issues.

- [ ] **Step 8: Commit**

```bash
git add flutter/lib/features/katalog_extra flutter/test/features/katalog_extra_page_test.dart flutter/test/features/katalog_maklon_form_sheet_test.dart
git commit -m "feat(flutter): add katalog extra page"
```

---

### Task 5: Final Verification dan Integration Sweep

**Files:**
- Review all files touched in Tasks 1-4.

**Interfaces:**
- Consumes: completed API routes and Flutter page.
- Produces: verified branch ready for owner review.

- [ ] **Step 1: Run targeted Jest**

Run:

```bash
npx jest src/app/api/katalog-maklon/__tests__/pending-route.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run Next.js type-check**

Run:

```bash
npm run type-check
```

Expected: 0 errors.

- [ ] **Step 3: Run Next.js build**

Run:

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Run Flutter analyze**

Run:

```bash
cd flutter
flutter analyze
```

Expected: `No issues found!`

- [ ] **Step 5: Run Flutter targeted tests**

Run:

```bash
cd flutter
flutter test test/models/katalog_maklon_model_test.dart test/features/katalog_extra_page_test.dart test/features/katalog_maklon_form_sheet_test.dart test/features/materials_page_test.dart
```

Expected: all tests PASS.

- [ ] **Step 6: Manual mobile smoke test**

Run the Flutter app through the existing project workflow. Verify:

- Login works.
- Drawer shows `Katalog Extra` in group `Penjualan` for allowed role.
- `Data Barang` loads, search works, filter chips work, cards show HPP and badges.
- `Katalog Extra` loads, search works, filter chips work, pull-to-refresh works.
- Tambah Katalog Extra with `Butuh dimensi` sends `nama_satuan: "m2"` and item appears after reload.
- Edit Katalog Extra preserves `TRANSFER`.
- Delete Katalog Extra shows success or server error message.
- Pending Vendor/HPP shows rows if backend has data and reconcile posts successfully.

- [ ] **Step 7: Check dirty worktree carefully**

Run:

```bash
git status --short
```

Expected: only files from this plan are modified, plus any pre-existing user changes that were already dirty before execution. Do not revert user changes.

- [ ] **Step 8: Commit final integration if needed**

If Tasks 1-4 were committed separately and Task 5 required fixes:

```bash
git add src/app/api/katalog-maklon flutter/lib flutter/test
git commit -m "fix: verify flutter katalog extra integration"
```

---

## Self-Review

Spec coverage:

- Data Barang Flutter parity is covered by Task 3.
- Katalog Extra API exposure is covered by Task 1.
- Katalog Extra model/service/routing/cache is covered by Task 2.
- Katalog Extra page/form/reconcile UI is covered by Task 4.
- Verification commands from the spec are covered by Task 5.

Placeholder scan:

- No unresolved placeholders are present.
- Every task has concrete files, interfaces, commands, expected outcomes, and code snippets.

Type consistency:

- `KatalogMaklon`, `PendingMaklon`, `KatalogMaklonService`, `KatalogExtraPage`, `KatalogMaklonFormSheet`, and `ReconcilePendingSheet` names are consistent across tasks.
- API response keys are consistent: `katalog` for catalog list/create, `pending` for pending queue.
