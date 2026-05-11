# Security Hardening Plan — gemiprintaio

> **Konteks**: Web app sudah live di https://app.gemiprint.com (Vercel + Supabase + GoDaddy DNS). Audit security menemukan beberapa vulnerability critical/high yang harus ditangani sebelum aplikasi dipakai untuk data produksi sungguhan. Dokumen ini adalah TODO list terstruktur yang bisa di-hand off ke agent lain (atau dikerjakan bertahap).
>
> **Created**: 2026-05-11 oleh hasil security audit codebase + Vercel/Supabase config.
>
> **Aturan main untuk agent yang execute**:
> 1. Selalu baca dokumen ini lengkap dulu sebelum mulai
> 2. Kerjakan satu phase sampai selesai sebelum lanjut ke phase berikutnya
> 3. Test setiap perubahan: `npm run build` harus pass, smoke test login di local
> 4. Setiap selesai 1 phase: commit dengan message yang descriptive, push ke main → Vercel auto-deploy
> 5. Setelah deploy ke production, smoke test di https://app.gemiprint.com
> 6. Pilihan teknis sudah ditetapkan: **custom auth** (bukan Supabase Auth), self-registration dengan `admin_approval`, Cloudflare nanti

---

## Status implementasi (diperbarui 2026-05-11)

Ringkasan: patch keamanan utama **sudah di-merge ke `main`**, autodeploy Vercel sukses, dan **smoke test** https://app.gemiprint.com oleh pemilik **tanpa error**.

| Item | Status | Catatan singkat |
|------|--------|-------------------|
| 1.1 Queue offline lewat API | ✅ Selesai | Browser tidak lagi menulis langsung ke PostgREST dengan anon key. |
| 1.2 Rotasi key Supabase (anon + service_role) | ⏳ **Tindakan Anda** | **Masih disarankan**: key lama pernah diekspos di klien; reset di Supabase Dashboard lalu update env Vercel. |
| 1.3 RLS (tanpa policy = deny anon) | ✅ Selesai | Migrasi `20260511120000_enable_rls_service_role_only.sql` + sudah `db push`. |
| 1.4 bcrypt + cookie HttpOnly (JWT) | ✅ Selesai | Termasuk migrasi lazy SHA-256 → bcrypt saat login. |
| 1.5 Middleware + `x-session-uid` | ✅ Selesai | `src/middleware.ts`. |
| 1.6 `PASSWORD_ENC_SECRET` | ⚠️ Sebagian | **Production Vercel**: sudah. **Preview Vercel**: belum otomatis (keterbatasan CLI); isi manual jika pakai preview deployment. **Lokal**: `.env.local`. |
| 2.1 Security headers / CSP | ✅ Selesai | `next.config.ts`. |
| 2.2 Rate limiting Upstash | ⚠️ Siap kode | Paket terpasang; **aktif** hanya bila env `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` di-set. |
| 2.3 Persetujuan admin registrasi | ✅ Selesai | `POST /api/auth/register` + `aktif_status: 0`; admin mengaktifkan lewat `/users`. |
| 2.4 Sanitasi error API | ⚠️ Sebagian | Banyak route memakai `apiError`; **sisanya** bisa dibersihkan bertahap tanpa mengubah perilaku bisnis. |
| 3.1 Tabel `audit_log` + helper | ⚠️ Dasar jadi | Dipakai di beberapa operasi (mis. hapus penjualan, hapus semua cashbook); **bisa diperluas** ke endpoint lain. |
| 3.2 Cloudflare / WAF | ⏳ Tunda | Sesuai keputusan dokumen asli. |
| 4.1 npm audit / Dependabot | ⚠️ Rutin / manual | Jalankan `npm audit` sesekali; **Dependabot**: aktifkan di GitHub → Settings → Code security. |
| 4.2 Dokumen rotasi rahasia | ✅ Selesai | `docs/SECRET_ROTATION.md`. |
| 4.3 Monitoring (Sentry, dll.) | ⏳ Belum | Opsional. |

### Checklist uji (setelah deploy) — dicentang pemilik

