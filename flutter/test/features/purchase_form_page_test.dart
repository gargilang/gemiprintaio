import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gemiprint/features/purchases/purchase_form_page.dart';
import 'package:gemiprint/providers/providers.dart';
import 'package:gemiprint/services/api_client.dart';
import 'package:gemiprint/services/token_storage.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// Stub TokenStorage yang selalu mengembalikan token null (tanpa FlutterSecureStorage).
class _StubTokenStorage extends TokenStorage {
  _StubTokenStorage() : super();
  @override
  Future<String?> getToken() async => null;
  @override
  Future<void> saveToken(String token) async {}
  @override
  Future<void> clearToken() async {}
  @override
  Future<bool> hasToken() async => false;
}

void main() {
  testWidgets('PurchaseFormPage renders title and vendor field', (tester) async {
    // Mock HTTP client yang mengembalikan data vendor kosong
    final mockHttp = MockClient((request) async {
      if (request.url.path.contains('/api/vendors')) {
        return http.Response(jsonEncode({'vendor': []}), 200);
      }
      return http.Response('{}', 200);
    });

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          tokenStorageProvider.overrideWith((ref) => _StubTokenStorage()),
          apiClientProvider.overrideWith(
            (ref) => ApiClient(
              tokenStorage: ref.watch(tokenStorageProvider),
              httpClient: mockHttp,
            ),
          ),
        ],
        child: const MaterialApp(home: PurchaseFormPage()),
      ),
    );
    await tester.pump();
    await tester.pump();
    expect(find.text('Pembelian Baru'), findsOneWidget);
    expect(find.text('Vendor'), findsOneWidget);
    expect(find.text('Simpan'), findsOneWidget);
    // Buang timer AppCache._schedulePersist (800ms Future.delayed)
    await tester.pump(const Duration(milliseconds: 900));
  });
}
