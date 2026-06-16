import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gemiprint/features/customers/customer_form_sheet.dart';

void main() {
  testWidgets('CustomerFormSheet renders all fields', (tester) async {
    // Gunakan layar lebih tinggi agar semua konten DraggableScrollableSheet terlihat
    tester.view.physicalSize = const Size(1080, 1920);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(home: Scaffold(body: CustomerFormSheet())),
      ),
    );
    await tester.pump();

    // Title
    expect(find.text('Tambah Pelanggan'), findsOneWidget);

    // Required field
    expect(find.text('Nama *'), findsOneWidget);

    // Optional fields
    expect(find.text('Nama Perusahaan'), findsOneWidget);
    expect(find.text('Telepon'), findsOneWidget);
    expect(find.text('Email'), findsOneWidget);
    expect(find.text('Alamat'), findsOneWidget);
    expect(find.text('NPWP'), findsOneWidget);

    // Member toggle
    expect(find.text('Status Member'), findsOneWidget);

    // Buttons
    expect(find.text('Batal'), findsOneWidget);
    expect(find.text('Simpan'), findsOneWidget);
  });

}
