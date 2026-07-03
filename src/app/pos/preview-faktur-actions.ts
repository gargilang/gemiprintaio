"use server";

// Server action untuk pratinjau nomor faktur berikutnya. Dipanggil dari
// KeranjangPOS (Client Component) lewat RPC — TIDAK boleh mengimpor
// `pos-mutations` langsung di client karena modul itu `server-only` (pakai
// DB/better-sqlite3) dan akan menarik `fs` ke bundle browser. Baca-saja,
// tidak mengonsumsi counter (lihat `generateInvoiceNumber`).
import { previewNextInvoiceNumber } from "@/lib/services/pos-mutations";

export async function previewNomorFakturAction(): Promise<string> {
  return previewNextInvoiceNumber();
}