- [x] Build & deploy Vercel sukses; tidak ada error di dashboard Vercel  
- [x] Smoke test: buka halaman aplikasi production  
- [ ] _(disarankan)_ Verifikasi setelah **rotasi key Supabase** (1.2) — lakukan ketika Anda sudah reset key  
- [ ] _(opsional)_ Pasang Upstash + env agar rate limit aktif  
- [ ] _(opsional)_ Pasang `SESSION_SECRET` / `PASSWORD_ENC_SECRET` untuk **Preview** di Vercel  

### Langkah berikutnya yang paling penting

1. **Rotasi Supabase API keys** (anon + `service_role`) dan update di Vercel — ini satu-satunya poin **critical** di rencana yang masih bergantung pada tindakan manual di dashboard.  
2. Sisanya pada tabel di atas: **opsional** atau **perawatan berkala** (audit error route sisa, perluas audit log, Dependabot, Sentry).

---

## TL;DR — Severity & Order

| Order | Phase | Severity | Why critical |
|---|---|---|---|
| 1 | Disable direct browser→Supabase writes | 🔴 CRITICAL | Anon key public + RLS off = anyone can write/delete any table |
| 2 | Rotate Supabase anon key & service role key | 🔴 CRITICAL | Keys lama sudah leaked via deployment |
| 3 | Enable RLS + policy `service_role only` | 🔴 CRITICAL | Last line of defense kalau ada bug di app |
| 4 | Custom auth: bcrypt + HTTP-only signed cookie | 🔴 CRITICAL | SHA-256 plain + localStorage rentan kompromise total |
| 5 | Next.js `middleware.ts` untuk auth check | 🔴 CRITICAL | Semua API publik tanpa middleware |
| 6 | Set `PASSWORD_ENC_SECRET` di Vercel | 🟠 HIGH | Encrypted credentials pakai fallback dev key |
| 7 | Security headers (CSP, X-Frame, dll) | 🟠 HIGH | Defense in depth |
| 8 | Rate limiting (login, sync, register) | 🟡 MEDIUM | Brute force protection |
| 9 | Admin approval untuk self-registration | 🟡 MEDIUM | User decision: aktif_status=0 by default |
| 10 | Sanitize error responses | 🟡 MEDIUM | Tidak leak detail ke client |
| 11 | Audit log untuk operasi sensitif | 🟢 LOW | Forensic capability |
| 12 | Cloudflare proxy (WAF + rate limit gratis) | 🟢 LOW | Akan dikerjakan terpisah, nanti |

---

## Phase 1: Lock Down Data (CRITICAL — kerjakan minggu ini)

### 1.1 — Disable direct browser→Supabase writes

**File**: `src/lib/sync-client.ts:77-176` (function `syncWebOfflineQueue`)

**Problem**: Function ini fetch langsung ke `${supabaseUrl}/rest/v1/${table}` dari browser pakai anon key untuk INSERT/UPDATE/DELETE. Ini bypass total semua API route protection.

**Action**:
- Buat new API route `/api/sync/offline-queue/route.ts` yang menerima offline queue dari browser, validate, lalu eksekusi server-side pakai service role key
- Ubah `syncWebOfflineQueue` di `sync-client.ts` untuk POST ke `/api/sync/offline-queue` (bukan langsung ke PostgREST)
- Hapus semua reference ke `NEXT_PUBLIC_SUPABASE_ANON_KEY` di file `src/lib/sync-client.ts`

**Acceptance**:
- Browser DevTools → Network → tidak ada lagi request ke `*.supabase.co/rest/v1/*` dari browser (kecuali via api/sync)
- Fungsi offline queue tetap jalan

**Files affected**:
- `src/lib/sync-client.ts` (modify)
- `src/app/api/sync/offline-queue/route.ts` (new)

---

### 1.2 — Rotate Supabase keys (anon + service role)

**Problem**: Anon key sudah ter-publish di Vercel build output, dan diasumsikan sudah compromised karena `sync-client.ts` mengekspos via fetch publik selama ~1 jam.

**Action** (via Supabase Dashboard):
1. Login ke https://supabase.com/dashboard
2. Project Settings → API → "Reset" untuk `anon` key dan `service_role` key
3. Update Vercel environment variables (Production + Preview):
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = key baru
   - `SUPABASE_SERVICE_ROLE_KEY` = key baru
