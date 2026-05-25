import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { getTodayJakarta } from "@/lib/date-utils";
import {
  createPurchase,
  getPurchaseById,
  getPurchases,
} from "@/lib/services/purchases-service";

export async function GET(_req: NextRequest) {
  try {
    const purchasesWithItems = await getPurchases();
    return NextResponse.json({ purchases: purchasesWithItems });
  } catch (error: any) {
    console.error("Error fetching purchases:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch purchases" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      nomor_pembelian,
      nomor_faktur,
      vendor_id,
      tanggal,
      metode_pembayaran,
      catatan,
      items,
      dibuat_oleh,
    } = body;

    if (!nomor_faktur || !nomor_faktur.trim()) {
      return NextResponse.json(
        { error: "Nomor faktur harus diisi" },
        { status: 400 }
      );
    }

    if (!items || items.length === 0) {
      return NextResponse.json(
        { error: "Minimal harus ada 1 item pembelian" },
        { status: 400 }
      );
    }

    for (const item of items) {
      if (!item.barang_id) {
        return NextResponse.json(
          { error: "Setiap item harus memiliki barang" },
          { status: 400 }
        );
      }
      if (!item.jumlah || item.jumlah <= 0) {
        return NextResponse.json(
          { error: "Jumlah item harus lebih dari 0" },
          { status: 400 }
        );
      }
      if (!item.harga_satuan || item.harga_satuan < 0) {
        return NextResponse.json(
          { error: "Harga satuan harus valid" },
          { status: 400 }
        );
      }
    }

    const { id } = await createPurchase({
      nomor_pembelian,
      nomor_faktur,
      vendor_id: vendor_id || null,
      tanggal: tanggal || getTodayJakarta(),
      metode_pembayaran,
      catatan,
      dibuat_oleh,
      items: items.map((item: any) => ({
        barang_id: item.barang_id,
        harga_satuan_id: item.harga_satuan_id ?? null,
        nama_satuan: item.nama_satuan,
        faktor_konversi: item.faktor_konversi ?? 1,
        jumlah: item.jumlah,
        harga_satuan: item.harga_satuan,
        panjang: item.panjang ?? null,
        lebar: item.lebar ?? null,
      })),
    });

    const purchase = await getPurchaseById(id);

    return NextResponse.json(
      {
        message: "Pembelian berhasil ditambahkan",
        purchase,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error creating purchase:", error);
    const msg = error.message || "Failed to create purchase";
    const conflict = msg.includes("Nomor faktur sudah digunakan");
    return NextResponse.json(
      { error: msg },
      { status: conflict ? 400 : 500 }
    );
  }
}
