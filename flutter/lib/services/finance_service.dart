import 'package:gemiprint/services/api_client.dart';

class FinanceService {
  final ApiClient _api;
  FinanceService(this._api);

  Future<Map<String, dynamic>> getCashBook({String? archiveId}) async {
    final path = archiveId != null
        ? '/api/finance/cash-book?archiveId=$archiveId'
        : '/api/finance/cash-book';
    return await _api.get(path) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> createEntry(Map<String, dynamic> body) async {
    return await _api.post('/api/finance/cash-book', body: body) as Map<String, dynamic>;
  }

  Future<void> updateEntry(Map<String, dynamic> body) async {
    await _api.put('/api/finance/cash-book', body: body);
  }

  Future<void> deleteEntry(String id) async {
    await _api.delete('/api/finance/cash-book?id=$id');
  }

  Future<Map<String, dynamic>> getConfig() async {
    return await _api.get('/api/finance/config') as Map<String, dynamic>;
  }
}
