# Work Log

This file is a live handoff log for Cursor agents. Keep it short, current, and useful for recovering after a disconnected or restarted chat.

## Current Status

- Active task: Fitur percobaan "tanggal lahir pelanggan" (kemungkinan dibuang).
- Last completed step: Implementasi penuh + verifikasi `type-check` (0 error) & `build` (sukses).
- Next step: Tunggu keputusan owner — kalau tidak suka, buang branch `coba-tanggal-lahir-pelanggan`.
- Blockers: Migrasi cloud belum di-apply (owner jalankan `npm run supabase:db:push` bila mau coba di web).
- Touched files: `supabase/migrations/20260608000000_pelanggan_tanggal_lahir.sql`, `database/sqlite-schema.sql`, `src/lib/db-sqlite-migrations.ts`, `src/lib/services/customers-service.ts`, `src/app/pelanggan/page.tsx`.
- Verification: type-check OK, build OK. Tidak ada migrasi cloud yang dijalankan.

## Recent Entries

### 2026-06-08 01:18 — Perkuat rules + pasang Graphify MCP (meta, bukan fitur app)

- Perkuat aturan work-log di `project-context.mdc`: pemicu tegas (tulis di awal + tiap selesai edit file/command, jangan tunggu task kelar) untuk recovery saat internet putus.
- Perkuat aturan Graphify (`project-context.mdc` + `graphify.mdc`): `graphify query` dulu sebelum grep untuk SEMUA jenis task; utamakan tool MCP bila ada.
- Tambah iron rule baru "icons (SVG only, never emoji)" → tunjuk `src/components/icons/PageIcons.tsx` + `ContentIcons.tsx`. (Catatan: badge 🎂 di fitur tes melanggar aturan baru ini; belum diubah karena owner belum minta.)
- Pasang Graphify MCP: `uv tool install "graphifyy[mcp]"` + tulis `.cursor/mcp.json` (python venv uv-tool + `graphify-out/graph.json`). Verifikasi handshake MCP `initialize` OK.
- Catatan branch: edits ini berada di branch `coba-tanggal-lahir-pelanggan` bersama fitur tes.

### 2026-06-08 — Fitur coba: tanggal lahir pelanggan

- Dibuat di branch terpisah `coba-tanggal-lahir-pelanggan` agar mudah dibuang utuh kalau owner tidak suka.
- Kolom `tanggal_lahir` ditambahkan additive di 3 tempat (migration Supabase, sqlite-schema template, runtime ALTER) sesuai iron rule schema-change.
- UI: input tanggal di form, kolom "Tanggal Lahir" di tabel, badge 🎂 untuk yang ulang tahun bulan ini, dan kartu ringkasan "Ulang Tahun".
- Baru tampilan/penandaan; belum ada diskon otomatis (sesuai permintaan "lihat dulu").

### 2026-06-07 03:57

- Created `.cursor/rules/project-context.mdc` with `alwaysApply: true` to replace the old root `.cursorrules` format.
- Added a mandatory live-work-log section that tells future agents to read and maintain `.cursor/work-log.md`.
- Kept the Graphify rule separate in `.cursor/rules/graphify.mdc` because it is managed by `graphify cursor install`, but both rules are automatically included by Cursor.
- Removed the old root `.cursorrules` after migration.
- Verified the new Markdown files with `ReadLints` and confirmed `graphify-out/graph.json` is ignored by `.gitignore`.

## Completed Summary

- Graphify Cursor integration is installed at `.cursor/rules/graphify.mdc`.
- `graphify update .` successfully generated a code graph in `graphify-out/`.
- `graphify-out/` is ignored in `.gitignore`.
- Project rules migrated to `.cursor/rules/project-context.mdc` (always-apply); old root `.cursorrules` removed.
- Graphify MCP server configured at `.cursor/mcp.json` (needs a Cursor restart to load).
