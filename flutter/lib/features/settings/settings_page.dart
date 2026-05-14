import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gemiprint/core/theme/app_theme.dart';
import 'package:gemiprint/providers/providers.dart';
import 'package:gemiprint/services/api_client.dart';
import 'package:gemiprint/widgets/confirm_dialog.dart';
import 'package:gemiprint/widgets/snackbar_helper.dart';

class SettingsPage extends ConsumerStatefulWidget {
  const SettingsPage({super.key});

  @override
  ConsumerState<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends ConsumerState<SettingsPage> {
  List<dynamic> _categories = [];
  List<dynamic> _subcategories = [];
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
        api.get('/api/master/subcategories'),
        api.get('/api/master/units'),
        api.get('/api/finishing-options'),
      ]);
      if (mounted) {
        setState(() {
          _categories = results[0]['categories'] as List? ?? [];
          _subcategories = results[1]['subcategories'] as List? ?? [];
          _units = results[2]['units'] as List? ?? [];
          _finishingOptions = results[3]['options'] as List? ??
              results[3]['finishing_options'] as List? ?? [];
          _isLoading = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() => _isLoading = false);
        showErrorSnackbar(context, 'Gagal memuat pengaturan');
      }
    }
  }

  Future<void> _showItemForm(String type, {Map<String, dynamic>? existing}) async {
    final nameCtrl =
        TextEditingController(text: existing?['nama'] as String? ?? '');
    String? selectedCategoryId = existing?['kategori_id'] as String?;

    final result = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => AlertDialog(
          title: Text(existing == null
              ? 'Tambah ${_typeLabel(type)}'
              : 'Edit ${_typeLabel(type)}'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameCtrl,
                decoration: const InputDecoration(
                    labelText: 'Nama', isDense: true),
                autofocus: true,
              ),
              if (type == 'subcategory') ...[
                const SizedBox(height: 12),
                DropdownButtonFormField<String?>(
                  value: selectedCategoryId,
                  decoration: const InputDecoration(
                      labelText: 'Kategori Induk', isDense: true),
                  items: _categories
                      .map((c) => DropdownMenuItem<String>(
                            value: c['id'] as String?,
                            child: Text(c['nama'] as String? ?? ''),
                          ))
                      .toList(),
                  onChanged: (v) =>
                      setLocal(() => selectedCategoryId = v),
                ),
              ],
            ],
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Batal')),
            ElevatedButton(
              onPressed: () async {
                final name = nameCtrl.text.trim();
                if (name.isEmpty) return;
                try {
                  final api = ref.read(apiClientProvider);
                  final body = {
                    'nama': name,
                    if (type == 'subcategory' &&
                        selectedCategoryId != null)
                      'kategori_id': selectedCategoryId,
                  };
                  if (existing == null) {
                    await api.post(_apiPath(type), body: body);
                  } else {
                    await api.put('${_apiPath(type)}/${existing['id']}',
                        body: body);
                  }
                  if (ctx.mounted) Navigator.pop(ctx, true);
                } on ApiException catch (e) {
                  if (ctx.mounted) showErrorSnackbar(ctx, e.message);
                }
              },
              child: const Text('Simpan'),
            ),
          ],
        ),
      ),
    );
    nameCtrl.dispose();
    if (result == true && mounted) {
      showSuccessSnackbar(
          context,
          existing == null
              ? '${_typeLabel(type)} berhasil ditambahkan'
              : '${_typeLabel(type)} berhasil diperbarui');
      _loadData();
    }
  }

  Future<void> _deleteItem(String type, Map<String, dynamic> item) async {
    final ok = await showConfirmDialog(
      context,
      title: 'Hapus ${_typeLabel(type)}',
      message: 'Hapus "${item['nama']}"?',
      isDangerous: true,
    );
    if (!ok) return;
    try {
      await ref.read(apiClientProvider).delete('${_apiPath(type)}/${item['id']}');
      if (mounted) {
        showSuccessSnackbar(context, '${_typeLabel(type)} berhasil dihapus');
        _loadData();
      }
    } on ApiException catch (e) {
      if (mounted) showErrorSnackbar(context, e.message);
    }
  }

  String _typeLabel(String type) => switch (type) {
    'category' => 'Kategori',
    'subcategory' => 'Sub-Kategori',
    'unit' => 'Satuan',
    'finishing' => 'Opsi Finishing',
    _ => type,
  };

  String _apiPath(String type) => switch (type) {
    'category' => '/api/master/categories',
    'subcategory' => '/api/master/subcategories',
    'unit' => '/api/master/units',
    'finishing' => '/api/finishing-options',
    _ => '/api/master/$type',
  };

  @override
  Widget build(BuildContext context) {
    if (_isLoading) return const Center(child: CircularProgressIndicator());

    return RefreshIndicator(
      onRefresh: _loadData,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _buildSection(
            'Kategori Barang',
            'category',
            _categories,
            Icons.folder_rounded,
          ),
          const SizedBox(height: 16),
          _buildSection(
            'Sub-Kategori',
            'subcategory',
            _subcategories,
            Icons.subdirectory_arrow_right_rounded,
            subtitle: (item) {
              final cat = _categories.firstWhere(
                (c) => c['id'] == item['kategori_id'],
                orElse: () => <String, dynamic>{},
              );
              return cat['nama'] as String? ?? '';
            },
          ),
          const SizedBox(height: 16),
          _buildSection(
            'Satuan',
            'unit',
            _units,
            Icons.straighten_rounded,
          ),
          const SizedBox(height: 16),
          _buildSection(
            'Opsi Finishing',
            'finishing',
            _finishingOptions,
            Icons.auto_fix_high_rounded,
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  Widget _buildSection(
    String title,
    String type,
    List<dynamic> items,
    IconData icon, {
    String? Function(Map<String, dynamic>)? subtitle,
  }) {
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
                Expanded(
                  child: Text(title,
                      style: const TextStyle(
                          fontSize: 16, fontWeight: FontWeight.w600)),
                ),
                TextButton.icon(
                  onPressed: () => _showItemForm(type),
                  icon: const Icon(Icons.add, size: 16),
                  label: const Text('Tambah'),
                ),
              ],
            ),
            const Divider(),
            if (items.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Text(
                  'Belum ada data',
                  style: TextStyle(
                      color: Colors.grey.shade500, fontSize: 13),
                ),
              )
            else
              ...items.map((item) {
                final m = item as Map<String, dynamic>;
                final name = m['nama'] as String? ?? '-';
                final sub = subtitle?.call(m);
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 2),
                  child: Row(
                    children: [
                      Container(
                        width: 6,
                        height: 6,
                        decoration: BoxDecoration(
                          color: AppColors.primary,
                          borderRadius: BorderRadius.circular(3),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(name,
                                style: const TextStyle(fontSize: 14)),
                            if (sub != null && sub.isNotEmpty)
                              Text(sub,
                                  style: TextStyle(
                                      fontSize: 11,
                                      color: Colors.grey.shade500)),
                          ],
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.edit_outlined,
                            size: 17, color: AppColors.primary),
                        onPressed: () =>
                            _showItemForm(type, existing: m),
                        visualDensity: VisualDensity.compact,
                        padding: EdgeInsets.zero,
                      ),
                      IconButton(
                        icon: Icon(Icons.delete_outline,
                            size: 17,
                            color: Colors.grey.shade400),
                        onPressed: () => _deleteItem(type, m),
                        visualDensity: VisualDensity.compact,
                        padding: EdgeInsets.zero,
                      ),
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
