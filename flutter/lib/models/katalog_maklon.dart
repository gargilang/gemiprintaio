/// Model Katalog Extra (maklon) dan baris pending Vendor/HPP untuk Flutter.
///
/// `nama_satuan` dikunci ke `m2` saat `butuhDimensiStatus` aktif karena harga
/// dihitung per m² (lebar × panjang × jumlah). UI boleh menampilkan `m2`.
class KatalogMaklon {
  final String id;
  final String namaProduk;
  final String namaSatuan;
  final double hargaJualDefault;
  final double biayaSubkontrakDefault;
  final String? vendorSubkontrakIdDefault;
  final String metodeBayarVendorDefault;
  final String? kategori;
  final String? kategoriId;
  final String? kategoriNama;
  final bool populerStatus;
  final bool butuhDimensiStatus;
  final String? catatanInternal;
  final bool isAktif;
  final int urutan;
  final String? dibuatPada;
  final String? diperbaruiPada;

  const KatalogMaklon({
    required this.id,
    required this.namaProduk,
    required this.namaSatuan,
    required this.hargaJualDefault,
    required this.biayaSubkontrakDefault,
    this.vendorSubkontrakIdDefault,
    this.metodeBayarVendorDefault = 'CASH',
    this.kategori,
    this.kategoriId,
    this.kategoriNama,
    this.populerStatus = false,
    this.butuhDimensiStatus = false,
    this.catatanInternal,
    this.isAktif = true,
    this.urutan = 0,
    this.dibuatPada,
    this.diperbaruiPada,
  });

  factory KatalogMaklon.fromJson(Map<String, dynamic> json) {
    return KatalogMaklon(
      id: json['id'] as String,
      namaProduk: (json['nama_produk'] ?? '') as String,
      namaSatuan: (json['nama_satuan'] ?? 'pcs') as String,
      hargaJualDefault: (json['harga_jual_default'] as num?)?.toDouble() ?? 0,
      biayaSubkontrakDefault:
          (json['biaya_subkontrak_default'] as num?)?.toDouble() ?? 0,
      vendorSubkontrakIdDefault:
          json['vendor_subkontrak_id_default'] as String?,
      metodeBayarVendorDefault: _parseMetodeBayar(
        json['metode_bayar_vendor_default'],
      ),
      kategori: json['kategori'] as String?,
      kategoriId: json['kategori_id'] as String?,
      kategoriNama: json['kategori_nama'] as String?,
      populerStatus: _boolFromJson(json['populer_status']),
      butuhDimensiStatus: _boolFromJson(json['butuh_dimensi_status']),
      catatanInternal: json['catatan_internal'] as String?,
      isAktif: _boolFromJson(json['is_aktif'], defaultValue: true),
      urutan: (json['urutan'] as num?)?.toInt() ?? 0,
      dibuatPada: (json['dibuat_pada'] ?? json['created_at']) as String?,
      diperbaruiPada:
          (json['diperbarui_pada'] ?? json['updated_at']) as String?,
    );
  }

  /// Payload untuk POST/PUT `/api/katalog-maklon`. `nama_satuan` dikunci ke
  /// `m2` saat `butuhDimensiStatus` aktif.
  Map<String, dynamic> toPayload() => {
    'nama_produk': namaProduk.trim(),
    'nama_satuan': butuhDimensiStatus ? 'm2' : namaSatuan.trim(),
    'harga_jual_default': hargaJualDefault,
    'biaya_subkontrak_default': biayaSubkontrakDefault,
    'vendor_subkontrak_id_default': vendorSubkontrakIdDefault,
    'metode_bayar_vendor_default': metodeBayarVendorDefault,
    'kategori': kategori,
    'kategori_id': kategoriId,
    'populer_status': populerStatus ? 1 : 0,
    'butuh_dimensi_status': butuhDimensiStatus ? 1 : 0,
    'catatan_internal': catatanInternal,
    'is_aktif': isAktif ? 1 : 0,
    'urutan': urutan,
  };
}

/// Baris item penjualan maklon yang belum punya vendor/HPP (pending reconcile).
class PendingMaklon {
  final String id;
  final String penjualanId;
  final String tipeItem;
  final String? katalogMaklonId;
  final String? deskripsiPekerjaan;
  final double jumlah;
  final double hargaSatuan;
  final double subtotal;
  final bool pendingVendorHpp;
  final String? nomorFaktur;
  final String? tanggal;
  final String? pelangganNama;

  const PendingMaklon({
    required this.id,
    required this.penjualanId,
    required this.tipeItem,
    this.katalogMaklonId,
    this.deskripsiPekerjaan,
    this.jumlah = 0,
    this.hargaSatuan = 0,
    this.subtotal = 0,
    this.pendingVendorHpp = false,
    this.nomorFaktur,
    this.tanggal,
    this.pelangganNama,
  });

  factory PendingMaklon.fromJson(Map<String, dynamic> json) {
    return PendingMaklon(
      id: json['id'] as String,
      penjualanId: (json['penjualan_id'] ?? '') as String,
      tipeItem: (json['tipe_item'] ?? '') as String,
      katalogMaklonId: json['katalog_maklon_id'] as String?,
      deskripsiPekerjaan: json['deskripsi_pekerjaan'] as String?,
      jumlah: (json['jumlah'] as num?)?.toDouble() ?? 0,
      hargaSatuan: (json['harga_satuan'] as num?)?.toDouble() ?? 0,
      subtotal: (json['subtotal'] as num?)?.toDouble() ?? 0,
      pendingVendorHpp: _boolFromJson(json['pending_vendor_hpp']),
      nomorFaktur: json['nomor_faktur'] as String?,
      tanggal: json['tanggal'] as String?,
      pelangganNama: json['pelanggan_nama'] as String?,
    );
  }
}

bool _boolFromJson(Object? value, {bool defaultValue = false}) {
  if (value == null) return defaultValue;
  return value == true || value == 1 || value == '1';
}

String _parseMetodeBayar(Object? value) {
  final s = value?.toString().toUpperCase();
  if (s == 'TRANSFER' || s == 'NET30') return s!;
  return 'CASH';
}
