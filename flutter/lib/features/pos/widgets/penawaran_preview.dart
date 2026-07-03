import 'package:flutter/material.dart';
import 'package:gemiprint/core/penjualan_cetak_utils.dart';
import 'package:gemiprint/features/pos/models/cart_item.dart';
import 'package:gemiprint/features/pos/pos_calc.dart';
import 'package:gemiprint/widgets/faktur_preview_page.dart';
import 'package:gemiprint/widgets/snackbar_helper.dart';
import 'package:intl/intl.dart';

/// Tampilkan pratinjau penawaran sebagai halaman Dart (portrait, scrollable).
Future<void> showPenawaranPreview(
  BuildContext context, {
  required List<CartItem> cart,
  required bool roundCartPrices,
  required double biayaTambahanTotal,
  String? customerName,
  String? customerKota,
  FakturShopInfo? shop,
}) async {
  final raws = cart.map((c) => c.subtotalRaw).toList();
  final charges = allocateCartLineCharges(raws, roundCartPrices);
  final subtotal = charges.fold<double>(0, (s, n) => s + n);
  final total = subtotal + biayaTambahanTotal;
  final date = DateFormat('d MMM yyyy', 'id_ID').format(DateTime.now());

  final lines = <FakturLine>[];
  for (var i = 0; i < cart.length; i++) {
    final item = cart[i];
    final cetak = ItemCetakPenjualan(
      jumlah: item.jumlah,
      namaSatuan: item.namaSatuan,
      panjang: item.panjang,
      lebar: item.lebar,
      billedPanjang: item.billedPanjang,
      billedLebar: item.billedLebar,
    );
    final qs = qtySatuanCetak(cetak);
    final ukuran = formatUkuranCetakInput(
      panjang: item.panjang,
      lebar: item.lebar,
      billedPanjang: item.billedPanjang,
      billedLebar: item.billedLebar,
    );
    final lineCharge = charges[i];
    lines.add(FakturLine(
      name: item.barangNama,
      ukuran: ukuran,
      qty: qs.qty,
      satuan: qs.satuan.isEmpty ? null : qs.satuan,
      harga: qs.qty > 0 ? lineCharge / qs.qty : item.hargaSatuan,
      jumlah: lineCharge,
      biayaTambahan: item.biayaTambahan
          .where((b) => b.nominal > 0 && b.label.trim().isNotEmpty)
          .map((b) => FakturLineCharge(label: b.label.trim(), nominal: b.nominal))
          .toList(),
    ));
  }

  final additionalCharges = <FakturCharge>[];
  if (biayaTambahanTotal > 0) {
    additionalCharges.add(
      FakturCharge(label: 'Biaya tambahan', amount: biayaTambahanTotal),
    );
  }

  try {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => FakturPreviewPage(
          title: 'PENAWARAN',
          customerName: customerName,
          customerDetail: customerKota != null ? [customerKota] : const [],
          date: date,
          total: total,
          lines: lines,
          additionalCharges: additionalCharges,
          shop: shop,
        ),
      ),
    );
  } catch (e) {
    if (context.mounted) showErrorSnackbar(context, 'Gagal membuat pratinjau');
  }
}
