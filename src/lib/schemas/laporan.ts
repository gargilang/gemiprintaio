import { z } from "zod";

export const generateLaporanBulananSchema = z
  .object({
    accounting_period_id: z.string().min(1),
    kata_pembuka: z.string().max(10_000),
    kata_penutup: z.string().max(10_000),
    simpan_riwayat: z.boolean().optional().default(true),
  })
  .passthrough();

export type GenerateLaporanBulananInput = z.infer<
  typeof generateLaporanBulananSchema
>;
