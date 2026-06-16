# Keuangan Mobile (Flutter) — Rencana Implementasi

> **Untuk pekerja agentic:** GUNAKAN SUB-SKILL: superpowers:subagent-driven-development (disarankan) atau superpowers:executing-plans untuk implementasi task-by-task. Langkah-langkah menggunakan sintaks checkbox (`- [ ] `) untuk pelacakan.

**Goal:** Membangun ulang halaman Keuangan Flutter dengan dua tab (Buku Kas + Kasbon), dua kartu ringkasan, dan 4 endpoint API baru/perubahan.

**Arsitektur:** Flutter memanggil Next.js API routes dengan JWT Bearer. Semua kalkulasi (AST engine, AVCO, saldo kasbon) tetap server-side. Mobile hanya render dan submit. Perubahan API meliputi: tambah field `dapat_dihapus` di cash-book GET, guard DELETE dengan pengecekan server-side, endpoint `ringkasan-kasbon` baru, dan endpoint `ringkasan-hutang-piutang` baru.

**Tech Stack:** Next.js API routes (TypeScript), Flutter (Dart, Material 3, Riverpod), Supabase Postgres, Jest (API tests)

---

## File Map

| File | Action | Tanggung Jawab |
|------|--------|---------------|
| `src/app/api/keuangan/cash-book/route.ts` | Modify | Tambah `dapat_dihapus` di GET response |
| `src/app/api/keuangan/cash-book/[id]/route.ts` | Modify | Perkuat guard DELETE |
| `src/lib/services/finance-service.ts` | Modify | Tambah `canDeleteCashBookEntry`, ubah `deleteManualCashBookEntry` |
| `src/app/api/penggajian/ringkasan-kasbon/route.ts` | **Create** | Endpoint ringkasan kasbon baru |
| `src/app/api/keuangan/ringkasan-hutang-piutang/route.ts` | **Create** | Endpoint hutang-piutang baru |
| `src/lib/__tests__/finance-api.test.ts` | Modify | Test untuk perubahan API |
| `flutter/lib/models/cashbook.dart` | Modify | Tambah field `dapatDihapus` |
| `flutter/lib/models/ringkasan_kasbon.dart` | **Create** | Model RingkasanKasbon |
| `flutter/lib/models/ringkasan_hutang_piutang.dart` | **Create** | Model RingkasanHutangPiutang |
| `flutter/lib/services/finance_service.dart` | Modify | Tambah method `getRingkasanKasbon`, `getRingkasanHutangPiutang` |
| `flutter/lib/features/finance/finance_page.dart` | Rewrite | Halaman baru dengan tab + kartu ringkasan |
| `flutter/lib/features/finance/form_transaksi_sheet.dart` | **Create** | Bottom sheet form tambah transaksi |
| `flutter/lib/features/finance/detail_kasbon_sheet.dart` | **Create** | Bottom sheet detail kasbon karyawan |
| `flutter/lib/features/customers/customers_page.dart` | Modify | Hapus tombol empty state |
| `flutter/lib/features/vendors/vendors_page.dart` | Modify | Hapus tombol empty state, unifikasi FAB |
| `flutter/lib/features/materials/materials_page.dart` | Modify | Hapus tombol empty state, unifikasi FAB |
| `flutter/lib/features/purchases/purchases_page.dart` | Modify | Hapus tombol empty state, ubah teks FAB, unifikasi FAB |

---

### Task 1: Tambah `dapat_dihapus` ke GET /api/keuangan/cash-book

**Files:**
- Modify: `src/app/api/keuangan/cash-book/route.ts:10-32`
- Modify: `src/lib/services/finance-service.ts` (tambah helper)
- Modify: `src/lib/__tests__/finance-api.test.ts`

- [ ] **Step 1: Tambah fungsi `canDeleteCashBookEntry` di finance-service.ts**

Buka `src/lib/services/finance-service.ts`, tambah setelah `deleteManualCashBookEntry`:

```ts
/**
 * Tentukan apakah baris keuangan dapat dihapus dari Buku Kas.
 * Manual = reference_type NULL atau bukan dari POS/pembelian/kasbon.
 */
export function canDeleteCashBookEntry(entry: {
  reference_type?: string | null;
  keperluan?: string | null;
}): boolean {
  // Baris dari POS, pembelian, atau kasbon TIDAK bisa dihapus dari Buku Kas
  if (
    entry.reference_type === "SALE" ||
    entry.reference_type === "PURCHASE" ||
    entry.reference_type === "PINJAMAN_KARYAWAN"
  ) {
    return false;
  }
  // Fallback: cek token [REF: di keperluan (data sebelum migration)
  const k = entry.keperluan ?? "";
  if (
    k.includes("[REF:purchase-") ||
    k.includes("[REF:pinjaman-") ||
    k.includes("[REF:sale-")
  ) {
    return false;
  }
  return true;
}
```

- [ ] **Step 2: Modifikasi GET cash-book untuk menyertakan `dapat_dihapus`**

Di `src/app/api/keuangan/cash-book/route.ts`, di blok Supabase (line 22-31), setelah `systemMetrics` dibuat, tambah mapping `dapat_dihapus`:

```ts
// Di dalam blok if (getServerSupabaseClient()), setelah:
// const systemMetrics = { ... };
// return NextResponse.json({ cashBooks, systemMetrics });

// Ubah return menjadi:
const cashBooksWithDeletable = cashBooks.map((row: Record<string, unknown>) => ({
  ...row,
  dapat_dihapus: canDeleteCashBookEntry({
    reference_type: (row.reference_type as string) ?? null,
    keperluan: (row.keperluan as string) ?? null,
  }),
}));
return NextResponse.json({ cashBooks: cashBooksWithDeletable, systemMetrics });
```

Untuk blok SQLite (line 35-55), lakukan hal yang sama:

```ts
// Setelah const cashBooks = ... query raw, tambah:
const cashBooksWithDeletable = (cashBooks as Record<string, unknown>[]).map((row) => ({
  ...row,
  dapat_dihapus: canDeleteCashBookEntry({
    reference_type: (row.reference_type as string) ?? null,
    keperluan: (row.keperluan as string) ?? null,
  }),
}));
return NextResponse.json({ cashBooks: cashBooksWithDeletable, systemMetrics });
```

Pastikan import `canDeleteCashBookEntry` dari `@/lib/services/finance-service` ditambahkan di bagian atas file.

- [ ] **Step 3: Tulis test untuk field `dapat_dihapus`**

Di `src/lib/__tests__/finance-api.test.ts`, tambah test:

```ts
import { canDeleteCashBookEntry } from "../services/finance-service";

describe("canDeleteCashBookEntry", () => {
  it("manual entry (tanpa reference_type) → true", () => {
    expect(canDeleteCashBookEntry({})).toBe(true);
    expect(canDeleteCashBookEntry({ reference_type: null })).toBe(true);
  });

  it("reference_type SALE → false", () => {
    expect(canDeleteCashBookEntry({ reference_type: "SALE" })).toBe(false);
  });

  it("reference_type PURCHASE → false", () => {
    expect(canDeleteCashBookEntry({ reference_type: "PURCHASE" })).toBe(false);
  });

  it("reference_type PINJAMAN_KARYAWAN → false", () => {
    expect(canDeleteCashBookEntry({ reference_type: "PINJAMAN_KARYAWAN" })).toBe(false);
  });

  it("fallback: keperluan mengandung [REF:purchase- → false", () => {
    expect(
      canDeleteCashBookEntry({ keperluan: "Bayar [REF:purchase-abc123]" })
    ).toBe(false);
  });

  it("fallback: keperluan mengandung [REF:pinjaman- → false", () => {
    expect(
      canDeleteCashBookEntry({ keperluan: "Tarik [REF:pinjaman-xyz]" })
    ).toBe(false);
  });
});
```

- [ ] **Step 4: Jalankan test**

```bash
cd /home/gemi/Projects/gemiprintaio && npx jest src/lib/__tests__/finance-api.test.ts --testPathPattern="canDeleteCashBookEntry" --no-coverage
```

Expected: semua test PASS.

- [ ] **Step 5: Type-check dan build**

