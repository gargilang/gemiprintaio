import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "database", "gemiprint.db");

// PATCH update production item status
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const body = await request.json();
    const { status, operator_id } = body;
    const { itemId } = await params;

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

    if (operator_id) {
      updateData.operator_id = operator_id;
    }

    if (status === "PRINTING" || status === "FINISHING") {
      if (!updateData.mulai_proses) {
        updateData.mulai_proses = new Date().toISOString();
      }
    }

    if (status === "SELESAI") {
      updateData.selesai_proses = new Date().toISOString();
    }

    const fields = Object.keys(updateData)
      .map((key) => `${key} = ?`)
      .join(", ");
    const values = Object.values(updateData);

    db.prepare(`UPDATE item_produksi SET ${fields} WHERE id = ?`).run(
      ...values,
      itemId
    );

    db.close();

    return NextResponse.json({
      success: true,
      message: "Status item berhasil diperbarui",
    });
  } catch (error: any) {
    console.error("Error updating production item:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
