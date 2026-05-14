import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gemiprint/models/customer.dart';
import 'package:gemiprint/providers/providers.dart';
import 'package:gemiprint/services/api_client.dart';
import 'package:gemiprint/widgets/snackbar_helper.dart';

class CustomerFormDialog extends ConsumerStatefulWidget {
  final Customer? existing;
  const CustomerFormDialog({super.key, this.existing});

  @override
  ConsumerState<CustomerFormDialog> createState() => _CustomerFormDialogState();
}

class _CustomerFormDialogState extends ConsumerState<CustomerFormDialog> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _nama;
  late final TextEditingController _namaPerusahaan;
  late final TextEditingController _email;
  late final TextEditingController _telepon;
  late final TextEditingController _alamat;
  late final TextEditingController _npwp;
  late bool _isMember;
  bool _isSaving = false;

  bool get _isEditing => widget.existing != null;

  @override
  void initState() {
    super.initState();
    final c = widget.existing;
    _nama = TextEditingController(text: c?.nama ?? '');
    _namaPerusahaan = TextEditingController(text: c?.namaPerusahaan ?? '');
    _email = TextEditingController(text: c?.email ?? '');
    _telepon = TextEditingController(text: c?.telepon ?? '');
    _alamat = TextEditingController(text: c?.alamat ?? '');
    _npwp = TextEditingController(text: c?.npwp ?? '');
    _isMember = c?.isMember ?? false;
  }

  @override
  void dispose() {
    _nama.dispose();
    _namaPerusahaan.dispose();
    _email.dispose();
    _telepon.dispose();
    _alamat.dispose();
    _npwp.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _isSaving = true);

    final body = {
      if (_isEditing) 'id': widget.existing!.id,
      'nama': _nama.text.trim(),
      'nama_perusahaan': _namaPerusahaan.text.trim(),
      'email': _email.text.trim(),
      'telepon': _telepon.text.trim(),
      'alamat': _alamat.text.trim(),
      'npwp': _npwp.text.trim(),
      'member_status': _isMember,
    };

    try {
      if (_isEditing) {
        await ref.read(customersServiceProvider).update(body);
      } else {
        await ref.read(customersServiceProvider).create(body);
      }
      if (mounted) {
        showSuccessSnackbar(context, _isEditing ? 'Pelanggan berhasil diperbarui' : 'Pelanggan berhasil ditambahkan');
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
                    Expanded(child: Text(_isEditing ? 'Edit Pelanggan' : 'Tambah Pelanggan', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600))),
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
                      TextFormField(controller: _nama, decoration: const InputDecoration(labelText: 'Nama *'), validator: (v) => v == null || v.trim().isEmpty ? 'Nama harus diisi' : null),
                      const SizedBox(height: 12),
                      TextFormField(controller: _namaPerusahaan, decoration: const InputDecoration(labelText: 'Nama Perusahaan')),
                      const SizedBox(height: 12),
                      TextFormField(controller: _telepon, decoration: const InputDecoration(labelText: 'Telepon'), keyboardType: TextInputType.phone),
                      const SizedBox(height: 12),
                      TextFormField(controller: _email, decoration: const InputDecoration(labelText: 'Email'), keyboardType: TextInputType.emailAddress),
                      const SizedBox(height: 12),
                      TextFormField(controller: _alamat, decoration: const InputDecoration(labelText: 'Alamat'), maxLines: 2),
                      const SizedBox(height: 12),
                      TextFormField(controller: _npwp, decoration: const InputDecoration(labelText: 'NPWP')),
                      const SizedBox(height: 12),
                      SwitchListTile(
                        title: const Text('Status Member'),
                        subtitle: const Text('Member mendapat harga khusus'),
                        value: _isMember,
                        onChanged: (v) => setState(() => _isMember = v),
                        contentPadding: EdgeInsets.zero,
                      ),
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
