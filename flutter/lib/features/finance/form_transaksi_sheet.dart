import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gemiprint/providers/providers.dart';
import 'package:gemiprint/services/api_client.dart';
import 'package:gemiprint/widgets/snackbar_helper.dart';
import 'package:intl/intl.dart';

class FormTransaksiSheet extends ConsumerStatefulWidget {
  final List<String> kategoriOptions;

  const FormTransaksiSheet({super.key, required this.kategoriOptions});

  @override
  ConsumerState<FormTransaksiSheet> createState() => _FormTransaksiSheetState();
}

class _FormTransaksiSheetState extends ConsumerState<FormTransaksiSheet> {
  final _formKey = GlobalKey<FormState>();
  bool _isSubmitting = false;

  String _kategori = 'KAS';
  String _jenis = 'kredit'; // 'debit' atau 'kredit'
  DateTime _tanggal = DateTime.now();
  final _jumlahCtrl = TextEditingController();
  final _keperluanCtrl = TextEditingController();
  final _catatanCtrl = TextEditingController();

  @override
  void dispose() {
    _jumlahCtrl.dispose();
    _keperluanCtrl.dispose();
    _catatanCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isSubmitting = true);
    try {
      final jumlah = double.parse(_jumlahCtrl.text.replaceAll('.', ''));
      final tanggalStr =
          '${_tanggal.year}-${_tanggal.month.toString().padLeft(2, '0')}-${_tanggal.day.toString().padLeft(2, '0')}';

      await ref.read(financeServiceProvider).createEntry({
        'tanggal': tanggalStr,
        'kategori_transaksi': _kategori,
        'debit': _jenis == 'debit' ? jumlah : 0,
        'kredit': _jenis == 'kredit' ? jumlah : 0,
        'keperluan': _keperluanCtrl.text.trim(),
        'catatan': _catatanCtrl.text.trim(),
      });

      if (mounted) {
        showSuccessSnackbar(context, 'Transaksi berhasil ditambahkan');
        Navigator.pop(context, true);
      }
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _isSubmitting = false);
        showErrorSnackbar(context, e.message);
      }
    } catch (_) {
      if (mounted) {
        setState(() => _isSubmitting = false);
        showErrorSnackbar(context, 'Gagal menambahkan transaksi');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.85,
      ),
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Handle
            Container(
              margin: const EdgeInsets.symmetric(vertical: 8),
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.grey.shade300,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            // Header
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    'Tambah Transaksi',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
            ),
            const Divider(height: 1),
            // Form fields (scrollable)
            Flexible(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Tanggal
                    const Text('Tanggal',
                        style: TextStyle(
                            fontSize: 13, fontWeight: FontWeight.w500)),
                    const SizedBox(height: 4),
                    InkWell(
                      onTap: () async {
                        final picked = await showDatePicker(
                          context: context,
                          initialDate: _tanggal,
                          firstDate: DateTime(2020),
                          lastDate: DateTime(2100),
                        );
                        if (picked != null) {
                          setState(() => _tanggal = picked);
                        }
                      },
                      child: Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 12),
                        decoration: BoxDecoration(
                          border: Border.all(color: Colors.grey.shade300),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          DateFormat('dd MMMM yyyy', 'id_ID').format(_tanggal),
                          style: const TextStyle(fontSize: 14),
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    // Kategori
                    const Text('Kategori',
                        style: TextStyle(
                            fontSize: 13, fontWeight: FontWeight.w500)),
                    const SizedBox(height: 4),
                    DropdownButtonFormField<String>(
                      value: _kategori,
                      items: widget.kategoriOptions
                          .map((k) => DropdownMenuItem(
                                value: k,
                                child: Text(k, style: const TextStyle(fontSize: 14)),
                              ))
                          .toList(),
                      onChanged: (v) => setState(() => _kategori = v!),
                      decoration: InputDecoration(
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 10),
                      ),
                    ),
                    const SizedBox(height: 16),
                    // Jenis (Debit/Kredit)
                    Row(
                      children: [
                        Expanded(
                          child: RadioListTile<String>(
                            title: const Text('Pengeluaran (Debit)',
                                style: TextStyle(fontSize: 13)),
                            value: 'debit',
                            groupValue: _jenis,
                            onChanged: (v) => setState(() => _jenis = v!),
                            dense: true,
                            contentPadding: EdgeInsets.zero,
                          ),
                        ),
                        Expanded(
                          child: RadioListTile<String>(
                            title: const Text('Pemasukan (Kredit)',
                                style: TextStyle(fontSize: 13)),
                            value: 'kredit',
                            groupValue: _jenis,
                            onChanged: (v) => setState(() => _jenis = v!),
                            dense: true,
                            contentPadding: EdgeInsets.zero,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    // Jumlah
                    const Text('Jumlah',
                        style: TextStyle(
                            fontSize: 13, fontWeight: FontWeight.w500)),
                    const SizedBox(height: 4),
                    TextFormField(
                      controller: _jumlahCtrl,
                      keyboardType: TextInputType.number,
                      decoration: InputDecoration(
                        hintText: '0',
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 10),
                      ),
                      validator: (v) {
                        if (v == null || v.trim().isEmpty) {
                          return 'Jumlah wajib diisi';
                        }
                        final n = double.tryParse(v.replaceAll('.', ''));
                        if (n == null || n <= 0) return 'Jumlah tidak valid';
                        return null;
                      },
                    ),
                    const SizedBox(height: 16),
                    // Keperluan
                    const Text('Keperluan',
                        style: TextStyle(
                            fontSize: 13, fontWeight: FontWeight.w500)),
                    const SizedBox(height: 4),
                    TextFormField(
                      controller: _keperluanCtrl,
                      decoration: InputDecoration(
                        hintText: 'Contoh: Beli ATK',
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 10),
                      ),
                    ),
                    const SizedBox(height: 16),
                    // Catatan
                    const Text('Catatan',
                        style: TextStyle(
                            fontSize: 13, fontWeight: FontWeight.w500)),
                    const SizedBox(height: 4),
                    TextFormField(
                      controller: _catatanCtrl,
                      maxLines: 2,
                      decoration: InputDecoration(
                        hintText: 'Opsional',
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 10),
                      ),
                    ),
                    const SizedBox(height: 24),
                    // Tombol
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: _isSubmitting ? null : _submit,
                        child: Text(
                          _isSubmitting ? 'Menyimpan...' : 'Simpan',
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
