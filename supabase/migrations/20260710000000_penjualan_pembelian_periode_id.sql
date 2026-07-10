-- Tambah kolom periode_id ke penjualan & pembelian agar laporan bulanan
-- dapat memfilter transaksi berdasarkan periode akuntansi (tutup buku),
-- bukan berdasarkan rentang tanggal kalender yang kaku.
--
-- Kolom ini nullable (sama seperti di keuangan) supaya transaksi lama yang
-- belum punya periode_id tidak error. Diisi saat create transaksi via
-- resolveOpenPeriodeIdForKeuangan() — sama seperti pola keuangan.

ALTER TABLE public.penjualan
  ADD COLUMN IF NOT EXISTS periode_id text REFERENCES public.accounting_periods(id);

ALTER TABLE public.pembelian
  ADD COLUMN IF NOT EXISTS periode_id text REFERENCES public.accounting_periods(id);

CREATE INDEX IF NOT EXISTS idx_penjualan_periode_id
  ON public.penjualan(periode_id);

CREATE INDEX IF NOT EXISTS idx_pembelian_periode_id
  ON public.pembelian(periode_id);
