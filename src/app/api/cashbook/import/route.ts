import { NextRequest, NextResponse } from "next/server";

import { importCashbookFromCSV } from "@/lib/services/finance-service";
import { apiError } from "@/lib/api-error";
import { requireAdminOrManager, AuthGuardError } from "@/lib/auth-guard-server";

export async function POST(request: NextRequest) {
  try {
    await requireAdminOrManager();

    // Cegah CSRF: multipart/form-data adalah "simple request" (tanpa preflight),
    // jadi tolak request lintas-origin secara eksplisit.
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");
    if (origin && host && new URL(origin).host !== host) {
      return apiError("Origin tidak diizinkan", 403);
    }

    const len = Number(request.headers.get("content-length") || 0);
    if (len > 5 * 1024 * 1024) {
      return apiError("File terlalu besar (maks 5MB)", 413);
    }

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
    if (error instanceof AuthGuardError) {
      return apiError(error.message, error.status);
    }
    return apiError("Failed to import CSV", 500, error);
  }
}
