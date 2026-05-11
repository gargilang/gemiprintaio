import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db-unified";
import { apiError } from "@/lib/api-error";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { reorderedIds } = body;

    if (!Array.isArray(reorderedIds) || reorderedIds.length === 0) {
      return NextResponse.json(
        { error: "Invalid reorderedIds array" },
        { status: 400 }
      );
    }

    for (let index = 0; index < reorderedIds.length; index++) {
      const id = reorderedIds[index];
      const upd = await db.update("keuangan", id, {
        urutan_tampilan: index,
      });
      if (upd.error) {
        throw upd.error;
      }
    }

    return NextResponse.json({
      success: true,
      message: "Successfully reordered (no recalculation)",
    });
  } catch (error: unknown) {
    return apiError("Failed to reorder rows", 500, error);
  }
}
