import { createSaleSchema } from "../schemas/pos";

describe("createSaleSchema", () => {
  const baseItem = {
    barang_id: "b1",
    jumlah: 2,
    nama_satuan: "pcs",
    faktor_konversi: 1,
    harga_satuan: 1000,
    subtotal: 2000,
  };

  test("menolak jumlah negatif", () => {
    const r = createSaleSchema.safeParse({
      pelanggan_id: "p1",
      metode_pembayaran: "CASH",
      total_jumlah: 2000,
      jumlah_dibayar: 2000,
      jumlah_kembalian: 0,
      items: [{ ...baseItem, jumlah: -1 }],
    });
    expect(r.success).toBe(false);
  });

  test("menolak harga NaN / string non-numeric", () => {
    const r = createSaleSchema.safeParse({
      pelanggan_id: "p1",
      metode_pembayaran: "CASH",
      total_jumlah: 2000,
      jumlah_dibayar: 2000,
      jumlah_kembalian: 0,
      items: [{ ...baseItem, harga_satuan: "abc" }],
    });
    expect(r.success).toBe(false);
  });

  test("menolak metode_pembayaran tak dikenal", () => {
    const r = createSaleSchema.safeParse({
      metode_pembayaran: "BITCOIN",
      total_jumlah: 2000,
      jumlah_dibayar: 2000,
      jumlah_kembalian: 0,
      items: [baseItem],
    });
    expect(r.success).toBe(false);
  });

  test("menolak items kosong", () => {
    const r = createSaleSchema.safeParse({
      metode_pembayaran: "CASH",
      total_jumlah: 2000,
      jumlah_dibayar: 2000,
      jumlah_kembalian: 0,
      items: [],
    });
    expect(r.success).toBe(false);
  });

  test("menerima payload CASH valid", () => {
    const r = createSaleSchema.safeParse({
      pelanggan_id: "p1",
      metode_pembayaran: "CASH",
      total_jumlah: 2000,
      jumlah_dibayar: 2000,
      jumlah_kembalian: 0,
      items: [baseItem],
    });
    expect(r.success).toBe(true);
  });

  test("menerima QRIS, DEBIT, DOWN_PAYMENT, NET30, TRANSFER", () => {
    for (const metode of ["QRIS", "DEBIT", "DOWN_PAYMENT", "NET30", "TRANSFER"]) {
      const r = createSaleSchema.safeParse({
        metode_pembayaran: metode,
        total_jumlah: 2000,
        jumlah_dibayar: 0,
        jumlah_kembalian: 0,
        items: [baseItem],
      });
      expect(r.success).toBe(true);
    }
  });

  test("menerima item roll dengan dimensi + finishing + maklon", () => {
    const r = createSaleSchema.safeParse({
      metode_pembayaran: "CASH",
      total_jumlah: 50000,
      jumlah_dibayar: 50000,
      jumlah_kembalian: 0,
      kena_ppn: true,
      ppn_persen: 11,
      ppn_metode: "EKSKLUSIF",
      nsfp_kode_transaksi: "01",
      nsfp_tahun: "26",
      nsfp_nomor_seri: "00000001",
      biaya_tambahan: [{ label: "Ongkir", nominal: 5000 }],
      items: [
        {
          ...baseItem,
          panjang: 2,
          lebar: 1.5,
          jumlah_roll: 1,
          selectedRollSize: 1.5,
          finishing: [{ jenis_finishing: "UV", keterangan: "full" }],
          tipe_item: "MAKLON",
          vendor_subkontrak_id: "v1",
          biaya_subkontrak: 10000,
          metode_bayar_vendor: "CASH",
          deskripsi_pekerjaan: "cetak banner",
        },
      ],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.items[0].jumlah_roll).toBe(1);
  });

  test("menolak jumlah_roll pecahan atau kurang dari satu", () => {
    for (const jumlahRoll of [0, 1.5]) {
      const r = createSaleSchema.safeParse({
        metode_pembayaran: "CASH",
        total_jumlah: 2000,
        jumlah_dibayar: 2000,
        jumlah_kembalian: 0,
        items: [{ ...baseItem, jumlah_roll: jumlahRoll }],
      });
      expect(r.success).toBe(false);
    }
  });

  describe("biaya tambahan modal", () => {
    const withBiaya = (biaya: any[]) => ({
      pelanggan_id: "p1",
      metode_pembayaran: "CASH",
      total_jumlah: 2000,
      jumlah_dibayar: 2000,
      jumlah_kembalian: 0,
      items: [{ ...baseItem, biaya_tambahan: biaya }],
    });

    test("menerima modal <= nominal", () => {
      const r = createSaleSchema.safeParse(
        withBiaya([{ label: "Pasang bambu", nominal: 30000, modal: 15000 }]),
      );
      expect(r.success).toBe(true);
    });

    test("menolak modal > nominal", () => {
      const r = createSaleSchema.safeParse(
        withBiaya([{ label: "Ongkir", nominal: 10000, modal: 20000 }]),
      );
      expect(r.success).toBe(false);
    });

    test("modal opsional (tanpa modal tetap valid)", () => {
      const r = createSaleSchema.safeParse(
        withBiaya([{ label: "Editing", nominal: 20000 }]),
      );
      expect(r.success).toBe(true);
    });
  });
});
