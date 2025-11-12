import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "database", "gemiprint.db");

export async function GET() {
  try {
    const db = new Database(dbPath);

    // Get all customers
    const customersStmt = db.prepare(`
      SELECT 
        id,
        tipe_pelanggan,
        nama,
        nama_perusahaan,
        npwp,
        email,
        telepon,
        alamat,
        member_status,
        dibuat_pada,
        diperbarui_pada
      FROM pelanggan
      ORDER BY nama ASC
    `);
    const customers = customersStmt.all();

    // Get all materials with their unit prices - sorted by frequency (most sold first)
    const materialsStmt = db.prepare(`
      SELECT 
        b.id,
        b.nama,
        b.deskripsi,
        b.kategori_id,
        b.subkategori_id,
        b.satuan_dasar,
        b.spesifikasi,
        b.jumlah_stok,
        b.level_stok_minimum,
        b.lacak_inventori_status,
        b.butuh_dimensi_status,
        b.frekuensi_terjual,
        b.dibuat_pada,
        b.diperbarui_pada,
        kb.nama as kategori_nama,
        sb.nama as subkategori_nama
      FROM barang b
      LEFT JOIN kategori_barang kb ON b.kategori_id = kb.id
      LEFT JOIN subkategori_barang sb ON b.subkategori_id = sb.id
      ORDER BY b.frekuensi_terjual DESC, b.nama ASC
    `);
    const materials = materialsStmt.all();

    // Get all unit prices for materials
    const unitPricesStmt = db.prepare(`
      SELECT 
        id,
        barang_id,
        nama_satuan,
        faktor_konversi,
        harga_beli,
        harga_jual,
        harga_member,
        default_status,
        urutan_tampilan
      FROM harga_barang_satuan
      ORDER BY barang_id, urutan_tampilan, nama_satuan
    `);
    const unitPrices = unitPricesStmt.all();

    // Group unit prices by material ID
    const unitPricesByMaterial: Record<string, any[]> = unitPrices.reduce(
      (acc: Record<string, any[]>, price: any) => {
        if (!acc[price.barang_id]) {
          acc[price.barang_id] = [];
        }
        acc[price.barang_id].push(price);
        return acc;
      },
      {}
    );

    // Attach unit prices to materials
    const materialsWithPrices = materials.map((material: any) => ({
      ...material,
      unit_prices: unitPricesByMaterial[material.id] || [],
    }));

    // Get all sales transactions with details
    const salesStmt = db.prepare(`
      SELECT 
        p.id,
        p.nomor_invoice,
        p.pelanggan_id,
        p.total_jumlah,
        p.jumlah_dibayar,
        p.jumlah_kembalian,
        p.metode_pembayaran,
        p.kasir_id,
        p.catatan,
        p.dibuat_pada,
        p.diperbarui_pada,
        pel.nama as pelanggan_nama,
        pel.member_status,
        prof.nama_pengguna as kasir_nama,
        CASE 
          WHEN pip.status IS NOT NULL THEN pip.status
          ELSE 'LUNAS'
        END as status_pembayaran,
        COALESCE(pip.sisa_piutang, 0) as sisa_piutang
      FROM penjualan p
      LEFT JOIN pelanggan pel ON p.pelanggan_id = pel.id
      LEFT JOIN profil prof ON p.kasir_id = prof.id
      LEFT JOIN piutang_penjualan pip ON p.id = pip.id_penjualan
      ORDER BY p.dibuat_pada DESC
      LIMIT 100
    `);
    const sales = salesStmt.all();

    // Get items for each sale
    const itemsStmt = db.prepare(`
      SELECT 
        ip.id,
        ip.penjualan_id,
        ip.barang_id,
        ip.harga_satuan_id,
        ip.jumlah,
        ip.nama_satuan,
        ip.faktor_konversi,
        ip.harga_satuan,
        ip.subtotal,
        b.nama as barang_nama
      FROM item_penjualan ip
      LEFT JOIN barang b ON ip.barang_id = b.id
      WHERE ip.penjualan_id = ?
    `);

    const salesWithItems = sales.map((sale: any) => ({
      ...sale,
      items: itemsStmt.all(sale.id),
    }));

    db.close();

    return NextResponse.json({
      success: true,
      customers,
      materials: materialsWithPrices,
      sales: salesWithItems,
    });
  } catch (error: any) {
    console.error("Error fetching POS init data:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch POS data" },
      { status: 500 }
    );
  }
}
