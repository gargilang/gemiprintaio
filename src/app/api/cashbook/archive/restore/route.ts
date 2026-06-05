import { NextRequest, NextResponse } from "next/server";

import { restoreArchivedTransactions } from "@/lib/services/reports-service";
import { apiError } from "@/lib/api-error";
import { requireAdminOrManager, AuthGuardError } from "@/lib/auth-guard-server";

export async function POST(request: NextRequest) {
  try {
    await requireAdminOrManager();
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
  } catch (error: unknown) {
    if (error instanceof AuthGuardError) {
      return apiError(error.message, error.status);
    }
    return apiError("Failed to restore archive", 500, error);
  }
}
