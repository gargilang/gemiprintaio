# Rotasi rahasia (gemiprint) — `docs/SECRET_ROTATION.md`

**Terakhir diperbarui:** 2026-05-11

Dokumen ini melengkapi `SECURITY_HARDENING_PLAN.md`: apa yang sudah ada di Vercel/Supabase, dan apa yang harus Anda lakukan **berkala** atau **setelah kebocoran**.

---

## Yang sudah ada (setelah hardening)

| Rahasia / env | Production (Vercel) | Preview (Vercel) | Lokal (`.env.local`) |
|----------------|---------------------|------------------|----------------------|
| `SESSION_SECRET` | ✅ Diset | ⏳ Isi manual jika pakai preview URL | ✅ Anda isi sendiri |
| `PASSWORD_ENC_SECRET` | ✅ Diset | ⏳ Isi manual jika pakai preview URL | Opsional (tanpa ini: log peringatan + kunci dev) |
| `NEXT_PUBLIC_SUPABASE_*` + `SUPABASE_SERVICE_ROLE_KEY` | ✅ (sudah ada sebelumnya) | ✅ | Di `.env.local` Anda |

**Catatan Preview:** CLI Vercel sering minta nama cabang Git untuk env Preview; kalau tidak dipakai, abaikan. Kalau PR preview dipakai untuk uji login, tambahkan `SESSION_SECRET` dan `PASSWORD_ENC_SECRET` untuk Preview di dashboard Vercel (boleh nilai **beda** dari production).

---

## Rotasi berkala (~6 bulan atau setelah dicurigai bocor)

Lakukan **satu per satu**, lalu smoke test: login, POS, buku kas, sync di https://app.gemiprint.com

1. **Supabase** (Dashboard → Project Settings → API): reset **`anon`** dan **`service_role`**. Salin key baru ke Vercel: `NEXT_PUBLIC_SUPABASE_ANON_KEY` dan `SUPABASE_SERVICE_ROLE_KEY` (Production + Preview bila dipakai). Redeploy (push kosong atau redeploy dari dashboard).
2. **`SESSION_SECRET`**: generate baru (`node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`), set di Vercel + `.env.local` lokal. **Semua user harus login ulang.**
3. **`PASSWORD_ENC_SECRET`**: mengganti ini **tidak bisa sembarangan** kalau tabel `kredensial` sudah berisi data terenkripsi — harus skrip migrasi (dekripsi pakai key lama → enkripsi pakai key baru) atau, jika data boleh dibuang, `TRUNCATE` tabel tersebut. Rencanakan dulu.
4. **Upstash** (jika dipakai): di konsol Upstash, rotasi token REST jika pernah terbocor.

---

## Yang belum wajib tapi disarankan (bukan rotasi)

- **Dependabot** di GitHub (repo → Settings → Code security) untuk PR pembaruan dependensi otomatis.
- **Sentry** (atau alat sejenis) untuk error production — membantu debug tanpa membaca log Vercel manual.

---

## Ringkas untuk non-programmer

- **Yang paling penting di luar kode:** sekali-sekali **ganti password API Supabase** di website Supabase dan tempel yang baru ke website Vercel — itu melindungi database jika key lama pernah bocor.  
- **Yang rutin:** tidak perlu sering; anggap **setengah tahun sekali** kecuali ada kejadian mencurigakan.  
- **Kalau bingung:** simpan link dokumen ini dan `SECURITY_HARDENING_PLAN.md`; beri tahu developer/agent untuk menjalankan langkah di atas.
