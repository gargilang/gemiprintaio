import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gemiprint/features/purchase_history/purchase_history_page.dart';

void main() {
  testWidgets('PurchaseHistoryPage shows title and search', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: MaterialApp(home: Scaffold(body: PurchaseHistoryPage()))));
    await tester.pump();
    expect(find.text('Riwayat Pembelian'), findsOneWidget);
    expect(find.byType(TextField), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });
  testWidgets('PurchaseHistoryPage has filter chips', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: MaterialApp(home: Scaffold(body: PurchaseHistoryPage()))));
    await tester.pump();
    expect(find.text('Semua'), findsOneWidget);
    expect(find.text('Lunas'), findsOneWidget);
    expect(find.text('Hutang'), findsOneWidget);
  });
}
