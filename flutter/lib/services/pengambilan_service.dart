import 'package:gemiprint/models/pengambilan.dart';
import 'package:gemiprint/services/api_client.dart';

class PengambilanService {
  final ApiClient _api;
  PengambilanService(this._api);

  Future<List<PengambilanRow>> getRows({
    required bool sudah,
    bool forceRefresh = false,
  }) async {
    final data = await _api.get(
      '/api/produksi/pengambilan',
      queryParams: {'status': sudah ? 'sudah' : 'belum'},
      forceRefresh: forceRefresh,
    ) as Map<String, dynamic>;
    final rows = data['rows'] as List? ?? [];
    return rows
        .map((j) => PengambilanRow.fromJson(j as Map<String, dynamic>))
        .toList();
  }

  Future<Map<String, dynamic>> markSudahDiambil(String orderId) async {
    return await _api.post(
      '/api/produksi/pengambilan/$orderId/sudah-diambil',
    ) as Map<String, dynamic>;
  }
}
