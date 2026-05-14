import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gemiprint/core/theme/app_theme.dart';
import 'package:gemiprint/models/vendor.dart';
import 'package:gemiprint/providers/providers.dart';
import 'package:gemiprint/services/api_client.dart';
import 'package:gemiprint/widgets/confirm_dialog.dart';
import 'package:gemiprint/widgets/empty_state.dart';
import 'package:gemiprint/widgets/search_field.dart';
import 'package:gemiprint/widgets/snackbar_helper.dart';
import 'package:gemiprint/features/vendors/vendor_form_dialog.dart';

class VendorsPage extends ConsumerStatefulWidget {
  const VendorsPage({super.key});

  @override
  ConsumerState<VendorsPage> createState() => _VendorsPageState();
}

class _VendorsPageState extends ConsumerState<VendorsPage> {
  List<Vendor> _vendors = [];
  bool _isLoading = true;
  String _search = '';

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final data = await ref.read(vendorsServiceProvider).getAll();
      if (mounted) setState(() { _vendors = data; _isLoading = false; });
    } on ApiException catch (e) {
      if (mounted) { setState(() => _isLoading = false); showErrorSnackbar(context, e.message); }
    } catch (_) {
      if (mounted) { setState(() => _isLoading = false); showErrorSnackbar(context, 'Gagal memuat data vendor'); }
    }
  }

  List<Vendor> get _filtered {
    if (_search.isEmpty) return _vendors;
    final q = _search.toLowerCase();
    return _vendors.where((v) =>
      v.namaPerusahaan.toLowerCase().contains(q) ||
      (v.kontakPerson?.toLowerCase().contains(q) ?? false) ||
      (v.telepon?.toLowerCase().contains(q) ?? false)
    ).toList();
  }

  Future<void> _showForm({Vendor? existing}) async {
    final result = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => VendorFormDialog(existing: existing),
    );
    if (result == true) _loadData();
  }

  Future<void> _handleDelete(Vendor v) async {
    final ok = await showConfirmDialog(context,
      title: 'Hapus Vendor',
      message: 'Yakin ingin menghapus "${v.namaPerusahaan}"?',
      isDangerous: true,
    );
    if (!ok) return;

    try {
      await ref.read(vendorsServiceProvider).delete(v.id);
      if (mounted) { showSuccessSnackbar(context, 'Vendor berhasil dihapus'); _loadData(); }
    } on ApiException catch (e) {
      if (mounted) showErrorSnackbar(context, e.message);
    }
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
              Expanded(child: SearchField(hintText: 'Cari vendor...', onChanged: (v) => setState(() => _search = v))),
              const SizedBox(width: 8),
              Text('${filtered.length} data', style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
            ],
          ),
        ),
        Expanded(
          child: _isLoading
              ? const Center(child: CircularProgressIndicator())
              : filtered.isEmpty
                  ? EmptyState(
                      icon: Icons.business_rounded,
                      title: _search.isEmpty ? 'Belum ada vendor' : 'Tidak ditemukan',
                      action: _search.isEmpty ? ElevatedButton.icon(
                        onPressed: () => _showForm(),
                        icon: const Icon(Icons.add, size: 18),
                        label: const Text('Tambah Vendor'),
                      ) : null,
                    )
                  : RefreshIndicator(
                      onRefresh: _loadData,
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
        onPressed: () => _showForm(),
        child: const Icon(Icons.add_rounded),
      ),
    ),
      ],
    );
  }

  Widget _buildCard(Vendor v) {
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => _showForm(existing: v),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              CircleAvatar(
                backgroundColor: AppColors.accent.withValues(alpha: 0.15),
                child: Text(v.namaPerusahaan[0].toUpperCase(), style: const TextStyle(color: AppColors.accent, fontWeight: FontWeight.bold)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(v.namaPerusahaan, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15), overflow: TextOverflow.ellipsis),
                    const SizedBox(height: 2),
                    Text(
                      [if (v.kontakPerson != null && v.kontakPerson!.isNotEmpty) v.kontakPerson!, if (v.telepon != null && v.telepon!.isNotEmpty) v.telepon!]
                          .join(' · '),
                      style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              IconButton(
                icon: Icon(Icons.delete_outline_rounded, color: Colors.grey.shade400, size: 20),
                onPressed: () => _handleDelete(v),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
