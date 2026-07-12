import 'package:flutter_test/flutter_test.dart';
import 'package:gemiprint/models/sale.dart';

void main() {
  test('SaleItem displayName prefers nama_produk_jual', () {
    final item = SaleItem.fromJson({
      'id': 'it-1',
      'penjualan_id': 'sale-1',
      'barang_id': 'barang-1',
      'barang_nama': 'Banner',
      'nama_produk_jual': 'Banner Flexi 280',
      'jumlah': 1,
      'harga_satuan': 25000,
      'subtotal': 25000,
      'nama_satuan': 'm²',
    });

    expect(item.namaProdukJual, 'Banner Flexi 280');
    expect(item.displayName, 'Banner Flexi 280');
  });

  test('SaleItem displayName fallback ke barang_nama lalu barang_id', () {
    final tanpaProduk = SaleItem.fromJson({
      'id': 'it-2',
      'penjualan_id': 'sale-1',
      'barang_id': 'barang-2',
      'barang_nama': 'Stiker Vinyl',
      'jumlah': 1,
      'harga_satuan': 5000,
      'subtotal': 5000,
    });
    expect(tanpaProduk.displayName, 'Stiker Vinyl');

    final tanpaNama = SaleItem.fromJson({
      'id': 'it-3',
      'penjualan_id': 'sale-1',
      'barang_id': 'barang-3',
      'jumlah': 1,
      'harga_satuan': 5000,
      'subtotal': 5000,
    });
    expect(tanpaNama.displayName, 'barang-3');
  });
}
