import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gemiprint/models/katalog_maklon.dart';
import 'package:gemiprint/models/vendor.dart';
import 'package:gemiprint/providers/providers.dart';
import 'package:gemiprint/services/api_client.dart';
import 'package:gemiprint/widgets/snackbar_helper.dart';

/// Form tambah/edit Katalog Extra (maklon).
///
/// Checkbox "Butuh dimensi" dikunci `nama_satuan` ke `m2` saat aktif.
/// Metode bayar vendor: CASH / TRANSFER / NET30. Field "Tandai Populer"
/// tidak ditampilkan karena popularitas otomatis dari backend.
class KatalogMaklonFormSheet extends ConsumerStatefulWidget {
  final KatalogMaklon? existing;
  const KatalogMaklonFormSheet({super.key, this.existing});

  @override
  ConsumerState<KatalogMaklonFormSheet> createState() =>
      _KatalogMaklonFormSheetState();
}

class _KatalogMaklonFormSheetState
    extends ConsumerState<KatalogMaklonFormSheet> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _namaCtrl;
  late final TextEditingController _satuanCtrl;
  late final TextEditingController _hargaJualCtrl;
  late final TextEditingController _biayaCtrl;
  late final TextEditingController _catatanCtrl;
  String? _kategoriId;
  String? _kategoriNama;
  String? _vendorId;
  late String _metodeBayar;
  late bool _butuhDimensi;
  late bool _aktif;
  bool _saving = false;
  List<dynamic> _categories = [];
  List<Vendor> _vendors = [];
  bool _loadingOpts = true;

  bool get _isEditing => widget.existing != null;

  @override
  void initState() {
    super.initState();
    final e = widget.existing;
    _namaCtrl = TextEditingController(text: e?.namaProduk ?? '');
    _satuanCtrl = TextEditingController(text: e?.namaSatuan ?? 'pcs');
    _hargaJualCtrl = TextEditingController(
      text: e == null ? '0' : e.hargaJualDefault.toStringAsFixed(0),
    );
    _biayaCtrl = TextEditingController(
      text: e == null ? '0' : e.biayaSubkontrakDefault.toStringAsFixed(0),
    );
    _catatanCtrl = TextEditingController(text: e?.catatanInternal ?? '');
    _kategoriId = e?.kategoriId;
    _kategoriNama = e?.kategoriNama ?? e?.kategori;
    _vendorId = e?.vendorSubkontrakIdDefault;
    _metodeBayar = e?.metodeBayarVendorDefault ?? 'CASH';
    _butuhDimensi = e?.butuhDimensiStatus ?? false;
    _aktif = e?.isAktif ?? true;
    _loadOptions();
  }

  @override
  void dispose() {
    _namaCtrl.dispose();
    _satuanCtrl.dispose();
    _hargaJualCtrl.dispose();
    _biayaCtrl.dispose();
    _catatanCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadOptions() async {
    try {
      final api = ref.read(apiClientProvider);
      final results = await Future.wait([
        api.get('/api/master/categories'),
        ref.read(vendorsServiceProvider).getAll(),
      ]);
      if (!mounted) return;
      setState(() {
        _categories = results[0]['categories'] as List? ?? [];
        _vendors = (results[1] as List<Vendor>)
            .where((v) => v.tipeVendor != 'SUPPLIER')
            .toList();
        _loadingOpts = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loadingOpts = false);
    }
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    final nama = _namaCtrl.text.trim();
    if (nama.isEmpty) return;

    setState(() => _saving = true);
    final payload = <String, dynamic>{
      'nama_produk': nama,
      'nama_satuan': _butuhDimensi ? 'm2' : _satuanCtrl.text.trim(),
      'harga_jual_default': double.tryParse(_hargaJualCtrl.text) ?? 0,
      'biaya_subkontrak_default': double.tryParse(_biayaCtrl.text) ?? 0,
      'vendor_subkontrak_id_default': _vendorId,
      'metode_bayar_vendor_default': _metodeBayar,
      'kategori': _kategoriNama,
      'kategori_id': _kategoriId,
      'populer_status': widget.existing?.populerStatus == true ? 1 : 0,
      'butuh_dimensi_status': _butuhDimensi ? 1 : 0,
      'catatan_internal':
          _catatanCtrl.text.trim().isEmpty ? null : _catatanCtrl.text.trim(),
      'is_aktif': _aktif ? 1 : 0,
      'urutan': widget.existing?.urutan ?? 0,
    };

    try {
      final service = ref.read(katalogMaklonServiceProvider);
      if (_isEditing) {
        await service.update(widget.existing!.id, payload);
      } else {
        await service.create(payload);
      }
      if (mounted) {
        showSuccessSnackbar(
          context,
          _isEditing
              ? 'Katalog extra berhasil diperbarui'
              : 'Katalog extra berhasil ditambahkan',
        );
        Navigator.of(context).pop(true);
      }
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _saving = false);
        showErrorSnackbar(context, e.message);
      }
    } catch (_) {
      if (mounted) {
        setState(() => _saving = false);
        showErrorSnackbar(context, 'Gagal menyimpan katalog extra');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: DraggableScrollableSheet(
        initialChildSize: 0.9,
        minChildSize: 0.5,
        maxChildSize: 0.97,
        expand: false,
        builder: (_, scrollCtrl) => Material(
          color: Colors.white,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
          child: Column(
            children: [
              _buildHeader(),
              Expanded(
                child: Form(
                  key: _formKey,
                  child: ListView(
                    controller: scrollCtrl,
                    padding: const EdgeInsets.all(20),
                    children: [
                      TextFormField(
                        controller: _namaCtrl,
                        decoration: const InputDecoration(
                          labelText: 'Nama Produk *',
                        ),
                        validator: (v) =>
                            v == null || v.trim().isEmpty
                            ? 'Nama produk harus diisi'
                            : null,
                        textInputAction: TextInputAction.next,
                      ),
                      const SizedBox(height: 10),
                      SwitchListTile(
                        title: const Text('Butuh dimensi (harga per m2)'),
                        subtitle: const Text(
                          'Harga dihitung dari lebar x panjang x jumlah.',
                        ),
                        value: _butuhDimensi,
                        onChanged: (v) => setState(() {
                          _butuhDimensi = v;
                          if (v) _satuanCtrl.text = 'm2';
                        }),
                      ),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _satuanCtrl,
                        enabled: !_butuhDimensi,
                        decoration: InputDecoration(
                          labelText: 'Satuan',
                          helperText: _butuhDimensi ? 'Dikunci ke m2' : null,
                        ),
                        textInputAction: TextInputAction.next,
                      ),
                      const SizedBox(height: 14),
                      _kategoriDropdown(),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _hargaJualCtrl,
                        decoration: const InputDecoration(
                          labelText: 'Harga Jual',
                          prefixText: 'Rp ',
                        ),
                        keyboardType: const TextInputType.numberWithOptions(
                          decimal: true,
                        ),
                        textInputAction: TextInputAction.next,
                      ),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _biayaCtrl,
                        decoration: const InputDecoration(
                          labelText: 'Biaya Subkontrak',
                          prefixText: 'Rp ',
                        ),
                        keyboardType: const TextInputType.numberWithOptions(
                          decimal: true,
                        ),
                        textInputAction: TextInputAction.next,
                      ),
                      const SizedBox(height: 14),
                      _vendorDropdown(),
                      const SizedBox(height: 14),
                      DropdownButtonFormField<String>(
                        initialValue: _metodeBayar,
                        decoration: const InputDecoration(
                          labelText: 'Metode Bayar ke Vendor',
                        ),
                        items: const [
                          DropdownMenuItem(
                            value: 'CASH',
                            child: Text('CASH'),
                          ),
                          DropdownMenuItem(
                            value: 'TRANSFER',
                            child: Text('TRANSFER'),
                          ),
                          DropdownMenuItem(
                            value: 'NET30',
                            child: Text('NET30'),
                          ),
                        ],
                        onChanged: (v) =>
                            setState(() => _metodeBayar = v ?? 'CASH'),
                      ),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _catatanCtrl,
                        decoration: const InputDecoration(
                          labelText: 'Catatan Internal (Opsional)',
                        ),
                        maxLines: 3,
                      ),
                      const SizedBox(height: 10),
                      SwitchListTile(
                        title: const Text('Aktif'),
                        value: _aktif,
                        onChanged: (v) => setState(() => _aktif = v),
                      ),
                    ],
                  ),
                ),
              ),
              _buildFooter(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: Colors.grey.shade200)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              _isEditing ? 'Edit Katalog Extra' : 'Tambah Katalog Extra',
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
            ),
          ),
          IconButton(
            onPressed: _saving ? null : () => Navigator.of(context).pop(),
            icon: const Icon(Icons.close),
          ),
        ],
      ),
    );
  }

  Widget _buildFooter() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      decoration: BoxDecoration(
        border: Border(top: BorderSide(color: Colors.grey.shade200)),
      ),
      child: Row(
        children: [
          Expanded(
            child: OutlinedButton(
              onPressed: _saving ? null : () => Navigator.of(context).pop(),
              child: const Text('Batal'),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: FilledButton(
              onPressed: _saving ? null : _save,
              child: _saving
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Text('Simpan'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _kategoriDropdown() {
    if (_loadingOpts) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 8),
        child: LinearProgressIndicator(),
      );
    }
    return DropdownButtonFormField<String>(
      initialValue: _kategoriId,
      decoration: const InputDecoration(labelText: 'Kategori (Opsional)'),
      items: [
        const DropdownMenuItem<String>(
          value: null,
          child: Text('Tanpa kategori'),
        ),
        ..._categories.map((c) {
          final map = c as Map<String, dynamic>;
          return DropdownMenuItem<String>(
            value: map['id'] as String?,
            child: Text(map['nama'] as String? ?? ''),
          );
        }),
      ],
      onChanged: (v) => setState(() {
        _kategoriId = v;
        if (v == null) {
          _kategoriNama = null;
        } else {
          String? nama;
          for (final c in _categories) {
            if ((c as Map<String, dynamic>)['id'] == v) {
              nama = c['nama'] as String?;
              break;
            }
          }
          _kategoriNama = nama;
        }
      }),
    );
  }

  Widget _vendorDropdown() {
    if (_loadingOpts) {
      return const SizedBox.shrink();
    }
    return DropdownButtonFormField<String>(
      initialValue: _vendorId,
      decoration: const InputDecoration(
        labelText: 'Vendor Maklon Bawaan (Opsional)',
      ),
      items: [
        const DropdownMenuItem<String>(
          value: null,
          child: Text('Pilih saat transaksi'),
        ),
        ..._vendors.map(
          (v) => DropdownMenuItem<String>(
            value: v.id,
            child: Text(v.namaPerusahaan),
          ),
        ),
      ],
      onChanged: (v) => setState(() => _vendorId = v),
    );
  }
}