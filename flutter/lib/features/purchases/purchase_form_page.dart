import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gemiprint/core/theme/app_theme.dart';
import 'package:gemiprint/models/vendor.dart';
import 'package:gemiprint/providers/providers.dart';
import 'package:gemiprint/services/api_client.dart';
import 'package:gemiprint/widgets/snackbar_helper.dart';
import 'package:intl/intl.dart';

class _LineItem {
  String? barangId;
  String? barangNama;
  double qty = 1;
  double hargaBeli = 0;
  double? panjang;
  double? lebar;
}

class PurchaseFormPage extends ConsumerStatefulWidget {
  const PurchaseFormPage({super.key});
  @override
  ConsumerState<PurchaseFormPage> createState() => _PurchaseFormPageState();
}

class _PurchaseFormPageState extends ConsumerState<PurchaseFormPage> {
  final _formKey = GlobalKey<FormState>();
  Vendor? _selectedVendor;
  List<Vendor> _vendors = [];
  final List<_LineItem> _lines = [];
  String _metode = 'CASH';
  double _dibayar = 0;
  bool _isSaving = false;
  bool _isLoading = true;
  final _currencyFmt = NumberFormat.currency(locale: 'id_ID', symbol: 'Rp ', decimalDigits: 0);

  @override
  void initState() { super.initState(); _loadVendors(); }

  Future<void> _loadVendors() async {
    try {
      final data = await ref.read(vendorsServiceProvider).getAll();
      if (mounted) setState(() { _vendors = data; _isLoading = false; });
    } catch (_) { if (mounted) setState(() => _isLoading = false); }
  }

  double get _total => _lines.fold(0, (s, l) => s + (l.qty * l.hargaBeli));
  double get _sisa => _total - _dibayar;

  Future<void> _save() async {
    if (_selectedVendor == null) { showErrorSnackbar(context, 'Pilih vendor'); return; }
    if (_lines.isEmpty) { showErrorSnackbar(context, 'Tambahkan minimal 1 item'); return; }
    setState(() => _isSaving = true);
    try {
      await ref.read(purchasesServiceProvider).create({
        'vendor_id': _selectedVendor!.id,
        'metode_pembayaran': _metode,
        'total_harga': _total,
        'jumlah_dibayar': _dibayar,
        'items': _lines.map((l) => {
          'barang_id': l.barangId ?? '',
          'barang_nama': l.barangNama ?? '',
          'quantity': l.qty,
          'harga_satuan': l.hargaBeli,
          if (l.panjang != null) 'panjang': l.panjang,
          if (l.lebar != null) 'lebar': l.lebar,
        }).toList(),
      });
      if (mounted) { showSuccessSnackbar(context, 'Pembelian berhasil'); Navigator.of(context).pop(true); }
    } on ApiException catch (e) { if (mounted) { setState(() => _isSaving = false); showErrorSnackbar(context, e.message); } }
    catch (_) { if (mounted) { setState(() => _isSaving = false); showErrorSnackbar(context, 'Gagal menyimpan pembelian'); } }
  }

