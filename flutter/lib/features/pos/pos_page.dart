import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
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

class PosPage extends ConsumerStatefulWidget {
  const PosPage({super.key});

  @override
  ConsumerState<PosPage> createState() => _PosPageState();
}

class _CartItem {
  final MaterialItem material;
  final MaterialPrice price;
  int quantity = 1;
  double? panjang;
  double? lebar;
  String? finishingOptions;

  _CartItem({required this.material, required this.price});

  double get subtotal {
    double base = price.hargaJual * quantity;
    if (material.dimensiRequired && panjang != null && lebar != null) {
      base = price.hargaJual * panjang! * lebar! * quantity;
    }
    return base;
  }
}

class _PosPageState extends ConsumerState<PosPage> with SingleTickerProviderStateMixin {
  late TabController _tabCtrl;
  List<MaterialItem> _materials = [];
  List<Customer> _customers = [];
  List<Sale> _sales = [];
  final List<_CartItem> _cart = [];
  bool _isLoading = true;
  String _search = '';
  String _salesSearch = '';
  Customer? _selectedCustomer;
  String _paymentMethod = 'TUNAI';

  final _fmt = NumberFormat.currency(locale: 'id_ID', symbol: 'Rp ', decimalDigits: 0);

  @override
  void initState() {
    super.initState();
    _tabCtrl = TabController(length: 2, vsync: this);
    _loadData();
  }

