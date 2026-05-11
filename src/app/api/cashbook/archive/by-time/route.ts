import { NextRequest, NextResponse } from "next/server";

import { db, getServerSupabaseClient } from "@/lib/db-unified";
import { fetchKeuanganByArchiveLabelAndTime } from "@/lib/server-data-supabase";
import { apiError } from "@/lib/api-error";

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

    if (getServerSupabaseClient()) {
      const cashBooks = await fetchKeuanganByArchiveLabelAndTime(label, at);
      return NextResponse.json({ cashBooks });
    }

    const cashBooks =
      (await db.queryRaw(
        `SELECT * FROM keuangan 
         WHERE label_arsip = ? AND diarsipkan_pada = ?
         ORDER BY urutan_tampilan ASC, dibuat_pada ASC`,
        [label, at]
      )) || [];

    return NextResponse.json({ cashBooks });
  } catch (error: unknown) {
    return apiError("Failed to get archived cashbooks", 500, error);
  }
}