  Future<void> _pickVendor() async {
    String filter = '';
    final picked = await showModalBottomSheet<Vendor?>(
      context: context, isScrollControlled: true, useSafeArea: true,
      builder: (ctx) => StatefulBuilder(builder: (ctx, setSheetState) => Container(
        decoration: const BoxDecoration(color: Colors.white, borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
        child: Column(children: [
          Padding(padding: const EdgeInsets.fromLTRB(16, 16, 16, 8), child: TextField(
            decoration: InputDecoration(hintText: 'Cari vendor...', prefixIcon: const Icon(Icons.search, size: 20),
              filled: true, fillColor: Colors.grey.shade100, border: OutlineInputBorder(borderRadius: BorderRadius.circular(28), borderSide: BorderSide.none)),
            onChanged: (v) => setSheetState(() => filter = v.toLowerCase()),
          )),
          Expanded(child: ListView.builder(
            itemCount: _vendors.where((v) => filter.isEmpty || v.namaPerusahaan.toLowerCase().contains(filter)).length,
            itemBuilder: (_, i) {
              final filtered = _vendors.where((v) => filter.isEmpty || v.namaPerusahaan.toLowerCase().contains(filter)).toList();
              final v = filtered[i];
              return ListTile(title: Text(v.namaPerusahaan), subtitle: Text(v.tipeVendor == 'SUPPLIER' ? 'Supplier' : v.tipeVendor), onTap: () => Navigator.pop(ctx, v));
            },
          )),
        ]),
      )),
    );
    if (picked != null) setState(() => _selectedVendor = picked);
  }

  void _addLine() => setState(() => _lines.add(_LineItem()));
  void _removeLine(int i) => setState(() => _lines.removeAt(i));

  @override
  Widget build(BuildContext context) {
    if (_isLoading) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    return Scaffold(
      appBar: AppBar(title: const Text('Pembelian Baru'), actions: [
        TextButton(onPressed: _isSaving ? null : _save, child: _isSaving ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Text('Simpan', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600))),
      ]),
      body: Form(key: _formKey, child: ListView(padding: const EdgeInsets.all(16), children: [
        Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Vendor', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
          const SizedBox(height: 8),
          InkWell(onTap: _pickVendor, child: Container(
            width: double.infinity, padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(border: Border.all(color: Colors.grey.shade300), borderRadius: BorderRadius.circular(10)),
            child: Text(_selectedVendor?.namaPerusahaan ?? 'Pilih vendor...', style: TextStyle(color: _selectedVendor != null ? Colors.black : Colors.grey.shade500, fontSize: 14)),
          )),
        ]))),
        const SizedBox(height: 12),
        Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const Expanded(child: Text('Item Pembelian', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15))),
            TextButton.icon(onPressed: _addLine, icon: const Icon(Icons.add, size: 18), label: const Text('Tambah')),
          ]),
          if (_lines.isEmpty) Padding(padding: const EdgeInsets.symmetric(vertical: 20), child: Center(child: Text('Belum ada item', style: TextStyle(color: Colors.grey.shade500)))),
          ..._lines.asMap().entries.map((e) {
            final i = e.key; final l = e.value;
            return Card(margin: const EdgeInsets.only(bottom: 8), child: Padding(padding: const EdgeInsets.all(10), child: Column(children: [
              Row(children: [
                Expanded(child: TextFormField(decoration: const InputDecoration(labelText: 'Nama Barang', isDense: true), initialValue: l.barangNama, onChanged: (v) => l.barangNama = v)),
                IconButton(icon: const Icon(Icons.close, size: 18), onPressed: () => _removeLine(i)),
              ]),
              const SizedBox(height: 8),
              Row(children: [
                Expanded(child: TextFormField(decoration: const InputDecoration(labelText: 'Qty', isDense: true), keyboardType: TextInputType.number, initialValue: l.qty.toString(), onChanged: (v) => l.qty = double.tryParse(v) ?? 0)),
                const SizedBox(width: 8),
                Expanded(child: TextFormField(decoration: const InputDecoration(labelText: 'Harga Beli', isDense: true, prefixText: 'Rp'), keyboardType: TextInputType.number, initialValue: l.hargaBeli > 0 ? l.hargaBeli.toString() : '', onChanged: (v) => l.hargaBeli = double.tryParse(v) ?? 0)),
              ]),
              const SizedBox(height: 8),
              Row(children: [
                Expanded(child: TextFormField(decoration: const InputDecoration(labelText: 'Panjang (m)', isDense: true), keyboardType: TextInputType.number, onChanged: (v) => l.panjang = double.tryParse(v))),
                const SizedBox(width: 8),
                Expanded(child: TextFormField(decoration: const InputDecoration(labelText: 'Lebar (m)', isDense: true), keyboardType: TextInputType.number, onChanged: (v) => l.lebar = double.tryParse(v))),
              ]),
            ])));
          }),
          if (_lines.isNotEmpty) ...[const Divider(), Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            const Text('Total', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
            Text(_currencyFmt.format(_total), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: AppColors.primary)),
          ])],
        ]))),
        const SizedBox(height: 12),
        Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Pembayaran', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
          const SizedBox(height: 8),
          SegmentedButton<String>(segments: const [
            ButtonSegment(value: 'CASH', label: Text('Tunai')),
            ButtonSegment(value: 'TRANSFER', label: Text('Transfer')),
            ButtonSegment(value: 'NET30', label: Text('NET30')),
          ], selected: {_metode}, onSelectionChanged: (v) => setState(() => _metode = v.first), showSelectedIcon: false),
          const SizedBox(height: 8),
          TextFormField(decoration: const InputDecoration(labelText: 'Jumlah Dibayar', prefixText: 'Rp'), keyboardType: TextInputType.number, initialValue: _dibayar > 0 ? _dibayar.toString() : '', onChanged: (v) => setState(() => _dibayar = double.tryParse(v) ?? 0)),
          if (_metode == 'NET30' && _sisa > 0) Padding(padding: const EdgeInsets.only(top: 8), child: Text('Sisa hutang: ${_currencyFmt.format(_sisa)}', style: TextStyle(color: AppColors.error, fontSize: 12))),
        ]))),
        const SizedBox(height: 80),
      ])),
      bottomNavigationBar: SafeArea(child: Padding(padding: const EdgeInsets.all(16), child: SizedBox(width: double.infinity, child: FilledButton(onPressed: _isSaving ? null : _save, child: _isSaving ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Text('Simpan Pembelian'))))),
    );
  }
}
