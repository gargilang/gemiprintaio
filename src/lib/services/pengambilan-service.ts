import { db } from "@/lib/db-unified";

export interface PengambilanRow {
  order_id: string;
  nomor_spk: string;
  nomor_faktur: string;
  pelanggan_nama: string;
  item_ringkas: string;
  jumlah_item: number;
  total_jumlah: number;
  jumlah_dibayar: number;
  sisa_piutang: number;
  status_bayar: "LUNAS" | "PIUTANG" | "SEBAGIAN";
  piutang_id: string | null;
  penjualan_id: string;
}

function ringkasItem(items: { barang_nama?: string | null }[]): {
  item_ringkas: string;
  jumlah_item: number;
} {
  const jumlah_item = items.length;
  if (jumlah_item === 0) {
    return { item_ringkas: "-", jumlah_item: 0 };
  }
  const nama = items
    .map((i) => String(i.barang_nama || "Item"))
    .slice(0, 3)
    .join(", ");
  const suffix = jumlah_item > 3 ? ` +${jumlah_item - 3} lainnya` : "";
  const item_ringkas =
    nama.length > 60 ? `${nama.slice(0, 57)}...${suffix}` : `${nama}${suffix}`;
  return { item_ringkas, jumlah_item };
}

function hitungStatusBayar(
  total: number,
  dibayar: number,
  sisaPiutang: number,
  adaPiutangAktif: boolean,
): PengambilanRow["status_bayar"] {
  if (sisaPiutang <= 0 && !adaPiutangAktif) return "LUNAS";
  if (dibayar > 0 && sisaPiutang > 0) return "SEBAGIAN";
  return "PIUTANG";
}

async function enrichPengambilanRows(
  orders: any[],
): Promise<PengambilanRow[]> {
  if (orders.length === 0) return [];

  const penjualanIds = [
    ...new Set(orders.map((o) => o.penjualan_id).filter(Boolean)),
  ];
  const orderIds = orders.map((o) => o.id);

  const [penjualanRes, pelangganRes, piutangRes, itemsRes] = await Promise.all([
    penjualanIds.length
      ? db.query<any>("penjualan", { where: { id: penjualanIds } })
      : Promise.resolve({ data: [], error: null }),
    db.query<any>("pelanggan"),
    penjualanIds.length
      ? db.query<any>("piutang_penjualan", {
          where: { id_penjualan: penjualanIds },
        })
      : Promise.resolve({ data: [], error: null }),
    db.query<any>("item_produksi", { where: { order_produksi_id: orderIds } }),
  ]);

  const penjualanById = new Map(
    (penjualanRes.data || []).map((p: any) => [p.id, p]),
  );
  const pelangganById = new Map(
    (pelangganRes.data || []).map((p: any) => [p.id, p]),
  );
  const piutangByPenjualan = new Map<string, any[]>();
  for (const row of (piutangRes.data || []) as any[]) {
    const list = piutangByPenjualan.get(row.id_penjualan) || [];
    list.push(row);
    piutangByPenjualan.set(row.id_penjualan, list);
  }
  const itemsByOrder = new Map<string, any[]>();
  for (const item of (itemsRes.data || []) as any[]) {
    const list = itemsByOrder.get(item.order_produksi_id) || [];
    list.push(item);
    itemsByOrder.set(item.order_produksi_id, list);
  }

  const rows: PengambilanRow[] = [];
  for (const order of orders) {
    const penjualan = penjualanById.get(order.penjualan_id);
    if (!penjualan || penjualan.status_transaksi === "VOIDED") continue;

    const piutangList = (piutangByPenjualan.get(order.penjualan_id) || []).filter(
      (p) => ["AKTIF", "SEBAGIAN"].includes(String(p.status)),
    );
    const piutangAktif = piutangList[0] || null;
    const sisa_piutang = Number(piutangAktif?.sisa_piutang ?? 0);
    const total_jumlah = Number(penjualan.total_jumlah ?? 0);
    const jumlah_dibayar = Number(penjualan.jumlah_dibayar ?? 0);
    const pelanggan =
      pelangganById.get(penjualan.pelanggan_id) ||
      (penjualan.pelanggan_nama_snapshot
        ? { nama: penjualan.pelanggan_nama_snapshot }
        : null);
    const items = itemsByOrder.get(order.id) || [];
    const { item_ringkas, jumlah_item } = ringkasItem(items);

    rows.push({
      order_id: order.id,
      nomor_spk: String(order.nomor_spk || "-"),
      nomor_faktur: String(penjualan.nomor_faktur || "-"),
      pelanggan_nama: String(pelanggan?.nama || "Pelanggan Umum"),
      item_ringkas,
      jumlah_item,
      total_jumlah,
      jumlah_dibayar,
      sisa_piutang,
      status_bayar: hitungStatusBayar(
        total_jumlah,
        jumlah_dibayar,
        sisa_piutang,
        !!piutangAktif,
      ),
      piutang_id: piutangAktif?.id ?? null,
      penjualan_id: order.penjualan_id,
    });
  }

  return rows;
}

export async function listPengambilanBelumDiambil(): Promise<PengambilanRow[]> {
  const ordersRes = await db.query<any>("order_produksi", {
    where: { status: "SIAP_AMBIL" },
    orderBy: { column: "dibuat_pada", ascending: false },
  });
  if (ordersRes.error) throw ordersRes.error;
  return enrichPengambilanRows(ordersRes.data || []);
}

export async function listPengambilanSudahDiambil(
  limit = 100,
): Promise<PengambilanRow[]> {
  const ordersRes = await db.query<any>("order_produksi", {
    where: { status: "SELESAI" },
    orderBy: { column: "diselesaikan_pada", ascending: false },
    limit,
  });
  if (ordersRes.error) throw ordersRes.error;
  return enrichPengambilanRows(ordersRes.data || []);
}
