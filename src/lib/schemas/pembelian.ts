import { z } from "zod";

/** Angka berhingga; coerce supaya "1000" dari klien JSON tetap valid, tapi NaN/garbage ditolak. */
const finiteNumber = z.coerce.number().finite();

const purchaseItemSchema = z
  .object({
    barang_id: z.string().min(1),
    harga_satuan_id: z.string().nullable().optional(),
    nama_satuan: z.string().optional(),
    faktor_konversi: finiteNumber.positive().optional(),
    jumlah: finiteNumber.positive(),
    harga_satuan: finiteNumber.nonnegative(),
    panjang: finiteNumber.positive().nullable().optional(),
    lebar: finiteNumber.positive().nullable().optional(),
    jumlah_roll: finiteNumber.int().min(1).optional(),
  })
  .passthrough();

export const createPurchaseSchema = z
  .object({
    nomor_pembelian: z.string().optional(),
    nomor_faktur: z.string().min(1, "Nomor faktur harus diisi"),
    vendor_id: z.string().nullable().optional(),
    tanggal: z.string().optional(),
    metode_pembayaran: z.string().optional(),
    catatan: z.string().nullable().optional(),
    dibuat_oleh: z.string().nullable().optional(),
    items: z.array(purchaseItemSchema).min(1, "Minimal harus ada 1 item pembelian"),
  })
  .passthrough();

export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;

export const payDebtSchema = z
  .object({
    purchase_id: z.string().min(1),
    jumlah_bayar: finiteNumber.positive(),
    tanggal_bayar: z.string().optional(),
    metode_pembayaran: z.string().optional(),
    referensi: z.string().nullable().optional(),
    catatan: z.string().nullable().optional(),
    dibuat_oleh: z.string().nullable().optional(),
  })
  .passthrough();

export type PayDebtInput = z.infer<typeof payDebtSchema>;
