# Flutter SPK + Pengambilan Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menyelaraskan halaman SPK Flutter dengan perubahan web setelah commit Flutter terakhir (`cec0a5d`) dan menambahkan halaman Pengambilan mobile yang ringan.

**Architecture:** Flutter tetap online-only lewat REST Next API. Backend menambahkan route Pengambilan yang membungkus service produksi/pengambilan yang sudah dipakai web, lalu Flutter menambah model/service/page untuk konsumsi route tersebut. SPK Flutter diperbarui untuk status `SIAP_AMBIL` dan aksi cascade, tetapi workflow berat seperti konsumsi roll aktual dan cetak SPK tetap di web.

**Tech Stack:** Next.js App Router, TypeScript, Zod/Jest, Flutter 3/Dart, Riverpod, GoRouter, `flutter_test`.

## Global Constraints

- UI/copy baru wajib Bahasa Indonesia.
- Flutter hanya bicara ke Next.js API lewat `ApiClient`; jangan panggil Supabase langsung.
- Mutating API route wajib role-guarded dan handle `AuthGuardError`.
- Jangan tambahkan editor pelanggan, cetak SPK, input konsumsi roll, atau maintenance katalog ke Flutter dalam plan ini.
- `SELESAI` untuk SPK hanya lewat Pengambilan (`Sudah Diambil`), bukan pilihan manual di halaman SPK.
- Jika item terhalang roll `PENDING`, Flutter cukup menampilkan pesan agar konfirmasi roll dilakukan di web.
- Jangan commit kecuali user meminta eksplisit; langkah commit di task adalah instruksi opsional untuk executor.

---

## File Structure

Backend:

- Create: `src/app/api/produksi/pengambilan/route.ts` — list `belum`/`sudah`.
- Create: `src/app/api/produksi/pengambilan/[orderId]/sudah-diambil/route.ts` — mark order sudah diambil.
- Create: `src/app/api/produksi/[id]/siap-diambil/route.ts` — cascade order ke `SIAP_AMBIL` untuk Flutter.
- Create: `src/app/api/produksi/pengambilan/__tests__/route.test.ts`
- Create: `src/app/api/produksi/pengambilan/[orderId]/sudah-diambil/__tests__/route.test.ts`
- Create: `src/app/api/produksi/[id]/siap-diambil/__tests__/route.test.ts`

Flutter model/service:

- Modify: `flutter/lib/models/production.dart`
- Create: `flutter/lib/models/pengambilan.dart`
- Modify: `flutter/lib/services/production_service.dart`
- Create: `flutter/lib/services/pengambilan_service.dart`
- Modify: `flutter/lib/providers/providers.dart`

Flutter UI/navigation:

- Modify: `flutter/lib/features/production/production_page.dart`
- Create: `flutter/lib/features/pengambilan/pengambilan_page.dart`
- Modify: `flutter/lib/core/router/app_router.dart`
- Modify: `flutter/lib/widgets/app_shell.dart`

Flutter tests:

- Create: `flutter/test/models/production_model_test.dart`
- Create: `flutter/test/models/pengambilan_model_test.dart`
- Modify: `flutter/test/features/production_page_test.dart`
- Create: `flutter/test/features/pengambilan_page_test.dart`

---

### Task 1: Backend REST endpoints untuk status Siap Diambil dan Pengambilan

**Files:**
- Create: `src/app/api/produksi/[id]/siap-diambil/route.ts`
- Create: `src/app/api/produksi/pengambilan/route.ts`
- Create: `src/app/api/produksi/pengambilan/[orderId]/sudah-diambil/route.ts`
- Create: `src/app/api/produksi/pengambilan/__tests__/route.test.ts`
- Create: `src/app/api/produksi/pengambilan/[orderId]/sudah-diambil/__tests__/route.test.ts`
- Create: `src/app/api/produksi/[id]/siap-diambil/__tests__/route.test.ts`

**Interfaces:**
- Produces `GET /api/produksi/pengambilan?status=belum|sudah`.
- Produces `POST /api/produksi/pengambilan/:orderId/sudah-diambil`.
- Produces `POST /api/produksi/:id/siap-diambil`.
- Consumed by Task 3 and Task 4 Flutter services.

- [ ] **Step 1: Tulis failing test route list Pengambilan**

Buat `src/app/api/produksi/pengambilan/__tests__/route.test.ts`:

