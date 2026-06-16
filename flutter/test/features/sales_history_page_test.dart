import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:gemiprint/features/sales_history/sales_history_page.dart';

void main() {
  setUpAll(() async {
    await initializeDateFormatting('id_ID', null);
  });

  testWidgets('SalesHistoryPage shows search bar and loading state',
      (tester) async {
    await tester.pumpWidget(const ProviderScope(child: MaterialApp(home: Scaffold(body: SalesHistoryPage()))));
    await tester.pump();
    // Catatan: judul "Riwayat Penjualan" dirender oleh AppBar di app_shell.dart,
    // bukan oleh halaman ini, jadi tidak diuji di sini.
    expect(find.byType(TextField), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });
  testWidgets('SalesHistoryPage has filter chips', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: MaterialApp(home: Scaffold(body: SalesHistoryPage()))));
    await tester.pump();
    expect(find.text('Semua'), findsOneWidget);
    expect(find.text('Lunas'), findsOneWidget);
    expect(find.text('Void'), findsOneWidget);
  });
}
