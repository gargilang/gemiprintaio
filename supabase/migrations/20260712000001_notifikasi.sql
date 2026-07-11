-- Fondasi notifikasi terpusat untuk toast aplikasi dan notifikasi bisnis masa depan.
-- Tabel ini sengaja umum: toast saat ini memakai kategori 'toast', integrasi bank
-- nanti bisa memakai kategori 'bank' dengan metadata_json/ref_* tanpa rename kolom.

CREATE TABLE IF NOT EXISTS public.notifikasi (
  id text PRIMARY KEY,
  tipe text NOT NULL DEFAULT 'info' CHECK (tipe IN ('success', 'error', 'info', 'warning')),
  kategori text NOT NULL DEFAULT 'toast' CHECK (kategori IN ('toast', 'bank', 'sistem')),
  judul text,
  pesan text NOT NULL,
  sumber_path text,
  sumber_judul text,
  ref_tipe text,
  ref_id text,
  metadata_json jsonb,
  dibuat_oleh text REFERENCES public.profil(id) ON DELETE SET NULL,
  dibuat_pada timestamp with time zone DEFAULT now(),
  diperbarui_pada timestamp with time zone DEFAULT now(),
  sync_status text DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at timestamp with time zone,
  sync_version integer DEFAULT 1,
  updated_at_server timestamp with time zone,
  updated_by_device text DEFAULT 'server'::text,
  change_version integer DEFAULT 1,
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamp with time zone,
  client_mutation_id text
);

CREATE TABLE IF NOT EXISTS public.notifikasi_pengguna (
  id text PRIMARY KEY,
  notifikasi_id text NOT NULL REFERENCES public.notifikasi(id) ON DELETE CASCADE,
  pengguna_id text NOT NULL REFERENCES public.profil(id) ON DELETE CASCADE,
  dibaca_status boolean NOT NULL DEFAULT false,
  dibaca_pada timestamp with time zone,
  dibuat_pada timestamp with time zone DEFAULT now(),
  diperbarui_pada timestamp with time zone DEFAULT now(),
  sync_status text DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at timestamp with time zone,
  sync_version integer DEFAULT 1,
  updated_at_server timestamp with time zone,
  updated_by_device text DEFAULT 'server'::text,
  change_version integer DEFAULT 1,
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamp with time zone,
  client_mutation_id text,
  CONSTRAINT notifikasi_pengguna_unique UNIQUE (notifikasi_id, pengguna_id)
);

CREATE INDEX IF NOT EXISTS idx_notifikasi_dibuat_pada
  ON public.notifikasi(dibuat_pada DESC);

CREATE INDEX IF NOT EXISTS idx_notifikasi_kategori_tipe
  ON public.notifikasi(kategori, tipe, dibuat_pada DESC);

CREATE INDEX IF NOT EXISTS idx_notifikasi_ref
  ON public.notifikasi(ref_tipe, ref_id);

CREATE INDEX IF NOT EXISTS idx_notifikasi_pengguna_user
  ON public.notifikasi_pengguna(pengguna_id, dibaca_status, dibuat_pada DESC);

CREATE INDEX IF NOT EXISTS idx_notifikasi_pengguna_notifikasi
  ON public.notifikasi_pengguna(notifikasi_id);
