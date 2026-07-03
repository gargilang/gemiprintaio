import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gemiprint/core/penjualan_cetak_utils.dart';
import 'package:gemiprint/core/theme/app_theme.dart';
import 'package:gemiprint/models/production.dart';
import 'package:gemiprint/providers/providers.dart';
import 'package:gemiprint/services/api_client.dart';
import 'package:gemiprint/widgets/empty_state.dart';
import 'package:gemiprint/widgets/snackbar_helper.dart';
import 'package:intl/intl.dart';

class ProductionPage extends ConsumerStatefulWidget {
  const ProductionPage({super.key});
  @override
  ConsumerState<ProductionPage> createState() => _ProductionPageState();
}

class _ProductionPageState extends ConsumerState<ProductionPage> {
  List<ProductionOrder> _orders = [];
  bool _isLoading = true;
  String _search = '';
  String _activeFilter = 'Semua';
  static const _statuses = ['Semua', 'Menunggu', 'Proses', 'Selesai', 'Dibatalkan'];
  final _dateFmt = DateFormat('dd/MM/yy', 'id_ID');

  @override
  void initState() { super.initState(); _loadData(); }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final raw = await ref.read(productionServiceProvider).getOrders(forceRefresh: true);
      if (mounted) setState(() { _orders = raw.map((j) => ProductionOrder.fromJson(j as Map<String, dynamic>)).toList(); _isLoading = false; });
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        if (e.isUnauthorized) { ref.read(authStateProvider.notifier).logout(); return; }
        showErrorSnackbar(context, e.message);
      }
    } catch (_) {
      if (mounted) { setState(() => _isLoading = false); showErrorSnackbar(context, 'Gagal memuat data SPK'); }
    }
  }

  List<ProductionOrder> get _filtered {
    var result = _orders;
    if (_activeFilter == 'Menunggu') {
      result = result.where((o) => o.status == 'MENUNGGU').toList();
    } else if (_activeFilter == 'Proses') {
      result = result.where((o) => o.status == 'PROSES' || o.status == 'DALAM_PROSES').toList();
    } else if (_activeFilter == 'Selesai') {
      result = result.where((o) => o.status == 'SELESAI').toList();
    } else if (_activeFilter == 'Dibatalkan') {
      result = result.where((o) => o.status == 'DIBATALKAN').toList();
    }
    if (_search.isNotEmpty) {
      final q = _search.toLowerCase();
      result = result.where((o) => (o.nomorSpk ?? '').toLowerCase().contains(q) || (o.pelangganNama ?? '').toLowerCase().contains(q)).toList();
    }
    return result;
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'MENUNGGU': return const Color(0xFFF59E0B);
      case 'PROSES': case 'DALAM_PROSES': return AppColors.accent;
      case 'SELESAI': return AppColors.success;
      default: return Colors.grey;
    }
  }

  String _statusLabel(String s) {
    switch (s) {
      case 'MENUNGGU': return 'Menunggu';
      case 'PROSES': case 'DALAM_PROSES': return 'Proses';
      case 'SELESAI': return 'Selesai';
      case 'DIBATALKAN': return 'Dibatalkan';
      default: return s;
    }
  }

  Future<void> _updateStatus(ProductionOrder order, String newStatus) async {
    try {
      await ref.read(productionServiceProvider).updateOrderStatus(order.id, newStatus);
      if (mounted) { showSuccessSnackbar(context, 'Status SPK diperbarui'); _loadData(); }
    } on ApiException catch (e) { if (mounted) showErrorSnackbar(context, e.message); }
    catch (_) { if (mounted) showErrorSnackbar(context, 'Gagal memperbarui status'); }
  }

  void _showDetail(ProductionOrder order) {
    showModalBottomSheet(context: context, isScrollControlled: true, useSafeArea: true, backgroundColor: Colors.transparent,
      builder: (_) => DraggableScrollableSheet(initialChildSize: 0.85, minChildSize: 0.5, maxChildSize: 0.95, expand: false, builder: (_, scrollCtrl) => Container(
        decoration: const BoxDecoration(color: Colors.white, borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
        child: Column(children: [
          Container(padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14), decoration: BoxDecoration(border: Border(bottom: BorderSide(color: Colors.grey.shade200))), child: Row(children: [
            Expanded(child: Text(order.nomorSpk ?? 'SPK', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600))),
            IconButton(onPressed: () => Navigator.of(context).pop(), icon: const Icon(Icons.close)),
          ])),
          Expanded(child: ListView(controller: scrollCtrl, padding: const EdgeInsets.all(20), children: [
            _infoRow('Pelanggan', order.pelangganNama ?? '-'),
            if (order.nomorInvoice != null) _infoRow('Invoice', order.nomorInvoice!),
            _infoRow('Prioritas', order.prioritas),
            _infoRow('Status', _statusLabel(order.status)),
            const SizedBox(height: 12),
            const Text('Item Produksi', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
            const SizedBox(height: 8),
            ...order.items.map((item) {
              final cetak = ItemCetakPenjualan(
                jumlah: item.quantity,
                namaSatuan: item.namaSatuan,
                panjang: item.panjang,
                lebar: item.lebar,
                billedPanjang: item.billedPanjang,
                billedLebar: item.billedLebar,
                jumlahRoll: item.jumlahRoll,
              );
              final qtyLabel = formatQtyLabel(cetak);
              final ukuran = formatUkuranCetakInput(
                panjang: item.panjang,
                lebar: item.lebar,
                billedPanjang: item.billedPanjang,
                billedLebar: item.billedLebar,
              );
              final ukuranText = ukuran != null ? ' - Ukuran: $ukuran' : '';
              return Padding(padding: const EdgeInsets.only(bottom: 6), child: Row(children: [
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(item.barangNama ?? '-', style: const TextStyle(fontSize: 13)),
                  Text('Qty: $qtyLabel$ukuranText - ${_statusLabel(item.status)}', style: TextStyle(fontSize: 11, color: Colors.grey.shade600)),
                ])),
                Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2), decoration: BoxDecoration(color: _statusColor(item.status).withValues(alpha: 0.1), borderRadius: BorderRadius.circular(8)), child: Text(_statusLabel(item.status), style: TextStyle(color: _statusColor(item.status), fontSize: 10, fontWeight: FontWeight.w600))),
              ]));
            }),
            const SizedBox(height: 16),
            if (order.status == 'MENUNGGU') SizedBox(width: double.infinity, child: FilledButton.icon(onPressed: () { Navigator.of(context).pop(); _updateStatus(order, 'PROSES'); }, icon: const Icon(Icons.play_arrow, size: 18), label: const Text('Lanjutkan ke Proses'))),
            if (order.status == 'PROSES' || order.status == 'DALAM_PROSES') SizedBox(width: double.infinity, child: FilledButton.icon(onPressed: () { Navigator.of(context).pop(); _updateStatus(order, 'SELESAI'); }, icon: const Icon(Icons.check, size: 18), label: const Text('Tandai Selesai'), style: FilledButton.styleFrom(backgroundColor: AppColors.success))),
          ])),
        ]),
      )));
  }

  Widget _infoRow(String label, String value) => Padding(padding: const EdgeInsets.only(bottom: 4), child: Row(children: [
    SizedBox(width: 80, child: Text(label, style: TextStyle(fontSize: 12, color: Colors.grey.shade600))),
    Expanded(child: Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500))),
  ]));

  @override
  Widget build(BuildContext context) {
    final filtered = _filtered;
    return Column(children: [
      Padding(padding: const EdgeInsets.fromLTRB(16, 8, 16, 4), child: TextField(
        decoration: InputDecoration(hintText: 'Cari SPK atau pelanggan...', prefixIcon: const Icon(Icons.search, size: 20),
          suffixIcon: _search.isNotEmpty ? IconButton(icon: const Icon(Icons.clear, size: 18), onPressed: () => setState(() => _search = '')) : null,
          filled: true, fillColor: Theme.of(context).colorScheme.surfaceContainerHighest.withValues(alpha: 0.3),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(28), borderSide: BorderSide.none), contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10)),
        onChanged: (v) => setState(() => _search = v),
      )),
      Padding(padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4), child: SingleChildScrollView(scrollDirection: Axis.horizontal, child: Row(
        children: _statuses.map((label) {
          final isSelected = _activeFilter == label;
          return Padding(padding: const EdgeInsets.only(right: 6), child: FilterChip(
            label: Text(label, style: TextStyle(fontSize: 12, fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal)),
            selected: isSelected, onSelected: (_) => setState(() => _activeFilter = label),
            selectedColor: const Color(0xFFE65100).withValues(alpha: 0.15), checkmarkColor: const Color(0xFFE65100), visualDensity: VisualDensity.compact,
          ));
        }).toList(),
      ))),
      Expanded(child: _buildBody(filtered)),
    ]);
  }

  Widget _buildBody(List<ProductionOrder> filtered) {
    if (_isLoading) return const Center(child: CircularProgressIndicator());
    if (_orders.isEmpty) return EmptyState(icon: Icons.print_rounded, title: 'Belum ada SPK');
    if (filtered.isEmpty) return EmptyState(icon: Icons.search_off_rounded, title: 'Tidak ditemukan', subtitle: 'Coba kata kunci lain atau ubah filter');
    return RefreshIndicator(onRefresh: _loadData, child: ListView.builder(padding: const EdgeInsets.fromLTRB(16, 4, 16, 16), itemCount: filtered.length, itemBuilder: (_, i) => _buildCard(filtered[i])));
  }

  Widget _buildCard(ProductionOrder o) {
    final color = _statusColor(o.status);
    return Card(margin: const EdgeInsets.only(bottom: 6), child: InkWell(borderRadius: BorderRadius.circular(12), onTap: () => _showDetail(o), child: Padding(padding: const EdgeInsets.all(12), child: Row(children: [
      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Flexible(child: Text(o.nomorSpk ?? '-', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14), overflow: TextOverflow.ellipsis)),
          const SizedBox(width: 6),
          Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2), decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(8)), child: Text(_statusLabel(o.status), style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w600))),
        ]),
        const SizedBox(height: 2),
        Text('${o.pelangganNama ?? '-'} · ${o.items.length} item', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
        if (o.createdAt != null) Text(_dateFmt.format(DateTime.parse(o.createdAt!)), style: TextStyle(fontSize: 10, color: Colors.grey.shade500)),
      ])),
      Icon(Icons.chevron_right, color: Colors.grey.shade400, size: 20),
    ]))));
  }
}
