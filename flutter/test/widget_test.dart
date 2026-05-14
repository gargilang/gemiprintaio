import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gemiprint/app.dart';

void main() {
  testWidgets('App renders login page', (WidgetTester tester) async {
    await tester.pumpWidget(const ProviderScope(child: GemiprintApp()));
    await tester.pump();

    expect(find.text('gemiprint'), findsWidgets);
  });
}
