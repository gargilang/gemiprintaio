import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gemiprint/core/theme/app_theme.dart';
import 'package:gemiprint/providers/providers.dart';
import 'package:gemiprint/widgets/snackbar_helper.dart';
import 'package:intl/intl.dart';

class ReportsPage extends ConsumerStatefulWidget {
  const ReportsPage({super.key});

  @override
  ConsumerState<ReportsPage> createState() => _ReportsPageState();
}

class _ReportsPageState extends ConsumerState<ReportsPage> {
  Map<String, dynamic>? _reportData;
  bool _isLoading = false;

  final _fmt = NumberFormat.currency(locale: 'id_ID', symbol: 'Rp ', decimalDigits: 0);

  Future<void> _loadReport() async {
    setState(() => _isLoading = true);
    try {
      final data = await ref.read(financeServiceProvider).getCashBook();
      if (mounted) setState(() { _reportData = data; _isLoading = false; });
    } catch (_) {
      if (mounted) { setState(() => _isLoading = false); showErrorSnackbar(context, 'Gagal memuat laporan'); }
    }
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Laporan Keuangan', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  const Text('Lihat ringkasan keuangan berdasarkan data buku kas.', style: TextStyle(fontSize: 13, color: Colors.grey)),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: _isLoading ? null : _loadReport,
                      icon: _isLoading
                          ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : const Icon(Icons.assessment_rounded, size: 18),
                      label: const Text('Buat Laporan'),
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (_reportData != null) ...[
            const SizedBox(height: 16),
            _buildSummaryCards(),
          ],
        ],
      ),
    );
  }

  Widget _buildSummaryCards() {
    final entries = _reportData!['entries'] as List? ?? _reportData!['keuangan'] as List? ?? [];
    double totalDebit = 0, totalKredit = 0;
    for (final e in entries) {
      totalDebit += (e['debit'] as num?)?.toDouble() ?? 0;
      totalKredit += (e['kredit'] as num?)?.toDouble() ?? 0;
    }
    final saldo = totalDebit - totalKredit;

    return Column(
      children: [
        Row(
          children: [
            Expanded(child: _summaryCard('Total Masuk', _fmt.format(totalDebit), AppColors.success, Icons.arrow_downward_rounded)),
            const SizedBox(width: 8),
            Expanded(child: _summaryCard('Total Keluar', _fmt.format(totalKredit), AppColors.error, Icons.arrow_upward_rounded)),
          ],
        ),
        const SizedBox(height: 8),
        _summaryCard('Saldo Akhir', _fmt.format(saldo), AppColors.primary, Icons.account_balance_wallet_rounded),
        const SizedBox(height: 8),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Total Entri', style: TextStyle(fontSize: 14)),
                Text('${entries.length}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _summaryCard(String label, String value, Color color, IconData icon) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            CircleAvatar(backgroundColor: color.withValues(alpha: 0.15), child: Icon(icon, color: color, size: 20)),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                  const SizedBox(height: 2),
                  Text(value, style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: color)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
