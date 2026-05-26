# Supabase Local Development

Use this workflow when you want to develop against a disposable local
Supabase database instead of the online project used by Vercel.

## Requirements

- Docker Desktop must be running.
- Supabase CLI is available through `npx supabase`.

## Start Local Supabase

```bash
npm run supabase:local:start
npm run supabase:local:reset
npm run supabase:local:status
```

`supabase:local:reset` recreates the local database from
`supabase/migrations` and then runs the seed configured in
`supabase/config.toml`, currently `supabase/seed-default-values.sql`.

## Point Next.js To Local Supabase

After `npm run supabase:local:status`, copy the local API URL, anon key,
service role key, and DB URL into `.env.local`.

Typical local values look like this, but prefer the exact values printed by
`supabase status`:

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from supabase status>
SUPABASE_SERVICE_ROLE_KEY=<service role key from supabase status>
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

Then run:

```bash
npm run dev
```

Now local development writes to local Supabase only. The deployed
`app.gemiprint.com` continues to use the Supabase credentials configured in
Vercel, not your local `.env.local`.

## Reset Local Data Anytime

```bash
npm run supabase:local:reset
```

This deletes local rows/schema changes and rebuilds from migrations plus seed.
It does not touch the online Supabase project.

## Reset Online Development Project

Only use this while online data is disposable:

```bash
npm run supabase:wipe
npm run supabase:apply
```

This drops and recreates the online `public` schema through the Postgres URL in
`.env.local`, then applies `supabase/schema.sql` and
`supabase/seed-default-values.sql`. It does not reset Supabase Auth users or
Storage objects because those live outside the `public` schema.
