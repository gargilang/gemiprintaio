import 'dart:math' as math;

/// Ukuran roll bawaan (mirror web `DEFAULT_ROLL_SIZES`). Tidak dipersist di v1.
const List<double> kDefaultRollSizes = [0.5, 1, 1.5, 2, 2.5, 3];

/// Placeholder sistem maklon (mirror `src/lib/barang-placeholder.ts`).
const String kIdBarangPlaceholderMaklon = 'barang-jasa-maklon';
const String kIdHargaPlaceholderMaklon = 'harga-jasa-maklon-pcs';

const double _dimEps = 0.001;

/// Bulatkan ke atas ke kelipatan Rp 1.000 (81.250 → 82.000).
double roundUpToThousand(double amount) {
  if (!amount.isFinite || amount <= 0) return 0;
  return (amount / 1000).ceil() * 1000.0;
}

/// Alokasikan tagihan per baris; pembulatan sekali di total transaksi.
/// Baris terakhir menyerap sisa supaya jumlah baris = total tertagih.
List<double> allocateCartLineCharges(List<double> raws, bool roundPrices) {
  if (raws.isEmpty) return <double>[];
  if (!roundPrices) return List<double>.from(raws);

  final totalRaw = raws.fold<double>(0, (s, n) => s + n);
  final totalCharged = roundUpToThousand(totalRaw);
  if (totalCharged == totalRaw) return List<double>.from(raws);

  final charges = List<double>.from(raws);
  charges[charges.length - 1] += totalCharged - totalRaw;
  return charges;
}

double getCartChargeTotal(List<double> raws, bool roundPrices) {
  return allocateCartLineCharges(raws, roundPrices)
      .fold<double>(0, (s, n) => s + n);
}

/// Format harga satuan ala Indonesia, sembunyikan desimal nol.
String formatPosUnitPrice(double amount) {
  final rounded = amount.roundToDouble();
  if ((amount - rounded).abs() < 0.005) {
    return _thousands(rounded);
  }
  return _thousands(amount, maxFractionDigits: 2);
}

class BillableDimensions {
  final double panjang;
  final double lebar;
  final double area;
  final bool usesRotation;
  const BillableDimensions({
    required this.panjang,
    required this.lebar,
    required this.area,
    required this.usesRotation,
  });
}

/// Ukuran tertagih untuk roll: lebar roll tetap, panjang cetak sisi lainnya.
/// Coba dua orientasi (normal + rotasi), pilih area terkecil yang valid.
BillableDimensions? getBillableDimensionsForRoll(
  double panjang,
  double lebar,
  double rollSize,
) {
  final shorter = math.min(panjang, lebar);
  final longer = math.max(panjang, lebar);
  final panjangIsShorter = panjang <= lebar;
  final candidates = <BillableDimensions>[];

  void addCandidate(
    bool rollAcrossShorter,
    double widthAcrossRoll,
    double lengthAlongRoll,
  ) {
    final area = widthAcrossRoll * lengthAlongRoll;
    double p;
    double l;
    if (rollAcrossShorter) {
      if (panjangIsShorter) {
        p = widthAcrossRoll;
        l = lengthAlongRoll;
      } else {
        p = lengthAlongRoll;
        l = widthAcrossRoll;
      }
    } else if (panjangIsShorter) {
      p = lengthAlongRoll;
      l = widthAcrossRoll;
    } else {
      p = widthAcrossRoll;
      l = lengthAlongRoll;
    }
    candidates.add(BillableDimensions(
      panjang: p,
      lebar: l,
      area: area,
      usesRotation: !rollAcrossShorter,
    ));
  }

  if (rollSize >= shorter) addCandidate(true, rollSize, longer);
  if (rollSize >= longer) addCandidate(false, rollSize, shorter);

  if (candidates.isEmpty) return null;
  return candidates.reduce((best, c) => c.area < best.area ? c : best);
}

