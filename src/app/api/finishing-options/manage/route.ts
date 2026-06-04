import { NextResponse } from "next/server";
import { requireAdminOrManager, AuthGuardError } from "@/lib/auth-guard-server";
import {
  createFinishingOption,
  deleteFinishingOption,
  getFinishingOptions,
  reorderFinishingOptions,
  updateFinishingOption,
} from "@/lib/services/finishing-options-service";

export async function GET() {
  try {
    const options = await getFinishingOptions();
    return NextResponse.json({
      success: true,
      options,
    });
  } catch (error: any) {
    console.error("Error fetching finishing options:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch finishing options",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminOrManager();
    const body = await request.json();
    const { nama } = body;

    if (!nama || !nama.trim()) {
      return NextResponse.json(
        { success: false, error: "Nama opsi tidak boleh kosong" },
        { status: 400 }
      );
    }

    await createFinishingOption({ nama });

    return NextResponse.json({
      success: true,
      message: "Opsi finishing berhasil ditambahkan",
    });
  } catch (error: any) {
    if (error instanceof AuthGuardError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error("Error creating finishing option:", error);
    const msg = error.message || "Failed to create finishing option";
    const clientError =
      msg.includes("kosong") ||
      msg.includes("sudah ada") ||
      msg.includes("tidak boleh");
    return NextResponse.json(
      { success: false, error: msg },
      { status: clientError ? 400 : 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    await requireAdminOrManager();
    const body = await request.json();
    const { id, nama } = body;

    if (!id || !nama || !nama.trim()) {
      return NextResponse.json(
        { success: false, error: "ID dan nama tidak boleh kosong" },
        { status: 400 }
      );
    }

    await updateFinishingOption(id, { nama });

    return NextResponse.json({
      success: true,
      message: "Opsi finishing berhasil diperbarui",
    });
  } catch (error: any) {
    if (error instanceof AuthGuardError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error("Error updating finishing option:", error);
    const msg = error.message || "Failed to update finishing option";
    const clientError =
      msg.includes("kosong") ||
      msg.includes("sudah ada") ||
      msg.includes("tidak boleh");
    return NextResponse.json(
      { success: false, error: msg },
      { status: clientError ? 400 : 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdminOrManager();
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "ID tidak boleh kosong" },
        { status: 400 }
      );
    }

    await deleteFinishingOption(id);

    return NextResponse.json({
      success: true,
      message: "Opsi finishing berhasil dihapus",
    });
  } catch (error: any) {
    if (error instanceof AuthGuardError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error("Error deleting finishing option:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to delete finishing option",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { updates } = body;

    if (!updates || !Array.isArray(updates)) {
      return NextResponse.json(
        { success: false, error: "Updates array tidak valid" },
        { status: 400 }
      );
    }

    await reorderFinishingOptions(updates);

    return NextResponse.json({
      success: true,
      message: "Urutan berhasil diperbarui",
    });
  } catch (error: any) {
    console.error("Error updating finishing option order:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to update order",
      },
      { status: 500 }
    );
  }
}
