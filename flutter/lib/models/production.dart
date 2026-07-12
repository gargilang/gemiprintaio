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
  final bool penjualanDibatalkan;
  final bool statusOverrideManual;
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
    this.penjualanDibatalkan = false,
    this.statusOverrideManual = false,
    this.items = const [],
  });

  factory ProductionOrder.fromJson(Map<String, dynamic> json) {
    final itemList = json['items'] ?? json['item_produksi'];
    return ProductionOrder(
      id: json['id'] as String,
      penjualanId: json['penjualan_id'] as String?,
      nomorSpk: json['nomor_spk'] as String?,
      nomorInvoice: json['nomor_faktur'] as String?,
      pelangganNama: json['pelanggan_nama'] as String?,
      status: (json['status'] ?? 'ANTRIAN') as String,
      prioritas: (json['prioritas'] ?? 'NORMAL') as String,
      catatan: json['catatan'] as String?,
      createdAt: (json['created_at'] ?? json['dibuat_pada']) as String?,
      updatedAt: (json['updated_at'] ?? json['diperbarui_pada']) as String?,
      penjualanDibatalkan: json['penjualan_dibatalkan'] == true || json['penjualan_dibatalkan'] == 1,
      statusOverrideManual: json['status_override_manual'] == true || json['status_override_manual'] == 1,
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
  final String? barangId;
  final String? barangNama;
  final double quantity;
  final String? namaSatuan;
  final double? panjang;
  final double? lebar;
  final double? billedPanjang;
  final double? billedLebar;
  final num? jumlahRoll;
  final List<MapEntry<String, double>> biayaTambahan;
  final String status;
  final bool isMaklon;
  final String rollInventoryStatus;
  final double? recommendedRollWidthM;
  final String statusCetak;
  final String statusFinishing;
  final List<ProductionFinishing> finishing;
  final String? createdAt;

  const ProductionItem({
    required this.id,
    required this.orderProduksiId,
    this.barangId,
    this.barangNama,
    this.quantity = 0,
    this.namaSatuan,
    this.panjang,
    this.lebar,
    this.billedPanjang,
    this.billedLebar,
    this.jumlahRoll,
    this.biayaTambahan = const [],
    this.status = 'MENUNGGU',
    this.isMaklon = false,
    this.rollInventoryStatus = 'NOT_REQUIRED',
    this.recommendedRollWidthM,
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
      barangId: json['barang_id'] as String?,
      barangNama: (json['barang_nama'] ?? json['nama_barang']) as String?,
      quantity:
          (json['quantity'] as num?)?.toDouble() ??
          (json['jumlah'] as num?)?.toDouble() ??
          0,
      namaSatuan: json['nama_satuan'] as String?,
      panjang: (json['panjang'] as num?)?.toDouble(),
      lebar: (json['lebar'] as num?)?.toDouble(),
      billedPanjang: (json['billed_panjang'] as num?)?.toDouble(),
      billedLebar: (json['billed_lebar'] as num?)?.toDouble(),
      jumlahRoll: json['jumlah_roll'] as num?,
      biayaTambahan: ((json['biaya_tambahan'] as List?) ?? [])
          .whereType<Map<String, dynamic>>()
          .where((b) => (b['nominal'] as num?)?.toDouble() != null && (b['nominal'] as num).toDouble() > 0)
          .map((b) => MapEntry((b['label'] ?? '').toString().trim(), (b['nominal'] as num).toDouble()))
          .where((e) => e.key.isNotEmpty)
          .toList(),
      status: status,
      isMaklon: json['is_maklon'] == true || json['is_maklon'] == 1,
      rollInventoryStatus: (json['roll_inventory_status'] ?? 'NOT_REQUIRED') as String,
      recommendedRollWidthM: (json['recommended_roll_width_m'] as num?)?.toDouble(),
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
