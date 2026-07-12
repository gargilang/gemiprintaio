import 'package:flutter_test/flutter_test.dart';
import 'package:gemiprint/models/production.dart';

void main() {
  test('ProductionOrder.fromJson membaca status dan field web terbaru', () {
    final order = ProductionOrder.fromJson({
      'id': 'op-1',
      'penjualan_id': 'sale-1',
      'nomor_spk': 'SPK-001',
      'status': 'SIAP_AMBIL',
      'status_override_manual': true,
      'penjualan_dibatalkan': false,
      'item_produksi': [
        {
          'id': 'item-1',
          'order_produksi_id': 'op-1',
          'barang_id': 'barang-1',
          'barang_nama': 'Banner',
          'jumlah': 2,
          'status': 'SIAP_AMBIL',
          'is_maklon': true,
          'roll_inventory_status': 'PENDING',
          'recommended_roll_width_m': 1.55,
        }
      ],
    });

    expect(order.status, 'SIAP_AMBIL');
    expect(order.statusOverrideManual, isTrue);
    expect(order.penjualanDibatalkan, isFalse);
    expect(order.items.single.isMaklon, isTrue);
    expect(order.items.single.rollInventoryStatus, 'PENDING');
    expect(order.items.single.recommendedRollWidthM, 1.55);
  });
}
