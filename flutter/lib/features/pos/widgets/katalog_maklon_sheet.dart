import 'package:flutter/material.dart';
import 'package:gemiprint/core/theme/app_theme.dart';
import 'package:gemiprint/features/pos/models/cart_item.dart';
import 'package:gemiprint/features/pos/models/katalog_maklon.dart';
import 'package:gemiprint/features/pos/models/subkontraktor_option.dart';
import 'package:gemiprint/features/pos/pos_calc.dart';

/// Sheet untuk memilih/mengonfigurasi item katalog maklon existing sebelum
/// dimasukkan ke keranjang. Sheet ini tidak membuat atau mengubah katalog;
/// katalog tetap dikelola di web app.
Future<CartItem?> showKatalogMaklonSheet(
  BuildContext context, {
  required KatalogMaklon katalog,
  required List<SubkontraktorOption> subkontraktor,
}) {
  return showModalBottomSheet<CartItem?>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) => _KatalogMaklonBody(
      katalog: katalog,
      subkontraktor: subkontraktor,
    ),
  );
}

class _KatalogMaklonBody extends StatefulWidget {
  final KatalogMaklon katalog;
  final List<SubkontraktorOption> subkontraktor;
  const _KatalogMaklonBody({
    required this.katalog,
    required this.subkontraktor,
  });

  @override
  State<_KatalogMaklonBody> createState() => _KatalogMaklonBodyState();
}

class _KatalogMaklonBodyState extends State<_KatalogMaklonBody> {
  final _qtyCtrl = TextEditingController(text: '1');
  final _lebarCtrl = TextEditingController();
  final _panjangCtrl = TextEditingController();
  final _hargaCtrl = TextEditingController();
  String? _error;

  KatalogMaklon get katalog => widget.katalog;

  @override
  void initState() {
    super.initState();
    _hargaCtrl.text = katalog.hargaJualDefault.toStringAsFixed(0);
  }

  @override
  void dispose() {
    _qtyCtrl.dispose();
    _lebarCtrl.dispose();
    _panjangCtrl.dispose();
    _hargaCtrl.dispose();
    super.dispose();
  }

  ({double qty, double lebar, double panjang, double jumlah, double harga})?
      _compute() {
    final qty = double.tryParse(_qtyCtrl.text) ?? 0;
    if (qty <= 0) return null;
    final harga = double.tryParse(_hargaCtrl.text) ?? 0;
    if (harga <= 0) return null;

    if (katalog.butuhDimensi) {
      final lebar = double.tryParse(_lebarCtrl.text.replaceAll(',', '.'));
      final panjang = double.tryParse(_panjangCtrl.text.replaceAll(',', '.'));
      if (lebar == null ||
          panjang == null ||
          lebar <= 0 ||
          panjang <= 0) {
        return null;
      }
      return (
        qty: qty,
        lebar: lebar,
        panjang: panjang,
        jumlah: lebar * panjang * qty,
        harga: harga,
      );
    }

    return (
      qty: qty,
      lebar: 0,
      panjang: 0,
      jumlah: qty,
      harga: harga,
    );
  }

  void _submit() {
    final c = _compute();
    if (c == null) {
      setState(() => _error = katalog.butuhDimensi
          ? 'Masukkan qty, lebar, panjang, dan harga jual yang valid'
          : 'Masukkan qty dan harga jual yang valid');
      return;
    }

    String? vendorName;
    if (katalog.hasCompleteVendorHpp) {
      for (final v in widget.subkontraktor) {
        if (v.id == katalog.vendorSubkontrakIdDefault) {
          vendorName = v.namaPerusahaan;
          break;
        }
      }
    }

    Navigator.pop(
      context,
      CartItem(
        barangId: kIdBarangPlaceholderMaklon,
        barangNama: katalog.namaProduk,
        hargaSatuanId: kIdHargaPlaceholderMaklon,
        namaSatuan: katalog.namaSatuan,
        namaProdukJual: katalog.namaProduk,
        faktorKonversi: 1,
        hargaSatuan: c.harga,
        originalHargaSatuan: katalog.hargaJualDefault,
        butuhDimensi: katalog.butuhDimensi,
        panjang: katalog.butuhDimensi ? c.panjang : null,
        lebar: katalog.butuhDimensi ? c.lebar : null,
        jumlahRoll: katalog.butuhDimensi ? c.qty : null,
        jumlah: c.jumlah,
        tipeItem: 'MAKLON',
        vendorSubkontrakId:
            katalog.hasCompleteVendorHpp ? katalog.vendorSubkontrakIdDefault : null,
        vendorSubkontrakNama:
            katalog.hasCompleteVendorHpp ? vendorName : null,
        biayaSubkontrak:
            katalog.hasCompleteVendorHpp ? katalog.biayaSubkontrakDefault : null,
        metodeBayarVendor:
            katalog.hasCompleteVendorHpp ? katalog.metodeBayarVendorDefault : null,
        deskripsiPekerjaan: katalog.namaProduk,
        katalogMaklonId: katalog.id,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final computed = _compute();
    final subtotal = computed != null ? computed.jumlah * computed.harga : 0.0;
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
                    Text(
                      katalog.namaProduk,
                      style: const TextStyle(
                          fontSize: 17, fontWeight: FontWeight.bold),
                    ),
                    if (!katalog.hasCompleteVendorHpp)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(
                          'Pending vendor/HPP',
                          style: TextStyle(
                              fontSize: 11, color: Colors.orange.shade700),
                        ),
                      ),
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
                  _numField(_qtyCtrl, 'Jumlah'),
                  const SizedBox(height: 12),
                  if (katalog.butuhDimensi) ...[
                    const Text(
                      'UKURAN (Lebar × Panjang, m)',
                      style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        Expanded(child: _numField(_lebarCtrl, 'Lebar')),
                        const Padding(
                          padding: EdgeInsets.symmetric(horizontal: 8),
                          child: Text('×'),
                        ),
                        Expanded(child: _numField(_panjangCtrl, 'Panjang')),
                      ],
                    ),
                    const SizedBox(height: 12),
                  ],
                  _numField(_hargaCtrl, 'Harga jual'),
                  const SizedBox(height: 16),
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
                  const SizedBox(height: 12),
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

  Widget _numField(TextEditingController ctrl, String label) {
    return TextField(
      controller: ctrl,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      decoration: InputDecoration(labelText: label, isDense: true),
      onChanged: (_) => setState(() => _error = null),
    );
  }
}