```ts
jest.mock("@/lib/auth-guard-server", () => ({
  requireOperationalRole: jest.fn(async () => ({ uid: "user-1" })),
  AuthGuardError: class AuthGuardError extends Error {
    status: number;
    constructor(message: string, status = 403) {
      super(message);
      this.status = status;
    }
  },
}));

jest.mock("@/lib/services/pengambilan-service", () => ({
  listPengambilanBelumDiambil: jest.fn(async () => [
    {
      order_id: "op-1",
      nomor_spk: "SPK-001",
      nomor_faktur: "INV-001",
      pelanggan_nama: "Pelanggan Umum",
      item_ringkas: "Banner",
      jumlah_item: 1,
      total_jumlah: 100000,
      jumlah_dibayar: 50000,
      sisa_piutang: 50000,
      status_bayar: "SEBAGIAN",
      piutang_id: "piu-1",
      penjualan_id: "sale-1",
    },
  ]),
  listPengambilanSudahDiambil: jest.fn(async () => []),
}));

import { GET } from "../route";
import {
  listPengambilanBelumDiambil,
  listPengambilanSudahDiambil,
} from "@/lib/services/pengambilan-service";

describe("GET /api/produksi/pengambilan", () => {
  it("mengembalikan list belum diambil secara bawaan", async () => {
    const res = await GET(
      new Request("http://localhost/api/produksi/pengambilan"),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.rows).toHaveLength(1);
    expect(listPengambilanBelumDiambil).toHaveBeenCalled();
  });

  it("mengembalikan list sudah diambil saat status=sudah", async () => {
    const res = await GET(
      new Request("http://localhost/api/produksi/pengambilan?status=sudah"),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.rows).toEqual([]);
    expect(listPengambilanSudahDiambil).toHaveBeenCalledWith(100);
  });
});
```

- [ ] **Step 2: Tulis failing test mutasi Sudah Diambil**

Buat `src/app/api/produksi/pengambilan/[orderId]/sudah-diambil/__tests__/route.test.ts`:

```ts
jest.mock("@/lib/auth-guard-server", () => ({
  requireOperationalRole: jest.fn(async () => ({ uid: "user-1" })),
  AuthGuardError: class AuthGuardError extends Error {
    status: number;
    constructor(message: string, status = 403) {
      super(message);
      this.status = status;
    }
  },
}));

jest.mock("@/lib/services/production-service", () => ({
  markOrderSudahDiambil: jest.fn(async () => ({
    selesai: ["item-1"],
    terhalang: [],
    statusOrderAkhir: "SELESAI",
  })),
}));

import { POST } from "../route";
import { markOrderSudahDiambil } from "@/lib/services/production-service";

describe("POST /api/produksi/pengambilan/:orderId/sudah-diambil", () => {
  it("menandai order sudah diambil", async () => {
    const res = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ orderId: "op-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.result.statusOrderAkhir).toBe("SELESAI");
    expect(markOrderSudahDiambil).toHaveBeenCalledWith("op-1");
  });
});
```

- [ ] **Step 3: Tulis failing test mutasi Siap Diambil**

Buat `src/app/api/produksi/[id]/siap-diambil/__tests__/route.test.ts`:

```ts
jest.mock("@/lib/auth-guard-server", () => ({
  requireProductionInventoryRole: jest.fn(async () => ({ uid: "user-1" })),
  AuthGuardError: class AuthGuardError extends Error {
    status: number;
    constructor(message: string, status = 403) {
      super(message);
      this.status = status;
    }
  },
}));

jest.mock("@/lib/services/production-service", () => ({
  setOrderStatusSiapDiambilCascade: jest.fn(async () => ({
    selesai: ["item-1"],
    terhalang: [],
    statusOrderAkhir: "SIAP_AMBIL",
  })),
}));

import { POST } from "../route";
import { setOrderStatusSiapDiambilCascade } from "@/lib/services/production-service";

describe("POST /api/produksi/:id/siap-diambil", () => {
  it("menjalankan cascade Siap Diambil", async () => {
    const res = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ id: "op-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.result.statusOrderAkhir).toBe("SIAP_AMBIL");
    expect(setOrderStatusSiapDiambilCascade).toHaveBeenCalledWith("op-1");
  });
});
```

- [ ] **Step 4: Jalankan test untuk memastikan gagal karena route belum ada**

Run:

```bash
npx jest src/app/api/produksi/pengambilan/__tests__/route.test.ts src/app/api/produksi/pengambilan/[orderId]/sudah-diambil/__tests__/route.test.ts src/app/api/produksi/[id]/siap-diambil/__tests__/route.test.ts
```

Expected: FAIL karena module route belum ditemukan.

- [ ] **Step 5: Implement route list Pengambilan**

Buat `src/app/api/produksi/pengambilan/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireOperationalRole, AuthGuardError } from "@/lib/auth-guard-server";
import {
  listPengambilanBelumDiambil,
  listPengambilanSudahDiambil,
} from "@/lib/services/pengambilan-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest | Request) {
  try {
    await requireOperationalRole();
    const url = new URL(request.url);
    const status = url.searchParams.get("status") || "belum";
    const rows =
      status === "sudah"
        ? await listPengambilanSudahDiambil(100)
        : await listPengambilanBelumDiambil();

    return NextResponse.json({ success: true, rows });
  } catch (error: any) {
    if (error instanceof AuthGuardError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      );
    }
    console.error("GET /api/produksi/pengambilan error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Gagal memuat pengambilan" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 6: Implement route Sudah Diambil**

Buat `src/app/api/produksi/pengambilan/[orderId]/sudah-diambil/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireOperationalRole, AuthGuardError } from "@/lib/auth-guard-server";
import { markOrderSudahDiambil } from "@/lib/services/production-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  try {
    await requireOperationalRole();
    const { orderId } = await params;
    const result = await markOrderSudahDiambil(orderId);
    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    if (error instanceof AuthGuardError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      );
    }
    const message = error?.message || "Gagal menandai SPK sudah diambil";
    const status = message.includes("belum siap diambil") ? 400 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
