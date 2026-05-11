import { NextRequest, NextResponse } from "next/server";

import {
  patchCashBookManualOverrides,
  clearCashBookManualOverride,
} from "@/lib/services/finance-service";
import { apiError } from "@/lib/api-error";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const outcome = await patchCashBookManualOverrides(id, body);

    if (outcome === "no_fields") {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }
    if (outcome === "not_found") {
      return NextResponse.json(
        { error: "Keuangan entry not found", id },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Successfully updated cash book entry with manual override",
    });
  } catch (error: unknown) {
    return apiError("Failed to update cash book entry", 500, error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const field = url.searchParams.get("field");

    if (!field) {
      return NextResponse.json(
        { error: "Field parameter is required" },
        { status: 400 }
      );
    }

    const outcome = await clearCashBookManualOverride(id, field);

    if (outcome === "invalid_field") {
      return NextResponse.json({ error: "Invalid field" }, { status: 400 });
    }
    if (outcome === "not_found") {
      return NextResponse.json(
        { error: "Keuangan entry not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Successfully removed override for ${field}`,
    });
  } catch (error: unknown) {
    return apiError("Failed to remove override", 500, error);
  }
}
