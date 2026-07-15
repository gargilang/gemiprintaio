import { z } from "zod";

/** Angka berhingga; coerce supaya "1000" dari klien JSON tetap valid, tapi NaN/garbage ditolak. */
const finiteNumber = z.coerce.number().finite();

/**
 * Penyesuaian stok manual. qty_delta boleh negatif (koreksi turun) atau positif
 * (koreksi naik), tapi tidak boleh 0 atau NaN. unit_cost opsional (null = pakai AVCO).
 */
export const inventoryAdjustmentSchema = z
  .object({
    barang_id: z.string().min(1),
    qty_delta: finiteNumber.refine((n) => n !== 0, {
      message: "qty_delta tidak boleh 0",
    }),
    reason: z.string().optional(),
    unit_cost: finiteNumber.nonnegative().nullable().optional(),
    tanggal: z.string().optional(),
    dibuat_oleh: z.string().nullable().optional(),
  })
  .passthrough();

export type InventoryAdjustmentInput = z.infer<typeof inventoryAdjustmentSchema>;

export const payReceivableSchema = z
  .object({
    piutang_id: z.string().min(1),
    jumlah_bayar: finiteNumber.positive(),
    tanggal_bayar: z.string().optional(),
    metode_pembayaran: z.string().optional(),
    referensi: z.string().nullable().optional(),
    catatan: z.string().nullable().optional(),
    dibuat_oleh: z.string().nullable().optional(),
  })
  .passthrough();

export type PayReceivableInput = z.infer<typeof payReceivableSchema>;

/** Schema untuk pembayaran lump-sum yang dialokasikan FIFO ke beberapa tagihan. */
export const payReceivableLumpSumSchema = z
  .object({
    tagihan_ids: z.array(z.string().min(1)).min(1, "Minimal satu tagihan"),
    jumlah_bayar: finiteNumber.positive(),
    tanggal_bayar: z.string().optional(),
    metode_pembayaran: z.string().optional(),
    referensi: z.string().nullable().optional(),
    catatan: z.string().nullable().optional(),
    dibuat_oleh: z.string().nullable().optional(),
  })
  .passthrough();

export type PayReceivableLumpSumInput = z.infer<
  typeof payReceivableLumpSumSchema
>;
