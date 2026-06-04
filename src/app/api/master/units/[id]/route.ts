import { NextRequest, NextResponse } from "next/server";

import { requireAdminOrManager, AuthGuardError } from "@/lib/auth-guard-server";
import { rowExistsEq } from "@/lib/duplicate-check";
import {
  deleteUnit,
  getUnitById,
  updateUnit,
} from "@/lib/services/master-service";

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  try {
    await requireAdminOrManager();
    const body = await req.json();
    const { nama, urutan_tampilan } = body;

    if (!nama || !nama.trim()) {
      return NextResponse.json(
        { error: "Nama satuan harus diisi" },
        { status: 400 }
      );
    }

    const existing = await getUnitById(params.id);

    if (!existing) {
      return NextResponse.json(
        { error: "Satuan tidak ditemukan" },
        { status: 404 }
      );
    }

    const dup = await rowExistsEq(
      "satuan_barang",
      "nama",
      nama.trim(),
      params.id
    );
    if (dup) {
      return NextResponse.json(
        { error: "Satuan dengan nama ini sudah ada" },
        { status: 400 }
      );
    }

    await updateUnit(params.id, {
      nama: nama.trim(),
      urutan_tampilan: urutan_tampilan || 0,
    });

    const updatedUnit = await getUnitById(params.id);

    return NextResponse.json({
      message: "Satuan berhasil diupdate",
      unit: updatedUnit,
    });
  } catch (error: any) {
    if (error instanceof AuthGuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error updating unit:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update unit" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  try {
    await requireAdminOrManager();
    const existing = await getUnitById(params.id);

    if (!existing) {
      return NextResponse.json(
        { error: "Satuan tidak ditemukan" },
        { status: 404 }
      );
    }

    await deleteUnit(params.id);

    return NextResponse.json({ message: "Satuan berhasil dihapus" });
  } catch (error: any) {
    if (error instanceof AuthGuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error deleting unit:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete unit" },
      { status: 500 }
    );
  }
}
