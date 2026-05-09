import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db-unified";
import {
  createQuickSpec,
  getCategoryById,
  getQuickSpecRowById,
  listQuickSpecsWithCategory,
} from "@/lib/services/master-service";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const categoryId = searchParams.get("category_id");

    const specs = await listQuickSpecsWithCategory(categoryId);

    return NextResponse.json({ specs });
  } catch (error: any) {
    console.error("Error fetching quick specs:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch quick specs" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      kategori_id,
      tipe_spesifikasi,
      nilai_spesifikasi,
      urutan_tampilan,
    } = body;

    if (!kategori_id || !kategori_id.trim()) {
      return NextResponse.json(
        { error: "ID kategori harus diisi" },
        { status: 400 }
      );
    }

    if (!tipe_spesifikasi || !tipe_spesifikasi.trim()) {
      return NextResponse.json(
        { error: "Tipe spesifikasi harus diisi" },
        { status: 400 }
      );
    }

    if (!nilai_spesifikasi || !nilai_spesifikasi.trim()) {
      return NextResponse.json(
        { error: "Nilai spesifikasi harus diisi" },
        { status: 400 }
      );
    }

    const category = await getCategoryById(kategori_id);
    if (!category) {
      return NextResponse.json(
        { error: "Kategori tidak ditemukan" },
        { status: 404 }
      );
    }

    const dup = await db.queryRaw<{ id: string }>(
      "SELECT id FROM spesifikasi_cepat_barang WHERE kategori_id = ? AND tipe_spesifikasi = ? AND nilai_spesifikasi = ? LIMIT 1",
      [kategori_id, tipe_spesifikasi.trim(), nilai_spesifikasi.trim()]
    );
    if (dup.length > 0) {
      return NextResponse.json(
        { error: "Spesifikasi ini sudah ada" },
        { status: 400 }
      );
    }

    const created = await createQuickSpec({
      kategori_id,
      tipe_spesifikasi: tipe_spesifikasi.trim(),
      nilai_spesifikasi: nilai_spesifikasi.trim(),
      urutan_tampilan: urutan_tampilan || 0,
    });

    if (!created?.id) {
      return NextResponse.json(
        { error: "Gagal menambahkan spesifikasi" },
        { status: 500 }
      );
    }

    const quickSpec = await getQuickSpecRowById(created.id);

    return NextResponse.json(
      {
        message: "Spesifikasi cepat berhasil ditambahkan",
        quickSpec,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error creating quick spec:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create quick spec" },
      { status: 500 }
    );
  }
}
