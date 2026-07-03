import 'package:flutter_test/flutter_test.dart';
import 'package:gemiprint/core/penjualan_cetak_utils.dart';

void main() {
  group('cetak penjualan — qty berdimensi', () {
    test('QTY = jumlah lembar, bukan m² (jumlah_roll eksplisit)', () {
      final lembar = hitungQtyLembarCetak(const ItemCetakPenjualan(
        jumlah: 30,
        panjang: 2,
        lebar: 3,
        jumlahRoll: 5,
      ));
      expect(lembar, 5);

      final qs = qtySatuanCetak(const ItemCetakPenjualan(
        jumlah: 30,
        panjang: 2,
        lebar: 3,
        jumlahRoll: 5,
        namaSatuan: 'm²',
      ));
      expect(qs.qty, 5);
      expect(qs.satuan, '');
    });

    test('kolom UKURAN memakai meter input', () {
      expect(formatUkuranCetakInput(panjang: 2, lebar: 3), '2 × 3 m');
    });

    test('infer lembar dari m² tersimpan (reprint, tanpa jumlah_roll)', () {
      expect(
        hitungQtyLembarCetak(const ItemCetakPenjualan(
          jumlah: 60,
          panjang: 2,
          lebar: 3,
        )),
        10,
      );
    });

    test('label qty: lembar tanpa satuan untuk barang berdimensi', () {
      expect(
        formatQtyLabel(const ItemCetakPenjualan(
          jumlah: 60,
          panjang: 2,
          lebar: 3,
          namaSatuan: 'm²',
        )),
        '10',
      );
    });

    test('barang non-dimensi tetap memakai satuan asli', () {
      final qs = qtySatuanCetak(const ItemCetakPenjualan(
        jumlah: 5,
        namaSatuan: 'pcs',
      ));
      expect(qs.qty, 5);
      expect(qs.satuan, 'pcs');
      expect(formatQtyLabel(const ItemCetakPenjualan(
        jumlah: 5,
        namaSatuan: 'pcs',
      )), '5 pcs');
    });

    test('ukuran null kalau bukan barang berdimensi', () {
      expect(formatUkuranCetakInput(panjang: null, lebar: null), isNull);
    });
  });
}