4. Redeploy: `git commit --allow-empty -m "chore: rotate supabase keys" && git push`

**Acceptance**:
- `vercel env ls` menampilkan timestamp "just now" untuk kedua key tersebut
- Production deploy baru sukses
- Login & basic operations masih work di https://app.gemiprint.com

**Note**: Lakukan langkah 1.1 dulu sebelum rotate, supaya tidak break offline queue saat key lama mati.

---

### 1.3 — Enable RLS + `service_role only` policy

**File**: `supabase/migrations/<timestamp>_enable_rls_service_role_only.sql` (new)

**Problem**: 23+ tabel tidak punya RLS. Anon key bisa SELECT/INSERT/UPDATE/DELETE semua.

**Strategy**: Karena seluruh business logic di app sudah lewat API routes yang pakai `SUPABASE_SERVICE_ROLE_KEY` (service role bypass RLS by default), pendekatan paling simple & aman adalah:
- **Enable RLS pada semua tabel**
- **Tidak buat policy apapun** → default deny untuk `anon` role
- Service role tetap bypass karena Postgres role-nya berbeda

**Tables to enable RLS** (cek di `supabase/migrations/20260425120000_initial_schema.sql`):
```
kategori_barang, subkategori_barang, satuan_barang, spesifikasi_cepat_barang,
barang, harga_barang_satuan, opsi_finishing, pelanggan, vendor, profil,
kredensial, penjualan, item_penjualan, pembelian, item_pembelian,
piutang_penjualan, pelunasan_piutang, hutang_pembelian, pelunasan_hutang,
order_produksi, item_produksi, item_finishing, keuangan
```

Plus tables dari migrasi lain:
- Cek `supabase/migrations/20260509150000_accounting_rebuild.sql`, `20260509090500_finance_flexible_architecture.sql`, dan `20260509164500_roles_staff_kasir_operator.sql` untuk tabel tambahan.

**Migration SQL template**:
```sql
-- Enable RLS on all business tables
ALTER TABLE public.kategori_barang ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subkategori_barang ENABLE ROW LEVEL SECURITY;
-- ... ulang untuk SEMUA tabel
-- (TIDAK buat policy → default deny untuk anon)
```

**Action**:
1. Tulis migration file lengkap
2. Apply ke Supabase: `npm run supabase:db:push` (atau via CLI / Dashboard SQL Editor)
3. Test: dengan anon key + curl, coba SELECT dari salah satu tabel → harus 401/403/empty

**Acceptance**:
- Query via anon key returns 0 rows atau error permission
- Query via service role key (lewat API route) tetap work
- Login & operasi normal di app tidak terganggu

**Risk**: Kalau ada API route yang accidentally pakai anon key (bukan service role), akan error. **Test semua API route penting**:
- `/api/auth/login`
- `/api/pos/sales`
- `/api/finance/cash-book`
- `/api/customers`
- `/api/sync`

---

### 1.4 — Custom auth: bcrypt + HTTP-only signed cookie

**Files**:
- `src/lib/services/auth-service.ts` (modify)
- `src/lib/session.ts` (new)
- `src/app/api/auth/login/route.ts` (modify)
- `src/app/api/auth/logout/route.ts` (new)
- `src/app/auth/login/page.tsx` (modify — remove localStorage)

**Problem**: SHA-256 hash + localStorage session. Catastrophic kalau ada XSS atau database leak.

**Action**:

1. **Install bcrypt**:
   ```bash
   npm install bcryptjs
   npm install -D @types/bcryptjs
   ```

2. **Ganti `simpleHash` di `auth-service.ts`**:
   ```ts
   import bcrypt from "bcryptjs";
   
   async function hashPassword(plain: string): Promise<string> {
     return bcrypt.hash(plain, 12);
   }
   
   async function verifyPassword(plain: string, hash: string): Promise<boolean> {
     // Backward compat: kalau hash masih SHA-256 (64 hex chars), verify SHA-256 lalu re-hash to bcrypt
     if (/^[0-9a-f]{64}$/.test(hash)) {
       const sha = crypto.createHash("sha256").update(plain).digest("hex");
       return sha === hash;
     }
     return bcrypt.compare(plain, hash);
   }
   ```

