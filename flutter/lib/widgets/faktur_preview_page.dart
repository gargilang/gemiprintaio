import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

/// Satu baris item faktur/penawaran.
class FakturLine {
  final String name;
  final String? ukuran;
  final double qty;
  final String? satuan;
  final double harga;
  final double jumlah;
  const FakturLine({
    required this.name,
    this.ukuran,
    required this.qty,
    this.satuan,
    required this.harga,
    required this.jumlah,
  });
}

/// Biaya tambahan tingkat header (ongkir, pasang, dll).
class FakturCharge {
  final String label;
  final double amount;
  const FakturCharge({required this.label, required this.amount});
}

/// Info toko bawaan (mirror SHOP_INFO web `src/lib/faktur-print.ts`).
class _ShopInfo {
  static const namaToko = 'gemiprint';
  static const slogan = 'Digital Printing & Advertising';
  static const alamat =
      'Cifest Walk, Ruko Pasadena Blok RA No. 18A,\nKel. Ciantra, Cikarang Selatan - Bekasi, 17531';
  static const telepon = '0812 3456 0525';
  static const email = 'cs@gemiprint.com';
  static const catatanFaktur =
      'Barang yang sudah dibawa tidak bisa ditukar/dikembalikan.';
}

/// Halaman pratinjau faktur/penawaran berbentuk portrait, dirender penuh
/// dengan widget Dart. Pengguna menangkapnya via screenshot perangkat.
class FakturPreviewPage extends StatelessWidget {
  final String title; // 'PENAWARAN' atau 'FAKTUR'
  final String? invoiceNumber;
  final String? customerName;
  final List<String> customerDetail;
  final String? date;
  final List<FakturLine> lines;
  final List<FakturCharge> additionalCharges;
  final double total;
  final double? bayar;
  final double? sisa;
  final String? catatan;

  const FakturPreviewPage({
    super.key,
    required this.title,
    required this.lines,
    required this.total,
    this.invoiceNumber,
    this.customerName,
    this.customerDetail = const [],
    this.date,
    this.additionalCharges = const [],
    this.bayar,
    this.sisa,
    this.catatan,
  });

