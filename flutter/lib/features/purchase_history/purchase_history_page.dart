import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gemiprint/core/constants/roles.dart';
import 'package:gemiprint/core/theme/app_theme.dart';
import 'package:gemiprint/models/purchase.dart';
import 'package:gemiprint/providers/providers.dart';
import 'package:gemiprint/services/api_client.dart';
import 'package:gemiprint/widgets/confirm_dialog.dart';
import 'package:gemiprint/widgets/empty_state.dart';
import 'package:gemiprint/widgets/snackbar_helper.dart';
import 'package:intl/intl.dart';

class PurchaseHistoryPage extends ConsumerStatefulWidget {
  const PurchaseHistoryPage({super.key});
  @override
  ConsumerState<PurchaseHistoryPage> createState() => _PurchaseHistoryPageState();
}

class _PurchaseHistoryPageState extends ConsumerState<PurchaseHistoryPage> {
  List<Purchase> _purchases = [];
  bool _isLoading = true;
  String _search = '';
  String _activeFilter = 'Semua';
  final _currencyFmt = NumberFormat.currency(locale: 'id_ID', symbol: 'Rp ', decimalDigits: 0);

  @override
  void initState() { super.initState(); _loadData(); }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final data = await ref.read(purchasesServiceProvider).getAll();
      if (mounted) setState(() { _purchases = data.map((j) => Purchase.fromJson(j as Map<String, dynamic>)).toList(); _isLoading = false; });
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        if (e.isUnauthorized) { ref.read(authStateProvider.notifier).logout(); return; }
        showErrorSnackbar(context, e.message);
      }
    } catch (_) {
      if (mounted) { setState(() => _isLoading = false); showErrorSnackbar(context, 'Gagal memuat riwayat pembelian'); }
    }
  }

  List<Purchase> get _filtered {
    var result = _purchases;
    if (_activeFilter == 'Lunas') {
      result = result.where((p) => p.statusPembayaran == 'LUNAS').toList();
    } else if (_activeFilter == 'Hutang') {
      result = result.where((p) => p.statusPembayaran == 'HUTANG' || p.statusPembayaran == 'SEBAGIAN').toList();
    } else if (_activeFilter == 'Void') {
      result = result.where((p) => p.statusTransaksi == 'VOIDED').toList();
    }
    if (_search.isNotEmpty) {
      final q = _search.toLowerCase();
      result = result.where((p) {
        final nomor = p.nomorPembelian.toLowerCase();
        final vendor = (p.vendorNama ?? '').toLowerCase();
        return nomor.contains(q) || vendor.contains(q);
      }).toList();
    }
    return result;
  }

  bool get _canUseRiskyActions {
    final role = ref.read(authStateProvider).valueOrNull?.role;
    return role != null && RoleGroups.adminOnly.contains(role);
  }

  Future<void> _handleVoid(Purchase purchase) async {
    if (!_canUseRiskyActions) return;
    final ok = await showConfirmDialog(context, title: 'Batalkan Pembelian', message: 'Yakin ingin membatalkan pembelian "${purchase.nomorPembelian}"?\n\nTindakan ini akan menandai transaksi sebagai VOID.', isDangerous: true);
    if (!ok) return;
    try {
      await ref.read(purchasesServiceProvider).delete(purchase.id);
      if (mounted) { showSuccessSnackbar(context, 'Pembelian berhasil dibatalkan'); _loadData(); }
    } on ApiException catch (e) { if (mounted) showErrorSnackbar(context, e.message); }
    catch (_) { if (mounted) showErrorSnackbar(context, 'Gagal membatalkan pembelian'); }
  }

  Future<void> _handlePayDebt(Purchase purchase) async {
    final amountCtrl = TextEditingController();
    final sisa = purchase.totalHarga - purchase.dibayar;
    final ok = await showDialog<bool>(context: context, builder: (ctx) => AlertDialog(
      title: const Text('Bayar Hutang'),
      content: Column(mainAxisSize: MainAxisSize.min, children: [
        Text('Pembelian: ${purchase.nomorPembelian}\nVendor: ${purchase.vendorNama ?? "-"}\nSisa: ${_currencyFmt.format(sisa)}'),
        const SizedBox(height: 12),
        TextField(controller: amountCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Jumlah Bayar', hintText: 'Masukkan jumlah')),
      ]),
      actions: [
        TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Batal')),
        ElevatedButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Bayar')),
      ],
    ));
    if (ok != true || amountCtrl.text.isEmpty) return;
    final jumlah = double.tryParse(amountCtrl.text);
    if (jumlah == null || jumlah <= 0) { if (mounted) showErrorSnackbar(context, 'Jumlah tidak valid'); return; }
    if (jumlah > sisa) { if (mounted) showErrorSnackbar(context, 'Jumlah melebihi sisa hutang'); return; }
    try {
      await ref.read(purchasesServiceProvider).payDebt({ 'pembelian_id': purchase.id, 'jumlah': jumlah });
      if (mounted) { showSuccessSnackbar(context, 'Pembayaran berhasil'); _loadData(); }
    } on ApiException catch (e) { if (mounted) showErrorSnackbar(context, e.message); }
    catch (_) { if (mounted) showErrorSnackbar(context, 'Gagal membayar hutang'); }
  }

  void _showDetail(Purchase purchase) {
    showModalBottomSheet(context: context, isScrollControlled: true, useSafeArea: true, backgroundColor: Colors.transparent,
      builder: (_) => _DetailSheet(purchase: purchase, currencyFmt: _currencyFmt, onVoid: () => _handleVoid(purchase), canVoid: _canUseRiskyActions, onPayDebt: () => _handlePayDebt(purchase)));
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'LUNAS': return AppColors.success;
      case 'HUTANG': return AppColors.error;
      case 'SEBAGIAN': return AppColors.warning;
      default: return Colors.grey;
    }
  }

  String _statusLabel(String statusPembayaran, String statusTransaksi) {
    if (statusTransaksi == 'VOIDED') return 'Void';
    switch (statusPembayaran) {
      case 'LUNAS': return 'Lunas';
      case 'HUTANG': return 'Hutang';
      case 'SEBAGIAN': return 'Sebagian';
      default: return statusPembayaran;
    }
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filtered;
    return Column(children: [
      Padding(padding: const EdgeInsets.fromLTRB(16, 8, 16, 4), child: TextField(
        decoration: InputDecoration(hintText: 'Cari nomor atau vendor...', prefixIcon: const Icon(Icons.search, size: 20),
          suffixIcon: _search.isNotEmpty ? IconButton(icon: const Icon(Icons.clear, size: 18), onPressed: () => setState(() => _search = '')) : null,
          filled: true, fillColor: Theme.of(context).colorScheme.surfaceContainerHighest.withValues(alpha: 0.3),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(28), borderSide: BorderSide.none), contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10)),
        onChanged: (v) => setState(() => _search = v),
      )),
      Padding(padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4), child: SingleChildScrollView(scrollDirection: Axis.horizontal, child: Row(
        children: ['Semua', 'Lunas', 'Hutang', 'Void'].map((label) {
          final isSelected = _activeFilter == label;
          return Padding(padding: const EdgeInsets.only(right: 6), child: FilterChip(
            label: Text(label, style: TextStyle(fontSize: 12, fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal)),
            selected: isSelected, onSelected: (_) => setState(() => _activeFilter = label),
            selectedColor: AppColors.accent.withValues(alpha: 0.15), checkmarkColor: AppColors.accent, visualDensity: VisualDensity.compact,
          ));
        }).toList(),
      ))),
      Expanded(child: _buildBody(filtered)),
    ]);
  }

  Widget _buildBody(List<Purchase> filtered) {
    if (_isLoading) return const Center(child: CircularProgressIndicator());
    if (_purchases.isEmpty) return EmptyState(icon: Icons.receipt_long_rounded, title: 'Belum ada riwayat pembelian');
    if (filtered.isEmpty) return EmptyState(icon: Icons.search_off_rounded, title: 'Tidak ditemukan', subtitle: 'Coba kata kunci lain atau ubah filter');
    return RefreshIndicator(onRefresh: _loadData, child: ListView.builder(padding: const EdgeInsets.fromLTRB(16, 4, 16, 80), itemCount: filtered.length, itemBuilder: (_, i) => _buildCard(filtered[i])));
  }

  Widget _buildCard(Purchase p) {
    final isVoid = p.statusTransaksi == 'VOIDED';
    final status = _statusLabel(p.statusPembayaran, p.statusTransaksi);
    final statusColor = isVoid ? Colors.grey : _statusColor(p.statusPembayaran);
    return Card(
      margin: const EdgeInsets.only(bottom: 6),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => _showDetail(p),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            p.nomorPembelian,
                            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: statusColor.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            status,
                            style: TextStyle(
                              color: statusColor,
                              fontSize: 10,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${p.vendorNama ?? "-"} \u00b7 ${_currencyFmt.format(p.totalHarga)}',
                      style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                    ),
                    if (!isVoid && (p.statusPembayaran == 'HUTANG' || p.statusPembayaran == 'SEBAGIAN'))
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(
                          'Sisa: ${_currencyFmt.format(p.totalHarga - p.dibayar)}',
                          style: TextStyle(fontSize: 11, color: AppColors.error.withValues(alpha: 0.8), fontWeight: FontWeight.w500),
                        ),
                      ),
                  ],
                ),
              ),
              if (!isVoid && _canUseRiskyActions)
                IconButton(
                  icon: const Icon(Icons.cancel_outlined, size: 20),
                  color: AppColors.error.withValues(alpha: 0.6),
                  onPressed: () => _handleVoid(p),
                  visualDensity: VisualDensity.compact,
                ),
              Icon(Icons.chevron_right, color: Colors.grey.shade400, size: 20),
            ],
          ),
        ),
      ),
    );
  }
}

