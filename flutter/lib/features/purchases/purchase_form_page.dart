import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gemiprint/core/theme/app_theme.dart';
import 'package:gemiprint/models/material_item.dart';
import 'package:gemiprint/models/vendor.dart';
import 'package:gemiprint/providers/providers.dart';
import 'package:gemiprint/services/api_client.dart';
import 'package:gemiprint/widgets/search_field.dart';
import 'package:gemiprint/widgets/snackbar_helper.dart';
import 'package:intl/intl.dart';

class _LineDraft {
  String? barangId;
  String? satuanId;
  double jumlah;
  double hargaBeli;
  String namaSatuan;
  double faktorKonversi;
  double? panjang;
  double? lebar;

  _LineDraft({
    this.barangId,
    this.satuanId,
    this.jumlah = 1,
    this.hargaBeli = 0,
    this.namaSatuan = '',
    this.faktorKonversi = 1,
    this.panjang,
    this.lebar,
  });

  double get area => (panjang ?? 0) * (lebar ?? 0);
}

/// Form tambah pembelian baru (selaras dengan web PurchaseForm).
class PurchaseFormPage extends ConsumerStatefulWidget {
  const PurchaseFormPage({super.key});

  @override
  ConsumerState<PurchaseFormPage> createState() => _PurchaseFormPageState();
}

class _PurchaseFormPageState extends ConsumerState<PurchaseFormPage> {
  final _formKey = GlobalKey<FormState>();
  final _fakturCtrl = TextEditingController();
  final _catatanCtrl = TextEditingController();

  List<MaterialItem> _materials = [];
  List<Vendor> _vendors = [];
  bool _loadingInit = true;
  bool _saving = false;

  DateTime _tanggal = DateTime.now();
  String? _vendorId;
  String _metode = 'CASH';
  final List<_LineDraft> _lines = [_LineDraft()];

  final _fmt = NumberFormat.currency(
    locale: 'id_ID',
    symbol: 'Rp ',
    decimalDigits: 0,
  );
  final _dateFmt = DateFormat('yyyy-MM-dd');

  @override
  void initState() {
    super.initState();
    _loadInit();
  }

