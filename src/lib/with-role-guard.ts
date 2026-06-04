import "server-only";
import { NextResponse } from "next/server";
import { AuthGuardError } from "./auth-guard-error";
import { logAudit, type AuditInput } from "./audit";

/**
 * Map AuthGuardError → NextResponse. Return null jika bukan guard error
 * (caller harus melempar ulang / tangani sebagai 500).
 */
export function toGuardResponse(error: unknown): NextResponse | null {
  if (error instanceof AuthGuardError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return null;
}

/**
 * Bungkus handler mutation: jalankan guard, lalu handler. Jika guard gagal,
 * balas status guard. Pakai di route POST/PUT/PATCH/DELETE.
 */
export function withRoleGuard<Ctx>(
  guard: () => Promise<{ uid: string; role: string }>,
  handler: (ctx: Ctx, session: { uid: string; role: string }) => Promise<NextResponse>
) {
  return async (ctx: Ctx): Promise<NextResponse> => {
    let session;
    try {
      session = await guard();
    } catch (e) {
      const guarded = toGuardResponse(e);
      if (guarded) return guarded;
      throw e;
    }
    return handler(ctx, session);
  };
}

/**
 * Tulis audit log best-effort setelah mutasi sensitif berhasil.
 */
export async function withAudit(input: AuditInput): Promise<void> {
  await logAudit(input);
}
