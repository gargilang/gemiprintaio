# Redesain Dashboard Beranda Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mendesain ulang tata letak `src/app/beranda/page.tsx` mengikuti pola "SMART POS" (stat card gradien, analitik + donut, baris daftar bawah) dengan warna brand gemiprint dominan, light/dark penuh, plus baris quick action role-aware ke halaman nyata.

**Architecture:** Perubahan UI-only pada satu halaman. Tidak ada perubahan data/skema/API. Komponen presentasi baru (`DashboardHeader`, `QuickActions`, `RevenueDonut`) dan revisi `StatCard` hidup di file `page.tsx` yang sama (mengikuti pola file ini sekarang). Satu helper murni (`hitungPersenDonut`) diekstrak agar bisa diuji unit. Donut memakai ulang `dailySalesTrend` yang sudah dihitung — tanpa fetch baru.

**Tech Stack:** Next.js (App Router, client component), React, recharts (sudah dependensi), Tailwind (dengan `dark:` pair), Jest + ts-jest (project `node` untuk helper murni), ikon SVG dari `@/components/icons/PageIcons`, `canAccessPath` dari `@/components/menuConfig`.

---

## Referensi spec

`docs/superpowers/specs/2026-06-16-redesain-dashboard-beranda-design.md`

## Struktur file

- **Modify:** `src/app/beranda/page.tsx`
  - Tambah import: `CartIcon`, `PurchaseOrderIcon`, `MoneyIcon`, `UsersIcon` dari `@/components/icons/PageIcons`; `canAccessPath` dari `@/components/menuConfig`; `PieChart`/`Pie`/`Cell` (atau `RadialBarChart`) dari `recharts`.
  - Tambah helper murni `hitungPersenDonut(hariIni, kemarin)`.
  - Tambah komponen: `DashboardHeader`, `QuickActions`, `RevenueDonut`.
  - Revisi: `StatCard` (varian gradien), urutan render di `DashboardPage`.
- **Create (test):** `src/lib/__tests__/dashboard-donut.test.ts` — uji unit `hitungPersenDonut`.
  - Karena `hitungPersenDonut` perlu diimpor oleh test (project jest `node`) tanpa menyeret komponen React, helper diletakkan di modul kecil terpisah: **Create:** `src/lib/dashboard-donut.ts` lalu di-import oleh `page.tsx`.

> Catatan tipe yang dipakai lintas task (jaga konsisten):
> - `hitungPersenDonut(hariIni: number, kemarin: number): number` — kembalikan bilangan bulat 0..100+ (boleh >100 jika hari ini > kemarin), aman dari pembagian nol.
> - `StatCard` prop final: `{ title: string; value: string; subtitle?: string; icon: StatIconName; gradient: string }` di mana `StatIconName = "receipt" | "trending" | "wallet" | "warning"` (subset yang dipakai 4 kartu utama).
> - `QuickAction` shape: `{ label: string; href: string; Icon: (p: { size?: number; className?: string }) => React.ReactNode; gradient: string }`.

---

### Task 1: Helper murni `hitungPersenDonut` (TDD)

**Files:**
- Create: `src/lib/dashboard-donut.ts`
- Test: `src/lib/__tests__/dashboard-donut.test.ts`

- [ ] **Step 1: Tulis test yang gagal**

Buat `src/lib/__tests__/dashboard-donut.test.ts`:

