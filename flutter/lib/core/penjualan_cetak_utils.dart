/// Helper qty/satuan untuk cetak faktur, struk penjualan, dan SPK — port Dart
/// dari `src/lib/penjualan-cetak-utils.ts` agar Flutter seragam dengan web.
///
/// Barang berdimensi:
/// - UKURAN = panjang × lebar (meter) sesuai input
/// - QTY = jumlah lembar/banner yang dicetak (bukan total m²)
///
/// `jumlah` di DB/keranjang = total m²; qty cetak = jumlah_roll atau
/// jumlah ÷ luas per keping.
library;

import 'dart:math' as math;

double _positive(num? v) {
  final n = v?.toDouble() ?? 0;
  return n.isFinite && n > 0 ? n : 0;
}

String _fmtDim(double n) {
  if (n == n.roundToDouble()) return n.toStringAsFixed(0);
  final s = n.toStringAsFixed(2);
  return s.replaceAll(RegExp(r'\.?0+$'), '');
}

/// Input cetak penjualan (mirror `ItemCetakPenjualan` di web).
class ItemCetakPenjualan {
  final double jumlah;
  final String? namaSatuan;
  final double? panjang;
  final double? lebar;
  final double? billedPanjang;
  final double? billedLebar;
  final num? jumlahRoll;
  final num? jumlahLembar;

  const ItemCetakPenjualan({
    required this.jumlah,
    this.namaSatuan,
    this.panjang,
    this.lebar,
    this.billedPanjang,
    this.billedLebar,
    this.jumlahRoll,
    this.jumlahLembar,
  });
}

/// Ukuran input (meter) untuk kolom UKURAN / baris dimensi → "2 × 3 m".
String? formatUkuranCetakInput({
  double? panjang,
  double? lebar,
  double? billedPanjang,
  double? billedLebar,
}) {
  final p = _positive(panjang) > 0 ? _positive(panjang) : _positive(billedPanjang);
  final l = _positive(lebar) > 0 ? _positive(lebar) : _positive(billedLebar);
  if (p == 0 || l == 0) return null;
  return '${_fmtDim(p)} × ${_fmtDim(l)} m';
}

/// Jumlah lembar/banner untuk kolom QTY (bukan m²).
/// Mengembalikan null kalau bukan barang berdimensi.
int? hitungQtyLembarCetak(ItemCetakPenjualan item) {
  final panjang = _positive(item.panjang) > 0
      ? _positive(item.panjang)
      : _positive(item.billedPanjang);
  final lebar = _positive(item.lebar) > 0
      ? _positive(item.lebar)
      : _positive(item.billedLebar);
  if (panjang == 0 || lebar == 0) return null;

  if (item.jumlahRoll != null) {
    return math.max(1, (item.jumlahRoll!).round());
  }
  if (item.jumlahLembar != null) {
    return math.max(1, (item.jumlahLembar!).round());
  }

  final pieceArea = panjang * lebar;
  final stored = _positive(item.jumlah);
  if (stored >= pieceArea - 0.001) {
    final pieces = (stored / pieceArea).round();
    return pieces >= 1 ? pieces : 1;
  }
  if (stored >= 1 && (stored - stored.roundToDouble()).abs() < 0.001) {
    return stored.round();
  }
  return 1;
}

/// Hasil qty + satuan untuk kolom QTY cetak.
class QtySatuanCetak {
  final double qty;
  final String satuan;
  const QtySatuanCetak({required this.qty, required this.satuan});
}

QtySatuanCetak qtySatuanCetak(ItemCetakPenjualan item) {
  final lembar = hitungQtyLembarCetak(item);
  if (lembar != null) {
    return QtySatuanCetak(qty: lembar.toDouble(), satuan: '');
  }
  return QtySatuanCetak(
    qty: _positive(item.jumlah),
    satuan: (item.namaSatuan ?? '').trim(),
  );
}

/// Label qty cetak: "10" atau "10 lbr" atau "5 pcs".
String formatQtyLabel(ItemCetakPenjualan item) {
  final r = qtySatuanCetak(item);
  final label = _fmtDim(r.qty);
  return r.satuan.isNotEmpty ? '$label ${r.satuan}' : label;
}
