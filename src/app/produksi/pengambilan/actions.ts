"use server";

import { requireOperationalRole } from "@/lib/auth-guard-server";
import {
  listPengambilanBelumDiambil,
  listPengambilanSudahDiambil,
} from "@/lib/services/pengambilan-service";
import { markOrderSudahDiambil } from "@/lib/services/production-service";
import { payReceivable } from "@/lib/services/pos-mutations";
import { db } from "@/lib/db-unified";

export async function listPengambilanBelumAction() {
  await requireOperationalRole();
  return listPengambilanBelumDiambil();
}

export async function listPengambilanSudahAction() {
  await requireOperationalRole();
  return listPengambilanSudahDiambil();
}

export async function markSudahDiambilAction(orderId: string) {
  await requireOperationalRole();
  return markOrderSudahDiambil(orderId);
}

export async function payReceivablePengambilanAction(
  data: Parameters<typeof payReceivable>[0],
) {
  const s = await requireOperationalRole();
  return payReceivable({ ...data, dibuat_oleh: s.uid });
}

export async function getReceivableForOrderAction(penjualanId: string) {
  await requireOperationalRole();
  const res = await db.query("piutang_penjualan", {
    where: { id_penjualan: penjualanId },
  });
  return (res.data || []).filter((p: any) =>
    ["AKTIF", "SEBAGIAN"].includes(String(p.status)),
  );
}
