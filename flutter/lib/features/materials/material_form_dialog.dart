import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gemiprint/core/theme/app_theme.dart';
import 'package:gemiprint/models/material_item.dart';
import 'package:gemiprint/providers/providers.dart';
import 'package:gemiprint/services/api_client.dart';
import 'package:gemiprint/widgets/snackbar_helper.dart';

class MaterialFormDialog extends ConsumerStatefulWidget {
  final MaterialItem? existing;
  const MaterialFormDialog({super.key, this.existing});

  @override
  ConsumerState<MaterialFormDialog> createState() => _MaterialFormDialogState();
}

class _MaterialFormDialogState extends ConsumerState<MaterialFormDialog> {
  final _namaCtrl = TextEditingController();
  final _deskripsiCtrl = TextEditingController();
  final _satuanDasarCtrl = TextEditingController();

  List<dynamic> _categories = [];
  List<dynamic> _subcategories = [];

  String? _selectedCategoryId;
  String? _selectedSubcategoryId;
  bool _dimensiRequired = false;
  bool _trackStock = false;
  bool _isLoading = true;
  bool _isSaving = false;

  final List<_PriceRow> _prices = [];

  @override
  void initState() {
    super.initState();
    _loadMasterData();
    if (widget.existing != null) {
      final m = widget.existing!;
      _namaCtrl.text = m.nama;
      _deskripsiCtrl.text = m.deskripsi ?? '';
      _satuanDasarCtrl.text = m.satuanNama ?? '';
      _selectedCategoryId = m.kategoriId;
      _selectedSubcategoryId = m.subkategoriId;
      _dimensiRequired = m.dimensiRequired;
      _trackStock = m.trackStock;
      for (final p in m.harga) {
        _prices.add(
          _PriceRow(
            id: p.id,
            labelCtrl: TextEditingController(text: p.label),
            hargaJualCtrl: TextEditingController(
              text: p.hargaJual.toStringAsFixed(0),
            ),
            hargaBeliCtrl: TextEditingController(
              text: p.hargaBeli.toStringAsFixed(0),
            ),
            hargaMemberCtrl: TextEditingController(
              text: p.hargaMember.toStringAsFixed(0),
            ),
            faktorCtrl: TextEditingController(
              text: p.faktorKonversi.toStringAsFixed(2),
            ),
            isDefault: p.isDefault,
          ),
        );
      }
    }
    if (_prices.isEmpty) _addPriceRow();
  }

  @override
  void dispose() {
    _namaCtrl.dispose();
    _deskripsiCtrl.dispose();
    _satuanDasarCtrl.dispose();
    for (final r in _prices) {
      r.dispose();
    }
    super.dispose();
  }

