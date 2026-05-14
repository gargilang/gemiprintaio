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

  Future<void> updateItemStatus(String orderId, String itemId, Map<String, dynamic> body) async {
    await _api.put('/api/production/$orderId/items/$itemId', body: body);
  }

  Future<Map<String, dynamic>> createOrderFromSale(Map<String, dynamic> body) async {
    return await _api.post('/api/production', body: body) as Map<String, dynamic>;
  }
}
