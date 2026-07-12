import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gemiprint/core/theme/app_theme.dart';
import 'package:gemiprint/models/pengambilan.dart';
import 'package:gemiprint/providers/providers.dart';
import 'package:gemiprint/services/api_client.dart';
import 'package:gemiprint/widgets/confirm_dialog.dart';
import 'package:gemiprint/widgets/empty_state.dart';
import 'package:gemiprint/widgets/snackbar_helper.dart';
import 'package:intl/intl.dart';

class PengambilanPage extends ConsumerStatefulWidget {
  const PengambilanPage({super.key});

  @override
  ConsumerState<PengambilanPage> createState() => _PengambilanPageState();
}

class _PengambilanPageState extends ConsumerState<PengambilanPage> {
  List<PengambilanRow> _belum = [];
  List<PengambilanRow> _sudah = [];
  bool _isLoading = true;
  bool _showSudah = false;
  bool _isProcessing = false;
  String _search = '';
  final _currencyFmt = NumberFormat.currency(locale: 'id_ID', symbol: 'Rp ', decimalDigits: 0);

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  bool _belumLoaded = false;
  bool _sudahLoaded = false;

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    // Tarik ulang selalu mengambil data segar agar pull-to-refresh bekerja.
    _belumLoaded = false;
    _sudahLoaded = false;
    try {
      final service = ref.read(pengambilanServiceProvider);
      final activeSudah = _showSudah;
      final fetchBelum = !_belumLoaded || !activeSudah;
      final fetchSudah = !_sudahLoaded || activeSudah;
      final results = await Future.wait([
        if (fetchBelum)
          service.getRows(sudah: false, forceRefresh: true)
        else
          Future.value(_belum),
        if (fetchSudah)
          service.getRows(sudah: true, forceRefresh: true)
        else
          Future.value(_sudah),
      ]);
      if (mounted) {
        setState(() {
          _belum = results[0];
          _sudah = results[1];
          _belumLoaded = true;
          _sudahLoaded = true;
          _isLoading = false;
        });
      }
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        if (e.isUnauthorized) {
          ref.read(authStateProvider.notifier).logout();
          return;
        }
        showErrorSnackbar(context, e.message);
      }
    } catch (_) {
      if (mounted) {
        setState(() => _isLoading = false);
        showErrorSnackbar(context, 'Gagal memuat pengambilan');
      }
    }
  }

  List<PengambilanRow> get _filtered {
    final source = _showSudah ? _sudah : _belum;
    if (_search.trim().isEmpty) return source;
    final q = _search.toLowerCase();
    return source.where((r) {
      return r.nomorSpk.toLowerCase().contains(q) ||
          r.nomorFaktur.toLowerCase().contains(q) ||
          r.pelangganNama.toLowerCase().contains(q) ||
          r.itemRingkas.toLowerCase().contains(q);
    }).toList();
  }

  Future<void> _markSudahDiambil(PengambilanRow row) async {
    final ok = await showConfirmDialog(
      context,
      title: 'Sudah Diambil',
      message: 'Tandai SPK ${row.nomorSpk} sudah diambil pelanggan?',
    );
    if (!ok) return;
    setState(() => _isProcessing = true);
    try {
      final response = await ref.read(pengambilanServiceProvider).markSudahDiambil(row.orderId);
      final result = response['result'] as Map<String, dynamic>?;
      final blocked = (result?['terhalang'] as List?) ?? [];
      if (mounted) {
        if (blocked.isNotEmpty) {
          final names = blocked
              .map((i) => (i as Map<String, dynamic>)['nama']?.toString() ?? '-')
              .join(', ');
          showErrorSnackbar(context, 'Item belum bisa diselesaikan: $names');
        } else {
          showSuccessSnackbar(context, 'SPK ditandai sudah diambil');
        }
        _loadData();
      }
    } on ApiException catch (e) {
      if (mounted) showErrorSnackbar(context, e.message);
    } catch (_) {
      if (mounted) showErrorSnackbar(context, 'Gagal menandai sudah diambil');
    } finally {
      if (mounted) setState(() => _isProcessing = false);
    }
  }

  Future<void> _payReceivable(PengambilanRow row) async {
    final controller = TextEditingController(text: row.sisaPiutang.toStringAsFixed(0));
    final bool? ok;
    try {
      ok = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Terima Piutang'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('${row.pelangganNama}\n${row.nomorFaktur}\nSisa: ${_currencyFmt.format(row.sisaPiutang)}'),
              const SizedBox(height: 12),
              TextField(
                controller: controller,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Jumlah Bayar',
                  border: OutlineInputBorder(),
                ),
              ),
            ],
          ),
          actions: [
                TextButton(onPressed: _isProcessing ? null : () => Navigator.pop(ctx, false), child: const Text('Batal')),
                FilledButton(onPressed: _isProcessing ? null : () => Navigator.pop(ctx, true), child: _isProcessing ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Simpan')),
          ],
        ),
      );
    } finally {
      controller.dispose();
    }
    if (ok != true) return;
    final cleaned = controller.text.trim().replaceAll(RegExp(r'[^0-9]'), '');
    final jumlah = int.tryParse(cleaned)?.toDouble();
    if (jumlah == null || jumlah <= 0 || jumlah > row.sisaPiutang) {
      if (mounted) showErrorSnackbar(context, 'Jumlah bayar tidak valid');
      return;
    }
    setState(() => _isProcessing = true);
    try {
      await ref.read(posServiceProvider).payReceivable({
        'piutang_id': row.piutangId,
        'jumlah_bayar': jumlah,
      });
      if (mounted) {
        showSuccessSnackbar(context, 'Pembayaran piutang tersimpan');
        _loadData();
      }
    } on ApiException catch (e) {
      if (mounted) showErrorSnackbar(context, e.message);
    } catch (_) {
      if (mounted) showErrorSnackbar(context, 'Gagal mencatat pembayaran');
    } finally {
      if (mounted) setState(() => _isProcessing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final rows = _filtered;
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
          child: TextField(
            decoration: InputDecoration(
              hintText: 'Cari SPK, faktur, atau pelanggan...',
              prefixIcon: const Icon(Icons.search, size: 20),
              suffixIcon: _search.isNotEmpty
                  ? IconButton(icon: const Icon(Icons.clear, size: 18), onPressed: () => setState(() => _search = ''))
                  : null,
              filled: true,
              fillColor: Theme.of(context).colorScheme.surfaceContainerHighest.withValues(alpha: 0.3),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(28), borderSide: BorderSide.none),
              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            ),
            onChanged: (v) => setState(() => _search = v),
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                FilterChip(
                  label: const Text('Belum Diambil'),
                  selected: !_showSudah,
                  onSelected: (_) => setState(() => _showSudah = false),
                  selectedColor: AppColors.warning.withValues(alpha: 0.15),
                  checkmarkColor: AppColors.warning,
                ),
                const SizedBox(width: 8),
                FilterChip(
                  label: const Text('Sudah Diambil'),
                  selected: _showSudah,
                  onSelected: (_) => setState(() => _showSudah = true),
                  selectedColor: AppColors.success.withValues(alpha: 0.15),
                  checkmarkColor: AppColors.success,
                ),
              ],
            ),
          ),
        ),
        Expanded(child: _buildBody(rows)),
      ],
    );
  }

  Widget _buildBody(List<PengambilanRow> rows) {
    if (_isLoading) return const Center(child: CircularProgressIndicator());
    if (rows.isEmpty) {
      return EmptyState(
        icon: _showSudah ? Icons.done_all_rounded : Icons.inventory_2_rounded,
        title: _showSudah ? 'Belum ada riwayat pengambilan' : 'Tidak ada SPK siap diambil',
      );
    }
    return RefreshIndicator(
      onRefresh: _loadData,
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 80),
        itemCount: rows.length,
        itemBuilder: (_, i) => _buildCard(rows[i]),
      ),
    );
  }

  Widget _buildCard(PengambilanRow row) {
    final bayarColor = row.statusBayar == 'LUNAS'
        ? AppColors.success
        : row.statusBayar == 'SEBAGIAN'
            ? AppColors.warning
            : AppColors.error;
    return Card(
      margin: const EdgeInsets.only(bottom: 6),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(row.nomorSpk, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14), overflow: TextOverflow.ellipsis)),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(color: bayarColor.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(8)),
                  child: Text(row.statusBayarLabel, style: TextStyle(color: bayarColor, fontSize: 10, fontWeight: FontWeight.w600)),
                ),
              ],
            ),
            const SizedBox(height: 3),
            Text('${row.nomorFaktur} · ${row.pelangganNama}', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
            const SizedBox(height: 2),
            Text('${row.jumlahItem} item · ${row.itemRingkas}', style: TextStyle(fontSize: 11, color: Colors.grey.shade500), maxLines: 2, overflow: TextOverflow.ellipsis),
            const SizedBox(height: 4),
            Text('Sisa tagihan: ${_currencyFmt.format(row.sisaPiutang)}', style: TextStyle(fontSize: 12, color: Colors.grey.shade700)),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                if (row.adaPiutang) ...[
                  TextButton.icon(
                    onPressed: _isProcessing ? null : () => _payReceivable(row),
                    icon: const Icon(Icons.payment_rounded, size: 16),
                    label: const Text('Terima Piutang'),
                  ),
                  const SizedBox(width: 8),
                ],
                if (!_showSudah)
                  FilledButton.icon(
                    onPressed: _isProcessing ? null : () => _markSudahDiambil(row),
                    icon: const Icon(Icons.done_rounded, size: 16),
                    label: const Text('Sudah Diambil'),
                    style: FilledButton.styleFrom(backgroundColor: AppColors.warning),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