/// Roll dengan area tertagih terkecil (termurah), mempertimbangkan rotasi.
double suggestCheapestRollSize(
  double panjang,
  double lebar, [
  List<double> rollSizes = kDefaultRollSizes,
]) {
  double? bestRoll;
  double bestArea = double.infinity;
  for (final size in rollSizes) {
    final billed = getBillableDimensionsForRoll(panjang, lebar, size);
    if (billed == null) continue;
    if (billed.area < bestArea) {
      bestArea = billed.area;
      bestRoll = size;
    }
  }
  if (bestRoll != null) return bestRoll;

  final shorter = math.min(panjang, lebar);
  final sorted = [...rollSizes]..sort();
  for (final size in sorted) {
    if (size >= shorter) return size;
  }
  return sorted.isNotEmpty ? sorted.last : shorter;
}

class RoundedDimensions {
  final double panjang;
  final double lebar;
  final double? rollSize;
  const RoundedDimensions({
    required this.panjang,
    required this.lebar,
    required this.rollSize,
  });
}

RoundedDimensions getRoundedDimensions(
  double panjang,
  double lebar,
  bool useRounding,
  double? selectedRollSize, [
  List<double> rollSizes = kDefaultRollSizes,
]) {
  if (!useRounding) {
    return RoundedDimensions(panjang: panjang, lebar: lebar, rollSize: null);
  }
  final rollSize = (selectedRollSize != null && selectedRollSize > 0)
      ? selectedRollSize
      : suggestCheapestRollSize(panjang, lebar, rollSizes);
  final billed = getBillableDimensionsForRoll(panjang, lebar, rollSize);
  if (billed == null) {
    return RoundedDimensions(
        panjang: panjang, lebar: lebar, rollSize: rollSize);
  }
  return RoundedDimensions(
    panjang: billed.panjang,
    lebar: billed.lebar,
    rollSize: rollSize,
  );
}

bool isRollSizeValidForDimensions(
    double panjang, double lebar, double rollSize) {
  return getBillableDimensionsForRoll(panjang, lebar, rollSize) != null;
}

/// Panjang cetak terhadap lebar roll (untuk tampilan keranjang/struk).
double getRollPrintLength(
  double billedPanjang,
  double billedLebar,
  double rollSize,
) {
  if ((billedPanjang - rollSize).abs() < _dimEps) return billedLebar;
  if ((billedLebar - rollSize).abs() < _dimEps) return billedPanjang;
  return math.min(billedPanjang, billedLebar);
}

String formatRollCartDetailLine({
  double? billedPanjang,
  double? billedLebar,
  double? selectedRollSize,
  required double jumlah,
  required double hargaSatuan,
}) {
  if (billedPanjang == null ||
      billedLebar == null ||
      selectedRollSize == null) {
    return '';
  }
  final printLen =
      getRollPrintLength(billedPanjang, billedLebar, selectedRollSize);
  return '${printLen.toStringAsFixed(2)} × Roll '
      '${selectedRollSize.toStringAsFixed(2)} m = '
      '${jumlah.toStringAsFixed(2)} m² @ Rp '
      '${formatPosUnitPrice(hargaSatuan)}';
}

/// Pemisah ribuan gaya id-ID ("." sebagai pemisah ribuan).
String _thousands(double value, {int maxFractionDigits = 0}) {
  final negative = value < 0;
  final abs = value.abs();
  final intPart = abs.truncate();
  final intStr = intPart.toString();
  final buf = StringBuffer();
  for (int i = 0; i < intStr.length; i++) {
    if (i > 0 && (intStr.length - i) % 3 == 0) buf.write('.');
    buf.write(intStr[i]);
  }
  var out = buf.toString();
  if (maxFractionDigits > 0) {
    final frac = abs - intPart;
    if (frac > 0) {
      var fracStr = frac.toStringAsFixed(maxFractionDigits);
      fracStr = fracStr.substring(2).replaceAll(RegExp(r'0+$'), '');
      if (fracStr.isNotEmpty) out = '$out,$fracStr';
    }
  }
  return negative ? '-$out' : out;
}
