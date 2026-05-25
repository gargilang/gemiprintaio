import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gemiprint/core/constants/roles.dart';
import 'package:gemiprint/core/theme/app_theme.dart';
import 'package:gemiprint/models/customer.dart';
import 'package:gemiprint/models/material_item.dart';
import 'package:gemiprint/models/sale.dart';
import 'package:gemiprint/providers/providers.dart';
import 'package:gemiprint/services/api_client.dart';
import 'package:gemiprint/widgets/search_field.dart';
import 'package:gemiprint/widgets/snackbar_helper.dart';
import 'package:gemiprint/widgets/confirm_dialog.dart';
import 'package:intl/intl.dart';

// ---------------------------------------------------------------------------
// Model keranjang
// ---------------------------------------------------------------------------

class _CartItem {
  final MaterialItem material;
  final MaterialPrice selectedPrice;
  double quantity;
  double? panjang;
  double? lebar;

  _CartItem({
    required this.material,
    required this.selectedPrice,
    this.quantity = 1,
    this.panjang,
    this.lebar,
  });

  double get jumlah {
    if (material.dimensiRequired && panjang != null && lebar != null) {
      return panjang! * lebar!;
    }
    return quantity;
  }

  double hargaSatuan({bool isMember = false}) =>
      selectedPrice.hargaUntuk(isMember: isMember);

  double subtotal({bool isMember = false}) =>
      jumlah * hargaSatuan(isMember: isMember);
}

/// Urutan tampilan kategori (selaras dengan web / kategori_barang default).
const _kategoriOrder = [
  'Media Cetak',
  'Kertas',
  'Kertas Foto',
  'Merchandise',
  'Substrat UV',
  'Tinta & Consumables',
  'Finishing',
  'Lain-lain',
];

// ---------------------------------------------------------------------------
// Halaman POS
// ---------------------------------------------------------------------------

class PosPage extends ConsumerStatefulWidget {
  const PosPage({super.key});

  @override
  ConsumerState<PosPage> createState() => _PosPageState();
}

