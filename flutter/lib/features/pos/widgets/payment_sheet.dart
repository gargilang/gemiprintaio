import 'package:flutter/material.dart';
import 'package:gemiprint/core/theme/app_theme.dart';
import 'package:gemiprint/features/pos/pos_calc.dart';

class PaymentResult {
  final String metode;
  final double dibayar;
  final double kembalian;
  const PaymentResult({
    required this.metode,
    required this.dibayar,
    required this.kembalian,
  });
}

const _methods = [
  ('CASH', 'Tunai'),
  ('TRANSFER', 'Transfer'),
  ('QRIS', 'QRIS'),
  ('DEBIT', 'Debit'),
  ('DOWN_PAYMENT', 'DP'),
  ('NET30', 'NET30'),
];

Future<PaymentResult?> showPaymentSheet(
  BuildContext context, {
  required double total,
}) {
  return showModalBottomSheet<PaymentResult>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) => _PaymentBody(total: total),
  );
}

class _PaymentBody extends StatefulWidget {
  final double total;
  const _PaymentBody({required this.total});

  @override
  State<_PaymentBody> createState() => _PaymentBodyState();
}

class _PaymentBodyState extends State<_PaymentBody> {
  String _metode = 'CASH';
  final _bayarCtrl = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _bayarCtrl.dispose();
    super.dispose();
  }

  double get _bayar =>
      double.tryParse(_bayarCtrl.text.replaceAll('.', '').replaceAll(',', '')) ??
      0;
  double get _kembalian =>
      _metode == 'NET30' ? 0 : (_bayar - widget.total).clamp(0, double.infinity);
  double get _kurang =>
      _metode == 'NET30' ? 0 : (widget.total - _bayar).clamp(0, double.infinity);

  void _process() {
    if (_metode != 'NET30' && _bayarCtrl.text.trim().isEmpty) {
      setState(() => _error = 'Masukkan jumlah pembayaran');
      return;
    }
    Navigator.pop(
      context,
      PaymentResult(
        metode: _metode,
        dibayar: _metode == 'NET30' ? 0 : _bayar,
        kembalian: _kembalian,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: DraggableScrollableSheet(
        initialChildSize: 0.75,
        expand: false,
        builder: (_, scroll) => ListView(
          controller: scroll,
          padding: const EdgeInsets.all(16),
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                  color: Colors.grey.shade300,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.primaryDark,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                children: [
                  const Text('Total Tagihan',
                      style: TextStyle(color: Colors.white70, fontSize: 11)),
                  Text('Rp ${formatPosUnitPrice(widget.total)}',
                      style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                          fontSize: 24)),
                ],
              ),
            ),
            const SizedBox(height: 16),
            const Text('METODE',
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
            const SizedBox(height: 6),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: _methods.map((m) {
                final sel = _metode == m.$1;
                return ChoiceChip(
                  label: Text(m.$2,
                      style: TextStyle(
                          fontSize: 12,
                          color: sel ? Colors.white : AppColors.primaryDark)),
                  selected: sel,
                  selectedColor: AppColors.primary,
                  onSelected: (_) => setState(() {
                    _metode = m.$1;
                    _error = null;
                  }),
                );
              }).toList(),
            ),
            const SizedBox(height: 16),
            if (_metode != 'NET30') ...[
              const Text('BAYAR',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
              const SizedBox(height: 6),
              TextField(
                controller: _bayarCtrl,
                keyboardType: TextInputType.number,
                textAlign: TextAlign.right,
                decoration: const InputDecoration(
                    prefixText: 'Rp ', isDense: true),
                onChanged: (_) => setState(() => _error = null),
              ),
              const SizedBox(height: 8),
              if (_kembalian > 0)
                _row('Kembalian', _kembalian, AppColors.success),
              if (_kurang > 0) _row('Kurang', _kurang, AppColors.error),
            ],
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(_error!,
                    style:
                        const TextStyle(color: AppColors.error, fontSize: 12)),
              ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.success),
                icon: const Icon(Icons.check),
                label: const Text('Proses Transaksi'),
                onPressed: _process,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _row(String label, double value, Color color) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(color: color, fontSize: 13)),
          Text('Rp ${formatPosUnitPrice(value)}',
              style: TextStyle(
                  color: color, fontWeight: FontWeight.bold, fontSize: 13)),
        ],
      ),
    );
  }
}
