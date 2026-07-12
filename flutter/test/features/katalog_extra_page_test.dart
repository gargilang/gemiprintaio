import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gemiprint/features/katalog_extra/katalog_extra_page.dart';

void main() {
  testWidgets('KatalogExtraPage shows search, filters, and loading state',
      (tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(home: Scaffold(body: KatalogExtraPage())),
      ),
    );
    await tester.pump();

    expect(find.byType(TextField), findsOneWidget);
    expect(find.text('Semua'), findsOneWidget);
    expect(find.text('Aktif'), findsOneWidget);
    expect(find.text('Non-Aktif'), findsOneWidget);
    expect(find.text('Pending'), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsWidgets);
  });
}