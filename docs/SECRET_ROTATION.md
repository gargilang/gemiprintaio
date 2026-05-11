# Secret rotation checklist (gemiprint)

Rotate these values roughly every six months, or immediately after any suspected leak.

1. **Supabase** (Dashboard → Project Settings → API): reset `anon` and `service_role` keys. Update Vercel env vars `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`, then redeploy.
2. **SESSION_SECRET**: generate a new 64-byte hex string, set on Vercel (Production + Preview), redeploy. All users must log in again.
3. **PASSWORD_ENC_SECRET**: changing this requires re-encrypting rows in `kredensial` or truncating that table. Plan the migration before rotating.
4. **Upstash**: rotate the Redis token in the Upstash console if the REST token was exposed.

After each rotation: smoke test login, POS sale, finance cash book, and sync on https://app.gemiprint.com (or your deployment URL).
