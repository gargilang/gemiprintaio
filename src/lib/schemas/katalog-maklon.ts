import { z } from "zod";

export const katalogMaklonInputSchema = z.object({
  nama_produk: z.string().min(1, "Nama produk wajib diisi").max(200),
  nama_satuan: z.string().min(1).max(50).default("pcs"),
  harga_jual_default: z.coerce.number().finite().min(0),
  biaya_subkontrak_default: z.coerce.number().finite().min(0),
  vendor_subkontrak_id_default: z.string().nullable().optional(),
  metode_bayar_vendor_default: z
    .enum(["CASH", "TRANSFER", "NET30"])
    .default("CASH"),
  kategori: z.string().nullable().optional(),
  kategori_id: z.string().nullable().optional(),
  populer_status: z.coerce.number().int().min(0).max(1).default(0),
  // 1 = harga dihitung per m² (lebar × panjang × jumlah). 0 = flat per satuan.
  butuh_dimensi_status: z.coerce.number().int().min(0).max(1).default(0),
  catatan_internal: z.string().nullable().optional(),
  is_aktif: z.coerce.number().int().min(0).max(1).default(1),
  urutan: z.coerce.number().int().min(0).default(0),
});

export type KatalogMaklonInput = z.infer<typeof katalogMaklonInputSchema>;
