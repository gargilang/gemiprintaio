import { NextRequest, NextResponse } from "next/server";

import {
  pelangganHasPenjualan,
  rowExistsEq,
} from "@/lib/duplicate-check";
import {
  createPelanggan,
  deletePelanggan,
  getPelangganById,
  getPelanggan,
  updatePelanggan,
} from "@/lib/services/customers-service";

export async function GET() {
  try {
    const pelanggan = await getPelanggan();
    return NextResponse.json({ pelanggan });
  } catch (error: any) {
    console.error("Gagal mengambil pelanggan:", error);
    return NextResponse.json(
      { error: error.message || "Gagal mengambil pelanggan" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      nama,
      email,
      telepon,
      alamat,
      nama_perusahaan,
      tipe_pelanggan,
      npwp,
      member_status,
    } = body;

    if (!nama || !nama.trim()) {
      return NextResponse.json(
        { error: "Nama pelanggan harus diisi" },
        { status: 400 }
      );
    }

    const dup = await rowExistsEq("pelanggan", "nama", nama.trim());
    if (dup) {
      return NextResponse.json(
        { error: "Pelanggan dengan nama ini sudah ada" },
        { status: 400 }
      );
    }

    const tipePelanggan =
      nama_perusahaan && String(nama_perusahaan).trim()
        ? tipe_pelanggan || "perusahaan"
        : "perorangan";

    const created = await createPelanggan({
      tipe_pelanggan: tipePelanggan,
      nama: nama.trim(),
      nama_perusahaan: nama_perusahaan?.trim() || null,
      npwp: npwp?.trim() || null,
      email: email?.trim() || "",
      telepon: telepon?.trim() || "",
      alamat: alamat?.trim() || "",
      member_status: member_status ? 1 : 0,
    });

    if (!created?.id) {
      return NextResponse.json(
        { error: "Gagal membuat pelanggan" },
        { status: 500 }
      );
    }

    const pelangganBaru = await getPelangganById(created.id);
    return NextResponse.json({ customer: pelangganBaru }, { status: 201 });
  } catch (error: any) {
    console.error("Gagal membuat pelanggan:", error);
    return NextResponse.json(
      { error: error.message || "Gagal membuat pelanggan" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      id,
      nama,
      email,
      telepon,
      alamat,
      nama_perusahaan,
      tipe_pelanggan,
      npwp,
      member_status,
    } = body;

    if (!id) {
      return NextResponse.json({ error: "ID tidak valid" }, { status: 400 });
    }

    if (!nama || !nama.trim()) {
      return NextResponse.json(
        { error: "Nama pelanggan harus diisi" },
        { status: 400 }
      );
    }

    const existing = await getPelangganById(id);
    if (!existing) {
      return NextResponse.json(
        { error: "Pelanggan tidak ditemukan" },
        { status: 404 }
      );
    }

    const dup = await rowExistsEq("pelanggan", "nama", nama.trim(), id);
    if (dup) {
      return NextResponse.json(
        { error: "Pelanggan dengan nama ini sudah ada" },
        { status: 400 }
      );
    }

    const tipePelanggan =
      nama_perusahaan && String(nama_perusahaan).trim()
        ? tipe_pelanggan || "perusahaan"
        : "perorangan";

    await updatePelanggan(id, {
      tipe_pelanggan: tipePelanggan,
      nama: nama.trim(),
      nama_perusahaan: nama_perusahaan?.trim() || null,
      npwp: npwp?.trim() || null,
      email: email?.trim() || "",
      telepon: telepon?.trim() || "",
      alamat: alamat?.trim() || "",
      member_status: member_status ? 1 : 0,
    });

    const pelangganDiperbarui = await getPelangganById(id);
    return NextResponse.json({ customer: pelangganDiperbarui });
  } catch (error: any) {
    console.error("Gagal memperbarui pelanggan:", error);
    return NextResponse.json(
      { error: error.message || "Gagal memperbarui pelanggan" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID tidak valid" }, { status: 400 });
    }

    const existing = await getPelangganById(id);
    if (!existing) {
      return NextResponse.json(
        { error: "Pelanggan tidak ditemukan" },
        { status: 404 }
      );
    }

    const used = await pelangganHasPenjualan(id);
    if (used) {
      return NextResponse.json(
        {
          error:
            "Pelanggan tidak dapat dihapus karena sudah memiliki transaksi penjualan",
        },
        { status: 400 }
      );
    }

    await deletePelanggan(id);
    return NextResponse.json({ message: "Pelanggan berhasil dihapus" });
  } catch (error: any) {
    console.error("Gagal menghapus pelanggan:", error);
    return NextResponse.json(
      { error: error.message || "Gagal menghapus pelanggan" },
      { status: 500 }
    );
  }
}
