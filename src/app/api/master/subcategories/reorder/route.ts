import { NextRequest, NextResponse } from "next/server";

import { reorderSubcategories } from "@/lib/services/master-service";

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { items } = body;

    if (!items || !Array.isArray(items)) {
      return NextResponse.json(
        { error: "Items array harus diisi" },
        { status: 400 }
      );
    }

    await reorderSubcategories(items);

    return NextResponse.json({
      message: "Urutan subkategori berhasil diperbarui",
    });
  } catch (error: any) {
    console.error("Error reordering subcategories:", error);
    return NextResponse.json(
      { error: error.message || "Failed to reorder subcategories" },
      { status: 500 }
    );
  }
}
