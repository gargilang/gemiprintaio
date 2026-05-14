import 'package:gemiprint/services/api_client.dart';

class ProductionService {
  final ApiClient _api;
  ProductionService(this._api);

  Future<List<dynamic>> getOrders() async {
    final data = await _api.get('/api/production');
    return data['orders'] as List? ?? [];
  }

  Future<void> updateOrderStatus(String id, String status) async {
    await _api.put('/api/production/$id', body: {'status': status});
  }

  Future<void> updateItemStatus(String itemId, Map<String, dynamic> body) async {
    await _api.put('/api/production/items/$itemId', body: body);
  }
}
