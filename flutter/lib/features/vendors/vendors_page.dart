import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gemiprint/core/constants/roles.dart';
import 'package:gemiprint/core/theme/app_theme.dart';
import 'package:gemiprint/models/vendor.dart';
import 'package:gemiprint/providers/providers.dart';
import 'package:gemiprint/services/api_client.dart';
import 'package:gemiprint/widgets/confirm_dialog.dart';
import 'package:gemiprint/widgets/empty_state.dart';
import 'package:gemiprint/widgets/snackbar_helper.dart';
import 'package:gemiprint/features/vendors/vendor_form_sheet.dart';

class VendorsPage extends ConsumerStatefulWidget {
  const VendorsPage({super.key});

  @override
  ConsumerState<VendorsPage> createState() => _VendorsPageState();
}

class _VendorsPageState extends ConsumerState<VendorsPage> {
  List<Vendor> _vendors = [];
  bool _isLoading = true;
  String _search = '';
  String _activeFilter = 'Semua'; // 'Semua', 'Supplier', 'Subkontraktor', 'Keduanya'

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final data = await ref.read(vendorsServiceProvider).getAll();
      if (mounted) {
        setState(() {
          _vendors = data;
          _isLoading = false;
        });
      }
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        if (e.isUnauthorized) {
          ref.read(authStateProvider.notifier).logout();
          return;
        }
        showErrorSnackbar(context, e.message);
      }
    } catch (_) {
      if (mounted) {
        setState(() => _isLoading = false);
        showErrorSnackbar(context, 'Gagal memuat data vendor');
      }
    }
  }

  List<Vendor> get _filtered {
    List<Vendor> result = _vendors;

    // Filter by tipe
    if (_activeFilter != 'Semua') {
      result = result.where((v) => v.tipeVendor.toUpperCase() == _activeFilter.toUpperCase()).toList();
    }

    // Search
    if (_search.isNotEmpty) {
      final q = _search.toLowerCase();
      result = result.where((v) =>
        v.namaPerusahaan.toLowerCase().contains(q) ||
        (v.kontakPerson?.toLowerCase().contains(q) ?? false) ||
        (v.telepon?.toLowerCase().contains(q) ?? false)
      ).toList();
    }

    return result;
  }

  int _tipeCount(String tipe) => _vendors.where((v) => v.tipeVendor == tipe).length;

  Future<void> _showForm({Vendor? existing}) async {
    final result = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (_) => VendorFormSheet(existing: existing),
    );
    if (result == true) _loadData();
  }

  Future<void> _handleDelete(Vendor v) async {
    if (!_canUseRiskyActions) return;
    final ok = await showConfirmDialog(
      context,
      title: 'Hapus Vendor',
      message: 'Yakin ingin menghapus "${v.namaPerusahaan}"?',
      isDangerous: true,
    );
    if (!ok) return;

    try {
      await ref.read(vendorsServiceProvider).delete(v.id);
      if (mounted) {
        showSuccessSnackbar(context, 'Vendor berhasil dihapus');
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

  Color _tipeVendorColor(String tipe) {
    switch (tipe) {
      case 'SUPPLIER':
        return const Color(0xFF7B1FA2); // deep purple
      case 'SUBKONTRAKTOR':
        return const Color(0xFFE65100); // deep orange
      case 'KEDUANYA':
        return const Color(0xFF00695C); // teal
      default:
        return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filtered;

    return Stack(
      children: [
        Column(
          children: [
            // Header
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
              child: Row(
                children: [
                  const Text(
                    'Vendor',
                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                    decoration: BoxDecoration(
                      color: AppColors.accent.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      '${_vendors.length}',
                      style: const TextStyle(
                        color: AppColors.accent,
                        fontWeight: FontWeight.w600,
                        fontSize: 13,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            // Stat chips
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: Wrap(
                spacing: 8,
                children: [
                  _buildStatChip('Supplier', _tipeCount('SUPPLIER'), const Color(0xFF7B1FA2)),
                  _buildStatChip('Subkontraktor', _tipeCount('SUBKONTRAKTOR'), const Color(0xFFE65100)),
                  _buildStatChip('Keduanya', _tipeCount('KEDUANYA'), const Color(0xFF00695C)),
                ],
              ),
            ),
            // Search
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
              child: TextField(
                decoration: InputDecoration(
                  hintText: 'Cari vendor...',
                  prefixIcon: const Icon(Icons.search, size: 20),
                  suffixIcon: _search.isNotEmpty
                      ? IconButton(
                          icon: const Icon(Icons.clear, size: 18),
                          onPressed: () => setState(() => _search = ''),
                        )
                      : null,
                  filled: true,
                  fillColor: Theme.of(context).colorScheme.surfaceContainerHighest.withValues(alpha: 0.3),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(28),
                    borderSide: BorderSide.none,
                  ),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                ),
                onChanged: (v) => setState(() => _search = v),
              ),
            ),
            // Filter chips
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: ['Semua', 'Supplier', 'Subkontraktor', 'Keduanya'].map((label) {
                    final isSelected = _activeFilter == label;
                    return Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: FilterChip(
                        label: Text(label, style: TextStyle(fontSize: 12, fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal)),
                        selected: isSelected,
                        onSelected: (_) => setState(() => _activeFilter = label),
                        selectedColor: AppColors.accent.withValues(alpha: 0.15),
                        checkmarkColor: AppColors.accent,
                        visualDensity: VisualDensity.compact,
                      ),
                    );
                  }).toList(),
                ),
              ),
            ),
            // List
            Expanded(child: _buildBody(filtered)),
          ],
        ),
        // FAB
        Positioned(
          right: 16,
          bottom: 16,
          child: FloatingActionButton(
            onPressed: () => _showForm(),
            backgroundColor: AppColors.accent,
            child: const Icon(Icons.add_rounded),
          ),
        ),
      ],
    );
  }

  Widget _buildStatChip(String label, int count, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(shape: BoxShape.circle, color: color),
          ),
          const SizedBox(width: 6),
          Text(
            '$count $label',
            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: color),
          ),
        ],
      ),
    );
  }

  Widget _buildBody(List<Vendor> filtered) {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_vendors.isEmpty) {
      return EmptyState(
        icon: Icons.business_rounded,
        title: 'Belum ada vendor',
        action: ElevatedButton.icon(
          onPressed: () => _showForm(),
          icon: const Icon(Icons.add, size: 18),
          label: const Text('Tambah Vendor'),
        ),
      );
    }

    if (filtered.isEmpty) {
      return EmptyState(
        icon: Icons.search_off_rounded,
        title: 'Tidak ditemukan',
        subtitle: 'Coba kata kunci lain atau ubah filter',
      );
    }

    return RefreshIndicator(
      onRefresh: _loadData,
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 80),
        itemCount: filtered.length,
        itemBuilder: (_, i) => _buildCard(filtered[i]),
      ),
    );
  }

  Widget _buildCard(Vendor v) {
    final initials = v.namaPerusahaan.isNotEmpty ? v.namaPerusahaan[0].toUpperCase() : '?';
    final tipeColor = _tipeVendorColor(v.tipeVendor);
    return Card(
      margin: const EdgeInsets.only(bottom: 6),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => _showForm(existing: v),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              // Avatar
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  gradient: LinearGradient(
                    colors: [tipeColor, tipeColor.withValues(alpha: 0.7)],
                  ),
                ),
                alignment: Alignment.center,
                child: Text(
                  initials,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    fontSize: 16,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              // Company name + subtext
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            v.namaPerusahaan,
                            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: tipeColor.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            v.tipeVendor == 'SUPPLIER' ? 'Supplier' :
                            v.tipeVendor == 'SUBKONTRAKTOR' ? 'Subkontraktor' : 'Keduanya',
                            style: TextStyle(
                              color: tipeColor,
                              fontSize: 10,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      [
                        if (v.kontakPerson != null && v.kontakPerson!.isNotEmpty)
                          v.kontakPerson!,
                        if (v.telepon != null && v.telepon!.isNotEmpty)
                          v.telepon!,
                      ].join(' · '),
                      style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              // Chevron + delete
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (_canUseRiskyActions)
                    IconButton(
                      icon: const Icon(Icons.delete_outline_rounded, size: 20),
                      color: Colors.grey.shade400,
                      onPressed: () => _handleDelete(v),
                      visualDensity: VisualDensity.compact,
                    ),
                  Icon(Icons.chevron_right, color: Colors.grey.shade400, size: 20),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
