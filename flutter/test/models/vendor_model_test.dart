import 'package:flutter_test/flutter_test.dart';
import 'package:gemiprint/models/vendor.dart';

void main() {
  group('Vendor model', () {
    test('fromJson parses all fields including tipe_vendor', () {
      final json = {
        'id': 'v1',
        'nama_perusahaan': 'PT Kertas Nusantara',
        'email': 'pt@contoh.com',
        'telepon': '0811-2222-3333',
        'alamat': 'Jl. Merdeka 1',
        'kontak_person': 'Hendra',
        'ketentuan_bayar': 'NET30',
        'aktif_status': 1,
        'catatan': 'Supplier utama',
        'tipe_vendor': 'SUPPLIER',
        'created_at': '2026-01-01',
        'updated_at': '2026-06-01',
      };

      final v = Vendor.fromJson(json);

      expect(v.id, 'v1');
      expect(v.namaPerusahaan, 'PT Kertas Nusantara');
      expect(v.email, 'pt@contoh.com');
      expect(v.telepon, '0811-2222-3333');
      expect(v.alamat, 'Jl. Merdeka 1');
      expect(v.kontakPerson, 'Hendra');
      expect(v.ketentuanBayar, 'NET30');
      expect(v.aktifStatus, true);
      expect(v.catatan, 'Supplier utama');
      expect(v.tipeVendor, 'SUPPLIER');
    });

    test('fromJson defaults tipe_vendor to SUPPLIER when missing', () {
      final json = {
        'id': 'v2',
        'nama_perusahaan': 'CV Cetak',
        'email': '',
        'telepon': '',
        'alamat': '',
        'aktif_status': 1,
      };

      final v = Vendor.fromJson(json);

      expect(v.tipeVendor, 'SUPPLIER');
    });

    test('fromJson handles SUBKONTRAKTOR and KEDUANYA', () {
      final sub = Vendor.fromJson({
        'id': 'v3',
        'nama_perusahaan': 'X',
        'email': '',
        'telepon': '',
        'alamat': '',
        'aktif_status': 1,
        'tipe_vendor': 'SUBKONTRAKTOR'
      });
      expect(sub.tipeVendor, 'SUBKONTRAKTOR');

      final both = Vendor.fromJson({
        'id': 'v4',
        'nama_perusahaan': 'Y',
        'email': '',
        'telepon': '',
        'alamat': '',
        'aktif_status': 1,
        'tipe_vendor': 'KEDUANYA'
      });
      expect(both.tipeVendor, 'KEDUANYA');
    });

    test('toJson includes tipe_vendor', () {
      final v = Vendor(
        id: 'v1',
        namaPerusahaan: 'PT Kertas',
        email: 'a@b.com',
        telepon: '123',
        alamat: 'Jl. A',
        kontakPerson: 'Hendra',
        ketentuanBayar: 'NET30',
        tipeVendor: 'SUPPLIER',
        aktifStatus: true,
      );

      final json = v.toJson();
      expect(json['tipe_vendor'], 'SUPPLIER');
      expect(json['nama_perusahaan'], 'PT Kertas');
      expect(json['aktif_status'], true);
    });
  });
}
