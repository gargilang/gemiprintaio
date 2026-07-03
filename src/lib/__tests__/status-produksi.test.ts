import {
  STATUS_ITEM_CETAK,
  STATUS_ITEM_MAKLON,
  STATUS_ORDER,
  labelStatus,
  daftarStatusUntukItem,
  daftarStatusManualUntukItem,
  deriveOrderStatus,
  adalahStatusTerminal,
  statusProduksiSelesaiUntukItem,
} from "@/lib/produksi/status-produksi";
import { itemStatusSchema, orderStatusSchema } from "@/lib/schemas/produksi";

describe("status-produksi konstanta", () => {
  it("urutan cetak: MENUNGGU pertama, DIBATALKAN terakhir", () => {
    expect(STATUS_ITEM_CETAK[0]).toBe("MENUNGGU");
    expect(STATUS_ITEM_CETAK[STATUS_ITEM_CETAK.length - 1]).toBe("DIBATALKAN");
  });

  it("maklon memuat status pengiriman", () => {
    expect(STATUS_ITEM_MAKLON).toEqual([
      "MENUNGGU",
      "TUNGGU_KONFIRMASI",
      "BAHAN_HABIS",
      "PESAN_KURIR",
      "TUNGGU_KURIR",
      "SEDANG_DIKIRIM",
      "DIKERJAKAN_VENDOR",
      "SEDANG_DIAMBIL",
      "SIAP_AMBIL",
      "SELESAI",
      "DIBATALKAN",
    ]);
  });

  it("labelStatus ramah manusia tanpa underscore", () => {
    expect(labelStatus("TUNGGU_KONFIRMASI")).toBe("Tunggu Konfirmasi");
    expect(labelStatus("SEDANG_DIAMBIL")).toBe("Sedang Diambil");
    expect(labelStatus("PRINTING")).toBe("Printing");
    // fallback humanize untuk kode tak terdaftar
    expect(labelStatus("FOO_BAR")).toBe("Foo Bar");
    expect(labelStatus("FOO_BAR")).not.toContain("_");
  });

  it("daftarStatusUntukItem memilih daftar sesuai jenis", () => {
    expect(daftarStatusUntukItem({ is_maklon: true })).toBe(STATUS_ITEM_MAKLON);
    expect(daftarStatusUntukItem({ is_maklon: false })).toBe(STATUS_ITEM_CETAK);
  });

  it("adalahStatusTerminal", () => {
    expect(adalahStatusTerminal("SELESAI")).toBe(true);
    expect(adalahStatusTerminal("DIBATALKAN")).toBe(true);
    expect(adalahStatusTerminal("PRINTING")).toBe(false);
  });
});

describe("deriveOrderStatus", () => {
  it("semua MENUNGGU -> MENUNGGU", () => {
    expect(deriveOrderStatus(["MENUNGGU", "MENUNGGU"])).toBe("MENUNGGU");
  });
  it("ada satu bergerak -> PROSES", () => {
    expect(deriveOrderStatus(["MENUNGGU", "PRINTING"])).toBe("PROSES");
  });
  it("status macet dihitung bergerak -> PROSES", () => {
    expect(deriveOrderStatus(["MENUNGGU", "BAHAN_HABIS"])).toBe("PROSES");
  });
  it("semua SELESAI -> SELESAI", () => {
    expect(deriveOrderStatus(["SELESAI", "SELESAI"])).toBe("SELESAI");
  });
  it("item DIBATALKAN diabaikan saat menilai selesai", () => {
    expect(deriveOrderStatus(["SELESAI", "DIBATALKAN"])).toBe("SELESAI");
  });
  it("semua DIBATALKAN -> DIBATALKAN", () => {
    expect(deriveOrderStatus(["DIBATALKAN", "DIBATALKAN"])).toBe("DIBATALKAN");
  });
  it("sebagian SELESAI sebagian MENUNGGU -> PROSES", () => {
    expect(deriveOrderStatus(["SELESAI", "MENUNGGU"])).toBe("PROSES");
  });
  it("daftar kosong -> MENUNGGU", () => {
    expect(deriveOrderStatus([])).toBe("MENUNGGU");
  });
});

describe("schema produksi", () => {
  it("itemStatusSchema menerima nilai valid", () => {
    expect(itemStatusSchema.safeParse("PESAN_KURIR").success).toBe(true);
    expect(itemStatusSchema.safeParse("PRINTING").success).toBe(true);
  });
  it("itemStatusSchema menolak nilai ngawur", () => {
    expect(itemStatusSchema.safeParse("NGAWUR").success).toBe(false);
  });
  it("orderStatusSchema valid/invalid", () => {
    expect(orderStatusSchema.safeParse("PROSES").success).toBe(true);
    expect(orderStatusSchema.safeParse("PRINTING").success).toBe(false);
  });
});

describe("SIAP_AMBIL per order", () => {
  it("STATUS_ORDER memuat SIAP_AMBIL sebelum SELESAI", () => {
    expect(STATUS_ORDER).toEqual([
      "MENUNGGU",
      "PROSES",
      "SIAP_AMBIL",
      "SELESAI",
      "DIBATALKAN",
    ]);
  });

  it("dropdown item cetak tidak memuat SIAP_AMBIL atau SELESAI", () => {
    const list = daftarStatusManualUntukItem({ is_maklon: false });
    expect(list).not.toContain("SIAP_AMBIL");
    expect(list).not.toContain("SELESAI");
    expect(list[list.length - 2]).toBe("FINISHING"); // sebelum DIBATALKAN
  });

  it("status produksi selesai maklon vs cetak", () => {
    expect(statusProduksiSelesaiUntukItem({ is_maklon: false })).toBe("FINISHING");
    expect(statusProduksiSelesaiUntukItem({ is_maklon: true })).toBe(
      "DIKERJAKAN_VENDOR",
    );
  });
});
