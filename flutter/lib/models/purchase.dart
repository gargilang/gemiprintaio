class Purchase {
  final String id;
  final String nomorPembelian;
  final String? vendorId;
  final String? vendorNama;
  final double totalHarga;
  final double dibayar;
  final String? metodePembayaran;
  final String statusPembayaran;
  final String statusTransaksi;
  final String? catatan;
  final String? createdBy;
  final String? createdAt;
  final String? updatedAt;
  final List<PurchaseItem> items;

  const Purchase({
    required this.id,
    required this.nomorPembelian,
    this.vendorId,
    this.vendorNama,
    this.totalHarga = 0,
    this.dibayar = 0,
    this.metodePembayaran,
    this.statusPembayaran = 'LUNAS',
    this.statusTransaksi = 'POSTED',
    this.catatan,
    this.createdBy,
    this.createdAt,
    this.updatedAt,
    this.items = const [],
  });

  factory Purchase.fromJson(Map<String, dynamic> json) {
    final itemList = json['items'] ?? json['item_pembelian'];
    return Purchase(
      id: json['id'] as String,
      nomorPembelian:
          (json['nomor_pembelian'] ?? json['nomor_faktur'] ?? '') as String,
      vendorId: json['vendor_id'] as String?,
      vendorNama: (json['vendor_nama'] ?? json['vendor_name']) as String?,
      totalHarga:
          (json['total_harga'] as num?)?.toDouble() ??
          (json['total_jumlah'] as num?)?.toDouble() ??
          0,
      dibayar:
          (json['dibayar'] as num?)?.toDouble() ??
          (json['jumlah_dibayar'] as num?)?.toDouble() ??
          0,
      metodePembayaran: json['metode_pembayaran'] as String?,
      statusPembayaran: (json['status_pembayaran'] ?? 'LUNAS') as String,
      statusTransaksi: (json['status_transaksi'] ?? 'POSTED') as String,
      catatan: json['catatan'] as String?,
      createdBy: (json['created_by'] ?? json['dibuat_oleh']) as String?,
      createdAt: (json['created_at'] ?? json['dibuat_pada']) as String?,
      updatedAt: (json['updated_at'] ?? json['diperbarui_pada']) as String?,
      items: itemList is List
          ? itemList
                .map((i) => PurchaseItem.fromJson(i as Map<String, dynamic>))
                .toList()
          : [],
    );
  }
}

class PurchaseItem {
  final String id;
  final String pembelianId;
  final String barangId;
  final String? barangNama;
  final double quantity;
  final double hargaSatuan;
  final double subtotal;

  const PurchaseItem({
    required this.id,
    required this.pembelianId,
    required this.barangId,
    this.barangNama,
    this.quantity = 0,
    this.hargaSatuan = 0,
    this.subtotal = 0,
  });

  factory PurchaseItem.fromJson(Map<String, dynamic> json) {
    return PurchaseItem(
      id: json['id'] as String,
      pembelianId: (json['pembelian_id'] ?? '') as String,
      barangId: (json['barang_id'] ?? '') as String,
      barangNama: (json['barang_nama'] ?? json['nama_barang']) as String?,
      quantity:
          (json['quantity'] as num?)?.toDouble() ??
          (json['jumlah'] as num?)?.toDouble() ??
          0,
      hargaSatuan:
          (json['harga_satuan'] as num?)?.toDouble() ??
          (json['harga_beli'] as num?)?.toDouble() ??
          0,
      subtotal: (json['subtotal'] as num?)?.toDouble() ?? 0,
    );
  }
}
