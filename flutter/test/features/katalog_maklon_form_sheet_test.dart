import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gemiprint/features/katalog_extra/katalog_maklon_form_sheet.dart';

void main() {
  testWidgets('KatalogMaklonFormSheet renders required fields',
      (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          home: Scaffold(
            body: Builder(
              builder: (context) => Center(
                child: ElevatedButton(
                  onPressed: () => showModalBottomSheet(
                    context: context,
                    isScrollControlled: true,
                    backgroundColor: Colors.transparent,
                    builder: (_) => const KatalogMaklonFormSheet(),
                  ),
                  child: const Text('buka'),
                ),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.tap(find.text('buka'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('Tambah Katalog Extra'), findsOneWidget);
    expect(find.text('Nama Produk *'), findsOneWidget);
    expect(find.text('Butuh dimensi (harga per m2)'), findsOneWidget);
    expect(find.text('Harga Jual'), findsOneWidget);
    expect(find.text('Biaya Subkontrak'), findsOneWidget);
    expect(find.text('Metode Bayar ke Vendor'), findsOneWidget);
    expect(find.text('Simpan'), findsOneWidget);

    // Buka dropdown metode bayar untuk memverifikasi opsi TRANSFER tersedia.
    await tester.tap(find.text('CASH'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.text('TRANSFER'), findsOneWidget);
  });
}