```

- [ ] **Step 7: Implement route Siap Diambil**

Buat `src/app/api/produksi/[id]/siap-diambil/route.ts`:

```ts
import { NextResponse } from "next/server";
import {
  requireProductionInventoryRole,
  AuthGuardError,
} from "@/lib/auth-guard-server";
import { setOrderStatusSiapDiambilCascade } from "@/lib/services/production-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireProductionInventoryRole();
    const { id } = await params;
    const result = await setOrderStatusSiapDiambilCascade(id);
    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    if (error instanceof AuthGuardError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Gagal menandai SPK siap diambil",
      },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 8: Jalankan test backend targeted**

Run:

```bash
npx jest src/app/api/produksi/pengambilan/__tests__/route.test.ts src/app/api/produksi/pengambilan/[orderId]/sudah-diambil/__tests__/route.test.ts src/app/api/produksi/[id]/siap-diambil/__tests__/route.test.ts
```

Expected: PASS.

- [ ] **Step 9: Jalankan type-check backend**

Run:

```bash
npm run type-check
```

Expected: 0 TypeScript error.

---

### Task 2: Model Flutter untuk status produksi dan Pengambilan

**Files:**
- Modify: `flutter/lib/models/production.dart`
- Create: `flutter/lib/models/pengambilan.dart`
- Create: `flutter/test/models/production_model_test.dart`
- Create: `flutter/test/models/pengambilan_model_test.dart`

**Interfaces:**
- Produces `ProductionOrder.penjualanDibatalkan`, `ProductionOrder.statusOverrideManual`.
- Produces `ProductionItem.isMaklon`, `ProductionItem.rollInventoryStatus`, `ProductionItem.recommendedRollWidthM`.
- Produces `PengambilanRow.fromJson(Map<String, dynamic>)`.
- Consumed by Task 3 and Task 5 UI.

- [ ] **Step 1: Tulis failing test production model**

Buat `flutter/test/models/production_model_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:gemiprint/models/production.dart';

void main() {
  test('ProductionOrder.fromJson membaca status dan field web terbaru', () {
    final order = ProductionOrder.fromJson({
      'id': 'op-1',
      'penjualan_id': 'sale-1',
      'nomor_spk': 'SPK-001',
      'status': 'SIAP_AMBIL',
      'status_override_manual': true,
      'penjualan_dibatalkan': false,
      'item_produksi': [
        {
          'id': 'item-1',
          'order_produksi_id': 'op-1',
          'barang_id': 'barang-1',
          'barang_nama': 'Banner',
          'jumlah': 2,
          'status': 'SIAP_AMBIL',
          'is_maklon': true,
          'roll_inventory_status': 'PENDING',
          'recommended_roll_width_m': 1.55,
        }
      ],
    });

    expect(order.status, 'SIAP_AMBIL');
    expect(order.statusOverrideManual, isTrue);
    expect(order.penjualanDibatalkan, isFalse);
    expect(order.items.single.isMaklon, isTrue);
    expect(order.items.single.rollInventoryStatus, 'PENDING');
    expect(order.items.single.recommendedRollWidthM, 1.55);
  });
}
```

- [ ] **Step 2: Tulis failing test Pengambilan model**

Buat `flutter/test/models/pengambilan_model_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:gemiprint/models/pengambilan.dart';

void main() {
  test('PengambilanRow.fromJson membaca angka dan fallback label', () {
    final row = PengambilanRow.fromJson({
      'order_id': 'op-1',
      'nomor_spk': 'SPK-001',
      'nomor_faktur': 'INV-001',
      'pelanggan_nama': 'Pelanggan Umum',
      'item_ringkas': 'Banner, Sticker',
      'jumlah_item': 2,
      'total_jumlah': 100000,
      'jumlah_dibayar': 40000,
      'sisa_piutang': 60000,
      'status_bayar': 'SEBAGIAN',
      'piutang_id': 'piu-1',
      'penjualan_id': 'sale-1',
    });

    expect(row.orderId, 'op-1');
    expect(row.sisaPiutang, 60000);
    expect(row.statusBayarLabel, 'Sebagian');
    expect(row.adaPiutang, isTrue);
  });
}
```

- [ ] **Step 3: Jalankan test dan pastikan gagal**

Run:

```bash
cd flutter && flutter test test/models/production_model_test.dart test/models/pengambilan_model_test.dart
```

Expected: FAIL karena field/model baru belum ada.

- [ ] **Step 4: Update `ProductionOrder` dan `ProductionItem`**

Di `flutter/lib/models/production.dart`, tambahkan field:

```dart
final bool penjualanDibatalkan;
final bool statusOverrideManual;
```

ke `ProductionOrder`, default:

```dart
this.penjualanDibatalkan = false,
this.statusOverrideManual = false,
```

dan parse:

