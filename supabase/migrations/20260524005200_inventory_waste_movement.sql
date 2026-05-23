-- ════════════════════════════════════════════════════════════════════════════
-- Migration: tambah movement_type 'WASTE' untuk catat material rusak/scrap
--
-- Goal: percetakan punya banyak misprint dan sisa potongan. Sebelum migration
-- ini, user terpaksa pakai ADJUSTMENT yang nyampur scrap dengan koreksi
-- inventory umum. Dengan movement_type khusus 'WASTE':
--   - Laporan biaya scrap per bulan/material lebih bersih.
--   - Owner percetakan bisa hitung waste% per material.
--   - Tetap tidak revalue AVCO (sama seperti SALE_ISSUE) — barang hilang
--     dengan nilai average current.
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Update CHECK constraint pada inventory_movements untuk include 'WASTE'.
ALTER TABLE inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_movement_type_check;
ALTER TABLE inventory_movements
  ADD CONSTRAINT inventory_movements_movement_type_check
  CHECK (
    movement_type IN (
      'OPENING_BALANCE',
      'PURCHASE_RECEIPT',
      'SALE_ISSUE',
      'SALE_VOID',
      'PURCHASE_VOID',
      'PURCHASE_RETURN',
      'ADJUSTMENT',
      'WASTE'
    )
  );

-- 2. Update inventory_post_movement: WASTE diperlakukan seperti SALE_ISSUE
--    untuk AVCO (tidak revalue). Karena fungsi sudah pakai whitelist eksplisit
--    untuk type yang revalue, WASTE otomatis fall ke else branch.
--
--    Tidak perlu rewrite fungsi — branch logic existing sudah benar:
--    `IF p_movement_type IN ('PURCHASE_RECEIPT','PURCHASE_VOID','SALE_VOID',
--    'PURCHASE_RETURN','ADJUSTMENT','OPENING_BALANCE') THEN ... revalue ...
--    ELSE no-revalue END`. WASTE jatuh ke else, yang persis kita mau.
--
--    Tapi kita tetap mau qty negatif diperbolehkan untuk WASTE. Itu sudah
--    handled oleh existing check `IF v_qty_after < -0.000001 THEN raise`,
--    yang bekerja terlepas dari movement_type.
