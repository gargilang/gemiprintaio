import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:gemiprint/services/pos_service.dart';
import 'package:gemiprint/services/api_client.dart';
import 'package:gemiprint/services/token_storage.dart';

/// TokenStorage tiruan untuk pengujian — cegah akses FlutterSecureStorage.
class _MockTokenStorage implements TokenStorage {
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
  final apiClient = ApiClient(
    tokenStorage: _MockTokenStorage(),
    httpClient: http.Client(),
  );

  test('PosService has getSales method', () {
    final service = PosService(apiClient);
    expect(service.getSales, isNotNull);
  });

  test('PosService has voidSale method', () {
    final service = PosService(apiClient);
    expect(service.voidSale, isNotNull);
  });
}