  @override
  void dispose() {
    _fakturCtrl.dispose();
    _catatanCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadInit() async {
    setState(() => _loadingInit = true);
    try {
      final data = await ref.read(purchasesServiceProvider).getInitData();
      if (!mounted) return;
      setState(() {
        _materials =
            (data['materials'] as List?)
                ?.map((j) => MaterialItem.fromJson(j as Map<String, dynamic>))
                .toList() ??
            [];
        _vendors =
            (data['vendors'] as List?)
                ?.map((j) => Vendor.fromJson(j as Map<String, dynamic>))
                .toList() ??
            [];
        _loadingInit = false;
      });
    } catch (_) {
      if (mounted) {
        setState(() => _loadingInit = false);
        showErrorSnackbar(context, 'Gagal memuat data form pembelian');
      }
    }
  }

  List<Vendor> get _activeVendors =>
      _vendors.where((v) => v.aktifStatus).toList();

  double get _total => _lines.fold(0, (s, l) => s + l.jumlah * l.hargaBeli);

  MaterialItem? _material(String? id) {
    if (id == null) return null;
    for (final m in _materials) {
      if (m.id == id) return m;
    }
    return null;
  }

  Future<T?> _pickFromList<T>({
    required String title,
    required List<T> items,
    required String Function(T) label,
    String Function(T)? subtitle,
  }) {
    return showModalBottomSheet<T>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (ctx) {
        var filtered = List<T>.from(items);
        return StatefulBuilder(
          builder: (context, setModalState) {
            return DraggableScrollableSheet(
              initialChildSize: 0.7,
              minChildSize: 0.4,
              maxChildSize: 0.95,
              expand: false,
              builder: (_, scrollCtrl) => Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                    child: Text(
                      title,
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: SearchField(
                      hintText: 'Cari...',
                      onChanged: (q) {
                        setModalState(() {
                          final query = q.trim().toLowerCase();
                          filtered = query.isEmpty
                              ? List<T>.from(items)
                              : items
                                    .where(
                                      (e) => label(
                                        e,
                                      ).toLowerCase().contains(query),
                                    )
                                    .toList();
                        });
                      },
                    ),
                  ),
                  const SizedBox(height: 8),
                  Expanded(
                    child: ListView.builder(
                      controller: scrollCtrl,
                      itemCount: filtered.length,
                      itemBuilder: (_, i) {
                        final item = filtered[i];
                        return ListTile(
                          title: Text(label(item)),
                          subtitle: subtitle != null
                              ? Text(
                                  subtitle(item),
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: Colors.grey.shade600,
                                  ),
                                )
                              : null,
                          onTap: () => Navigator.pop(ctx, item),
                        );
                      },
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  void _setLine(int index, void Function(_LineDraft) update) {
    setState(() {
      final copy = _LineDraft(
        barangId: _lines[index].barangId,
        satuanId: _lines[index].satuanId,
        jumlah: _lines[index].jumlah,
        hargaBeli: _lines[index].hargaBeli,
        namaSatuan: _lines[index].namaSatuan,
        faktorKonversi: _lines[index].faktorKonversi,
        panjang: _lines[index].panjang,
        lebar: _lines[index].lebar,
      );
      update(copy);
      _lines[index] = copy;
    });
  }

  Future<void> _pickBarang(int index) async {
    final picked = await _pickFromList<MaterialItem>(
      title: 'Pilih Barang',
      items: _materials,
      label: (m) => m.nama,
      subtitle: (m) => m.kategoriNama ?? '',
    );
    if (picked == null) return;
    _setLine(index, (l) {
      l.barangId = picked.id;
      l.satuanId = null;
      l.namaSatuan = '';
      l.faktorKonversi = 1;
      l.hargaBeli = 0;
      l.panjang = null;
      l.lebar = null;
      l.jumlah = picked.dimensiRequired ? 0 : 1;
    });
  }

  Future<void> _pickSatuan(int index) async {
    final mat = _material(_lines[index].barangId);
    if (mat == null || mat.harga.isEmpty) {
      showErrorSnackbar(context, 'Pilih barang terlebih dahulu');
      return;
    }
    final picked = await _pickFromList<MaterialPrice>(
      title: 'Pilih Satuan',
      items: mat.harga,
      label: (u) => u.label,
    );
    if (picked == null) return;
    _setLine(index, (l) {
      l.satuanId = picked.id;
      l.namaSatuan = picked.label;
      l.faktorKonversi = picked.faktorKonversi;
      if (picked.hargaBeli > 0) l.hargaBeli = picked.hargaBeli;
    });
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _tanggal,
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (picked != null) setState(() => _tanggal = picked);
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    final faktur = _fakturCtrl.text.trim();
    if (faktur.isEmpty) {
      showErrorSnackbar(context, 'Nomor faktur harus diisi');
      return;
    }

    for (var i = 0; i < _lines.length; i++) {
      final line = _lines[i];
      if (line.barangId == null || line.satuanId == null) {
        showErrorSnackbar(context, 'Item #${i + 1}: pilih barang dan satuan');
        return;
      }
      if (line.jumlah <= 0) {
        final mat = _material(line.barangId);
        if (mat?.dimensiRequired == true) {
          final area = line.area;
          if ((line.panjang ?? 0) <= 0 || (line.lebar ?? 0) <= 0 || area <= 0) {
            showErrorSnackbar(context, 'Item #${i + 1}: isi panjang dan lebar');
            return;
          }
        } else {
          showErrorSnackbar(
            context,
            'Item #${i + 1}: jumlah harus lebih dari 0',
          );
          return;
        }
      }
      final mat = _material(line.barangId);
      if (mat?.dimensiRequired == true &&
          ((line.panjang ?? 0) <= 0 || (line.lebar ?? 0) <= 0)) {
        showErrorSnackbar(context, 'Item #${i + 1}: isi panjang dan lebar');
        return;
      }
      if (line.hargaBeli < 0) {
        showErrorSnackbar(context, 'Item #${i + 1}: harga beli tidak valid');
        return;
      }
    }

    setState(() => _saving = true);
    try {
      await ref.read(purchasesServiceProvider).create({
        'tanggal': _dateFmt.format(_tanggal),
        'nomor_faktur': faktur,
        'nomor_pembelian': faktur,
        'vendor_id': _vendorId,
        'catatan': _catatanCtrl.text.trim(),
        'metode_pembayaran': _metode,
        'items': _lines.map((l) {
          final mat = _material(l.barangId);
          final isDimensional = mat?.dimensiRequired == true;
          return {
            'barang_id': l.barangId,
            'harga_satuan_id': l.satuanId,
            'jumlah': isDimensional ? l.area : l.jumlah,
            'nama_satuan': l.namaSatuan,
            'faktor_konversi': l.faktorKonversi,
            'harga_satuan': l.hargaBeli,
            if (isDimensional) 'panjang': l.panjang,
            if (isDimensional) 'lebar': l.lebar,
          };
        }).toList(),
      });
      if (mounted) {
        showSuccessSnackbar(context, 'Pembelian berhasil ditambahkan');
        Navigator.pop(context, true);
      }
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _saving = false);
        showErrorSnackbar(context, e.message);
      }
    } catch (_) {
      if (mounted) {
        setState(() => _saving = false);
        showErrorSnackbar(context, 'Gagal menyimpan pembelian');
      }
    }
  }

  Future<void> _editQty(int index) async {
    final line = _lines[index];
    final ctrl = TextEditingController(
      text: line.jumlah == line.jumlah.roundToDouble()
          ? '${line.jumlah.toInt()}'
          : line.jumlah.toString(),
    );
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Jumlah'),
        content: TextField(
          controller: ctrl,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          inputFormatters: [
            FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d*')),
          ],
          autofocus: true,
          decoration: const InputDecoration(hintText: 'Contoh: 7.4'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Batal'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('OK'),
          ),
        ],
      ),
    );
    if (ok == true) {
      final n = double.tryParse(ctrl.text.replaceAll(',', '.')) ?? 0;
      _setLine(index, (l) => l.jumlah = n < 0 ? 0 : n);
    }
    ctrl.dispose();
  }

  Future<void> _editHarga(int index) async {
    final line = _lines[index];
    final ctrl = TextEditingController(
      text: line.hargaBeli > 0 ? line.hargaBeli.toStringAsFixed(0) : '',
    );
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Harga beli / satuan'),
        content: TextField(
          controller: ctrl,
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          autofocus: true,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Batal'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('OK'),
          ),
        ],
      ),
    );
    if (ok == true) {
      final n = double.tryParse(ctrl.text) ?? 0;
      _setLine(index, (l) => l.hargaBeli = n);
    }
    ctrl.dispose();
  }

