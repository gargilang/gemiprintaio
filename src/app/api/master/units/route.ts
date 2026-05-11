import { NextRequest, NextResponse } from "next/server";

import { rowExistsEq } from "@/lib/duplicate-check";
import {
  createUnit,
  getUnits,
  getUnitById,
} from "@/lib/services/master-service";

export async function GET() {
  try {
    const units = await getUnits();
    return NextResponse.json({ units });
  } catch (error: any) {
    console.error("Error fetching units:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch units" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { nama, urutan_tampilan } = body;

    if (!nama || !nama.trim()) {
      return NextResponse.json(
        { error: "Nama satuan harus diisi" },
        { status: 400 }
      );
    }

    const dup = await rowExistsEq("satuan_barang", "nama", nama.trim());
    if (dup) {
      return NextResponse.json(
        { error: "Satuan dengan nama ini sudah ada" },
        { status: 400 }
      );
    }

    const created = await createUnit({
      nama: nama.trim(),
      urutan_tampilan: urutan_tampilan || 0,
    });

    if (!created?.id) {
      return NextResponse.json(
        { error: "Gagal menambahkan satuan" },
        { status: 500 }
      );
    }

    const unit = await getUnitById(created.id);

    return NextResponse.json(
      { message: "Satuan berhasil ditambahkan", unit },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error creating unit:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create unit" },
      { status: 500 }
    );
  }
}
