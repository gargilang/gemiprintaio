import 'package:gemiprint/models/vendor.dart';
import 'package:gemiprint/services/api_client.dart';

class VendorsService {
  final ApiClient _api;
  VendorsService(this._api);

  Future<List<Vendor>> getAll({bool forceRefresh = false}) async {
    final data = await _api.get('/api/vendors', forceRefresh: forceRefresh);
    final list = data['vendor'] as List? ?? [];
    return list.map((j) => Vendor.fromJson(j as Map<String, dynamic>)).toList();
  }

  Future<Vendor> create(Map<String, dynamic> body) async {
    final data = await _api.post('/api/vendors', body: body);
    return Vendor.fromJson(data['vendor'] as Map<String, dynamic>);
  }

  Future<Vendor> update(Map<String, dynamic> body) async {
    final data = await _api.put('/api/vendors', body: body);
    return Vendor.fromJson(data['vendor'] as Map<String, dynamic>);
  }

  Future<void> delete(String id) async {
    await _api.delete('/api/vendors?id=$id');
  }
}
