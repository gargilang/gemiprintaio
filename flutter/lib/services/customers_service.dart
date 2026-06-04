import 'package:gemiprint/models/customer.dart';
import 'package:gemiprint/services/api_client.dart';

class CustomersService {
  final ApiClient _api;
  CustomersService(this._api);

  Future<List<Customer>> getAll() async {
    final data = await _api.get('/api/pelanggan');
    final list = data['pelanggan'] as List? ?? [];
    return list.map((j) => Customer.fromJson(j as Map<String, dynamic>)).toList();
  }

  Future<Customer> create(Map<String, dynamic> body) async {
    final data = await _api.post('/api/pelanggan', body: body);
    return Customer.fromJson(data['customer'] as Map<String, dynamic>);
  }

  Future<Customer> update(Map<String, dynamic> body) async {
    final data = await _api.put('/api/pelanggan', body: body);
    return Customer.fromJson(data['customer'] as Map<String, dynamic>);
  }

  Future<void> delete(String id) async {
    await _api.delete('/api/pelanggan?id=$id');
  }
}
