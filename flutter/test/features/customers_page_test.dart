import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gemiprint/features/customers/customers_page.dart';

void main() {
  testWidgets('CustomersPage shows title and search bar', (tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(home: Scaffold(body: CustomersPage())),
      ),
    );
    await tester.pump();

    // Title
    expect(find.text('Pelanggan'), findsOneWidget);

    // Search field hint
    expect(find.byType(TextField), findsOneWidget);

    // Initially shows loading
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });
}
