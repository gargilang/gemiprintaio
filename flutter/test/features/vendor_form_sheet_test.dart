import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gemiprint/features/vendors/vendor_form_sheet.dart';

void main() {
  testWidgets('VendorFormSheet renders all fields including tipe vendor', (tester) async {
    // Use a tall viewport so all form fields are visible
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(home: Scaffold(body: VendorFormSheet())),
      ),
    );
    await tester.pump();

    // Title
    expect(find.text('Tambah Vendor'), findsOneWidget);

    // Required field
    expect(find.text('Nama Perusahaan *'), findsOneWidget);

    // Optional fields
    expect(find.text('Kontak Person (Opsional)'), findsOneWidget);
    expect(find.text('Telepon (Opsional)'), findsOneWidget);
    expect(find.text('Email (Opsional)'), findsOneWidget);
    expect(find.text('Alamat (Opsional)'), findsOneWidget);

    // Tipe Vendor segmented buttons
    expect(find.text('Supplier'), findsOneWidget);
    expect(find.text('Subkontraktor'), findsOneWidget);
    expect(find.text('Keduanya'), findsOneWidget);

    // Other fields
    expect(find.text('Ketentuan Bayar (Opsional)'), findsOneWidget);
    expect(find.text('Catatan (Opsional)'), findsOneWidget);

    // Buttons
    expect(find.text('Batal'), findsOneWidget);
    expect(find.text('Simpan'), findsOneWidget);
  });
}