```dart
penjualanDibatalkan: json['penjualan_dibatalkan'] == true || json['penjualan_dibatalkan'] == 1,
statusOverrideManual: json['status_override_manual'] == true || json['status_override_manual'] == 1,
```

Tambahkan ke `ProductionItem`:

```dart
final String? barangId;
final bool isMaklon;
final String rollInventoryStatus;
final double? recommendedRollWidthM;
```

default:

```dart
this.barangId,
this.isMaklon = false,
this.rollInventoryStatus = 'NOT_REQUIRED',
this.recommendedRollWidthM,
```

dan parse:

```dart
barangId: json['barang_id'] as String?,
isMaklon: json['is_maklon'] == true || json['is_maklon'] == 1,
rollInventoryStatus: (json['roll_inventory_status'] ?? 'NOT_REQUIRED') as String,
recommendedRollWidthM: (json['recommended_roll_width_m'] as num?)?.toDouble(),
```

- [ ] **Step 5: Buat model Pengambilan**

Buat `flutter/lib/models/pengambilan.dart`:

```dart
class PengambilanRow {
  final String orderId;
  final String nomorSpk;
  final String nomorFaktur;
  final String pelangganNama;
  final String itemRingkas;
  final int jumlahItem;
  final double totalJumlah;
  final double jumlahDibayar;
  final double sisaPiutang;
  final String statusBayar;
  final String? piutangId;
  final String penjualanId;

  const PengambilanRow({
    required this.orderId,
    required this.nomorSpk,
    required this.nomorFaktur,
    required this.pelangganNama,
    required this.itemRingkas,
    required this.jumlahItem,
    required this.totalJumlah,
    required this.jumlahDibayar,
    required this.sisaPiutang,
    required this.statusBayar,
    required this.piutangId,
    required this.penjualanId,
  });

  factory PengambilanRow.fromJson(Map<String, dynamic> json) {
    return PengambilanRow(
      orderId: (json['order_id'] ?? '') as String,
      nomorSpk: (json['nomor_spk'] ?? '-') as String,
      nomorFaktur: (json['nomor_faktur'] ?? '-') as String,
      pelangganNama: (json['pelanggan_nama'] ?? 'Pelanggan Umum') as String,
      itemRingkas: (json['item_ringkas'] ?? '-') as String,
      jumlahItem: (json['jumlah_item'] as num?)?.toInt() ?? 0,
      totalJumlah: (json['total_jumlah'] as num?)?.toDouble() ?? 0,
      jumlahDibayar: (json['jumlah_dibayar'] as num?)?.toDouble() ?? 0,
      sisaPiutang: (json['sisa_piutang'] as num?)?.toDouble() ?? 0,
      statusBayar: (json['status_bayar'] ?? 'PIUTANG') as String,
      piutangId: json['piutang_id'] as String?,
      penjualanId: (json['penjualan_id'] ?? '') as String,
    );
  }

  bool get adaPiutang => sisaPiutang > 0 && piutangId != null;

  String get statusBayarLabel {
    switch (statusBayar) {
      case 'LUNAS':
        return 'Lunas';
      case 'SEBAGIAN':
        return 'Sebagian';
      default:
        return 'Piutang';
    }
  }
}
```

- [ ] **Step 6: Jalankan test model Flutter**

Run:

```bash
cd flutter && flutter test test/models/production_model_test.dart test/models/pengambilan_model_test.dart
```

Expected: PASS.

---

### Task 3: Flutter services dan cache invalidation

**Files:**
- Modify: `flutter/lib/services/production_service.dart`
- Create: `flutter/lib/services/pengambilan_service.dart`
- Modify: `flutter/lib/services/api_client.dart`
- Modify: `flutter/lib/providers/providers.dart`

**Interfaces:**
- Produces `ProductionService.markReadyForPickup(String id)`.
- Produces `PengambilanService.getRows({required bool sudah, bool forceRefresh = false})`.
- Produces `PengambilanService.markSudahDiambil(String orderId)`.
- Consumed by Task 4 and Task 5 pages.

- [ ] **Step 1: Tambah method production service**

Di `flutter/lib/services/production_service.dart`, tambahkan:

```dart
  Future<Map<String, dynamic>> markReadyForPickup(String id) async {
    return await _api.post('/api/produksi/$id/siap-diambil')
        as Map<String, dynamic>;
  }
```

- [ ] **Step 2: Buat PengambilanService**

Buat `flutter/lib/services/pengambilan_service.dart`:

```dart
import 'package:gemiprint/models/pengambilan.dart';
import 'package:gemiprint/services/api_client.dart';

class PengambilanService {
  final ApiClient _api;
  PengambilanService(this._api);

  Future<List<PengambilanRow>> getRows({
    required bool sudah,
    bool forceRefresh = false,
  }) async {
    final data = await _api.get(
      '/api/produksi/pengambilan',
      queryParams: {'status': sudah ? 'sudah' : 'belum'},
      forceRefresh: forceRefresh,
    ) as Map<String, dynamic>;
    final rows = data['rows'] as List? ?? [];
    return rows
        .map((j) => PengambilanRow.fromJson(j as Map<String, dynamic>))
        .toList();
  }

  Future<Map<String, dynamic>> markSudahDiambil(String orderId) async {
    return await _api.post(
      '/api/produksi/pengambilan/$orderId/sudah-diambil',
    ) as Map<String, dynamic>;
  }
}
```

