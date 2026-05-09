import { NextRequest, NextResponse } from "next/server";

import { restoreArchivedTransactions } from "@/lib/services/reports-service";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { label, archived_at } = body;

    if (!label || !archived_at) {
      return NextResponse.json(
        { error: "label and archived_at are required" },
        { status: 400 }
      );
    }

    const result = await restoreArchivedTransactions(label, archived_at);

    return NextResponse.json({
      success: true,
      restored: result.restored,
      message: `Successfully restored transactions from "${label}"`,
    });
  } catch (error: any) {
    console.error("Restore archive error:", error);
    return NextResponse.json(
      { error: "Failed to restore archive", details: error.message },
      { status: 500 }
    );
  }
}
