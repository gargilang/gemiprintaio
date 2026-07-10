-- Lengkapi kontrak sinkronisasi biaya_tambahan_penjualan.
-- Additive dan idempotent agar aman untuk skema cloud yang sudah sebagian maju.
ALTER TABLE public.biaya_tambahan_penjualan
  ADD COLUMN IF NOT EXISTS item_penjualan_id text REFERENCES public.item_penjualan(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS diperbarui_pada timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at_server timestamp with time zone,
  ADD COLUMN IF NOT EXISTS updated_by_device text DEFAULT 'server'::text,
  ADD COLUMN IF NOT EXISTS change_version integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS client_mutation_id text;

CREATE INDEX IF NOT EXISTS idx_biaya_tambahan_penjualan_item
  ON public.biaya_tambahan_penjualan(item_penjualan_id);
