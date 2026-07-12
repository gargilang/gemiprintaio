import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gemiprint/features/materials/materials_page.dart';

void main() {
  testWidgets('MaterialsPage shows search and mobile filter chips', (
    tester,
  ) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(home: Scaffold(body: MaterialsPage())),
      ),
    );
    await tester.pump();

    expect(find.byType(TextField), findsOneWidget);
    expect(find.text('Semua'), findsOneWidget);
    expect(find.text('Dilacak'), findsOneWidget);
    expect(find.text('Dimensi'), findsOneWidget);
    expect(find.text('Stok Menipis'), findsOneWidget);
  });

  testWidgets('MaterialsPage shows loading indicator', (tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(home: Scaffold(body: MaterialsPage())),
      ),
    );
    await tester.pump();

    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });
}