- [ ] **Step 3: Update cache invalidation untuk Pengambilan**

Di `flutter/lib/services/api_client.dart`, ubah branch produksi dari:

```dart
    } else if (path.contains('/produksi')) {
      _cache.invalidatePrefix(AppConfig.apiUrl('/api/produksi'));
```

menjadi tetap mencakup semua route produksi dan pos:

```dart
    } else if (path.contains('/produksi')) {
      _cache.invalidatePrefix(AppConfig.apiUrl('/api/produksi'));
      _cache.invalidatePrefix(AppConfig.apiUrl('/api/pos/'));
```

- [ ] **Step 4: Register provider**

Di `flutter/lib/providers/providers.dart`, import service baru:

```dart
import 'package:gemiprint/services/pengambilan_service.dart';
```

Tambahkan provider:

```dart
final pengambilanServiceProvider = Provider<PengambilanService>((ref) {
  return PengambilanService(ref.watch(apiClientProvider));
});
```

- [ ] **Step 5: Jalankan analyze ringan Flutter**

Run:

```bash
cd flutter && flutter analyze lib/services/production_service.dart lib/services/pengambilan_service.dart lib/services/api_client.dart lib/providers/providers.dart
```

Expected: no issues.

---

### Task 4: Update halaman SPK Flutter untuk `SIAP_AMBIL`

**Files:**
- Modify: `flutter/lib/features/production/production_page.dart`
- Modify: `flutter/test/features/production_page_test.dart`

**Interfaces:**
- Consumes `ProductionService.markReadyForPickup`.
- Consumes status fields from Task 2.
- Produces mobile SPK UI with filter/action `Siap Diambil`.

- [ ] **Step 1: Update widget test untuk chip status baru**

Di `flutter/test/features/production_page_test.dart`, test kedua harus mengecek `Siap Diambil`:

```dart
  testWidgets('ProductionPage has status filter chips', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: MaterialApp(home: Scaffold(body: ProductionPage()))));
    await tester.pump();
    expect(find.text('Semua'), findsOneWidget);
    expect(find.text('Menunggu'), findsOneWidget);
    expect(find.text('Proses'), findsOneWidget);
    expect(find.text('Siap Diambil'), findsOneWidget);
  });
```

- [ ] **Step 2: Jalankan test dan pastikan gagal**

Run:

```bash
cd flutter && flutter test test/features/production_page_test.dart
```

Expected: FAIL karena chip `Siap Diambil` belum ada.

- [ ] **Step 3: Update daftar filter status**

Di `flutter/lib/features/production/production_page.dart`, ubah:

```dart
static const _statuses = ['Semua', 'Menunggu', 'Proses', 'Selesai', 'Dibatalkan'];
```

menjadi:

```dart
static const _statuses = [
  'Semua',
  'Menunggu',
  'Proses',
  'Siap Diambil',
  'Selesai',
  'Dibatalkan',
];
```

Tambahkan branch filter:

```dart
    } else if (_activeFilter == 'Siap Diambil') {
      result = result.where((o) => o.status == 'SIAP_AMBIL').toList();
```

- [ ] **Step 4: Update warna dan label status**

Di `_statusColor`, tambahkan:

```dart
      case 'SIAP_AMBIL': return const Color(0xFF14B8A6);
      case 'TUNGGU_KONFIRMASI': return const Color(0xFFF59E0B);
      case 'BAHAN_HABIS': return AppColors.error;
      case 'PRINTING': return const Color(0xFF8B5CF6);
      case 'FINISHING': return const Color(0xFFF97316);
      case 'PESAN_KURIR':
      case 'TUNGGU_KURIR': return const Color(0xFF06B6D4);
      case 'SEDANG_DIKIRIM':
      case 'SEDANG_DIAMBIL': return const Color(0xFF0EA5E9);
      case 'DIKERJAKAN_VENDOR': return const Color(0xFF6366F1);
```

Di `_statusLabel`, tambahkan:

```dart
      case 'SIAP_AMBIL': return 'Siap Diambil';
      case 'TUNGGU_KONFIRMASI': return 'Tunggu Konfirmasi';
      case 'BAHAN_HABIS': return 'Bahan Habis';
      case 'PRINTING': return 'Printing';
      case 'FINISHING': return 'Finishing';
      case 'PESAN_KURIR': return 'Pesan Kurir';
      case 'TUNGGU_KURIR': return 'Tunggu Kurir';
      case 'SEDANG_DIKIRIM': return 'Sedang Dikirim';
      case 'DIKERJAKAN_VENDOR': return 'Dikerjakan Vendor';
      case 'SEDANG_DIAMBIL': return 'Sedang Diambil';
```

- [ ] **Step 5: Ganti aksi Selesai menjadi Siap Diambil**

Di detail sheet, hapus tombol:

```dart
label: const Text('Tandai Selesai')
```