3. **Lazy migration**: Saat user login dengan password SHA-256 yang valid, re-hash dengan bcrypt dan update di DB. Setelah beberapa minggu, semua user aktif sudah migrasi otomatis.

4. **HTTP-only signed cookie** (`src/lib/session.ts`):
   ```ts
   import { cookies } from "next/headers";
   import { SignJWT, jwtVerify } from "jose";
   
   const SESSION_COOKIE = "gp_session";
   const SECRET = new TextEncoder().encode(process.env.SESSION_SECRET!);
   
   export async function createSession(userId: string, role: string) {
     const jwt = await new SignJWT({ uid: userId, role })
       .setProtectedHeader({ alg: "HS256" })
       .setIssuedAt()
       .setExpirationTime("7d")
       .sign(SECRET);
     
     const cookieStore = await cookies();
     cookieStore.set(SESSION_COOKIE, jwt, {
       httpOnly: true,
       secure: true,
       sameSite: "lax",
       maxAge: 60 * 60 * 24 * 7,
       path: "/",
     });
   }
   
   export async function getSession() {
     const cookieStore = await cookies();
     const token = cookieStore.get(SESSION_COOKIE)?.value;
     if (!token) return null;
     try {
       const { payload } = await jwtVerify(token, SECRET);
       return payload as { uid: string; role: string };
     } catch {
       return null;
     }
   }
   
   export async function clearSession() {
     const cookieStore = await cookies();
     cookieStore.delete(SESSION_COOKIE);
   }
   ```

5. **Generate `SESSION_SECRET`** (32+ random bytes):
   ```bash
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   ```
   Set di Vercel env vars (Production + Preview): `SESSION_SECRET=<output>`

6. **Modify `/api/auth/login/route.ts`** untuk createSession on success:
   ```ts
   if (result.success && result.user) {
     await createSession(result.user.id, result.user.role);
     return NextResponse.json({ success: true, user: result.user });
   }
   ```

7. **Tambah `/api/auth/logout/route.ts`**:
   ```ts
   export async function POST() {
     await clearSession();
     return NextResponse.json({ success: true });
   }
   ```

8. **Hapus `localStorage.setItem("user", ...)` di `login/page.tsx`**, ganti dengan `router.push("/dashboard")` saja. Server akan baca user dari cookie.

**Acceptance**:
- Cookie `gp_session` muncul di DevTools (HttpOnly, Secure, SameSite=Lax)
- Login → cookie ter-set → reload halaman → masih login
- Logout → cookie hilang
- User table lama masih bisa login (lazy migration work)
- Setelah 1x login, password_hash di DB sudah bcrypt format ($2a$12$...)

---

### 1.5 — Next.js middleware untuk auth check

**File**: `src/middleware.ts` (new)

**Problem**: Tidak ada middleware. API routes & protected pages publik semua.

