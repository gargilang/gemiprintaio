import 'package:gemiprint/core/constants/barang_placeholder.dart';
import 'package:gemiprint/models/material_item.dart';
import 'package:gemiprint/services/api_client.dart';

class MaterialsService {
  final ApiClient _api;
  MaterialsService(this._api);

  Future<List<MaterialItem>> getAll({bool forceRefresh = false}) async {
    final data = await _api.get('/api/barang', forceRefresh: forceRefresh);
    final list = data['barang'] as List? ?? [];
    final items = list
        .map((j) => MaterialItem.fromJson(j as Map<String, dynamic>))
        .toList();
    // Sembunyikan placeholder maklon dari katalog (sama seperti web).
    return sembunyikanPlaceholderBarang(items);
  }

  Future<MaterialItem> create(Map<String, dynamic> body) async {
    final data = await _api.post('/api/barang', body: body);
    return MaterialItem.fromJson(data['material'] as Map<String, dynamic>);
  }

  Future<MaterialItem> update(String id, Map<String, dynamic> body) async {
    final data = await _api.put('/api/barang/$id', body: body);
    return MaterialItem.fromJson(data['material'] as Map<String, dynamic>);
  }

  Future<void> delete(String id) async {
    await _api.delete('/api/barang/$id');
  }
}
