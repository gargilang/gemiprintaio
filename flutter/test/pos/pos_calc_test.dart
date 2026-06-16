import 'package:flutter_test/flutter_test.dart';
import 'package:gemiprint/features/pos/pos_calc.dart';

void main() {
  group('roundUpToThousand', () {
    test('membulatkan ke ribuan terdekat ke atas', () {
      expect(roundUpToThousand(81250), 82000);
      expect(roundUpToThousand(81000), 81000);
      expect(roundUpToThousand(0), 0);
      expect(roundUpToThousand(-5), 0);
    });
  });

  group('allocateCartLineCharges / getCartChargeTotal', () {
    test('membulatkan total sekali, baris terakhir menyerap sisa', () {
      final raws = [81250.0, 146250.0];
      expect(allocateCartLineCharges(raws, false), [81250.0, 146250.0]);
      expect(allocateCartLineCharges(raws, true), [81250.0, 146750.0]);
      expect(getCartChargeTotal(raws, true), 228000.0);
    });

    test('tidak mengubah saat total sudah kelipatan ribuan', () {
      final raws = [50000.0, 50000.0];
      expect(allocateCartLineCharges(raws, true), [50000.0, 50000.0]);
    });

    test('daftar kosong → kosong', () {
      expect(allocateCartLineCharges(<double>[], true), <double>[]);
    });
  });

  group('getBillableDimensionsForRoll', () {
    test('1.2 × 2.7 pada roll 3m → rotasi, 3.6 m²', () {
      final billed = getBillableDimensionsForRoll(1.2, 2.7, 3);
      expect(billed, isNotNull);
      expect(billed!.area, closeTo(3.6, 0.0001));
      expect(billed.usesRotation, true);
    });

    test('roll terlalu kecil → null', () {
      expect(getBillableDimensionsForRoll(1.2, 2.7, 1), isNull);
    });
  });

  group('getRoundedDimensions', () {
    test('tanpa pembulatan → dimensi apa adanya, rollSize null', () {
      final r = getRoundedDimensions(1.2, 2.7, false, null);
      expect(r.panjang, 1.2);
      expect(r.lebar, 2.7);
      expect(r.rollSize, isNull);
    });

    test('dengan pembulatan + roll 3 → area tertagih 3.6', () {
      final r = getRoundedDimensions(1.2, 2.7, true, 3);
      expect(r.rollSize, 3);
      expect(r.panjang * r.lebar, closeTo(3.6, 0.0001));
    });
  });

  group('isRollSizeValidForDimensions', () {
    test('valid bila roll cukup besar', () {
      expect(isRollSizeValidForDimensions(1.2, 2.7, 3), true);
      expect(isRollSizeValidForDimensions(1.2, 2.7, 1), false);
    });
  });

  group('formatRollCartDetailLine', () {
    test('menampilkan panjang cetak × roll dengan tarif', () {
      final line = formatRollCartDetailLine(
        billedPanjang: 1.3,
        billedLebar: 2.5,
        selectedRollSize: 2.5,
        jumlah: 3.25,
        hargaSatuan: 25000,
      );
      expect(line, contains('1.30 × Roll 2.50 m = 3.25 m² @ Rp 25.000'));
      expect(getRollPrintLength(1.3, 2.5, 2.5), closeTo(1.3, 0.0001));
    });
  });
}
