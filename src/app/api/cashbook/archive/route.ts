import { NextRequest, NextResponse } from "next/server";

import {
  archiveCashbook,
  getArchivedPeriods,
} from "@/lib/services/reports-service";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { startDate, endDate, label } = body;

    if (!startDate || !endDate || !label) {
      return NextResponse.json(
        { error: "startDate, endDate, and label are required" },
        { status: 400 }
      );
    }

    const result = await archiveCashbook({ startDate, endDate, label });

    return NextResponse.json({
      success: true,
      archived: result.archived,
      message: `Successfully archived transactions as "${label}"`,
    });
  } catch (error: any) {
    console.error("Archive error:", error);
    return NextResponse.json(
      { error: "Failed to archive transactions", details: error.message },
      { status: 500 }
    );
  }
}

export async function GET(_request: NextRequest) {
  try {
    const archives = await getArchivedPeriods();
    return NextResponse.json({ archives });
  } catch (error: any) {
    console.error("Get archives error:", error);
    return NextResponse.json(
      { error: "Failed to get archives", details: error.message },
      { status: 500 }
    );
  }
}
