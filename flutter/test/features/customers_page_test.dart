import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gemiprint/features/customers/customers_page.dart';

void main() {
  testWidgets('CustomersPage shows search bar and loading state',
      (tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(home: Scaffold(body: CustomersPage())),
      ),
    );
    await tester.pump();

    // Catatan: judul "Pelanggan" dirender oleh AppBar di app_shell.dart,
    // bukan oleh halaman ini, jadi tidak diuji di sini.

    // Search field hint
    expect(find.byType(TextField), findsOneWidget);

    // Initially shows loading
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });
}
