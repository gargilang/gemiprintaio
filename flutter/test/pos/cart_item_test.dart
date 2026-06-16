import 'package:flutter_test/flutter_test.dart';
import 'package:gemiprint/features/pos/models/cart_item.dart';
import 'package:gemiprint/features/pos/models/finishing_option.dart';
import 'package:gemiprint/features/pos/pos_calc.dart';

void main() {
  group('CartItem non-dimensi', () {
    test('jumlah = qty, subtotalRaw = qty × harga', () {
      final item = CartItem(
        barangId: 'b1',
        barangNama: 'Stiker Vinyl',
        hargaSatuanId: 'h1',
        namaSatuan: 'pcs',
        faktorKonversi: 1,
        hargaSatuan: 5000,
        originalHargaSatuan: 5000,
        butuhDimensi: false,
        jumlah: 10,
      );
      expect(item.subtotalRaw, 50000);
      expect(item.isOverride, false);
    });
  });

  group('CartItem override harga', () {
    test('isOverride true saat harga ≠ original', () {
      final item = CartItem(
        barangId: 'b1',
        barangNama: 'Stiker',
        hargaSatuanId: 'h1',
        namaSatuan: 'pcs',
        faktorKonversi: 1,
        hargaSatuan: 5000,
        originalHargaSatuan: 5500,
        butuhDimensi: false,
        jumlah: 10,
      );
      expect(item.isOverride, true);
      expect(item.subtotalRaw, 50000);
    });
  });

  group('CartItem dimensi (roll)', () {
    test('jumlah dari billed dims, payload bawa roll + finishing', () {
      final item = CartItem(
        barangId: 'b1',
        barangNama: 'Banner Flexi',
        hargaSatuanId: 'h1',
        namaSatuan: 'm²',
        faktorKonversi: 1,
        hargaSatuan: 25000,
        originalHargaSatuan: 25000,
        butuhDimensi: true,
        panjang: 1.2,
        lebar: 2.7,
        useRounding: true,
        selectedRollSize: 3,
        billedPanjang: 1.2,
        billedLebar: 3,
        jumlah: 3.6,
        finishing: const [FinishingSelection(jenisFinishing: 'Laminasi Doff')],
      );
      expect(item.subtotalRaw, closeTo(90000, 0.001));
      // harga_satuan baru = lineCharge / jumlah
      final payload = item.toSalePayload(90000);
      expect(payload['barang_id'], 'b1');
      expect(payload['jumlah'], 3.6);
      expect((payload['harga_satuan'] as double), closeTo(25000, 0.001));
      expect(payload['subtotal'], 90000);
      expect(payload['panjang'], 1.2);
      expect(payload['lebar'], 2.7);
      expect(payload['billed_panjang'], 1.2);
      expect(payload['billed_lebar'], 3);
      expect(payload['selectedRollSize'], 3);
      expect((payload['finishing'] as List).first['jenis_finishing'],
          'Laminasi Doff');
    });
  });

  group('CartItem maklon', () {
    test('payload bawa tipe_item + field vendor', () {
      final item = CartItem(
        barangId: kIdBarangPlaceholderMaklon,
        barangNama: 'Cetak Kanvas (Maklon)',
        hargaSatuanId: kIdHargaPlaceholderMaklon,
        namaSatuan: 'pcs',
        faktorKonversi: 1,
        hargaSatuan: 12000,
        originalHargaSatuan: 12000,
        butuhDimensi: false,
        jumlah: 1,
        tipeItem: 'MAKLON',
        vendorSubkontrakId: 'v1',
        biayaSubkontrak: 8000,
        metodeBayarVendor: 'CASH',
        deskripsiPekerjaan: 'Finishing kayu',
      );
      final payload = item.toSalePayload(12000);
      expect(payload['tipe_item'], 'MAKLON');
      expect(payload['vendor_subkontrak_id'], 'v1');
      expect(payload['biaya_subkontrak'], 8000);
      expect(payload['metode_bayar_vendor'], 'CASH');
      expect(payload['deskripsi_pekerjaan'], 'Finishing kayu');
    });
  });
}
