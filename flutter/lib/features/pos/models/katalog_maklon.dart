/// Katalog maklon existing dari web (read-only di Flutter).
///
/// Flutter hanya memilih & mengonfigurasi item katalog yang sudah ada untuk
/// dimasukkan ke keranjang; pembuatan/pengubahan katalog tetap di web app.
/// Mirror dari `KatalogMaklon` pada `src/lib/services/katalog-maklon-service.ts`.
class KatalogMaklon {
  final String id;
  final String namaProduk;
  final String namaSatuan;
  final double hargaJualDefault;
  final double biayaSubkontrakDefault;
  final String? vendorSubkontrakIdDefault;
  final String? metodeBayarVendorDefault;
  final String? kategori;
  final String? kategoriId;
  final String? kategoriNama;
  final int populerStatus;
  final bool butuhDimensi;
  final String? catatanInternal;
  final bool isAktif;

  const KatalogMaklon({
    required this.id,
    required this.namaProduk,
    required this.namaSatuan,
    required this.hargaJualDefault,
    required this.biayaSubkontrakDefault,
    this.vendorSubkontrakIdDefault,
    this.metodeBayarVendorDefault,
    this.kategori,
    this.kategoriId,
    this.kategoriNama,
    this.populerStatus = 0,
    this.butuhDimensi = false,
    this.catatanInternal,
    this.isAktif = true,
  });

  bool get isPopuler => populerStatus == 1;

  /// Katalog dianggap lengkap bila vendor, biaya subkontrak, dan metode bayar
  /// vendor tersedia. Jika tidak, item tetap boleh masuk cart sebagai pending
  /// maklon (backend yang melengkapi vendor/HPP kemudian).
  bool get hasCompleteVendorHpp =>
      (vendorSubkontrakIdDefault?.isNotEmpty ?? false) &&
      biayaSubkontrakDefault > 0 &&
      (metodeBayarVendorDefault?.isNotEmpty ?? false);

  factory KatalogMaklon.fromJson(Map<String, dynamic> json) {
    return KatalogMaklon(
      id: (json['id'] ?? '') as String,
      namaProduk: (json['nama_produk'] ?? '') as String,
      namaSatuan: (json['nama_satuan'] ?? 'pcs') as String,
      hargaJualDefault: (json['harga_jual_default'] as num?)?.toDouble() ?? 0,
      biayaSubkontrakDefault:
          (json['biaya_subkontrak_default'] as num?)?.toDouble() ?? 0,
      vendorSubkontrakIdDefault: json['vendor_subkontrak_id_default'] as String?,
      metodeBayarVendorDefault: json['metode_bayar_vendor_default'] as String?,
      kategori: json['kategori'] as String?,
      kategoriId: json['kategori_id'] as String?,
      kategoriNama: json['kategori_nama'] as String?,
      populerStatus: (json['populer_status'] as num?)?.toInt() ?? 0,
      butuhDimensi: _boolFromJson(json['butuh_dimensi_status']),
      catatanInternal: json['catatan_internal'] as String?,
      isAktif: _boolFromJson(json['is_aktif'], defaultValue: true),
    );
  }
}

bool _boolFromJson(Object? value, {bool defaultValue = false}) {
  if (value == null) return defaultValue;
  return value == true || value == 1 || value == '1';
}
