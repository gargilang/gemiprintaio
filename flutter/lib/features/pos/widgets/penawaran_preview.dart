import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:gemiprint/core/theme/app_theme.dart';
import 'package:gemiprint/features/pos/models/cart_item.dart';
import 'package:gemiprint/features/pos/pos_calc.dart';
import 'package:gemiprint/widgets/snackbar_helper.dart';
import 'package:intl/intl.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

/// Tampilkan pratinjau penawaran (preview saja — TIDAK menyimpan record DB).
Future<void> showPenawaranPreview(
  BuildContext context, {
  required List<CartItem> cart,
  required bool roundCartPrices,
  required double biayaTambahanTotal,
  String? customerName,
  String? customerKota,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Colors.transparent,
    builder: (ctx) => _PenawaranBody(
      cart: cart,
      roundCartPrices: roundCartPrices,
      biayaTambahanTotal: biayaTambahanTotal,
      customerName: customerName,
      customerKota: customerKota,
    ),
  );
}

class _PenawaranBody extends StatefulWidget {
  final List<CartItem> cart;
  final bool roundCartPrices;
  final double biayaTambahanTotal;
  final String? customerName;
  final String? customerKota;
  const _PenawaranBody({
    required this.cart,
    required this.roundCartPrices,
    required this.biayaTambahanTotal,
    this.customerName,
    this.customerKota,
  });

  @override
  State<_PenawaranBody> createState() => _PenawaranBodyState();
}

class _PenawaranBodyState extends State<_PenawaranBody> {
  final _boundaryKey = GlobalKey();
  bool _sharing = false;

  List<double> get _charges =>
      allocateCartLineCharges(
          widget.cart.map((c) => c.subtotalRaw).toList(),
          widget.roundCartPrices);

  double get _subtotal => _charges.fold<double>(0, (s, n) => s + n);
  double get _total => _subtotal + widget.biayaTambahanTotal;

