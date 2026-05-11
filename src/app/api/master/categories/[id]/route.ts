import { NextRequest, NextResponse } from "next/server";

import { rowExistsEq } from "@/lib/duplicate-check";
import {
  countMaterialsByCategoryId,
  deleteCategory,
  getCategoryById,
  updateCategory,
} from "@/lib/services/master-service";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  try {
    const category = await getCategoryById(params.id);

    if (!category) {
      return NextResponse.json(
        { error: "Kategori tidak ditemukan" },
        { status: 404 }
      );
    }

    return NextResponse.json({ category });
  } catch (error: any) {
    console.error("Error fetching category:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch category" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  try {
    const body = await req.json();
    const { nama, butuh_spesifikasi_status, urutan_tampilan } = body;

    if (!nama || !nama.trim()) {
      return NextResponse.json(
        { error: "Nama kategori harus diisi" },
        { status: 400 }
      );
    }

    const existing = await getCategoryById(params.id);

    if (!existing) {
      return NextResponse.json(
        { error: "Kategori tidak ditemukan" },
        { status: 404 }
      );
    }

    const dup = await rowExistsEq(
      "kategori_barang",
      "nama",
      nama.trim(),
      params.id
    );
    if (dup) {
      return NextResponse.json(
        { error: "Kategori dengan nama ini sudah ada" },
        { status: 400 }
      );
    }

    await updateCategory(params.id, {
      nama: nama.trim(),
      butuh_spesifikasi_status: butuh_spesifikasi_status ? 1 : 0,
      urutan_tampilan: urutan_tampilan || 0,
    });

    const updatedCategory = await getCategoryById(params.id);

    return NextResponse.json({
      message: "Kategori berhasil diupdate",
      category: updatedCategory,
    });
  } catch (error: any) {
    console.error("Error updating category:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update category" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  try {
    const existing = await getCategoryById(params.id);

    if (!existing) {
      return NextResponse.json(
        { error: "Kategori tidak ditemukan" },
        { status: 404 }
      );
    }

    const count = await countMaterialsByCategoryId(params.id);

    if (count > 0) {
      return NextResponse.json(
        {
          error: `Tidak dapat menghapus kategori karena masih ada ${count} barang yang menggunakan kategori ini`,
        },
        { status: 400 }
      );
    }

    await deleteCategory(params.id);

    return NextResponse.json({ message: "Kategori berhasil dihapus" });
  } catch (error: any) {
    console.error("Error deleting category:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete category" },
      { status: 500 }
    );
  }
}
