import { NextResponse } from "next/server";

import { AuthGuardError, requireSession } from "@/lib/auth-guard-server";
import { listPendingMaklon } from "@/lib/services/pending-maklon-service";

export async function GET() {
  try {
    await requireSession();
    const pending = await listPendingMaklon();
    return NextResponse.json({ pending });
  } catch (error: any) {
    if (error instanceof AuthGuardError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("Error fetching pending maklon:", error);
    return NextResponse.json(
      { error: error.message || "Gagal memuat pending maklon" },
      { status: 500 },
    );
  }
}