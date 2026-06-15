import "server-only";

import { db } from "@/lib/db-unified";

/**
 * Ambil baris dari `table` yang `id`-nya ada di `ids`, kembalikan Map id→baris.
 * Satu query batch via `where { id: [...] }` (IN) — menghapus N+1 (dulu 1
 * queryOne per id). `ids` di-dedupe; set kosong men-skip query. Bila `select`
 * diberikan, kolom `id` otomatis ikut agar Map bisa dibangun. Pemanggil yang
 * membatch >999 id harus chunk dulu (batas variabel SQLite).
 */
export async function buildLookupMap<T = any>(
  table: string,
  ids: Iterable<string>,
  select?: string
): Promise<Map<string, T>> {
  const idList = [...new Set(ids)].filter(Boolean) as string[];
  const map = new Map<string, T>();
  if (idList.length === 0) return map;

  let selectClause: string | undefined;
  if (select) {
    const cols = select.split(",").map((c) => c.trim());
    selectClause = cols.includes("id") ? select : `id,${select}`;
  }

  const res = await db.query<T>(table, {
    where: { id: idList },
    ...(selectClause ? { select: selectClause } : {}),
  });
  if (res.error) throw res.error;
  for (const row of (res.data || []) as any[]) {
    if (row?.id) map.set(row.id, row as T);
  }
  return map;
}

/**
 * Ambil baris anak dari `table` yang nilai `fkColumn`-nya ada di `parentIds`,
 * lalu kelompokkan jadi Map parentId→baris[]. Satu query batch via
 * `where { [fkColumn]: [...] }` (IN) — menggantikan full-table scan + filter.
 * Tidak memakai `select` karena pemanggil butuh seluruh kolom baris anak.
 * Pemanggil yang membatch >999 id harus chunk dulu (batas variabel SQLite).
 */
export async function fetchChildrenByForeignKey<T = any>(
  table: string,
  fkColumn: string,
  parentIds: Iterable<string>
): Promise<Map<string, T[]>> {
  const idList = [...new Set(parentIds)].filter(Boolean) as string[];
  const map = new Map<string, T[]>();
  if (idList.length === 0) return map;

  const res = await db.query<T>(table, { where: { [fkColumn]: idList } });
  if (res.error) throw res.error;
  for (const row of (res.data || []) as any[]) {
    const key = row[fkColumn];
    const list = map.get(key) || [];
    list.push(row as T);
    map.set(key, list);
  }
  return map;
}