  @override
  void dispose() {
    _tabCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final data = await ref.read(posServiceProvider).getInitData();
      if (mounted) {
        setState(() {
          _materials = (data['materials'] as List?)?.map((j) => MaterialItem.fromJson(j as Map<String, dynamic>)).toList() ?? [];
          _customers = (data['customers'] as List?)?.map((j) => Customer.fromJson(j as Map<String, dynamic>)).toList() ?? [];
          _sales = (data['sales'] as List?)?.map((j) => Sale.fromJson(j as Map<String, dynamic>)).toList() ?? [];
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) { setState(() => _isLoading = false); showErrorSnackbar(context, 'Gagal memuat data POS'); }
    }
  }

  List<MaterialItem> get _filteredMaterials {
    if (_search.isEmpty) return _materials;
    final q = _search.toLowerCase();
    return _materials.where((m) => m.nama.toLowerCase().contains(q) || (m.kategoriNama?.toLowerCase().contains(q) ?? false)).toList();
  }

  double get _totalCart => _cart.fold(0.0, (sum, item) => sum + item.subtotal);

  void _addToCart(MaterialItem m) {
    if (m.harga.isEmpty) {
      showErrorSnackbar(context, 'Barang ini belum memiliki harga');
      return;
    }
    final existing = _cart.indexWhere((c) => c.material.id == m.id);
    if (existing >= 0) {
      setState(() => _cart[existing].quantity++);
    } else {
      setState(() => _cart.add(_CartItem(material: m, price: m.harga.first)));
    }
  }

  Future<void> _checkout() async {
    if (_cart.isEmpty) return;

    final user = ref.read(authStateProvider).valueOrNull;
    final items = _cart.map((c) => {
      'barang_id': c.material.id,
      'jumlah': c.quantity,
      'harga_satuan': c.price.hargaJual,
      'subtotal': c.subtotal,
      if (c.panjang != null) 'panjang': c.panjang,
      if (c.lebar != null) 'lebar': c.lebar,
      if (c.finishingOptions != null) 'finishing_options': c.finishingOptions,
    }).toList();

    try {
      final result = await ref.read(posServiceProvider).createSale({
        'pelanggan_id': _selectedCustomer?.id,
        'items': items,
        'total_jumlah': _totalCart,
        'jumlah_dibayar': _totalCart,
        'jumlah_kembalian': 0,
        'metode_pembayaran': _paymentMethod,
        'kasir_id': user?.id,
      });
      if (mounted) {
        showSuccessSnackbar(context, 'Invoice ${result['sale']?['nomor_invoice'] ?? ''} berhasil dibuat');
        setState(() { _cart.clear(); _selectedCustomer = null; });
        _loadData();
      }
    } on ApiException catch (e) {
      if (mounted) showErrorSnackbar(context, e.message);
    }
  }

  Future<void> _deleteSale(Sale s) async {
    final ok = await showConfirmDialog(context, title: 'Hapus Penjualan', message: 'Hapus invoice ${s.nomorInvoice}?', isDangerous: true);
    if (!ok) return;
    try {
      await ref.read(posServiceProvider).deleteSale(s.id);
      if (mounted) { showSuccessSnackbar(context, 'Penjualan berhasil dihapus'); _loadData(); }
    } on ApiException catch (e) {
      if (mounted) showErrorSnackbar(context, e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) return const Center(child: CircularProgressIndicator());

    return Column(
      children: [
        TabBar(controller: _tabCtrl, labelColor: AppColors.primary, tabs: const [
          Tab(text: 'Kasir'),
          Tab(text: 'Riwayat'),
        ]),
        Expanded(child: TabBarView(controller: _tabCtrl, children: [_buildCashier(), _buildHistory()])),
      ],
    );
  }

  Widget _buildCashier() {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
          child: SearchField(hintText: 'Cari barang...', onChanged: (v) => setState(() => _search = v)),
        ),
        Expanded(
          child: Row(
            children: [
              Expanded(
                flex: 3,
                child: ListView.builder(
                  padding: const EdgeInsets.all(8),
                  itemCount: _filteredMaterials.length,
                  itemBuilder: (_, i) {
                    final m = _filteredMaterials[i];
                    final price = m.harga.isNotEmpty ? m.harga.first : null;
                    return Card(
                      child: ListTile(
                        dense: true,
                        title: Text(m.nama, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
                        subtitle: price != null ? Text(_fmt.format(price.hargaJual), style: TextStyle(color: AppColors.primary, fontSize: 12)) : null,
                        trailing: IconButton(icon: const Icon(Icons.add_circle_rounded, color: AppColors.primary), onPressed: () => _addToCart(m)),
                      ),
                    );
                  },
                ),
              ),
              Container(width: 1, color: Colors.grey.shade300),
              Expanded(
                flex: 2,
                child: _buildCartPanel(),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildCartPanel() {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(8),
          child: Text('Keranjang (${_cart.length})', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
        ),
        Expanded(
          child: _cart.isEmpty
              ? const Center(child: Text('Keranjang kosong', style: TextStyle(color: Colors.grey, fontSize: 13)))
              : ListView.builder(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  itemCount: _cart.length,
                  itemBuilder: (_, i) {
                    final item = _cart[i];
                    return Card(
                      child: Padding(
                        padding: const EdgeInsets.all(8),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(child: Text(item.material.nama, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500), overflow: TextOverflow.ellipsis)),
                                InkWell(
                                  onTap: () => setState(() => _cart.removeAt(i)),
                                  child: const Icon(Icons.close, size: 16, color: Colors.grey),
                                ),
                              ],
                            ),
                            const SizedBox(height: 4),
                            Row(
                              children: [
                                InkWell(onTap: () { if (item.quantity > 1) setState(() => item.quantity--); }, child: const Icon(Icons.remove_circle_outline, size: 20, color: Colors.grey)),
                                Padding(padding: const EdgeInsets.symmetric(horizontal: 8), child: Text('${item.quantity}', style: const TextStyle(fontWeight: FontWeight.w600))),
                                InkWell(onTap: () => setState(() => item.quantity++), child: const Icon(Icons.add_circle_outline, size: 20, color: AppColors.primary)),
                                const Spacer(),
                                Text(_fmt.format(item.subtotal), style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.primary)),
                              ],
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
        ),
        if (_cart.isNotEmpty) ...[
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(border: Border(top: BorderSide(color: Colors.grey.shade200))),
            child: Column(
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Total', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
                    Text(_fmt.format(_totalCart), style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: AppColors.primary)),
                  ],
                ),
                const SizedBox(height: 8),
                if (_customers.isNotEmpty)
                  DropdownButtonFormField<String?>(
                    initialValue: _selectedCustomer?.id,
                    decoration: const InputDecoration(labelText: 'Pelanggan', isDense: true, contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8)),
                    items: [
                      const DropdownMenuItem(value: null, child: Text('Umum')),
                      ..._customers.map((c) => DropdownMenuItem(value: c.id, child: Text(c.nama))),
                    ],
                    onChanged: (v) => setState(() => _selectedCustomer = v != null ? _customers.firstWhere((c) => c.id == v) : null),
                  ),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  initialValue: _paymentMethod,
                  decoration: const InputDecoration(labelText: 'Pembayaran', isDense: true, contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8)),
                  items: const [
                    DropdownMenuItem(value: 'TUNAI', child: Text('Tunai')),
                    DropdownMenuItem(value: 'TRANSFER', child: Text('Transfer')),
                    DropdownMenuItem(value: 'QRIS', child: Text('QRIS')),
                    DropdownMenuItem(value: 'KARTU', child: Text('Kartu')),
                    DropdownMenuItem(value: 'PIUTANG', child: Text('Piutang')),
                  ],
                  onChanged: (v) => setState(() => _paymentMethod = v ?? 'TUNAI'),
                ),
                const SizedBox(height: 8),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(onPressed: _checkout, child: const Text('Bayar')),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildHistory() {
    final filteredSales = _salesSearch.isEmpty
        ? _sales
        : _sales.where((s) => s.nomorInvoice.toLowerCase().contains(_salesSearch.toLowerCase()) || (s.pelangganNama?.toLowerCase().contains(_salesSearch.toLowerCase()) ?? false)).toList();

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
          child: SearchField(hintText: 'Cari invoice...', onChanged: (v) => setState(() => _salesSearch = v)),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: _loadData,
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
              itemCount: filteredSales.length,
              separatorBuilder: (_, _) => const SizedBox(height: 6),
              itemBuilder: (_, i) {
                final s = filteredSales[i];
                return Card(
                  child: ListTile(
                    title: Text(s.nomorInvoice, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                    subtitle: Text(
                      '${s.pelangganNama ?? 'Umum'} · ${s.metodePembayaran ?? '-'} · ${_fmt.format(s.totalHarga)}',
                      style: const TextStyle(fontSize: 12),
                    ),
                    trailing: IconButton(icon: Icon(Icons.delete_outline_rounded, color: Colors.grey.shade400, size: 20), onPressed: () => _deleteSale(s)),
                  ),
                );
              },
            ),
          ),
        ),
      ],
    );
  }
}
