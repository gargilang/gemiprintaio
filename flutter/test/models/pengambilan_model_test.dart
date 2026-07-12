import 'package:flutter_test/flutter_test.dart';
import 'package:gemiprint/models/pengambilan.dart';

void main() {
  test('PengambilanRow.fromJson membaca angka dan fallback label', () {
    final row = PengambilanRow.fromJson({
      'order_id': 'op-1',
      'nomor_spk': 'SPK-001',
      'nomor_faktur': 'INV-001',
      'pelanggan_nama': 'Pelanggan Umum',
      'item_ringkas': 'Banner, Sticker',
      'jumlah_item': 2,
      'total_jumlah': 100000,
      'jumlah_dibayar': 40000,
      'sisa_piutang': 60000,
      'status_bayar': 'SEBAGIAN',
      'piutang_id': 'piu-1',
      'penjualan_id': 'sale-1',
    });

    expect(row.orderId, 'op-1');
    expect(row.sisaPiutang, 60000);
    expect(row.statusBayarLabel, 'Sebagian');
    expect(row.adaPiutang, isTrue);
  });
}
