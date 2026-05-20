/**
 * /api/actor-roles — list + create user-defined roles for business_actors.
 */

import { NextRequest, NextResponse } from "next/server";

import {
  createActorRole,
  listActorRoles,
  type RoleGroup,
} from "@/lib/services/business-actor-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const roles = await listActorRoles();
    return NextResponse.json({ roles });
  } catch (error) {
    console.error("GET /api/actor-roles error:", error);
    return NextResponse.json(
      { error: "Gagal memuat daftar peran" },
      { status: 500 }
    );
  }
}

const VALID_GROUPS: ReadonlySet<RoleGroup> = new Set([
  "owner",
  "management",
  "sales",
  "staff",
  "other",
]);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const code = String(body?.role_code ?? "").trim();
    const label = String(body?.role_label ?? "").trim();
    const groupRaw = String(body?.role_group ?? "other");
    const group: RoleGroup = VALID_GROUPS.has(groupRaw as RoleGroup)
      ? (groupRaw as RoleGroup)
      : "other";

    if (!code) {
      return NextResponse.json(
        { error: "Kode peran wajib diisi" },
        { status: 400 }
      );
    }
    if (!label) {
      return NextResponse.json(
        { error: "Nama peran wajib diisi" },
        { status: 400 }
      );
    }

    const result = await createActorRole({
      role_code: code,
      role_label: label,
      role_group: group,
      description: body?.description ?? null,
    });

    if (result.error) {
      return NextResponse.json(
        { error: result.error.message },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: true, id: result.id });
  } catch (error) {
    console.error("POST /api/actor-roles error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Gagal menambah peran" },
      { status: 500 }
    );
  }
}
