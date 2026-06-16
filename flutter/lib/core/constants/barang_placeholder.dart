import 'package:gemiprint/models/material_item.dart';

/// Barang placeholder sistem untuk pekerjaan maklon (subkontraktor).
///
/// Di-seed otomatis di backend supaya baris maklon di POS/Pembelian punya
/// barang_id yang valid (FK), tanpa memasukkan barang palsu ke katalog.
/// Mirror dari `src/lib/barang-placeholder.ts` di web. Penyaringan dilakukan
/// di lapisan tampilan saja — barangnya tetap ada untuk lookup internal.
const String idBarangPlaceholderMaklon = 'barang-jasa-maklon';

/// True bila barang ini placeholder sistem (bukan barang katalog).
bool adalahPlaceholderBarang(MaterialItem? barang) {
  return barang?.id == idBarangPlaceholderMaklon;
}

/// Buang placeholder maklon dari daftar barang sebelum ditampilkan.
List<MaterialItem> sembunyikanPlaceholderBarang(List<MaterialItem>? daftar) {
  return (daftar ?? [])
      .where((b) => b.id != idBarangPlaceholderMaklon)
      .toList();
}
