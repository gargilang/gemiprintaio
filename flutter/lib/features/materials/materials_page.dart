import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gemiprint/core/constants/roles.dart';
import 'package:gemiprint/core/theme/app_theme.dart';
import 'package:gemiprint/models/material_item.dart';
import 'package:gemiprint/providers/providers.dart';
import 'package:gemiprint/services/api_client.dart';
import 'package:gemiprint/widgets/confirm_dialog.dart';
import 'package:gemiprint/widgets/empty_state.dart';
import 'package:gemiprint/widgets/search_field.dart';
import 'package:gemiprint/widgets/snackbar_helper.dart';
import 'package:gemiprint/features/materials/material_form_dialog.dart';
import 'package:intl/intl.dart';

class MaterialsPage extends ConsumerStatefulWidget {
  const MaterialsPage({super.key});

  @override
  ConsumerState<MaterialsPage> createState() => _MaterialsPageState();
}

class _MaterialsPageState extends ConsumerState<MaterialsPage> {
  List<MaterialItem> _materials = [];
  bool _isLoading = true;
  String _search = '';

  final _currencyFormat = NumberFormat.currency(
    locale: 'id_ID',
    symbol: 'Rp ',
    decimalDigits: 0,
  );

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData({bool forceRefresh = false}) async {
    if (_materials.isEmpty) {
      setState(() => _isLoading = true);
    }
    try {
      final data = await ref
          .read(materialsServiceProvider)
          .getAll(forceRefresh: forceRefresh);
      if (mounted) {
        setState(() {
          _materials = data;
          _isLoading = false;
        });
      }
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        showErrorSnackbar(context, e.message);
      }
    } catch (_) {
      if (mounted) {
        setState(() => _isLoading = false);
        showErrorSnackbar(context, 'Gagal memuat data barang');
      }
    }
  }

  List<MaterialItem> get _filtered {
    if (_search.isEmpty) return _materials;
    final q = _search.toLowerCase();
    return _materials
        .where(
          (m) =>
              m.nama.toLowerCase().contains(q) ||
              (m.kategoriNama?.toLowerCase().contains(q) ?? false) ||
              (m.deskripsi?.toLowerCase().contains(q) ?? false),
        )
        .toList();
  }

  Future<void> _showForm({MaterialItem? existing}) async {
    final result = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => MaterialFormDialog(existing: existing)),
    );
    if (result == true) _loadData();
  }

  Future<void> _handleDelete(MaterialItem m) async {
    if (!_canUseRiskyActions) return;
    final ok = await showConfirmDialog(
      context,
      title: 'Hapus Barang',
      message: 'Yakin ingin menghapus "${m.nama}"?',
      isDangerous: true,
    );
    if (!ok) return;

    try {
      await ref.read(materialsServiceProvider).delete(m.id);
      if (mounted) {
        showSuccessSnackbar(context, 'Barang berhasil dihapus');
        _loadData();
      }
    } on ApiException catch (e) {
      if (mounted) showErrorSnackbar(context, e.message);
    }
  }

  bool get _canUseRiskyActions {
    final role = ref.read(authStateProvider).valueOrNull?.role;
    return role != null && RoleGroups.adminOnly.contains(role);
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filtered;
    return Stack(
      children: [
        Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: Row(
                children: [
                  Expanded(
                    child: SearchField(
                      hintText: 'Cari barang...',
                      onChanged: (v) => setState(() => _search = v),
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: _isLoading
                  ? const Center(child: CircularProgressIndicator())
                  : filtered.isEmpty
                  ? EmptyState(
                      icon: Icons.category_rounded,
                      title: _search.isEmpty
                          ? 'Belum ada barang'
                          : 'Tidak ditemukan',
                    )
                  : RefreshIndicator(
                      onRefresh: () => _loadData(forceRefresh: true),
                      child: ListView.separated(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 80),
                        itemCount: filtered.length,
                        separatorBuilder: (_, _) => const SizedBox(height: 8),
                        itemBuilder: (_, i) => _buildCard(filtered[i]),
                      ),
                    ),
            ),
          ],
        ),
        Positioned(
          right: 16,
          bottom: 16,
          child: FloatingActionButton(
            backgroundColor: const Color(0xFF00AFEF),
            onPressed: () => _showForm(),
            child: const Icon(Icons.add_rounded),
          ),
        ),
      ],
    );
  }

  Widget _buildCard(MaterialItem m) {
    final defaultPrice = m.harga.isNotEmpty
        ? m.harga.firstWhere((p) => p.isDefault, orElse: () => m.harga.first)
        : null;
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => _showForm(existing: m),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  CircleAvatar(
                    backgroundColor: AppColors.success.withValues(alpha: 0.15),
                    child: const Icon(
                      Icons.category_rounded,
                      color: AppColors.success,
                      size: 20,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          m.nama,
                          style: const TextStyle(
                            fontWeight: FontWeight.w600,
                            fontSize: 15,
                          ),
                        ),
                        if (m.kategoriNama != null) ...[
                          const SizedBox(height: 2),
                          Text(
                            [m.kategoriNama, m.subkategoriNama]
                                .where((s) => s != null && s.isNotEmpty)
                                .join(' > '),
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.grey.shade600,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  if (_canUseRiskyActions)
                    IconButton(
                      icon: Icon(
                        Icons.delete_outline_rounded,
                        color: Colors.grey.shade400,
                        size: 20,
                      ),
                      onPressed: () => _handleDelete(m),
                    ),
                ],
              ),
              if (defaultPrice != null) ...[
                const Divider(height: 20),
                Row(
                  children: [
                    _priceChip(
                      'Jual',
                      _currencyFormat.format(defaultPrice.hargaJual),
                      AppColors.primary,
                    ),
                    const SizedBox(width: 8),
                    _priceChip(
                      'Beli',
                      _currencyFormat.format(defaultPrice.hargaBeli),
                      AppColors.warning,
                    ),
                    if (defaultPrice.hargaMember > 0) ...[
                      const SizedBox(width: 8),
                      _priceChip(
                        'Member',
                        _currencyFormat.format(defaultPrice.hargaMember),
                        AppColors.success,
                      ),
                    ],
                  ],
                ),
              ],
              if (m.trackStock) ...[
                const SizedBox(height: 8),
                Text(
                  'Stok: ${m.stok.toStringAsFixed(0)} ${m.satuanNama ?? ''}',
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _priceChip(String label, String value, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        '$label: $value',
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w500,
          color: color,
        ),
      ),
    );
  }
}
