import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gemiprint/core/constants/roles.dart';
import 'package:gemiprint/core/theme/app_theme.dart';
import 'package:gemiprint/models/production.dart';
import 'package:gemiprint/providers/providers.dart';
import 'package:gemiprint/widgets/confirm_dialog.dart';
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

  static const _statuses = [
    'SEMUA',
    'MENUNGGU',
    'PROSES',
    'SELESAI',
    'DIBATALKAN',
  ];

  static const _itemStatuses = ['MENUNGGU', 'PRINTING', 'FINISHING', 'SELESAI'];

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData({bool forceRefresh = false}) async {
    if (_orders.isEmpty) {
      setState(() => _isLoading = true);
    }
    try {
      final data = await ref
          .read(productionServiceProvider)
          .getOrders(forceRefresh: forceRefresh);
      if (mounted) {
        setState(() {
          _orders = data
              .map((j) => ProductionOrder.fromJson(j as Map<String, dynamic>))
              .toList();
          _isLoading = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() => _isLoading = false);
        showErrorSnackbar(context, 'Gagal memuat data produksi');
      }
    }
  }

  List<ProductionOrder> get _filtered {
    var list = _orders;
    if (_statusFilter != 'SEMUA') {
      list = list.where((o) => o.status == _statusFilter).toList();
    }
    if (_search.isNotEmpty) {
      final q = _search.toLowerCase();
      list = list
          .where(
            (o) =>
                (o.nomorSpk?.toLowerCase().contains(q) ?? false) ||
                (o.nomorInvoice?.toLowerCase().contains(q) ?? false) ||
                (o.pelangganNama?.toLowerCase().contains(q) ?? false),
          )
          .toList();
    }
    return list;
  }

  bool get _canUpdateStatus {
    final role = ref.read(authStateProvider).valueOrNull?.role;
    return role != null && RoleGroups.operational.contains(role);
  }

  Future<void> _updateStatus(ProductionOrder order, String newStatus) async {
    if (!_canUpdateStatus) return;
    final ok = await showConfirmDialog(
      context,
      title: 'Ubah Status',
      message: 'Ubah status ${order.nomorSpk ?? order.id} ke $newStatus?',
    );
    if (!ok) return;
    try {
      await ref
          .read(productionServiceProvider)
          .updateOrderStatus(order.id, newStatus);
      if (mounted) {
        showSuccessSnackbar(context, 'Status diperbarui ke $newStatus');
        _loadData();
      }
    } on ApiException catch (e) {
      if (mounted) showErrorSnackbar(context, e.message);
    }
  }

  Future<void> _updateItemStatus(ProductionItem item, String newStatus) async {
    if (!_canUpdateStatus || item.status == newStatus) return;
    final ok = await showConfirmDialog(
      context,
      title: 'Ubah Status Item',
      message: 'Ubah status ${item.barangNama ?? item.id} ke $newStatus?',
    );
    if (!ok) return;
    try {
      final user = ref.read(authStateProvider).valueOrNull;
      await ref
          .read(productionServiceProvider)
          .updateItemStatus(item.id, newStatus, operatorId: user?.id);
      if (mounted) {
        showSuccessSnackbar(context, 'Status item diperbarui ke $newStatus');
        _loadData(forceRefresh: true);
      }
    } on ApiException catch (e) {
      if (mounted) showErrorSnackbar(context, e.message);
    }
  }

  void _showOrderDetail(ProductionOrder order) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => _OrderDetailSheet(
        order: order,
        canUpdateStatus: _canUpdateStatus,
        itemStatuses: _itemStatuses,
        onStatusChanged: (newStatus) {
          Navigator.pop(ctx);
          _updateStatus(order, newStatus);
        },
        onItemStatusChanged: (item, newStatus) {
          Navigator.pop(ctx);
          _updateItemStatus(item, newStatus);
        },
      ),
    );
  }

  Color _statusColor(String status) {
    return switch (status) {
      'MENUNGGU' => AppColors.warning,
      'PROSES' => AppColors.primary,
      'SELESAI' => AppColors.success,
      'DIBATALKAN' => AppColors.error,
      'PRINTING' => AppColors.primary,
      'FINISHING' => Colors.deepPurple,
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
          child: SearchField(
            hintText: 'Cari SPK/invoice...',
            onChanged: (v) => setState(() => _search = v),
          ),
        ),
        SizedBox(
          height: 40,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            children: _statuses
                .map(
                  (s) => Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 3),
                    child: FilterChip(
                      label: Text(s, style: const TextStyle(fontSize: 12)),
                      selected: _statusFilter == s,
                      onSelected: (_) => setState(() => _statusFilter = s),
                      selectedColor: AppColors.primary.withValues(alpha: 0.2),
                    ),
                  ),
                )
                .toList(),
          ),
        ),
        const SizedBox(height: 4),
        Expanded(
          child: _isLoading
              ? const Center(child: CircularProgressIndicator())
              : filtered.isEmpty
              ? const EmptyState(
                  icon: Icons.print_rounded,
                  title: 'Tidak ada order produksi',
                )
              : RefreshIndicator(
                  onRefresh: () => _loadData(forceRefresh: true),
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
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => _showOrderDetail(o),
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
                        Row(
                          children: [
                            Text(
                              o.nomorSpk ?? 'SPK-?',
                              style: const TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 15,
                              ),
                            ),
                            if (o.prioritas == 'KILAT') ...[
                              const SizedBox(width: 6),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 6,
                                  vertical: 2,
                                ),
                                decoration: BoxDecoration(
                                  color: AppColors.error.withValues(alpha: 0.1),
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: const Text(
                                  'KILAT',
                                  style: TextStyle(
                                    color: AppColors.error,
                                    fontSize: 10,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ),
                            ],
                          ],
                        ),
                        if (o.nomorInvoice != null)
                          Text(
                            'Invoice: ${o.nomorInvoice}',
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.grey.shade600,
                            ),
                          ),
                        if (o.pelangganNama != null)
                          Text(
                            o.pelangganNama!,
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.grey.shade600,
                            ),
                          ),
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: color.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      o.status,
                      style: TextStyle(
                        color: color,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
              if (o.items.isNotEmpty) ...[
                const Divider(height: 14),
                ...o.items
                    .take(3)
                    .map(
                      (item) => Padding(
                        padding: const EdgeInsets.only(bottom: 3),
                        child: Row(
                          children: [
                            Expanded(
                              child: Text(
                                item.barangNama ?? '-',
                                style: const TextStyle(fontSize: 13),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            const SizedBox(width: 8),
                            _statusDot(item.status, 'I'),
                            if (item.finishing.isNotEmpty) ...[
                              const SizedBox(width: 4),
                              _statusDot(item.statusFinishing, 'F'),
                            ],
                          ],
                        ),
                      ),
                    ),
                if (o.items.length > 3)
                  Text(
                    '+${o.items.length - 3} item lainnya',
                    style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
                  ),
              ],
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  if (o.status == 'MENUNGGU')
                    TextButton(
                      onPressed: _canUpdateStatus
                          ? () => _updateStatus(o, 'PROSES')
                          : null,
                      child: const Text(
                        'Mulai Proses',
                        style: TextStyle(fontSize: 12),
                      ),
                    ),
                  if (o.status == 'PROSES')
                    TextButton(
                      onPressed: _canUpdateStatus
                          ? () => _updateStatus(o, 'SELESAI')
                          : null,
                      child: const Text(
                        'Tandai Selesai',
                        style: TextStyle(fontSize: 12),
                      ),
                    ),
                  const Icon(Icons.chevron_right, color: Colors.grey, size: 18),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _statusDot(String status, String label) {
    final isDone = status == 'SELESAI' || status == 'DONE';
    return Tooltip(
      message: '$label: $status',
      child: Container(
        width: 18,
        height: 18,
        decoration: BoxDecoration(
          color: isDone
              ? AppColors.success.withValues(alpha: 0.2)
              : Colors.grey.shade200,
          borderRadius: BorderRadius.circular(4),
        ),
        child: Center(
          child: Text(
            label,
            style: TextStyle(
              fontSize: 9,
              fontWeight: FontWeight.bold,
              color: isDone ? AppColors.success : Colors.grey.shade400,
            ),
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Order Detail Sheet
// ---------------------------------------------------------------------------

class _OrderDetailSheet extends StatelessWidget {
  final ProductionOrder order;
  final bool canUpdateStatus;
  final List<String> itemStatuses;
  final void Function(String) onStatusChanged;
  final void Function(ProductionItem, String) onItemStatusChanged;

  const _OrderDetailSheet({
    required this.order,
    required this.canUpdateStatus,
    required this.itemStatuses,
    required this.onStatusChanged,
    required this.onItemStatusChanged,
  });

  Color _statusColor(String status) {
    return switch (status) {
      'MENUNGGU' => AppColors.warning,
      'PROSES' => AppColors.primary,
      'SELESAI' => AppColors.success,
      'DIBATALKAN' => AppColors.error,
      'PRINTING' => AppColors.primary,
      'FINISHING' => Colors.deepPurple,
      _ => Colors.grey,
    };
  }

  @override
  Widget build(BuildContext context) {
    final statusColor = _statusColor(order.status);

    return DraggableScrollableSheet(
      initialChildSize: 0.85,
      expand: false,
      builder: (_, scroll) => Column(
        children: [
          Container(
            margin: const EdgeInsets.symmetric(vertical: 8),
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: Colors.grey.shade300,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        order.nomorSpk ?? 'SPK-?',
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      if (order.nomorInvoice != null)
                        Text(
                          'Invoice: ${order.nomorInvoice}',
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.grey.shade600,
                          ),
                        ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: statusColor.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    order.status,
                    style: TextStyle(
                      color: statusColor,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: ListView(
              controller: scroll,
              padding: const EdgeInsets.all(16),
              children: [
                // Info
                if (order.pelangganNama != null)
                  _infoRow(
                    Icons.person_outline,
                    'Pelanggan',
                    order.pelangganNama!,
                  ),
                if (order.prioritas == 'KILAT')
                  _infoRow(
                    Icons.bolt,
                    'Prioritas',
                    'KILAT',
                    color: AppColors.error,
                  ),
                if (order.catatan != null && order.catatan!.isNotEmpty)
                  _infoRow(Icons.notes, 'Catatan', order.catatan!),
                const SizedBox(height: 16),

                // Items
                const Text(
                  'Item Produksi',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                ),
                const SizedBox(height: 8),
                ...order.items.map(
                  (item) => Card(
                    margin: const EdgeInsets.only(bottom: 8),
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      item.barangNama ?? '-',
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w600,
                                        fontSize: 14,
                                      ),
                                    ),
                                    Text(
                                      'Qty: ${item.quantity.toStringAsFixed(0)}',
                                      style: TextStyle(
                                        fontSize: 12,
                                        color: Colors.grey.shade600,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(width: 8),
                              _itemStatusControl(item),
                            ],
                          ),
                          if (item.finishing.isNotEmpty) ...[
                            const SizedBox(height: 10),
                            ...item.finishing.map(
                              (f) => Padding(
                                padding: const EdgeInsets.only(top: 4),
                                child: Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        f.jenisFinishing,
                                        style: TextStyle(
                                          fontSize: 12,
                                          color: Colors.grey.shade700,
                                        ),
                                      ),
                                    ),
                                    _itemStatusBadge('Finishing', f.status),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                // Actions
                if (canUpdateStatus && order.status == 'MENUNGGU') ...[
                  const Text(
                    'Aksi',
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: () => onStatusChanged('PROSES'),
                      child: const Text('Mulai Proses'),
                    ),
                  ),
                ],
                if (canUpdateStatus && order.status == 'PROSES') ...[
                  const Text(
                    'Aksi',
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: () => onStatusChanged('SELESAI'),
                      child: const Text('Tandai Selesai'),
                    ),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      onPressed: () => onStatusChanged('DIBATALKAN'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.error,
                        side: const BorderSide(color: AppColors.error),
                      ),
                      child: const Text('Batalkan'),
                    ),
                  ),
                ],
                if (canUpdateStatus && order.status == 'MENUNGGU') ...[
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      onPressed: () => onStatusChanged('DIBATALKAN'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.error,
                        side: const BorderSide(color: AppColors.error),
                      ),
                      child: const Text('Batalkan'),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _infoRow(IconData icon, String label, String value, {Color? color}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          Icon(icon, size: 16, color: color ?? Colors.grey.shade600),
          const SizedBox(width: 8),
          Text(
            '$label: ',
            style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
          ),
          Expanded(
            child: Text(
              value,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w500,
                color: color,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _itemStatusControl(ProductionItem item) {
    if (!canUpdateStatus) {
      return _itemStatusBadge('Item', item.status);
    }

    return PopupMenuButton<String>(
      tooltip: 'Ubah status item',
      initialValue: item.status,
      onSelected: (value) => onItemStatusChanged(item, value),
      itemBuilder: (context) => itemStatuses
          .map(
            (status) => PopupMenuItem(
              value: status,
              child: Row(
                children: [
                  Icon(
                    status == item.status
                        ? Icons.radio_button_checked
                        : Icons.radio_button_unchecked,
                    size: 16,
                    color: _statusColor(status),
                  ),
                  const SizedBox(width: 8),
                  Text(status),
                ],
              ),
            ),
          )
          .toList(),
      child: _itemStatusBadge('Item', item.status),
    );
  }

  Widget _itemStatusBadge(String label, String status) {
    final isDone = status == 'SELESAI' || status == 'DONE';
    final color = isDone ? AppColors.success : _statusColor(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        '$label: $status',
        style: TextStyle(
          fontSize: 10,
          color: color,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