dan ganti alur status proses menjadi:

```dart
            if (order.status == 'PROSES' || order.status == 'DALAM_PROSES')
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: () {
                    Navigator.of(context).pop();
                    _markReadyForPickup(order);
                  },
                  icon: const Icon(Icons.inventory_2_rounded, size: 18),
                  label: const Text('Siap Diambil'),
                  style: FilledButton.styleFrom(backgroundColor: const Color(0xFF14B8A6)),
                ),
              ),
```

Tambahkan method:

```dart
  Future<void> _markReadyForPickup(ProductionOrder order) async {
    try {
      final response = await ref.read(productionServiceProvider).markReadyForPickup(order.id);
      final result = response['result'] as Map<String, dynamic>?;
      final blocked = (result?['terhalang'] as List?) ?? [];
      if (mounted) {
        if (blocked.isNotEmpty) {
          final names = blocked
              .map((i) => (i as Map<String, dynamic>)['nama']?.toString() ?? '-')
              .join(', ');
          showErrorSnackbar(context, 'Item belum bisa disiapkan: $names');
        } else {
          showSuccessSnackbar(context, 'SPK ditandai Siap Diambil');
        }
        _loadData();
      }
    } on ApiException catch (e) {
      if (mounted) showErrorSnackbar(context, e.message);
    } catch (_) {
      if (mounted) showErrorSnackbar(context, 'Gagal menandai Siap Diambil');
    }
  }
```

- [ ] **Step 6: Tambah pesan roll pending di detail item**

Di render item detail, setelah text status, tambahkan:

```dart
                  if (item.rollInventoryStatus == 'PENDING')
                    Text(
                      'Konfirmasi roll aktual dilakukan di web.',
                      style: TextStyle(fontSize: 11, color: AppColors.warning),
                    ),
```

- [ ] **Step 7: Jalankan test SPK**

Run:

```bash
cd flutter && flutter test test/features/production_page_test.dart test/models/production_model_test.dart
```

Expected: PASS.

---

### Task 5: Halaman Pengambilan Flutter

**Files:**
- Create: `flutter/lib/features/pengambilan/pengambilan_page.dart`
- Create: `flutter/test/features/pengambilan_page_test.dart`

**Interfaces:**
- Consumes `PengambilanService.getRows`.
- Consumes `PengambilanService.markSudahDiambil`.
- Consumes `PosService.payReceivable`.
- Produces `PengambilanPage`.

- [ ] **Step 1: Tulis widget test awal**

Buat `flutter/test/features/pengambilan_page_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gemiprint/features/pengambilan/pengambilan_page.dart';
import 'package:intl/date_symbol_data_local.dart';

void main() {
  setUpAll(() async {
    await initializeDateFormatting('id_ID', null);
  });

  testWidgets('PengambilanPage menampilkan search, tab, dan loading state', (tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(home: Scaffold(body: PengambilanPage())),
      ),
    );
    await tester.pump();

    expect(find.byType(TextField), findsOneWidget);
    expect(find.text('Belum Diambil'), findsOneWidget);
    expect(find.text('Sudah Diambil'), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });
}
```

- [ ] **Step 2: Jalankan test dan pastikan gagal karena page belum ada**

Run:

```bash
cd flutter && flutter test test/features/pengambilan_page_test.dart
```

Expected: FAIL import target belum ada.

- [ ] **Step 3: Buat PengambilanPage**

Buat `flutter/lib/features/pengambilan/pengambilan_page.dart` dengan struktur ini:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gemiprint/core/theme/app_theme.dart';
import 'package:gemiprint/models/pengambilan.dart';
import 'package:gemiprint/providers/providers.dart';
import 'package:gemiprint/services/api_client.dart';
import 'package:gemiprint/widgets/confirm_dialog.dart';
import 'package:gemiprint/widgets/empty_state.dart';
import 'package:gemiprint/widgets/snackbar_helper.dart';
import 'package:intl/intl.dart';

class PengambilanPage extends ConsumerStatefulWidget {
  const PengambilanPage({super.key});

  @override
  ConsumerState<PengambilanPage> createState() => _PengambilanPageState();
}

class _PengambilanPageState extends ConsumerState<PengambilanPage> {
  List<PengambilanRow> _belum = [];
  List<PengambilanRow> _sudah = [];
  bool _isLoading = true;
  bool _showSudah = false;
  String _search = '';
  final _currencyFmt = NumberFormat.currency(locale: 'id_ID', symbol: 'Rp ', decimalDigits: 0);

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final service = ref.read(pengambilanServiceProvider);
      final results = await Future.wait([
        service.getRows(sudah: false, forceRefresh: true),
        service.getRows(sudah: true, forceRefresh: true),
      ]);
      if (mounted) {
        setState(() {
          _belum = results[0];
          _sudah = results[1];
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
        showErrorSnackbar(context, 'Gagal memuat pengambilan');
      }
    }
  }

  List<PengambilanRow> get _filtered {
    final source = _showSudah ? _sudah : _belum;
    if (_search.trim().isEmpty) return source;
    final q = _search.toLowerCase();
    return source.where((r) {
      return r.nomorSpk.toLowerCase().contains(q) ||
          r.nomorFaktur.toLowerCase().contains(q) ||
          r.pelangganNama.toLowerCase().contains(q);
    }).toList();
  }