class _PosPageState extends ConsumerState<PosPage>
    with SingleTickerProviderStateMixin {
  late TabController _tabCtrl;

  List<MaterialItem> _materials = [];
  List<Customer> _customers = [];
  List<Sale> _sales = [];
  final List<_CartItem> _cart = [];

  bool _isLoading = true;
  String _materialSearch = '';
  String _materialCategoryFilter = 'ALL';
  String _salesSearch = '';

  Customer? _selectedCustomer;
  String _paymentMethod = 'CASH';
  String _prioritas = 'NORMAL';
  final _catatanCtrl = TextEditingController();
  final _jumlahBayarCtrl = TextEditingController();
  final _customerSearchCtrl = TextEditingController();

  final _fmt = NumberFormat.currency(
    locale: 'id_ID',
    symbol: 'Rp ',
    decimalDigits: 0,
  );

  @override
  void initState() {
    super.initState();
    _tabCtrl = TabController(length: 2, vsync: this);
    _loadData();
  }

  @override
  void dispose() {
    _tabCtrl.dispose();
    _catatanCtrl.dispose();
    _jumlahBayarCtrl.dispose();
    _customerSearchCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadData({bool forceRefresh = false}) async {
    if (_materials.isEmpty) {
      setState(() => _isLoading = true);
    }
    try {
      final api = ref.read(apiClientProvider);
      final data = await api.get(
        '/api/pos/init-data',
        forceRefresh: forceRefresh,
      );
      if (mounted) {
        setState(() {
          _materials =
              (data['materials'] as List?)
                  ?.map((j) => MaterialItem.fromJson(j as Map<String, dynamic>))
                  .toList() ??
              [];
          _customers =
              (data['customers'] as List?)
                  ?.map((j) => Customer.fromJson(j as Map<String, dynamic>))
                  .toList() ??
              [];
          _sales =
              (data['sales'] as List?)
                  ?.map((j) => Sale.fromJson(j as Map<String, dynamic>))
                  .toList() ??
              [];
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        showErrorSnackbar(context, 'Gagal memuat data POS');
      }
    }
  }

  List<String> get _materialCategories {
    final names = <String>{};
    for (final m in _materials) {
      final k = m.kategoriNama;
      if (k != null && k.isNotEmpty) names.add(k);
    }
    final list = names.toList();
    list.sort((a, b) {
      final ia = _kategoriOrder.indexOf(a);
      final ib = _kategoriOrder.indexOf(b);
      if (ia == -1 && ib == -1) return a.compareTo(b);
      if (ia == -1) return 1;
      if (ib == -1) return -1;
      return ia.compareTo(ib);
    });
    return list;
  }

  List<MaterialItem> get _filteredMaterials {
    var list = _materials;
    if (_materialCategoryFilter != 'ALL') {
      list = list
          .where((m) => m.kategoriNama == _materialCategoryFilter)
          .toList();
    }
    final q = _materialSearch.trim().toLowerCase();
    if (q.isEmpty) return list;
    return list
        .where(
          (m) =>
              m.nama.toLowerCase().contains(q) ||
              (m.kategoriNama?.toLowerCase().contains(q) ?? false),
        )
        .toList();
  }

  Widget _categoryChip(String label, String value) {
    final selected = _materialCategoryFilter == value;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: FilterChip(
        label: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: selected ? Colors.white : AppColors.primaryDark,
          ),
        ),
        selected: selected,
        onSelected: (_) => setState(() => _materialCategoryFilter = value),
        selectedColor: AppColors.primary,
        backgroundColor: Colors.white,
        showCheckmark: false,
        side: BorderSide(
          color: selected ? AppColors.primary : Colors.grey.shade300,
          width: 1.5,
        ),
        padding: const EdgeInsets.symmetric(horizontal: 4),
        materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
        visualDensity: VisualDensity.compact,
      ),
    );
  }

  bool get _isMemberSelected => _selectedCustomer?.isMember ?? false;

  bool get _canUseRiskyActions {
    final role = ref.read(authStateProvider).valueOrNull?.role;
    return role != null && RoleGroups.adminOnly.contains(role);
  }

  double get _totalCart =>
      _cart.fold(0.0, (s, c) => s + c.subtotal(isMember: _isMemberSelected));

  double get _jumlahBayar =>
      double.tryParse(_jumlahBayarCtrl.text.replaceAll(',', '')) ?? 0;

  double get _kembalian => _paymentMethod == 'NET30'
      ? 0
      : (_jumlahBayar - _totalCart).clamp(0, double.infinity);

  double get _kurang => _paymentMethod == 'NET30'
      ? 0
      : (_totalCart - _jumlahBayar).clamp(0, double.infinity);

  // ---------------------------------------------------------------------------
  // Add to cart – opens bottom sheet
  // ---------------------------------------------------------------------------

  void _showAddToCartSheet(MaterialItem m) {
    if (m.harga.isEmpty) {
      showErrorSnackbar(context, 'Barang ini belum memiliki harga');
      return;
    }

    final defaultPrice = m.harga.firstWhere(
      (p) => p.isDefault,
      orElse: () => m.harga.first,
    );

    MaterialPrice selectedPrice = defaultPrice;
    final qtyCtrl = TextEditingController(text: '1');
    final panjangCtrl = TextEditingController();
    final lebarCtrl = TextEditingController();

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => Padding(
          padding: EdgeInsets.only(
            bottom: MediaQuery.of(ctx).viewInsets.bottom,
          ),
          child: DraggableScrollableSheet(
            initialChildSize: 0.7,
            expand: false,
            builder: (_, scroll) => Column(
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
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 8,
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          m.nama,
                          style: const TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.close),
                        onPressed: () => Navigator.pop(ctx),
                      ),
                    ],
                  ),
                ),
                const Divider(height: 1),
                Expanded(
                  child: ListView(
                    controller: scroll,
                    padding: const EdgeInsets.all(16),
                    children: [
                      // Satuan / Harga
                      const Text(
                        'Satuan & Harga',
                        style: TextStyle(
                          fontWeight: FontWeight.w600,
                          fontSize: 13,
                        ),
                      ),
                      const SizedBox(height: 8),
                      ...m.harga.map(
                        (p) => RadioListTile<MaterialPrice>(
                          dense: true,
                          value: p,
                          // ignore: deprecated_member_use
                          groupValue: selectedPrice,
                          // ignore: deprecated_member_use
                          onChanged: (v) => setLocal(() => selectedPrice = v!),
                          title: Text(
                            p.label,
                            style: const TextStyle(fontSize: 14),
                          ),
                          subtitle: Text(
                            _isMemberSelected && p.hargaMember > 0
                                ? '${_fmt.format(p.hargaMember)} (member)'
                                : _fmt.format(p.hargaJual),
                            style: TextStyle(
                              color: AppColors.primary,
                              fontSize: 13,
                            ),
                          ),
                          secondary: p.isDefault
                              ? Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 6,
                                    vertical: 2,
                                  ),
                                  decoration: BoxDecoration(
                                    color: AppColors.primary.withValues(
                                      alpha: 0.1,
                                    ),
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: const Text(
                                    'Default',
                                    style: TextStyle(
                                      fontSize: 10,
                                      color: AppColors.primary,
                                    ),
                                  ),
                                )
                              : null,
                        ),
                      ),
                      const SizedBox(height: 16),

                      // Dimensi (kalau perlu)
                      if (m.dimensiRequired) ...[
                        const Text(
                          'Dimensi (meter)',
                          style: TextStyle(
                            fontWeight: FontWeight.w600,
                            fontSize: 13,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            Expanded(
                              child: TextFormField(
                                controller: panjangCtrl,
                                keyboardType:
                                    const TextInputType.numberWithOptions(
                                      decimal: true,
                                    ),
                                decoration: const InputDecoration(
                                  labelText: 'Panjang (m)',
                                  isDense: true,
                                ),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: TextFormField(
                                controller: lebarCtrl,
                                keyboardType:
                                    const TextInputType.numberWithOptions(
                                      decimal: true,
                                    ),
                                decoration: const InputDecoration(
                                  labelText: 'Lebar (m)',
                                  isDense: true,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),
                      ],

                      // Jumlah (untuk non-dimensi)
                      if (!m.dimensiRequired) ...[
                        const Text(
                          'Jumlah',
                          style: TextStyle(
                            fontWeight: FontWeight.w600,
                            fontSize: 13,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            IconButton(
                              icon: const Icon(Icons.remove_circle_outline),
                              onPressed: () {
                                final v = int.tryParse(qtyCtrl.text) ?? 1;
                                if (v > 1) {
                                  qtyCtrl.text = (v - 1).toString();
                                  setLocal(() {});
                                }
                              },
                            ),
                            Expanded(
                              child: TextFormField(
                                controller: qtyCtrl,
                                keyboardType: TextInputType.number,
                                textAlign: TextAlign.center,
                                decoration: const InputDecoration(
                                  isDense: true,
                                  contentPadding: EdgeInsets.symmetric(
                                    vertical: 10,
                                    horizontal: 8,
                                  ),
                                ),
                                onChanged: (_) => setLocal(() {}),
                              ),
                            ),
                            IconButton(
                              icon: const Icon(
                                Icons.add_circle_outline,
                                color: AppColors.primary,
                              ),
                              onPressed: () {
                                final v = int.tryParse(qtyCtrl.text) ?? 1;
                                qtyCtrl.text = (v + 1).toString();
                                setLocal(() {});
                              },
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),
                      ],

                      // Preview subtotal
                      StatefulBuilder(
                        builder: (_, ss) {
                          double previewSubtotal = 0;
                          if (m.dimensiRequired) {
                            final p = double.tryParse(panjangCtrl.text) ?? 0;
                            final l = double.tryParse(lebarCtrl.text) ?? 0;
                            previewSubtotal =
                                selectedPrice.hargaUntuk(
                                  isMember: _isMemberSelected,
                                ) *
                                p *
                                l;
                          } else {
                            final qty = double.tryParse(qtyCtrl.text) ?? 1;
                            previewSubtotal =
                                selectedPrice.hargaUntuk(
                                  isMember: _isMemberSelected,
                                ) *
                                qty;
                          }
                          return Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: AppColors.primary.withValues(alpha: 0.08),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                const Text(
                                  'Subtotal',
                                  style: TextStyle(fontWeight: FontWeight.w600),
                                ),
                                Text(
                                  _fmt.format(previewSubtotal),
                                  style: const TextStyle(
                                    fontWeight: FontWeight.bold,
                                    fontSize: 16,
                                    color: AppColors.primary,
                                  ),
                                ),
                              ],
                            ),
                          );
                        },
                      ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                  child: SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      icon: const Icon(Icons.add_shopping_cart_rounded),
                      label: const Text('Tambah ke Keranjang'),
                      onPressed: () {
                        if (m.dimensiRequired) {
                          final p = double.tryParse(panjangCtrl.text);
                          final l = double.tryParse(lebarCtrl.text);
                          if (p == null || l == null || p <= 0 || l <= 0) {
                            showErrorSnackbar(
                              ctx,
                              'Masukkan panjang dan lebar yang valid',
                            );
                            return;
                          }
                          setState(() {
                            _cart.add(
                              _CartItem(
                                material: m,
                                selectedPrice: selectedPrice,
                                panjang: p,
                                lebar: l,
                              ),
                            );
                          });
                        } else {
                          final qty = double.tryParse(qtyCtrl.text) ?? 1;
                          if (qty <= 0) {
                            showErrorSnackbar(ctx, 'Jumlah harus lebih dari 0');
                            return;
                          }
                          setState(() {
                            _cart.add(
                              _CartItem(
                                material: m,
                                selectedPrice: selectedPrice,
                                quantity: qty,
                              ),
                            );
                          });
                        }
                        Navigator.pop(ctx);
                      },
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Checkout
  // ---------------------------------------------------------------------------

  Future<void> _checkout() async {
    if (_cart.isEmpty) {
      showErrorSnackbar(context, 'Keranjang kosong');
      return;
    }

    if (_paymentMethod != 'NET30') {
      if (_jumlahBayarCtrl.text.trim().isEmpty) {
        showErrorSnackbar(context, 'Masukkan jumlah pembayaran');
        return;
      }
    }

    final total = _totalCart;
    final bayar = _paymentMethod == 'NET30' ? 0.0 : _jumlahBayar;
    final kembalian = _kembalian;

    final confirmed = await showConfirmDialog(
      context,
      title: 'Konfirmasi Transaksi',
      message: _paymentMethod == 'NET30'
          ? 'Total: ${_fmt.format(total)}\nMetode: NET30 (Piutang Penuh)\nProses transaksi ini?'
          : 'Total: ${_fmt.format(total)}\nDibayar: ${_fmt.format(bayar)}'
                '${kembalian > 0 ? '\nKembalian: ${_fmt.format(kembalian)}' : ''}'
                '${_kurang > 0 ? '\nKurang: ${_fmt.format(_kurang)}' : ''}'
                '\nProses transaksi ini?',
    );
    if (!confirmed) return;

    final user = ref.read(authStateProvider).valueOrNull;

    final items = _cart.map((c) {
      final harga = c.selectedPrice.hargaUntuk(isMember: _isMemberSelected);
      return {
        'barang_id': c.material.id,
        'harga_satuan_id': c.selectedPrice.id,
        'nama_satuan': c.selectedPrice.label,
        'faktor_konversi': c.selectedPrice.faktorKonversi,
        'jumlah': c.jumlah,
        'harga_satuan': harga,
        'subtotal': c.subtotal(isMember: _isMemberSelected),
        if (c.panjang != null) 'panjang': c.panjang,
        if (c.lebar != null) 'lebar': c.lebar,
      };
    }).toList();

    try {
      final result = await ref.read(posServiceProvider).createSale({
        if (_selectedCustomer != null) 'pelanggan_id': _selectedCustomer!.id,
        'items': items,
        'total_jumlah': total,
        'jumlah_dibayar': bayar,
        'jumlah_kembalian': kembalian,
        'metode_pembayaran': _paymentMethod,
        'catatan': _catatanCtrl.text.trim().isEmpty
            ? null
            : _catatanCtrl.text.trim(),
        'kasir_id': user?.id,
        'prioritas': _prioritas,
      });
      if (mounted) {
        final invoice =
            result['sale']?['nomor_invoice'] ?? result['nomor_invoice'] ?? '';
        final spk = result['spk_number'] ?? '';
        showSuccessSnackbar(context, 'Invoice $invoice berhasil! SPK: $spk');
        setState(() {
          _cart.clear();
          _selectedCustomer = null;
          _customerSearchCtrl.clear();
          _catatanCtrl.clear();
          _jumlahBayarCtrl.clear();
          _paymentMethod = 'CASH';
          _prioritas = 'NORMAL';
        });
        _loadData();
      }
    } on ApiException catch (e) {
      if (mounted) showErrorSnackbar(context, e.message);
    }
  }

  // ---------------------------------------------------------------------------
  // Terima Piutang
  // ---------------------------------------------------------------------------

  void _showTerimapiutangSheet() async {
    try {
      final data = await ref.read(posServiceProvider).getReceivables();
      final receivables = (data['receivables'] as List?) ?? [];
      if (!mounted) return;

      if (receivables.isEmpty) {
        showErrorSnackbar(context, 'Tidak ada piutang aktif');
        return;
      }

      showModalBottomSheet(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        builder: (ctx) => _TerimapiutangSheet(
          receivables: receivables,
          posService: ref.read(posServiceProvider),
          fmt: _fmt,
          currentUserId: ref.read(authStateProvider).valueOrNull?.id,
          onSuccess: () {
            showSuccessSnackbar(context, 'Pembayaran piutang berhasil');
            _loadData();
          },
        ),
      );
    } on ApiException catch (e) {
      if (mounted) showErrorSnackbar(context, e.message);
    }
  }

  // ---------------------------------------------------------------------------
  // Delete & Revert
  // ---------------------------------------------------------------------------

  Future<void> _deleteSale(Sale s) async {
    if (!_canUseRiskyActions) return;
    final ok = await showConfirmDialog(
      context,
      title: 'Batalkan Penjualan',
      message:
          'Batalkan invoice ${s.nomorInvoice}?\n'
          'Tindakan ini akan membatalkan transaksi dan mengembalikan stok.',
      isDangerous: true,
    );
    if (!ok) return;
    try {
      await ref.read(posServiceProvider).deleteSale(s.id);
      if (mounted) {
        showSuccessSnackbar(context, 'Penjualan berhasil dibatalkan');
        _loadData();
      }
    } on ApiException catch (e) {
      if (mounted) showErrorSnackbar(context, e.message);
    }
  }

  Future<void> _revertPayment(Sale s) async {
    if (!_canUseRiskyActions) return;
    final ok = await showConfirmDialog(
      context,
      title: 'Batalkan Pembayaran Piutang',
      message:
          'Batalkan SEMUA riwayat pembayaran untuk invoice '
          '${s.nomorInvoice}?\n\nTindakan ini tidak dapat dibatalkan.',
      isDangerous: true,
    );
    if (!ok) return;
    try {
      await ref.read(posServiceProvider).revertPayment({'sale_id': s.id});
      if (mounted) {
        showSuccessSnackbar(
          context,
          'Status pembayaran dikembalikan ke PIUTANG',
        );
        _loadData();
      }
    } on ApiException catch (e) {
      if (mounted) showErrorSnackbar(context, e.message);
    }
  }

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    if (_isLoading) return const Center(child: CircularProgressIndicator());

    return Column(
      children: [
        TabBar(
          controller: _tabCtrl,
          labelColor: AppColors.primary,
          tabs: const [
            Tab(text: 'Kasir'),
            Tab(text: 'Riwayat'),
          ],
        ),
        Expanded(
          child: TabBarView(
            controller: _tabCtrl,
            children: [_buildCashierTab(), _buildHistoryTab()],
          ),
        ),
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // Tab Kasir
  // ---------------------------------------------------------------------------

  Widget _buildCashierTab() {
    return Column(
      children: [
        Expanded(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Kiri: Pilih barang
              Expanded(
                flex: 3,
                child: Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(8, 8, 4, 4),
                      child: SearchField(
                        hintText: 'Cari barang...',
                        onChanged: (v) => setState(() => _materialSearch = v),
                      ),
                    ),
                    if (_materialCategories.isNotEmpty)
                      SizedBox(
                        height: 40,
                        child: ListView(
                          scrollDirection: Axis.horizontal,
                          padding: const EdgeInsets.fromLTRB(8, 0, 8, 6),
                          children: [
                            _categoryChip('Semua', 'ALL'),
                            ..._materialCategories.map(
                              (cat) => _categoryChip(cat, cat),
                            ),
                          ],
                        ),
                      ),
                    Expanded(
                      child: _filteredMaterials.isEmpty
                          ? const Center(
                              child: Text(
                                'Tidak ada barang',
                                style: TextStyle(color: Colors.grey),
                              ),
                            )
                          : GridView.builder(
                              padding: const EdgeInsets.all(8),
                              gridDelegate:
                                  const SliverGridDelegateWithFixedCrossAxisCount(
                                    crossAxisCount: 2,
                                    crossAxisSpacing: 6,
                                    mainAxisSpacing: 6,
                                    childAspectRatio: 1.4,
                                  ),
                              itemCount: _filteredMaterials.length,
                              itemBuilder: (_, i) {
                                final m = _filteredMaterials[i];
                                final defaultP = m.harga.isNotEmpty
                                    ? m.harga.firstWhere(
                                        (p) => p.isDefault,
                                        orElse: () => m.harga.first,
                                      )
                                    : null;
                                return GestureDetector(
                                  onTap: () => _showAddToCartSheet(m),
                                  child: Container(
                                    decoration: BoxDecoration(
                                      color: Colors.white,
                                      borderRadius: BorderRadius.circular(10),
                                      border: Border.all(
                                        color: Colors.grey.shade200,
                                      ),
                                    ),
                                    padding: const EdgeInsets.all(8),
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          m.nama,
                                          style: const TextStyle(
                                            fontWeight: FontWeight.w600,
                                            fontSize: 12,
                                          ),
                                          maxLines: 2,
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                        if (m.kategoriNama != null)
                                          Text(
                                            m.kategoriNama!,
                                            style: TextStyle(
                                              fontSize: 10,
                                              color: Colors.grey.shade500,
                                            ),
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                        const Spacer(),
                                        if (defaultP != null)
                                          Text(
                                            _fmt.format(
                                              defaultP.hargaUntuk(
                                                isMember: _isMemberSelected,
                                              ),
                                            ),
                                            style: const TextStyle(
                                              color: AppColors.primary,
                                              fontWeight: FontWeight.bold,
                                              fontSize: 12,
                                            ),
                                          ),
                                      ],
                                    ),
                                  ),
                                );
                              },
                            ),
                    ),
                  ],
                ),
              ),
              Container(width: 1, color: Colors.grey.shade200),
              // Kanan: Keranjang + checkout
              Expanded(flex: 2, child: _buildCartPanel()),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildCartPanel() {
    return Column(
      children: [
        // Customer selector
        Padding(
          padding: const EdgeInsets.fromLTRB(8, 8, 8, 4),
          child: DropdownButtonFormField<String?>(
            initialValue: _selectedCustomer?.id,
            isDense: true,
            decoration: const InputDecoration(
              labelText: 'Pelanggan',
              contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            ),
            items: [
              const DropdownMenuItem(value: null, child: Text('Walk-in')),
              ..._customers.map(
                (c) => DropdownMenuItem(
                  value: c.id,
                  child: Row(
                    children: [
                      Flexible(
                        child: Text(
                          c.nama,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 13),
                        ),
                      ),
                      if (c.isMember) ...[
                        const SizedBox(width: 4),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 4,
                            vertical: 1,
                          ),
                          decoration: BoxDecoration(
                            color: AppColors.success.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: const Text(
                            'M',
                            style: TextStyle(
                              fontSize: 9,
                              color: AppColors.success,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ],
            onChanged: (v) => setState(() {
              _selectedCustomer = v != null
                  ? _customers.firstWhere((c) => c.id == v)
                  : null;
            }),
          ),
        ),

        // Cart items
        Expanded(
          child: _cart.isEmpty
              ? const Center(
                  child: Text(
                    'Keranjang kosong',
                    style: TextStyle(color: Colors.grey, fontSize: 13),
                  ),
                )
              : ListView.builder(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  itemCount: _cart.length,
                  itemBuilder: (_, i) {
                    final item = _cart[i];
                    return Card(
                      margin: const EdgeInsets.only(bottom: 6),
                      child: Padding(
                        padding: const EdgeInsets.all(8),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    item.material.nama,
                                    style: const TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w600,
                                    ),
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                                GestureDetector(
                                  onTap: () =>
                                      setState(() => _cart.removeAt(i)),
                                  child: const Icon(
                                    Icons.close,
                                    size: 16,
                                    color: Colors.grey,
                                  ),
                                ),
                              ],
                            ),
                            Text(
                              item.material.dimensiRequired
                                  ? '${item.panjang ?? 0} × ${item.lebar ?? 0} m'
                                  : '× ${item.quantity.toStringAsFixed(0)} ${item.selectedPrice.label}',
                              style: TextStyle(
                                fontSize: 11,
                                color: Colors.grey.shade600,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                if (!item.material.dimensiRequired)
                                  Row(
                                    children: [
                                      GestureDetector(
                                        onTap: () {
                                          if (item.quantity > 1) {
                                            setState(() => item.quantity--);
                                          }
                                        },
                                        child: const Icon(
                                          Icons.remove_circle_outline,
                                          size: 18,
                                          color: Colors.grey,
                                        ),
                                      ),
                                      Padding(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 6,
                                        ),
                                        child: Text(
                                          item.quantity.toStringAsFixed(0),
                                          style: const TextStyle(
                                            fontWeight: FontWeight.w600,
                                            fontSize: 13,
                                          ),
                                        ),
                                      ),
                                      GestureDetector(
                                        onTap: () =>
                                            setState(() => item.quantity++),
                                        child: const Icon(
                                          Icons.add_circle_outline,
                                          size: 18,
                                          color: AppColors.primary,
                                        ),
                                      ),
                                    ],
                                  )
                                else
                                  const SizedBox(),
                                Text(
                                  _fmt.format(
                                    item.subtotal(isMember: _isMemberSelected),
                                  ),
                                  style: const TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.bold,
                                    color: AppColors.primary,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
        ),

        // Checkout panel
        if (_cart.isNotEmpty)
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border(top: BorderSide(color: Colors.grey.shade200)),
            ),
            child: Column(
              children: [
                // Total
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'Total',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 15,
                      ),
                    ),
                    Text(
                      _fmt.format(_totalCart),
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 15,
                        color: AppColors.primary,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),

                // Prioritas
                Row(
                  children: [
                    const Text('Prioritas:', style: TextStyle(fontSize: 12)),
                    const SizedBox(width: 8),
                    ChoiceChip(
                      label: const Text(
                        'Normal',
                        style: TextStyle(fontSize: 11),
                      ),
                      selected: _prioritas == 'NORMAL',
                      onSelected: (_) => setState(() => _prioritas = 'NORMAL'),
                    ),
                    const SizedBox(width: 4),
                    ChoiceChip(
                      label: const Text(
                        'Kilat',
                        style: TextStyle(fontSize: 11, color: AppColors.error),
                      ),
                      selected: _prioritas == 'KILAT',
                      selectedColor: AppColors.error.withValues(alpha: 0.15),
                      onSelected: (_) => setState(() => _prioritas = 'KILAT'),
                    ),
                  ],
                ),
                const SizedBox(height: 6),

                // Metode bayar
                DropdownButtonFormField<String>(
                  initialValue: _paymentMethod,
                  isDense: true,
                  decoration: const InputDecoration(
                    labelText: 'Pembayaran',
                    contentPadding: EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 8,
                    ),
                  ),
                  items: const [
                    DropdownMenuItem(value: 'CASH', child: Text('Tunai')),
                    DropdownMenuItem(
                      value: 'TRANSFER',
                      child: Text('Transfer'),
                    ),
                    DropdownMenuItem(value: 'QRIS', child: Text('QRIS')),
                    DropdownMenuItem(
                      value: 'DEBIT',
                      child: Text('Kartu Debit'),
                    ),
                    DropdownMenuItem(
                      value: 'DOWN_PAYMENT',
                      child: Text('Down Payment'),
                    ),
                    DropdownMenuItem(
                      value: 'NET30',
                      child: Text('Piutang (NET30)'),
                    ),
                  ],
                  onChanged: (v) => setState(() {
                    _paymentMethod = v ?? 'CASH';
                    if (_paymentMethod == 'NET30') {
                      _jumlahBayarCtrl.clear();
                    }
                  }),
                ),
                const SizedBox(height: 6),

                // Jumlah bayar (sembunyikan untuk NET30)
                if (_paymentMethod != 'NET30') ...[
                  TextFormField(
                    controller: _jumlahBayarCtrl,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'Jumlah Dibayar',
                      prefixText: 'Rp ',
                      isDense: true,
                      contentPadding: EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 8,
                      ),
                    ),
                    onChanged: (_) => setState(() {}),
                  ),
                  if (_jumlahBayarCtrl.text.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    if (_kembalian > 0)
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            'Kembalian',
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.grey.shade600,
                            ),
                          ),
                          Text(
                            _fmt.format(_kembalian),
                            style: const TextStyle(
                              fontSize: 12,
                              color: AppColors.success,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    if (_kurang > 0)
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            'Kurang',
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.grey.shade600,
                            ),
                          ),
                          Text(
                            _fmt.format(_kurang),
                            style: const TextStyle(
                              fontSize: 12,
                              color: AppColors.error,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                  ],
                  const SizedBox(height: 6),
                ],

                // Catatan
                TextFormField(
                  controller: _catatanCtrl,
                  maxLines: 1,
                  decoration: const InputDecoration(
                    labelText: 'Catatan (opsional)',
                    isDense: true,
                    contentPadding: EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 8,
                    ),
                  ),
                ),
                const SizedBox(height: 8),

                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _checkout,
                    child: const Text('Bayar'),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // Tab Riwayat
  // ---------------------------------------------------------------------------

  Widget _buildHistoryTab() {
    final filtered = _salesSearch.isEmpty
        ? _sales
        : _sales
              .where(
                (s) =>
                    s.nomorInvoice.toLowerCase().contains(
                      _salesSearch.toLowerCase(),
                    ) ||
                    (s.pelangganNama?.toLowerCase().contains(
                          _salesSearch.toLowerCase(),
                        ) ??
                        false),
              )
              .toList();

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
          child: Row(
            children: [
              Expanded(
                child: SearchField(
                  hintText: 'Cari invoice...',
                  onChanged: (v) => setState(() => _salesSearch = v),
                ),
              ),
              const SizedBox(width: 8),
              OutlinedButton.icon(
                icon: const Icon(Icons.payments_outlined, size: 16),
                label: const Text('Piutang', style: TextStyle(fontSize: 12)),
                style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 8,
                  ),
                  minimumSize: Size.zero,
                ),
                onPressed: _showTerimapiutangSheet,
              ),
            ],
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () => _loadData(forceRefresh: true),
            child: filtered.isEmpty
                ? const Center(
                    child: Text(
                      'Belum ada riwayat penjualan',
                      style: TextStyle(color: Colors.grey),
                    ),
                  )
                : ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
                    itemCount: filtered.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 6),
                    itemBuilder: (_, i) => _buildSaleCard(filtered[i]),
                  ),
          ),
        ),
      ],
    );
  }

  Widget _buildSaleCard(Sale s) {
    Color statusColor;
    String statusLabel;
    switch (s.statusPembayaran) {
      case 'LUNAS':
        statusColor = AppColors.success;
        statusLabel = 'LUNAS';
      case 'SEBAGIAN':
        statusColor = AppColors.warning;
        statusLabel = 'SEBAGIAN';
      case 'AKTIF':
        statusColor = AppColors.error;
        statusLabel = 'PIUTANG';
      default:
        statusColor = AppColors.success;
        statusLabel = 'LUNAS';
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        s.nomorInvoice,
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 14,
                        ),
                      ),
                      Text(
                        [
                          s.pelangganNama ?? 'Walk-in',
                          s.metodePembayaran ?? '-',
                          if (s.prioritas == 'KILAT') '⚡ KILAT',
                        ].join(' · '),
                        style: TextStyle(
                          fontSize: 11,
                          color: Colors.grey.shade600,
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 3,
                  ),
                  decoration: BoxDecoration(
                    color: statusColor.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    statusLabel,
                    style: TextStyle(
                      color: statusColor,
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  _fmt.format(s.totalHarga),
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 14,
                    color: AppColors.primary,
                  ),
                ),
                if (s.sisaPiutang > 0)
                  Text(
                    'Sisa: ${_fmt.format(s.sisaPiutang)}',
                    style: const TextStyle(
                      fontSize: 11,
                      color: AppColors.error,
                    ),
                  ),
              ],
            ),
            if (s.createdAt != null)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(
                  _formatDate(s.createdAt!),
                  style: TextStyle(fontSize: 10, color: Colors.grey.shade500),
                ),
              ),
            const Divider(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                if (_canUseRiskyActions && s.isPiutang && s.hasPelunasan)
                  TextButton(
                    onPressed: () => _revertPayment(s),
                    style: TextButton.styleFrom(
                      foregroundColor: AppColors.warning,
                    ),
                    child: const Text(
                      'Batalkan Bayar',
                      style: TextStyle(fontSize: 12),
                    ),
                  ),
                if (_canUseRiskyActions)
                  TextButton(
                    onPressed: () => _deleteSale(s),
                    style: TextButton.styleFrom(
                      foregroundColor: AppColors.error,
                    ),
                    child: const Text(
                      'Batalkan',
                      style: TextStyle(fontSize: 12),
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  String _formatDate(String dateStr) {
    try {
      final dt = DateTime.parse(dateStr).toLocal();
      return '${dt.day.toString().padLeft(2, '0')}/${dt.month.toString().padLeft(2, '0')}/${dt.year} '
          '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
    } catch (_) {
      return dateStr;
    }
  }
}

// ---------------------------------------------------------------------------
// Bottom sheet: Terima Piutang
// ---------------------------------------------------------------------------

class _TerimapiutangSheet extends StatefulWidget {
  final List<dynamic> receivables;
  final dynamic posService;
  final NumberFormat fmt;
  final String? currentUserId;
  final VoidCallback onSuccess;

  const _TerimapiutangSheet({
    required this.receivables,
    required this.posService,
    required this.fmt,
    required this.currentUserId,
    required this.onSuccess,
  });

  @override
  State<_TerimapiutangSheet> createState() => _TerimapiutangSheetState();
}

class _TerimapiutangSheetState extends State<_TerimapiutangSheet> {
  Map<String, dynamic>? _selected;
  final _amountCtrl = TextEditingController();
  String _method = 'CASH';
  bool _isLoading = false;

  @override
  void dispose() {
    _amountCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_selected == null) {
      showErrorSnackbar(context, 'Pilih piutang terlebih dahulu');
      return;
    }
    final amount = double.tryParse(_amountCtrl.text);
    if (amount == null || amount <= 0) {
      showErrorSnackbar(context, 'Masukkan jumlah pembayaran');
      return;
    }

    setState(() => _isLoading = true);
    try {
      await widget.posService.payReceivable({
        'piutang_id': _selected!['id'],
        'jumlah_bayar': amount,
        'metode_pembayaran': _method,
        'dibuat_oleh': widget.currentUserId,
      });
      if (mounted) {
        Navigator.pop(context);
        widget.onSuccess();
      }
    } on ApiException catch (e) {
      if (mounted) showErrorSnackbar(context, e.message);
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.85,
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
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                const Expanded(
                  child: Text(
                    'Terima Pembayaran Piutang',
                    style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: ListView(
              controller: scroll,
              padding: const EdgeInsets.all(16),
              children: [
                const Text(
                  'Pilih Piutang',
                  style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                ),
                const SizedBox(height: 8),
                ...widget.receivables.map((r) {
                  final isSelected = _selected?['id'] == r['id'];
                  return GestureDetector(
                    onTap: () => setState(() {
                      _selected = Map<String, dynamic>.from(r);
                      _amountCtrl.text =
                          (r['sisa_piutang'] as num?)?.toStringAsFixed(0) ?? '';
                    }),
                    child: Container(
                      margin: const EdgeInsets.only(bottom: 8),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        border: Border.all(
                          color: isSelected
                              ? AppColors.primary
                              : Colors.grey.shade200,
                          width: isSelected ? 2 : 1,
                        ),
                        borderRadius: BorderRadius.circular(10),
                        color: isSelected
                            ? AppColors.primary.withValues(alpha: 0.05)
                            : Colors.white,
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  r['nomor_invoice']?.toString() ?? '-',
                                  style: const TextStyle(
                                    fontWeight: FontWeight.bold,
                                    fontSize: 13,
                                  ),
                                ),
                                Text(
                                  r['pelanggan_nama']?.toString() ?? '-',
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: Colors.grey.shade600,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text(
                                widget.fmt.format(
                                  (r['sisa_piutang'] as num?) ?? 0,
                                ),
                                style: const TextStyle(
                                  fontWeight: FontWeight.bold,
                                  color: AppColors.error,
                                  fontSize: 13,
                                ),
                              ),
                              Text(
                                'dari ${widget.fmt.format((r['jumlah_piutang'] as num?) ?? 0)}',
                                style: TextStyle(
                                  fontSize: 10,
                                  color: Colors.grey.shade500,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  );
                }),
                const SizedBox(height: 16),
                if (_selected != null) ...[
                  const Text(
                    'Jumlah Pembayaran',
                    style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                  ),
                  const SizedBox(height: 8),
                  TextFormField(
                    controller: _amountCtrl,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      prefixText: 'Rp ',
                      isDense: true,
                    ),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    initialValue: _method,
                    decoration: const InputDecoration(
                      labelText: 'Metode',
                      isDense: true,
                    ),
                    items: const [
                      DropdownMenuItem(value: 'CASH', child: Text('Tunai')),
                      DropdownMenuItem(
                        value: 'TRANSFER',
                        child: Text('Transfer'),
                      ),
                      DropdownMenuItem(value: 'QRIS', child: Text('QRIS')),
                    ],
                    onChanged: (v) => setState(() => _method = v ?? 'CASH'),
                  ),
                ],
              ],
            ),
          ),
          if (_selected != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              child: SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _isLoading ? null : _submit,
                  child: _isLoading
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Text('Simpan Pembayaran'),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
