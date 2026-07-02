import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gemiprint/features/pos/models/cart_item.dart';
import 'package:gemiprint/features/pos/models/finishing_option.dart';
import 'package:gemiprint/features/pos/models/subkontraktor_option.dart';
import 'package:gemiprint/features/pos/pos_calc.dart';
import 'package:gemiprint/features/pos/widgets/add_item_sheet.dart';
import 'package:gemiprint/features/pos/widgets/cart_sheet.dart';
import 'package:gemiprint/features/pos/widgets/customer_picker.dart';
import 'package:gemiprint/features/pos/widgets/finishing_picker.dart';
import 'package:gemiprint/features/pos/widgets/maklon_form_sheet.dart';
import 'package:gemiprint/features/pos/widgets/payment_sheet.dart';
import 'package:gemiprint/features/pos/widgets/penawaran_preview.dart';
import 'package:gemiprint/features/pos/widgets/product_grid.dart';
import 'package:gemiprint/models/customer.dart';
import 'package:gemiprint/models/material_item.dart';
import 'package:gemiprint/providers/providers.dart';
import 'package:gemiprint/services/api_client.dart';
import 'package:gemiprint/widgets/snackbar_helper.dart';

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

class PosPage extends ConsumerStatefulWidget {
  const PosPage({super.key});

  @override
  ConsumerState<PosPage> createState() => _PosPageState();
}

class _PosPageState extends ConsumerState<PosPage> {
  List<MaterialItem> _materials = [];
  List<Customer> _customers = [];
  List<SubkontraktorOption> _subkontraktor = [];
  List<FinishingOption>? _finishingOptions;

  final List<CartItem> _cart = [];
  Customer? _selectedCustomer;
  bool _roundCartPrices = true;

  bool _loading = true;
  bool _loadError = false;
  String _search = '';
  String _categoryFilter = 'ALL';

  @override
  void initState() {
    super.initState();
    _load();
  }

  bool get _isMember => _selectedCustomer?.isMember ?? false;

  Future<void> _load({bool force = false}) async {
    setState(() {
      _loading = _materials.isEmpty;
      _loadError = false;
    });
    try {
      final api = ref.read(apiClientProvider);
      final data =
          await api.get('/api/pos/init-data', forceRefresh: force)
              as Map<String, dynamic>;
      setState(() {
        _materials = ((data['materials'] as List?) ?? [])
            .map((j) => MaterialItem.fromJson(j as Map<String, dynamic>))
            .where((m) => m.id != kIdBarangPlaceholderMaklon)
            .toList();
        _customers = ((data['customers'] as List?) ?? [])
            .map((j) => Customer.fromJson(j as Map<String, dynamic>))
            .toList();
        _subkontraktor = ((data['subkontraktor'] as List?) ?? [])
            .map((j) => SubkontraktorOption.fromJson(j as Map<String, dynamic>))
            .toList();
        _loading = false;
      });
    } catch (_) {
      setState(() {
        _loading = false;
        _loadError = true;
      });
    }
  }

  Future<List<FinishingOption>> _ensureFinishing() async {
    if (_finishingOptions != null) return _finishingOptions!;
    try {
      final opts = await ref.read(posServiceProvider).getFinishingOptions();
      _finishingOptions = opts;
      return opts;
    } catch (_) {
      _finishingOptions = [];
      return [];
    }
  }

  List<String> get _categories {
    final names = <String>{};
    for (final m in _posMaterials) {
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

  List<MaterialItem> get _posMaterials => _materials.where((m) {
        // Produk Jual (harga satuan) selalu tampil; barang induk hanya jika
        // muncul_di_pos_status aktif.
        return m.harga.isNotEmpty || m.munculDiPos;
      }).toList();

  List<MaterialItem> get _filtered {
    var list = _posMaterials;
    if (_categoryFilter != 'ALL') {
      list = list.where((m) => m.kategoriNama == _categoryFilter).toList();
    }
    final q = _search.trim().toLowerCase();
    if (q.isEmpty) return list;
    return list.where((m) => m.nama.toLowerCase().contains(q)).toList();
  }

  double get _cartTotal =>
      getCartChargeTotal(
        _cart.map((c) => c.subtotalRaw).toList(),
        _roundCartPrices,
      ) +
      _cart.fold<double>(0, (s, item) => s + item.totalBiayaTambahan);

  Future<void> _addMaterial(MaterialItem m) async {
    if (m.harga.isEmpty) {
      showErrorSnackbar(context, 'Barang ini belum memiliki harga');
      return;
    }
    final finishing = await _ensureFinishing();
    if (!mounted) return;
    final item = await showAddItemSheet(
      context,
      material: m,
      isMember: _isMember,
      finishingOptions: finishing,
    );
    if (item != null) setState(() => _cart.add(item));
  }

  Future<void> _addMaklon() async {
    final items = await showMaklonFormSheet(
      context,
      subkontraktor: _subkontraktor,
    );
    if (items != null) setState(() => _cart.addAll(items));
  }

  Future<void> _openCart() async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => CartSheet(
        cart: _cart,
        roundCartPrices: _roundCartPrices,
        onToggleRounding: (v) => setState(() => _roundCartPrices = v),
        onRemoveLine: (i) => setState(() => _cart.removeAt(i)),
        onOverridePrice: (i, p) => setState(() => _cart[i].hargaSatuan = p),
        onResetPrice: (i) =>
            setState(() => _cart[i].hargaSatuan = _cart[i].originalHargaSatuan),
        onEditFinishing: (i) => _editFinishing(ctx, i),
        onPenawaran: () {
          Navigator.pop(ctx);
          _openPenawaran();
        },
        onBayar: () {
          Navigator.pop(ctx);
          _openPayment();
        },
      ),
    );
    setState(() {});
  }

