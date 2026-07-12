import 'package:flutter_test/flutter_test.dart';
import 'package:gemiprint/features/pos/models/katalog_maklon.dart';

void main() {
  test('KatalogMaklon.fromJson parses defaults and flags', () {
    final item = KatalogMaklon.fromJson({
      'id': 'kat-1',
      'nama_produk': 'Hardcover Custom',
      'nama_satuan': 'pcs',
      'harga_jual_default': 120000,
      'biaya_subkontrak_default': 80000,
      'vendor_subkontrak_id_default': 'vendor-1',
      'metode_bayar_vendor_default': 'TRANSFER',
      'kategori_nama': 'Lain-lain',
      'populer_status': 1,
      'butuh_dimensi_status': 1,
      'is_aktif': 1,
    });

    expect(item.id, 'kat-1');
    expect(item.namaProduk, 'Hardcover Custom');
    expect(item.namaSatuan, 'pcs');
    expect(item.hargaJualDefault, 120000);
    expect(item.biayaSubkontrakDefault, 80000);
    expect(item.vendorSubkontrakIdDefault, 'vendor-1');
    expect(item.metodeBayarVendorDefault, 'TRANSFER');
    expect(item.kategoriNama, 'Lain-lain');
    expect(item.isPopuler, true);
    expect(item.butuhDimensi, true);
    expect(item.isAktif, true);
    expect(item.hasCompleteVendorHpp, true);
  });

  test('KatalogMaklon.fromJson tanpa vendor/HPP dianggap pending', () {
    final item = KatalogMaklon.fromJson({
      'id': 'kat-2',
      'nama_produk': 'Kartu Nama',
      'nama_satuan': 'pcs',
      'harga_jual_default': 50000,
      'biaya_subkontrak_default': 0,
      'vendor_subkontrak_id_default': null,
      'metode_bayar_vendor_default': null,
    });

    expect(item.hasCompleteVendorHpp, false);
    expect(item.isPopuler, false);
    expect(item.butuhDimensi, false);
    expect(item.isAktif, true);
  });
}
