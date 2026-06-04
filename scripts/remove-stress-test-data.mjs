/**
 * Hapus semua data master stress-test (ID berawalan "stress-seed-").
 * TIDAK menyentuh baris yang dibuat pengguna (id UUID acak).
 *
 * Jalankan: npm run supabase:stress:remove
 */
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const PREFIX = "stress-seed";

async function removeViaRest() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const like = `${PREFIX}-%`;

  const hbs = await supabase
    .from("harga_barang_satuan")
    .delete()
    .like("id", like)
    .select("id");
  if (hbs.error) throw new Error(`harga_barang_satuan: ${hbs.error.message}`);

  const hbsByBarang = await supabase
    .from("harga_barang_satuan")
    .delete()
    .like("barang_id", like)
    .select("id");
  if (hbsByBarang.error) throw new Error(`harga_barang_satuan (barang): ${hbsByBarang.error.message}`);

  const brg = await supabase.from("barang").delete().like("id", like).select("id");
  if (brg.error) throw new Error(`barang: ${brg.error.message}`);

  const plg = await supabase.from("pelanggan").delete().like("id", like).select("id");
  if (plg.error) throw new Error(`pelanggan: ${plg.error.message}`);

  const vnd = await supabase.from("vendor").delete().like("id", like).select("id");
  if (vnd.error) throw new Error(`vendor: ${vnd.error.message}`);

  return {
    hbs: (hbs.data?.length || 0) + (hbsByBarang.data?.length || 0),
    brg: brg.data?.length || 0,
    plg: plg.data?.length || 0,
    vnd: vnd.data?.length || 0,
    mode: "rest",
  };
}

async function removeViaPg() {
  const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    await client.query("BEGIN");
    const pattern = `${PREFIX}-%`;

    const hbs = await client.query(
      `DELETE FROM harga_barang_satuan WHERE id LIKE $1 OR barang_id LIKE $1 RETURNING id`,
      [pattern]
    );
    const brg = await client.query(`DELETE FROM barang WHERE id LIKE $1 RETURNING id`, [pattern]);
    const plg = await client.query(`DELETE FROM pelanggan WHERE id LIKE $1 RETURNING id`, [pattern]);
    const vnd = await client.query(`DELETE FROM vendor WHERE id LIKE $1 RETURNING id`, [pattern]);

    await client.query("COMMIT");
    return {
      hbs: hbs.rowCount,
      brg: brg.rowCount,
      plg: plg.rowCount,
      vnd: vnd.rowCount,
      mode: "postgres",
    };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    await client.end();
  }
}

try {
  const hasRest =
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY;

  const result = hasRest ? await removeViaRest() : await removeViaPg();

  console.log(`Stress-test data dihapus (${result.mode}):`);
  console.log(`  - ${result.hbs} harga_barang_satuan`);
  console.log(`  - ${result.brg} barang`);
  console.log(`  - ${result.plg} pelanggan`);
  console.log(`  - ${result.vnd} vendor`);
  console.log("\nData pengguna (UUID) tidak terpengaruh.");
} catch (e) {
  if (e.message?.includes("foreign key") || e.code === "23503") {
    console.error(
      "Gagal hapus: ada transaksi yang masih mereferensi data stress-test.",
      "\nHapus transaksi terkait terlebih dahulu."
    );
  } else {
    console.error("Gagal hapus stress-test:", e.message);
  }
  process.exit(1);
}
