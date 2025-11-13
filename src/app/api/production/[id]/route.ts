import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "database", "gemiprint.db");

// PATCH update production order status
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const body = await request.json();
    const { status } = body;
    const { id: orderId } = await params;

    if (!status) {
      return NextResponse.json(
        { success: false, error: "Status tidak boleh kosong" },
        { status: 400 }
      );
    }

    const db = new Database(dbPath);

    const updateData: any = {
      status,
      diperbarui_pada: new Date().toISOString(),
    };

    if (status === "SELESAI") {
      updateData.diselesaikan_pada = new Date().toISOString();
    }

    const fields = Object.keys(updateData)
      .map((key) => `${key} = ?`)
      .join(", ");
    const values = Object.values(updateData);

    db.prepare(`UPDATE order_produksi SET ${fields} WHERE id = ?`).run(
      ...values,
      orderId
    );

    db.close();

    return NextResponse.json({
      success: true,
      message: "Status order berhasil diperbarui",
    });
  } catch (error: any) {
    console.error("Error updating production order:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
