import { z } from "zod";

export const parkCartInputSchema = z.object({
  label: z.string().min(1, "Label wajib").max(200),
  pelanggan_id: z.string().nullable().optional(),
  pelanggan_nama_snapshot: z.string().nullable().optional(),
  pelanggan_kota: z.string().nullable().optional(),
  prioritas: z.enum(["NORMAL", "KILAT"]).default("NORMAL"),
  ppn_snapshot: z.unknown().nullable().optional(),
  cart_snapshot: z.unknown(),
});
export type ParkCartInput = z.infer<typeof parkCartInputSchema>;

// Item untuk jadikanPenawaran — bentuk QuotationItemInput yang divalidasi.
// .passthrough() supaya field baru tidak gugur diam-diam (iron rule 15).
export const jadikanPenawaranItemSchema = z
  .object({
    barang_id: z.string().min(1, "barang_id wajib"),
    harga_satuan_id: z.string().nullable().optional(),
    jumlah: z.coerce.number().finite(),
    nama_satuan: z.string().min(1),
    faktor_konversi: z.coerce.number().finite(),
    harga_satuan: z.coerce.number().finite(),
    subtotal: z.coerce.number().finite().optional(),
    panjang: z.coerce.number().finite().nullable().optional(),
    lebar: z.coerce.number().finite().nullable().optional(),
    jumlah_lembar: z.coerce.number().int().nullable().optional(),
    tipe_item: z.enum(["BARANG", "JASA", "MAKLON"]).optional(),
    vendor_subkontrak_id: z.string().nullable().optional(),
    biaya_subkontrak: z.coerce.number().finite().nullable().optional(),
    metode_bayar_vendor: z.enum(["CASH", "NET30"]).nullable().optional(),
    deskripsi_pekerjaan: z.string().nullable().optional(),
  })
  .passthrough();

export const jadikanPenawaranMetaSchema = z
  .object({
    pelanggan_id: z.string().nullable().optional(),
    pelanggan_nama_snapshot: z.string().nullable().optional(),
    pelanggan_kota: z.string().nullable().optional(),
    kena_ppn: z.boolean().optional(),
    ppn_persen: z.coerce.number().finite().optional(),
    ppn_metode: z.enum(["EKSKLUSIF", "INKLUSIF"]).optional(),
    catatan: z.string().nullable().optional(),
  })
  .passthrough();

export const jadikanPenawaranInputSchema = z
  .object({
    items: z.array(jadikanPenawaranItemSchema).min(1, "Minimal satu item"),
    meta: jadikanPenawaranMetaSchema.optional(),
  })
  .passthrough();
export type JadikanPenawaranInput = z.infer<typeof jadikanPenawaranInputSchema>;
