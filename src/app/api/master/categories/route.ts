import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db-unified";
import {
  createCategory,
  getCategories,
  getCategoryById,
} from "@/lib/services/master-service";

export async function GET() {
  try {
    const categories = await getCategories();
    return NextResponse.json({ categories });
  } catch (error: any) {
    console.error("Error fetching categories:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch categories" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { nama, butuh_spesifikasi_status, urutan_tampilan } = body;

    if (!nama || !nama.trim()) {
      return NextResponse.json(
        { error: "Nama kategori harus diisi" },
        { status: 400 }
      );
    }

    const dup = await db.queryRaw<{ id: string }>(
      "SELECT id FROM kategori_barang WHERE nama = ? LIMIT 1",
      [nama.trim()]
    );
    if (dup.length > 0) {
      return NextResponse.json(
        { error: "Kategori dengan nama ini sudah ada" },
        { status: 400 }
      );
    }

    const created = await createCategory({
      nama: nama.trim(),
      butuh_spesifikasi_status: butuh_spesifikasi_status ? 1 : 0,
      urutan_tampilan: urutan_tampilan || 0,
    });

    if (!created?.id) {
      return NextResponse.json(
        { error: "Gagal menambahkan kategori" },
        { status: 500 }
      );
    }

    const category = await getCategoryById(created.id);
    return NextResponse.json(
      { message: "Kategori berhasil ditambahkan", category },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error creating category:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create category" },
      { status: 500 }
    );
  }
}
