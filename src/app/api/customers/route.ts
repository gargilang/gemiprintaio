import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db-unified";
import {
  createCustomer,
  deleteCustomer,
  getCustomerById,
  getCustomers,
  updateCustomer,
} from "@/lib/services/customers-service";

export async function GET() {
  try {
    const pelanggan = await getCustomers();
    return NextResponse.json({ pelanggan });
  } catch (error: any) {
    console.error("Error fetching pelanggan:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch pelanggan" },
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

    const dup = await db.queryRaw<{ id: string }>(
      "SELECT id FROM pelanggan WHERE nama = ? LIMIT 1",
      [nama.trim()]
    );
    if (dup.length > 0) {
      return NextResponse.json(
        { error: "Pelanggan dengan nama ini sudah ada" },
        { status: 400 }
      );
    }

    const customerType =
      nama_perusahaan && String(nama_perusahaan).trim()
        ? tipe_pelanggan || "perusahaan"
        : "perorangan";

    const created = await createCustomer({
      tipe_pelanggan: customerType,
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

    const customer = await getCustomerById(created.id);
    return NextResponse.json({ customer }, { status: 201 });
  } catch (error: any) {
    console.error("Error creating customer:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create customer" },
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

    const existing = await getCustomerById(id);
    if (!existing) {
      return NextResponse.json(
        { error: "Pelanggan tidak ditemukan" },
        { status: 404 }
      );
    }

    const dup = await db.queryRaw<{ id: string }>(
      "SELECT id FROM pelanggan WHERE nama = ? AND id != ? LIMIT 1",
      [nama.trim(), id]
    );
    if (dup.length > 0) {
      return NextResponse.json(
        { error: "Pelanggan dengan nama ini sudah ada" },
        { status: 400 }
      );
    }

    const customerType =
      nama_perusahaan && String(nama_perusahaan).trim()
        ? tipe_pelanggan || "perusahaan"
        : "perorangan";

    await updateCustomer(id, {
      tipe_pelanggan: customerType,
      nama: nama.trim(),
      nama_perusahaan: nama_perusahaan?.trim() || null,
      npwp: npwp?.trim() || null,
      email: email?.trim() || "",
      telepon: telepon?.trim() || "",
      alamat: alamat?.trim() || "",
      member_status: member_status ? 1 : 0,
    });

    const updatedCustomer = await getCustomerById(id);
    return NextResponse.json({ customer: updatedCustomer });
  } catch (error: any) {
    console.error("Error updating customer:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update customer" },
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

    const existing = await getCustomerById(id);
    if (!existing) {
      return NextResponse.json(
        { error: "Pelanggan tidak ditemukan" },
        { status: 404 }
      );
    }

    const used = await db.queryRaw<{ id: string }>(
      "SELECT id FROM penjualan WHERE pelanggan_id = ? LIMIT 1",
      [id]
    );
    if (used.length > 0) {
      return NextResponse.json(
        {
          error:
            "Pelanggan tidak dapat dihapus karena sudah memiliki transaksi penjualan",
        },
        { status: 400 }
      );
    }

    await deleteCustomer(id);
    return NextResponse.json({ message: "Pelanggan berhasil dihapus" });
  } catch (error: any) {
    console.error("Error deleting customer:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete customer" },
      { status: 500 }
    );
  }
}