**Action**:
```ts
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(process.env.SESSION_SECRET!);

const PUBLIC_ROUTES = [
  "/auth/login",
  "/api/auth/login",
  "/api/auth/register", // jika ada
  "/_next",
  "/favicon.ico",
  "/assets",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Allow public routes
  if (PUBLIC_ROUTES.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  
  // Verify session cookie
  const token = request.cookies.get("gp_session")?.value;
  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }
  
  try {
    const { payload } = await jwtVerify(token, SECRET);
    
    // Inject user info ke request headers (server-side, tidak forgeable dari client)
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-session-uid", payload.uid as string);
    requestHeaders.set("x-session-role", payload.role as string);
    
    return NextResponse.next({ request: { headers: requestHeaders } });
  } catch {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Session invalid" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

**Action lanjutan**:
- Ganti **semua** `request.headers.get("x-user-id")` di API routes (`src/app/api/passwords/route.ts:12,26` dan tempat lain) jadi `request.headers.get("x-session-uid")`
- Untuk admin-only endpoints, check `x-session-role === "admin"`

**Acceptance**:
- Access `/dashboard` tanpa login → redirect ke `/auth/login`
- Access `/api/customers` tanpa cookie → 401
- Curl spoof `x-session-uid: random` → diabaikan middleware (overwritten dengan nilai dari JWT)

---

### 1.6 — Set `PASSWORD_ENC_SECRET` di Vercel

**Problem**: `src/lib/crypto.ts:7` fallback ke `"dev-secret-please-change"`. Tabel `kredensial` di-encrypt dengan key dari secret tersebut.

**Action**:
1. Generate random secret: `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`
2. Set di Vercel env vars (Production + Preview): `PASSWORD_ENC_SECRET=<output>`
3. **WARNING**: Kalau sudah ada data di tabel `kredensial`, mereka di-encrypt pakai key lama. Harus migrate:
   - Tulis script Node yang baca semua row, decrypt pakai old secret, re-encrypt pakai new secret, update
   - Atau, kalau OK clear: `TRUNCATE TABLE kredensial`

**Acceptance**:
- `vercel env ls` menampilkan `PASSWORD_ENC_SECRET` di Production + Preview
- No more "Using fallback dev encryption key" warning di server logs

---

## Phase 2: Defense in Depth (HIGH — kerjakan minggu depan)

### 2.1 — Security headers di `next.config.ts`

**File**: `next.config.ts`

**Action**: Tambah `headers()` function:
```ts
async headers() {
  return [
    {
      source: "/(.*)",
      headers: [
        {
          key: "X-Frame-Options",
          value: "SAMEORIGIN",
        },
        {
          key: "X-Content-Type-Options",
          value: "nosniff",
        },
        {
          key: "Referrer-Policy",
          value: "strict-origin-when-cross-origin",
        },
        {
          key: "Permissions-Policy",
          value: "camera=(), microphone=(), geolocation=()",
        },
        {
          key: "Content-Security-Policy",
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next.js needs unsafe-inline; tighten later
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob: https:",
            "font-src 'self' data:",
            "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
            "frame-ancestors 'self'",
          ].join("; "),
        },
      ],
    },
  ];
},
```

**Acceptance**:
- `curl -I https://app.gemiprint.com` returns headers di atas
- Test dengan https://securityheaders.com → score minimal B+

---

### 2.2 — Rate limiting (login, register, sync)

**File**: `src/lib/rate-limit.ts` (new) + integrasi ke route

**Action**:
1. Install Upstash Redis (gratis 10k req/day):
   ```bash
   npm install @upstash/redis @upstash/ratelimit
   ```
2. Buat akun Upstash di https://upstash.com, buat Redis database
3. Set di Vercel env: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
4. Code:
   ```ts
   import { Ratelimit } from "@upstash/ratelimit";
   import { Redis } from "@upstash/redis";
   
   export const loginLimiter = new Ratelimit({
     redis: Redis.fromEnv(),
     limiter: Ratelimit.slidingWindow(5, "1 m"), // 5 attempts per minute
     analytics: true,
   });
   ```
5. Pakai di `/api/auth/login`:
   ```ts
   const ip = request.headers.get("x-forwarded-for") || "unknown";
   const { success } = await loginLimiter.limit(ip);
   if (!success) return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
   ```

**Acceptance**:
- 6x salah password berturut-turut dari IP yang sama → 429 Too Many Requests

---

### 2.3 — Admin approval untuk self-registration

**File**: `src/lib/services/users-service.ts` atau `src/app/auth/login/actions.ts`

**Action**:
- Saat `createUserAction` dipanggil dari self-registration, set `aktif_status: 0`
- Login endpoint sudah check `aktif_status` (existing code: "Akun tidak aktif. Hubungi administrator.") ✅
- Tambah halaman admin `/users` (kalau belum ada) untuk approve user (set `aktif_status: 1`)
- Pertimbangkan: notif email ke admin saat ada registrasi baru (Phase 3)

**Acceptance**:
- Register user baru → login langsung → ditolak "Akun tidak aktif"
- Admin set `aktif_status=1` via UI → user bisa login

---

### 2.4 — Sanitize error responses

**Files**: Semua `src/app/api/**/route.ts`

**Action**:
- Hapus `details: errorMessage` dari response (e.g. `src/app/api/auth/login/route.ts:41`)
- Pakai pattern: log error lengkap server-side (`console.error`), return error generic ke client
- Buat helper `src/lib/api-error.ts`:
  ```ts
  export function apiError(message: string, status: number, originalError?: unknown) {
    if (originalError) console.error(`[${status}] ${message}:`, originalError);
    return NextResponse.json({ error: message }, { status });
  }
  ```

