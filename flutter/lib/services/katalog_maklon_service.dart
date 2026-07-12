import 'package:gemiprint/models/katalog_maklon.dart';
import 'package:gemiprint/services/api_client.dart';

/// Client API Katalog Extra (maklon) untuk Flutter.
///
/// Hanya memanggil Next.js API routes via `ApiClient` dengan JWT Bearer.
class KatalogMaklonService {
  final ApiClient _api;
  KatalogMaklonService(this._api);

  Future<List<KatalogMaklon>> getAll({
    bool includeInactive = true,
    bool forceRefresh = false,
  }) async {
    final data = await _api.get(
      '/api/katalog-maklon',
      queryParams: includeInactive ? const {'include_inactive': '1'} : null,
      forceRefresh: forceRefresh,
    );
    final list = data['katalog'] as List? ?? [];
    return list
        .map((j) => KatalogMaklon.fromJson(j as Map<String, dynamic>))
        .toList();
  }

  Future<KatalogMaklon> create(Map<String, dynamic> body) async {
    final data = await _api.post('/api/katalog-maklon', body: body);
    return KatalogMaklon.fromJson(data['katalog'] as Map<String, dynamic>);
  }

  Future<void> update(String id, Map<String, dynamic> body) async {
    await _api.put('/api/katalog-maklon/$id', body: body);
  }

  Future<void> delete(String id) async {
    await _api.delete('/api/katalog-maklon/$id');
  }

  Future<List<PendingMaklon>> getPending({bool forceRefresh = false}) async {
    final data = await _api.get(
      '/api/katalog-maklon/pending',
      forceRefresh: forceRefresh,
    );
    final list = data['pending'] as List? ?? [];
    return list
        .map((j) => PendingMaklon.fromJson(j as Map<String, dynamic>))
        .toList();
  }

  Future<void> reconcilePending(
    String itemPenjualanId,
    Map<String, dynamic> body,
  ) async {
    await _api.post(
      '/api/katalog-maklon/pending/$itemPenjualanId/reconcile',
      body: body,
    );
  }
}
