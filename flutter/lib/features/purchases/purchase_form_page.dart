import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gemiprint/core/theme/app_theme.dart';
import 'package:gemiprint/models/material_item.dart';
import 'package:gemiprint/models/vendor.dart';
import 'package:gemiprint/providers/providers.dart';
import 'package:gemiprint/services/api_client.dart';
import 'package:gemiprint/widgets/snackbar_helper.dart';
import 'package:intl/intl.dart';

/// Satu baris item pembelian. Terikat ke Barang dari Data Barang (bukan teks
/// bebas) supaya backend menerima barang_id yang valid + AVCO/ledger benar.
class _LineItem {
  MaterialItem? barang;
  MaterialPrice? satuan;
  final TextEditingController qty = TextEditingController(text: '1');
  final TextEditingController harga = TextEditingController();
  final TextEditingController panjang = TextEditingController();
  final TextEditingController lebar = TextEditingController();
  final TextEditingController jumlahRoll = TextEditingController(text: '1');

  bool get dimensiRequired => barang?.dimensiRequired ?? false;

  /// jumlah (m²) untuk barang dimensional = jumlah_roll × panjang × lebar.
  /// Untuk barang biasa = qty langsung.
  double get jumlah {
    if (dimensiRequired) {
      final roll = (int.tryParse(jumlahRoll.text) ?? 1).clamp(1, 1 << 31);
      final p = double.tryParse(panjang.text) ?? 0;
      final l = double.tryParse(lebar.text) ?? 0;
      return roll * p * l;
    }
    return double.tryParse(qty.text) ?? 0;
  }

  double get hargaSatuan => double.tryParse(harga.text) ?? 0;
  double get subtotal => jumlah * hargaSatuan;

  void dispose() {
    qty.dispose();
    harga.dispose();
    panjang.dispose();
    lebar.dispose();
    jumlahRoll.dispose();
  }
}

class PurchaseFormPage extends ConsumerStatefulWidget {
  const PurchaseFormPage({super.key});
  @override
  ConsumerState<PurchaseFormPage> createState() => _PurchaseFormPageState();
}

class _PurchaseFormPageState extends ConsumerState<PurchaseFormPage> {
  final _formKey = GlobalKey<FormState>();
  final _nomorFaktur = TextEditingController();
  Vendor? _selectedVendor;
  List<Vendor> _vendors = [];
  List<MaterialItem> _materials = [];
  final List<_LineItem> _lines = [];
  String _metode = 'CASH';
  bool _isSaving = false;
  bool _isLoading = true;
  final _currencyFmt = NumberFormat.currency(
    locale: 'id_ID',
    symbol: 'Rp ',
    decimalDigits: 0,
  );

  @override
  void initState() {
    super.initState();
    _loadRefs();
  }

  @override
  void dispose() {
    _nomorFaktur.dispose();
    for (final l in _lines) {
      l.dispose();
    }
    super.dispose();
  }

