import 'package:flutter/material.dart';
import 'package:gemiprint/features/pos/models/cart_item.dart';
import 'package:gemiprint/features/pos/pos_calc.dart';
import 'package:gemiprint/widgets/invoice_preview.dart';
import 'package:gemiprint/widgets/snackbar_helper.dart';
import 'package:intl/intl.dart';

/// Tampilkan pratinjau penawaran menggunakan widget InvoicePreview bersama.
Future<void> showPenawaranPreview(
  BuildContext context, {
  required List<CartItem> cart,
  required bool roundCartPrices,
  required double biayaTambahanTotal,
  String? customerName,
  String? customerKota,
}) async {
  final raws = cart.map((c) => c.subtotalRaw).toList();
  final charges = allocateCartLineCharges(raws, roundCartPrices);
  final subtotal = charges.fold<double>(0, (s, n) => s + n);
  final total = subtotal + biayaTambahanTotal;

  final date = DateFormat('d MMM yyyy', 'id_ID').format(DateTime.now());

  final lines = <InvoiceLine>[];
  for (var i = 0; i < cart.length; i++) {
    final item = cart[i];
    lines.add(InvoiceLine(
      name: item.barangNama,
      qty: item.jumlah,
      price: item.hargaSatuan,
      subtotal: charges[i],
    ));
  }

  final additionalCharges = <InvoiceCharge>[];
  if (biayaTambahanTotal > 0) {
    additionalCharges.add(InvoiceCharge(
      label: 'Biaya tambahan',
      amount: biayaTambahanTotal,
    ));
  }

  try {
    await InvoicePreview.show(
      context,
      lines: lines,
      title: 'PENAWARAN',
      customerName: customerName,
      customerAddress: customerKota,
      date: date,
      total: total,
      additionalCharges: additionalCharges,
    );
  } catch (e) {
    if (context.mounted) showErrorSnackbar(context, 'Gagal membuat pratinjau');
  }
}
