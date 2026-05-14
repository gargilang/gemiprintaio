import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gemiprint/core/theme/app_theme.dart';
import 'package:gemiprint/models/production.dart';
import 'package:gemiprint/providers/providers.dart';
import 'package:gemiprint/widgets/empty_state.dart';
import 'package:gemiprint/widgets/search_field.dart';
import 'package:gemiprint/widgets/snackbar_helper.dart';
import 'package:gemiprint/services/api_client.dart';

class ProductionPage extends ConsumerStatefulWidget {
  const ProductionPage({super.key});

  @override
  ConsumerState<ProductionPage> createState() => _ProductionPageState();
}

class _ProductionPageState extends ConsumerState<ProductionPage> {
  List<ProductionOrder> _orders = [];
  bool _isLoading = true;
  String _search = '';
  String _statusFilter = 'SEMUA';

  static const _statuses = ['SEMUA', 'MENUNGGU', 'PROSES', 'SELESAI', 'DIBATALKAN'];

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final data = await ref.read(productionServiceProvider).getOrders();
      if (mounted) {
        setState(() {
          _orders = data.map((j) => ProductionOrder.fromJson(j as Map<String, dynamic>)).toList();
          _isLoading = false;
        });
      }
    } catch (_) {
      if (mounted) { setState(() => _isLoading = false); showErrorSnackbar(context, 'Gagal memuat data produksi'); }
    }
  }

  List<ProductionOrder> get _filtered {
    var list = _orders;
    if (_statusFilter != 'SEMUA') {
      list = list.where((o) => o.status == _statusFilter).toList();
    }
    if (_search.isNotEmpty) {
      final q = _search.toLowerCase();
      list = list.where((o) =>
        (o.nomorSpk?.toLowerCase().contains(q) ?? false) ||
        (o.nomorInvoice?.toLowerCase().contains(q) ?? false) ||
        (o.pelangganNama?.toLowerCase().contains(q) ?? false)
      ).toList();
    }
    return list;
  }

  Future<void> _updateStatus(ProductionOrder order, String newStatus) async {
    try {
      await ref.read(productionServiceProvider).updateOrderStatus(order.id, newStatus);
      if (mounted) { showSuccessSnackbar(context, 'Status diperbarui ke $newStatus'); _loadData(); }
    } on ApiException catch (e) {
      if (mounted) showErrorSnackbar(context, e.message);
    }
  }

  Color _statusColor(String status) {
    return switch (status) {
      'MENUNGGU' => AppColors.warning,
      'PROSES' => AppColors.primary,
      'SELESAI' => AppColors.success,
      'DIBATALKAN' => AppColors.error,
      _ => Colors.grey,
    };
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filtered;
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          child: SearchField(hintText: 'Cari SPK/invoice...', onChanged: (v) => setState(() => _search = v)),
        ),
        SizedBox(
          height: 40,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            children: _statuses.map((s) => Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: FilterChip(
                label: Text(s, style: const TextStyle(fontSize: 12)),
                selected: _statusFilter == s,
                onSelected: (_) => setState(() => _statusFilter = s),
                selectedColor: AppColors.primary.withValues(alpha: 0.2),
              ),
            )).toList(),
          ),
        ),
        const SizedBox(height: 4),
        Expanded(
          child: _isLoading
              ? const Center(child: CircularProgressIndicator())
              : filtered.isEmpty
                  ? const EmptyState(icon: Icons.print_rounded, title: 'Tidak ada order produksi')
                  : RefreshIndicator(
                      onRefresh: _loadData,
                      child: ListView.separated(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                        itemCount: filtered.length,
                        separatorBuilder: (_, _) => const SizedBox(height: 8),
                        itemBuilder: (_, i) => _buildCard(filtered[i]),
                      ),
                    ),
        ),
      ],
    );
  }

  Widget _buildCard(ProductionOrder o) {
    final color = _statusColor(o.status);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(o.nomorSpk ?? 'SPK-?', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                      if (o.nomorInvoice != null)
                        Text('Invoice: ${o.nomorInvoice}', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                      if (o.pelangganNama != null)
                        Text(o.pelangganNama!, style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(color: color.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(6)),
                  child: Text(o.status, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600)),
                ),
              ],
            ),
            if (o.prioritas == 'KILAT') ...[
              const SizedBox(height: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(color: AppColors.error.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(4)),
                child: const Text('KILAT', style: TextStyle(color: AppColors.error, fontSize: 10, fontWeight: FontWeight.w600)),
              ),
            ],
            if (o.items.isNotEmpty) ...[
              const Divider(height: 16),
              ...o.items.map((item) => Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Row(
                  children: [
                    Expanded(child: Text(item.barangNama ?? '-', style: const TextStyle(fontSize: 13))),
                    Text('x${item.quantity.toStringAsFixed(0)}', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                  ],
                ),
              )),
            ],
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                if (o.status == 'MENUNGGU')
                  TextButton(onPressed: () => _updateStatus(o, 'PROSES'), child: const Text('Mulai Proses')),
                if (o.status == 'PROSES')
                  TextButton(onPressed: () => _updateStatus(o, 'SELESAI'), child: const Text('Selesai')),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
