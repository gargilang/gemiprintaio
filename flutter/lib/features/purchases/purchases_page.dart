import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gemiprint/core/theme/app_theme.dart';
import 'package:gemiprint/models/purchase.dart';
import 'package:gemiprint/providers/providers.dart';
import 'package:gemiprint/services/api_client.dart';
import 'package:gemiprint/widgets/confirm_dialog.dart';
import 'package:gemiprint/widgets/empty_state.dart';
import 'package:gemiprint/widgets/search_field.dart';
import 'package:gemiprint/widgets/snackbar_helper.dart';
import 'package:intl/intl.dart';

class PurchasesPage extends ConsumerStatefulWidget {
  const PurchasesPage({super.key});

  @override
  ConsumerState<PurchasesPage> createState() => _PurchasesPageState();
}

class _PurchasesPageState extends ConsumerState<PurchasesPage> with SingleTickerProviderStateMixin {
  late TabController _tabCtrl;
  List<Purchase> _purchases = [];
  List<dynamic> _debts = [];
  bool _isLoading = true;
  String _search = '';

  final _fmt = NumberFormat.currency(locale: 'id_ID', symbol: 'Rp ', decimalDigits: 0);

  @override
  void initState() {
    super.initState();
    _tabCtrl = TabController(length: 2, vsync: this);
    _loadData();
  }

  @override
  void dispose() {
    _tabCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final svc = ref.read(purchasesServiceProvider);
      final results = await Future.wait([svc.getAll(), svc.getDebts()]);
      if (mounted) {
        setState(() {
          _purchases = results[0].map((j) => Purchase.fromJson(j as Map<String, dynamic>)).toList();
          _debts = results[1];
          _isLoading = false;
        });
      }
    } catch (_) {
      if (mounted) { setState(() => _isLoading = false); showErrorSnackbar(context, 'Gagal memuat data pembelian'); }
    }
  }

  List<Purchase> get _filtered {
    if (_search.isEmpty) return _purchases;
    final q = _search.toLowerCase();
    return _purchases.where((p) =>
      p.nomorPembelian.toLowerCase().contains(q) ||
      (p.vendorNama?.toLowerCase().contains(q) ?? false)
    ).toList();
  }

  Future<void> _handleDelete(Purchase p) async {
    final ok = await showConfirmDialog(context, title: 'Hapus Pembelian', message: 'Hapus "${p.nomorPembelian}"?', isDangerous: true);
    if (!ok) return;
    try {
      await ref.read(purchasesServiceProvider).delete(p.id);
      if (mounted) { showSuccessSnackbar(context, 'Pembelian berhasil dihapus'); _loadData(); }
    } on ApiException catch (e) {
      if (mounted) showErrorSnackbar(context, e.message);
    }
  }

  Color _paymentStatusColor(String status) {
    return switch (status) {
      'LUNAS' => AppColors.success,
      'HUTANG' => AppColors.error,
      'SEBAGIAN' => AppColors.warning,
      _ => Colors.grey,
    };
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) return const Center(child: CircularProgressIndicator());

    return Column(
      children: [
        TabBar(controller: _tabCtrl, labelColor: AppColors.primary, tabs: const [
          Tab(text: 'Pembelian'),
          Tab(text: 'Hutang'),
        ]),
        Expanded(child: TabBarView(controller: _tabCtrl, children: [_buildPurchasesList(), _buildDebtsList()])),
      ],
    );
  }

  Widget _buildPurchasesList() {
    final filtered = _filtered;
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
          child: Row(
            children: [
              Expanded(child: SearchField(hintText: 'Cari pembelian...', onChanged: (v) => setState(() => _search = v))),
              const SizedBox(width: 8),
              Text('${filtered.length} data', style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
            ],
          ),
        ),
        Expanded(
          child: filtered.isEmpty
              ? const EmptyState(icon: Icons.shopping_bag_rounded, title: 'Belum ada pembelian')
              : RefreshIndicator(
                  onRefresh: _loadData,
                  child: ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
                    itemCount: filtered.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 6),
                    itemBuilder: (_, i) {
                      final p = filtered[i];
                      final color = _paymentStatusColor(p.statusPembayaran);
                      return Card(
                        child: ListTile(
                          title: Row(
                            children: [
                              Expanded(child: Text(p.nomorPembelian, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14))),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(color: color.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(4)),
                                child: Text(p.statusPembayaran, style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w600)),
                              ),
                            ],
                          ),
                          subtitle: Text('${p.vendorNama ?? '-'} · ${_fmt.format(p.totalHarga)}', style: const TextStyle(fontSize: 12)),
                          trailing: IconButton(icon: Icon(Icons.delete_outline_rounded, color: Colors.grey.shade400, size: 20), onPressed: () => _handleDelete(p)),
                        ),
                      );
                    },
                  ),
                ),
        ),
      ],
    );
  }

  Widget _buildDebtsList() {
    if (_debts.isEmpty) return const EmptyState(icon: Icons.check_circle_outline_rounded, title: 'Tidak ada hutang');
    return RefreshIndicator(
      onRefresh: _loadData,
      child: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: _debts.length,
        separatorBuilder: (_, _) => const SizedBox(height: 6),
        itemBuilder: (_, i) {
          final d = _debts[i] as Map<String, dynamic>;
          return Card(
            child: ListTile(
              title: Text(d['nomor_pembelian']?.toString() ?? '-', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
              subtitle: Text('${d['vendor_nama'] ?? '-'} · Sisa: ${_fmt.format(d['sisa_hutang'] ?? 0)}', style: const TextStyle(fontSize: 12)),
              trailing: TextButton(onPressed: () => _showPayDebtDialog(d), child: const Text('Bayar')),
            ),
          );
        },
      ),
    );
  }

  Future<void> _showPayDebtDialog(Map<String, dynamic> debt) async {
    final amountCtrl = TextEditingController();
    final result = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Bayar Hutang'),
        content: TextField(controller: amountCtrl, decoration: const InputDecoration(labelText: 'Jumlah'), keyboardType: TextInputType.number),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Batal')),
          ElevatedButton(
            onPressed: () async {
              final amount = double.tryParse(amountCtrl.text);
              if (amount == null || amount <= 0) return;
              try {
                await ref.read(purchasesServiceProvider).payDebt({
                  'pembelian_id': debt['pembelian_id'] ?? debt['id'],
                  'jumlah': amount,
                });
                if (ctx.mounted) Navigator.pop(ctx, true);
              } on ApiException catch (e) {
                if (ctx.mounted) showErrorSnackbar(ctx, e.message);
              }
            },
            child: const Text('Bayar'),
          ),
        ],
      ),
    );
    if (result == true && mounted) {
      showSuccessSnackbar(context, 'Pembayaran hutang berhasil');
      _loadData();
    }
  }
}
