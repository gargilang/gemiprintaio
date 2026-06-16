import 'package:flutter/material.dart';
import 'package:gemiprint/core/theme/app_theme.dart';
import 'package:gemiprint/features/pos/models/cart_item.dart';
import 'package:gemiprint/features/pos/models/finishing_option.dart';
import 'package:gemiprint/features/pos/pos_calc.dart';
import 'package:gemiprint/models/material_item.dart';

/// Sheet konfigurasi item: satuan/harga, dimensi (Lebar × Panjang),
/// pembulatan roll, finishing. Mengembalikan [CartItem] atau null.
Future<CartItem?> showAddItemSheet(
  BuildContext context, {
  required MaterialItem material,
  required bool isMember,
  required List<FinishingOption> finishingOptions,
}) {
  if (material.harga.isEmpty) {
    return Future.value(null);
  }
  return showModalBottomSheet<CartItem>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) => _AddItemBody(
      material: material,
      isMember: isMember,
      finishingOptions: finishingOptions,
    ),
  );
}

class _AddItemBody extends StatefulWidget {
  final MaterialItem material;
  final bool isMember;
  final List<FinishingOption> finishingOptions;
  const _AddItemBody({
    required this.material,
    required this.isMember,
    required this.finishingOptions,
  });

  @override
  State<_AddItemBody> createState() => _AddItemBodyState();
}

class _AddItemBodyState extends State<_AddItemBody> {
  late MaterialPrice _price;
  final _qtyCtrl = TextEditingController(text: '1');
  final _lebarCtrl = TextEditingController();
  final _panjangCtrl = TextEditingController();
  bool _useRounding = true;
  double? _selectedRollSize;
  String? _error;

  @override
  void initState() {
    super.initState();
    _price = widget.material.harga.firstWhere(
      (p) => p.isDefault,
      orElse: () => widget.material.harga.first,
    );
  }

  @override
  void dispose() {
    _qtyCtrl.dispose();
    _lebarCtrl.dispose();
    _panjangCtrl.dispose();
    super.dispose();
  }

  bool get _dim => widget.material.dimensiRequired;
  double get _hargaSatuan => _price.hargaUntuk(isMember: widget.isMember);

  /// Sinkronkan [_selectedRollSize] dari input dimensi saat ini.
  ///
  /// Selalu hitung ulang roll TERMURAH setiap dimensi berubah. Jangan
  /// "sticky" pada pilihan lama: saat mengetik panjang digit demi digit
  /// (mis. 1.3×2.0 → 1.3×2.4) roll 2 m sempat terpilih dan tetap muat di
  /// 2.4, sehingga pilihan basi tidak pernah dihitung ulang ke 2.5 m yang
  /// sebenarnya lebih murah. Tap chip manual tetap menimpa nilai ini dan
  /// bertahan sampai dimensi diubah lagi (mirror efek recompute web).
  void _syncRollSuggestion() {
    if (!_dim) return;
    final lebar = double.tryParse(_lebarCtrl.text.replaceAll(',', '.'));
    final panjang = double.tryParse(_panjangCtrl.text.replaceAll(',', '.'));
    if (lebar != null && panjang != null && lebar > 0 && panjang > 0) {
      _selectedRollSize = suggestCheapestRollSize(panjang, lebar);
    } else {
      _selectedRollSize = null;
    }
  }

  /// Hitung jumlah (m² atau qty) + billed dims berdasarkan input saat ini.
  /// Mengembalikan null bila input invalid (caller menampilkan _error).
  ({double jumlah, double? billedP, double? billedL, double? rollSize})?
      _compute() {
    if (_dim) {
      final lebar = double.tryParse(_lebarCtrl.text.replaceAll(',', '.'));
      final panjang = double.tryParse(_panjangCtrl.text.replaceAll(',', '.'));
      if (lebar == null || panjang == null || lebar <= 0 || panjang <= 0) {
        return null;
      }
      if (_useRounding) {
        final roll = _selectedRollSize;
        if (roll == null ||
            !isRollSizeValidForDimensions(panjang, lebar, roll)) {
          return null;
        }
        final r = getRoundedDimensions(panjang, lebar, true, roll);
        return (
          jumlah: r.panjang * r.lebar,
          billedP: r.panjang,
          billedL: r.lebar,
          rollSize: r.rollSize,
        );
      }
      return (
        jumlah: panjang * lebar,
        billedP: null,
        billedL: null,
        rollSize: null,
      );
    }
    final qty = double.tryParse(_qtyCtrl.text);
    if (qty == null || qty <= 0) return null;
    return (
      jumlah: qty,
      billedP: null,
      billedL: null,
      rollSize: null,
    );
  }

