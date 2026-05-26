import "server-only";

import { db } from "@/lib/db-unified";

export function todayJakarta(): string {
  return new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Jakarta",
  });
}

export function positiveNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function numeric(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function generateDailyDocumentNumber(
  table: string,
  column: string,
  prefix: string,
  tanggal: string = todayJakarta()
): Promise<string> {
  const datePart = tanggal.replace(/-/g, "");
  const marker = `${prefix}-${datePart}-`;
  const result = await db.query<Record<string, unknown>>(table, {
    orderBy: { column, ascending: false },
    limit: 200,
  });
  if (result.error) throw result.error;

  let maxSeq = 0;
  for (const row of result.data || []) {
    const value = String(row[column] || "");
    if (!value.startsWith(marker)) continue;
    const seq = Number.parseInt(value.slice(marker.length), 10);
    if (Number.isFinite(seq)) maxSeq = Math.max(maxSeq, seq);
  }

  return `${marker}${String(maxSeq + 1).padStart(3, "0")}`;
}

