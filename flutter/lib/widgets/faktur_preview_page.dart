import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:intl/intl.dart';

/// Satu baris item faktur/penawaran.
class FakturLine {
  final String name;
  final String? ukuran;
  final double qty;
  final String? satuan;
  final double harga;
  final double jumlah;
  final List<FakturLineCharge> biayaTambahan;
  const FakturLine({
    required this.name,
    this.ukuran,
    required this.qty,
    this.satuan,
    required this.harga,
    required this.jumlah,
    this.biayaTambahan = const [],
  });
}

/// Biaya tambahan per item (sub-baris di bawah FakturLine).
class FakturLineCharge {
  final String label;
  final double nominal;
  const FakturLineCharge({required this.label, required this.nominal});
}

/// Biaya tambahan tingkat header (ongkir, pasang, dll).
class FakturCharge {
  final String label;
  final double amount;
  const FakturCharge({required this.label, required this.amount});
}

/// Info toko untuk header/footer faktur. Diambil dari `/api/pengaturan/toko`
/// (mirror `pengaturan_toko` di web), dengan fallback bawaan bila offline.
class FakturShopInfo {
  final String namaToko;
  final String? slogan;
  final String? alamat;
  final String? telepon;
  final String? email;
  final String? website;
  final String? bankNama;
  final String? bankNomor;
  final String? bankAtasNama;
  final String? catatanFaktur;

  const FakturShopInfo({
    required this.namaToko,
    this.slogan,
    this.alamat,
    this.telepon,
    this.email,
    this.website,
    this.bankNama,
    this.bankNomor,
    this.bankAtasNama,
    this.catatanFaktur,
  });

  factory FakturShopInfo.fromJson(Map<String, dynamic> j) {
    String? s(dynamic v) {
      final t = (v as String?)?.trim();
      return (t == null || t.isEmpty) ? null : t;
    }

    return FakturShopInfo(
      namaToko: s(j['nama_toko']) ?? 'gemiprint',
      slogan: s(j['slogan']),
      alamat: s(j['alamat']),
      telepon: s(j['telepon']),
      email: s(j['email']),
      website: s(j['website']),
      bankNama: s(j['bank_nama']),
      bankNomor: s(j['bank_nomor']),
      bankAtasNama: s(j['bank_atas_nama']),
      catatanFaktur: s(j['catatan_faktur']),
    );
  }