**Acceptance**:
- Trigger error di production → response hanya `{ error: "..." }`, tidak ada stack trace
- Server logs tetap punya detail

---

## Phase 3: Resilience (LOW-MEDIUM — kerjakan bulan depan)

### 3.1 — Audit log untuk operasi sensitif

**File**: `supabase/migrations/<timestamp>_audit_log.sql` + `src/lib/audit.ts`

**Action**:
1. Buat tabel `audit_log`:
   ```sql
   CREATE TABLE audit_log (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id TEXT,
     action TEXT NOT NULL, -- "delete_sale", "modify_cashbook", etc.
     resource_type TEXT,
     resource_id TEXT,
     details JSONB,
     ip_address TEXT,
     user_agent TEXT,
     created_at TIMESTAMPTZ DEFAULT NOW()
   );
   CREATE INDEX idx_audit_log_user ON audit_log(user_id, created_at DESC);
   ```
2. Buat helper `logAudit({ userId, action, resourceType, resourceId, details })`
3. Pakai di endpoint sensitif: delete, finance modifications, user role changes, credential access

---

### 3.2 — Cloudflare proxy (gratis WAF + rate limit)

**Setup**:
1. Daftar Cloudflare gratis
2. Add site `gemiprint.com`
3. Ganti nameserver di GoDaddy → ke Cloudflare's NS
4. Di Cloudflare DNS panel:
   - A record `@` → `185.199.108.153` (GitHub Pages) — set proxy ON (orange cloud)
   - A record `app` → `76.76.21.21` (Vercel) — **set proxy OFF (gray cloud)** karena Vercel pakai SNI yang konflik dengan Cloudflare proxy untuk subdomain Vercel managed
   - Atau: kalau mau proxy ON di `app`, harus pakai Vercel Pro untuk custom certificate handling
5. Enable Cloudflare:
   - "Always Use HTTPS"
   - "Bot Fight Mode" (free)
   - WAF rule kustom: block traffic dari country list tertentu, atau block known scrapers

**Trade-off**: GoDaddy nameserver lebih simple, tapi Cloudflare proxy memberikan defense layer tambahan. Karena `app.gemiprint.com` ke Vercel, **manfaat proxy untuk app subdomain terbatas** kecuali pakai Vercel Pro.

**Rekomendasi**: Skip untuk sekarang, atau lakukan hanya kalau:
- Sudah upgrade Vercel Pro
- Atau pindah hosting dari Vercel ke VPS sendiri

---

## Phase 4: Hygiene (ongoing)

### 4.1 — Dependency security scan

**Action** (jalankan rutin):
```bash
npm audit --audit-level=high
npm audit fix
```

Setup GitHub Dependabot di repo settings untuk auto-PR security updates.

### 4.2 — Secret rotation policy

**Setup reminder**:
- Rotate `SESSION_SECRET`, `PASSWORD_ENC_SECRET`, Supabase keys setiap 6 bulan
- Buat checklist di `docs/SECRET_ROTATION.md` saat itu dilakukan

### 4.3 — Monitoring & alerts

**Tools**:
- Vercel Analytics (built-in) untuk traffic anomaly
- Supabase Dashboard → Logs untuk query patterns mencurigakan
- Pertimbangkan Sentry (gratis 5k events/month) untuk error tracking

---

## DDoS & Layer-by-Layer Defense (Reference)

| Layer | Threat | Mitigation in this plan |
|---|---|---|
| L3/L4 (Network/Transport) | SYN flood, UDP flood | Vercel global anti-DDoS (built-in) |
| L7 (Application) | HTTP flood, Slowloris | Rate limiting (Phase 2.2) + Vercel Edge |
| Bot scraping | Credential stuffing, content scraping | Rate limiting + Cloudflare Bot Fight (Phase 3.2) |
| SQL Injection | Malicious DB queries | Parameterized queries di Supabase client (sudah aman by default) |
| XSS | Script injection via input | CSP header (Phase 2.1) + React auto-escape (sudah aman) |
| CSRF | Cross-site request | SameSite=Lax cookie (Phase 1.4) |
| Session hijacking | Stolen token | HTTP-only cookie (Phase 1.4) — tidak bisa diakses JS |
| Brute force login | Coba banyak password | Rate limiting (Phase 2.2) |
| Privilege escalation | x-user-id forged | Middleware verify JWT (Phase 1.5) |
| Data leak | Direct DB access | RLS + service role only (Phase 1.3) |
| Encrypted data leak | Decrypt stored credentials | Strong `PASSWORD_ENC_SECRET` (Phase 1.6) |

