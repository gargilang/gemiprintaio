import 'package:gemiprint/models/ringkasan_hutang_piutang.dart';
import 'package:gemiprint/models/ringkasan_kasbon.dart';
import 'package:gemiprint/services/api_client.dart';

class FinanceService {
  final ApiClient _api;
  FinanceService(this._api);

  Future<Map<String, dynamic>> getCashBook({
    String? archiveId,
    bool forceRefresh = false,
  }) async {
    final path = archiveId != null
        ? '/api/keuangan/cash-book?archiveId=$archiveId'
        : '/api/keuangan/cash-book';
    return await _api.get(path, forceRefresh: forceRefresh)
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> createEntry(Map<String, dynamic> body) async {
    return await _api.post('/api/keuangan/cash-book', body: body)
        as Map<String, dynamic>;
  }

  Future<void> updateEntry(String id, Map<String, dynamic> body) async {
    await _api.put('/api/keuangan/cash-book/$id', body: body);
  }

  Future<void> deleteEntry(String id) async {
    await _api.delete('/api/keuangan/cash-book/$id');
  }

  Future<Map<String, dynamic>> getConfig() async {
    return await _api.get('/api/keuangan/config') as Map<String, dynamic>;
  }

  Future<RingkasanKasbon> getRingkasanKasbon({bool forceRefresh = false}) async {
    final json = await _api.get('/api/penggajian/ringkasan-kasbon',
        forceRefresh: forceRefresh);
    return RingkasanKasbon.fromJson(json as Map<String, dynamic>);
  }

  Future<RingkasanHutangPiutang> getRingkasanHutangPiutang(
      {bool forceRefresh = false}) async {
    final json = await _api.get('/api/keuangan/ringkasan-hutang-piutang',
        forceRefresh: forceRefresh);
    return RingkasanHutangPiutang.fromJson(json as Map<String, dynamic>);
  }

  Future<Map<String, dynamic>> getKasbonRiwayat(String actorId,
      {bool forceRefresh = false}) async {
    final json = await _api.get('/api/penggajian/pinjaman',
        queryParams: {'actor_id': actorId}, forceRefresh: forceRefresh);
    return json as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> kasbonAction(Map<String, dynamic> body) async {
    final json = await _api.post('/api/penggajian/pinjaman', body: body);
    return json as Map<String, dynamic>;
  }
}
