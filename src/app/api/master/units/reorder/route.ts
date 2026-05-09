import { NextRequest, NextResponse } from "next/server";

import { reorderUnits } from "@/lib/services/master-service";

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

    await reorderUnits(items);

    return NextResponse.json({
      message: "Urutan satuan berhasil diperbarui",
    });
  } catch (error: any) {
    console.error("Error reordering units:", error);
    return NextResponse.json(
      { error: error.message || "Failed to reorder units" },
      { status: 500 }
    );
  }
}
