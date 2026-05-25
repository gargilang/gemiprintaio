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
      createdAt: (json['created_at'] ?? json['dibuat_pada']) as String?,
      updatedAt: (json['updated_at'] ?? json['diperbarui_pada']) as String?,
      items: itemList is List
          ? itemList
                .map((i) => ProductionItem.fromJson(i as Map<String, dynamic>))
                .toList()
          : [],
    );
  }
}

class ProductionItem {
  final String id;
  final String orderProduksiId;
  final String? barangNama;
  final double quantity;
  final String status;
  final String statusCetak;
  final String statusFinishing;
  final List<ProductionFinishing> finishing;
  final String? createdAt;

  const ProductionItem({
    required this.id,
    required this.orderProduksiId,
    this.barangNama,
    this.quantity = 0,
    this.status = 'MENUNGGU',
    this.statusCetak = 'BELUM',
    this.statusFinishing = 'BELUM',
    this.finishing = const [],
    this.createdAt,
  });

  factory ProductionItem.fromJson(Map<String, dynamic> json) {
    final finishingList = json['finishing'] ?? json['item_finishing'];
    final finishing = finishingList is List
        ? finishingList
              .map(
                (f) => ProductionFinishing.fromJson(f as Map<String, dynamic>),
              )
              .toList()
        : <ProductionFinishing>[];
    final status = (json['status'] ?? 'MENUNGGU') as String;
    final statusFinishing =
        (json['status_finishing'] ??
                (finishing.isEmpty
                    ? status
                    : finishing.every((f) => f.status == 'SELESAI')
                    ? 'SELESAI'
                    : 'PROSES'))
            as String;

    return ProductionItem(
      id: json['id'] as String,
      orderProduksiId: (json['order_produksi_id'] ?? '') as String,
      barangNama: (json['barang_nama'] ?? json['nama_barang']) as String?,
      quantity:
          (json['quantity'] as num?)?.toDouble() ??
          (json['jumlah'] as num?)?.toDouble() ??
          0,
      status: status,
      statusCetak: (json['status_cetak'] ?? status) as String,
      statusFinishing: statusFinishing,
      finishing: finishing,
      createdAt: (json['created_at'] ?? json['dibuat_pada']) as String?,
    );
  }
}

class ProductionFinishing {
  final String id;
  final String jenisFinishing;
  final String status;
  final String? operatorNama;

  const ProductionFinishing({
    required this.id,
    required this.jenisFinishing,
    this.status = 'MENUNGGU',
    this.operatorNama,
  });

  factory ProductionFinishing.fromJson(Map<String, dynamic> json) {
    return ProductionFinishing(
      id: (json['id'] ?? '') as String,
      jenisFinishing: (json['jenis_finishing'] ?? '') as String,
      status: (json['status'] ?? 'MENUNGGU') as String,
      operatorNama: json['operator_nama'] as String?,
    );
  }
}
