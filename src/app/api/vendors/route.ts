import { NextRequest, NextResponse } from "next/server";

import { requireSession, AuthGuardError } from "@/lib/auth-guard-server";
import { rowExistsEq, vendorHasPembelian } from "@/lib/duplicate-check";
import {
  createVendor,
  deleteVendor,
  getVendorById,
  getVendors,
  updateVendor,
} from "@/lib/services/vendors-service";

export async function GET() {
  try {
    const vendor = await getVendors();
    return NextResponse.json({ vendor });
  } catch (error: any) {
    console.error("Error fetching vendor:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch vendor" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireSession();
    const body = await req.json();
    const {
      nama_perusahaan,
      email,
      telepon,
      alamat,
      kontak_person,
      ketentuan_bayar,
      aktif_status,
      catatan,
    } = body;

    if (!nama_perusahaan || !nama_perusahaan.trim()) {
      return NextResponse.json(
        { error: "Nama perusahaan harus diisi" },
        { status: 400 }
      );
    }

    const dup = await rowExistsEq(
      "vendor",
      "nama_perusahaan",
      nama_perusahaan.trim()
    );
    if (dup) {
      return NextResponse.json(
        { error: "Vendor dengan nama perusahaan ini sudah ada" },
        { status: 400 }
      );
    }

    const created = await createVendor({
      nama_perusahaan: nama_perusahaan.trim(),
      email: email?.trim() || "",
      telepon: telepon?.trim() || "",
      alamat: alamat?.trim() || "",
      kontak_person: kontak_person?.trim() || null,
      ketentuan_bayar: ketentuan_bayar?.trim() || null,
      aktif_status: aktif_status !== undefined ? (aktif_status ? 1 : 0) : 1,
      catatan: catatan?.trim() || null,
    });

    if (!created?.id) {
      return NextResponse.json(
        { error: "Gagal membuat vendor" },
        { status: 500 }
      );
    }

    const vendor = await getVendorById(created.id);
    return NextResponse.json({ vendor }, { status: 201 });
  } catch (error: any) {
    if (error instanceof AuthGuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error creating vendor:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create vendor" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      id,
      nama_perusahaan,
      email,
      telepon,
      alamat,
      kontak_person,
      ketentuan_bayar,
      aktif_status,
      catatan,
    } = body;

    if (!id) {
      return NextResponse.json({ error: "ID tidak valid" }, { status: 400 });
    }

    if (!nama_perusahaan || !nama_perusahaan.trim()) {
      return NextResponse.json(
        { error: "Nama perusahaan harus diisi" },
        { status: 400 }
      );
    }

    const existing = await getVendorById(id);
    if (!existing) {
      return NextResponse.json(
        { error: "Vendor tidak ditemukan" },
        { status: 404 }
      );
    }

    const dup = await rowExistsEq(
      "vendor",
      "nama_perusahaan",
      nama_perusahaan.trim(),
      id
    );
    if (dup) {
      return NextResponse.json(
        { error: "Vendor dengan nama perusahaan ini sudah ada" },
        { status: 400 }
      );
    }

    await updateVendor(id, {
      nama_perusahaan: nama_perusahaan.trim(),
      email: email?.trim() || "",
      telepon: telepon?.trim() || "",
      alamat: alamat?.trim() || "",
      kontak_person: kontak_person?.trim() || null,
      ketentuan_bayar: ketentuan_bayar?.trim() || null,
      aktif_status: aktif_status !== undefined ? (aktif_status ? 1 : 0) : 1,
      catatan: catatan?.trim() || null,
    });

    const updatedVendor = await getVendorById(id);
    return NextResponse.json({ vendor: updatedVendor });
  } catch (error: any) {
    console.error("Error updating vendor:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update vendor" },
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

    const existing = await getVendorById(id);
    if (!existing) {
      return NextResponse.json(
        { error: "Vendor tidak ditemukan" },
        { status: 404 }
      );
    }

    const used = await vendorHasPembelian(id);
    if (used) {
      return NextResponse.json(
        {
          error:
            "Vendor tidak dapat dihapus karena sudah memiliki transaksi pembelian",
        },
        { status: 400 }
      );
    }

    await deleteVendor(id);
    return NextResponse.json({ message: "Vendor berhasil dihapus" });
  } catch (error: any) {
    console.error("Error deleting vendor:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete vendor" },
      { status: 500 }
    );
  }
}
