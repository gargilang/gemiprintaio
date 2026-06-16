import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gemiprint/models/ringkasan_kasbon.dart';
import 'package:gemiprint/providers/providers.dart';
import 'package:gemiprint/services/api_client.dart';
import 'package:gemiprint/widgets/confirm_dialog.dart';
import 'package:gemiprint/widgets/snackbar_helper.dart';
import 'package:intl/intl.dart';

class DetailKasbonSheet extends ConsumerStatefulWidget {
  final KaryawanKasbon karyawan;
  final VoidCallback onSuccess;

  const DetailKasbonSheet({super.key, required this.karyawan, required this.onSuccess});

  @override
  ConsumerState<DetailKasbonSheet> createState() => _DetailKasbonSheetState();
}

class _DetailKasbonSheetState extends ConsumerState<DetailKasbonSheet> {
  List<Map<String, dynamic>> _riwayat = [];
  bool _isLoading = true;
  final _fmt = NumberFormat.currency(locale: 'id_ID', symbol: 'Rp ', decimalDigits: 0);

  @override
  void initState() {
    super.initState();
    _loadRiwayat();
  }

  Future<void> _loadRiwayat() async {
    try {
      final data = await ref.read(financeServiceProvider).getKasbonRiwayat(widget.karyawan.actorId);
      if (mounted) {
        setState(() {
          _riwayat = (data['pinjaman'] as List<dynamic>?)?.map((j) => j as Map<String, dynamic>).toList() ?? [];
          _isLoading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _doAction(String action) async {
    final isTarik = action == 'tarik';
    final today = DateTime.now();
    final tanggalStr = '${today.year}-${today.month.toString().padLeft(2, '0')}-${today.day.toString().padLeft(2, '0')}';
    final jumlahCtrl = TextEditingController();
    final ketCtrl = TextEditingController();

    final result = await showModalBottomSheet<bool>(
      context: context, isScrollControlled: true, useSafeArea: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
        child: Container(
          padding: const EdgeInsets.all(20),
          decoration: const BoxDecoration(color: Colors.white, borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text(isTarik ? 'Tarik Kasbon' : 'Bayar Tunai', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            const SizedBox(height: 16),
            TextField(controller: jumlahCtrl, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: 'Jumlah', border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)))),
            const SizedBox(height: 12),
            TextField(controller: ketCtrl, decoration: InputDecoration(labelText: 'Keterangan (opsional)', border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)))),
            const SizedBox(height: 20),
            SizedBox(width: double.infinity, child: ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: isTarik ? Colors.red.shade600 : Colors.green.shade600),
              onPressed: () async {
                final j = double.tryParse(jumlahCtrl.text.replaceAll('.', ''));
                if (j == null || j <= 0) return;
                try {
                  final body = <String, dynamic>{'action': isTarik ? 'tarik' : 'bayar', 'actor_id': widget.karyawan.actorId, 'jumlah': j, 'tanggal': tanggalStr};
                  if (ketCtrl.text.isNotEmpty) body['keterangan'] = ketCtrl.text;
                  await ref.read(financeServiceProvider).kasbonAction(body);
                  if (ctx.mounted) Navigator.pop(ctx, true);
                } on ApiException catch (e) { if (ctx.mounted) showErrorSnackbar(ctx, e.message); }
              },
              child: Text(isTarik ? 'Tarik' : 'Bayar'),
            )),
            const SizedBox(height: 12),
          ]),
        ),
      ),
    );

    if (result == true) {
      if (!mounted) return;
      showSuccessSnackbar(context, isTarik ? 'Kasbon berhasil dicatat' : 'Pembayaran berhasil dicatat');
      widget.onSuccess();
      _loadRiwayat();
    }
  }

  Future<void> _revert(Map<String, dynamic> row) async {
    final ok = await showConfirmDialog(context, title: 'Batalkan Kasbon', message: 'Yakin ingin membatalkan transaksi ini?', isDangerous: true);
    if (!ok) return;
    try {
      await ref.read(financeServiceProvider).kasbonAction({'action': 'revert', 'id': row['id']});
      if (mounted) { showSuccessSnackbar(context, 'Transaksi berhasil dibatalkan'); widget.onSuccess(); _loadRiwayat(); }
    } on ApiException catch (e) { if (mounted) showErrorSnackbar(context, e.message); }
  }

  @override
  Widget build(BuildContext context) {
    final k = widget.karyawan;
    final initials = k.nama.isNotEmpty ? k.nama.split(' ').take(2).map((s) => s.isNotEmpty ? s[0].toUpperCase() : '').join() : '?';

    return Container(
      constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.8),
      decoration: const BoxDecoration(color: Colors.white, borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(margin: const EdgeInsets.symmetric(vertical: 8), width: 40, height: 4, decoration: BoxDecoration(color: Colors.grey.shade300, borderRadius: BorderRadius.circular(2))),
        Padding(padding: const EdgeInsets.all(16), child: Column(children: [
          Container(width: 48, height: 48, decoration: const BoxDecoration(borderRadius: BorderRadius.all(Radius.circular(16)), gradient: LinearGradient(colors: [Color(0xFFF59E0B), Color(0xFFD97706)])), alignment: Alignment.center, child: Text(initials, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 18))),
          const SizedBox(height: 8),
          Text(k.nama, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
          Text(k.roleLabel, style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
          const SizedBox(height: 6),
          Text(_fmt.format(k.saldoPinjaman), style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: k.saldoPinjaman > 0 ? Colors.red.shade600 : Colors.green.shade600)),
          if (k.saldoPinjaman > 0) Text('sisa kasbon', style: TextStyle(fontSize: 10, color: Colors.red.shade300)),
        ])),
        Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: Row(children: [
          Expanded(child: _actionButton('Tarik Kasbon', Icons.upload_rounded, Colors.red.shade50, Colors.red.shade600, () => _doAction('tarik'))),
          const SizedBox(width: 8),
          Expanded(child: _actionButton('Bayar Tunai', Icons.payments_rounded, Colors.green.shade50, Colors.green.shade600, () => _doAction('bayar'))),
        ])),
        const SizedBox(height: 12), const Divider(height: 1),
        Padding(padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8), child: Row(children: [Text('Riwayat Kasbon', style: TextStyle(fontSize: 11, color: Colors.grey.shade500, letterSpacing: 1))])),
        Flexible(child: _isLoading ? const Center(child: CircularProgressIndicator()) : _riwayat.isEmpty ? Center(child: Text('Belum ada riwayat', style: TextStyle(color: Colors.grey.shade500, fontSize: 13))) : ListView.builder(shrinkWrap: true, padding: const EdgeInsets.symmetric(horizontal: 16), itemCount: _riwayat.length, itemBuilder: (_, i) {
          final row = _riwayat[i];
          final isTarik = row['jenis'] == 'TARIK';
          final jumlah = (row['jumlah'] as num?)?.toDouble() ?? 0;
          return Padding(padding: const EdgeInsets.only(bottom: 6), child: Row(children: [
            Container(width: 32, height: 32, decoration: BoxDecoration(borderRadius: BorderRadius.circular(8), color: isTarik ? Colors.red.shade50 : Colors.green.shade50), alignment: Alignment.center, child: Text(isTarik ? 'T' : 'B', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12, color: isTarik ? Colors.red.shade600 : Colors.green.shade600))),
            const SizedBox(width: 8),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(isTarik ? 'Tarik Kasbon' : 'Bayar Tunai', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
              Text(row['tanggal']?.toString() ?? '', style: TextStyle(fontSize: 10, color: Colors.grey.shade500)),
            ])),
            Text(isTarik ? '-${_fmt.format(jumlah)}' : '+${_fmt.format(jumlah)}', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: isTarik ? Colors.red.shade600 : Colors.green.shade600)),
            const SizedBox(width: 4),
            GestureDetector(onTap: () => _revert(row), child: Icon(Icons.undo_rounded, size: 16, color: Colors.grey.shade400)),
          ]));
        })),
        const SizedBox(height: 16),
      ]),
    );
  }

  Widget _actionButton(String label, IconData icon, Color bg, Color fg, VoidCallback onTap) {
    return InkWell(
      onTap: onTap, borderRadius: BorderRadius.circular(10),
      child: Container(padding: const EdgeInsets.symmetric(vertical: 14), decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(10), border: Border.all(color: fg.withValues(alpha: 0.3))),
        child: Column(children: [Icon(icon, color: fg, size: 20), const SizedBox(height: 4), Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: fg))])),
    );
  }
}
