import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

class InvoicePreview {
  static Future<void> show(
    BuildContext context, {
    required List<InvoiceLine> lines,
    required String title,
    String? customerName,
    String? customerAddress,
    String? invoiceNumber,
    String? date,
    double total = 0,
    List<InvoiceCharge> additionalCharges = const [],
  }) async {
    final doc = pw.Document();
    final font = await PdfGoogleFonts.nunitoRegular();
    final bold = await PdfGoogleFonts.nunitoBold();
    doc.addPage(
      pw.MultiPage(
        pageFormat: PdfPageFormat.roll80,
        build: (ctx) => [
          pw.Header(
            level: 0,
            child: pw.Text(
              title,
              style: pw.TextStyle(font: bold, fontSize: 14),
            ),
          ),
          if (invoiceNumber != null)
            pw.Text(
              'No: $invoiceNumber',
              style: pw.TextStyle(font: font, fontSize: 10),
            ),
          if (date != null)
            pw.Text(
              'Tanggal: $date',
              style: pw.TextStyle(font: font, fontSize: 10),
            ),
          if (customerName != null)
            pw.Text(
              'Pelanggan: $customerName',
              style: pw.TextStyle(font: font, fontSize: 10),
            ),
          if (customerAddress != null)
            pw.Text(
              customerAddress,
              style: pw.TextStyle(font: font, fontSize: 9),
            ),
          pw.SizedBox(height: 10),
          ...lines.map(
            (line) => pw.Row(
              children: [
                pw.Expanded(
                  child: pw.Text(
                    line.name,
                    style: pw.TextStyle(font: font, fontSize: 9),
                  ),
                ),
                pw.Text(
                  '${line.qty} × ${line.priceFormatted}',
                  style: pw.TextStyle(font: font, fontSize: 9),
                ),
                pw.SizedBox(width: 10),
                pw.Text(
                  line.subtotalFormatted,
                  style: pw.TextStyle(font: font, fontSize: 9),
                ),
              ],
            ),
          ),
          if (additionalCharges.isNotEmpty) ...[
            pw.SizedBox(height: 4),
            ...additionalCharges.map(
              (c) => pw.Row(
                children: [
                  pw.Expanded(
                    child: pw.Text(
                      c.label,
                      style: pw.TextStyle(font: font, fontSize: 9),
                    ),
                  ),
                  pw.Text(
                    c.amountFormatted,
                    style: pw.TextStyle(font: font, fontSize: 9),
                  ),
                ],
              ),
            ),
          ],
          pw.Divider(),
          pw.Row(
            mainAxisAlignment: pw.MainAxisAlignment.end,
            children: [
              pw.Text('TOTAL: ', style: pw.TextStyle(font: bold, fontSize: 11)),
              pw.Text(
                _formatRupiah(total),
                style: pw.TextStyle(font: bold, fontSize: 11),
              ),
            ],
          ),
        ],
      ),
    );
    final bytes = await doc.save();
    final filename = _pdfFilename(title, invoiceNumber);
    try {
      await Printing.layoutPdf(onLayout: (_) async => bytes);
    } catch (_) {
      await Printing.sharePdf(bytes: bytes, filename: filename);
    }
  }

  static String _pdfFilename(String title, String? invoiceNumber) {
    if (invoiceNumber != null && invoiceNumber.trim().isNotEmpty) {
      final safe = invoiceNumber.replaceAll(RegExp(r'[^a-zA-Z0-9._-]+'), '_');
      return '$safe.pdf';
    }
    final safeTitle = title
        .toLowerCase()
        .replaceAll(RegExp(r'[^a-z0-9]+'), '_')
        .replaceAll(RegExp(r'^_|_$'), '');
    return '${safeTitle.isEmpty ? 'dokumen' : safeTitle}.pdf';
  }

  static String _formatRupiah(double value) {
    return NumberFormat.currency(
      locale: 'id_ID',
      symbol: 'Rp ',
      decimalDigits: 0,
    ).format(value);
  }
}

class InvoiceLine {
  final String name;
  final double qty;
  final double price;
  final double subtotal;
  const InvoiceLine({
    required this.name,
    required this.qty,
    required this.price,
    required this.subtotal,
  });
  String get priceFormatted => InvoicePreview._formatRupiah(price);
  String get subtotalFormatted => InvoicePreview._formatRupiah(subtotal);
}

class InvoiceCharge {
  final String label;
  final double amount;
  const InvoiceCharge({required this.label, required this.amount});
  String get amountFormatted => InvoicePreview._formatRupiah(amount);
}
