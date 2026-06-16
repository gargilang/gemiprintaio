import 'package:flutter/material.dart';

/// Pasangan warna badge kategori (latar + teks).
class KategoriWarna {
  final Color bg;
  final Color text;
  const KategoriWarna(this.bg, this.text);
}

/// Buang token `[REF:xxx]` dari teks tampilan (tetap utuh di DB).
/// Port dari web `src/app/keuangan/keuangan-utils.ts` stripReferenceId.
String stripReferenceId(String? text) {
  if (text == null) return '';
  return text.replaceAll(RegExp(r'\s*\[REF:[^\]]+\]'), '').trim();
}

/// Ubah kode kategori SCREAMING_SNAKE_CASE jadi label ramah manusia.
/// Contoh: "PINJAMAN_KARYAWAN" → "Pinjaman Karyawan".
/// Port dari web humanizeKategoriKode.
String humanizeKategoriKode(String kode) {
  return kode
      .toLowerCase()
      .split(RegExp(r'[_\s]+'))
      .where((k) => k.isNotEmpty)
      .map((k) => k[0].toUpperCase() + k.substring(1))
      .join(' ');
}

// Latar = Tailwind *-100, Teks = Tailwind *-800.
const _palet = <String, KategoriWarna>{
  'KAS': KategoriWarna(Color(0xFFDBEAFE), Color(0xFF1E40AF)), // blue
  'BIAYA': KategoriWarna(Color(0xFFFEE2E2), Color(0xFF991B1B)), // red
  'OMZET': KategoriWarna(Color(0xFFDCFCE7), Color(0xFF166534)), // green
  'INVESTOR': KategoriWarna(Color(0xFFF3E8FF), Color(0xFF6B21A8)), // purple
  'SUBSIDI': KategoriWarna(Color(0xFFFEF9C3), Color(0xFF854D0E)), // yellow
  'LUNAS': KategoriWarna(Color(0xFFCCFBF1), Color(0xFF115E59)), // teal
  'SUPPLY': KategoriWarna(Color(0xFFFFEDD5), Color(0xFF9A3412)), // orange
  'RETUR_PEMBELIAN': KategoriWarna(Color(0xFFD1FAE5), Color(0xFF065F46)), // emerald
  'RETUR_PENJUALAN': KategoriWarna(Color(0xFFFFE4E6), Color(0xFF9F1239)), // rose
  'RETUR_PENJUALAN_NONCASH': KategoriWarna(Color(0xFFFFF1F2), Color(0xFFBE123C)),
  'RETUR_HPP': KategoriWarna(Color(0xFFF1F5F9), Color(0xFF1E293B)), // slate
  'HPP': KategoriWarna(Color(0xFFF1F5F9), Color(0xFF1E293B)), // slate
  'LABA': KategoriWarna(Color(0xFFD1FAE5), Color(0xFF065F46)), // emerald
  'KOMISI': KategoriWarna(Color(0xFFCFFAFE), Color(0xFF155E75)), // cyan
  'TABUNGAN': KategoriWarna(Color(0xFFE0E7FF), Color(0xFF3730A3)), // indigo
  'HUTANG': KategoriWarna(Color(0xFFFFE4E6), Color(0xFF9F1239)), // rose
  'PIUTANG': KategoriWarna(Color(0xFFECFCCB), Color(0xFF3F6212)), // lime
  'MAKLON': KategoriWarna(Color(0xFFFAE8FF), Color(0xFF86198F)), // fuchsia
  'PINJAMAN_KARYAWAN': KategoriWarna(Color(0xFFFEF3C7), Color(0xFF92400E)), // amber (deviasi)
};

const _default = KategoriWarna(Color(0xFFF3F4F6), Color(0xFF1F2937)); // gray

/// Warna badge untuk kode kategori. Fallback ke abu-abu untuk kode tak dikenal.
KategoriWarna kategoriWarna(String kode) {
  return _palet[kode.toUpperCase()] ?? _default;
}
