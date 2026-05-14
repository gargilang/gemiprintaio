import 'package:gemiprint/services/api_client.dart';

class UsersService {
  final ApiClient _api;
  UsersService(this._api);

  Future<List<dynamic>> getAll() async {
    final data = await _api.get('/api/users');
    return data['users'] as List? ?? [];
  }

  Future<void> create(Map<String, dynamic> body) async {
    await _api.post('/api/users', body: body);
  }

  Future<void> update(String id, Map<String, dynamic> body) async {
    await _api.put('/api/users/$id', body: body);
  }

  Future<void> delete(String id) async {
    await _api.delete('/api/users/$id');
  }
}