  Future<void> _markSudahDiambil(PengambilanRow row) async {
    final ok = await showConfirmDialog(
      context,
      title: 'Sudah Diambil',
      message: 'Tandai SPK ${row.nomorSpk} sudah diambil pelanggan?',
    );
    if (!ok) return;
    try {
      final response = await ref.read(pengambilanServiceProvider).markSudahDiambil(row.orderId);
      final result = response['result'] as Map<String, dynamic>?;
      final blocked = (result?['terhalang'] as List?) ?? [];
      if (mounted) {
        if (blocked.isNotEmpty) {
          final names = blocked
              .map((i) => (i as Map<String, dynamic>)['nama']?.toString() ?? '-')
              .join(', ');
          showErrorSnackbar(context, 'Item belum bisa diselesaikan: $names');
        } else {
          showSuccessSnackbar(context, 'SPK ditandai sudah diambil');
        }
        _loadData();
      }
    } on ApiException catch (e) {
      if (mounted) showErrorSnackbar(context, e.message);
    } catch (_) {
      if (mounted) showErrorSnackbar(context, 'Gagal menandai sudah diambil');
    }
  }

  Future<void> _payReceivable(PengambilanRow row) async {
    final controller = TextEditingController(text: row.sisaPiutang.toStringAsFixed(0));
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Terima Piutang'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${row.pelangganNama}\n${row.nomorFaktur}\nSisa: ${_currencyFmt.format(row.sisaPiutang)}'),
            const SizedBox(height: 12),
            TextField(
              controller: controller,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'Jumlah Bayar',
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Batal')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Simpan')),
        ],
      ),
    );
    if (ok != true) return;
    final jumlah = double.tryParse(controller.text.trim());
    if (jumlah == null || jumlah <= 0 || jumlah > row.sisaPiutang) {
      if (mounted) showErrorSnackbar(context, 'Jumlah bayar tidak valid');
      return;
    }
    try {
      await ref.read(posServiceProvider).payReceivable({
        'piutang_id': row.piutangId,
        'jumlah_bayar': jumlah,
      });
      if (mounted) {
        showSuccessSnackbar(context, 'Pembayaran piutang tersimpan');
        _loadData();
      }
    } on ApiException catch (e) {
      if (mounted) showErrorSnackbar(context, e.message);
    } catch (_) {
      if (mounted) showErrorSnackbar(context, 'Gagal mencatat pembayaran');
    }
  }

  @override
  Widget build(BuildContext context) {
    final rows = _filtered;
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
          child: TextField(
            decoration: InputDecoration(
              hintText: 'Cari SPK, faktur, atau pelanggan...',
              prefixIcon: const Icon(Icons.search, size: 20),
              suffixIcon: _search.isNotEmpty
                  ? IconButton(icon: const Icon(Icons.clear, size: 18), onPressed: () => setState(() => _search = ''))
                  : null,
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
          child: Row(
            children: [
              FilterChip(
                label: const Text('Belum Diambil'),
                selected: !_showSudah,
                onSelected: (_) => setState(() => _showSudah = false),
                selectedColor: AppColors.warning.withValues(alpha: 0.15),
                checkmarkColor: AppColors.warning,
              ),
              const SizedBox(width: 8),
              FilterChip(
                label: const Text('Sudah Diambil'),
                selected: _showSudah,
                onSelected: (_) => setState(() => _showSudah = true),
                selectedColor: AppColors.success.withValues(alpha: 0.15),
                checkmarkColor: AppColors.success,
              ),
            ],
          ),
        ),
        Expanded(child: _buildBody(rows)),
      ],
    );
  }

  Widget _buildBody(List<PengambilanRow> rows) {
    if (_isLoading) return const Center(child: CircularProgressIndicator());
    if (rows.isEmpty) {
      return EmptyState(
        icon: _showSudah ? Icons.done_all_rounded : Icons.inventory_2_rounded,
        title: _showSudah ? 'Belum ada riwayat pengambilan' : 'Tidak ada SPK siap diambil',
      );
    }
    return RefreshIndicator(
      onRefresh: _loadData,
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 80),
        itemCount: rows.length,
        itemBuilder: (_, i) => _buildCard(rows[i]),
      ),
    );
  }

  Widget _buildCard(PengambilanRow row) {
    final bayarColor = row.statusBayar == 'LUNAS'
        ? AppColors.success
        : row.statusBayar == 'SEBAGIAN'
            ? AppColors.warning
            : AppColors.error;
    return Card(
      margin: const EdgeInsets.only(bottom: 6),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(row.nomorSpk, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14), overflow: TextOverflow.ellipsis)),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(color: bayarColor.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(8)),
                  child: Text(row.statusBayarLabel, style: TextStyle(color: bayarColor, fontSize: 10, fontWeight: FontWeight.w600)),
                ),
              ],
            ),
            const SizedBox(height: 3),
            Text('${row.nomorFaktur} · ${row.pelangganNama}', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
            const SizedBox(height: 2),
            Text('${row.jumlahItem} item · ${row.itemRingkas}', style: TextStyle(fontSize: 11, color: Colors.grey.shade500), maxLines: 2, overflow: TextOverflow.ellipsis),
            const SizedBox(height: 4),
            Text('Sisa tagihan: ${_currencyFmt.format(row.sisaPiutang)}', style: TextStyle(fontSize: 12, color: Colors.grey.shade700)),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                if (row.adaPiutang) ...[
                  TextButton.icon(
                    onPressed: () => _payReceivable(row),
                    icon: const Icon(Icons.payment_rounded, size: 16),
                    label: const Text('Terima Piutang'),
                  ),
                  const SizedBox(width: 8),
                ],
                if (!_showSudah)
                  FilledButton.icon(
                    onPressed: () => _markSudahDiambil(row),
                    icon: const Icon(Icons.done_rounded, size: 16),
                    label: const Text('Sudah Diambil'),
                    style: FilledButton.styleFrom(backgroundColor: AppColors.warning),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 4: Jalankan test Pengambilan**

Run:

```bash
cd flutter && flutter test test/features/pengambilan_page_test.dart test/models/pengambilan_model_test.dart
```

Expected: PASS.

---

### Task 6: Navigasi Flutter

**Files:**
- Modify: `flutter/lib/core/router/app_router.dart`
- Modify: `flutter/lib/widgets/app_shell.dart`

**Interfaces:**
- Produces route `/pengambilan`.
- Produces drawer menu `Pengambilan` under `Produksi`.

- [ ] **Step 1: Tambah import route**

Di `flutter/lib/core/router/app_router.dart`, tambah:

```dart
import 'package:gemiprint/features/pengambilan/pengambilan_page.dart';
```

- [ ] **Step 2: Tambah GoRoute**

Di daftar routes dalam `ShellRoute`, setelah `/production`, tambah:

```dart
          GoRoute(
            path: '/pengambilan',
            builder: (context, state) => const PengambilanPage(),
          ),
```

- [ ] **Step 3: Tambah menu drawer**

Di `flutter/lib/widgets/app_shell.dart`, dalam grup `Produksi`, setelah SPK tambah:

```dart
      _MenuItemData(
        path: '/pengambilan',
        icon: Icons.inventory_2_rounded,
        label: 'Pengambilan',
        allowedRoles: RoleGroups.operational,
      ),
```

- [ ] **Step 4: Update title path**

Cari `_titleForPath` di `flutter/lib/widgets/app_shell.dart`; tambahkan:

```dart
      case '/pengambilan':
        return 'Pengambilan';
```

- [ ] **Step 5: Jalankan analyze untuk router/shell**

Run:

```bash
cd flutter && flutter analyze lib/core/router/app_router.dart lib/widgets/app_shell.dart
```

Expected: no issues.

---

### Task 7: Verifikasi akhir

**Files:**
- Semua file dari Task 1-6.

**Interfaces:**
- Confirms backend and Flutter plan deliverables work together.

- [ ] **Step 1: Jalankan backend route tests**

Run:

```bash
npx jest src/app/api/produksi/pengambilan/__tests__/route.test.ts src/app/api/produksi/pengambilan/[orderId]/sudah-diambil/__tests__/route.test.ts src/app/api/produksi/[id]/siap-diambil/__tests__/route.test.ts
```

Expected: PASS.

- [ ] **Step 2: Jalankan TypeScript type-check**

Run:

```bash
npm run type-check
```

Expected: 0 errors.

- [ ] **Step 3: Jalankan Flutter targeted tests**

Run:

```bash
cd flutter && flutter test test/models/production_model_test.dart test/models/pengambilan_model_test.dart test/features/production_page_test.dart test/features/pengambilan_page_test.dart
```

Expected: PASS.

- [ ] **Step 4: Jalankan Flutter analyze untuk file tersentuh**

Run:

```bash
cd flutter && flutter analyze lib/models/production.dart lib/models/pengambilan.dart lib/services/production_service.dart lib/services/pengambilan_service.dart lib/features/production/production_page.dart lib/features/pengambilan/pengambilan_page.dart lib/core/router/app_router.dart lib/widgets/app_shell.dart
```

Expected: no issues.

- [ ] **Step 5: Jalankan build web**

Run:

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 6: Update graphify setelah kode berubah**

Run:

```bash
graphify update .
```

Expected: graph updated without blocking implementation.

---

## Self-Review

- Spec coverage: Task 1 covers REST route gap; Task 2 covers model parsing; Task 3 covers services/cache; Task 4 covers SPK parity; Task 5 covers Pengambilan page; Task 6 covers navigation; Task 7 covers verification.
- Placeholder scan: no `TBD`, no deferred implementation text.
- Type consistency: route response field is `rows`; Dart service parses `data['rows']`; model field names match service JSON (`order_id`, `nomor_spk`, `sisa_piutang`, `piutang_id`).
- Scope discipline: plan excludes web-only workflow such as print SPK, editor pelanggan, and roll consumption input.
