import 'package:gemiprint/features/pos/models/finishing_option.dart';

/// Baris keranjang POS. Mirror dari web `src/app/pos/pos-types.ts` CartItem.
///
/// `jumlah` selalu dihitung saat item dibuat (m² untuk dimensi, qty untuk
/// non-dimensi, qty untuk maklon). `subtotalRaw = jumlah × hargaSatuan`.
class CartItem {
  final String barangId;
  final String barangNama;
  final String hargaSatuanId;
  final String namaSatuan;
  final double faktorKonversi;

  /// Harga satuan berlaku (bisa di-override). [originalHargaSatuan] disimpan
  /// untuk badge "override" + reset.
  double hargaSatuan;
  final double originalHargaSatuan;

  final bool butuhDimensi;

  // Dimensi (input asli + hasil pembulatan roll)
  final double? panjang;
  final double? lebar;
  final bool useRounding;
  final double? selectedRollSize;
  final double? billedPanjang;
  final double? billedLebar;

  /// Kuantitas final: m² (dimensi) atau qty (non-dimensi/maklon).
  double jumlah;

  List<FinishingSelection> finishing;

  // Maklon (subkontrak)
  final String tipeItem; // 'BARANG' | 'MAKLON'
  final String? vendorSubkontrakId;
  final String? vendorSubkontrakNama;
  final double? biayaSubkontrak;
  final String? metodeBayarVendor; // 'CASH' | 'NET30'
  final String? deskripsiPekerjaan;

  CartItem({
    required this.barangId,
    required this.barangNama,
    required this.hargaSatuanId,
    required this.namaSatuan,
    required this.faktorKonversi,
    required this.hargaSatuan,
    required this.originalHargaSatuan,
    required this.butuhDimensi,
    required this.jumlah,
    this.panjang,
    this.lebar,
    this.useRounding = false,
    this.selectedRollSize,
    this.billedPanjang,
    this.billedLebar,
    this.finishing = const [],
    this.tipeItem = 'BARANG',
    this.vendorSubkontrakId,
    this.vendorSubkontrakNama,
    this.biayaSubkontrak,
    this.metodeBayarVendor,
    this.deskripsiPekerjaan,
  });

  bool get isMaklon => tipeItem == 'MAKLON';

  double get subtotalRaw => jumlah * hargaSatuan;

  bool get isOverride => (hargaSatuan - originalHargaSatuan).abs() > 0.005;

  /// Bangun payload item untuk `createSale`. [lineCharge] adalah tagihan baris
  /// setelah alokasi pembulatan (lihat `allocateCartLineCharges`). Harga satuan
  /// dihitung ulang dari lineCharge supaya baris menjumlah persis ke total.
  Map<String, dynamic> toSalePayload(double lineCharge) {
    final unit = jumlah > 0 ? lineCharge / jumlah : lineCharge;
    return {
      'barang_id': barangId,
      'harga_satuan_id': hargaSatuanId,
      'nama_satuan': namaSatuan,
      'faktor_konversi': faktorKonversi,
      'jumlah': jumlah,
      'harga_satuan': unit,
      'subtotal': lineCharge,
      if (panjang != null) 'panjang': panjang,
      if (lebar != null) 'lebar': lebar,
      if (billedPanjang != null) 'billed_panjang': billedPanjang,
      if (billedLebar != null) 'billed_lebar': billedLebar,
      if (selectedRollSize != null) 'selectedRollSize': selectedRollSize,
      if (finishing.isNotEmpty)
        'finishing': finishing.map((f) => f.toJson()).toList(),
      if (isMaklon) ...{
        'tipe_item': 'MAKLON',
        'vendor_subkontrak_id': vendorSubkontrakId,
        'biaya_subkontrak': biayaSubkontrak,
        'metode_bayar_vendor': metodeBayarVendor,
        'deskripsi_pekerjaan': deskripsiPekerjaan,
      },
    };
  }
}
