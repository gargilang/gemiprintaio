import { NextRequest, NextResponse } from "next/server";

import { requireAdminOrManager, AuthGuardError } from "@/lib/auth-guard-server";
import { rowExistsCompositeEq } from "@/lib/duplicate-check";
import {
  countMaterialsBySubcategoryId,
  deleteSubcategory,
  getSubcategoryById,
  getSubcategoryRowById,
  updateSubcategory,
} from "@/lib/services/master-service";

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  try {
    await requireAdminOrManager();
    const body = await req.json();
    const { nama, urutan_tampilan } = body;

    if (!nama || !nama.trim()) {
      return NextResponse.json(
        { error: "Nama subkategori harus diisi" },
        { status: 400 }
      );
    }

    const existing = await getSubcategoryById(params.id);

    if (!existing) {
      return NextResponse.json(
        { error: "Subkategori tidak ditemukan" },
        { status: 404 }
      );
    }

    const dup = await rowExistsCompositeEq(
      "subkategori_barang",
      [
        ["kategori_id", existing.kategori_id],
        ["nama", nama.trim()],
      ],
      params.id
    );
    if (dup) {
      return NextResponse.json(
        { error: "Subkategori dengan nama ini sudah ada dalam kategori ini" },
        { status: 400 }
      );
    }

    await updateSubcategory(params.id, {
      nama: nama.trim(),
      urutan_tampilan: urutan_tampilan || 0,
    });

    const updatedSubcategory = await getSubcategoryRowById(params.id);

    return NextResponse.json({
      message: "Subkategori berhasil diupdate",
      subcategory: updatedSubcategory,
    });
  } catch (error: any) {
    if (error instanceof AuthGuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error updating subcategory:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update subcategory" },
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
    await requireAdminOrManager();
    const existing = await getSubcategoryById(params.id);

    if (!existing) {
      return NextResponse.json(
        { error: "Subkategori tidak ditemukan" },
        { status: 404 }
      );
    }

    const count = await countMaterialsBySubcategoryId(params.id);

    if (count > 0) {
      return NextResponse.json(
        {
          error: `Tidak dapat menghapus subkategori karena masih ada ${count} barang yang menggunakan subkategori ini`,
        },
        { status: 400 }
      );
    }

    await deleteSubcategory(params.id);

    return NextResponse.json({ message: "Subkategori berhasil dihapus" });
  } catch (error: any) {
    if (error instanceof AuthGuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error deleting subcategory:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete subcategory" },
      { status: 500 }
    );
  }
}
