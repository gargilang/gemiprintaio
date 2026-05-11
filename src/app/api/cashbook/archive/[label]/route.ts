import { NextRequest, NextResponse } from "next/server";

import { db, getServerSupabaseClient } from "@/lib/db-unified";
import { fetchKeuanganByArchiveLabel } from "@/lib/server-data-supabase";
import { apiError } from "@/lib/api-error";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ label: string }> }
) {
  try {
    const { label: labelParam } = await params;
    const label = labelParam?.trim();

    if (getServerSupabaseClient()) {
      const cashBooks = await fetchKeuanganByArchiveLabel(label || "");
      return NextResponse.json({ cashBooks });
    }

    let cashBooks =
      (await db.queryRaw(
        `SELECT * FROM keuangan 
         WHERE label_arsip = ? 
         ORDER BY urutan_tampilan ASC, tanggal DESC, dibuat_pada DESC`,
        [label]
      )) || [];

    if (!cashBooks.length) {
      cashBooks =
        (await db.queryRaw(
          `SELECT * FROM keuangan 
           WHERE label_arsip LIKE ? 
           ORDER BY urutan_tampilan ASC, tanggal DESC, dibuat_pada DESC`,
          [label]
        )) || [];
    }

    return NextResponse.json({ cashBooks });
  } catch (error: unknown) {
    return apiError("Failed to get archived cashbooks", 500, error);
  }
}
