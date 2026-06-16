import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gemiprint/features/vendors/vendors_page.dart';

void main() {
  testWidgets('VendorsPage shows title and search bar', (tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(home: Scaffold(body: VendorsPage())),
      ),
    );
    await tester.pump();

    expect(find.text('Vendor'), findsOneWidget);
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
