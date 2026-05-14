import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gemiprint/models/vendor.dart';
import 'package:gemiprint/providers/providers.dart';
import 'package:gemiprint/services/api_client.dart';
import 'package:gemiprint/widgets/snackbar_helper.dart';

class VendorFormDialog extends ConsumerStatefulWidget {
  final Vendor? existing;
  const VendorFormDialog({super.key, this.existing});

  @override
  ConsumerState<VendorFormDialog> createState() => _VendorFormDialogState();
}

class _VendorFormDialogState extends ConsumerState<VendorFormDialog> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _namaPerusahaan;
  late final TextEditingController _kontakPerson;
  late final TextEditingController _email;
  late final TextEditingController _telepon;
  late final TextEditingController _alamat;
  late final TextEditingController _ketentuanBayar;
  late final TextEditingController _catatan;
  bool _isSaving = false;

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

    final body = {
      if (_isEditing) 'id': widget.existing!.id,
      'nama_perusahaan': _namaPerusahaan.text.trim(),
      'kontak_person': _kontakPerson.text.trim(),
      'email': _email.text.trim(),
      'telepon': _telepon.text.trim(),
      'alamat': _alamat.text.trim(),
      'ketentuan_bayar': _ketentuanBayar.text.trim(),
      'catatan': _catatan.text.trim(),
      'aktif_status': true,
    };

    try {
      if (_isEditing) {
        await ref.read(vendorsServiceProvider).update(body);
      } else {
        await ref.read(vendorsServiceProvider).create(body);
      }
      if (mounted) {
        showSuccessSnackbar(context, _isEditing ? 'Vendor berhasil diperbarui' : 'Vendor berhasil ditambahkan');
        Navigator.of(context).pop(true);
      }
    } on ApiException catch (e) {
      if (mounted) { setState(() => _isSaving = false); showErrorSnackbar(context, e.message); }
    } catch (_) {
      if (mounted) { setState(() => _isSaving = false); showErrorSnackbar(context, 'Gagal menyimpan data'); }
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
            borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
          ),
          child: Column(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: BoxDecoration(border: Border(bottom: BorderSide(color: Colors.grey.shade200))),
                child: Row(
                  children: [
                    Expanded(child: Text(_isEditing ? 'Edit Vendor' : 'Tambah Vendor', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600))),
                    TextButton(onPressed: _isSaving ? null : () => Navigator.of(context).pop(), child: const Text('Batal')),
                    const SizedBox(width: 4),
                    ElevatedButton(onPressed: _isSaving ? null : _save, child: _isSaving ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Text('Simpan')),
                  ],
                ),
              ),
              Expanded(
                child: Form(
                  key: _formKey,
                  child: ListView(
                    controller: scrollCtrl,
                    padding: const EdgeInsets.all(16),
                    children: [
                      TextFormField(controller: _namaPerusahaan, decoration: const InputDecoration(labelText: 'Nama Perusahaan *'), validator: (v) => v == null || v.trim().isEmpty ? 'Nama perusahaan harus diisi' : null),
                      const SizedBox(height: 12),
                      TextFormField(controller: _kontakPerson, decoration: const InputDecoration(labelText: 'Kontak Person')),
                      const SizedBox(height: 12),
                      TextFormField(controller: _telepon, decoration: const InputDecoration(labelText: 'Telepon'), keyboardType: TextInputType.phone),
                      const SizedBox(height: 12),
                      TextFormField(controller: _email, decoration: const InputDecoration(labelText: 'Email'), keyboardType: TextInputType.emailAddress),
                      const SizedBox(height: 12),
                      TextFormField(controller: _alamat, decoration: const InputDecoration(labelText: 'Alamat'), maxLines: 2),
                      const SizedBox(height: 12),
                      TextFormField(controller: _ketentuanBayar, decoration: const InputDecoration(labelText: 'Ketentuan Bayar')),
                      const SizedBox(height: 12),
                      TextFormField(controller: _catatan, decoration: const InputDecoration(labelText: 'Catatan'), maxLines: 2),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
