import 'package:flutter/foundation.dart';
import 'package:gemiprint/models/user.dart';
import 'package:gemiprint/services/api_client.dart';
import 'package:gemiprint/services/token_storage.dart';

class AuthResult {
  final bool success;
  final User? user;
  final String? error;
  const AuthResult({required this.success, this.user, this.error});
}

class AuthService {
  final ApiClient _api;
  final TokenStorage _tokenStorage;

  AuthService({required ApiClient api, required TokenStorage tokenStorage})
      : _api = api,
        _tokenStorage = tokenStorage;

  Future<AuthResult> login(String username, String password) async {
    try {
      final data = await _api.post('/api/auth/login', body: {
        'username': username,
        'password': password,
      });

      debugPrint('[AUTH] Login response keys: ${data is Map ? data.keys.toList() : data.runtimeType}');
      debugPrint('[AUTH] success=${data['success']}, hasToken=${data['token'] != null}, hasUser=${data['user'] != null}');

      if (data['success'] == true && data['token'] != null) {
        await _tokenStorage.saveToken(data['token'] as String);
        final user = User.fromJson(data['user'] as Map<String, dynamic>);
        debugPrint('[AUTH] Login OK - user: ${user.namaPengguna}, role: ${user.role}');
        return AuthResult(success: true, user: user);
      }

      final errorMsg = data['error'] as String? ?? 'Login gagal';
      debugPrint('[AUTH] Login rejected by server: $errorMsg');
      return AuthResult(success: false, error: errorMsg);
    } on ApiException catch (e) {
      return AuthResult(success: false, error: e.message);
    } catch (e) {
      return AuthResult(success: false, error: 'Tidak dapat terhubung ke server\n\n${e.runtimeType}: $e');
    }
  }

  Future<User?> getCurrentUser() async {
    try {
      final data = await _api.get('/api/auth/me');
      if (data != null && data['user'] != null) {
        return User.fromJson(data['user'] as Map<String, dynamic>);
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  Future<void> logout() async {
    try {
      await _api.post('/api/auth/logout');
    } catch (_) {
      // Ignore server errors during logout
    }
    await _tokenStorage.clearToken();
  }
}