```bash
npm run type-check && npm run build
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/finance-service.ts src/app/api/keuangan/cash-book/route.ts src/lib/__tests__/finance-api.test.ts
git commit -m "feat(api): tambah field dapat_dihapus di GET /api/keuangan/cash-book"
```

---

### Task 2: Perkuat guard DELETE /api/keuangan/cash-book/[id]

**Files:**
- Modify: `src/app/api/keuangan/cash-book/[id]/route.ts`
- Modify: `src/lib/services/finance-service.ts`

- [ ] **Step 1: Ubah `deleteManualCashBookEntry` agar cek `reference_type` juga**

Di `src/lib/services/finance-service.ts`, ganti fungsi `deleteManualCashBookEntry`:

```ts
export async function deleteManualCashBookEntry(
  id: string
): Promise<"deleted" | "not_found" | "purchase_linked"> {
  const entry = await getCashBookEntry(id);
  if (!entry) return "not_found";
  
  // Cek via reference_type + fallback ke keperluan
  if (!canDeleteCashBookEntry({
    reference_type: entry.reference_type,
    keperluan: entry.keperluan,
  })) {
    return "purchase_linked";
  }
  
  const del = await db.delete("keuangan", id);
  if (del.error) throw del.error;
  await recalculateCashbookIfAvailable();
  return "deleted";
}
```

- [ ] **Step 2: Update pesan error DELETE route untuk lebih generik**

Di `src/app/api/keuangan/cash-book/[id]/route.ts`, update response `"purchase_linked"`:

```ts
// Ganti:
// "purchase_linked" → 403 { error: "Transaksi pembelian harus dibatalkan melalui Halaman Pembelian", isPurchaseTransaction: true }

// Menjadi:
if (result === "purchase_linked") {
  return NextResponse.json(
    { error: "Transaksi ini tidak dapat dihapus dari Buku Kas. Batalkan dari sumber transaksinya (POS/Pembelian/Kasbon)." },
    { status: 403 }
  );
}
```

- [ ] **Step 3: Type-check dan build**

```bash
npm run type-check && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/services/finance-service.ts src/app/api/keuangan/cash-book/\[id\]/route.ts
git commit -m "feat(api): perkuat guard DELETE cash-book dengan cek reference_type"
```

---

### Task 3: Endpoint baru — GET /api/penggajian/ringkasan-kasbon

**Files:**
- Create: `src/app/api/penggajian/ringkasan-kasbon/route.ts`

- [ ] **Step 1: Buat route file**

Buat `src/app/api/penggajian/ringkasan-kasbon/route.ts`:

```ts
import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { listBusinessActors } from "@/lib/services/business-actor-service";
import { hitungSaldoPinjamanBatch } from "@/lib/services/pinjaman-karyawan-service";

export async function GET() {
  try {
    // Ambil semua pegawai aktif
    const actors = await listBusinessActors({ includeInactive: false });
    
    if (actors.length === 0) {
      return NextResponse.json({
        karyawan: [],
        total_kasbon: 0,
        jumlah_karyawan: 0,
      });
    }

    const actorIds = actors.map((a) => a.id);
    
    // Hitung saldo kasbon batch (hindari N+1)
    const saldoMap = await hitungSaldoPinjamanBatch(actorIds);

    const karyawan = actors.map((a) => ({
      actor_id: a.id,
      nama: a.display_name,
      role: a.role_code,
      role_label: a.role_label ?? a.role_code,
      saldo_pinjaman: saldoMap.get(a.id) ?? 0,
    }));

    const total_kasbon = karyawan.reduce((sum, k) => sum + k.saldo_pinjaman, 0);
    const jumlah_karyawan = karyawan.filter((k) => k.saldo_pinjaman > 0).length;

    return NextResponse.json({ karyawan, total_kasbon, jumlah_karyawan });
  } catch (error) {
    console.error("GET /api/penggajian/ringkasan-kasbon error:", error);
    return NextResponse.json(
      { error: "Gagal memuat ringkasan kasbon" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Verifikasi field dari listBusinessActors**

Cek `src/lib/services/business-actor-service.ts` untuk memastikan `BusinessActor` punya field: `id`, `display_name`, `role_code`, `role_label`. Jika `role_label` tidak ada, ganti dengan `role_code` saja.

- [ ] **Step 3: Type-check dan build**

```bash
npm run type-check && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/penggajian/ringkasan-kasbon/route.ts
git commit -m "feat(api): endpoint GET /api/penggajian/ringkasan-kasbon"
```

---

### Task 4: Endpoint baru — GET /api/keuangan/ringkasan-hutang-piutang

**Files:**
- Create: `src/app/api/keuangan/ringkasan-hutang-piutang/route.ts`

- [ ] **Step 1: Buat route file**

Buat `src/app/api/keuangan/ringkasan-hutang-piutang/route.ts`:

```ts
import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { db, getServerSupabaseClient } from "@/lib/db-unified";

