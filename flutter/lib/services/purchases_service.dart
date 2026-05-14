import 'package:gemiprint/services/api_client.dart';

class PurchasesService {
  final ApiClient _api;
  PurchasesService(this._api);

  Future<List<dynamic>> getAll() async {
    final data = await _api.get('/api/purchases');
    return data['purchases'] as List? ?? [];
  }

  Future<Map<String, dynamic>> getInitData() async {
    return await _api.get('/api/purchases/init-data') as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> create(Map<String, dynamic> body) async {
    return await _api.post('/api/purchases', body: body) as Map<String, dynamic>;
  }

  Future<void> delete(String id) async {
    await _api.delete('/api/purchases/$id');
  }

  Future<List<dynamic>> getDebts() async {
    final data = await _api.get('/api/purchases/debts');
    return data['debts'] as List? ?? [];
  }

  Future<void> payDebt(Map<String, dynamic> body) async {
    await _api.post('/api/purchases/pay-debt', body: body);
  }
}
