import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gemiprint/core/constants/roles.dart';
import 'package:gemiprint/core/theme/app_theme.dart';
import 'package:gemiprint/models/cashbook.dart';
import 'package:gemiprint/providers/providers.dart';
import 'package:gemiprint/services/api_client.dart';
import 'package:gemiprint/widgets/confirm_dialog.dart';
import 'package:gemiprint/widgets/empty_state.dart';
import 'package:gemiprint/widgets/search_field.dart';
import 'package:gemiprint/widgets/snackbar_helper.dart';
import 'package:intl/intl.dart';

const _fallbackKategoriList = [
  'KAS',
  'BIAYA',
  'OMZET',
  'SUPPLY',
  'LABA',
  'KOMISI',
  'TABUNGAN',
  'HUTANG',
  'PIUTANG',
];

class FinancePage extends ConsumerStatefulWidget {
  const FinancePage({super.key});

  @override
  ConsumerState<FinancePage> createState() => _FinancePageState();
}

class _FinancePageState extends ConsumerState<FinancePage> {
  List<CashBookEntry> _entries = [];
  List<String> _kategoriOptions = List<String>.from(_fallbackKategoriList);
  Map<String, dynamic> _systemMetrics = {};
  bool _isLoading = true;
  String _search = '';
  String _filterKategori = 'SEMUA';