  void _submit() {
    final c = _compute();
    if (c == null) {
      setState(() => _error = _dim
          ? (_useRounding
              ? 'Masukkan lebar & panjang valid dan pilih ukuran roll yang muat'
              : 'Masukkan lebar dan panjang yang valid')
          : 'Jumlah harus lebih dari 0');
      return;
    }
    final lebar = _dim
        ? double.tryParse(_lebarCtrl.text.replaceAll(',', '.'))
        : null;
    final panjang = _dim
        ? double.tryParse(_panjangCtrl.text.replaceAll(',', '.'))
        : null;
    Navigator.pop(
      context,
      CartItem(
        barangId: widget.material.id,
        barangNama: widget.material.nama,
        hargaSatuanId: _price.id,
        namaSatuan: _price.label,
        faktorKonversi: _price.faktorKonversi,
        hargaSatuan: _hargaSatuan,
        originalHargaSatuan: _hargaSatuan,
        butuhDimensi: _dim,
        jumlah: c.jumlah,
        panjang: panjang,
        lebar: lebar,
        useRounding: _dim && _useRounding,
        selectedRollSize: c.rollSize,
        billedPanjang: c.billedP,
        billedLebar: c.billedL,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final computed = _compute();
    final subtotal = computed != null ? computed.jumlah * _hargaSatuan : 0.0;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: DraggableScrollableSheet(
        initialChildSize: 0.75,
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
              child: Align(
                alignment: Alignment.centerLeft,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(widget.material.nama,
                        style: const TextStyle(
                            fontSize: 17, fontWeight: FontWeight.bold)),
                    if (widget.material.kategoriNama != null)
                      Text(widget.material.kategoriNama!,
                          style: TextStyle(
                              fontSize: 11, color: Colors.grey.shade600)),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
            const Divider(height: 1),
            Expanded(
              child: ListView(
                controller: scroll,
                padding: const EdgeInsets.all(16),
                children: [
                  const Text('SATUAN',
                      style: TextStyle(
                          fontSize: 11, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 6,
                    children: widget.material.harga.map((p) {
                      final sel = p.id == _price.id;
                      return ChoiceChip(
                        label: Text(
                          '${p.label} · ${formatPosUnitPrice(p.hargaUntuk(isMember: widget.isMember))}',
                          style: TextStyle(
                              fontSize: 11,
                              color: sel
                                  ? Colors.white
                                  : AppColors.primaryDark),
                        ),
                        selected: sel,
                        selectedColor: AppColors.primary,
                        onSelected: (_) => setState(() => _price = p),
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 16),
                  if (_dim) ...[
                    const Text('UKURAN (Lebar × Panjang, m)',
                        style: TextStyle(
                            fontSize: 11, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        Expanded(
                            child: _numField(_lebarCtrl, 'Lebar',
                                onChanged: _syncRollSuggestion)),
                        const Padding(
                          padding: EdgeInsets.symmetric(horizontal: 8),
                          child: Text('×'),
                        ),
                        Expanded(
                            child: _numField(_panjangCtrl, 'Panjang',
                                onChanged: _syncRollSuggestion)),
                      ],
                    ),
                    const SizedBox(height: 12),
                    _rollBox(),
                  ] else ...[
                    const Text('JUMLAH',
                        style: TextStyle(
                            fontSize: 11, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 6),
                    _numField(_qtyCtrl, 'Jumlah'),
                  ],
                  const SizedBox(height: 16),
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Text(_error!,
                          style: const TextStyle(
                              color: AppColors.error, fontSize: 12)),
                    ),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppColors.primary.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Subtotal',
                            style: TextStyle(fontWeight: FontWeight.w600)),
                        Text('Rp ${formatPosUnitPrice(subtotal)}',
                            style: const TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 16,
                                color: AppColors.primary)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              child: SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  icon: const Icon(Icons.add_shopping_cart_rounded),
                  label: const Text('Tambah ke Keranjang'),
                  onPressed: _submit,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _numField(TextEditingController ctrl, String label,
      {VoidCallback? onChanged}) {
    return TextField(
      controller: ctrl,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      decoration: InputDecoration(labelText: label, isDense: true),
      onChanged: (_) {
        setState(() {
          _error = null;
          onChanged?.call();
        });
      },
    );
  }

  Widget _rollBox() {
    final lebar = double.tryParse(_lebarCtrl.text.replaceAll(',', '.'));
    final panjang = double.tryParse(_panjangCtrl.text.replaceAll(',', '.'));
    final canSuggest =
        lebar != null && panjang != null && lebar > 0 && panjang > 0;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.grey.shade50,
        border: Border.all(color: Colors.grey.shade200),
        borderRadius: BorderRadius.circular(9),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Checkbox(
                value: _useRounding,
                activeColor: AppColors.primary,
                onChanged: (v) => setState(() => _useRounding = v ?? true),
              ),
              const Text('Pakai pembulatan roll',
                  style:
                      TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
            ],
          ),
          if (_useRounding) ...[
            Wrap(
              spacing: 6,
              children: kDefaultRollSizes.map((size) {
                final valid = canSuggest &&
                    isRollSizeValidForDimensions(panjang, lebar, size);
                final sel = _selectedRollSize == size;
                return ChoiceChip(
                  label: Text(
                      '${size.toStringAsFixed(size == size.roundToDouble() ? 0 : 1)}m',
                      style: TextStyle(
                          fontSize: 11,
                          color: sel
                              ? Colors.white
                              : AppColors.primaryDark)),
                  selected: sel,
                  selectedColor: AppColors.primary,
                  onSelected: valid
                      ? (_) => setState(() => _selectedRollSize = size)
                      : null,
                );
              }).toList(),
            ),
            if (canSuggest && _selectedRollSize != null)
              Builder(builder: (_) {
                final r = getRoundedDimensions(
                    panjang, lebar, true, _selectedRollSize);
                final area = r.panjang * r.lebar;
                final printLen = getRollPrintLength(
                    r.panjang, r.lebar, _selectedRollSize!);
                return Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    'Ditagih ${printLen.toStringAsFixed(2)} × Roll '
                    '${_selectedRollSize!.toStringAsFixed(2)}m = '
                    '${area.toStringAsFixed(2)} m²',
                    style: const TextStyle(
                        fontSize: 11, color: AppColors.success),
                  ),
                );
              }),
          ],
        ],
      ),
    );
  }
}
