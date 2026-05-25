import 'package:gemiprint/services/api_client.dart';

class ProductionService {
  final ApiClient _api;
  ProductionService(this._api);

  Future<List<dynamic>> getOrders({bool forceRefresh = false}) async {
    final data = await _api.get('/api/production', forceRefresh: forceRefresh);
    return data['orders'] as List? ?? [];
  }

  Future<void> updateOrderStatus(String id, String status) async {
    await _api.patch('/api/production/$id', body: {'status': status});
  }

  Future<void> updateItemStatus(
    String itemId,
    String status, {
    String? operatorId,
  }) async {
    final body = <String, dynamic>{'status': status};
    if (operatorId != null) {
      body['operator_id'] = operatorId;
    }
    await _api.patch('/api/production/items/$itemId', body: body);
  }

  Future<Map<String, dynamic>> createOrderFromSale(
    Map<String, dynamic> body,
  ) async {
    return await _api.post('/api/production', body: body)
        as Map<String, dynamic>;
  }
}
