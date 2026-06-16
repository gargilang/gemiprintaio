import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:gemiprint/widgets/faktur_preview_page.dart';

void main() {
  setUpAll(() async {
    await initializeDateFormatting('id_ID', null);
  });

  testWidgets('menampilkan judul, item, dan total', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: FakturPreviewPage(
        title: 'PENAWARAN',
        customerName: 'Budi',
        date: '17 Jun 2026',
        total: 150000,
        lines: const [
          FakturLine(name: 'Banner', qty: 2, harga: 50000, jumlah: 100000),
          FakturLine(name: 'Stiker', qty: 1, harga: 50000, jumlah: 50000),
        ],
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('PENAWARAN'), findsOneWidget);
    expect(find.text('Banner'), findsOneWidget);
    expect(find.text('Stiker'), findsOneWidget);
    expect(find.textContaining('Budi'), findsWidgets);
    // total muncul minimal sekali (format Rp)
    expect(find.textContaining('150.000'), findsWidgets);
  });
}
