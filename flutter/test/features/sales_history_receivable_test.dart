import 'package:flutter_test/flutter_test.dart';
import 'package:gemiprint/features/sales_history/sales_history_page.dart';

void main() {
  test('SalesHistoryPage has Piutang filter', () {
    expect(SalesHistoryPage.filters, contains('Piutang'));
  });
}