```ts
import { hitungPersenDonut } from "@/lib/dashboard-donut";

describe("hitungPersenDonut", () => {
  it("mengembalikan persentase hari ini terhadap kemarin (dibulatkan)", () => {
    expect(hitungPersenDonut(75, 100)).toBe(75);
    expect(hitungPersenDonut(150, 100)).toBe(150);
    expect(hitungPersenDonut(33, 99)).toBe(33);
  });

  it("aman dari pembagian nol: kemarin 0 dan hari ini > 0 => 100", () => {
    expect(hitungPersenDonut(5000, 0)).toBe(100);
  });

  it("kemarin 0 dan hari ini 0 => 0", () => {
    expect(hitungPersenDonut(0, 0)).toBe(0);
  });

  it("nilai negatif/NaN diperlakukan sebagai 0", () => {
    expect(hitungPersenDonut(Number.NaN, 100)).toBe(0);
    expect(hitungPersenDonut(-50, 100)).toBe(0);
  });
});
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `npx jest src/lib/__tests__/dashboard-donut.test.ts`
Expected: FAIL — `Cannot find module '@/lib/dashboard-donut'`.

- [ ] **Step 3: Implementasi minimal**

Buat `src/lib/dashboard-donut.ts`:

```ts
/**
 * Hitung persentase omzet hari ini terhadap kemarin untuk donut beranda.
 * Aman dari pembagian nol dan input tidak valid.
 *
 * @param hariIni omzet hari ini
 * @param kemarin omzet kemarin
 * @returns bilangan bulat persen (0..100+). Bila kemarin 0: 100 jika hari ini > 0, selain itu 0.
 */
export function hitungPersenDonut(hariIni: number, kemarin: number): number {
  const a = Number.isFinite(hariIni) && hariIni > 0 ? hariIni : 0;
  const b = Number.isFinite(kemarin) && kemarin > 0 ? kemarin : 0;
  if (b === 0) return a > 0 ? 100 : 0;
  return Math.round((a / b) * 100);
}
```

- [ ] **Step 4: Jalankan test untuk memastikan lulus**

Run: `npx jest src/lib/__tests__/dashboard-donut.test.ts`
Expected: PASS (4 test hijau).

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboard-donut.ts src/lib/__tests__/dashboard-donut.test.ts
git commit -m "feat(beranda): helper hitungPersenDonut untuk donut omzet"
```

---

### Task 2: Header strip ramping (`DashboardHeader`)

**Files:**
- Modify: `src/app/beranda/page.tsx`

- [ ] **Step 1: Tambah komponen `DashboardHeader`**

Tambahkan komponen ini di `page.tsx` (di bawah `StatusBadge`, sebelum `DashboardPage`). Menggantikan welcome card tinggi yang sekarang ada di dalam `DashboardPage` (lihat Step 2). `Image` sudah diimpor di file.

```tsx
function DashboardHeader({ user }: { user: User | null }) {
  return (
    <div className="bg-gradient-to-r from-[#00afef] to-[#2266ff] rounded-2xl shadow-lg px-6 py-4 text-white flex items-center justify-between">
      <div className="min-w-0">
        <h2 className="text-xl sm:text-2xl font-bold font-twcenmt truncate">
          Selamat Datang, {user?.nama_lengkap || user?.nama_pengguna || "Pengguna"}!
        </h2>
        <p className="text-white/90 text-sm">
          <span className="font-bauhaus italic">
            <span className="text-white">gemi</span>
            <span className="text-white/80">print</span>
          </span>{" "}
          — Sistem Manajemen Percetakan
        </p>
      </div>
      <div className="hidden md:block shrink-0">
        <Image
          src="/assets/images/logo-gemiprint-white.svg"
          alt="gemiprint"
          width={56}
          height={56}
          className="opacity-40"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Ganti welcome card lama dengan `<DashboardHeader />`**

Di `DashboardPage`, ganti seluruh blok welcome card (`{/* Welcome Card */}` sampai penutup `</div>` blok itu — saat ini kira-kira baris 113-138) dengan:

```tsx
      {/* Header strip */}
      <DashboardHeader user={user} />
