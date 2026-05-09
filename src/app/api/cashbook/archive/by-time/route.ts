import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db-unified";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const label = searchParams.get("label");
    const at = searchParams.get("at");

    if (!label || !at) {
      return NextResponse.json(
        { error: "Missing required params: label and at" },
        { status: 400 }
      );
    }

    const cashBooks =
      (await db.queryRaw(
        `SELECT * FROM keuangan 
         WHERE label_arsip = ? AND diarsipkan_pada = ?
         ORDER BY urutan_tampilan ASC, dibuat_pada ASC`,
        [label, at]
      )) || [];

    return NextResponse.json({ cashBooks });
  } catch (error: any) {
    console.error("Get archived(by-time) cashbooks error:", error);
    return NextResponse.json(
      { error: "Failed to get archived cashbooks", details: error.message },
      { status: 500 }
    );
  }
}
