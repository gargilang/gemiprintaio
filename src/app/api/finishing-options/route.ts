import { NextResponse } from "next/server";

import { getActiveFinishingOptions } from "@/lib/services/finishing-options-service";

export async function GET() {
  try {
    const rows = await getActiveFinishingOptions();
    const options = rows.map(({ id, nama, urutan_tampilan }) => ({
      id,
      nama,
      urutan_tampilan,
    }));

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
