import { NextResponse } from "next/server";

export function apiError(
  message: string,
  status: number,
  originalError?: unknown
): NextResponse {
  if (originalError !== undefined) {
    console.error(`[${status}] ${message}:`, originalError);
  }
  return NextResponse.json({ error: message }, { status });
}
