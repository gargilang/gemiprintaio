class Sale {
  final String id;
  final String nomorInvoice;
  final String? pelangganId;
  final String? pelangganNama;
  final double totalHarga;
  final double dibayar;
  final double kembalian;
  final String? metodePembayaran;
  final String? kasirId;
  final String? kasirNama;
  final String? catatan;
  final String? statusPembayaran;
  final double sisaPiutang;
  final bool hasPelunasan;
  final String? prioritas;
  final String? createdAt;
  final String? updatedAt;
  final List<SaleItem> items;

  const Sale({
    required this.id,
    required this.nomorInvoice,
    this.pelangganId,
    this.pelangganNama,
    this.totalHarga = 0,
    this.dibayar = 0,
    this.kembalian = 0,
    this.metodePembayaran,
    this.kasirId,
    this.kasirNama,
    this.catatan,
    this.statusPembayaran,
    this.sisaPiutang = 0,
    this.hasPelunasan = false,
    this.prioritas,
    this.createdAt,
    this.updatedAt,
    this.items = const [],
  });

  bool get isPiutang =>
      statusPembayaran == 'AKTIF' || statusPembayaran == 'SEBAGIAN';
  bool get isLunas => statusPembayaran == 'LUNAS' || statusPembayaran == null;

  factory Sale.fromJson(Map<String, dynamic> json) {
    final itemList = json['items'] ?? json['item_penjualan'];
    final hasPelunasanRaw = json['has_pelunasan'];
    return Sale(
      id: json['id'] as String,
      nomorInvoice: (json['nomor_faktur'] ?? '') as String,
      pelangganId: json['pelanggan_id'] as String?,
      pelangganNama: json['pelanggan_nama'] as String?,
      totalHarga:
          (json['total_jumlah'] as num?)?.toDouble() ??
          (json['total_harga'] as num?)?.toDouble() ??
          0,
      dibayar:
          (json['jumlah_dibayar'] as num?)?.toDouble() ??
          (json['dibayar'] as num?)?.toDouble() ??
          0,
      kembalian:
          (json['jumlah_kembalian'] as num?)?.toDouble() ??
          (json['kembalian'] as num?)?.toDouble() ??
          0,
      metodePembayaran: json['metode_pembayaran'] as String?,
      kasirId: json['kasir_id'] as String?,
      kasirNama: json['kasir_nama'] as String?,
      catatan: json['catatan'] as String?,
      statusPembayaran: json['status_pembayaran'] as String?,
      sisaPiutang: (json['sisa_piutang'] as num?)?.toDouble() ?? 0,
      hasPelunasan: hasPelunasanRaw == true || hasPelunasanRaw == 1,
      prioritas: json['prioritas'] as String?,
      createdAt:
          json['dibuat_pada'] as String? ?? json['created_at'] as String?,
      updatedAt:
          json['diperbarui_pada'] as String? ?? json['updated_at'] as String?,
      items: itemList is List
          ? itemList
                .map((i) => SaleItem.fromJson(i as Map<String, dynamic>))
                .toList()
          : [],
    );
  }
}

class SaleItem {
  final String id;
  final String penjualanId;
  final String barangId;
  final String? barangNama;
  final double quantity;
  final double hargaSatuan;
  final double subtotal;
  final double hppSatuan;
  final double hppTotal;
  final double grossProfit;
  final double grossMargin;
  final double? panjang;
  final double? lebar;
  final double? billedPanjang;
  final double? billedLebar;
  final num? jumlahRoll;
  final num? jumlahLembar;
  final String? namaSatuan;
  final String? finishingOptions;
  final String? createdAt;

  const SaleItem({
    required this.id,
    required this.penjualanId,
    required this.barangId,
    this.barangNama,
    this.quantity = 0,
    this.hargaSatuan = 0,
    this.subtotal = 0,
    this.hppSatuan = 0,
    this.hppTotal = 0,
    this.grossProfit = 0,
    this.grossMargin = 0,
    this.panjang,
    this.lebar,
    this.billedPanjang,
    this.billedLebar,
    this.jumlahRoll,
    this.jumlahLembar,
    this.namaSatuan,
    this.finishingOptions,
    this.createdAt,
  });

  factory SaleItem.fromJson(Map<String, dynamic> json) {
    return SaleItem(
      id: json['id'] as String,
      penjualanId: (json['penjualan_id'] ?? '') as String,
      barangId: (json['barang_id'] ?? '') as String,
      barangNama: (json['barang_nama'] ?? json['nama_barang']) as String?,
      quantity:
          (json['quantity'] as num?)?.toDouble() ??
          (json['jumlah'] as num?)?.toDouble() ??
          0,
      hargaSatuan: (json['harga_satuan'] as num?)?.toDouble() ?? 0,
      subtotal: (json['subtotal'] as num?)?.toDouble() ?? 0,
      hppSatuan: (json['hpp_satuan'] as num?)?.toDouble() ?? 0,
      hppTotal: (json['hpp_total'] as num?)?.toDouble() ?? 0,
      grossProfit: (json['gross_profit'] as num?)?.toDouble() ?? 0,
      grossMargin: (json['gross_margin'] as num?)?.toDouble() ?? 0,
      panjang: (json['panjang'] as num?)?.toDouble(),
      lebar: (json['lebar'] as num?)?.toDouble(),
      billedPanjang: (json['billed_panjang'] as num?)?.toDouble(),
      billedLebar: (json['billed_lebar'] as num?)?.toDouble(),
      jumlahRoll: json['jumlah_roll'] as num?,
      jumlahLembar: json['jumlah_lembar'] as num?,
      namaSatuan: json['nama_satuan'] as String?,
      finishingOptions: json['finishing_options'] as String?,
      createdAt: (json['created_at'] ?? json['dibuat_pada']) as String?,
    );
  }
}
