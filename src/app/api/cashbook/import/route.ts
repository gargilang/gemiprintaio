import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db-unified";
import { importCashbookFromCSV } from "@/lib/services/finance-service";

async function recalculateIfPossible(): Promise<void> {
  try {
    const sqlite = await db.getNativeSQLite();
    if (!sqlite) return;
    const { recalculateCashbook } = await import("@/lib/calculate-cashbook");
    await recalculateCashbook(sqlite);
  } catch (e) {
    console.warn("recalculateCashbook skipped:", e);
  }
}

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

    await recalculateIfPossible();

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Import error:", error);
    return NextResponse.json(
      { error: "Failed to import CSV", details: error.message },
      { status: 500 }
    );
  }
}
