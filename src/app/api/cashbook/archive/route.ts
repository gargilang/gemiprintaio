import { NextRequest, NextResponse } from "next/server";

import {
  archiveCashbook,
  getArchivedPeriods,
} from "@/lib/services/reports-service";
import { apiError } from "@/lib/api-error";
import { requireAdminOrManager, AuthGuardError } from "@/lib/auth-guard-server";

export async function POST(request: NextRequest) {
  try {
    await requireAdminOrManager();
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
    if (error instanceof AuthGuardError) {
      return apiError(error.message, error.status);
    }
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