  final _fmt = NumberFormat.currency(
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
    if (_entries.isEmpty) {
      setState(() => _isLoading = true);
    }
    try {
      final service = ref.read(financeServiceProvider);
      final data = await service.getCashBook(forceRefresh: forceRefresh);
      Map<String, dynamic> config = {};
      try {
        config = await service.getConfig();
      } catch (_) {
        config = {};
      }
      final list =
          data['cashBooks'] as List? ??
          data['entries'] as List? ??
          data['keuangan'] as List? ??
          [];
      final categories = config['categories'] as List? ?? [];
      if (mounted) {
        setState(() {
          _entries = list
              .map((j) => CashBookEntry.fromJson(j as Map<String, dynamic>))
              .toList();
          _systemMetrics = data['systemMetrics'] is Map<String, dynamic>
              ? data['systemMetrics'] as Map<String, dynamic>
              : {};
          _kategoriOptions = categories.isEmpty
              ? List<String>.from(_fallbackKategoriList)
              : categories
                    .map((c) => (c['category_code'] ?? '').toString())
                    .where((c) => c.isNotEmpty)
                    .toSet()
                    .toList();
          _isLoading = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() => _isLoading = false);
        showErrorSnackbar(context, 'Gagal memuat data keuangan');
      }
    }
  }

  List<CashBookEntry> get _filtered {
    var list = _entries;
    if (_filterKategori != 'SEMUA') {
      list = list.where((e) => e.kategoriTransaksi == _filterKategori).toList();
    }
    if (_search.isNotEmpty) {
      final q = _search.toLowerCase();
      list = list
          .where(
            (e) =>
                e.kategoriTransaksi.toLowerCase().contains(q) ||
                (e.keperluan?.toLowerCase().contains(q) ?? false) ||
                (e.catatan?.toLowerCase().contains(q) ?? false),
          )
          .toList();
    }
    return list;
  }

  double get _totalDebit => _filtered.fold(0.0, (s, e) => s + e.debit);
  double get _totalKredit => _filtered.fold(0.0, (s, e) => s + e.kredit);
  double get _totalSaldo =>
      (_systemMetrics['saldo'] as num?)?.toDouble() ??
      (_entries.isNotEmpty ? _entries.last.saldo : 0.0);

  bool get _canUseRiskyActions {
    final role = ref.read(authStateProvider).valueOrNull?.role;
    return role != null && RoleGroups.adminOnly.contains(role);
  }

  Future<void> _deleteEntry(CashBookEntry entry) async {
    final ok = await showConfirmDialog(
      context,
      title: 'Hapus Entri',
      message: 'Hapus entri ini?',
      isDangerous: true,
    );
    if (!ok) return;
    try {
      await ref.read(financeServiceProvider).deleteEntry(entry.id);
      if (mounted) {
        showSuccessSnackbar(context, 'Entri berhasil dihapus');
        _loadData();
      }
    } on ApiException catch (e) {
      if (mounted) showErrorSnackbar(context, e.message);
    }
  }

  Future<void> _showEntryForm({CashBookEntry? existing}) async {
    final today = DateTime.now();
    final todayStr =
        '${today.year}-${today.month.toString().padLeft(2, '0')}-${today.day.toString().padLeft(2, '0')}';

    String tanggal = existing?.tanggal ?? todayStr;
    String kategori = existing?.kategoriTransaksi ?? 'KAS';
    final debitCtrl = TextEditingController(
      text: existing != null && existing.debit > 0
          ? existing.debit.toStringAsFixed(0)
          : '',
    );
    final kreditCtrl = TextEditingController(
      text: existing != null && existing.kredit > 0
          ? existing.kredit.toStringAsFixed(0)
          : '',
    );
    final keperluanCtrl = TextEditingController(
      text: existing?.keperluan ?? '',
    );
    final catatanCtrl = TextEditingController(text: existing?.catatan ?? '');

    final result = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => Padding(
          padding: EdgeInsets.only(
            bottom: MediaQuery.of(ctx).viewInsets.bottom,
          ),
          child: DraggableScrollableSheet(
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
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 8,
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          existing == null ? 'Tambah Entri' : 'Edit Entri',
                          style: const TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      TextButton(
                        onPressed: () => Navigator.pop(ctx),
                        child: const Text('Batal'),
                      ),
                      ElevatedButton(
                        onPressed: () async {
                          try {
                            final body = {
                              'tanggal': tanggal,
                              'kategori_transaksi': kategori,
                              'debit': double.tryParse(debitCtrl.text) ?? 0,
                              'kredit': double.tryParse(kreditCtrl.text) ?? 0,
                              'keperluan': keperluanCtrl.text.trim(),
                              'catatan': catatanCtrl.text.trim().isEmpty
                                  ? null
                                  : catatanCtrl.text.trim(),
                            };
                            if (existing == null) {
                              await ref
                                  .read(financeServiceProvider)
                                  .createEntry(body);
                            } else {
                              await ref
                                  .read(financeServiceProvider)
                                  .updateEntry(existing.id, body);
                            }
                            if (ctx.mounted) Navigator.pop(ctx, true);
                          } on ApiException catch (e) {
                            if (ctx.mounted) {
                              showErrorSnackbar(ctx, e.message);
                            }
                          }
                        },
                        child: const Text('Simpan'),
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
                      // Tanggal dengan date picker
                      InkWell(
                        onTap: () async {
                          final picked = await showDatePicker(
                            context: ctx,
                            initialDate:
                                DateTime.tryParse(tanggal) ?? DateTime.now(),
                            firstDate: DateTime(2020),
                            lastDate: DateTime.now().add(
                              const Duration(days: 30),
                            ),
                            locale: const Locale('id', 'ID'),
                          );
                          if (picked != null) {
                            setLocal(() {
                              tanggal =
                                  '${picked.year}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
                            });
                          }
                        },
                        child: InputDecorator(
                          decoration: const InputDecoration(
                            labelText: 'Tanggal',
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                tanggal,
                                style: const TextStyle(fontSize: 15),
                              ),
                              const Icon(
                                Icons.calendar_today,
                                size: 18,
                                color: AppColors.primary,
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),
                      DropdownButtonFormField<String>(
                        initialValue: kategori,
                        decoration: const InputDecoration(
                          labelText: 'Kategori',
                        ),
                        items:
                            [
                                  if (!_kategoriOptions.contains(kategori))
                                    kategori,
                                  ..._kategoriOptions,
                                ]
                                .map(
                                  (k) => DropdownMenuItem(
                                    value: k,
                                    child: Text(k),
                                  ),
                                )
                                .toList(),
                        onChanged: (v) => setLocal(() => kategori = v ?? 'KAS'),
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: keperluanCtrl,
                        decoration: const InputDecoration(
                          labelText: 'Keperluan / Keterangan',
                        ),
                        maxLines: 2,
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: TextFormField(
                              controller: debitCtrl,
                              decoration: const InputDecoration(
                                labelText: 'Debit (Masuk)',
                                prefixText: 'Rp ',
                              ),
                              keyboardType: TextInputType.number,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: TextFormField(
                              controller: kreditCtrl,
                              decoration: const InputDecoration(
                                labelText: 'Kredit (Keluar)',
                                prefixText: 'Rp ',
                              ),
                              keyboardType: TextInputType.number,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: catatanCtrl,
                        decoration: const InputDecoration(
                          labelText: 'Catatan (opsional)',
                        ),
                        maxLines: 2,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );

    debitCtrl.dispose();
    kreditCtrl.dispose();
    keperluanCtrl.dispose();
    catatanCtrl.dispose();

    if (result == true && mounted) {
      showSuccessSnackbar(
        context,
        existing == null
            ? 'Entri berhasil ditambahkan'
            : 'Entri berhasil diperbarui',
      );
      _loadData();
    }
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filtered;

    return Stack(
      children: [
        Column(
          children: [
            // Summary cards
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: Column(
                children: [
                  Row(
                    children: [
                      _summaryCard(
                        'Saldo',
                        _totalSaldo,
                        AppColors.primary,
                        Icons.account_balance_wallet_rounded,
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: _miniSummaryCard(
                          'Total Masuk',
                          _totalDebit,
                          AppColors.success,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: _miniSummaryCard(
                          'Total Keluar',
                          _totalKredit,
                          AppColors.error,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),

            // Filter kategori
            SizedBox(
              height: 36,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 12),
                children: ['SEMUA', ..._kategoriOptions]
                    .map(
                      (k) => Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 3),
                        child: FilterChip(
                          label: Text(k, style: const TextStyle(fontSize: 11)),
                          selected: _filterKategori == k,
                          onSelected: (_) =>
                              setState(() => _filterKategori = k),
                          selectedColor: AppColors.primary.withValues(
                            alpha: 0.2,
                          ),
                          visualDensity: VisualDensity.compact,
                        ),
                      ),
                    )
                    .toList(),
              ),
            ),
            const SizedBox(height: 4),

            // Search
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: SearchField(
                hintText: 'Cari entri...',
                onChanged: (v) => setState(() => _search = v),
              ),
            ),

            // List
            Expanded(
              child: _isLoading
                  ? const Center(child: CircularProgressIndicator())
                  : filtered.isEmpty
                  ? const EmptyState(
                      icon: Icons.account_balance_wallet_rounded,
                      title: 'Belum ada entri keuangan',
                    )
                  : RefreshIndicator(
                      onRefresh: () => _loadData(forceRefresh: true),
                      child: ListView.separated(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 80),
                        itemCount: filtered.length,
                        separatorBuilder: (_, _) => const SizedBox(height: 4),
                        itemBuilder: (_, i) => _buildCard(
                          filtered[i],
                          canEdit: _canUseRiskyActions,
                        ),
                      ),
                    ),
            ),
          ],
        ),
        Positioned(
          right: 16,
          bottom: 16,
          child: FloatingActionButton(
            onPressed: () => _showEntryForm(),
            child: const Icon(Icons.add_rounded),
          ),
        ),
      ],
    );
  }

  Widget _summaryCard(String label, double value, Color color, IconData icon) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [color, color.withValues(alpha: 0.8)],
          ),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            Icon(icon, color: Colors.white.withValues(alpha: 0.9), size: 24),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.85),
                      fontSize: 12,
                    ),
                  ),
                  Text(
                    _fmt.format(value),
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _miniSummaryCard(String label, double value, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(fontSize: 11, color: color.withValues(alpha: 0.8)),
          ),
          const SizedBox(height: 2),
          Text(
            _fmt.format(value),
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.bold,
              color: color,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCard(CashBookEntry e, {required bool canEdit}) {
    final isDebit = e.debit > 0;
    final color = isDebit ? AppColors.success : AppColors.error;

    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: canEdit ? () => _showEntryForm(existing: e) : null,
        child: ListTile(
          dense: true,
          leading: CircleAvatar(
            backgroundColor: color.withValues(alpha: 0.15),
            radius: 18,
            child: Icon(
              isDebit
                  ? Icons.arrow_downward_rounded
                  : Icons.arrow_upward_rounded,
              color: color,
              size: 16,
            ),
          ),
          title: Text(
            e.keperluan ?? e.kategoriTransaksi,
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
            overflow: TextOverflow.ellipsis,
          ),
          subtitle: Text(
            '${e.tanggal} · ${e.kategoriTransaksi}',
            style: const TextStyle(fontSize: 11),
          ),
          trailing: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '${isDebit ? '+' : '-'}${_fmt.format(isDebit ? e.debit : e.kredit)}',
                style: TextStyle(
                  color: color,
                  fontWeight: FontWeight.w600,
                  fontSize: 13,
                ),
              ),
              Text(
                'Saldo: ${_fmt.format(e.saldo)}',
                style: TextStyle(fontSize: 10, color: Colors.grey.shade500),
              ),
            ],
          ),
          onLongPress: canEdit ? () => _deleteEntry(e) : null,
        ),
      ),
    );
  }
}
