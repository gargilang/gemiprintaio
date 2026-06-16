import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gemiprint/models/vendor.dart';
import 'package:gemiprint/providers/providers.dart';
import 'package:gemiprint/services/api_client.dart';
import 'package:gemiprint/widgets/snackbar_helper.dart';

class VendorFormSheet extends ConsumerStatefulWidget {
  final Vendor? existing;
  const VendorFormSheet({super.key, this.existing});

  @override
  ConsumerState<VendorFormSheet> createState() => _VendorFormSheetState();
}

class _VendorFormSheetState extends ConsumerState<VendorFormSheet> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _namaPerusahaan;
  late final TextEditingController _kontakPerson;
  late final TextEditingController _email;
  late final TextEditingController _telepon;
  late final TextEditingController _alamat;
  late final TextEditingController _ketentuanBayar;
  late final TextEditingController _catatan;
  late String _tipeVendor;
  bool _isSaving = false;

  static const _tipeOptions = ['SUPPLIER', 'SUBKONTRAKTOR', 'KEDUANYA'];
  static const _tipeLabels = ['Supplier', 'Subkontraktor', 'Keduanya'];

  bool get _isEditing => widget.existing != null;

  @override
  void initState() {
    super.initState();
    final v = widget.existing;
    _namaPerusahaan = TextEditingController(text: v?.namaPerusahaan ?? '');
    _kontakPerson = TextEditingController(text: v?.kontakPerson ?? '');
    _email = TextEditingController(text: v?.email ?? '');
    _telepon = TextEditingController(text: v?.telepon ?? '');
    _alamat = TextEditingController(text: v?.alamat ?? '');
    _ketentuanBayar = TextEditingController(text: v?.ketentuanBayar ?? '');
    _catatan = TextEditingController(text: v?.catatan ?? '');
    _tipeVendor = v?.tipeVendor ?? 'SUPPLIER';
  }

  @override
  void dispose() {
    _namaPerusahaan.dispose();
    _kontakPerson.dispose();
    _email.dispose();
    _telepon.dispose();
    _alamat.dispose();
    _ketentuanBayar.dispose();
    _catatan.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _isSaving = true);

    final body = <String, dynamic>{
      if (_isEditing) 'id': widget.existing!.id,
      'nama_perusahaan': _namaPerusahaan.text.trim(),
      'kontak_person': _kontakPerson.text.trim(),
      'email': _email.text.trim(),
      'telepon': _telepon.text.trim(),
      'alamat': _alamat.text.trim(),
      'ketentuan_bayar': _ketentuanBayar.text.trim(),
      'catatan': _catatan.text.trim(),
      'tipe_vendor': _tipeVendor,
      'aktif_status': true,
    };

    try {
      final service = ref.read(vendorsServiceProvider);
      if (_isEditing) {
        await service.update(body);
      } else {
        await service.create(body);
      }
      if (mounted) {
        showSuccessSnackbar(
          context,
          _isEditing ? 'Vendor berhasil diperbarui' : 'Vendor berhasil ditambahkan',
        );
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
        showErrorSnackbar(context, 'Gagal menyimpan data');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: DraggableScrollableSheet(
        initialChildSize: 0.85,
        minChildSize: 0.5,
        maxChildSize: 0.95,
        expand: false,
        builder: (_, scrollCtrl) => Container(
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: Column(
            children: [
              // Header
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                decoration: BoxDecoration(
                  border: Border(bottom: BorderSide(color: Colors.grey.shade200)),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        _isEditing ? 'Edit Vendor' : 'Tambah Vendor',
                        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
                      ),
                    ),
                    IconButton(
                      onPressed: _isSaving ? null : () => Navigator.of(context).pop(),
                      icon: const Icon(Icons.close),
                    ),
                  ],
                ),
              ),
              // Form
              Expanded(
                child: Form(
                  key: _formKey,
                  child: ListView(
                    controller: scrollCtrl,
                    padding: const EdgeInsets.all(20),
                    children: [
                      TextFormField(
                        controller: _namaPerusahaan,
                        decoration: const InputDecoration(
                          labelText: 'Nama Perusahaan *',
                          hintText: 'PT/CV/UD ...',
                        ),
                        validator: (v) => v == null || v.trim().isEmpty ? 'Nama perusahaan harus diisi' : null,
                        textInputAction: TextInputAction.next,
                      ),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _kontakPerson,
                        decoration: const InputDecoration(
                          labelText: 'Kontak Person',
                          hintText: 'Nama kontak',
                        ),
                        textInputAction: TextInputAction.next,
                      ),
                      const SizedBox(height: 14),
                      Row(
                        children: [
                          Expanded(
                            child: TextFormField(
                              controller: _telepon,
                              decoration: const InputDecoration(
                                labelText: 'Telepon',
                                hintText: '08xx-xxxx',
                              ),
                              keyboardType: TextInputType.phone,
                              textInputAction: TextInputAction.next,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: TextFormField(
                              controller: _email,
                              decoration: const InputDecoration(
                                labelText: 'Email',
                                hintText: 'email@contoh.com',
                              ),
                              keyboardType: TextInputType.emailAddress,
                              textInputAction: TextInputAction.next,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _alamat,
                        decoration: const InputDecoration(
                          labelText: 'Alamat',
                          hintText: 'Alamat lengkap',
                        ),
                        maxLines: 2,
                        textInputAction: TextInputAction.next,
                      ),
                      const SizedBox(height: 14),
                      // Tipe Vendor segmented button
                      Text('Tipe Vendor', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                      const SizedBox(height: 8),
                      SegmentedButton<String>(
                        segments: List.generate(_tipeOptions.length, (i) {
                          return ButtonSegment<String>(
                            value: _tipeOptions[i],
                            label: Text(_tipeLabels[i], style: const TextStyle(fontSize: 13)),
                          );
                        }),
                        selected: {_tipeVendor},
                        onSelectionChanged: (sel) => setState(() => _tipeVendor = sel.first),
                        showSelectedIcon: false,
                      ),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _ketentuanBayar,
                        decoration: const InputDecoration(
                          labelText: 'Ketentuan Bayar',
                          hintText: 'NET30 / COD / ...',
                        ),
                        textInputAction: TextInputAction.next,
                      ),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _catatan,
                        decoration: const InputDecoration(
                          labelText: 'Catatan',
                          hintText: 'Catatan tambahan...',
                        ),
                        maxLines: 3,
                        textInputAction: TextInputAction.done,
                      ),
                    ],
                  ),
                ),
              ),
              // Footer
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                decoration: BoxDecoration(
                  border: Border(top: BorderSide(color: Colors.grey.shade200)),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: _isSaving ? null : () => Navigator.of(context).pop(),
                        child: const Text('Batal'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: FilledButton(
                        onPressed: _isSaving ? null : _save,
                        child: _isSaving
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                              )
                            : const Text('Simpan'),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
