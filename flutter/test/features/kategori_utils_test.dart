import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gemiprint/features/finance/kategori_utils.dart';

void main() {
  group('humanizeKategoriKode', () {
    test('SCREAMING_SNAKE_CASE jadi Title Case', () {
      expect(humanizeKategoriKode('PINJAMAN_KARYAWAN'), 'Pinjaman Karyawan');
      expect(humanizeKategoriKode('KAS'), 'Kas');
      expect(humanizeKategoriKode('BIAYA_OPERASIONAL'), 'Biaya Operasional');
      expect(humanizeKategoriKode(''), '');
    });
  });

  group('stripReferenceId', () {
    test('buang token [REF:xxx] dan rapikan spasi', () {
      expect(stripReferenceId('Penjualan POS [REF:sale-123]'), 'Penjualan POS');
      expect(stripReferenceId('Beli ATK'), 'Beli ATK');
      expect(stripReferenceId(null), '');
      expect(stripReferenceId('[REF:pinjaman-9]'), '');
    });
  });

  group('kategoriWarna', () {
    test('kategori dikenal punya warna spesifik (bukan abu-abu default)', () {
      final defaultBg = kategoriWarna('KODE_TIDAK_DIKENAL').bg;
      expect(kategoriWarna('KAS').bg, isNot(defaultBg));
      expect(kategoriWarna('BIAYA').bg, isNot(defaultBg));
      expect(kategoriWarna('OMZET').bg, isNot(defaultBg));
      expect(kategoriWarna('INVESTOR').bg, isNot(defaultBg));
      expect(kategoriWarna('PINJAMAN_KARYAWAN').bg, isNot(defaultBg));
    });

    test('case-insensitive terhadap kode', () {
      expect(kategoriWarna('kas').bg, kategoriWarna('KAS').bg);
    });

    test('mengembalikan bg + text bertipe Color', () {
      final w = kategoriWarna('OMZET');
      expect(w.bg, isA<Color>());
      expect(w.text, isA<Color>());
    });
  });
}
