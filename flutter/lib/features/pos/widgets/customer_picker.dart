import 'package:flutter/material.dart';
import 'package:gemiprint/core/theme/app_theme.dart';
import 'package:gemiprint/models/customer.dart';
import 'package:gemiprint/services/api_client.dart';
import 'package:gemiprint/services/customers_service.dart';

/// Bottom sheet: cari pelanggan yang ada ATAU buat pelanggan baru inline.
/// Mengembalikan [Customer] terpilih/baru (atau null untuk Pelanggan Umum).
Future<Customer?> showCustomerPicker(
  BuildContext context, {
  required List<Customer> customers,
  required CustomersService customersService,
}) {
  return showModalBottomSheet<Customer?>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) => _CustomerPickerBody(
      customers: customers,
      customersService: customersService,
    ),
  );
}

class _CustomerPickerBody extends StatefulWidget {
  final List<Customer> customers;
  final CustomersService customersService;
  const _CustomerPickerBody({
    required this.customers,
    required this.customersService,
  });

  @override
  State<_CustomerPickerBody> createState() => _CustomerPickerBodyState();
}

class _CustomerPickerBodyState extends State<_CustomerPickerBody> {
  String _query = '';
  bool _creating = false;
  bool _saving = false;
  String? _error;
  final _namaCtrl = TextEditingController();
  final _teleponCtrl = TextEditingController();
  final _alamatCtrl = TextEditingController();
  bool _isMember = false;

  @override
  void dispose() {
    _namaCtrl.dispose();
    _teleponCtrl.dispose();
    _alamatCtrl.dispose();
    super.dispose();
  }

  List<Customer> get _filtered {
    final q = _query.trim().toLowerCase();
    if (q.isEmpty) return widget.customers;
    return widget.customers
        .where((c) => c.nama.toLowerCase().contains(q))
        .toList();
  }

  Future<void> _create() async {
    if (_namaCtrl.text.trim().isEmpty) {
      setState(() => _error = 'Nama pelanggan wajib diisi');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final created = await widget.customersService.create({
        'tipe_pelanggan': 'perorangan',
        'nama': _namaCtrl.text.trim(),
        if (_teleponCtrl.text.trim().isNotEmpty)
          'telepon': _teleponCtrl.text.trim(),
        if (_alamatCtrl.text.trim().isNotEmpty)
          'alamat': _alamatCtrl.text.trim(),
        'is_member': _isMember,
      });
      if (mounted) Navigator.pop(context, created);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.8,
      expand: false,
      builder: (_, scroll) => Column(
        children: [
          Container(
            margin: const EdgeInsets.symmetric(vertical: 8),
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: Colors.grey.shade300,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    _creating ? 'Pelanggan Baru' : 'Pilih Pelanggan',
                    style: const TextStyle(
                        fontSize: 17, fontWeight: FontWeight.bold),
                  ),
                ),
                TextButton(
                  onPressed: () => setState(() {
                    _creating = !_creating;
                    _error = null;
                  }),
                  child: Text(_creating ? 'Cari yang ada' : '+ Buat baru'),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: _creating ? _buildCreate(scroll) : _buildSearch(scroll),
          ),
        ],
      ),
    );
  }

  Widget _buildSearch(ScrollController scroll) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: TextField(
            decoration: const InputDecoration(
              hintText: 'Cari nama pelanggan...',
              prefixIcon: Icon(Icons.search),
              isDense: true,
            ),
            onChanged: (v) => setState(() => _query = v),
          ),
        ),
        ListTile(
          leading: const Icon(Icons.person_outline),
          title: const Text('Pelanggan Umum'),
          onTap: () => Navigator.pop(context, null),
        ),
        const Divider(height: 1),
        Expanded(
          child: ListView.builder(
            controller: scroll,
            itemCount: _filtered.length,
            itemBuilder: (_, i) {
              final c = _filtered[i];
              return ListTile(
                title: Text(c.nama),
                subtitle: c.telepon != null ? Text(c.telepon!) : null,
                trailing: c.isMember
                    ? Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: AppColors.success.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: const Text('Member',
                            style: TextStyle(
                                fontSize: 10, color: AppColors.success)),
                      )
                    : null,
                onTap: () => Navigator.pop(context, c),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildCreate(ScrollController scroll) {
    return ListView(
      controller: scroll,
      padding: const EdgeInsets.all(16),
      children: [
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(_error!,
                style: const TextStyle(color: AppColors.error, fontSize: 13)),
          ),
        TextField(
          controller: _namaCtrl,
          decoration: const InputDecoration(
              labelText: 'Nama *', isDense: true),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _teleponCtrl,
          keyboardType: TextInputType.phone,
          decoration:
              const InputDecoration(labelText: 'Telepon', isDense: true),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _alamatCtrl,
          decoration:
              const InputDecoration(labelText: 'Alamat / Kota', isDense: true),
        ),
        const SizedBox(height: 8),
        SwitchListTile(
          value: _isMember,
          activeThumbColor: AppColors.primary,
          contentPadding: EdgeInsets.zero,
          title: const Text('Member', style: TextStyle(fontSize: 14)),
          onChanged: (v) => setState(() => _isMember = v),
        ),
        const SizedBox(height: 16),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: _saving ? null : _create,
            child: Text(_saving ? 'Menyimpan...' : 'Simpan Pelanggan'),
          ),
        ),
      ],
    );
  }
}
