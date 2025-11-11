import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { getDatabaseAsync } from "@/lib/sqlite-db";

/**
 * Aggregate endpoint untuk purchases page
 * Menggabungkan semua data yang dibutuhkan dalam 1 request
 * Mengurangi 8 API calls menjadi 1 API call
 */
export async function GET(req: NextRequest) {
  try {
    const db = await getDatabaseAsync();

    // Parallel queries untuk speed
    const [purchases, materials, vendors, categories, subcategories, units] =
      await Promise.all([
        // 1. Get all purchases with vendor info
        Promise.resolve(
          db
            .prepare(
              `
            SELECT 
              p.*,
              v.nama_perusahaan as vendor_name,
              profil.nama_lengkap as created_by_name
            FROM pembelian p
            LEFT JOIN vendor v ON p.vendor_id = v.id
            LEFT JOIN profil ON p.dibuat_oleh = profil.id
            ORDER BY p.dibuat_pada DESC
          `
            )
            .all()
        ),

        // 2. Get all materials
        Promise.resolve(
          db
            .prepare(
              `SELECT 
              b.*,
              k.nama as kategori_nama,
              sk.nama as subkategori_nama
            FROM barang b
            LEFT JOIN kategori_barang k ON b.kategori_id = k.id
            LEFT JOIN subkategori_barang sk ON b.subkategori_id = sk.id
            ORDER BY b.nama ASC`
            )
            .all()
        ),

        // 3. Get all vendors
        Promise.resolve(
          db
            .prepare(
              `SELECT * FROM vendor WHERE aktif_status = 1 ORDER BY nama_perusahaan ASC`
            )
            .all()
        ),

        // 4. Get all categories
        Promise.resolve(
          db
            .prepare(
              `SELECT * FROM kategori_barang ORDER BY urutan_tampilan ASC, nama ASC`
            )
            .all()
        ),

        // 5. Get all subcategories
        Promise.resolve(
          db
            .prepare(
              `SELECT * FROM subkategori_barang ORDER BY urutan_tampilan ASC, nama ASC`
            )
            .all()
        ),

        // 6. Get all units
        Promise.resolve(
          db
            .prepare(
              `SELECT * FROM satuan_barang ORDER BY urutan_tampilan ASC, nama ASC`
            )
            .all()
        ),
      ]);

    // Get items for each purchase (batch query)
    const purchaseIds = (purchases as any[]).map((p: any) => p.id);
    const allItems =
      purchaseIds.length > 0
        ? db
            .prepare(
              `
          SELECT 
            ip.*,
            b.nama as nama_barang,
            ip.harga_satuan_id as id_satuan,
            ip.nama_satuan,
            ip.faktor_konversi,
            ip.harga_satuan as harga_beli
          FROM item_pembelian ip
          LEFT JOIN barang b ON ip.barang_id = b.id
          WHERE ip.pembelian_id IN (${purchaseIds.map(() => "?").join(",")})
        `
            )
            .all(...purchaseIds)
        : [];

    // Group items by purchase_id
    const itemsByPurchase = (allItems as any[]).reduce(
      (acc: any, item: any) => {
        if (!acc[item.pembelian_id]) {
          acc[item.pembelian_id] = [];
        }
        acc[item.pembelian_id].push(item);
        return acc;
      },
      {}
    );

    // Attach items to purchases
    const purchasesWithItems = (purchases as any[]).map((purchase: any) => {
      const items = itemsByPurchase[purchase.id] || [];
      const total_harga = items.reduce(
        (sum: number, item: any) =>
          sum + (item.subtotal || item.jumlah * item.harga_satuan),
        0
      );

      return {
        ...purchase,
        items,
        total_harga,
      };
    });

    // Get material unit prices
    const materialIds = (materials as any[]).map((m: any) => m.id);
    const allUnitPrices =
      materialIds.length > 0
        ? db
            .prepare(
              `
          SELECT * FROM harga_barang_satuan 
          WHERE barang_id IN (${materialIds.map(() => "?").join(",")})
          ORDER BY urutan_tampilan ASC
        `
            )
            .all(...materialIds)
        : [];

    // Group unit prices by material_id
    const unitPricesByMaterial = (allUnitPrices as any[]).reduce(
      (acc: any, price: any) => {
        if (!acc[price.barang_id]) {
          acc[price.barang_id] = [];
        }
        acc[price.barang_id].push(price);
        return acc;
      },
      {}
    );

    // Attach unit prices to materials
    const materialsWithPrices = (materials as any[]).map((material: any) => ({
      ...material,
      unit_prices: unitPricesByMaterial[material.id] || [],
    }));

    return NextResponse.json({
      purchases: purchasesWithItems,
      materials: materialsWithPrices,
      vendors,
      categories,
      subcategories,
      units,
    });
  } catch (error: any) {
    console.error("Error fetching purchases init data:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch data" },
      { status: 500 }
    );
  }
}
