import { NextRequest, NextResponse } from "next/server";

import {
  archiveCashbook,
  getArchivedPeriods,
} from "@/lib/services/reports-service";
import { apiError } from "@/lib/api-error";

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
  } catch (error: unknown) {
    return apiError("Failed to archive transactions", 500, error);
  }
}

export async function GET(_request: NextRequest) {
  try {
    const archives = await getArchivedPeriods();
    return NextResponse.json({ archives });
  } catch (error: unknown) {
    return apiError("Failed to get archives", 500, error);
  }
}