  /// Default dipakai bila endpoint gagal / data toko belum ada.
  static const fallback = FakturShopInfo(
    namaToko: 'gemiprint',
    slogan: 'Digital Printing & Advertising',
    catatanFaktur:
        'Barang yang sudah dibawa tidak bisa ditukar/dikembalikan.',
  );
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
  final String? paymentMethod; // mis. 'CASH', 'TRANSFER' (FAKTUR saja)
  final FakturShopInfo? shop;

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
    this.paymentMethod,
    this.shop,
  });

  FakturShopInfo get _shop => shop ?? FakturShopInfo.fallback;

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
                // Watermark logo kecil transparan, hanya di belakang
                // tabel item + total (antara judul dan catatan footer).
                Stack(
                  children: [
                    Positioned.fill(
                      child: Center(
                        child: Opacity(
                          opacity: 0.06,
                          child: SvgPicture.asset(
                            'assets/logo-gemiprint-default.svg',
                            width: 120,
                            fit: BoxFit.contain,
                          ),
                        ),
                      ),
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _itemsTable(),
                        const SizedBox(height: 12),
                        _totalsBlock(),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                _footer(),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// Wordmark "gemiprint" bergaya brand (gemi biru + print gelap).
  /// Untuk nama toko lain, tampilkan teks biasa.
  Widget _wordmark() {
    final nama = _shop.namaToko;
    if (nama.toLowerCase() == 'gemiprint') {
      return RichText(
        text: const TextSpan(
          style: TextStyle(
            fontFamily: 'Bauhaus93',
            fontSize: 26,
            fontStyle: FontStyle.italic,
            height: 1,
          ),
          children: [
            TextSpan(text: 'gemi', style: TextStyle(color: Color(0xFF00AFEF))),
            TextSpan(text: 'print', style: TextStyle(color: Color(0xFF0A1B3D))),
          ],
        ),
      );
    }
    return Text(
      nama,
      style: const TextStyle(
        fontSize: 22,
        fontWeight: FontWeight.w800,
        color: Color(0xFF0A1B3D),
      ),
    );
  }

  Widget _header() {
    final kontak = [
      if (_shop.telepon != null) 'Telp ${_shop.telepon}',
      if (_shop.email != null) _shop.email!,
      if (_shop.website != null) _shop.website!,
    ].join(' · ');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            SvgPicture.asset(
              'assets/logo-gemiprint-default.svg',
              height: 40,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _wordmark(),
                  if (_shop.slogan != null)
                    Text(
                      _shop.slogan!,
                      style: const TextStyle(
                        fontSize: 11,
                        color: Color(0xFF00AFEF),
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
        if (_shop.alamat != null) ...[
          const SizedBox(height: 6),
          Text(
            _shop.alamat!,
            style: const TextStyle(fontSize: 10, color: Color(0xFF475569)),
          ),
        ],
        if (kontak.isNotEmpty)
          Text(
            kontak,
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
    const subChargeStyle = TextStyle(
        fontSize: 10, color: Color(0xFF64748B), fontStyle: FontStyle.italic);
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
          return <TableRow>[
            TableRow(children: [
              _cell(nama, cellStyle),
              _cell(qtyText, cellStyle, align: TextAlign.right),
              _cell(_rupiah.format(l.harga), cellStyle, align: TextAlign.right),
              _cell(_rupiah.format(l.jumlah), cellStyle, align: TextAlign.right),
            ]),
            ...l.biayaTambahan.where((c) => c.nominal > 0).map((c) => TableRow(children: [
              _cell('+ ${c.label}', subChargeStyle),
              const SizedBox(),
              const SizedBox(),
              _cell(_rupiah.format(c.nominal), subChargeStyle, align: TextAlign.right),
            ])),
          ];
        }).expand((rows) => rows),
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
            if (bayar != null)
              _totalsRow(
                bayar! > total ? 'KEMBALIAN' : 'SISA',
                bayar! > total ? bayar! - total : (sisa ?? 0),
              ),
          ],
        ),
      ),
    );
  }

  /// Label ramah untuk metode pembayaran.
  String _metodeLabel(String kode) {
    switch (kode.toUpperCase()) {
      case 'CASH':
        return 'Tunai';
      case 'TRANSFER':
        return 'Transfer';
      case 'QRIS':
        return 'QRIS';
      case 'DEBIT':
        return 'Kartu Debit';
      case 'DOWN_PAYMENT':
        return 'Uang Muka (DP)';
      case 'NET30':
        return 'Tempo (NET30)';
      default:
        return kode;
    }
  }

  Widget _footer() {
    final note = (catatan != null && catatan!.trim().isNotEmpty)
        ? catatan!.trim()
        : (_shop.catatanFaktur ?? FakturShopInfo.fallback.catatanFaktur!);
    final adaBank = _shop.bankNomor != null && _shop.bankNomor!.isNotEmpty;
    final adaMetode =
        paymentMethod != null && paymentMethod!.trim().isNotEmpty;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Divider(),
        if (adaMetode)
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Row(
              children: [
                const Text(
                  'Metode Pembayaran: ',
                  style: TextStyle(fontSize: 11, color: Color(0xFF475569)),
                ),
                Text(
                  _metodeLabel(paymentMethod!),
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF0A1B3D),
                  ),
                ),
              ],
            ),
          ),
        if (adaBank)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Text(
              'Pembayaran transfer ke ${_shop.bankNama ?? ''} ${_shop.bankNomor}'
              '${_shop.bankAtasNama != null ? ' a.n. ${_shop.bankAtasNama}' : ''}',
              style: const TextStyle(fontSize: 10, color: Color(0xFF475569)),
            ),
          ),
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
