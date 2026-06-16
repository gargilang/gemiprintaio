import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gemiprint/models/customer.dart';
import 'package:gemiprint/providers/providers.dart';
import 'package:gemiprint/services/api_client.dart';
import 'package:gemiprint/widgets/snackbar_helper.dart';

class CustomerFormSheet extends ConsumerStatefulWidget {
  final Customer? existing;
  const CustomerFormSheet({super.key, this.existing});

  @override
  ConsumerState<CustomerFormSheet> createState() => _CustomerFormSheetState();
}

class _CustomerFormSheetState extends ConsumerState<CustomerFormSheet> {
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

    final body = <String, dynamic>{
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
      final service = ref.read(customersServiceProvider);
      if (_isEditing) {
        await service.update(body);
      } else {
        await service.create(body);
      }
      if (mounted) {
        showSuccessSnackbar(
          context,
          _isEditing ? 'Pelanggan berhasil diperbarui' : 'Pelanggan berhasil ditambahkan',
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
                        _isEditing ? 'Edit Pelanggan' : 'Tambah Pelanggan',
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
                        controller: _nama,
                        decoration: const InputDecoration(
                          labelText: 'Nama *',
                          hintText: 'Nama pelanggan',
                        ),
                        validator: (v) => v == null || v.trim().isEmpty ? 'Nama harus diisi' : null,
                        textInputAction: TextInputAction.next,
                      ),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _namaPerusahaan,
                        decoration: const InputDecoration(
                          labelText: 'Nama Perusahaan',
                          hintText: 'PT/CV/UD ...',
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
                      TextFormField(
                        controller: _npwp,
                        decoration: const InputDecoration(
                          labelText: 'NPWP',
                          hintText: '00.000.000.0-000.000',
                        ),
                        textInputAction: TextInputAction.done,
                      ),
                      const SizedBox(height: 8),
                      const Divider(),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: const [
                                Text('Status Member', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w500)),
                                SizedBox(height: 4),
                                Text('Member mendapat harga khusus', style: TextStyle(fontSize: 13, color: Colors.grey)),
                              ],
                            ),
                          ),
                          Switch(
                            value: _isMember,
                            onChanged: (v) => setState(() => _isMember = v),
                          ),
                        ],
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
