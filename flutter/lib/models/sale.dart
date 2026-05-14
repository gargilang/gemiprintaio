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
    this.createdAt,
    this.updatedAt,
    this.items = const [],
  });

  factory Sale.fromJson(Map<String, dynamic> json) {
    final itemList = json['items'] ?? json['item_penjualan'];
    return Sale(
      id: json['id'] as String,
      nomorInvoice: (json['nomor_invoice'] ?? '') as String,
      pelangganId: json['pelanggan_id'] as String?,
      pelangganNama: json['pelanggan_nama'] as String?,
      totalHarga: (json['total_harga'] as num?)?.toDouble() ?? 0,
      dibayar: (json['dibayar'] as num?)?.toDouble() ?? 0,
      kembalian: (json['kembalian'] as num?)?.toDouble() ?? 0,
      metodePembayaran: json['metode_pembayaran'] as String?,
      kasirId: json['kasir_id'] as String?,
      kasirNama: json['kasir_nama'] as String?,
      catatan: json['catatan'] as String?,
      createdAt: json['created_at'] as String?,
      updatedAt: json['updated_at'] as String?,
      items: itemList is List
          ? itemList.map((i) => SaleItem.fromJson(i as Map<String, dynamic>)).toList()
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
  final double? panjang;
  final double? lebar;
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
    this.panjang,
    this.lebar,
    this.finishingOptions,
    this.createdAt,
  });

  factory SaleItem.fromJson(Map<String, dynamic> json) {
    return SaleItem(
      id: json['id'] as String,
      penjualanId: (json['penjualan_id'] ?? '') as String,
      barangId: (json['barang_id'] ?? '') as String,
      barangNama: json['barang_nama'] as String?,
      quantity: (json['quantity'] as num?)?.toDouble() ?? 0,
      hargaSatuan: (json['harga_satuan'] as num?)?.toDouble() ?? 0,
      subtotal: (json['subtotal'] as num?)?.toDouble() ?? 0,
      panjang: (json['panjang'] as num?)?.toDouble(),
      lebar: (json['lebar'] as num?)?.toDouble(),
      finishingOptions: json['finishing_options'] as String?,
      createdAt: json['created_at'] as String?,
    );
  }
}
