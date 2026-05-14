class ProductionOrder {
  final String id;
  final String? penjualanId;
  final String? nomorSpk;
  final String? nomorInvoice;
  final String? pelangganNama;
  final String status;
  final String prioritas;
  final String? catatan;
  final String? createdAt;
  final String? updatedAt;
  final List<ProductionItem> items;

  const ProductionOrder({
    required this.id,
    this.penjualanId,
    this.nomorSpk,
    this.nomorInvoice,
    this.pelangganNama,
    this.status = 'ANTRIAN',
    this.prioritas = 'NORMAL',
    this.catatan,
    this.createdAt,
    this.updatedAt,
    this.items = const [],
  });

  factory ProductionOrder.fromJson(Map<String, dynamic> json) {
    final itemList = json['items'] ?? json['item_produksi'];
    return ProductionOrder(
      id: json['id'] as String,
      penjualanId: json['penjualan_id'] as String?,
      nomorSpk: json['nomor_spk'] as String?,
      nomorInvoice: json['nomor_invoice'] as String?,
      pelangganNama: json['pelanggan_nama'] as String?,
      status: (json['status'] ?? 'ANTRIAN') as String,
      prioritas: (json['prioritas'] ?? 'NORMAL') as String,
      catatan: json['catatan'] as String?,
      createdAt: json['created_at'] as String?,
      updatedAt: json['updated_at'] as String?,
      items: itemList is List
          ? itemList.map((i) => ProductionItem.fromJson(i as Map<String, dynamic>)).toList()
          : [],
    );
  }
}

class ProductionItem {
  final String id;
  final String orderProduksiId;
  final String? barangNama;
  final double quantity;
  final String statusCetak;
  final String statusFinishing;
  final String? createdAt;

  const ProductionItem({
    required this.id,
    required this.orderProduksiId,
    this.barangNama,
    this.quantity = 0,
    this.statusCetak = 'BELUM',
    this.statusFinishing = 'BELUM',
    this.createdAt,
  });

  factory ProductionItem.fromJson(Map<String, dynamic> json) {
    return ProductionItem(
      id: json['id'] as String,
      orderProduksiId: (json['order_produksi_id'] ?? '') as String,
      barangNama: json['barang_nama'] as String?,
      quantity: (json['quantity'] as num?)?.toDouble() ?? 0,
      statusCetak: (json['status_cetak'] ?? 'BELUM') as String,
      statusFinishing: (json['status_finishing'] ?? 'BELUM') as String,
      createdAt: json['created_at'] as String?,
    );
  }
}
