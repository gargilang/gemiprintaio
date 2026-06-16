import 'package:flutter/material.dart';
import 'package:gemiprint/core/theme/app_theme.dart';
import 'package:gemiprint/features/pos/models/cart_item.dart';
import 'package:gemiprint/features/pos/pos_calc.dart';

class BiayaTambahan {
  String label;
  double nominal;
  BiayaTambahan({required this.label, required this.nominal});
  Map<String, dynamic> toJson() => {'label': label, 'nominal': nominal};
}

/// Sheet keranjang. Semua mutasi state dilakukan lewat callback ke halaman,
/// dan halaman memanggil setState lalu sheet (StatefulBuilder di pemanggil)
/// rebuild. Untuk kesederhanaan, sheet ini menerima snapshot + callback dan
/// menutup dirinya saat Penawaran/Bayar ditekan.
class CartSheet extends StatefulWidget {
  final List<CartItem> cart;
  final bool roundCartPrices;
  final List<BiayaTambahan> biayaTambahan;
  final ValueChanged<bool> onToggleRounding;
  final void Function(int index) onRemoveLine;
  final void Function(int index, double newPrice) onOverridePrice;
  final void Function(int index) onResetPrice;
  final void Function(int index) onEditFinishing;
  final VoidCallback onAddBiaya;
  final void Function(int index) onRemoveBiaya;
  final VoidCallback onPenawaran;
  final VoidCallback onBayar;

  const CartSheet({
    super.key,
    required this.cart,
    required this.roundCartPrices,
    required this.biayaTambahan,
    required this.onToggleRounding,
    required this.onRemoveLine,
    required this.onOverridePrice,
    required this.onResetPrice,
    required this.onEditFinishing,
    required this.onAddBiaya,
    required this.onRemoveBiaya,
    required this.onPenawaran,
    required this.onBayar,
  });

  @override
  State<CartSheet> createState() => _CartSheetState();
}

class _CartSheetState extends State<CartSheet> {
  late bool _round = widget.roundCartPrices;

  double get _biayaTotal =>
      widget.biayaTambahan.fold<double>(0, (s, b) => s + b.nominal);

  double get _total =>
      getCartChargeTotal(
        widget.cart.map((c) => c.subtotalRaw).toList(),
        _round,
      ) +
      _biayaTotal;