  static final _rupiah = NumberFormat.currency(
    locale: 'id_ID',
    symbol: 'Rp ',
    decimalDigits: 0,
  );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFE2E8F0),
      appBar: AppBar(
        title: Text(
            title == 'PENAWARAN' ? 'Pratinjau Penawaran' : 'Pratinjau Faktur'),
        leading: IconButton(
          icon: const Icon(Icons.close),
          onPressed: () => Navigator.of(context).pop(),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(12),
          child: Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(8),
              boxShadow: const [
                BoxShadow(
                    color: Colors.black26,
                    blurRadius: 8,
                    offset: Offset(0, 2)),
              ],
            ),
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _header(),
                const SizedBox(height: 12),
                _titleBlock(),
                const SizedBox(height: 12),
                _itemsTable(),
                const SizedBox(height: 12),
                _totalsBlock(),
                const SizedBox(height: 20),
                _footer(),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _header() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          _ShopInfo.namaToko,
          style: const TextStyle(
            fontSize: 22,
            fontWeight: FontWeight.w800,
            color: Color(0xFF0A1B3D),
          ),
        ),
        Text(
          _ShopInfo.slogan,
          style: const TextStyle(
            fontSize: 11,
            color: Color(0xFF00AFEF),
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          _ShopInfo.alamat,
          style: const TextStyle(fontSize: 10, color: Color(0xFF475569)),
        ),
        Text(
          'Telp ${_ShopInfo.telepon} · ${_ShopInfo.email}',
          style: const TextStyle(fontSize: 10, color: Color(0xFF475569)),
        ),
        const SizedBox(height: 8),
        const Divider(height: 1, thickness: 2, color: Color(0xFF0A1B3D)),
      ],
    );
  }

  Widget _titleBlock() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w800,
            letterSpacing: 1,
            color: Color(0xFF0A1B3D),
          ),
        ),
        const SizedBox(height: 4),
        if (invoiceNumber != null && invoiceNumber!.trim().isNotEmpty)
          Text('No: ${invoiceNumber!}', style: const TextStyle(fontSize: 12)),
        if (date != null)
          Text('Tanggal: ${date!}', style: const TextStyle(fontSize: 12)),
        if (customerName != null && customerName!.trim().isNotEmpty)
          Text('Kepada: ${customerName!}',
              style:
                  const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
        ...customerDetail
            .where((l) => l.trim().isNotEmpty)
            .map((l) => Text(l,
                style: const TextStyle(
                    fontSize: 11, color: Color(0xFF475569)))),
      ],
    );
  }

  String _fmtQty(double q) {
    if (q == q.roundToDouble()) return q.toInt().toString();
    return q.toStringAsFixed(2).replaceAll(RegExp(r'\.?0+$'), '');
  }

  Widget _itemsTable() {
    const headerStyle = TextStyle(
      fontSize: 11,
      fontWeight: FontWeight.w700,
      color: Color(0xFF0A1B3D),
    );
    const cellStyle = TextStyle(fontSize: 11, color: Color(0xFF0A1B3D));
    final border = const BorderSide(color: Color(0xFFCBD5E1));

    return Table(
      border: TableBorder(
        horizontalInside: border,
        top: border,
        bottom: border,
      ),
      columnWidths: const {
        0: FlexColumnWidth(3),
        1: FlexColumnWidth(1.4),
        2: FlexColumnWidth(1.6),
        3: FlexColumnWidth(1.6),
      },
      defaultVerticalAlignment: TableCellVerticalAlignment.top,
      children: [
        TableRow(
          decoration: const BoxDecoration(color: Color(0xFFF1F5F9)),
          children: [
            _cell('Barang', headerStyle),
            _cell('Qty', headerStyle, align: TextAlign.right),
            _cell('Harga', headerStyle, align: TextAlign.right),
            _cell('Jumlah', headerStyle, align: TextAlign.right),
          ],
        ),
        ...lines.map((l) {
          final qtyText = l.satuan != null && l.satuan!.isNotEmpty
              ? '${_fmtQty(l.qty)} ${l.satuan}'
              : _fmtQty(l.qty);
          final nama = (l.ukuran != null && l.ukuran!.isNotEmpty)
              ? '${l.name}\n${l.ukuran}'
              : l.name;
          return TableRow(children: [
            _cell(nama, cellStyle),
            _cell(qtyText, cellStyle, align: TextAlign.right),
            _cell(_rupiah.format(l.harga), cellStyle, align: TextAlign.right),
            _cell(_rupiah.format(l.jumlah), cellStyle, align: TextAlign.right),
          ]);
        }),
      ],
    );
  }

  Widget _cell(String text, TextStyle style,
      {TextAlign align = TextAlign.left}) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 5),
      child: Text(text, style: style, textAlign: align),
    );
  }

  Widget _totalsRow(String label, double value, {bool grand = false}) {
    final style = TextStyle(
      fontSize: grand ? 14 : 12,
      fontWeight: grand ? FontWeight.w800 : FontWeight.w600,
      color: const Color(0xFF0A1B3D),
    );
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: style),
          Text(_rupiah.format(value), style: style),
        ],
      ),
    );
  }

  Widget _totalsBlock() {
    return Align(
      alignment: Alignment.centerRight,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 280),
        child: Column(
          children: [
            for (final c in additionalCharges)
              if (c.label.trim().isNotEmpty && c.amount > 0)
                _totalsRow(c.label, c.amount),
            const Divider(),
            _totalsRow('TOTAL', total, grand: true),
            if (bayar != null) _totalsRow('BAYAR', bayar!),
            if (sisa != null) _totalsRow('SISA', sisa!),
          ],
        ),
      ),
    );
  }

  Widget _footer() {
    final note = (catatan != null && catatan!.trim().isNotEmpty)
        ? catatan!.trim()
        : _ShopInfo.catatanFaktur;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Divider(),
        Text(
          note,
          style: const TextStyle(
            fontSize: 10,
            fontStyle: FontStyle.italic,
            color: Color(0xFF64748B),
          ),
        ),
      ],
    );
  }
}
