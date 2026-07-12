import 'package:flutter/material.dart';
import 'package:gemiprint/core/theme/app_theme.dart';
import 'package:gemiprint/features/pos/models/cart_item.dart';
import 'package:gemiprint/features/pos/models/subkontraktor_option.dart';
import 'package:gemiprint/features/pos/pos_calc.dart';

Future<List<CartItem>?> showMaklonFormSheet(
  BuildContext context, {
  required List<SubkontraktorOption> subkontraktor,
}) {
  return showModalBottomSheet<List<CartItem>>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) => _MaklonBody(subkontraktor: subkontraktor),
  );
}

class _Line {
  final deskripsi = TextEditingController();
  final satuan = TextEditingController(text: 'pcs');
  final jumlah = TextEditingController(text: '1');
  final harga = TextEditingController();
  final biaya = TextEditingController();
  void dispose() {
    deskripsi.dispose();
    satuan.dispose();
    jumlah.dispose();
    harga.dispose();
    biaya.dispose();
  }
}

class _MaklonBody extends StatefulWidget {
  final List<SubkontraktorOption> subkontraktor;
  const _MaklonBody({required this.subkontraktor});

  @override
  State<_MaklonBody> createState() => _MaklonBodyState();
}

class _MaklonBodyState extends State<_MaklonBody> {
  String? _vendorId;
  String _metode = 'CASH';
  final List<_Line> _lines = [_Line()];
  String? _error;
  bool _submitting = false;

  @override
  void dispose() {
    for (final l in _lines) {
      l.dispose();
    }
    super.dispose();
  }

  void _submit() {
    if (_submitting) return;
    if (_vendorId == null || _vendorId!.isEmpty) {
      setState(() => _error = 'Vendor subkontraktor wajib dipilih');
      return;
    }
    final vendor = widget.subkontraktor.firstWhere((v) => v.id == _vendorId);
    final items = <CartItem>[];
    for (var i = 0; i < _lines.length; i++) {
      final l = _lines[i];
      final desk = l.deskripsi.text.trim();
      final jumlah = double.tryParse(l.jumlah.text) ?? 0;
      final harga = double.tryParse(l.harga.text) ?? 0;
      final biaya = double.tryParse(l.biaya.text) ?? 0;
      if (desk.isEmpty) {
        setState(() => _error = 'Baris ${i + 1}: deskripsi wajib diisi');
        return;
      }
      if (jumlah <= 0 || harga <= 0 || biaya <= 0) {
        setState(() => _error =
            'Baris ${i + 1}: jumlah, harga jual, & biaya vendor harus > 0');
        return;
      }
      items.add(CartItem(
        barangId: kIdBarangPlaceholderMaklon,
        barangNama: desk,
        hargaSatuanId: kIdHargaPlaceholderMaklon,
        namaSatuan: l.satuan.text.trim().isEmpty ? 'pcs' : l.satuan.text.trim(),
        faktorKonversi: 1,
        hargaSatuan: harga,
        originalHargaSatuan: harga,
        butuhDimensi: false,
        jumlah: jumlah,
        tipeItem: 'MAKLON',
        vendorSubkontrakId: vendor.id,
        vendorSubkontrakNama: vendor.namaPerusahaan,
        biayaSubkontrak: biaya,
        metodeBayarVendor: _metode,
        deskripsiPekerjaan: desk,
      ));
    }
    _submitting = true;
    Navigator.pop(context, items);
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
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
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 16),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text('Pekerjaan Maklon',
                    style:
                        TextStyle(fontSize: 17, fontWeight: FontWeight.bold)),
              ),
            ),
            const SizedBox(height: 8),
            const Divider(height: 1),
            Expanded(
              child: ListView(
                controller: scroll,
                padding: const EdgeInsets.all(16),
                children: [
                  DropdownButtonFormField<String>(
                    initialValue: _vendorId,
                    hint: const Text('Pilih vendor *'),
                    isExpanded: true,
                    decoration: const InputDecoration(
                        labelText: 'Vendor *', isDense: true),
                    items: widget.subkontraktor
                        .map((v) => DropdownMenuItem(
                              value: v.id,
                              child: Text(v.namaPerusahaan,
                                  overflow: TextOverflow.ellipsis),
                            ))
                        .toList(),
                    onChanged: (v) => setState(() => _vendorId = v),
                  ),
                  if (widget.subkontraktor.isEmpty)
                    const Padding(
                      padding: EdgeInsets.only(top: 4),
                      child: Text(
                        'Belum ada vendor Subkontraktor. Tambahkan di halaman Vendor.',
                        style: TextStyle(
                            fontSize: 11, color: AppColors.error),
                      ),
                    ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      const Text('Bayar vendor: ',
                          style: TextStyle(fontSize: 13)),
                      ChoiceChip(
                        label: const Text('CASH', style: TextStyle(fontSize: 11)),
                        selected: _metode == 'CASH',
                        onSelected: (_) => setState(() => _metode = 'CASH'),
                      ),
                      const SizedBox(width: 6),
                      ChoiceChip(
                        label: const Text('NET30', style: TextStyle(fontSize: 11)),
                        selected: _metode == 'NET30',
                        onSelected: (_) => setState(() => _metode = 'NET30'),
                      ),
                      const SizedBox(width: 6),
                      ChoiceChip(
                        label: const Text('TRANSFER', style: TextStyle(fontSize: 11)),
                        selected: _metode == 'TRANSFER',
                        onSelected: (_) => setState(() => _metode = 'TRANSFER'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  ..._lines.asMap().entries.map((e) => _lineCard(e.key)),
                  TextButton.icon(
                    icon: const Icon(Icons.add),
                    label: const Text('Tambah Baris'),
                    onPressed: () => setState(() => _lines.add(_Line())),
                  ),
                  if (_error != null)
                    Text(_error!,
                        style: const TextStyle(
                            color: AppColors.error, fontSize: 12)),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              child: SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _submitting ? null : _submit,
                  child: Text(_submitting ? 'Menyimpan...' : 'Tambah ke Keranjang'),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _lineCard(int idx) {
    final l = _lines[idx];
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Column(
          children: [
            Row(
              children: [
                Text('Item #${idx + 1}',
                    style: const TextStyle(
                        fontSize: 11, fontWeight: FontWeight.w700)),
                const Spacer(),
                if (_lines.length > 1)
                  GestureDetector(
                    onTap: () => setState(() {
                      _lines[idx].dispose();
                      _lines.removeAt(idx);
                    }),
                    child: const Text('Hapus',
                        style: TextStyle(
                            color: AppColors.error, fontSize: 12)),
                  ),
              ],
            ),
            TextField(
              controller: l.deskripsi,
              decoration: const InputDecoration(
                  labelText: 'Deskripsi pekerjaan *', isDense: true),
              onChanged: (_) => setState(() => _error = null),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(child: _num(l.jumlah, 'Jumlah')),
                const SizedBox(width: 8),
                Expanded(child: _text(l.satuan, 'Satuan')),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(child: _num(l.harga, 'Harga jual')),
                const SizedBox(width: 8),
                Expanded(child: _num(l.biaya, 'Biaya vendor')),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _num(TextEditingController c, String label) => TextField(
        controller: c,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        decoration: InputDecoration(labelText: label, isDense: true),
        onChanged: (_) => setState(() => _error = null),
      );

  Widget _text(TextEditingController c, String label) => TextField(
        controller: c,
        decoration: InputDecoration(labelText: label, isDense: true),
      );
}
