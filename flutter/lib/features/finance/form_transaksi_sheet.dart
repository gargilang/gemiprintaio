import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gemiprint/providers/providers.dart';
import 'package:gemiprint/services/api_client.dart';
import 'package:gemiprint/widgets/snackbar_helper.dart';
import 'package:intl/intl.dart';

class FormTransaksiSheet extends ConsumerStatefulWidget {
  final List<Map<String, dynamic>> kategoriOptions;

  const FormTransaksiSheet({super.key, required this.kategoriOptions});

  @override
  ConsumerState<FormTransaksiSheet> createState() => _FormTransaksiSheetState();
}

class _FormTransaksiSheetState extends ConsumerState<FormTransaksiSheet> {
  final _formKey = GlobalKey<FormState>();
  final _rupiahFmt = NumberFormat.currency(
    locale: 'id_ID',
    symbol: 'Rp ',
    decimalDigits: 0,
  );
  bool _isSubmitting = false;

  String _kategori = '';
  bool _isDebit = false;
  DateTime _tanggal = DateTime.now();
  final _jumlahCtrl = TextEditingController();
  final _keperluanCtrl = TextEditingController();
  final _catatanCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    final codes = widget.kategoriOptions
        .map((k) => k['category_code'] as String)
        .toList();
    _kategori = codes.contains('BIAYA')
        ? 'BIAYA'
        : (codes.isNotEmpty ? codes.first : '');
  }

  @override
  void dispose() {
    _jumlahCtrl.dispose();
    _keperluanCtrl.dispose();
    _catatanCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_kategori.isEmpty) {
      showErrorSnackbar(context, 'Kategori transaksi belum tersedia');
      return;
    }
    if (!_formKey.currentState!.validate()) {
      return;
    }

    setState(() => _isSubmitting = true);
    try {
      final jumlah = double.parse(_jumlahCtrl.text.replaceAll('.', ''));
      final tanggalStr =
          '${_tanggal.year}-${_tanggal.month.toString().padLeft(2, '0')}-${_tanggal.day.toString().padLeft(2, '0')}';

      await ref.read(financeServiceProvider).createEntry({
        'tanggal': tanggalStr,
        'kategori_transaksi': _kategori,
        'debit': _isDebit ? jumlah : 0,
        'kredit': !_isDebit ? jumlah : 0,
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

  Color _kategoriColor(String kat) {
    switch (kat.toUpperCase()) {
      case 'KAS':
      case 'MODAL_KAS':
        return const Color(0xFF2563EB);
      case 'BIAYA':
      case 'BIAYA_OPERASIONAL':
      case 'BIAYA_BAHAN':
      case 'SUPPLY':
        return const Color(0xFFD97706);
      case 'OMZET':
      case 'LABA':
      case 'LABA_BERSIH':
        return const Color(0xFF059669);
      case 'PINJAMAN_KARYAWAN':
        return const Color(0xFFDC2626);
      default:
        return const Color(0xFF64748B);
    }
  }

  Color _kategoriBgColor(String kat) {
    switch (kat.toUpperCase()) {
      case 'KAS':
      case 'MODAL_KAS':
        return const Color(0xFFDBEAFE);
      case 'BIAYA':
      case 'BIAYA_OPERASIONAL':
      case 'BIAYA_BAHAN':
      case 'SUPPLY':
        return const Color(0xFFFEF3C7);
      case 'OMZET':
      case 'LABA':
      case 'LABA_BERSIH':
        return const Color(0xFFD1FAE5);
      case 'PINJAMAN_KARYAWAN':
        return const Color(0xFFFEE2E2);
      default:
        return const Color(0xFFF1F5F9);
    }
  }

  Widget _buildKategoriBadge(String code, String name) {
    final color = _kategoriColor(code);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: _kategoriBgColor(code),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        name,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w600,
          color: color,
        ),
      ),
    );
  }

  Widget _buildJenisToggle() {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: Colors.grey.shade100,
        border: Border.all(color: Colors.grey.shade200),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          Expanded(
            child: _buildJenisToggleItem(
              isDebit: true,
              label: 'Debit',
              icon: Icons.arrow_downward_rounded,
            ),
          ),
          const SizedBox(width: 4),
          Expanded(
            child: _buildJenisToggleItem(
              isDebit: false,
              label: 'Kredit',
              icon: Icons.arrow_upward_rounded,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildJenisToggleItem({
    required bool isDebit,
    required String label,
    required IconData icon,
  }) {
    final selected = _isDebit == isDebit;
    final color = isDebit ? Colors.green.shade600 : Colors.red.shade600;
    return GestureDetector(
      onTap: () => setState(() => _isDebit = isDebit),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: selected ? color.withValues(alpha: 0.12) : Colors.transparent,
          border: Border.all(
            color: selected
                ? color.withValues(alpha: 0.45)
                : Colors.transparent,
          ),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              icon,
              size: 16,
              color: selected ? color : Colors.grey.shade500,
            ),
            const SizedBox(width: 6),
            Text(
              label,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: selected ? color : Colors.grey.shade600,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildJumlahHelper() {
    final jumlah = double.tryParse(_jumlahCtrl.text.replaceAll('.', ''));
    if (jumlah == null || jumlah <= 0) {
      return const SizedBox.shrink();
    }

    final color = _isDebit ? Colors.green.shade700 : Colors.red.shade700;
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Text(
        _rupiahFmt.format(jumlah),
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: color,
        ),
      ),
    );
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
            // Pegangan
            Container(
              margin: const EdgeInsets.symmetric(vertical: 8),
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.grey.shade300,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            // Tajuk
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
            // Kolom form (gulir)
            Flexible(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Tanggal
                    const Text(
                      'Tanggal',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
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
                          horizontal: 12,
                          vertical: 12,
                        ),
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
                    const Text(
                      'Kategori',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 4),
                    DropdownButtonFormField<String>(
                      initialValue: _kategori.isEmpty ? null : _kategori,
                      items: widget.kategoriOptions.map((k) {
                        final code = k['category_code'] as String;
                        final name = k['display_name'] as String;
                        return DropdownMenuItem(
                          value: code,
                          child: _buildKategoriBadge(code, name),
                        );
                      }).toList(),
                      onChanged: widget.kategoriOptions.isEmpty
                          ? null
                          : (v) {
                              if (v != null) {
                                setState(() => _kategori = v);
                              }
                            },
                      validator: (v) {
                        if ((v ?? '').isEmpty) {
                          return 'Kategori wajib dipilih';
                        }
                        return null;
                      },
                      decoration: InputDecoration(
                        hintText: widget.kategoriOptions.isEmpty
                            ? 'Kategori belum tersedia'
                            : 'Pilih kategori',
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 10,
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    // Jenis (Debit/Kredit)
                    _buildJenisToggle(),
                    const SizedBox(height: 8),
                    // Jumlah
                    const Text(
                      'Jumlah',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
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
                          horizontal: 12,
                          vertical: 10,
                        ),
                      ),
                      onChanged: (_) => setState(() {}),
                      validator: (v) {
                        if (v == null || v.trim().isEmpty) {
                          return 'Jumlah wajib diisi';
                        }
                        final n = double.tryParse(v.replaceAll('.', ''));
                        if (n == null || n <= 0) {
                          return 'Jumlah tidak valid';
                        }
                        return null;
                      },
                    ),
                    _buildJumlahHelper(),
                    const SizedBox(height: 16),
                    // Keperluan
                    const Text(
                      'Keperluan',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 4),
                    TextFormField(
                      controller: _keperluanCtrl,
                      decoration: InputDecoration(
                        hintText: 'Contoh: Beli ATK',
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 10,
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    // Catatan
                    const Text(
                      'Catatan',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
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
                          horizontal: 12,
                          vertical: 10,
                        ),
                      ),
                    ),
                    const SizedBox(height: 24),
                    // Tombol
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: _isSubmitting || _kategori.isEmpty
                            ? null
                            : _submit,
                        child: Text(_isSubmitting ? 'Menyimpan...' : 'Simpan'),
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
