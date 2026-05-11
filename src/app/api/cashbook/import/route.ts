import { NextRequest, NextResponse } from "next/server";

import { importCashbookFromCSV } from "@/lib/services/finance-service";
import { apiError } from "@/lib/api-error";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const append = formData.get("append") === "true";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const csvText = await file.text();
    const result = await importCashbookFromCSV(csvText, append);

    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    return apiError("Failed to import CSV", 500, error);
  }
}
