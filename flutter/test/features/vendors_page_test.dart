import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gemiprint/features/vendors/vendors_page.dart';

void main() {
  testWidgets('VendorsPage shows search bar and loading state',
      (tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(home: Scaffold(body: VendorsPage())),
      ),
    );
    await tester.pump();

    // Catatan: judul "Vendor" dirender oleh AppBar di app_shell.dart,
    // bukan oleh halaman ini, jadi tidak diuji di sini.
    expect(find.byType(TextField), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });

  testWidgets('VendorsPage has filter chips', (tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(home: Scaffold(body: VendorsPage())),
      ),
    );
    await tester.pump();

    expect(find.text('Semua'), findsOneWidget);
  });
}