```

- [ ] **Step 3: Verifikasi build & tipe**

Run: `npm run type-check`
Expected: 0 error.

- [ ] **Step 4: Commit**

```bash
git add src/app/beranda/page.tsx
git commit -m "feat(beranda): header strip ramping gantikan welcome card"
```

---

### Task 3: Quick Actions role-aware (`QuickActions`)

**Files:**
- Modify: `src/app/beranda/page.tsx`

- [ ] **Step 1: Tambah import ikon & guard akses**

Di blok import atas `page.tsx`, tambahkan:

```tsx
import {
  CartIcon,
  PurchaseOrderIcon,
  MoneyIcon,
  UsersIcon,
} from "@/components/icons/PageIcons";
import { canAccessPath } from "@/components/menuConfig";
```

- [ ] **Step 2: Tambah komponen `QuickActions`**

Tambahkan di `page.tsx` (dekat `DashboardHeader`):

```tsx
function QuickActions({ user }: { user: User | null }) {
  const actions: Array<{
    label: string;
    href: string;
    Icon: (p: { size?: number; className?: string }) => React.ReactNode;
    gradient: string;
  }> = [
    { label: "Kasir", href: "/pos", Icon: CartIcon, gradient: "from-[#00afef] to-[#2266ff]" },
    { label: "Pembelian", href: "/pembelian", Icon: PurchaseOrderIcon, gradient: "from-[#6366f1] to-[#8b5cf6]" },
    { label: "Keuangan", href: "/keuangan", Icon: MoneyIcon, gradient: "from-[#ff2f91] to-orange-500" },
    { label: "Pelanggan", href: "/pelanggan", Icon: UsersIcon, gradient: "from-[#14b8a6] to-[#06b6d4]" },
  ];

  const visible = actions.filter((a) => canAccessPath(user?.role, a.href));
  if (visible.length === 0) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {visible.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          className="flex items-center gap-3 bg-white dark:bg-slate-900/40 backdrop-blur-sm border border-white/30 dark:border-slate-700 rounded-2xl shadow p-4 hover:shadow-md hover:-translate-y-0.5 transition-all"
        >
          <span className={`bg-gradient-to-br ${a.gradient} p-2.5 rounded-xl text-white shrink-0`}>
            <a.Icon size={20} className="text-white" />
          </span>
          <span className="font-semibold text-gray-800 dark:text-slate-100 font-twcenmt">
            {a.label}
          </span>
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Render `<QuickActions />` di bawah header**

Di `DashboardPage`, tepat setelah `<DashboardHeader user={user} />`, tambahkan:

```tsx
      {/* Quick Actions */}
      <QuickActions user={user} />
```

- [ ] **Step 4: Verifikasi tipe**

Run: `npm run type-check`
Expected: 0 error.

- [ ] **Step 5: Commit**

```bash
git add src/app/beranda/page.tsx
git commit -m "feat(beranda): baris quick action role-aware ke halaman nyata"
```

---

### Task 4: Stat card gradien (revisi `StatCard`)

**Files:**
- Modify: `src/app/beranda/page.tsx`

- [ ] **Step 1: Ganti implementasi `StatCard` jadi varian gradien**

Ganti seluruh fungsi `StatCard` (saat ini ~L659-720) dengan versi gradien berikut. `iconMap` hanya menyimpan subset ikon yang dipakai 4 kartu utama.

```tsx
type StatIconName = "receipt" | "trending" | "wallet" | "warning";

function StatCard({
  title,
  value,
  subtitle,
  icon,
  gradient,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: StatIconName;
  gradient: string;
}) {
  const iconMap: Record<StatIconName, string> = {
    receipt:
      "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
    trending: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6",
    wallet:
      "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z",
    warning:
      "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
  };

  return (
    <div className={`bg-gradient-to-br ${gradient} rounded-2xl shadow-lg p-5 text-white`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-white/80 font-twcenmt">{title}</p>
          <p className="text-2xl font-bold font-twcenmt truncate">{value}</p>
          {subtitle && <p className="text-xs text-white/70 mt-0.5">{subtitle}</p>}
        </div>
        <span className="bg-white/20 rounded-lg p-2 shrink-0">
          <svg
            className="w-6 h-6 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={1.8}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d={iconMap[icon]} />
          </svg>
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Ganti baris stat "Hari Ini" memakai 4 kartu final dengan gradien brand**

Di `DashboardPage`, ganti blok `{/* Stats row: today */}` (judul "Hari Ini" + grid 4 `StatCard`, saat ini ~L147-180) dengan:

```tsx
          {/* Stat cards utama */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Omzet Hari Ini"
              value={fmtCurrency(stats.todayRevenue)}
              icon="trending"
              gradient="from-[#00afef] to-[#2266ff]"
            />
            <StatCard
              title="Transaksi Hari Ini"
              value={String(stats.todaySalesCount)}
              subtitle="penjualan"
              icon="receipt"
              gradient="from-emerald-500 to-teal-600"
            />
            <StatCard
              title="Saldo Kas"
              value={fmtCurrency(stats.saldo)}
              icon="wallet"
              gradient="from-amber-500 to-orange-500"
            />
            <StatCard
              title="Piutang Aktif"
              value={fmtCurrency(stats.totalPiutang)}
              subtitle={`${stats.activePiutang} transaksi`}
              icon="warning"
              gradient="from-[#ff2f91] to-[#0a1b3d]"
            />
          </div>
```

- [ ] **Step 3: Hapus blok stat "Produksi" lama**

Hapus seluruh blok `{/* Stats Row: Produksi */}` (judul "Produksi" + grid berisi Antrian Aktif / Kilat / Saldo Kas / `<div />`, saat ini ~L210-238). Metrik Antrian Aktif & Kilat akan muncul kembali di header "Produksi Aktif" (Task 6). Saldo Kas kini ada di kartu utama.

- [ ] **Step 4: Verifikasi tipe**

Run: `npm run type-check`
Expected: 0 error. (Pastikan tidak ada pemakaian `StatCard` lama dengan prop `color=` yang tersisa — jika ada, perbaiki ke `gradient=` sesuai Step 2.)

- [ ] **Step 5: Commit**

```bash
git add src/app/beranda/page.tsx
git commit -m "feat(beranda): stat card gradien brand gemiprint"
```

---

### Task 5: Sales Analytics + Revenue Donut (baris 2 kolom)

**Files:**
- Modify: `src/app/beranda/page.tsx`

- [ ] **Step 1: Tambah import recharts pie & helper donut**

Pada blok import recharts yang sudah ada, tambahkan `PieChart`, `Pie`, `Cell`. Lalu import helper:

```tsx
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { hitungPersenDonut } from "@/lib/dashboard-donut";
```

- [ ] **Step 2: Tambah komponen `RevenueDonut`**

Tambahkan di `page.tsx` (dekat `SalesTrendChart`). `fmtCurrency` sudah ada di file.

```tsx
function RevenueDonut({ trend }: { trend: DailySalesTrend[] }) {
  const n = trend.length;
  const hariIni = n > 0 ? trend[n - 1].omzet : 0;
  const kemarin = n > 1 ? trend[n - 2].omzet : 0;
  const persen = hitungPersenDonut(hariIni, kemarin);
  const terisi = Math.min(persen, 100);
  const data = [
    { name: "terisi", value: terisi },
    { name: "sisa", value: Math.max(100 - terisi, 0) },
  ];

  return (
    <div className="bg-white dark:bg-slate-900/40 backdrop-blur-sm border border-white/30 dark:border-slate-700 rounded-2xl shadow p-5 flex flex-col">
      <h3 className="font-bold text-gray-800 dark:text-slate-100 font-twcenmt mb-2">
        Omzet Hari Ini
      </h3>
      <div className="relative flex-1 min-h-[160px]">
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              innerRadius={55}
              outerRadius={75}
              startAngle={90}
              endAngle={-270}
              stroke="none"
            >
              <Cell fill="#00afef" />
              <Cell className="fill-gray-200 dark:fill-slate-700" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-bold text-[#00afef] font-twcenmt">{persen}%</span>
          <span className="text-xs text-gray-500 dark:text-slate-400">vs kemarin</span>
        </div>
      </div>
      <div className="mt-3 space-y-1 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-gray-500 dark:text-slate-400">Hari ini</span>
          <span className="font-semibold text-gray-800 dark:text-slate-100">
            {fmtCurrency(hariIni)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-500 dark:text-slate-400">Kemarin</span>
          <span className="font-semibold text-gray-800 dark:text-slate-100">
            {fmtCurrency(kemarin)}
          </span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Bungkus Tren Penjualan + Donut dalam grid 2 kolom**

Di `DashboardPage`, ganti blok `{/* Sales Trend Chart */}` (kartu Tren Penjualan, saat ini ~L182-208) sehingga kartu Tren Penjualan dan donut berada dalam satu grid. Bungkus seperti ini (kartu Tren Penjualan yang sudah ada masuk ke kolom kiri `lg:col-span-2`, tidak diubah isinya):

```tsx
          {/* Analitik + Donut */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Tren Penjualan (kiri, lebih lebar) */}
            <div className="lg:col-span-2 bg-white dark:bg-slate-900/40 backdrop-blur-sm border border-white/30 dark:border-slate-700 rounded-2xl shadow p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-800 dark:text-slate-100 font-twcenmt">
                  Tren Penjualan
                </h3>
                <div className="flex gap-1">
                  {([7, 14, 30] as const).map((d) => (
                    <button
                      key={d}
                      onClick={() => setTrendDays(d)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                        trendDays === d
                          ? "bg-[#00afef] text-white shadow"
                          : "bg-white dark:bg-slate-900/60 text-gray-500 dark:text-slate-400 hover:bg-white/80"
                      }`}
                    >
                      {d} hari
                    </button>
                  ))}
                </div>
              </div>
              <SalesTrendChart
                data={(stats.dailySalesTrend ?? []).slice(-trendDays)}
                days={trendDays}
              />
            </div>

            {/* Donut omzet (kanan) */}
            <RevenueDonut trend={stats.dailySalesTrend ?? []} />
          </div>
```

- [ ] **Step 4: Verifikasi tipe**

Run: `npm run type-check`
Expected: 0 error.

- [ ] **Step 5: Commit**

```bash
git add src/app/beranda/page.tsx
git commit -m "feat(beranda): blok analitik + donut omzet hari ini vs kemarin"
```

---

### Task 6: Ringkasan Antrian/Kilat di header Produksi Aktif

**Files:**
- Modify: `src/app/beranda/page.tsx`

- [ ] **Step 1: Tambah ringkasan di header "Produksi Aktif"**

Di blok "Produksi Aktif" (saat ini ~L287-298), ubah header agar menampilkan ringkasan Antrian & Kilat (memakai `stats.activeOrders` dan `stats.kilat` yang sudah ada). Ganti bagian header (`<div className="flex items-center justify-between mb-4">...</div>`) dengan:

```tsx
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-gray-800 dark:text-slate-100 font-twcenmt">
                    Produksi Aktif
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                    Antrian: {stats.activeOrders} · Kilat: {stats.kilat}
                  </p>
                </div>
                <Link
                  href="/produksi"
                  className="text-sm text-[#00afef] hover:underline font-semibold"
                >
                  Lihat Semua
                </Link>
              </div>
```

- [ ] **Step 2: Verifikasi tipe**

Run: `npm run type-check`
Expected: 0 error.

- [ ] **Step 3: Commit**

```bash
git add src/app/beranda/page.tsx
git commit -m "feat(beranda): ringkasan antrian & kilat di header produksi aktif"
```

---

### Task 7: Verifikasi akhir (type-check, lint, jest, build)

**Files:** tidak ada perubahan kode baru (hanya verifikasi & perbaikan bila perlu).

- [ ] **Step 1: Type-check**

Run: `npm run type-check`
Expected: 0 error. Jika ada error, perbaiki di `page.tsx` (penyebab paling umum: sisa pemakaian `StatCard` lama dengan prop `color=`/`icon` di luar `StatIconName`).

- [ ] **Step 2: Lint file yang disentuh**

Run: `npx eslint src/app/beranda/page.tsx src/lib/dashboard-donut.ts src/lib/__tests__/dashboard-donut.test.ts`
Expected: tidak ada error/warning baru. Perbaiki bila ada (mis. `react-hooks/exhaustive-deps`, variabel tak terpakai).

- [ ] **Step 3: Jalankan unit test helper**

Run: `npx jest src/lib/__tests__/dashboard-donut.test.ts`
Expected: PASS.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build sukses tanpa error.

- [ ] **Step 5: Verifikasi manual di browser (catat hasil)**

Run: `npm run dev:web` lalu buka `/beranda`. Periksa:
- Light & dark mode: tiap elemen punya pasangan `dark:` (tidak ada area putih menyilaukan / teks tak terbaca di dark).
- Mobile: quick action jadi grid 2x2; stat card menumpuk rapi.
- Semua tombol quick action membuka halaman benar (`/pos`, `/pembelian`, `/keuangan`, `/pelanggan`).
- Link "Lihat Semua" → `/pos` dan `/produksi`.
- Donut menampilkan persentase masuk akal; saat data 0, donut 0% tanpa error.
- Login sebagai role rendah (mis. `kasir`): tombol di luar akses tidak muncul (mis. Pembelian/Keuangan/Pelanggan sesuai `allowedRoles`).

- [ ] **Step 6: Commit akhir (bila ada perbaikan dari verifikasi)**

```bash
git add -A
git commit -m "chore(beranda): perbaikan hasil verifikasi redesain dashboard"
```

> Catatan commit: sesuai aturan proyek, commit hanya saat owner meminta. Jika eksekusi dijalankan dengan izin commit, gunakan pesan di atas; jika tidak, biarkan perubahan tanpa commit dan laporkan.

---

## Self-Review

**1. Spec coverage:**
- Header strip ramping → Task 2. ✅
- Quick actions role-aware (Kasir/Pembelian/Keuangan/Pelanggan) → Task 3. ✅
- Stat card gradien brand (Omzet/Transaksi/Saldo/Piutang) → Task 4. ✅
- Sales Analytics + Donut (today vs yesterday, aman bagi nol) → Task 1 (helper) + Task 5. ✅
- Penjualan Hari Ini + Produksi Aktif (data lama, link nyata) → tetap dari kode existing; header Produksi diberi ringkasan Antrian/Kilat → Task 6. ✅
- Reorder widget tidak berubah → tidak ada task (sesuai spec). ✅
- Footer tidak berubah → tidak ada task. ✅
- Cache key & actions.ts tidak berubah → tidak ada task menyentuhnya. ✅
- Verifikasi type-check/build/lint/jest + manual light/dark/mobile/role → Task 7. ✅
- Donut aman pembagian nol → Task 1 test eksplisit. ✅

**2. Placeholder scan:** Tidak ada "TBD/TODO"; semua step berisi kode lengkap dan perintah dengan expected output. ✅

**3. Type consistency:** `hitungPersenDonut(number, number): number` konsisten antara Task 1 dan pemakaian di Task 5. `StatCard` memakai `gradient` + `icon: StatIconName` secara konsisten antara definisi (Task 4 Step 1) dan pemakaian (Task 4 Step 2); blok stat lama yang masih pakai `color=` dihapus (Task 4 Step 3) dan dicek ulang (Task 4 Step 4 / Task 7 Step 1). `QuickAction.Icon` cocok dengan tanda tangan komponen ikon (`{ size?, className? }`). ✅
