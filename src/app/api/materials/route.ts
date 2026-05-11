import { NextRequest, NextResponse } from "next/server";

import { rowExistsEq } from "@/lib/duplicate-check";
import {
  createMaterial,
  getMaterialById,
  getMaterials,
} from "@/lib/services/materials-service";

export async function GET() {
  try {
    const barang = await getMaterials();
    return NextResponse.json({ barang });
  } catch (error: any) {
    console.error("Error fetching materials:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch materials" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
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

    if (!nama || !nama.trim()) {
      return NextResponse.json(
        { error: "Nama barang harus diisi" },
        { status: 400 }
      );
    }

    if (!satuan_dasar || !satuan_dasar.trim()) {
      return NextResponse.json(
        { error: "Satuan dasar harus diisi" },
        { status: 400 }
      );
    }

    if (!unit_prices || unit_prices.length === 0) {
      return NextResponse.json(
        { error: "Minimal harus ada 1 harga satuan" },
        { status: 400 }
      );
    }

    const dup = await rowExistsEq("barang", "nama", nama.trim());
    if (dup) {
      return NextResponse.json(
        { error: "Barang dengan nama ini sudah ada" },
        { status: 400 }
      );
    }

    const mappedPrices = unit_prices.map((up: any, index: number) => ({
      nama_satuan: up.nama_satuan,
      faktor_konversi: up.faktor_konversi ?? 1,
      harga_jual: up.harga_jual ?? 0,
      harga_member: up.harga_member ?? 0,
      harga_beli: up.harga_beli ?? 0,
      default_status: up.default_status,
      urutan_tampilan: up.urutan_tampilan ?? index,
    }));

    const created = await createMaterial({
      nama: nama.trim(),
      deskripsi: deskripsi?.trim() || null,
      kategori_id: kategori_id || null,
      subkategori_id: subkategori_id || null,
      satuan_dasar: satuan_dasar.trim(),
      spesifikasi: spesifikasi?.trim() || null,
      jumlah_stok: jumlah_stok || 0,
      level_stok_minimum: level_stok_minimum || 0,
      lacak_inventori_status: lacak_inventori_status !== false,
      butuh_dimensi_status: !!butuh_dimensi_status,
      unit_prices: mappedPrices,
    });

    if (!created?.id) {
      return NextResponse.json(
        { error: "Gagal menambahkan barang" },
        { status: 500 }
      );
    }

    const material = await getMaterialById(created.id);
    return NextResponse.json(
      {
        message: "Barang berhasil ditambahkan",
        material,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error creating material:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create material" },
      { status: 500 }
    );
  }
}
