import 'package:intl/intl.dart';

final currencyFormat = NumberFormat.currency(locale: 'id_ID', symbol: 'Rp ', decimalDigits: 0);

String formatCurrency(num value) => currencyFormat.format(value);

String formatDate(String? isoDate) {
  if (isoDate == null || isoDate.isEmpty) return '-';
  try {
    final dt = DateTime.parse(isoDate);
    return DateFormat('dd MMM yyyy', 'id_ID').format(dt);
  } catch (_) {
    return isoDate;
  }
}

String formatDateTime(String? isoDate) {
  if (isoDate == null || isoDate.isEmpty) return '-';
  try {
    final dt = DateTime.parse(isoDate);
    return DateFormat('dd MMM yyyy HH:mm', 'id_ID').format(dt);
  } catch (_) {
    return isoDate;
  }
}
