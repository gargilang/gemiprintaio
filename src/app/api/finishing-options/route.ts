import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "database", "gemiprint.db");

// GET all active finishing options
export async function GET() {
  try {
    const db = new Database(dbPath);

    const options = db
      .prepare(
        `SELECT id, nama, urutan_tampilan 
         FROM opsi_finishing 
         WHERE aktif_status = 1 
         ORDER BY urutan_tampilan ASC, nama ASC`
      )
      .all();

    db.close();

    return NextResponse.json({
      success: true,
      options,
    });
  } catch (error: any) {
    console.error("Error fetching finishing options:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch finishing options",
      },
      { status: 500 }
    );
  }
}
