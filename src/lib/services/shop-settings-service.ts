import "server-only";

import { db, getCurrentTimestamp } from "@/lib/db-unified";
import type { PengaturanToko, PpnMetode } from "@/types/database";

const SHOP_SETTINGS_ID = "default";

const DEFAULT_SHOP_SETTINGS: PengaturanToko = {
  id: SHOP_SETTINGS_ID,
  nama_toko: "gemiprint",
  slogan: "Digital Printing & Advertising",
  alamat: null,
  telepon: null,
  email: null,
  website: null,
  bank_nama: "BCA",
  bank_nomor: "6881276507",
  bank_atas_nama: "Grafika Estetika Media Internusa",
  catatan_faktur: "Barang yang sudah dibawa tidak bisa ditukar/dikembalikan.",
  catatan_struk: "Barang yang sudah dibeli tidak dapat dikembalikan",
  npwp: null,
  alamat_npwp: null,
  status_pkp: 0,
  ppn_persen_default: 11,
  ppn_metode_default: "EKSKLUSIF",
  ppn_default_aktif: 0,
  nsfp_kode_transaksi_default: "01",
  nsfp_tahun_aktif: null,
  nsfp_seri_terakhir: null,
  // Nomor urut defaults — matches the migration defaults
  inv_prefix: "INV",
  inv_format: "PREFIX-DATE-SEQ",
  inv_reset: "daily",
  inv_padding: 3,
  inv_start_seq: 1,
  spk_prefix: "SPK",
  spk_format: "PREFIX-SEQ",
  spk_reset: "never",
  spk_padding: 4,
  spk_start_seq: 1,
};

/**
 * Ambil singleton pengaturan toko (id='default'). Selalu memberikan default
 * yang masuk akal kalau row belum ada (mis. database baru atau pull belum
 * datang) — supaya UI tidak crash.
 */
export async function getShopSettings(): Promise<PengaturanToko> {
  try {
    const result = await db.queryOne<PengaturanToko>("pengaturan_toko", {
      where: { id: SHOP_SETTINGS_ID },
    });
    if (result.error) throw result.error;
    if (result.data) return { ...DEFAULT_SHOP_SETTINGS, ...result.data };
  } catch (error) {
    console.warn("getShopSettings fallback to defaults:", error);
  }
  return DEFAULT_SHOP_SETTINGS;
}

export async function updateShopSettings(
  patch: Partial<PengaturanToko>
): Promise<PengaturanToko> {
  const existing = await db.queryOne<PengaturanToko>("pengaturan_toko", {
    where: { id: SHOP_SETTINGS_ID },
  });

  // Sanitasi field yang punya enum/range supaya UI tidak bisa simpan nilai
  // tidak valid.
  const cleaned: Partial<PengaturanToko> = { ...patch };
  if (cleaned.ppn_metode_default) {
    cleaned.ppn_metode_default = (
      cleaned.ppn_metode_default === "INKLUSIF" ? "INKLUSIF" : "EKSKLUSIF"
    ) as PpnMetode;
  }
  if (typeof cleaned.ppn_persen_default === "number") {
    cleaned.ppn_persen_default = Math.max(0, Math.min(100, cleaned.ppn_persen_default));
  }
  if (cleaned.status_pkp != null) {
    cleaned.status_pkp = cleaned.status_pkp ? 1 : 0;
  }
  if (cleaned.ppn_default_aktif != null) {
    cleaned.ppn_default_aktif = cleaned.ppn_default_aktif ? 1 : 0;
  }

  if (existing.data) {
    const upd = await db.update("pengaturan_toko", SHOP_SETTINGS_ID, {
      ...cleaned,
      diperbarui_pada: getCurrentTimestamp(),
    });
    if (upd.error) throw upd.error;
  } else {
    const ins = await db.insert("pengaturan_toko", {
      ...DEFAULT_SHOP_SETTINGS,
      ...cleaned,
      id: SHOP_SETTINGS_ID,
      dibuat_pada: getCurrentTimestamp(),
      diperbarui_pada: getCurrentTimestamp(),
    });
    if (ins.error) throw ins.error;
  }

  return getShopSettings();
}
