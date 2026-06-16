import 'package:flutter/material.dart';
import 'package:gemiprint/core/theme/app_theme.dart';
import 'package:gemiprint/features/pos/models/finishing_option.dart';

/// Bottom sheet multi-pilih finishing untuk satu baris keranjang.
/// Mengembalikan daftar [FinishingSelection] yang dipilih, atau null bila batal.
Future<List<FinishingSelection>?> showFinishingPicker(
  BuildContext context, {
  required List<FinishingOption> options,
  required List<FinishingSelection> initial,
}) {
  return showModalBottomSheet<List<FinishingSelection>>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) => _FinishingPickerBody(options: options, initial: initial),
  );
}

class _FinishingPickerBody extends StatefulWidget {
  final List<FinishingOption> options;
  final List<FinishingSelection> initial;
  const _FinishingPickerBody({required this.options, required this.initial});

  @override
  State<_FinishingPickerBody> createState() => _FinishingPickerBodyState();
}

class _FinishingPickerBodyState extends State<_FinishingPickerBody> {
  late final Set<String> _selected;

  @override
  void initState() {
    super.initState();
    _selected = widget.initial.map((f) => f.jenisFinishing).toSet();
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.6,
      expand: false,
      builder: (_, scroll) => Column(
        children: [
          Container(
            margin: const EdgeInsets.symmetric(vertical: 8),
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: Colors.grey.shade300,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text('Finishing',
                  style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold)),
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: widget.options.isEmpty
                ? const Center(
                    child: Text('Tidak ada opsi finishing aktif',
                        style: TextStyle(color: Colors.grey)))
                : ListView(
                    controller: scroll,
                    children: widget.options.map((o) {
                      final checked = _selected.contains(o.nama);
                      return CheckboxListTile(
                        value: checked,
                        activeColor: AppColors.primary,
                        title: Text(o.nama),
                        onChanged: (v) => setState(() {
                          if (v == true) {
                            _selected.add(o.nama);
                          } else {
                            _selected.remove(o.nama);
                          }
                        }),
                      );
                    }).toList(),
                  ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
            child: SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () => Navigator.pop(
                  context,
                  _selected
                      .map((n) => FinishingSelection(jenisFinishing: n))
                      .toList(),
                ),
                child: const Text('Simpan Finishing'),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
