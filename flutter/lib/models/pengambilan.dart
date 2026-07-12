class PengambilanRow {
  final String orderId;
  final String nomorSpk;
  final String nomorFaktur;
  final String pelangganNama;
  final String itemRingkas;
  final int jumlahItem;
  final double totalJumlah;
  final double jumlahDibayar;
  final double sisaPiutang;
  final String statusBayar;
  final String? piutangId;
  final String penjualanId;

  const PengambilanRow({
    required this.orderId,
    required this.nomorSpk,
    required this.nomorFaktur,
    required this.pelangganNama,
    required this.itemRingkas,
    required this.jumlahItem,
    required this.totalJumlah,
    required this.jumlahDibayar,
    required this.sisaPiutang,
    required this.statusBayar,
    required this.piutangId,
    required this.penjualanId,
  });

  factory PengambilanRow.fromJson(Map<String, dynamic> json) {
    return PengambilanRow(
      orderId: (json['order_id'] ?? '') as String,
      nomorSpk: (json['nomor_spk'] ?? '-') as String,
      nomorFaktur: (json['nomor_faktur'] ?? '-') as String,
      pelangganNama: (json['pelanggan_nama'] ?? 'Pelanggan Umum') as String,
      itemRingkas: (json['item_ringkas'] ?? '-') as String,
      jumlahItem: (json['jumlah_item'] as num?)?.toInt() ?? 0,
      totalJumlah: (json['total_jumlah'] as num?)?.toDouble() ?? 0,
      jumlahDibayar: (json['jumlah_dibayar'] as num?)?.toDouble() ?? 0,
      sisaPiutang: (json['sisa_piutang'] as num?)?.toDouble() ?? 0,
      statusBayar: (json['status_bayar'] ?? 'PIUTANG') as String,
      piutangId: json['piutang_id'] as String?,
      penjualanId: (json['penjualan_id'] ?? '') as String,
    );
  }

  bool get adaPiutang => sisaPiutang > 0 && piutangId != null;

  String get statusBayarLabel {
    switch (statusBayar) {
      case 'LUNAS':
        return 'Lunas';
      case 'SEBAGIAN':
        return 'Sebagian';
      default:
        return 'Piutang';
    }
  }
}
