/**
 * API Route: /api/backup/create
 * Manually trigger a backup
 */

import { NextResponse } from "next/server";
import { createBackup } from "@/lib/database-backup";

export async function POST() {
  try {
    const success = createBackup();

    if (success) {
      return NextResponse.json({
        success: true,
        message: "Backup created successfully",
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to create backup",
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Error creating backup:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to create backup",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
