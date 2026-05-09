import { NextRequest, NextResponse } from "next/server";

import {
  deleteMaterial,
  getMaterialById,
  updateMaterial,
} from "@/lib/services/materials-service";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const material = await getMaterialById(params.id);

    if (!material) {
      return NextResponse.json(
        { error: "Barang tidak ditemukan" },
        { status: 404 }
      );
    }

    return NextResponse.json({ material });
  } catch (error: any) {
    console.error("Error fetching material:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch material" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const body = await req.json();
    const {
      nama,
      deskripsi,
      kategori_id,
      subkategori_id,
      satuan_dasar,
      spesifikasi,
      jumlah_stok,
      level_stok_minimum,
      lacak_inventori_status,
      butuh_dimensi_status,
      unit_prices,
    } = body;

    const existing = await getMaterialById(params.id);
    if (!existing) {
      return NextResponse.json(
        { error: "Material tidak ditemukan" },
        { status: 404 }
      );
    }

    const payload: Parameters<typeof updateMaterial>[1] = {
      nama: nama?.trim() ?? existing.nama,
      deskripsi: deskripsi?.trim() || null,
      kategori_id: kategori_id || null,
      subkategori_id: subkategori_id || null,
      satuan_dasar: satuan_dasar?.trim() ?? existing.satuan_dasar,
      spesifikasi: spesifikasi?.trim() || null,
      jumlah_stok: jumlah_stok ?? existing.jumlah_stok,
      level_stok_minimum: level_stok_minimum ?? existing.level_stok_minimum,
      lacak_inventori_status: lacak_inventori_status !== false ? 1 : 0,
      butuh_dimensi_status: butuh_dimensi_status ? 1 : 0,
    };

    if (unit_prices !== undefined && Array.isArray(unit_prices)) {
      payload.unit_prices = unit_prices.map((up: any, index: number) => ({
        id: up.id,
        nama_satuan: up.nama_satuan,
        faktor_konversi: up.faktor_konversi ?? 1,
        harga_beli: up.harga_beli ?? 0,
        harga_jual: up.harga_jual ?? 0,
        harga_member: up.harga_member ?? 0,
        default_status: up.default_status ? 1 : 0,
        urutan_tampilan: up.urutan_tampilan ?? index,
      }));
    }

    await updateMaterial(params.id, payload);

    const material = await getMaterialById(params.id);
    return NextResponse.json({
      message: "Barang berhasil diupdate",
      material,
    });
  } catch (error: any) {
    console.error("Error updating material:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update material" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const existing = await getMaterialById(params.id);

    if (!existing) {
      return NextResponse.json(
        { error: "Barang tidak ditemukan" },
        { status: 404 }
      );
    }

    await deleteMaterial(params.id);

    return NextResponse.json({
      message: "Barang berhasil dihapus",
    });
  } catch (error: any) {
    console.error("Error deleting material:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete material" },
      { status: 500 }
    );
  }
}
