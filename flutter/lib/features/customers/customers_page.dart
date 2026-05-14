import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gemiprint/core/theme/app_theme.dart';
import 'package:gemiprint/models/customer.dart';
import 'package:gemiprint/providers/providers.dart';
import 'package:gemiprint/services/api_client.dart';
import 'package:gemiprint/widgets/confirm_dialog.dart';
import 'package:gemiprint/widgets/empty_state.dart';
import 'package:gemiprint/widgets/search_field.dart';
import 'package:gemiprint/widgets/snackbar_helper.dart';
import 'package:gemiprint/features/customers/customer_form_dialog.dart';

class CustomersPage extends ConsumerStatefulWidget {
  const CustomersPage({super.key});

  @override
  ConsumerState<CustomersPage> createState() => _CustomersPageState();
}

class _CustomersPageState extends ConsumerState<CustomersPage> {
  List<Customer> _customers = [];
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
      final data = await ref.read(customersServiceProvider).getAll();
      if (mounted) setState(() { _customers = data; _isLoading = false; });
    } on ApiException catch (e) {
      if (mounted) { setState(() => _isLoading = false); showErrorSnackbar(context, e.message); }
    } catch (_) {
      if (mounted) { setState(() => _isLoading = false); showErrorSnackbar(context, 'Gagal memuat data pelanggan'); }
    }
  }

  List<Customer> get _filtered {
    if (_search.isEmpty) return _customers;
    final q = _search.toLowerCase();
    return _customers.where((c) =>
      c.nama.toLowerCase().contains(q) ||
      (c.namaPerusahaan?.toLowerCase().contains(q) ?? false) ||
      (c.telepon?.toLowerCase().contains(q) ?? false) ||
      (c.email?.toLowerCase().contains(q) ?? false)
    ).toList();
  }

  Future<void> _showForm({Customer? existing}) async {
    final result = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => CustomerFormDialog(existing: existing),
    );
    if (result == true) _loadData();
  }

  Future<void> _handleDelete(Customer c) async {
    final ok = await showConfirmDialog(context,
      title: 'Hapus Pelanggan',
      message: 'Yakin ingin menghapus "${c.nama}"?',
      isDangerous: true,
    );
    if (!ok) return;

    try {
      await ref.read(customersServiceProvider).delete(c.id);
      if (mounted) { showSuccessSnackbar(context, 'Pelanggan berhasil dihapus'); _loadData(); }
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
              Expanded(child: SearchField(hintText: 'Cari pelanggan...', onChanged: (v) => setState(() => _search = v))),
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
                      icon: Icons.groups_rounded,
                      title: _search.isEmpty ? 'Belum ada pelanggan' : 'Tidak ditemukan',
                      action: _search.isEmpty ? ElevatedButton.icon(
                        onPressed: () => _showForm(),
                        icon: const Icon(Icons.add, size: 18),
                        label: const Text('Tambah Pelanggan'),
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

  Widget _buildCard(Customer c) {
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => _showForm(existing: c),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              CircleAvatar(
                backgroundColor: AppColors.primary.withValues(alpha: 0.15),
                child: Text(c.nama[0].toUpperCase(), style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.bold)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(child: Text(c.nama, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15), overflow: TextOverflow.ellipsis)),
                        if (c.isMember) ...[
                          const SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                            decoration: BoxDecoration(color: AppColors.success.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(4)),
                            child: const Text('Member', style: TextStyle(color: AppColors.success, fontSize: 10, fontWeight: FontWeight.w600)),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      [if (c.namaPerusahaan != null && c.namaPerusahaan!.isNotEmpty) c.namaPerusahaan!, if (c.telepon != null && c.telepon!.isNotEmpty) c.telepon!]
                          .join(' · '),
                      style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              IconButton(
                icon: Icon(Icons.delete_outline_rounded, color: Colors.grey.shade400, size: 20),
                onPressed: () => _handleDelete(c),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
