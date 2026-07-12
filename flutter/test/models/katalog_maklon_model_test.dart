import 'package:flutter_test/flutter_test.dart';
import 'package:gemiprint/models/katalog_maklon.dart';

void main() {
  group('KatalogMaklon', () {
    test('fromJson parses katalog extra fields', () {
      final item = KatalogMaklon.fromJson({
        'id': 'km-1',
        'nama_produk': 'Cetak Banner',
        'nama_satuan': 'm2',
        'harga_jual_default': 50000,
        'biaya_subkontrak_default': 30000,
        'vendor_subkontrak_id_default': 'v-1',
        'metode_bayar_vendor_default': 'TRANSFER',
        'kategori': 'Banner',
        'kategori_id': 'kat-1',
        'kategori_nama': 'Banner',
        'populer_status': 1,
        'butuh_dimensi_status': 1,
        'catatan_internal': 'Vendor A',
        'is_aktif': 1,
        'urutan': 3,
        'dibuat_pada': '2026-07-12',
        'diperbarui_pada': '2026-07-12',
      });

      expect(item.id, 'km-1');
      expect(item.namaProduk, 'Cetak Banner');
      expect(item.namaSatuan, 'm2');
      expect(item.hargaJualDefault, 50000);
      expect(item.biayaSubkontrakDefault, 30000);
      expect(item.vendorSubkontrakIdDefault, 'v-1');
      expect(item.metodeBayarVendorDefault, 'TRANSFER');
      expect(item.kategori, 'Banner');
      expect(item.kategoriId, 'kat-1');
      expect(item.kategoriNama, 'Banner');
      expect(item.populerStatus, isTrue);
      expect(item.butuhDimensiStatus, isTrue);
      expect(item.catatanInternal, 'Vendor A');
      expect(item.isAktif, isTrue);
      expect(item.urutan, 3);
      expect(item.dibuatPada, '2026-07-12');
      expect(item.diperbaruiPada, '2026-07-12');
    });

    test('fromJson defaults is_aktif to true when field absent', () {
      final item = KatalogMaklon.fromJson({
        'id': 'km-2',
        'nama_produk': 'Spanduk',
      });

      expect(item.isAktif, isTrue);
      expect(item.namaSatuan, 'pcs');
      expect(item.metodeBayarVendorDefault, 'CASH');
      expect(item.populerStatus, isFalse);
      expect(item.butuhDimensiStatus, isFalse);
    });

    test('toPayload locks satuan to m2 when dimension is enabled', () {
      const item = KatalogMaklon(
        id: 'km-1',
        namaProduk: 'Banner',
        namaSatuan: 'pcs',
        hargaJualDefault: 10000,
        biayaSubkontrakDefault: 5000,
        metodeBayarVendorDefault: 'CASH',
        butuhDimensiStatus: true,
      );

      final payload = item.toPayload();
      expect(payload['nama_satuan'], 'm2');
      expect(payload['butuh_dimensi_status'], 1);
    });

    test('toPayload keeps custom satuan when dimension is disabled', () {
      const item = KatalogMaklon(
        id: 'km-1',
        namaProduk: 'Stiker',
        namaSatuan: 'lembar',
        hargaJualDefault: 2000,
        biayaSubkontrakDefault: 1000,
        metodeBayarVendorDefault: 'CASH',
        butuhDimensiStatus: false,
      );

      final payload = item.toPayload();
      expect(payload['nama_satuan'], 'lembar');
      expect(payload['butuh_dimensi_status'], 0);
    });

    test('toPayload sends numeric flags and aktif state', () {
      const item = KatalogMaklon(
        id: 'km-1',
        namaProduk: 'Banner',
        namaSatuan: 'm2',
        hargaJualDefault: 10000,
        biayaSubkontrakDefault: 5000,
        metodeBayarVendorDefault: 'NET30',
        populerStatus: true,
        isAktif: false,
        urutan: 7,
      );

      final payload = item.toPayload();
      expect(payload['populer_status'], 1);
      expect(payload['is_aktif'], 0);
      expect(payload['urutan'], 7);
      expect(payload['metode_bayar_vendor_default'], 'NET30');
    });
  });

  group('PendingMaklon', () {
    test('fromJson parses pending row fields', () {
      final row = PendingMaklon.fromJson({
        'id': 'it-1',
        'penjualan_id': 'sale-1',
        'tipe_item': 'MAKLON',
        'katalog_maklon_id': 'km-1',
        'deskripsi_pekerjaan': 'Banner',
        'jumlah': 2,
        'harga_satuan': 50000,
        'subtotal': 100000,
        'pending_vendor_hpp': 1,
        'nomor_faktur': 'INV-1',
        'tanggal': '2026-07-12',
        'pelanggan_nama': 'Pelanggan Umum',
      });

      expect(row.id, 'it-1');
      expect(row.penjualanId, 'sale-1');
      expect(row.tipeItem, 'MAKLON');
      expect(row.katalogMaklonId, 'km-1');
      expect(row.deskripsiPekerjaan, 'Banner');
      expect(row.jumlah, 2);
      expect(row.hargaSatuan, 50000);
      expect(row.subtotal, 100000);
      expect(row.pendingVendorHpp, isTrue);
      expect(row.nomorFaktur, 'INV-1');
      expect(row.tanggal, '2026-07-12');
      expect(row.pelangganNama, 'Pelanggan Umum');
    });

    test('fromJson handles missing optional fields', () {
      final row = PendingMaklon.fromJson({
        'id': 'it-2',
        'penjualan_id': 'sale-2',
        'tipe_item': 'MAKLON',
      });

      expect(row.katalogMaklonId, isNull);
      expect(row.deskripsiPekerjaan, isNull);
      expect(row.jumlah, 0);
      expect(row.subtotal, 0);
      expect(row.pendingVendorHpp, isFalse);
      expect(row.nomorFaktur, isNull);
      expect(row.pelangganNama, isNull);
    });
  });
}