---

## Decision Log

**Decided 2026-05-11**:
- **Auth strategy**: Custom bcrypt + HTTP-only cookie (NOT Supabase Auth)
  - Rationale: Aplikasi internal management system, tidak butuh OAuth/MFA/email magic link. Portabilitas database lebih penting untuk pertumbuhan bisnis jangka panjang.
- **Self-registration**: Tetap buka tapi dengan `aktif_status: 0` (admin approval)
- **Cloudflare**: Tunda — manfaat terbatas untuk subdomain Vercel-managed kecuali upgrade Pro

**Open questions** (need decision before Phase 2):
- Apakah perlu MFA untuk admin role? (Phase 2 enhancement)
- Apakah perlu password complexity requirements (min 8 char, mix case, dll)?
- Apakah session expiry 7 hari OK, atau perlu lebih pendek (e.g., 24 jam dengan refresh token)?

---

## Quick Reference — Files Affected (Summary)

**New files to create**:
- `src/middleware.ts`
- `src/lib/session.ts`
- `src/lib/rate-limit.ts`
- `src/lib/audit.ts`
- `src/lib/api-error.ts`
- `src/app/api/auth/logout/route.ts`
- `src/app/api/sync/offline-queue/route.ts`
- `supabase/migrations/<ts>_enable_rls_service_role_only.sql`
- `supabase/migrations/<ts>_audit_log.sql`

**Files to modify**:
- `next.config.ts` (security headers)
- `src/lib/sync-client.ts` (remove direct Supabase calls)
- `src/lib/services/auth-service.ts` (bcrypt)
- `src/app/api/auth/login/route.ts` (create session + rate limit)
- `src/app/auth/login/page.tsx` (remove localStorage)
- All `src/app/api/**/route.ts` files (use `x-session-uid` instead of `x-user-id`, sanitize errors)

**Environment variables to add in Vercel**:
- `SESSION_SECRET` (random 64 bytes, hex)
- `PASSWORD_ENC_SECRET` (random 48 bytes, base64)
- `UPSTASH_REDIS_REST_URL` (Phase 2)
- `UPSTASH_REDIS_REST_TOKEN` (Phase 2)

**Environment variables to rotate**:
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Phase 1.2)
- `SUPABASE_SERVICE_ROLE_KEY` (Phase 1.2)

---

## Testing Checklist Setelah Phase 1 Selesai

- [x] `npm run build` pass tanpa error
- [ ] Login dengan akun lama (SHA-256 hash) sukses → password ter-migrate ke bcrypt otomatis _(uji jika masih punya user seed SHA-256)_
- [ ] Register user baru → login langsung gagal "Akun tidak aktif"
- [ ] Admin set `aktif_status=1` → user bisa login
- [ ] Cookie `gp_session` ter-set HttpOnly+Secure+SameSite _(di production HTTPS; lokal `Secure` off)_
- [x] Akses `/dashboard` tanpa login → redirect ke `/auth/login`
- [ ] Logout → cookie hilang → akses `/dashboard` → redirect login
- [ ] Curl direct ke `<supabase-url>/rest/v1/profil` pakai anon key → 401 atau empty _(disarankan setelah 1.2 rotasi + RLS)_
- [ ] Curl `/api/customers` tanpa cookie → 401
- [ ] Curl `/api/customers` dengan cookie valid → 200
- [ ] Browser Network tab: tidak ada lagi request `*.supabase.co/rest/v1/*` dari client
- [ ] Offline queue tetap berfungsi (kalau dipakai)
- [x] Smoke test https://app.gemiprint.com setelah deploy

