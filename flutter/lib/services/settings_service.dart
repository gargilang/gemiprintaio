import 'package:gemiprint/services/api_client.dart';
import 'package:gemiprint/widgets/faktur_preview_page.dart';

/// Mengambil pengaturan toko (info header faktur/penawaran) dari Next.js API.
class SettingsService {
  final ApiClient _api;
  SettingsService(this._api);

  /// Ambil info toko untuk header faktur. Fallback ke default bila gagal,
  /// supaya pratinjau tetap tampil meski offline / endpoint error.
  Future<FakturShopInfo> getShopInfo({bool forceRefresh = false}) async {
    try {
      final json = await _api.get(
        '/api/pengaturan/toko',
        forceRefresh: forceRefresh,
      );
      return FakturShopInfo.fromJson(json as Map<String, dynamic>);
    } catch (_) {
      return FakturShopInfo.fallback;
    }
  }
}