  Future<void> _editDimension(int index, {required bool isPanjang}) async {
    final line = _lines[index];
    final value = isPanjang ? line.panjang : line.lebar;
    final ctrl = TextEditingController(
      text: value == null || value == 0 ? '' : value.toString(),
    );
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(isPanjang ? 'Panjang (m)' : 'Lebar (m)'),
        content: TextField(
          controller: ctrl,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          inputFormatters: [
            FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d*')),
          ],
          autofocus: true,
          decoration: const InputDecoration(hintText: 'Contoh: 3.2'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Batal'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('OK'),
          ),
        ],
      ),
    );
    if (ok == true) {
      final n = double.tryParse(ctrl.text.replaceAll(',', '.')) ?? 0;
      _setLine(index, (l) {
        if (isPanjang) {
          l.panjang = n <= 0 ? null : n;
        } else {
          l.lebar = n <= 0 ? null : n;
        }
        l.jumlah = l.area;
      });
    }
    ctrl.dispose();
  }

  Widget _qtyField(int index, _LineDraft line) {
    return Row(
      children: [
        IconButton(
          icon: const Icon(Icons.remove_circle_outline),
          color: AppColors.primary,
          onPressed: () {
            final next = (line.jumlah - 1).clamp(0, double.infinity);
            _setLine(index, (l) => l.jumlah = next.toDouble());
          },
        ),
        Expanded(
          child: InkWell(
            onTap: () => _editQty(index),
            child: InputDecorator(
              decoration: const InputDecoration(
                labelText: 'Jumlah',
                isDense: true,
              ),
              child: Text(
                line.jumlah == line.jumlah.roundToDouble()
                    ? '${line.jumlah.toInt()}'
                    : line.jumlah.toString(),
                textAlign: TextAlign.center,
              ),
            ),
          ),
        ),
        IconButton(
          icon: const Icon(Icons.add_circle_outline),
          color: AppColors.primary,
          onPressed: () {
            _setLine(index, (l) => l.jumlah = l.jumlah + 1);
          },
        ),
      ],
    );
  }

  Widget _lineCard(int index) {
    final line = _lines[index];
    final mat = _material(line.barangId);
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(
                  'Item ${index + 1}',
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
                const Spacer(),
                if (_lines.length > 1)
                  IconButton(
                    icon: const Icon(
                      Icons.delete_outline,
                      color: AppColors.error,
                    ),
                    onPressed: () => setState(() => _lines.removeAt(index)),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            OutlinedButton(
              onPressed: () => _pickBarang(index),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  mat?.nama ?? 'Pilih barang',
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ),
            const SizedBox(height: 8),
            OutlinedButton(
              onPressed: () => _pickSatuan(index),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  line.namaSatuan.isNotEmpty ? line.namaSatuan : 'Pilih satuan',
                ),
              ),
            ),
            const SizedBox(height: 8),
            if (mat?.dimensiRequired == true) ...[
              Row(
                children: [
                  Expanded(
                    child: InkWell(
                      onTap: () => _editDimension(index, isPanjang: true),
                      child: InputDecorator(
                        decoration: const InputDecoration(
                          labelText: 'Panjang (m)',
                          isDense: true,
                        ),
                        child: Text(
                          line.panjang == null
                              ? 'Isi'
                              : line.panjang!.toStringAsFixed(2),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: InkWell(
                      onTap: () => _editDimension(index, isPanjang: false),
                      child: InputDecorator(
                        decoration: const InputDecoration(
                          labelText: 'Lebar (m)',
                          isDense: true,
                        ),
                        child: Text(
                          line.lebar == null
                              ? 'Isi'
                              : line.lebar!.toStringAsFixed(2),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                'Luas masuk stok: ${line.area.toStringAsFixed(2)} m2',
                style: TextStyle(color: Colors.grey.shade700, fontSize: 13),
              ),
            ] else
              _qtyField(index, line),
            const SizedBox(height: 8),
            InkWell(
              onTap: () => _editHarga(index),
              child: InputDecorator(
                decoration: const InputDecoration(
                  labelText: 'Harga beli / satuan',
                  isDense: true,
                ),
                child: Text(
                  line.hargaBeli > 0
                      ? _fmt.format(line.hargaBeli)
                      : 'Ketuk untuk isi',
                ),
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Subtotal: ${_fmt.format(line.jumlah * line.hargaBeli)}',
              style: TextStyle(color: Colors.grey.shade700, fontSize: 13),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Tambah Pembelian')),
      body: _loadingInit
          ? const Center(child: CircularProgressIndicator())
          : Form(
              key: _formKey,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  InkWell(
                    onTap: _pickDate,
                    borderRadius: BorderRadius.circular(8),
                    child: InputDecorator(
                      decoration: const InputDecoration(
                        labelText: 'Tanggal',
                        border: OutlineInputBorder(),
                      ),
                      child: Text(_dateFmt.format(_tanggal)),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _fakturCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Nomor faktur *',
                      border: OutlineInputBorder(),
                    ),
                    validator: (v) =>
                        (v == null || v.trim().isEmpty) ? 'Wajib diisi' : null,
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String?>(
                    initialValue: _vendorId,
                    decoration: const InputDecoration(
                      labelText: 'Vendor',
                      border: OutlineInputBorder(),
                    ),
                    items: [
                      const DropdownMenuItem<String?>(
                        value: null,
                        child: Text('— Tanpa vendor —'),
                      ),
                      ..._activeVendors.map(
                        (v) => DropdownMenuItem(
                          value: v.id,
                          child: Text(v.namaPerusahaan),
                        ),
                      ),
                    ],
                    onChanged: (v) => setState(() => _vendorId = v),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    initialValue: _metode,
                    decoration: const InputDecoration(
                      labelText: 'Metode pembayaran',
                      border: OutlineInputBorder(),
                    ),
                    items: const [
                      DropdownMenuItem(
                        value: 'CASH',
                        child: Text('Tunai (CASH)'),
                      ),
                      DropdownMenuItem(value: 'NET30', child: Text('NET 30')),
                      DropdownMenuItem(value: 'COD', child: Text('COD')),
                    ],
                    onChanged: (v) {
                      if (v != null) setState(() => _metode = v);
                    },
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _catatanCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Catatan',
                      border: OutlineInputBorder(),
                    ),
                    maxLines: 2,
                  ),
                  const SizedBox(height: 20),
                  Row(
                    children: [
                      const Text(
                        'Item pembelian',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const Spacer(),
                      TextButton.icon(
                        onPressed: () =>
                            setState(() => _lines.add(_LineDraft())),
                        icon: const Icon(Icons.add, size: 18),
                        label: const Text('Tambah item'),
                      ),
                    ],
                  ),
                  ...List.generate(_lines.length, _lineCard),
                  const SizedBox(height: 8),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: AppColors.primary.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      'Total: ${_fmt.format(_total)}',
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: AppColors.primaryDark,
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),
                  FilledButton(
                    onPressed: _saving ? null : _submit,
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      minimumSize: const Size.fromHeight(48),
                    ),
                    child: _saving
                        ? const SizedBox(
                            height: 22,
                            width: 22,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Text(
                            'Simpan Pembelian',
                            style: TextStyle(fontWeight: FontWeight.bold),
                          ),
                  ),
                  const SizedBox(height: 24),
                ],
              ),
            ),
    );
  }
}
