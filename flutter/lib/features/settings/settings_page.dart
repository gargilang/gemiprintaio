import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gemiprint/core/theme/app_theme.dart';
import 'package:gemiprint/providers/providers.dart';
import 'package:gemiprint/services/api_client.dart';
import 'package:gemiprint/widgets/snackbar_helper.dart';

class SettingsPage extends ConsumerStatefulWidget {
  const SettingsPage({super.key});

  @override
  ConsumerState<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends ConsumerState<SettingsPage> {
  List<dynamic> _categories = [];
  List<dynamic> _units = [];
  List<dynamic> _finishingOptions = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final api = ref.read(apiClientProvider);
      final results = await Future.wait([
        api.get('/api/master/categories'),
        api.get('/api/master/units'),
        api.get('/api/finishing-options'),
      ]);
      if (mounted) {
        setState(() {
          _categories = results[0]['categories'] as List? ?? [];
          _units = results[1]['units'] as List? ?? [];
          _finishingOptions = results[2]['options'] as List? ?? results[2]['finishing_options'] as List? ?? [];
          _isLoading = false;
        });
      }
    } catch (_) {
      if (mounted) { setState(() => _isLoading = false); showErrorSnackbar(context, 'Gagal memuat pengaturan'); }
    }
  }

  Future<void> _addItem(String type) async {
    final nameCtrl = TextEditingController();
    final result = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Tambah ${_typeLabel(type)}'),
        content: TextField(controller: nameCtrl, decoration: const InputDecoration(labelText: 'Nama'), autofocus: true),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Batal')),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, nameCtrl.text.trim()), child: const Text('Simpan')),
        ],
      ),
    );
    if (result == null || result.isEmpty) return;

    try {
      final api = ref.read(apiClientProvider);
      switch (type) {
        case 'category':
          await api.post('/api/master/categories', body: {'nama': result});
        case 'unit':
          await api.post('/api/master/units', body: {'nama': result});
        case 'finishing':
          await api.post('/api/finishing-options', body: {'nama': result});
      }
      if (mounted) { showSuccessSnackbar(context, '${_typeLabel(type)} berhasil ditambahkan'); _loadData(); }
    } on ApiException catch (e) {
      if (mounted) showErrorSnackbar(context, e.message);
    }
  }

  String _typeLabel(String type) => switch (type) {
    'category' => 'Kategori',
    'unit' => 'Satuan',
    'finishing' => 'Opsi Finishing',
    _ => type,
  };

  @override
  Widget build(BuildContext context) {
    if (_isLoading) return const Center(child: CircularProgressIndicator());

    return RefreshIndicator(
      onRefresh: _loadData,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _buildSection('Kategori Barang', 'category', _categories, Icons.folder_rounded),
          const SizedBox(height: 16),
          _buildSection('Satuan', 'unit', _units, Icons.straighten_rounded),
          const SizedBox(height: 16),
          _buildSection('Opsi Finishing', 'finishing', _finishingOptions, Icons.auto_fix_high_rounded),
        ],
      ),
    );
  }

  Widget _buildSection(String title, String type, List<dynamic> items, IconData icon) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, color: AppColors.primary, size: 20),
                const SizedBox(width: 8),
                Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                const Spacer(),
                TextButton.icon(
                  onPressed: () => _addItem(type),
                  icon: const Icon(Icons.add, size: 16),
                  label: const Text('Tambah'),
                ),
              ],
            ),
            const Divider(),
            if (items.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Text('Belum ada data', style: TextStyle(color: Colors.grey.shade500, fontSize: 13)),
              )
            else
              ...items.map((item) {
                final name = item['nama'] as String? ?? '-';
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(
                    children: [
                      Container(width: 6, height: 6, decoration: BoxDecoration(color: AppColors.primary, borderRadius: BorderRadius.circular(3))),
                      const SizedBox(width: 10),
                      Expanded(child: Text(name, style: const TextStyle(fontSize: 14))),
                    ],
                  ),
                );
              }),
          ],
        ),
      ),
    );
  }
}
