import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:gemiprint/core/config/app_config.dart';
import 'package:gemiprint/core/cache/app_cache.dart';
import 'package:gemiprint/services/token_storage.dart';

class ApiException implements Exception {
  final int statusCode;
  final String message;
  const ApiException(this.statusCode, this.message);

  @override
  String toString() => 'ApiException($statusCode): $message';

  bool get isUnauthorized => statusCode == 401;
  bool get isForbidden => statusCode == 403;
  bool get isNotFound => statusCode == 404;
  bool get isRateLimited => statusCode == 429;
}

class ApiClient {
  final TokenStorage _tokenStorage;
  final http.Client _http;
  final AppCache _cache = AppCache();

  ApiClient({required TokenStorage tokenStorage, http.Client? httpClient})
      : _tokenStorage = tokenStorage,
        _http = httpClient ?? http.Client();

  Future<Map<String, String>> _headers() async {
    final headers = <String, String>{
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    final token = await _tokenStorage.getToken();
    if (token != null) {
      headers['Authorization'] = 'Bearer $token';
    }
    return headers;
  }

  /// Cached GET — returns cached data immediately if available,
  /// then revalidates in background when stale.
  Future<dynamic> get(String path, {
    Map<String, String>? queryParams,
    Duration maxAge = const Duration(minutes: 2),
    bool forceRefresh = false,
  }) async {
    final uri = Uri.parse(AppConfig.apiUrl(path)).replace(queryParameters: queryParams);
    final cacheKey = uri.toString();

    if (!forceRefresh) {
      final cached = _cache.get(cacheKey);
      if (cached != null && !_cache.isStale(cacheKey, maxAge: maxAge)) {
        return cached;
      }
    }

    final result = await _request('GET', uri);
    _cache.set(cacheKey, result);
    return result;
  }

  Future<dynamic> post(String path, {Map<String, dynamic>? body}) async {
    final uri = Uri.parse(AppConfig.apiUrl(path));
    final result = await _request('POST', uri, body: body);
    _invalidateRelated(path);
    return result;
  }

  Future<dynamic> put(String path, {Map<String, dynamic>? body}) async {
    final uri = Uri.parse(AppConfig.apiUrl(path));
    final result = await _request('PUT', uri, body: body);
    _invalidateRelated(path);
    return result;
  }

  Future<dynamic> delete(String path, {Map<String, dynamic>? body}) async {
    final uri = Uri.parse(AppConfig.apiUrl(path));
    final result = await _request('DELETE', uri, body: body);
    _invalidateRelated(path);
    return result;
  }

  /// After mutations, invalidate related GET caches so next fetch is fresh.
  void _invalidateRelated(String path) {
    final base = AppConfig.apiUrl('');
    if (path.contains('/pos/')) {
      _cache.invalidatePrefix('$base/api/pos/');
    } else if (path.contains('/production')) {
      _cache.invalidatePrefix('$base/api/production');
    } else if (path.contains('/finance/')) {
      _cache.invalidatePrefix('$base/api/finance/');
    } else if (path.contains('/materials') || path.contains('/master/')) {
      _cache.invalidatePrefix('$base/api/materials');
      _cache.invalidatePrefix('$base/api/master/');
      _cache.invalidatePrefix('$base/api/pos/');
    } else if (path.contains('/customers')) {
      _cache.invalidatePrefix('$base/api/customers');
      _cache.invalidatePrefix('$base/api/pos/');
    } else if (path.contains('/users')) {
      _cache.invalidatePrefix('$base/api/users');
    }
  }

  /// Invalidate all cache (for pull-to-refresh).
  void invalidateAll() {
    _cache.invalidatePrefix('');
  }

  Future<dynamic> _request(String method, Uri uri, {Map<String, dynamic>? body}) async {
    final headers = await _headers();
    final encodedBody = body != null ? jsonEncode(body) : null;

    debugPrint('[API] $method ${uri.path}');

    try {
      late http.Response response;
      switch (method) {
        case 'GET':
          response = await _http.get(uri, headers: headers);
        case 'POST':
          response = await _http.post(uri, headers: headers, body: encodedBody);
        case 'PUT':
          response = await _http.put(uri, headers: headers, body: encodedBody);
        case 'DELETE':
          response = await _http.delete(uri, headers: headers, body: encodedBody);
        default:
          throw ApiException(0, 'Unsupported HTTP method: $method');
      }

      debugPrint('[API] Response: ${response.statusCode} (${response.body.length} bytes)');

      if (response.statusCode >= 200 && response.statusCode < 300) {
        return response.body.isNotEmpty ? jsonDecode(response.body) : null;
      }

      final responseBody = response.body.isNotEmpty ? jsonDecode(response.body) : null;
      final message = responseBody is Map
          ? (responseBody['error'] ?? responseBody['message'] ?? 'Server error ${response.statusCode}') as String
          : 'Server error ${response.statusCode}';
      debugPrint('[API] ERROR: $message');
      throw ApiException(response.statusCode, message);
    } on ApiException {
      rethrow;
    } on SocketException catch (e) {
      debugPrint('[API] NETWORK ERROR (SocketException): $e');
      throw ApiException(0, 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda.\n\nDetail: $e');
    } on HandshakeException catch (e) {
      debugPrint('[API] SSL ERROR (HandshakeException): $e');
      throw ApiException(0, 'Gagal koneksi SSL ke server.\n\nDetail: $e');
    } on HttpException catch (e) {
      debugPrint('[API] HTTP ERROR: $e');
      throw ApiException(0, 'Error HTTP: $e');
    } on FormatException catch (e) {
      debugPrint('[API] PARSE ERROR: $e');
      throw ApiException(0, 'Gagal memproses respons server.\n\nDetail: $e');
    } catch (e) {
      debugPrint('[API] UNKNOWN ERROR (${e.runtimeType}): $e');
      throw ApiException(0, 'Terjadi kesalahan: ${e.runtimeType}\n\n$e');
    }
  }
}
