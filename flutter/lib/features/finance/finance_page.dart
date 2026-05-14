import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gemiprint/core/theme/app_theme.dart';
import 'package:gemiprint/models/cashbook.dart';
import 'package:gemiprint/providers/providers.dart';
import 'package:gemiprint/services/api_client.dart';
import 'package:gemiprint/widgets/confirm_dialog.dart';
import 'package:gemiprint/widgets/empty_state.dart';
import 'package:gemiprint/widgets/search_field.dart';
import 'package:gemiprint/widgets/snackbar_helper.dart';
import 'package:intl/intl.dart';

class FinancePage extends ConsumerStatefulWidget {
  const FinancePage({super.key});

  @override
  ConsumerState<FinancePage> createState() => _FinancePageState();
}

class _FinancePageState extends ConsumerState<FinancePage> {
  List<CashBookEntry> _entries = [];
  bool _isLoading = true;
  String _search = '';

  final _fmt = NumberFormat.currency(locale: 'id_ID', symbol: 'Rp ', decimalDigits: 0);

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final data = await ref.read(financeServiceProvider).getCashBook();
      final list = data['entries'] as List? ?? data['keuangan'] as List? ?? [];
      if (mounted) {
        setState(() {
          _entries = list.map((j) => CashBookEntry.fromJson(j as Map<String, dynamic>)).toList();
          _isLoading = false;
        });
      }
    } catch (_) {
      if (mounted) { setState(() => _isLoading = false); showErrorSnackbar(context, 'Gagal memuat data keuangan'); }
    }
  }

  List<CashBookEntry> get _filtered {
    if (_search.isEmpty) return _entries;
    final q = _search.toLowerCase();
    return _entries.where((e) =>
      e.kategoriTransaksi.toLowerCase().contains(q) ||
      (e.keperluan?.toLowerCase().contains(q) ?? false) ||
      (e.catatan?.toLowerCase().contains(q) ?? false)
    ).toList();
  }

  Future<void> _deleteEntry(CashBookEntry entry) async {
    final ok = await showConfirmDialog(context, title: 'Hapus Entri', message: 'Hapus entri ini?', isDangerous: true);
    if (!ok) return;
    try {
      await ref.read(financeServiceProvider).deleteEntry(entry.id);
      if (mounted) { showSuccessSnackbar(context, 'Entri berhasil dihapus'); _loadData(); }
    } on ApiException catch (e) {
      if (mounted) showErrorSnackbar(context, e.message);
    }
  }

  Future<void> _showAddDialog() async {
    final tanggalCtrl = TextEditingController(text: DateFormat('yyyy-MM-dd').format(DateTime.now()));
    final debitCtrl = TextEditingController();
    final kreditCtrl = TextEditingController();
    final keperluanCtrl = TextEditingController();
    String kategori = 'KAS';

    final result = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
        child: DraggableScrollableSheet(
          initialChildSize: 0.7,
          expand: false,
          builder: (_, scroll) => Container(
            decoration: const BoxDecoration(color: Colors.white, borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
            child: Column(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  decoration: BoxDecoration(border: Border(bottom: BorderSide(color: Colors.grey.shade200))),
                  child: Row(
                    children: [
                      const Expanded(child: Text('Tambah Entri', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600))),
                      TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Batal')),
                      ElevatedButton(
                        onPressed: () async {
                          try {
                            await ref.read(financeServiceProvider).createEntry({
                              'tanggal': tanggalCtrl.text,
                              'kategori_transaksi': kategori,
                              'debit': double.tryParse(debitCtrl.text) ?? 0,
                              'kredit': double.tryParse(kreditCtrl.text) ?? 0,
                              'keperluan': keperluanCtrl.text.trim(),
                            });
                            if (ctx.mounted) Navigator.pop(ctx, true);
                          } on ApiException catch (e) {
                            if (ctx.mounted) showErrorSnackbar(ctx, e.message);
                          }
                        },
                        child: const Text('Simpan'),
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: ListView(
                    controller: scroll,
                    padding: const EdgeInsets.all(16),
                    children: [
                      TextFormField(controller: tanggalCtrl, decoration: const InputDecoration(labelText: 'Tanggal (YYYY-MM-DD)')),
                      const SizedBox(height: 12),
                      StatefulBuilder(builder: (ctx, setLocal) => DropdownButtonFormField<String>(
                        initialValue: kategori,
                        decoration: const InputDecoration(labelText: 'Kategori'),
                        items: const ['KAS', 'BIAYA', 'OMZET', 'SUPPLY', 'LABA', 'KOMISI', 'TABUNGAN', 'HUTANG', 'PIUTANG']
                            .map((k) => DropdownMenuItem(value: k, child: Text(k))).toList(),
                        onChanged: (v) => setLocal(() => kategori = v ?? 'KAS'),
                      )),
                      const SizedBox(height: 12),
                      TextFormField(controller: debitCtrl, decoration: const InputDecoration(labelText: 'Debit'), keyboardType: TextInputType.number),
                      const SizedBox(height: 12),
                      TextFormField(controller: kreditCtrl, decoration: const InputDecoration(labelText: 'Kredit'), keyboardType: TextInputType.number),
                      const SizedBox(height: 12),
                      TextFormField(controller: keperluanCtrl, decoration: const InputDecoration(labelText: 'Keperluan'), maxLines: 2),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    if (result == true && mounted) {
      showSuccessSnackbar(context, 'Entri berhasil ditambahkan');
      _loadData();
    }
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filtered;
    final totalSaldo = _entries.isNotEmpty ? _entries.last.saldo : 0.0;

    return Stack(
      children: [
        Column(
          children: [
            Container(
              margin: const EdgeInsets.all(16),
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                gradient: const LinearGradient(colors: [AppColors.primary, AppColors.accent]),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Saldo', style: TextStyle(color: Colors.white, fontSize: 14)),
                  Text(_fmt.format(totalSaldo), style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: SearchField(hintText: 'Cari entri...', onChanged: (v) => setState(() => _search = v)),
            ),
            Expanded(
              child: _isLoading
                  ? const Center(child: CircularProgressIndicator())
                  : filtered.isEmpty
                      ? const EmptyState(icon: Icons.account_balance_wallet_rounded, title: 'Belum ada entri keuangan')
                      : RefreshIndicator(
                          onRefresh: _loadData,
                          child: ListView.separated(
                            padding: const EdgeInsets.fromLTRB(16, 0, 16, 80),
                            itemCount: filtered.length,
                            separatorBuilder: (_, _) => const SizedBox(height: 4),
                            itemBuilder: (_, i) {
                              final e = filtered[i];
                              final isDebit = e.debit > 0;
                              return Card(
                                child: ListTile(
                                  dense: true,
                                  leading: CircleAvatar(
                                    backgroundColor: (isDebit ? AppColors.success : AppColors.error).withValues(alpha: 0.15),
                                    radius: 18,
                                    child: Icon(isDebit ? Icons.arrow_downward_rounded : Icons.arrow_upward_rounded, color: isDebit ? AppColors.success : AppColors.error, size: 18),
                                  ),
                                  title: Text(e.keperluan ?? e.kategoriTransaksi, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500), overflow: TextOverflow.ellipsis),
                                  subtitle: Text('${e.tanggal} · ${e.kategoriTransaksi}', style: const TextStyle(fontSize: 11)),
                                  trailing: Column(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    crossAxisAlignment: CrossAxisAlignment.end,
                                    children: [
                                      Text(
                                        '${isDebit ? '+' : '-'}${_fmt.format(isDebit ? e.debit : e.kredit)}',
                                        style: TextStyle(color: isDebit ? AppColors.success : AppColors.error, fontWeight: FontWeight.w600, fontSize: 13),
                                      ),
                                      Text('Saldo: ${_fmt.format(e.saldo)}', style: TextStyle(fontSize: 10, color: Colors.grey.shade500)),
                                    ],
                                  ),
                                  onLongPress: () => _deleteEntry(e),
                                ),
                              );
                            },
                          ),
                        ),
            ),
          ],
        ),
        Positioned(
          right: 16,
          bottom: 16,
          child: FloatingActionButton(onPressed: _showAddDialog, child: const Icon(Icons.add_rounded)),
        ),
      ],
    );
  }
}