  Future<void> _editPrice(int index) async {
    final item = widget.cart[index];
    final ctrl = TextEditingController(
      text: item.hargaSatuan.toStringAsFixed(0),
    );
    final result = await showDialog<double>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Ubah Harga Satuan'),
        content: TextField(
          controller: ctrl,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(prefixText: 'Rp '),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Batal'),
          ),
          if (item.isOverride)
            TextButton(
              onPressed: () => Navigator.pop(ctx, -1.0),
              child: const Text('Reset'),
            ),
          ElevatedButton(
            onPressed: () => Navigator.pop(
              ctx,
              double.tryParse(ctrl.text) ?? item.hargaSatuan,
            ),
            child: const Text('Simpan'),
          ),
        ],
      ),
    );
    if (result == null) return;
    if (result < 0) {
      widget.onResetPrice(index);
    } else {
      widget.onOverridePrice(index, result);
    }
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.9,
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
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                const Text(
                  'Keranjang',
                  style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
                ),
                const Spacer(),
                Text(
                  '${widget.cart.length} item',
                  style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          const Divider(height: 1),
          Expanded(
            child: ListView(
              controller: scroll,
              padding: const EdgeInsets.all(12),
              children: [
                ...List.generate(widget.cart.length, (i) => _line(i)),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Checkbox(
                      value: _round,
                      activeColor: AppColors.primary,
                      onChanged: (v) {
                        setState(() => _round = v ?? true);
                        widget.onToggleRounding(_round);
                      },
                    ),
                    const Expanded(
                      child: Text(
                        'Bulatkan total (Rp 1.000)',
                        style: TextStyle(fontSize: 13),
                      ),
                    ),
                  ],
                ),
                ...widget.biayaTambahan.asMap().entries.map(
                  (e) => Padding(
                    padding: const EdgeInsets.symmetric(vertical: 2),
                    child: Row(
                      children: [
                        Expanded(child: Text(e.value.label)),
                        Text('Rp ${formatPosUnitPrice(e.value.nominal)}'),
                        IconButton(
                          icon: const Icon(Icons.close, size: 16),
                          onPressed: () {
                            widget.onRemoveBiaya(e.key);
                            setState(() {});
                          },
                        ),
                      ],
                    ),
                  ),
                ),
                TextButton.icon(
                  icon: const Icon(Icons.add, size: 16),
                  label: const Text('Biaya tambahan (ongkir…)'),
                  onPressed: () {
                    widget.onAddBiaya();
                    setState(() {});
                  },
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border(top: BorderSide(color: Colors.grey.shade200)),
            ),
            child: SafeArea(
              top: false,
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'TOTAL',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 15,
                        ),
                      ),
                      Text(
                        'Rp ${formatPosUnitPrice(_total)}',
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                          color: AppColors.primary,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          icon: const Icon(Icons.description_outlined),
                          label: const Text('Penawaran'),
                          onPressed: widget.cart.isEmpty
                              ? null
                              : widget.onPenawaran,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: ElevatedButton(
                          onPressed: widget.cart.isEmpty
                              ? null
                              : widget.onBayar,
                          child: const Text('Bayar'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _line(int i) {
    final item = widget.cart[i];
    final detail = item.isMaklon
        ? 'Subkontrak${item.vendorSubkontrakNama != null ? ' · ${item.vendorSubkontrakNama}' : ''}'
        : (item.billedPanjang != null
              ? formatRollCartDetailLine(
                  billedPanjang: item.billedPanjang,
                  billedLebar: item.billedLebar,
                  selectedRollSize: item.selectedRollSize,
                  jumlah: item.jumlah,
                  hargaSatuan: item.hargaSatuan,
                )
              : '${item.jumlah.toStringAsFixed(item.butuhDimensi ? 2 : 0)} ${item.namaSatuan} @ Rp ${formatPosUnitPrice(item.hargaSatuan)}');
    return Card(
      margin: const EdgeInsets.only(bottom: 6),
      child: Padding(
        padding: const EdgeInsets.all(8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    item.barangNama,
                    style: const TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 13,
                    ),
                  ),
                ),
                Text(
                  'Rp ${formatPosUnitPrice(item.subtotalRaw)}',
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 13,
                  ),
                ),
                GestureDetector(
                  onTap: () {
                    widget.onRemoveLine(i);
                    setState(() {});
                  },
                  child: const Padding(
                    padding: EdgeInsets.only(left: 6),
                    child: Icon(Icons.close, size: 16, color: Colors.grey),
                  ),
                ),
              ],
            ),
            if (detail.isNotEmpty)
              Text(
                detail,
                style: TextStyle(fontSize: 10, color: Colors.grey.shade600),
              ),
            if (item.isOverride)
              Text(
                'Override dari Rp ${formatPosUnitPrice(item.originalHargaSatuan)}',
                style: const TextStyle(fontSize: 10, color: AppColors.success),
              ),
            if (item.finishing.isNotEmpty)
              Text(
                'Finishing: ${item.finishing.map((f) => f.jenisFinishing).join(', ')}',
                style: TextStyle(fontSize: 10, color: Colors.purple.shade400),
              ),
            const SizedBox(height: 4),
            Row(
              children: [
                _chipBtn(Icons.edit, 'Harga', () => _editPrice(i)),
                const SizedBox(width: 6),
                if (!item.isMaklon)
                  _chipBtn(Icons.add, 'Finishing', () {
                    widget.onEditFinishing(i);
                  }),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _chipBtn(IconData icon, String label, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: Colors.grey.shade100,
          borderRadius: BorderRadius.circular(6),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 12),
            const SizedBox(width: 4),
            Text(label, style: const TextStyle(fontSize: 11)),
          ],
        ),
      ),
    );
  }
}
