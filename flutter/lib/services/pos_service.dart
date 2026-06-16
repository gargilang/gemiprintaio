import 'package:gemiprint/services/api_client.dart';
import 'package:gemiprint/features/pos/models/finishing_option.dart';

class PosService {
  final ApiClient _api;
  PosService(this._api);

  Future<Map<String, dynamic>> getInitData() async {
    return await _api.get('/api/pos/init-data') as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> createSale(Map<String, dynamic> body) async {
    return await _api.post('/api/pos/sales', body: body) as Map<String, dynamic>;
  }

  Future<List<FinishingOption>> getFinishingOptions() async {
    final data =
        await _api.get('/api/finishing-options') as Map<String, dynamic>;
    final list = (data['options'] as List?) ?? [];
    return list
        .map((j) => FinishingOption.fromJson(j as Map<String, dynamic>))
        .toList();
  }

  Future<void> deleteSale(String id) async {
    await _api.delete('/api/pos/sales/$id');
  }

  Future<List<Map<String, dynamic>>> getSales({int limit = 100}) async {
    final data = await _api.get('/api/pos/sales',
        queryParams: {'limit': limit.toString()}, forceRefresh: true);
    final list = data['sales'] as List? ?? [];
    return list.cast<Map<String, dynamic>>();
  }

  Future<void> voidSale(String id, String reason) async {
    await _api.delete('/api/pos/sales/$id', body: {'reason': reason});
  }

  Future<Map<String, dynamic>> getReceivables() async {
    return await _api.get('/api/pos/receivables') as Map<String, dynamic>;
  }

  Future<void> payReceivable(Map<String, dynamic> body) async {
    await _api.post('/api/pos/pay-receivable', body: body);
  }

  Future<void> revertPayment(Map<String, dynamic> body) async {
    await _api.post('/api/pos/sales/revert-payment', body: body);
  }
}
