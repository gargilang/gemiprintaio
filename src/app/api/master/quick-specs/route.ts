import { NextRequest, NextResponse } from "next/server";

import { rowExistsCompositeEq } from "@/lib/duplicate-check";
import {
  createQuickSpec,
  getCategoryById,
  getQuickSpecRowById,
  listQuickSpecsWithCategory,
} from "@/lib/services/master-service";
import { requireAdminOrManager, AuthGuardError } from "@/lib/auth-guard-server";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const categoryId = searchParams.get("category_id");

    const specs = await listQuickSpecsWithCategory(categoryId);

    return NextResponse.json({ specs });
  } catch (error: any) {
    console.error("Error fetching quick specs:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch quick specs" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdminOrManager();
    const body = await req.json();
    const {
      kategori_id,
      tipe_spesifikasi,
      nilai_spesifikasi,
      urutan_tampilan,
    } = body;

    if (!kategori_id || !kategori_id.trim()) {
      return NextResponse.json(
        { error: "ID kategori harus diisi" },
        { status: 400 }
      );
    }

    if (!tipe_spesifikasi || !tipe_spesifikasi.trim()) {
      return NextResponse.json(
        { error: "Tipe spesifikasi harus diisi" },
        { status: 400 }
      );
    }

    if (!nilai_spesifikasi || !nilai_spesifikasi.trim()) {
      return NextResponse.json(
        { error: "Nilai spesifikasi harus diisi" },
        { status: 400 }
      );
    }

    const category = await getCategoryById(kategori_id);
    if (!category) {
      return NextResponse.json(
        { error: "Kategori tidak ditemukan" },
        { status: 404 }
      );
    }

    const dup = await rowExistsCompositeEq("spesifikasi_cepat_barang", [
      ["kategori_id", kategori_id],
      ["tipe_spesifikasi", tipe_spesifikasi.trim()],
      ["nilai_spesifikasi", nilai_spesifikasi.trim()],
    ]);
    if (dup) {
      return NextResponse.json(
        { error: "Spesifikasi ini sudah ada" },
        { status: 400 }
      );
    }

    const created = await createQuickSpec({
      kategori_id,
      tipe_spesifikasi: tipe_spesifikasi.trim(),
      nilai_spesifikasi: nilai_spesifikasi.trim(),
      urutan_tampilan: urutan_tampilan || 0,
    });

    if (!created?.id) {
      return NextResponse.json(
        { error: "Gagal menambahkan spesifikasi" },
        { status: 500 }
      );
    }

    const quickSpec = await getQuickSpecRowById(created.id);

    return NextResponse.json(
      {
        message: "Spesifikasi cepat berhasil ditambahkan",
        quickSpec,
      },
      { status: 201 }
    );
  } catch (error: any) {
    if (error instanceof AuthGuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error creating quick spec:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create quick spec" },
      { status: 500 }
    );
  }
}
