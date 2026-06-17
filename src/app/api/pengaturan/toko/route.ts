import { NextResponse } from "next/server";
import { getShopSettings } from "@/lib/services/shop-settings-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/pengaturan/toko
 *
 * Mengembalikan info toko publik (untuk header faktur/penawaran di mobile).
 * Hanya field yang relevan untuk pencetakan — tidak membocorkan konfigurasi
 * PPN/NSFP/nomor urut. Endpoint baca, jadi tanpa auth guard.
 */
export async function GET() {
  try {
    const s = await getShopSettings();
    return NextResponse.json({
      nama_toko: s.nama_toko,
      slogan: s.slogan,
      alamat: s.alamat,
      telepon: s.telepon,
      email: s.email,
      website: s.website,
      bank_nama: s.bank_nama,
      bank_nomor: s.bank_nomor,
      bank_atas_nama: s.bank_atas_nama,
      catatan_faktur: s.catatan_faktur,
    });
  } catch (error) {
    console.error("GET /api/pengaturan/toko error:", error);
    return NextResponse.json(
      { error: "Gagal memuat pengaturan toko" },
      { status: 500 },
    );
  }
}
