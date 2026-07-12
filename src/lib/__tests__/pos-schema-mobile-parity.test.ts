import { createSaleSchema } from "@/lib/schemas/pos";

describe("mobile POS parity schema", () => {
  const baseSale = {
    pelanggan_nama_snapshot: "Pelanggan Umum",
    items: [
      {
        barang_id: "barang-jasa-maklon",
        harga_satuan_id: "harga-jasa-maklon-pcs",
        jumlah: 1,
        nama_satuan: "pcs",
        nama_produk_jual: "Hardcover Custom",
        faktor_konversi: 1,
        harga_satuan: 120000,
        subtotal: 120000,
        tipe_item: "MAKLON",
        katalog_maklon_id: "kat-1",
        vendor_subkontrak_id: "vendor-1",
        biaya_subkontrak: 80000,
        metode_bayar_vendor: "TRANSFER",
        deskripsi_pekerjaan: "Hardcover Custom",
      },
    ],
    total_jumlah: 120000,
    jumlah_dibayar: 120000,
    jumlah_kembalian: 0,
    metode_pembayaran: "TRANSFER",
    prioritas: "NORMAL",
  };

  it("menerima vendor maklon TRANSFER", () => {
    expect(createSaleSchema.safeParse(baseSale).success).toBe(true);
  });

  it("menerima biaya tambahan dengan modal valid", () => {
    const sale = {
      ...baseSale,
      items: [
        {
          ...baseSale.items[0],
          biaya_tambahan: [{ label: "Ongkir", nominal: 20000, modal: 20000 }],
        },
      ],
      total_jumlah: 140000,
      jumlah_dibayar: 140000,
    };
    expect(createSaleSchema.safeParse(sale).success).toBe(true);
  });

  it("menolak metode bayar vendor di luar enum", () => {
    const sale = {
      ...baseSale,
      items: [{ ...baseSale.items[0], metode_bayar_vendor: "QRIS" }],
    };
    expect(createSaleSchema.safeParse(sale).success).toBe(false);
  });

  it("menolak modal biaya tambahan melebihi nominal", () => {
    const sale = {
      ...baseSale,
      items: [
        {
          ...baseSale.items[0],
          biaya_tambahan: [{ label: "Ongkir", nominal: 20000, modal: 25000 }],
        },
      ],
    };
    expect(createSaleSchema.safeParse(sale).success).toBe(false);
  });
});
