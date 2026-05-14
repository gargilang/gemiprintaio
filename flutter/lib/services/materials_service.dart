import 'package:gemiprint/models/material_item.dart';
import 'package:gemiprint/services/api_client.dart';

class MaterialsService {
  final ApiClient _api;
  MaterialsService(this._api);

  Future<List<MaterialItem>> getAll({bool forceRefresh = false}) async {
    final data = await _api.get('/api/materials', forceRefresh: forceRefresh);
    final list = data['barang'] as List? ?? [];
    return list.map((j) => MaterialItem.fromJson(j as Map<String, dynamic>)).toList();
  }

  Future<MaterialItem> create(Map<String, dynamic> body) async {
    final data = await _api.post('/api/materials', body: body);
    return MaterialItem.fromJson(data['material'] as Map<String, dynamic>);
  }

  Future<MaterialItem> update(String id, Map<String, dynamic> body) async {
    final data = await _api.put('/api/materials/$id', body: body);
    return MaterialItem.fromJson(data['material'] as Map<String, dynamic>);
  }

  Future<void> delete(String id) async {
    await _api.delete('/api/materials/$id');
  }
}
