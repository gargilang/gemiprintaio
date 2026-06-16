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