class _DetailSheet extends StatelessWidget {
  final Purchase purchase;
  final NumberFormat currencyFmt;
  final VoidCallback onVoid;
  final bool canVoid;
  final VoidCallback onPayDebt;
  const _DetailSheet({required this.purchase, required this.currencyFmt, required this.onVoid, required this.canVoid, required this.onPayDebt});

  @override
  Widget build(BuildContext context) {
    final isVoid = purchase.statusTransaksi == 'VOIDED';
    final isDebt = purchase.statusPembayaran == 'HUTANG' || purchase.statusPembayaran == 'SEBAGIAN';
    final sisa = purchase.totalHarga - purchase.dibayar;

    return DraggableScrollableSheet(initialChildSize: 0.85, minChildSize: 0.5, maxChildSize: 0.95, expand: false, builder: (_, scrollCtrl) => Container(
      decoration: const BoxDecoration(color: Colors.white, borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      child: Column(children: [
        Container(padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14), decoration: BoxDecoration(border: Border(bottom: BorderSide(color: Colors.grey.shade200))), child: Row(children: [
          Expanded(child: Text(purchase.nomorPembelian, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600))),
          IconButton(onPressed: () => Navigator.of(context).pop(), icon: const Icon(Icons.close)),
        ])),
        Expanded(child: ListView(controller: scrollCtrl, padding: const EdgeInsets.all(20), children: [
          _infoRow('Vendor', purchase.vendorNama ?? '-'),
          _infoRow('Status', isVoid ? 'VOID' : (isDebt ? 'Hutang' : 'Lunas')),
          const SizedBox(height: 12),
          const Text('Item', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
          const SizedBox(height: 8),
          ...purchase.items.map((item) => Padding(padding: const EdgeInsets.only(bottom: 6), child: Row(children: [
            Expanded(child: Text(item.barangNama ?? '-', style: const TextStyle(fontSize: 13))),
            Text('${item.quantity} \u00d7 ${currencyFmt.format(item.hargaSatuan)}', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
          ]))),
          const Divider(),
          _totalRow('Total', currencyFmt.format(purchase.totalHarga)),
          _totalRow('Dibayar', currencyFmt.format(purchase.dibayar)),
          if (isDebt) _totalRow('Sisa', currencyFmt.format(sisa)),
          const SizedBox(height: 16),
          if (isDebt) ...[
            SizedBox(width: double.infinity, child: ElevatedButton.icon(onPressed: () { Navigator.of(context).pop(); onPayDebt(); }, icon: const Icon(Icons.payment, size: 16), label: const Text('Bayar Hutang'), style: ElevatedButton.styleFrom(backgroundColor: AppColors.warning))),
            const SizedBox(height: 8),
          ],
          if (!isVoid && canVoid) ...[
            SizedBox(width: double.infinity, child: OutlinedButton.icon(onPressed: () { Navigator.of(context).pop(); onVoid(); }, icon: const Icon(Icons.cancel_outlined, size: 16), label: const Text('Batalkan'), style: OutlinedButton.styleFrom(foregroundColor: AppColors.error))),
          ],
        ])),
      ]),
    ));
  }

  Widget _infoRow(String label, String value) => Padding(padding: const EdgeInsets.only(bottom: 4), child: Row(children: [
    SizedBox(width: 80, child: Text(label, style: TextStyle(fontSize: 12, color: Colors.grey.shade600))),
    Expanded(child: Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500))),
  ]));
  Widget _totalRow(String label, String value) => Padding(padding: const EdgeInsets.only(bottom: 2), child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
    Text(label, style: const TextStyle(fontSize: 13)), Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
  ]));
}