  Future<void> _loadMasterData() async {
    try {
      final api = ref.read(apiClientProvider);
      final results = await Future.wait([
        api.get('/api/master/categories'),
        api.get('/api/master/subcategories'),
      ]);
      if (mounted) {
        setState(() {
          _categories = results[0]['categories'] as List? ?? [];
          _subcategories = results[1]['subcategories'] as List? ?? [];
          _isLoading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _addPriceRow() {
    setState(
      () => _prices.add(
        _PriceRow(
          labelCtrl: TextEditingController(),
          hargaJualCtrl: TextEditingController(),
          hargaBeliCtrl: TextEditingController(),
          hargaMemberCtrl: TextEditingController(),
          faktorCtrl: TextEditingController(text: '1'),
          isDefault: _prices.isEmpty,
        ),
      ),
    );
  }

  Future<void> _save() async {
    final nama = _namaCtrl.text.trim();
    if (nama.isEmpty) {
      showErrorSnackbar(context, 'Nama barang tidak boleh kosong');
      return;
    }
    if (_prices.isEmpty) {
      showErrorSnackbar(context, 'Minimal satu harga satuan diperlukan');
      return;
    }
    final satuanDasar = _dimensiRequired ? 'm2' : _satuanDasarCtrl.text.trim();
    if (satuanDasar.isEmpty) {
      showErrorSnackbar(context, 'Satuan dasar harus diisi');
      return;
    }

    setState(() => _isSaving = true);
    try {
      final api = ref.read(apiClientProvider);
      final body = {
        'nama': nama,
        'deskripsi': _deskripsiCtrl.text.trim().isEmpty
            ? null
            : _deskripsiCtrl.text.trim(),
        'kategori_id': _selectedCategoryId,
        'subkategori_id': _selectedSubcategoryId,
        'satuan_dasar': satuanDasar,
        'butuh_dimensi_status': _dimensiRequired,
        'lacak_inventori_status': _trackStock,
        'unit_prices': _prices
            .map(
              (r) => {
                if (r.id != null) 'id': r.id,
                'nama_satuan': r.labelCtrl.text.trim(),
                'harga_jual': double.tryParse(r.hargaJualCtrl.text) ?? 0,
                'harga_beli': double.tryParse(r.hargaBeliCtrl.text) ?? 0,
                'harga_member': double.tryParse(r.hargaMemberCtrl.text) ?? 0,
                'faktor_konversi': double.tryParse(r.faktorCtrl.text) ?? 1,
                'default_status': r.isDefault ? 1 : 0,
              },
            )
            .toList(),
      };

      if (widget.existing == null) {
        await api.post('/api/barang', body: body);
      } else {
        await api.put('/api/barang/${widget.existing!.id}', body: body);
      }

      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (mounted) showErrorSnackbar(context, e.message);
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  List<dynamic> get _filteredSubcategories => _selectedCategoryId == null
      ? _subcategories
      : _subcategories
            .where((s) => s['kategori_id'] == _selectedCategoryId)
            .toList();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.existing == null ? 'Tambah Barang' : 'Edit Barang'),
        actions: [
          TextButton(
            onPressed: _isSaving ? null : _save,
            child: _isSaving
                ? const SizedBox(
                    width: 18,
                    height: 18,
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
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Info dasar
                  _sectionHeader('Informasi Barang'),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _namaCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Nama Barang *',
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _deskripsiCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Deskripsi (opsional)',
                    ),
                    maxLines: 2,
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _satuanDasarCtrl,
                    enabled: !_dimensiRequired,
                    decoration: InputDecoration(
                      labelText: _dimensiRequired
                          ? 'Satuan Dasar (otomatis m2)'
                          : 'Satuan Dasar *',
                    ),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String?>(
                    initialValue: _selectedCategoryId,
                    decoration: const InputDecoration(labelText: 'Kategori'),
                    items: [
                      const DropdownMenuItem(
                        value: null,
                        child: Text('-- Tanpa Kategori --'),
                      ),
                      ..._categories.map(
                        (c) => DropdownMenuItem(
                          value: c['id'] as String?,
                          child: Text(c['nama'] as String? ?? ''),
                        ),
                      ),
                    ],
                    onChanged: (v) => setState(() {
                      _selectedCategoryId = v;
                      _selectedSubcategoryId = null;
                    }),
                  ),
                  if (_filteredSubcategories.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    DropdownButtonFormField<String?>(
                      initialValue: _selectedSubcategoryId,
                      decoration: const InputDecoration(
                        labelText: 'Sub-Kategori',
                      ),
                      items: [
                        const DropdownMenuItem(
                          value: null,
                          child: Text('-- Tanpa Sub-Kategori --'),
                        ),
                        ..._filteredSubcategories.map(
                          (s) => DropdownMenuItem(
                            value: s['id'] as String?,
                            child: Text(s['nama'] as String? ?? ''),
                          ),
                        ),
                      ],
                      onChanged: (v) =>
                          setState(() => _selectedSubcategoryId = v),
                    ),
                  ],
                  const SizedBox(height: 8),
                  SwitchListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    title: const Text(
                      'Butuh Dimensi (Panjang × Lebar)',
                      style: TextStyle(fontSize: 14),
                    ),
                    subtitle: const Text(
                      'Aktifkan untuk banner, spanduk, dll.',
                      style: TextStyle(fontSize: 12),
                    ),
                    value: _dimensiRequired,
                    onChanged: (v) => setState(() {
                      _dimensiRequired = v;
                      if (v && _satuanDasarCtrl.text.trim().isEmpty) {
                        _satuanDasarCtrl.text = 'm2';
                      }
                    }),
                  ),
                  SwitchListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    title: const Text(
                      'Lacak Stok',
                      style: TextStyle(fontSize: 14),
                    ),
                    value: _trackStock,
                    onChanged: (v) => setState(() => _trackStock = v),
                  ),
                  const SizedBox(height: 20),

                  // Harga satuan
                  Row(
                    children: [
                      Expanded(child: _sectionHeader('Harga Satuan')),
                      TextButton.icon(
                        onPressed: _addPriceRow,
                        icon: const Icon(Icons.add, size: 16),
                        label: const Text('Tambah'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  ..._prices.asMap().entries.map((e) {
                    final i = e.key;
                    final r = e.value;
                    return Card(
                      margin: const EdgeInsets.only(bottom: 10),
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Column(
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    'Harga ${i + 1}',
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w600,
                                      fontSize: 14,
                                    ),
                                  ),
                                ),
                                if (r.isDefault)
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 8,
                                      vertical: 2,
                                    ),
                                    decoration: BoxDecoration(
                                      color: AppColors.primary.withValues(
                                        alpha: 0.1,
                                      ),
                                      borderRadius: BorderRadius.circular(6),
                                    ),
                                    child: const Text(
                                      'Default',
                                      style: TextStyle(
                                        fontSize: 11,
                                        color: AppColors.primary,
                                      ),
                                    ),
                                  ),
                                if (!r.isDefault)
                                  TextButton(
                                    onPressed: () => setState(() {
                                      for (final p in _prices) {
                                        p.isDefault = false;
                                      }
                                      r.isDefault = true;
                                    }),
                                    child: const Text(
                                      'Set Default',
                                      style: TextStyle(fontSize: 12),
                                    ),
                                  ),
                                if (_prices.length > 1)
                                  IconButton(
                                    icon: const Icon(
                                      Icons.delete_outline,
                                      color: AppColors.error,
                                      size: 20,
                                    ),
                                    onPressed: () =>
                                        setState(() => _prices.removeAt(i)),
                                  ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            TextFormField(
                              controller: r.labelCtrl,
                              decoration: const InputDecoration(
                                labelText: 'Nama Satuan *',
                                isDense: true,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Row(
                              children: [
                                Expanded(
                                  child: TextFormField(
                                    controller: r.hargaJualCtrl,
                                    keyboardType: TextInputType.number,
                                    decoration: const InputDecoration(
                                      labelText: 'Harga Jual *',
                                      prefixText: 'Rp ',
                                      isDense: true,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: TextFormField(
                                    controller: r.hargaBeliCtrl,
                                    keyboardType: TextInputType.number,
                                    decoration: const InputDecoration(
                                      labelText: 'Harga Beli',
                                      prefixText: 'Rp ',
                                      isDense: true,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Row(
                              children: [
                                Expanded(
                                  child: TextFormField(
                                    controller: r.hargaMemberCtrl,
                                    keyboardType: TextInputType.number,
                                    decoration: const InputDecoration(
                                      labelText: 'Harga Member',
                                      prefixText: 'Rp ',
                                      isDense: true,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: TextFormField(
                                    controller: r.faktorCtrl,
                                    keyboardType:
                                        const TextInputType.numberWithOptions(
                                          decimal: true,
                                        ),
                                    decoration: const InputDecoration(
                                      labelText: 'Faktor Konversi',
                                      isDense: true,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    );
                  }),
                ],
              ),
            ),
    );
  }

  Widget _sectionHeader(String title) {
    return Text(
      title,
      style: const TextStyle(
        fontSize: 16,
        fontWeight: FontWeight.bold,
        color: AppColors.primaryDark,
      ),
    );
  }
}

class _PriceRow {
  final String? id;
  final TextEditingController labelCtrl;
  final TextEditingController hargaJualCtrl;
  final TextEditingController hargaBeliCtrl;
  final TextEditingController hargaMemberCtrl;
  final TextEditingController faktorCtrl;
  bool isDefault;

  _PriceRow({
    this.id,
    required this.labelCtrl,
    required this.hargaJualCtrl,
    required this.hargaBeliCtrl,
    required this.hargaMemberCtrl,
    required this.faktorCtrl,
    this.isDefault = false,
  });

  void dispose() {
    labelCtrl.dispose();
    hargaJualCtrl.dispose();
    hargaBeliCtrl.dispose();
    hargaMemberCtrl.dispose();
    faktorCtrl.dispose();
  }
}
