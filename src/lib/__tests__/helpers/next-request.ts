import { NextRequest } from "next/server";

/**
 * Helper untuk membuat NextRequest palsu di unit test route handler.
 * Memanggil handler `route.ts` langsung tanpa server HTTP nyata.
 */
export function makeRequest(
  url: string,
  init?: { method?: string; body?: unknown; headers?: Record<string, string> }
): NextRequest {
  return new NextRequest(new URL(url, "http://localhost"), {
    method: init?.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
}
