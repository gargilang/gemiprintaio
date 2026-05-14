import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:gemiprint/app.dart';
import 'package:gemiprint/core/cache/app_cache.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Future.wait([
    initializeDateFormatting('id_ID', null),
    AppCache().hydrate(),
  ]);
  runApp(const ProviderScope(child: GemiprintApp()));
}
