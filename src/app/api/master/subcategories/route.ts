import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db-unified";
import {
  createSubcategory,
  getCategoryById,
  getSubcategoryRowById,
  listSubcategoriesWithCategory,
} from "@/lib/services/master-service";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const categoryId = searchParams.get("category_id");

    const subcategories = await listSubcategoriesWithCategory(categoryId);

    return NextResponse.json({ subcategories });
  } catch (error: any) {
    console.error("Error fetching subcategories:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch subcategories" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { kategori_id, nama, urutan_tampilan } = body;

    if (!kategori_id || !kategori_id.trim()) {
      return NextResponse.json(
        { error: "ID kategori harus diisi" },
        { status: 400 }
      );
    }

    if (!nama || !nama.trim()) {
      return NextResponse.json(
        { error: "Nama subkategori harus diisi" },
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
      "SELECT id FROM subkategori_barang WHERE kategori_id = ? AND nama = ? LIMIT 1",
      [kategori_id, nama.trim()]
    );
    if (dup.length > 0) {
      return NextResponse.json(
        { error: "Subkategori dengan nama ini sudah ada dalam kategori ini" },
        { status: 400 }
      );
    }

    const created = await createSubcategory({
      kategori_id,
      nama: nama.trim(),
      urutan_tampilan: urutan_tampilan || 0,
    });

    if (!created?.id) {
      return NextResponse.json(
        { error: "Gagal menambahkan subkategori" },
        { status: 500 }
      );
    }

    const subcategory = await getSubcategoryRowById(created.id);

    return NextResponse.json(
      {
        message: "Subkategori berhasil ditambahkan",
        subcategory,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error creating subcategory:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create subcategory" },
      { status: 500 }
    );
  }
}