  Future<void> _loadRefs() async {
    try {
      final results = await Future.wait([
        ref.read(vendorsServiceProvider).getAll(),
        ref.read(materialsServiceProvider).getAll(),
      ]);
      if (mounted) {
        setState(() {
          _vendors = results[0] as List<Vendor>;
          _materials = results[1] as List<MaterialItem>;
          _isLoading = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() => _isLoading = false);
        showErrorSnackbar(context, 'Gagal memuat data vendor/barang');
      }
    }
  }

  double get _total => _lines.fold(0, (s, l) => s + l.subtotal);

  /// Pilih satuan bawaan: yang ditandai default → faktor 1 → pertama.
  MaterialPrice? _defaultUnit(MaterialItem m) {
    if (m.harga.isEmpty) return null;
    return m.harga.firstWhere(
      (u) => u.isDefault,
      orElse: () => m.harga.firstWhere(
        (u) => u.faktorKonversi == 1,
        orElse: () => m.harga.first,
      ),
    );
  }

  void _applyBarang(_LineItem line, MaterialItem m) {
    line.barang = m;
    final unit = _defaultUnit(m);
    line.satuan = unit;
    if (unit != null && unit.hargaBeli > 0) {
      line.harga.text = unit.hargaBeli.toStringAsFixed(0);
    }
    // Reset field dimensi/qty sesuai jenis barang.
    if (m.dimensiRequired) {
      line.qty.text = '0';
      line.jumlahRoll.text = '1';
      line.panjang.clear();
      line.lebar.clear();
    } else {
      line.qty.text = '1';
    }
  }

  Future<void> _save() async {
    if (_selectedVendor == null) {
      showErrorSnackbar(context, 'Pilih vendor');
      return;
    }
    if (_nomorFaktur.text.trim().isEmpty) {
      showErrorSnackbar(context, 'Nomor faktur harus diisi');
      return;
    }
    if (_lines.isEmpty) {
      showErrorSnackbar(context, 'Tambahkan minimal 1 item');
      return;
    }
    for (var i = 0; i < _lines.length; i++) {
      final l = _lines[i];
      if (l.barang == null) {
        showErrorSnackbar(context, 'Item #${i + 1}: pilih barang');
        return;
      }
      if (l.dimensiRequired) {
        final p = double.tryParse(l.panjang.text) ?? 0;
        final wide = double.tryParse(l.lebar.text) ?? 0;
        if (p <= 0 || wide <= 0) {
          showErrorSnackbar(
            context,
            'Item #${i + 1} (${l.barang!.nama}): isi lebar & panjang',
          );
          return;
        }
      }
      if (l.jumlah <= 0) {
        showErrorSnackbar(context, 'Item #${i + 1}: jumlah harus lebih dari 0');
        return;
      }
      if (l.hargaSatuan < 0) {
        showErrorSnackbar(context, 'Item #${i + 1}: harga tidak valid');
        return;
      }
    }

    setState(() => _isSaving = true);
    try {
      await ref.read(purchasesServiceProvider).create({
        'nomor_faktur': _nomorFaktur.text.trim(),
        'vendor_id': _selectedVendor!.id,
        'metode_pembayaran': _metode,
        'items': _lines.map((l) {
          final dim = l.dimensiRequired;
          return {
            'barang_id': l.barang!.id,
            'harga_satuan_id': l.satuan?.id,
            'nama_satuan': l.satuan?.label ?? '',
            'faktor_konversi': l.satuan?.faktorKonversi ?? 1,
            'jumlah': l.jumlah,
            'harga_satuan': l.hargaSatuan,
            'panjang': dim ? (double.tryParse(l.panjang.text) ?? 0) : null,
            'lebar': dim ? (double.tryParse(l.lebar.text) ?? 0) : null,
            'jumlah_roll': dim
                ? (int.tryParse(l.jumlahRoll.text) ?? 1).clamp(1, 1 << 31)
                : 1,
          };
        }).toList(),
      });
      if (mounted) {
        showSuccessSnackbar(context, 'Pembelian berhasil');
        Navigator.of(context).pop(true);
      }
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _isSaving = false);
        showErrorSnackbar(context, e.message);
      }
    } catch (_) {
      if (mounted) {
        setState(() => _isSaving = false);
        showErrorSnackbar(context, 'Gagal menyimpan pembelian');
      }
    }
  }

  Future<void> _pickVendor() async {
    final picked = await _pickFromSheet<Vendor>(
      title: 'Pilih Vendor',
      hint: 'Cari vendor...',
      items: _vendors,
      labelOf: (v) => v.namaPerusahaan,
      subtitleOf: (v) => v.tipeVendor == 'SUPPLIER' ? 'Supplier' : v.tipeVendor,
    );
    if (picked != null) setState(() => _selectedVendor = picked);
  }

  Future<void> _pickBarang(_LineItem line) async {
    if (_materials.isEmpty) {
      showErrorSnackbar(
        context,
        'Belum ada data barang. Tambahkan barang di halaman Data Barang.',
      );
      return;
    }
    final picked = await _pickFromSheet<MaterialItem>(
      title: 'Pilih Barang',
      hint: 'Cari barang...',
      items: _materials,
      labelOf: (m) => m.nama,
      subtitleOf: (m) {
        final parts = <String>[];
        if (m.kategoriNama != null) parts.add(m.kategoriNama!);
        if (m.dimensiRequired) parts.add('Roll/dimensi');
        return parts.join(' · ');
      },
    );
    if (picked != null) setState(() => _applyBarang(line, picked));
  }

  /// Bottom sheet generik dengan pencarian untuk memilih satu entitas.
  Future<T?> _pickFromSheet<T>({
    required String title,
    required String hint,
    required List<T> items,
    required String Function(T) labelOf,
    String Function(T)? subtitleOf,
  }) {
    String filter = '';
    return showModalBottomSheet<T?>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) {
          final filtered = items
              .where(
                (it) =>
                    filter.isEmpty ||
                    labelOf(it).toLowerCase().contains(filter),
              )
              .toList();
          return Container(
            decoration: const BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
            ),
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          title,
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.close),
                        onPressed: () => Navigator.pop(ctx),
                      ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                  child: TextField(
                    autofocus: true,
                    decoration: InputDecoration(
                      hintText: hint,
                      prefixIcon: const Icon(Icons.search, size: 20),
                      filled: true,
                      fillColor: Colors.grey.shade100,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(28),
                        borderSide: BorderSide.none,
                      ),
                    ),
                    onChanged: (v) =>
                        setSheetState(() => filter = v.toLowerCase()),
                  ),
                ),
                Expanded(
                  child: filtered.isEmpty
                      ? Center(
                          child: Text(
                            'Tidak ditemukan',
                            style: TextStyle(color: Colors.grey.shade500),
                          ),
                        )
                      : ListView.builder(
                          itemCount: filtered.length,
                          itemBuilder: (_, i) {
                            final it = filtered[i];
                            final sub = subtitleOf?.call(it);
                            return ListTile(
                              title: Text(labelOf(it)),
                              subtitle: (sub != null && sub.isNotEmpty)
                                  ? Text(sub)
                                  : null,
                              onTap: () => Navigator.pop(ctx, it),
                            );
                          },
                        ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  void _addLine() => setState(() => _lines.add(_LineItem()));
  void _removeLine(int i) => setState(() {
    _lines[i].dispose();
    _lines.removeAt(i);
  });

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    return Scaffold(
      appBar: AppBar(
        title: const Text('Pembelian Baru'),
        actions: [
          TextButton(
            onPressed: _isSaving ? null : _save,
            child: _isSaving
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Text(
                    'Simpan',
                    style: TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
          ),
        ],
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Vendor + Nomor Faktur
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Vendor',
                      style: TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 15,
                      ),
                    ),
                    const SizedBox(height: 8),
                    InkWell(
                      onTap: _pickVendor,
                      child: Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 12,
                        ),
                        decoration: BoxDecoration(
                          border: Border.all(color: Colors.grey.shade300),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          _selectedVendor?.namaPerusahaan ?? 'Pilih vendor...',
                          style: TextStyle(
                            color: _selectedVendor != null
                                ? Colors.black
                                : Colors.grey.shade500,
                            fontSize: 14,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _nomorFaktur,
                      decoration: const InputDecoration(
                        labelText: 'Nomor Faktur *',
                        hintText: 'Nomor faktur dari vendor',
                        isDense: true,
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            // Item pembelian
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Expanded(
                          child: Text(
                            'Item Pembelian',
                            style: TextStyle(
                              fontWeight: FontWeight.w600,
                              fontSize: 15,
                            ),
                          ),
                        ),
                        TextButton.icon(
                          onPressed: _addLine,
                          icon: const Icon(Icons.add, size: 18),
                          label: const Text('Tambah'),
                        ),
                      ],
                    ),
                    if (_lines.isEmpty)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 20),
                        child: Center(
                          child: Text(
                            'Belum ada item',
                            style: TextStyle(color: Colors.grey.shade500),
                          ),
                        ),
                      ),
                    ..._lines.asMap().entries.map(
                      (e) => _buildLineCard(e.key, e.value),
                    ),
                    if (_lines.isNotEmpty) ...[
                      const Divider(),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text(
                            'Total',
                            style: TextStyle(
                              fontWeight: FontWeight.w600,
                              fontSize: 15,
                            ),
                          ),
                          Text(
                            _currencyFmt.format(_total),
                            style: const TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 16,
                              color: AppColors.primary,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            // Pembayaran
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Pembayaran',
                      style: TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 15,
                      ),
                    ),
                    const SizedBox(height: 8),
                    SegmentedButton<String>(
                      segments: const [
                        ButtonSegment(value: 'CASH', label: Text('Tunai')),
                        ButtonSegment(
                          value: 'TRANSFER',
                          label: Text('Transfer'),
                        ),
                        ButtonSegment(value: 'NET30', label: Text('NET30')),
                      ],
                      selected: {_metode},
                      onSelectionChanged: (v) =>
                          setState(() => _metode = v.first),
                      showSelectedIcon: false,
                    ),
                    const SizedBox(height: 10),
                    // Status pembayaran ditentukan server: hanya CASH = lunas,
                    // selain itu tercatat sebagai hutang. Tidak ada input
                    // "jumlah dibayar" karena server mengabaikannya.
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 10,
                      ),
                      decoration: BoxDecoration(
                        color: (_metode == 'CASH'
                            ? AppColors.success
                            : AppColors.warning)
                            .withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            _metode == 'CASH'
                                ? Icons.check_circle_outline
                                : Icons.schedule,
                            size: 18,
                            color: _metode == 'CASH'
                                ? AppColors.success
                                : AppColors.warning,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              _metode == 'CASH'
                                  ? 'Dibayar penuh — status Lunas'
                                  : 'Tercatat sebagai hutang (bayar lewat menu Hutang)',
                              style: const TextStyle(fontSize: 12),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 80),
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: _isSaving ? null : _save,
              child: _isSaving
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Text('Simpan Pembelian'),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildLineCard(int i, _LineItem l) {
    final barang = l.barang;
    final units = barang?.harga ?? const <MaterialPrice>[];
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      color: Colors.grey.shade50,
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Column(
          children: [
            // Pemilih barang
            Row(
              children: [
                Expanded(
                  child: InkWell(
                    onTap: () => _pickBarang(l),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 12,
                      ),
                      decoration: BoxDecoration(
                        border: Border.all(color: Colors.grey.shade300),
                        borderRadius: BorderRadius.circular(8),
                        color: Colors.white,
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              barang?.nama ?? 'Pilih barang...',
                              style: TextStyle(
                                fontSize: 14,
                                color: barang != null
                                    ? Colors.black
                                    : Colors.grey.shade500,
                                fontWeight: barang != null
                                    ? FontWeight.w500
                                    : FontWeight.normal,
                              ),
                            ),
                          ),
                          Icon(
                            Icons.arrow_drop_down,
                            color: Colors.grey.shade500,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close, size: 18),
                  onPressed: () => _removeLine(i),
                ),
              ],
            ),
            const SizedBox(height: 8),
            // Pemilih satuan (hanya jika barang punya >1 satuan)
            if (units.length > 1) ...[
              DropdownButtonFormField<MaterialPrice>(
                initialValue: l.satuan,
                isDense: true,
                decoration: const InputDecoration(
                  labelText: 'Satuan',
                  isDense: true,
                  border: OutlineInputBorder(),
                ),
                items: units
                    .map(
                      (u) => DropdownMenuItem(
                        value: u,
                        child: Text(
                          u.label,
                          style: const TextStyle(fontSize: 13),
                        ),
                      ),
                    )
                    .toList(),
                onChanged: (u) => setState(() {
                  l.satuan = u;
                  if (u != null && u.hargaBeli > 0) {
                    l.harga.text = u.hargaBeli.toStringAsFixed(0);
                  }
                }),
              ),
              const SizedBox(height: 8),
            ],
            // Dimensional vs biasa
            if (l.dimensiRequired) ...[
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: l.lebar,
                      decoration: const InputDecoration(
                        labelText: 'Lebar (m)',
                        isDense: true,
                        border: OutlineInputBorder(),
                      ),
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      onChanged: (_) => setState(() {}),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: TextFormField(
                      controller: l.panjang,
                      decoration: const InputDecoration(
                        labelText: 'Panjang (m)',
                        isDense: true,
                        border: OutlineInputBorder(),
                      ),
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      onChanged: (_) => setState(() {}),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: TextFormField(
                      controller: l.jumlahRoll,
                      decoration: const InputDecoration(
                        labelText: 'Jml Roll',
                        isDense: true,
                        border: OutlineInputBorder(),
                      ),
                      keyboardType: TextInputType.number,
                      onChanged: (_) => setState(() {}),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'Total: ${l.jumlah.toStringAsFixed(2)} m²',
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                ),
              ),
              const SizedBox(height: 8),
              TextFormField(
                controller: l.harga,
                decoration: const InputDecoration(
                  labelText: 'Harga Beli (per m²)',
                  isDense: true,
                  prefixText: 'Rp ',
                  border: OutlineInputBorder(),
                ),
                keyboardType: TextInputType.number,
                onChanged: (_) => setState(() {}),
              ),
            ] else ...[
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: l.qty,
                      decoration: InputDecoration(
                        labelText: 'Qty',
                        isDense: true,
                        border: const OutlineInputBorder(),
                        suffixText: l.satuan?.label,
                      ),
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      onChanged: (_) => setState(() {}),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: TextFormField(
                      controller: l.harga,
                      decoration: const InputDecoration(
                        labelText: 'Harga Beli',
                        isDense: true,
                        prefixText: 'Rp ',
                        border: OutlineInputBorder(),
                      ),
                      keyboardType: TextInputType.number,
                      onChanged: (_) => setState(() {}),
                    ),
                  ),
                ],
              ),
            ],
            if (barang != null) ...[
              const SizedBox(height: 6),
              Align(
                alignment: Alignment.centerRight,
                child: Text(
                  'Subtotal: ${_currencyFmt.format(l.subtotal)}',
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
