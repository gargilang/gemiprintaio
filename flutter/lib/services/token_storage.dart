import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class TokenStorage {
  static const _tokenKey = 'gp_auth_token';
  final FlutterSecureStorage _storage;
  String? _cached;

  TokenStorage() : _storage = const FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  Future<String?> getToken() async {
    if (_cached != null) return _cached;
    try {
      _cached = await _storage.read(key: _tokenKey);
    } catch (e) {
      debugPrint('[TokenStorage] read error: $e');
      _cached = null;
    }
    return _cached;
  }

  Future<void> saveToken(String token) async {
    _cached = token;
    try {
      await _storage.write(key: _tokenKey, value: token);
    } catch (e) {
      debugPrint('[TokenStorage] write error: $e');
    }
  }

  Future<void> clearToken() async {
    _cached = null;
    try {
      await _storage.delete(key: _tokenKey);
    } catch (e) {
      debugPrint('[TokenStorage] delete error: $e');
    }
  }

  Future<bool> hasToken() async {
    final token = await getToken();
    return token != null && token.isNotEmpty;
  }
}
