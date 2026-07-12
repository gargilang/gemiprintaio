import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gemiprint/models/katalog_maklon.dart';
import 'package:gemiprint/models/vendor.dart';
import 'package:gemiprint/providers/providers.dart';
import 'package:gemiprint/services/api_client.dart';
import 'package:gemiprint/widgets/snackbar_helper.dart';

/// Form reconcile pending Vendor/HPP untuk baris maklon yang di-checkout
/// tanpa vendor/biaya. Meminta vendor subkontraktor, biaya subkontrak, dan
/// metode bayar. Setelah sukses, kembali `true` agar parent reload.
class ReconcilePendingSheet extends ConsumerStatefulWidget {
  final PendingMaklon item;
  final List<Vendor> vendors;
  const ReconcilePendingSheet({
    super.key,
    required this.item,
    required this.vendors,
  });

  @override
  ConsumerState<ReconcilePendingSheet> createState() =>
      _ReconcilePendingSheetState();
}

class _ReconcilePendingSheetState extends ConsumerState<ReconcilePendingSheet> {
  final _biayaCtrl = TextEditingController();
  String? _vendorId;
  String _metodeBayar = 'CASH';
  bool _saving = false;

  @override
  void dispose() {
    _biayaCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_vendorId == null) {
      showErrorSnackbar(context, 'Vendor subkontrak wajib dipilih');
      return;
    }
    final biaya = double.tryParse(_biayaCtrl.text) ?? 0;
    if (biaya <= 0) {
      showErrorSnackbar(context, 'Biaya subkontrak harus lebih dari 0');
      return;
    }

    setState(() => _saving = true);
    try {
      await ref
          .read(katalogMaklonServiceProvider)
          .reconcilePending(widget.item.id, {
            'vendor_subkontrak_id': _vendorId,
            'biaya_subkontrak': biaya,
            'metode_bayar_vendor': _metodeBayar,
          });
      if (mounted) {
        showSuccessSnackbar(context, 'Pending maklon berhasil direconcile');
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
        showErrorSnackbar(context, 'Gagal menyimpan reconcile');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final subkontraktorVendors = widget.vendors
        .where((v) => v.tipeVendor != 'SUPPLIER')
        .toList();
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: DraggableScrollableSheet(
        initialChildSize: 0.7,
        minChildSize: 0.4,
        maxChildSize: 0.9,
        expand: false,
        builder: (_, scrollCtrl) => Material(
          color: Colors.white,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
          child: Column(
            children: [
              _buildHeader(),
              Expanded(
                child: ListView(
                  controller: scrollCtrl,
                  padding: const EdgeInsets.all(20),
                  children: [
                    _infoRow('Faktur', widget.item.nomorFaktur ?? '-'),
                    _infoRow('Pelanggan', widget.item.pelangganNama ?? '-'),
                    _infoRow(
                      'Pekerjaan',
                      widget.item.deskripsiPekerjaan ?? '-',
                    ),
                    _infoRow(
                      'Subtotal',
                      'Rp ${widget.item.subtotal.toStringAsFixed(0)}',
                    ),
                    const SizedBox(height: 16),
                    DropdownButtonFormField<String>(
                      initialValue: _vendorId,
                      decoration: const InputDecoration(
                        labelText: 'Vendor Subkontrak *',
                      ),
                      items: subkontraktorVendors.map((v) {
                        return DropdownMenuItem<String>(
                          value: v.id,
                          child: Text(v.namaPerusahaan),
                        );
                      }).toList(),
                      onChanged: (v) => setState(() => _vendorId = v),
                    ),
                    const SizedBox(height: 14),
                    TextFormField(
                      controller: _biayaCtrl,
                      decoration: const InputDecoration(
                        labelText: 'Biaya Subkontrak *',
                        prefixText: 'Rp ',
                      ),
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                    ),
                    const SizedBox(height: 14),
                    DropdownButtonFormField<String>(
                      initialValue: _metodeBayar,
                      decoration: const InputDecoration(
                        labelText: 'Metode Bayar ke Vendor',
                      ),
                      items: const [
                        DropdownMenuItem(value: 'CASH', child: Text('CASH')),
                        DropdownMenuItem(
                          value: 'TRANSFER',
                          child: Text('TRANSFER'),
                        ),
                        DropdownMenuItem(value: 'NET30', child: Text('NET30')),
                      ],
                      onChanged: (v) =>
                          setState(() => _metodeBayar = v ?? 'CASH'),
                    ),
                  ],
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
              'Isi Vendor & HPP',
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

  Widget _infoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 88,
            child: Text(
              label,
              style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
            ),
          ),
        ],
      ),
    );
  }
}
