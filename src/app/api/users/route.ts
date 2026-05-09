import { NextRequest, NextResponse } from "next/server";
import { createUser, getUser, getUsers } from "@/lib/services/users-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const users = await getUsers();
    return NextResponse.json({ users });
  } catch (error) {
    console.error("GET /api/users error:", error);
    return NextResponse.json({ error: "Gagal memuat users" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const {
      nama_pengguna,
      email,
      nama_lengkap,
      password,
      role = "user",
      aktif_status = 1,
    } = await request.json();

    const { id } = await createUser({
      nama_pengguna,
      email,
      nama_lengkap,
      password,
      role,
      aktif_status,
    });

    const user = await getUser(id);
    return NextResponse.json({ success: true, user }, { status: 201 });
  } catch (error: any) {
    const message = error?.message || "Gagal menambah user";
    if (
      message.includes("wajib") ||
      message.includes("Nama pengguna") ||
      message.includes("Email")
    ) {
      return NextResponse.json(
        { error: message },
        { status: message.includes("wajib") ? 400 : 409 }
      );
    }
    console.error("POST /api/users error:", error);
    return NextResponse.json({ error: "Gagal menambah user" }, { status: 500 });
  }
}