  Future<void> _sharePdf() async {
    setState(() => _sharing = true);
    try {
      final boundary = _boundaryKey.currentContext!.findRenderObject()
          as RenderRepaintBoundary;
      final image = await boundary.toImage(pixelRatio: 3);
      final byteData =
          await image.toByteData(format: ui.ImageByteFormat.png);
      final pngBytes = byteData!.buffer.asUint8List();
      final doc = pw.Document();
      final memImage = pw.MemoryImage(pngBytes);
      doc.addPage(
        pw.Page(
          pageFormat: PdfPageFormat.a4,
          build: (_) => pw.Center(child: pw.Image(memImage)),
        ),
      );
      await Printing.sharePdf(
          bytes: await doc.save(), filename: 'penawaran-gemiprint.pdf');
    } catch (e) {
      if (mounted) showErrorSnackbar(context, 'Gagal membagikan PDF');
    } finally {
      if (mounted) setState(() => _sharing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final fmt = NumberFormat('#,##0', 'id_ID');
    return DraggableScrollableSheet(
      initialChildSize: 0.92,
      expand: false,
      builder: (_, scroll) => Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            child: Row(
              children: [
                const Expanded(
                  child: Text('Pratinjau Penawaran',
                      style: TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                          fontSize: 14)),
                ),
                IconButton(
                  icon: const Icon(Icons.close, color: Colors.white),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
          ),
          Expanded(
            child: SingleChildScrollView(
              controller: scroll,
              child: RepaintBoundary(
                key: _boundaryKey,
                child: _card(fmt),
              ),
            ),
          ),
          Container(
            color: AppColors.primaryDark,
            padding: const EdgeInsets.all(12),
            child: SafeArea(
              top: false,
              child: SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  icon: const Icon(Icons.picture_as_pdf),
                  label: Text(_sharing ? 'Menyiapkan...' : 'Bagikan PDF'),
                  onPressed: _sharing ? null : _sharePdf,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _card(NumberFormat fmt) {
    final date = DateFormat('d MMM yyyy', 'id_ID').format(DateTime.now());
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.all(16),
      child: Stack(
        children: [
          Positioned.fill(
            child: Center(
              child: Opacity(
                opacity: 0.05,
                child: Transform.rotate(
                  angle: -0.31,
                  child: SvgPicture.asset(
                    'assets/logo-gemiprint-default.svg',
                    width: 220,
                  ),
                ),
              ),
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SvgPicture.asset('assets/logo-gemiprint-default.svg',
                      width: 30),
                  const SizedBox(width: 8),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('gemiprint',
                            style: TextStyle(
                                fontFamily: AppFonts.brand,
                                color: AppColors.primary,
                                fontSize: 20)),
                        Text('Digital Printing & Advertising',
                            style: TextStyle(
                                fontSize: 9, color: Colors.grey)),
                      ],
                    ),
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      const Text('PENAWARAN',
                          style: TextStyle(
                              fontWeight: FontWeight.w800,
                              color: AppColors.primaryDark)),
                      Text(date,
                          style: const TextStyle(
                              fontSize: 9, color: Colors.grey)),
                    ],
                  ),
                ],
              ),
              const Divider(color: AppColors.primary, thickness: 2),
              const SizedBox(height: 8),
              const Text('Kepada',
                  style: TextStyle(fontSize: 9, color: Colors.grey)),
              Text(widget.customerName ?? 'Pelanggan Umum',
                  style: const TextStyle(fontWeight: FontWeight.bold)),
              if (widget.customerKota != null)
                Text(widget.customerKota!,
                    style: const TextStyle(fontSize: 11, color: Colors.grey)),
              const SizedBox(height: 12),
              ...List.generate(widget.cart.length, (i) {
                final item = widget.cart[i];
                final detail = _detailLine(item);
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(item.barangNama,
                                style: const TextStyle(
                                    fontWeight: FontWeight.w600,
                                    fontSize: 12)),
                            if (detail.isNotEmpty)
                              Text(detail,
                                  style: const TextStyle(
                                      fontSize: 9, color: Colors.grey)),
                          ],
                        ),
                      ),
                      Text('Rp ${fmt.format(_charges[i])}',
                          style: const TextStyle(
                              fontWeight: FontWeight.w600, fontSize: 12)),
                    ],
                  ),
                );
              }),
              const Divider(),
              _totalRow('Subtotal', 'Rp ${fmt.format(_subtotal)}', false),
              if (widget.biayaTambahanTotal > 0)
                _totalRow('Biaya tambahan',
                    'Rp ${fmt.format(widget.biayaTambahanTotal)}', false),
              _totalRow('TOTAL', 'Rp ${fmt.format(_total)}', true),
              const SizedBox(height: 12),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.grey.shade50,
                  borderRadius: BorderRadius.circular(7),
                ),
                child: const Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Pembayaran',
                        style: TextStyle(
                            fontWeight: FontWeight.w700, fontSize: 9)),
                    Text(
                        'BCA 6881276507 · a.n. Grafika Estetika Media Internusa',
                        style: TextStyle(fontSize: 9, color: Colors.grey)),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              const Center(
                child: Text('Harga berlaku 7 hari. Bukan faktur resmi.',
                    style: TextStyle(fontSize: 8, color: Colors.grey)),
              ),
            ],
          ),
        ],
      ),
    );
  }

  String _detailLine(CartItem item) {
    if (item.isMaklon) {
      return 'Subkontrak: ${item.deskripsiPekerjaan ?? '-'}';
    }
    final parts = <String>[];
    if (item.billedPanjang != null &&
        item.billedLebar != null &&
        item.selectedRollSize != null) {
      parts.add(formatRollCartDetailLine(
        billedPanjang: item.billedPanjang,
        billedLebar: item.billedLebar,
        selectedRollSize: item.selectedRollSize,
        jumlah: item.jumlah,
        hargaSatuan: item.hargaSatuan,
      ));
    } else {
      parts.add(
          '${item.jumlah.toStringAsFixed(item.butuhDimensi ? 2 : 0)} ${item.namaSatuan}');
    }
    if (item.finishing.isNotEmpty) {
      parts.add(
          'Finishing: ${item.finishing.map((f) => f.jenisFinishing).join(', ')}');
    }
    return parts.where((p) => p.isNotEmpty).join(' · ');
  }

  Widget _totalRow(String label, String value, bool emphasize) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label,
              style: TextStyle(
                  fontWeight:
                      emphasize ? FontWeight.w800 : FontWeight.normal,
                  fontSize: emphasize ? 13 : 11,
                  color: emphasize
                      ? AppColors.primaryDark
                      : Colors.grey)),
          Text(value,
              style: TextStyle(
                  fontWeight:
                      emphasize ? FontWeight.w800 : FontWeight.normal,
                  fontSize: emphasize ? 14 : 11,
                  color: emphasize ? AppColors.primary : Colors.black87)),
        ],
      ),
    );
  }
}
