import 'package:gemiprint/services/api_client.dart';

class PurchasesService {
  final ApiClient _api;
  PurchasesService(this._api);

  Future<List<dynamic>> getAll() async {
    final data = await _api.get('/api/purchases');
    return data['purchases'] as List? ?? [];
  }

  Future<Map<String, dynamic>> getInitData() async {
    return await _api.get('/api/purchases/init-data') as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> create(Map<String, dynamic> body) async {
    return await _api.post('/api/purchases', body: body)
        as Map<String, dynamic>;
  }

  Future<void> delete(String id) async {
    await _api.delete('/api/purchases/$id');
  }

  Future<List<dynamic>> getDebts() async {
    final data = await _api.get('/api/purchases/debts');
    return data['debts'] as List? ?? [];
  }

  Future<void> payDebt(Map<String, dynamic> body) async {
    await _api.post(
      '/api/purchases/pay-debt',
      body: {
        'purchase_id':
            body['purchase_id'] ?? body['pembelian_id'] ?? body['id'],
        'jumlah_bayar': body['jumlah_bayar'] ?? body['jumlah'],
        if (body['tanggal_bayar'] != null)
          'tanggal_bayar': body['tanggal_bayar'],
        if (body['metode_pembayaran'] != null)
          'metode_pembayaran': body['metode_pembayaran'],
        if (body['referensi'] != null) 'referensi': body['referensi'],
        if (body['catatan'] != null) 'catatan': body['catatan'],
        if (body['dibuat_oleh'] != null) 'dibuat_oleh': body['dibuat_oleh'],
      },
    );
  }
}