export async function GET() {
  try {
    let totalHutang = 0;
    let jumlahHutang = 0;
    let totalPiutang = 0;
    let jumlahPiutang = 0;

    if (getServerSupabaseClient()) {
      // Path Supabase: query lewat db-unified (PostgREST)
      const hutangResult = await db.queryRaw<{ sisa: number; count: number }>(
        `SELECT COALESCE(SUM(sisa_hutang), 0) as sisa, COUNT(*) as count
         FROM hutang_pembelian
         WHERE status = 'AKTIF' AND COALESCE(is_deleted, false) = false`,
        []
      );
      const piutangResult = await db.queryRaw<{ sisa: number; count: number }>(
        `SELECT COALESCE(SUM(sisa_piutang), 0) as sisa, COUNT(*) as count
         FROM piutang_penjualan
         WHERE status IN ('AKTIF', 'SEBAGIAN') AND COALESCE(is_deleted, false) = false`,
        []
      );
      
      totalHutang = Number(hutangResult[0]?.sisa ?? 0);
      jumlahHutang = Number(hutangResult[0]?.count ?? 0);
      totalPiutang = Number(piutangResult[0]?.sisa ?? 0);
      jumlahPiutang = Number(piutangResult[0]?.count ?? 0);
    } else {
      // Path SQLite
      const hutangResult = await db.queryRaw<{ sisa: number; count: number }>(
        `SELECT COALESCE(SUM(sisa_hutang), 0) as sisa, COUNT(*) as count
         FROM hutang_pembelian
         WHERE status = 'AKTIF' AND COALESCE(is_deleted, 0) = 0`,
        []
      );
      const piutangResult = await db.queryRaw<{ sisa: number; count: number }>(
        `SELECT COALESCE(SUM(sisa_piutang), 0) as sisa, COUNT(*) as count
         FROM piutang_penjualan
         WHERE status IN ('AKTIF', 'SEBAGIAN') AND COALESCE(is_deleted, 0) = 0`,
        []
      );
      
      totalHutang = Number(hutangResult[0]?.sisa ?? 0);
      jumlahHutang = Number(hutangResult[0]?.count ?? 0);
      totalPiutang = Number(piutangResult[0]?.sisa ?? 0);
      jumlahPiutang = Number(piutangResult[0]?.count ?? 0);
    }

    return NextResponse.json({
      hutang: { total: totalHutang, jumlah: jumlahHutang },
      piutang: { total: totalPiutang, jumlah: jumlahPiutang },
    });
  } catch (error) {
    console.error("GET /api/keuangan/ringkasan-hutang-piutang error:", error);
    return NextResponse.json(
      { error: "Gagal memuat ringkasan hutang piutang" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Type-check dan build**

```bash
npm run type-check && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/keuangan/ringkasan-hutang-piutang/route.ts
git commit -m "feat(api): endpoint GET /api/keuangan/ringkasan-hutang-piutang"
```

---

### Task 5: Model Flutter baru + update CashBookEntry

**Files:**
- Create: `flutter/lib/models/ringkasan_kasbon.dart`
- Create: `flutter/lib/models/ringkasan_hutang_piutang.dart`
- Modify: `flutter/lib/models/cashbook.dart`

- [ ] **Step 1: Buat `ringkasan_kasbon.dart`**

```dart
class RingkasanKasbon {
  final List<KaryawanKasbon> karyawan;
  final double totalKasbon;
  final int jumlahKaryawan;

  const RingkasanKasbon({
    required this.karyawan,
    required this.totalKasbon,
    required this.jumlahKaryawan,
  });

  factory RingkasanKasbon.fromJson(Map<String, dynamic> json) {
    return RingkasanKasbon(
      karyawan: (json['karyawan'] as List<dynamic>?)
              ?.map((j) => KaryawanKasbon.fromJson(j as Map<String, dynamic>))
              .toList() ??
          [],
      totalKasbon: (json['total_kasbon'] as num?)?.toDouble() ?? 0,
      jumlahKaryawan: (json['jumlah_karyawan'] as num?)?.toInt() ?? 0,
    );
  }
}

class KaryawanKasbon {
  final String actorId;
  final String nama;
  final String role;
  final String roleLabel;
  final double saldoPinjaman;

  const KaryawanKasbon({
    required this.actorId,
    required this.nama,
    required this.role,
    required this.roleLabel,
    required this.saldoPinjaman,
  });

  factory KaryawanKasbon.fromJson(Map<String, dynamic> json) {
    return KaryawanKasbon(
      actorId: json['actor_id'] as String? ?? '',
      nama: json['nama'] as String? ?? '',
      role: json['role'] as String? ?? '',
      roleLabel: json['role_label'] as String? ?? '',
      saldoPinjaman: (json['saldo_pinjaman'] as num?)?.toDouble() ?? 0,
    );
  }
}
```

- [ ] **Step 2: Buat `ringkasan_hutang_piutang.dart`**

```dart
class RingkasanHutangPiutang {
  final HutangPiutangInfo hutang;
  final HutangPiutangInfo piutang;

  const RingkasanHutangPiutang({
    required this.hutang,
    required this.piutang,
  });

  factory RingkasanHutangPiutang.fromJson(Map<String, dynamic> json) {
    return RingkasanHutangPiutang(
      hutang: HutangPiutangInfo.fromJson(
          json['hutang'] as Map<String, dynamic>? ?? {}),
      piutang: HutangPiutangInfo.fromJson(
          json['piutang'] as Map<String, dynamic>? ?? {}),
    );
  }
}

class HutangPiutangInfo {
  final double total;
  final int jumlah;

  const HutangPiutangInfo({
    required this.total,
    required this.jumlah,
  });

  factory HutangPiutangInfo.fromJson(Map<String, dynamic> json) {
    return HutangPiutangInfo(
      total: (json['total'] as num?)?.toDouble() ?? 0,
      jumlah: (json['jumlah'] as num?)?.toInt() ?? 0,
    );
  }
}
```

- [ ] **Step 3: Tambah `dapatDihapus` ke `CashBookEntry`**

Di `flutter/lib/models/cashbook.dart`, tambah field:

```dart
// Di dalam constructor, tambah:
final bool dapatDihapus;

// Default:
this.dapatDihapus = true,

// Di fromJson, tambah:
dapatDihapus: json['dapat_dihapus'] as bool? ?? true,
```

- [ ] **Step 4: Commit**

```bash
git add flutter/lib/models/ringkasan_kasbon.dart flutter/lib/models/ringkasan_hutang_piutang.dart flutter/lib/models/cashbook.dart
git commit -m "feat(flutter): model RingkasanKasbon, RingkasanHutangPiutang, tambah dapatDihapus di CashBookEntry"
```

---

### Task 6: Extend FinanceService Flutter

**Files:**
- Modify: `flutter/lib/services/finance_service.dart`

- [ ] **Step 1: Tambah method `getRingkasanKasbon` dan `getRingkasanHutangPiutang`**

Di `flutter/lib/services/finance_service.dart`, tambah setelah method `getConfig`:

```dart
import 'package:gemiprint/models/ringkasan_kasbon.dart';
import 'package:gemiprint/models/ringkasan_hutang_piutang.dart';

// Di dalam class FinanceService, tambah:

Future<RingkasanKasbon> getRingkasanKasbon() async {
  final json = await _api.get('/api/penggajian/ringkasan-kasbon');
  return RingkasanKasbon.fromJson(json as Map<String, dynamic>);
}

Future<RingkasanHutangPiutang> getRingkasanHutangPiutang() async {
  final json = await _api.get('/api/keuangan/ringkasan-hutang-piutang');
  return RingkasanHutangPiutang.fromJson(json as Map<String, dynamic>);
}
```

- [ ] **Step 2: Commit**

```bash
git add flutter/lib/services/finance_service.dart
git commit -m "feat(flutter): tambah getRingkasanKasbon + getRingkasanHutangPiutang di FinanceService"
```

---

### Task 7: Rewrite finance_page.dart (Bagian 1 — Struktur + Kartu Ringkasan)

**Files:**
- Rewrite: `flutter/lib/features/finance/finance_page.dart`

- [ ] **Step 1: Tulis ulang struktur halaman**

Hapus seluruh isi `finance_page.dart` dan ganti dengan:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gemiprint/core/constants/roles.dart';
import 'package:gemiprint/core/theme/app_theme.dart';
import 'package:gemiprint/models/cashbook.dart';
import 'package:gemiprint/models/ringkasan_kasbon.dart';
import 'package:gemiprint/models/ringkasan_hutang_piutang.dart';
import 'package:gemiprint/providers/providers.dart';
import 'package:gemiprint/services/api_client.dart';
import 'package:gemiprint/widgets/confirm_dialog.dart';
import 'package:gemiprint/widgets/empty_state.dart';
import 'package:gemiprint/widgets/snackbar_helper.dart';
import 'package:intl/intl.dart';
import 'form_transaksi_sheet.dart';
import 'detail_kasbon_sheet.dart';

class FinancePage extends ConsumerStatefulWidget {
  const FinancePage({super.key});

  @override
  ConsumerState<FinancePage> createState() => _FinancePageState();
}

class _FinancePageState extends ConsumerState<FinancePage>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;

  // Buku Kas state
  List<CashBookEntry> _entries = [];
  List<String> _kategoriOptions = [];
  Map<String, dynamic> _systemMetrics = {};
  bool _isLoading = true;
  String _search = '';
  String _filterKategori = 'SEMUA';

  // Ringkasan state
  RingkasanKasbon? _ringkasanKasbon;
  RingkasanHutangPiutang? _ringkasanHutangPiutang;

  final _fmt = NumberFormat.currency(
    locale: 'id_ID',
    symbol: 'Rp ',
    decimalDigits: 0,
  );

  String _formatShort(double value) {
    if (value.abs() >= 1000000) {
      return '${(value / 1000000).toStringAsFixed(1)}jt';
    }
    return _fmt.format(value);
  }

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _loadData();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadData({bool forceRefresh = false}) async {
    if (_entries.isEmpty) {
      setState(() => _isLoading = true);
    }
    try {
      final service = ref.read(financeServiceProvider);
      final results = await Future.wait([
        service.getCashBook(forceRefresh: forceRefresh),
        service.getConfig().catchError((_) => <String, dynamic>{}),
        service.getRingkasanKasbon().catchError((_) => null),
        service.getRingkasanHutangPiutang().catchError((_) => null),
      ]);

      final data = results[0] as Map<String, dynamic>;
      final config = results[1] as Map<String, dynamic>;
      final kasbon = results[2] as RingkasanKasbon?;
      final hp = results[3] as RingkasanHutangPiutang?;

      final list = data['cashBooks'] as List? ?? [];
      final categories = config['categories'] as List? ?? [];

      if (mounted) {
        setState(() {
          _entries = list
              .map((j) => CashBookEntry.fromJson(j as Map<String, dynamic>))
              .toList();
          _systemMetrics = data['systemMetrics'] is Map<String, dynamic>
              ? data['systemMetrics'] as Map<String, dynamic>
              : {};
          _kategoriOptions = categories.isEmpty
              ? []
              : categories
                    .map((c) => (c['category_code'] ?? '').toString())
                    .where((c) => c.isNotEmpty)
                    .toSet()
                    .toList();
          _ringkasanKasbon = kasbon;
          _ringkasanHutangPiutang = hp;
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
        showErrorSnackbar(context, 'Gagal memuat data keuangan');
      }
    }
  }

  List<CashBookEntry> get _filtered {
    var list = _entries;
    if (_filterKategori != 'SEMUA') {
      list = list
          .where((e) => e.kategoriTransaksi == _filterKategori)
          .toList();
    }
    if (_search.isNotEmpty) {
      final q = _search.toLowerCase();
      list = list
          .where((e) =>
              e.kategoriTransaksi.toLowerCase().contains(q) ||
              (e.keperluan?.toLowerCase().contains(q) ?? false) ||
              (e.catatan?.toLowerCase().contains(q) ?? false))
          .toList();
    }
    return list;
  }

  bool get _canMutate {
    final role = ref.read(authStateProvider).valueOrNull?.role;
    return role != null && RoleGroups.adminOnly.contains(role);
  }

  double _metric(String key) =>
      (_systemMetrics[key] as num?)?.toDouble() ?? 0;

  // ... lanjut di Task 8
```

- [ ] **Step 2: Tambah widget kartu ringkasan (gaya gradient _summaryCard + _miniSummaryCard)**

Gunakan ulang gaya `_summaryCard` (gradient) dan `_miniSummaryCard` (border + background terang) dari halaman existing. Susunan baru:
- Baris 1: `_summaryCard` Saldo (gradient indigo), lebar penuh
- Baris 2: 4× `_miniSummaryCard` untuk Omzet, Biaya, Hutang, Piutang
- Baris 3: `_summaryCard` Kas (gradient amber), lebar penuh
- Baris 4: 2× `_miniSummaryCard` untuk Modal Kas, Saldo Kasbon

Lanjutkan di class `_FinancePageState`, **PERTAHANKAN** method `_summaryCard` dan `_miniSummaryCard` dari kode existing (jangan dihapus). Tambah method `_buildSummaryCards`:

```dart
  // Warna domain
  static const Color _indigoColor = Color(0xFF4F46E5);
  static const Color _amberColor = Color(0xFFF59E0B);

  Widget _buildSummaryCards() {
    final saldo = _metric('saldo');
    final omzet = _metric('omzet');
    final biayaOperasional = _metric('biaya_operasional');
    final biayaBahan = _metric('biaya_bahan');
    final totalBiaya = biayaOperasional + biayaBahan;
    final kas = _metric('kas');
    final modalKas = _metric('modal_kas');
    final saldoKasbon = _metric('saldo_kasbon');
    final hutang = _ringkasanHutangPiutang?.hutang;
    final piutang = _ringkasanHutangPiutang?.piutang;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      child: Column(
        children: [
          // === KARTU BISNIS ===
          // Saldo (gradient, lebar penuh)
          Row(
            children: [
              _summaryCard(
                'Saldo',
                saldo,
                _indigoColor,
                Icons.account_balance_wallet_rounded,
              ),
            ],
          ),
          const SizedBox(height: 8),
          // Sub-metrik: Omzet, Biaya, Hutang, Piutang
          Row(
            children: [
              Expanded(
                child: _miniSummaryCard('Omzet', omzet, AppColors.success),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: _miniSummaryCard('Biaya', totalBiaya, AppColors.warning),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Expanded(
                child: _miniSummaryCard(
                  'Hutang',
                  hutang?.total ?? 0,
                  AppColors.error,
                  subtitle: '${hutang?.jumlah ?? 0} tagihan',
                ),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: _miniSummaryCard(
                  'Piutang',
                  piutang?.total ?? 0,
                  AppColors.success,
                  subtitle: '${piutang?.jumlah ?? 0} tagihan',
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // === KARTU KAS & PENGGAJIAN ===
          // Kas (gradient amber, lebar penuh)
          Row(
            children: [
              _summaryCard(
                'Kas',
                kas,
                _amberColor,
                Icons.payments_rounded,
              ),
            ],
          ),
          const SizedBox(height: 8),
          // Sub-metrik: Modal Kas, Saldo Kasbon
          Row(
            children: [
              Expanded(
                child: _miniSummaryCard('Modal Kas', modalKas, AppColors.primary),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: _miniSummaryCard(
                  'Saldo Kasbon',
                  saldoKasbon,
                  AppColors.error,
                  subtitle: '${_ringkasanKasbon?.jumlahKaryawan ?? 0} karyawan',
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
```

**Method `_summaryCard` dan `_miniSummaryCard`** — PERTAHANKAN dari kode existing (jangan ditimpa):

```dart
  Widget _summaryCard(String label, double value, Color color, IconData icon) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [color, color.withValues(alpha: 0.8)],
          ),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            Icon(icon, color: Colors.white.withValues(alpha: 0.9), size: 24),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.85),
                      fontSize: 12,
                    ),
                  ),
                  Text(
                    _fmt.format(value),
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _miniSummaryCard(String label, double value, Color color, {String? subtitle}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(fontSize: 10, color: color.withValues(alpha: 0.8)),
          ),
          const SizedBox(height: 2),
          Text(
            _fmt.format(value.abs()) == _fmt.format(0) && value != 0
                ? '-${_fmt.format(value.abs())}'
                : _fmt.format(value),
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.bold,
              color: color,
            ),
          ),
          if (subtitle != null) ...[
            const SizedBox(height: 1),
            Text(
              subtitle,
              style: TextStyle(fontSize: 9, color: color.withValues(alpha: 0.6)),
            ),
          ],
        ],
      ),
    );
  }
```

- [ ] **Step 3: Commit**

```bash
git add flutter/lib/features/finance/finance_page.dart
git commit -m "feat(flutter): rewrite finance_page struktur + kartu ringkasan"
```

---

### Task 8: Rewrite finance_page.dart (Bagian 2 — Tab Buku Kas + Build Method)

**Files:**
- Modify: `flutter/lib/features/finance/finance_page.dart` (lanjutan)

- [ ] **Step 1: Tambah widget Buku Kas dan build method**

Lanjutkan di `_FinancePageState`, sebelum `_buildSummaryCards`:

```dart
  // ============ BUKU KAS ============

  Future<void> _showAddForm() async {
    final result = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (_) => FormTransaksiSheet(
        kategoriOptions: _kategoriOptions,
      ),
    );
    if (result == true) _loadData();
  }

  Future<void> _handleDelete(CashBookEntry entry) async {
    if (!entry.dapatDihapus) return;
    final ok = await showConfirmDialog(
      context,
      title: 'Hapus Transaksi',
      message: 'Yakin ingin menghapus "${entry.keperluan ?? 'transaksi'}"?',
      isDangerous: true,
    );
    if (!ok) return;

    try {
      await ref.read(financeServiceProvider).deleteEntry(entry.id);
      if (mounted) {
        showSuccessSnackbar(context, 'Transaksi berhasil dihapus');
        _loadData();
      }
    } on ApiException catch (e) {
      if (mounted) showErrorSnackbar(context, e.message);
    } catch (_) {
      if (mounted) showErrorSnackbar(context, 'Gagal menghapus transaksi');
    }
  }

  Color _kategoriColor(String kat) {
    switch (kat.toUpperCase()) {
      case 'KAS':
      case 'MODAL_KAS':
        return const Color(0xFF2563EB);
      case 'BIAYA':
      case 'BIAYA_OPERASIONAL':
      case 'BIAYA_BAHAN':
      case 'SUPPLY':
        return const Color(0xFFD97706);
      case 'OMZET':
      case 'LABA':
      case 'LABA_BERSIH':
        return const Color(0xFF059669);
      case 'PINJAMAN_KARYAWAN':
        return const Color(0xFFDC2626);
      default:
        return const Color(0xFF64748B);
    }
  }

  Color _kategoriBgColor(String kat) {
    switch (kat.toUpperCase()) {
      case 'KAS':
      case 'MODAL_KAS':
        return const Color(0xFFDBEAFE);
      case 'BIAYA':
      case 'BIAYA_OPERASIONAL':
      case 'BIAYA_BAHAN':
      case 'SUPPLY':
        return const Color(0xFFFEF3C7);
      case 'OMZET':
      case 'LABA':
      case 'LABA_BERSIH':
        return const Color(0xFFD1FAE5);
      case 'PINJAMAN_KARYAWAN':
        return const Color(0xFFFEE2E2);
      default:
        return const Color(0xFFF1F5F9);
    }
  }

  String _referensiLabel(CashBookEntry e) {
    // Deteksi baris dari POS, pembelian, atau kasbon via keperluan
    final k = e.keperluan ?? '';
    if (k.contains('[REF:purchase-')) return 'Pembelian';
    if (k.contains('[REF:sale-')) return 'POS';
    if (k.contains('[REF:pinjaman-')) return 'Kasbon';
    return '';
  }

  Widget _buildBukuKasList() {
    final filtered = _filtered;

    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_entries.isEmpty) {
      return EmptyState(
        icon: Icons.account_balance_wallet_rounded,
        title: 'Belum ada entri keuangan',
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
      onRefresh: () => _loadData(forceRefresh: true),
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(12, 4, 12, 80),
        itemCount: filtered.length,
        itemBuilder: (_, i) => _buildBukuKasCard(filtered[i]),
      ),
    );
  }

  Widget _buildBukuKasCard(CashBookEntry e) {
    final refLabel = _referensiLabel(e);
    final isDeletable = e.dapatDihapus && _canMutate;
    final kat = e.kategoriTransaksi.toUpperCase();
    final katColor = _kategoriColor(kat);
    final katBg = _kategoriBgColor(kat);
    final isCredit = e.kredit > 0;
    final initials = (e.keperluan ?? 'TR')
        .replaceAll(RegExp(r'[^a-zA-Z]'), '')
        .substring(0, (e.keperluan ?? 'TR').replaceAll(RegExp(r'[^a-zA-Z]'), '').length < 2
            ? (e.keperluan ?? 'TR').replaceAll(RegExp(r'[^a-zA-Z]'), '').length
            : 2)
        .toUpperCase();
    final displayInitials = initials.isEmpty ? 'TR' : initials;

    return Card(
      margin: const EdgeInsets.only(bottom: 6),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: isDeletable ? () => _handleDelete(e) : null,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              // Avatar inisial
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  gradient: const LinearGradient(
                    colors: [Color(0xFF4F46E5), Color(0xFF7C3AED)],
                  ),
                ),
                alignment: Alignment.center,
                child: Text(
                  displayInitials,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              // Konten
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            e.keperluan ?? 'Transaksi',
                            style: const TextStyle(
                              fontWeight: FontWeight.w600,
                              fontSize: 13,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (refLabel.isNotEmpty) ...[
                          const SizedBox(width: 4),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 6, vertical: 1),
                            decoration: BoxDecoration(
                              color: Colors.grey.shade200,
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(
                              refLabel,
                              style: TextStyle(
                                fontSize: 9,
                                color: Colors.grey.shade600,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 2),
                    Row(
                      children: [
                        Text(
                          _formatTanggal(e.tanggal),
                          style: TextStyle(
                            fontSize: 11,
                            color: Colors.grey.shade500,
                          ),
                        ),
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 1),
                          decoration: BoxDecoration(
                            color: katBg,
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            kat,
                            style: TextStyle(
                              fontSize: 9,
                              fontWeight: FontWeight.w600,
                              color: katColor,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              // Jumlah + aksi
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    isCredit
                        ? '+${_formatShort(e.kredit)}'
                        : '-${_formatShort(e.debit)}',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: isCredit
                          ? Colors.green.shade600
                          : Colors.red.shade600,
                    ),
                  ),
                  if (!e.dapatDihapus) ...[
                    const SizedBox(width: 4),
                    Icon(Icons.lock_outline,
                        size: 14, color: Colors.grey.shade300),
                  ],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _formatTanggal(String tgl) {
    try {
      final d = DateTime.parse(tgl);
      return '${d.day} ${_bulanPendek(d.month)} ${d.year}';
    } catch (_) {
      return tgl;
    }
  }

  String _bulanPendek(int m) {
    const bulan = [
      '', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
      'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
    ];
    return bulan[m];
  }

  // ============ BUILD ============

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          // Kartu ringkasan + TabBar (scrollable)
          Expanded(
            child: NestedScrollView(
              headerSliverBuilder: (_, __) => [
                SliverToBoxAdapter(
                  child: Column(
                    children: [
                      const SizedBox(height: 8),
                      _buildSummaryCards(),
                    ],
                  ),
                ),
                SliverPersistentHeader(
                  pinned: true,
                  delegate: _TabBarDelegate(
                    TabBar(
                      controller: _tabController,
                      labelColor: const Color(0xFF4F46E5),
                      unselectedLabelColor: Colors.grey.shade500,
                      indicatorColor: const Color(0xFF4F46E5),
                      indicatorWeight: 2,
                      labelStyle: const TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 13,
                      ),
                      tabs: const [
                        Tab(text: 'Buku Kas'),
                        Tab(text: 'Kasbon'),
                      ],
                    ),
                  ),
                ),
              ],
              body: TabBarView(
                controller: _tabController,
                children: [
                  // Tab Buku Kas
                  Column(
                    children: [
                      // Search + Filter
                      Padding(
                        padding: const EdgeInsets.fromLTRB(12, 4, 12, 4),
                        child: TextField(
                          decoration: InputDecoration(
                            hintText: 'Cari transaksi...',
                            prefixIcon:
                                const Icon(Icons.search, size: 20),
                            isDense: true,
                            filled: true,
                            fillColor: Theme.of(context)
                                .colorScheme
                                .surfaceContainerHighest
                                .withValues(alpha: 0.3),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(22),
                              borderSide: BorderSide.none,
                            ),
                            contentPadding: const EdgeInsets.symmetric(
                                horizontal: 14, vertical: 8),
                          ),
                          onChanged: (v) => setState(() => _search = v),
                        ),
                      ),
                      // FilterChip
                      if (_kategoriOptions.isNotEmpty)
                        SizedBox(
                          height: 36,
                          child: ListView(
                            scrollDirection: Axis.horizontal,
                            padding: const EdgeInsets.symmetric(horizontal: 12),
                            children: [
                              FilterChip(
                                label: const Text('Semua',
                                    style: TextStyle(fontSize: 11)),
                                selected: _filterKategori == 'SEMUA',
                                onSelected: (_) =>
                                    setState(() => _filterKategori = 'SEMUA'),
                                visualDensity: VisualDensity.compact,
                              ),
                              const SizedBox(width: 4),
                              ..._kategoriOptions.map((kat) {
                                return Padding(
                                  padding: const EdgeInsets.only(right: 4),
                                  child: FilterChip(
                                    label: Text(kat,
                                        style: const TextStyle(fontSize: 11)),
                                    selected: _filterKategori == kat,
                                    onSelected: (_) =>
                                        setState(() => _filterKategori = kat),
                                    visualDensity: VisualDensity.compact,
                                  ),
                                );
                              }),
                            ],
                          ),
                        ),
                      // List
                      Expanded(child: _buildBukuKasList()),
                    ],
                  ),
                  // Tab Kasbon (placeholder — Task 9)
                  const Center(child: Text('Kasbon')),
                ],
              ),
            ),
          ),
        ],
      ),
      floatingActionButton: _canMutate
          ? FloatingActionButton(
              backgroundColor: const Color(0xFF00AFEF),
              onPressed: () => _showAddForm(),
              child: const Icon(Icons.add_rounded),
            )
          : null,
    );
  }
}

// Delegate untuk SliverPersistentHeader agar TabBar bisa dipin
class _TabBarDelegate extends SliverPersistentHeaderDelegate {
  final TabBar tabBar;

  const _TabBarDelegate(this.tabBar);

  @override
  Widget build(
      BuildContext context, double shrinkOffset, bool overlapsContent) {
    return Container(
      color: Theme.of(context).scaffoldBackgroundColor,
      child: tabBar,
    );
  }

  @override
  double get maxExtent => tabBar.preferredSize.height;

  @override
  double get minExtent => tabBar.preferredSize.height;

  @override
  bool shouldRebuild(_TabBarDelegate oldDelegate) => false;
}
```

- [ ] **Step 2: Commit**

```bash
git add flutter/lib/features/finance/finance_page.dart
git commit -m "feat(flutter): tab Buku Kas + build method di finance_page"
```

---

### Task 9: Form Transaksi Bottom Sheet

**Files:**
- Create: `flutter/lib/features/finance/form_transaksi_sheet.dart`

- [ ] **Step 1: Buat form sheet**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gemiprint/providers/providers.dart';
import 'package:gemiprint/services/api_client.dart';
import 'package:gemiprint/widgets/snackbar_helper.dart';
import 'package:intl/intl.dart';

class FormTransaksiSheet extends ConsumerStatefulWidget {
  final List<String> kategoriOptions;

  const FormTransaksiSheet({super.key, required this.kategoriOptions});

  @override
  ConsumerState<FormTransaksiSheet> createState() => _FormTransaksiSheetState();
}

class _FormTransaksiSheetState extends ConsumerState<FormTransaksiSheet> {
  final _formKey = GlobalKey<FormState>();
  bool _isSubmitting = false;

  String _kategori = 'KAS';
  String _jenis = 'kredit'; // 'debit' atau 'kredit'
  DateTime _tanggal = DateTime.now();
  final _jumlahCtrl = TextEditingController();
  final _keperluanCtrl = TextEditingController();
  final _catatanCtrl = TextEditingController();

  @override
  void dispose() {
    _jumlahCtrl.dispose();
    _keperluanCtrl.dispose();
    _catatanCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isSubmitting = true);
    try {
      final jumlah = double.parse(_jumlahCtrl.text.replaceAll('.', ''));
      final tanggalStr =
          '${_tanggal.year}-${_tanggal.month.toString().padLeft(2, '0')}-${_tanggal.day.toString().padLeft(2, '0')}';

      await ref.read(financeServiceProvider).createEntry({
        'tanggal': tanggalStr,
        'kategori_transaksi': _kategori,
        'debit': _jenis == 'debit' ? jumlah : 0,
        'kredit': _jenis == 'kredit' ? jumlah : 0,
        'keperluan': _keperluanCtrl.text.trim(),
        'catatan': _catatanCtrl.text.trim(),
      });

      if (mounted) {
        showSuccessSnackbar(context, 'Transaksi berhasil ditambahkan');
        Navigator.pop(context, true);
      }
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _isSubmitting = false);
        showErrorSnackbar(context, e.message);
      }
    } catch (_) {
      if (mounted) {
        setState(() => _isSubmitting = false);
        showErrorSnackbar(context, 'Gagal menambahkan transaksi');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.85,
      ),
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Handle
            Container(
              margin: const EdgeInsets.symmetric(vertical: 8),
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.grey.shade300,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            // Header
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    'Tambah Transaksi',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
            ),
            const Divider(height: 1),
            // Form fields (scrollable)
            Flexible(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Tanggal
                    const Text('Tanggal',
                        style: TextStyle(
                            fontSize: 13, fontWeight: FontWeight.w500)),
                    const SizedBox(height: 4),
                    InkWell(
                      onTap: () async {
                        final picked = await showDatePicker(
                          context: context,
                          initialDate: _tanggal,
                          firstDate: DateTime(2020),
                          lastDate: DateTime(2100),
                        );
                        if (picked != null) {
                          setState(() => _tanggal = picked);
                        }
                      },
                      child: Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 12),
                        decoration: BoxDecoration(
                          border: Border.all(color: Colors.grey.shade300),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          DateFormat('dd MMMM yyyy', 'id_ID').format(_tanggal),
                          style: const TextStyle(fontSize: 14),
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    // Kategori
                    const Text('Kategori',
                        style: TextStyle(
                            fontSize: 13, fontWeight: FontWeight.w500)),
                    const SizedBox(height: 4),
                    DropdownButtonFormField<String>(
                      value: _kategori,
                      items: widget.kategoriOptions
                          .map((k) => DropdownMenuItem(
                                value: k,
                                child: Text(k, style: const TextStyle(fontSize: 14)),
                              ))
                          .toList(),
                      onChanged: (v) => setState(() => _kategori = v!),
                      decoration: InputDecoration(
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 10),
                      ),
                    ),
                    const SizedBox(height: 16),
                    // Jenis (Debit/Kredit)
                    Row(
                      children: [
                        Expanded(
                          child: RadioListTile<String>(
                            title: const Text('Pengeluaran (Debit)',
                                style: TextStyle(fontSize: 13)),
                            value: 'debit',
                            groupValue: _jenis,
                            onChanged: (v) => setState(() => _jenis = v!),
                            dense: true,
                            contentPadding: EdgeInsets.zero,
                          ),
                        ),
                        Expanded(
                          child: RadioListTile<String>(
                            title: const Text('Pemasukan (Kredit)',
                                style: TextStyle(fontSize: 13)),
                            value: 'kredit',
                            groupValue: _jenis,
                            onChanged: (v) => setState(() => _jenis = v!),
                            dense: true,
                            contentPadding: EdgeInsets.zero,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    // Jumlah
                    const Text('Jumlah',
                        style: TextStyle(
                            fontSize: 13, fontWeight: FontWeight.w500)),
                    const SizedBox(height: 4),
                    TextFormField(
                      controller: _jumlahCtrl,
                      keyboardType: TextInputType.number,
                      decoration: InputDecoration(
                        hintText: '0',
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 10),
                      ),
                      validator: (v) {
                        if (v == null || v.trim().isEmpty) {
                          return 'Jumlah wajib diisi';
                        }
                        final n = double.tryParse(v.replaceAll('.', ''));
                        if (n == null || n <= 0) return 'Jumlah tidak valid';
                        return null;
                      },
                    ),
                    const SizedBox(height: 16),
                    // Keperluan
                    const Text('Keperluan',
                        style: TextStyle(
                            fontSize: 13, fontWeight: FontWeight.w500)),
                    const SizedBox(height: 4),
                    TextFormField(
                      controller: _keperluanCtrl,
                      decoration: InputDecoration(
                        hintText: 'Contoh: Beli ATK',
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 10),
                      ),
                    ),
                    const SizedBox(height: 16),
                    // Catatan
                    const Text('Catatan',
                        style: TextStyle(
                            fontSize: 13, fontWeight: FontWeight.w500)),
                    const SizedBox(height: 4),
                    TextFormField(
                      controller: _catatanCtrl,
                      maxLines: 2,
                      decoration: InputDecoration(
                        hintText: 'Opsional',
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 10),
                      ),
                    ),
                    const SizedBox(height: 24),
                    // Tombol
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: _isSubmitting ? null : _submit,
                        child: Text(
                          _isSubmitting ? 'Menyimpan...' : 'Simpan',
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add flutter/lib/features/finance/form_transaksi_sheet.dart
git commit -m "feat(flutter): bottom sheet form tambah transaksi"
```

---

### Task 10: Tab Kasbon + Detail Sheet

**Files:**
- Create: `flutter/lib/features/finance/detail_kasbon_sheet.dart`
- Modify: `flutter/lib/features/finance/finance_page.dart` (ganti placeholder tab Kasbon)

- [ ] **Step 1: Buat `detail_kasbon_sheet.dart`**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gemiprint/models/ringkasan_kasbon.dart';
import 'package:gemiprint/providers/providers.dart';
import 'package:gemiprint/services/api_client.dart';
import 'package:gemiprint/widgets/confirm_dialog.dart';
import 'package:gemiprint/widgets/snackbar_helper.dart';
import 'package:intl/intl.dart';

class DetailKasbonSheet extends ConsumerStatefulWidget {
  final KaryawanKasbon karyawan;
  final VoidCallback onSuccess;

  const DetailKasbonSheet({
    super.key,
    required this.karyawan,
    required this.onSuccess,
  });

  @override
  ConsumerState<DetailKasbonSheet> createState() => _DetailKasbonSheetState();
}

class _DetailKasbonSheetState extends ConsumerState<DetailKasbonSheet> {
  List<Map<String, dynamic>> _riwayat = [];
  bool _isLoading = true;
  final _fmt = NumberFormat.currency(locale: 'id_ID', symbol: 'Rp ', decimalDigits: 0);

  @override
  void initState() {
    super.initState();
    _loadRiwayat();
  }

  Future<void> _loadRiwayat() async {
    try {
      final data = await ref.read(financeServiceProvider).getKasbonRiwayat(
        widget.karyawan.actorId,
      );
      if (mounted) {
        setState(() {
          _riwayat = (data['pinjaman'] as List<dynamic>?)
                  ?.map((j) => j as Map<String, dynamic>)
                  .toList() ??
              [];
          _isLoading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _doAction(String action) async {
    // Tarik = buka form jumlah, Bayar = buka form jumlah
    final isTarik = action == 'tarik';
    final today = DateTime.now();
    final tanggalStr =
        '${today.year}-${today.month.toString().padLeft(2, '0')}-${today.day.toString().padLeft(2, '0')}';

    final jumlahCtrl = TextEditingController();
    final ketCtrl = TextEditingController();

    final result = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
        child: Container(
          padding: const EdgeInsets.all(20),
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                isTarik ? 'Tarik Kasbon' : 'Bayar Tunai',
                style: const TextStyle(
                    fontSize: 18, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: jumlahCtrl,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(
                  labelText: 'Jumlah',
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: ketCtrl,
                decoration: InputDecoration(
                  labelText: 'Keterangan (opsional)',
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                  ),
                ),
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor:
                        isTarik ? Colors.red.shade600 : Colors.green.shade600,
                  ),
                  onPressed: () async {
                    final j = double.tryParse(
                        jumlahCtrl.text.replaceAll('.', ''));
                    if (j == null || j <= 0) return;
                    try {
                      final body = <String, dynamic>{
                        'action': isTarik ? 'tarik' : 'bayar',
                        'actor_id': widget.karyawan.actorId,
                        'jumlah': j,
                        'tanggal': tanggalStr,
                      };
                      if (ketCtrl.text.isNotEmpty) {
                        body['keterangan'] = ketCtrl.text;
                      }
                      await ref
                          .read(financeServiceProvider)
                          .kasbonAction(body);
                      if (ctx.mounted) {
                        Navigator.pop(ctx, true);
                      }
                    } on ApiException catch (e) {
                      if (ctx.mounted) {
                        showErrorSnackbar(ctx, e.message);
                      }
                    }
                  },
                  child: Text(isTarik ? 'Tarik' : 'Bayar'),
                ),
              ),
              const SizedBox(height: 12),
            ],
          ),
        ),
      ),
    );

    if (result == true) {
      showSuccessSnackbar(context,
          isTarik ? 'Kasbon berhasil dicatat' : 'Pembayaran berhasil dicatat');
      widget.onSuccess();
      _loadRiwayat();
    }
  }

  Future<void> _revert(Map<String, dynamic> row) async {
    final ok = await showConfirmDialog(
      context,
      title: 'Batalkan Kasbon',
      message: 'Yakin ingin membatalkan transaksi ini?',
      isDangerous: true,
    );
    if (!ok) return;

    try {
      await ref.read(financeServiceProvider).kasbonAction({
        'action': 'revert',
        'id': row['id'],
      });
      if (mounted) {
        showSuccessSnackbar(context, 'Transaksi berhasil dibatalkan');
        widget.onSuccess();
        _loadRiwayat();
      }
    } on ApiException catch (e) {
      if (mounted) showErrorSnackbar(context, e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final k = widget.karyawan;
    final initials = k.nama.isNotEmpty
        ? k.nama
            .split(' ')
            .take(2)
            .map((s) => s.isNotEmpty ? s[0].toUpperCase() : '')
            .join()
        : '?';

    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.8,
      ),
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Handle
          Container(
            margin: const EdgeInsets.symmetric(vertical: 8),
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: Colors.grey.shade300,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          // Header
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: const BoxDecoration(
                    borderRadius: BorderRadius.all(Radius.circular(16)),
                    gradient: LinearGradient(
                      colors: [Color(0xFFF59E0B), Color(0xFFD97706)],
                    ),
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    initials,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                      fontSize: 18,
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                Text(k.nama,
                    style: const TextStyle(
                        fontSize: 15, fontWeight: FontWeight.w700)),
                Text(k.roleLabel,
                    style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
                const SizedBox(height: 6),
                Text(
                  _fmt.format(k.saldoPinjaman),
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                    color: k.saldoPinjaman > 0
                        ? Colors.red.shade600
                        : Colors.green.shade600,
                  ),
                ),
                if (k.saldoPinjaman > 0)
                  Text('sisa kasbon',
                      style: TextStyle(
                          fontSize: 10, color: Colors.red.shade300)),
              ],
            ),
          ),
          // Action buttons
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                Expanded(
                  child: _actionButton(
                    'Tarik Kasbon',
                    Icons.upload_rounded,
                    Colors.red.shade50,
                    Colors.red.shade600,
                    () => _doAction('tarik'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _actionButton(
                    'Bayar Tunai',
                    Icons.payments_rounded,
                    Colors.green.shade50,
                    Colors.green.shade600,
                    () => _doAction('bayar'),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          const Divider(height: 1),
          // Riwayat
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                Text('Riwayat Kasbon',
                    style: TextStyle(
                        fontSize: 11,
                        color: Colors.grey.shade500,
                        letterSpacing: 1)),
              ],
            ),
          ),
          Flexible(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : _riwayat.isEmpty
                    ? Center(
                        child: Text('Belum ada riwayat',
                            style: TextStyle(
                                color: Colors.grey.shade500, fontSize: 13)),
                      )
                    : ListView.builder(
                        shrinkWrap: true,
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        itemCount: _riwayat.length,
                        itemBuilder: (_, i) {
                          final row = _riwayat[i];
                          final isTarik = row['jenis'] == 'TARIK';
                          final jumlah =
                              (row['jumlah'] as num?)?.toDouble() ?? 0;
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 6),
                            child: Row(
                              children: [
                                Container(
                                  width: 32,
                                  height: 32,
                                  decoration: BoxDecoration(
                                    borderRadius: BorderRadius.circular(8),
                                    color: isTarik
                                        ? Colors.red.shade50
                                        : Colors.green.shade50,
                                  ),
                                  alignment: Alignment.center,
                                  child: Text(
                                    isTarik ? 'T' : 'B',
                                    style: TextStyle(
                                      fontWeight: FontWeight.w700,
                                      fontSize: 12,
                                      color: isTarik
                                          ? Colors.red.shade600
                                          : Colors.green.shade600,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        isTarik
                                            ? 'Tarik Kasbon'
                                            : 'Bayar Tunai',
                                        style: const TextStyle(
                                          fontSize: 12,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                      Text(
                                        row['tanggal']?.toString() ?? '',
                                        style: TextStyle(
                                          fontSize: 10,
                                          color: Colors.grey.shade500,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                Text(
                                  isTarik
                                      ? '-${_fmt.format(jumlah)}'
                                      : '+${_fmt.format(jumlah)}',
                                  style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w700,
                                    color: isTarik
                                        ? Colors.red.shade600
                                        : Colors.green.shade600,
                                  ),
                                ),
                                const SizedBox(width: 4),
                                GestureDetector(
                                  onTap: () => _revert(row),
                                  child: Icon(
                                    Icons.undo_rounded,
                                    size: 16,
                                    color: Colors.grey.shade400,
                                  ),
                                ),
                              ],
                            ),
                          );
                        },
                      ),
          ),
          const SizedBox(height: 16),
        ],
      ),
    );
  }

  Widget _actionButton(String label, IconData icon, Color bg, Color fg,
      VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: fg.withValues(alpha: 0.3)),
        ),
        child: Column(
          children: [
            Icon(icon, color: fg, size: 20),
            const SizedBox(height: 4),
            Text(label,
                style: TextStyle(
                    fontSize: 12, fontWeight: FontWeight.w600, color: fg)),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 2: Tambah method `getKasbonRiwayat` dan `kasbonAction` di FinanceService**

Di `flutter/lib/services/finance_service.dart`:

```dart
Future<Map<String, dynamic>> getKasbonRiwayat(String actorId) async {
  final json = await _api.get('/api/penggajian/pinjaman',
      queryParams: {'actor_id': actorId});
  return json as Map<String, dynamic>;
}

Future<Map<String, dynamic>> kasbonAction(Map<String, dynamic> body) async {
  final json = await _api.post('/api/penggajian/pinjaman', body: body);
  return json as Map<String, dynamic>;
}
```

- [ ] **Step 3: Ganti placeholder tab Kasbon di finance_page.dart**

Di `finance_page.dart`, ganti `const Center(child: Text('Kasbon'))` dengan:

```dart
// Di bagian TabBarView children, tab index 1:
_buildKasbonTab(),
```

Tambahkan method:

```dart
Widget _buildKasbonTab() {
  final kasbon = _ringkasanKasbon;
  if (_isLoading) {
    return const Center(child: CircularProgressIndicator());
  }

  if (kasbon == null || kasbon.karyawan.isEmpty) {
    return EmptyState(
      icon: Icons.people_outline_rounded,
      title: 'Belum ada data kasbon',
    );
  }

  final filtered = _search.isEmpty
      ? kasbon.karyawan
      : kasbon.karyawan
          .where((k) =>
              k.nama.toLowerCase().contains(_search.toLowerCase()))
          .toList();

  return Column(
    children: [
      // Stat chips
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        child: Wrap(
          spacing: 6,
          children: [
            _buildStatChip(
              'Total Kasbon: ${_formatShort(kasbon.totalKasbon)}',
              Colors.amber.shade600,
            ),
            _buildStatChip(
              '${kasbon.jumlahKaryawan} Karyawan',
              Colors.red.shade400,
            ),
          ],
        ),
      ),
      // Search
      Padding(
        padding: const EdgeInsets.fromLTRB(12, 0, 12, 4),
        child: TextField(
          decoration: InputDecoration(
            hintText: 'Cari karyawan...',
            prefixIcon: const Icon(Icons.search, size: 20),
            isDense: true,
            filled: true,
            fillColor: Theme.of(context)
                .colorScheme
                .surfaceContainerHighest
                .withValues(alpha: 0.3),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(22),
              borderSide: BorderSide.none,
            ),
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          ),
          onChanged: (v) => setState(() => _search = v),
        ),
      ),
      // List
      Expanded(
        child: filtered.isEmpty
            ? EmptyState(
                icon: Icons.search_off_rounded,
                title: 'Tidak ditemukan',
                subtitle: 'Coba kata kunci lain',
              )
            : RefreshIndicator(
                onRefresh: () => _loadData(forceRefresh: true),
                child: ListView.builder(
                  padding: const EdgeInsets.fromLTRB(12, 4, 12, 80),
                  itemCount: filtered.length,
                  itemBuilder: (_, i) => _buildKasbonCard(filtered[i]),
                ),
              ),
      ),
    ],
  );
}

Widget _buildStatChip(String label, Color color) {
  return Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
    decoration: BoxDecoration(
      color: color.withValues(alpha: 0.1),
      borderRadius: BorderRadius.circular(10),
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
          label,
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w500,
            color: color,
          ),
        ),
      ],
    ),
  );
}

Widget _buildKasbonCard(KaryawanKasbon k) {
  final initials = k.nama.isNotEmpty
      ? k.nama
          .split(' ')
          .take(2)
          .map((s) => s.isNotEmpty ? s[0].toUpperCase() : '')
          .join()
      : '?';
  final lunas = k.saldoPinjaman <= 0;

  return Card(
    margin: const EdgeInsets.only(bottom: 6),
    child: InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: () async {
        await showModalBottomSheet(
          context: context,
          isScrollControlled: true,
          useSafeArea: true,
          backgroundColor: Colors.transparent,
          builder: (_) => DetailKasbonSheet(
            karyawan: k,
            onSuccess: () => _loadData(forceRefresh: true),
          ),
        );
      },
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            // Avatar
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(14),
                gradient: LinearGradient(
                  colors: lunas
                      ? [Colors.green.shade400, Colors.green.shade600]
                      : [const Color(0xFFF59E0B), const Color(0xFFD97706)],
                ),
              ),
              alignment: Alignment.center,
              child: Text(
                initials,
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                  fontSize: 15,
                ),
              ),
            ),
            const SizedBox(width: 10),
            // Nama + role
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    k.nama,
                    style: const TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 13,
                    ),
                  ),
                  Text(
                    k.roleLabel,
                    style: TextStyle(
                      fontSize: 11,
                      color: Colors.grey.shade500,
                    ),
                  ),
                ],
              ),
            ),
            // Saldo
            Text(
              lunas ? 'Lunas' : '-${_formatShort(k.saldoPinjaman)}',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: lunas ? Colors.green.shade600 : Colors.red.shade600,
              ),
            ),
            const SizedBox(width: 4),
            Icon(Icons.chevron_right, color: Colors.grey.shade400, size: 20),
          ],
        ),
      ),
    ),
  );
}
```

Tambahkan import `detail_kasbon_sheet.dart` di finance_page.dart.

- [ ] **Step 4: Commit**

```bash
git add flutter/lib/features/finance/detail_kasbon_sheet.dart flutter/lib/features/finance/finance_page.dart flutter/lib/services/finance_service.dart
git commit -m "feat(flutter): tab Kasbon + detail sheet + service methods"
```

---

### Task 11: Perbaikan halaman existing — hapus tombol empty state + unifikasi FAB

**Files:**
- Modify: `flutter/lib/features/customers/customers_page.dart`
- Modify: `flutter/lib/features/vendors/vendors_page.dart`
- Modify: `flutter/lib/features/materials/materials_page.dart`
- Modify: `flutter/lib/features/purchases/purchases_page.dart`

- [ ] **Step 1: Customers — hapus action dari EmptyState, FAB warna brand**

Di `customers_page.dart`, cari `EmptyState` dengan action `ElevatedButton.icon`:

```dart
// Cari:
EmptyState(
  icon: Icons.groups_rounded,
  title: 'Belum ada pelanggan',
  action: ElevatedButton.icon(
    onPressed: () => _showForm(),
    icon: const Icon(Icons.add, size: 18),
    label: const Text('Tambah Pelanggan'),
  ),
),

// Ganti menjadi:
EmptyState(
  icon: Icons.groups_rounded,
  title: 'Belum ada pelanggan',
),
```

Untuk FAB, tambah `backgroundColor`:

```dart
// Cari:
FloatingActionButton(
  onPressed: () => _showForm(),
  child: const Icon(Icons.add_rounded),
),

// Ganti menjadi:
FloatingActionButton(
  backgroundColor: const Color(0xFF00AFEF),
  onPressed: () => _showForm(),
  child: const Icon(Icons.add_rounded),
),
```

- [ ] **Step 2: Vendors — hapus action EmptyState, FAB warna brand**

Di `vendors_page.dart`:

```dart
// EmptyState action: hapus ElevatedButton.icon("Tambah Vendor")
// FAB: tambah/ganti backgroundColor: const Color(0xFF00AFEF)
```

- [ ] **Step 3: Materials — hapus action EmptyState, FAB warna brand**

Di `materials_page.dart`:

```dart
// EmptyState action: hapus ElevatedButton.icon("Tambah Barang")
// FAB: tambah/ganti backgroundColor: const Color(0xFF00AFEF)
```

- [ ] **Step 4: Purchases — hapus action EmptyState, FAB teks "+", warna brand**

Di `purchases_page.dart`:

```dart
// EmptyState action: hapus ElevatedButton.icon("Tambah Pembelian")

// FAB: ubah dari FloatingActionButton.extended menjadi FloatingActionButton
// Cari:
FloatingActionButton.extended(
  icon: Icon(Icons.add_rounded),
  label: Text('Beli'),
  onPressed: ...,
),

// Ganti menjadi:
FloatingActionButton(
  backgroundColor: const Color(0xFF00AFEF),
  onPressed: ...,
  child: const Icon(Icons.add_rounded),
),
```

- [ ] **Step 5: Commit**

```bash
git add flutter/lib/features/customers/customers_page.dart flutter/lib/features/vendors/vendors_page.dart flutter/lib/features/materials/materials_page.dart flutter/lib/features/purchases/purchases_page.dart
git commit -m "fix(flutter): hapus tombol empty state, unifikasi FAB ke #00AFEF, FAB Pembelian jadi +"
```

---

### Task 12: Verifikasi akhir

- [ ] **Step 1: API type-check + build**

```bash
cd /home/gemi/Projects/gemiprintaio && npm run type-check && npm run build
```

Expected: 0 errors.

- [ ] **Step 2: Jest test**

```bash
npx jest --no-coverage
```

Pastikan tidak ada regresi.

- [ ] **Step 3: Flutter analyze**

```bash
cd flutter && flutter analyze
```

Expected: No issues found.

- [ ] **Step 4: Commit final**

```bash
git add -A
git commit -m "chore: verifikasi akhir — type-check, build, test, analyze"
```