  Future<void> _editFinishing(BuildContext sheetCtx, int index) async {
    final opts = await _ensureFinishing();
    if (!mounted || !sheetCtx.mounted) return;
    final result = await showFinishingPicker(
      sheetCtx,
      options: opts,
      initial: _cart[index].finishing,
    );
    if (result != null) {
      setState(() => _cart[index].finishing = result);
    }
  }

  Future<void> _pickCustomer() async {
    final picked = await showCustomerPicker(
      context,
      customers: _customers,
      customersService: ref.read(customersServiceProvider),
    );
    setState(() {
      _selectedCustomer = picked;
      if (picked != null &&
          picked.id.isNotEmpty &&
          !_customers.any((c) => c.id == picked.id)) {
        _customers = [picked, ..._customers];
      }
    });
  }

  Future<void> _openPenawaran() async {
    final shop = await ref.read(settingsServiceProvider).getShopInfo();
    if (!mounted) return;
    await showPenawaranPreview(
      context,
      cart: _cart,
      roundCartPrices: _roundCartPrices,
      biayaTambahanTotal: _cart.fold<double>(
        0,
        (s, item) => s + item.totalBiayaTambahan,
      ),
      customerName: _selectedCustomer?.nama,
      customerKota: _selectedCustomer?.alamat,
      shop: shop,
    );
  }

  Future<void> _openPayment() async {
    final result = await showPaymentSheet(context, total: _cartTotal);
    if (result == null) return;
    await _checkout(result);
  }

  Future<void> _checkout(PaymentResult payment) async {
    final charges = allocateCartLineCharges(
      _cart.map((c) => c.subtotalRaw).toList(),
      _roundCartPrices,
    );
    final items = <Map<String, dynamic>>[];
    for (var i = 0; i < _cart.length; i++) {
      items.add(_cart[i].toSalePayload(charges[i]));
    }
    final user = ref.read(authStateProvider).valueOrNull;
    try {
      final result = await ref.read(posServiceProvider).createSale({
        if (_selectedCustomer != null && _selectedCustomer!.id.isNotEmpty)
          'pelanggan_id': _selectedCustomer!.id,
        if (_selectedCustomer != null)
          'pelanggan_nama_snapshot': _selectedCustomer!.nama,
        if (_selectedCustomer?.alamat != null)
          'pelanggan_kota': _selectedCustomer!.alamat,
        'items': items,
        'total_jumlah': _cartTotal,
        'jumlah_dibayar': payment.dibayar,
        'jumlah_kembalian': payment.kembalian,
        'metode_pembayaran': payment.metode,
        'kasir_id': user?.id,
        'prioritas': 'NORMAL',
      });
      if (!mounted) return;
      final invoice =
          result['sale']?['nomor_faktur'] ?? result['nomor_faktur'] ?? '';
      final spk = result['spk_number'] ?? '';
      showSuccessSnackbar(context, 'Invoice $invoice berhasil! SPK: $spk');
      setState(() {
        _cart.clear();
        _selectedCustomer = null;
        _roundCartPrices = true;
      });
      _load(force: true);
    } on ApiException catch (e) {
      if (mounted) showErrorSnackbar(context, e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_loadError) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Gagal memuat data POS'),
            const SizedBox(height: 8),
            ElevatedButton(
              onPressed: () => _load(force: true),
              child: const Text('Coba Lagi'),
            ),
          ],
        ),
      );
    }
    return Column(
      children: [
        InkWell(
          onTap: _pickCustomer,
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            color: Colors.grey.shade50,
            child: Row(
              children: [
                const Icon(Icons.person_outline, size: 18),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    _selectedCustomer?.nama ?? 'Pelanggan Umum',
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                ),
                const Icon(Icons.keyboard_arrow_down),
              ],
            ),
          ),
        ),
        Expanded(
          child: ProductGrid(
            materials: _filtered,
            categories: _categories,
            categoryFilter: _categoryFilter,
            isMember: _isMember,
            cartCount: _cart.length,
            cartTotal: _cartTotal,
            onSearch: (v) => setState(() => _search = v),
            onCategory: (v) => setState(() => _categoryFilter = v),
            onTapMaterial: _addMaterial,
            onTapMaklon: _addMaklon,
            onOpenCart: _openCart,
          ),
        ),
      ],
    );
  }
}
