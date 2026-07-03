import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gemiprint/core/penjualan_cetak_utils.dart';
import 'package:gemiprint/core/constants/roles.dart';
import 'package:gemiprint/core/theme/app_theme.dart';
import 'package:gemiprint/providers/providers.dart';
import 'package:gemiprint/services/api_client.dart';
import 'package:gemiprint/widgets/confirm_dialog.dart';
import 'package:gemiprint/widgets/empty_state.dart';
import 'package:gemiprint/widgets/faktur_preview_page.dart';
import 'package:gemiprint/widgets/snackbar_helper.dart';
import 'package:intl/intl.dart';

class SalesHistoryPage extends ConsumerStatefulWidget {
  const SalesHistoryPage({super.key});
  static const List<String> filters = ['Semua', 'Lunas', 'Void', 'Piutang'];
  @override
  ConsumerState<SalesHistoryPage> createState() => _SalesHistoryPageState();
}

class _SalesHistoryPageState extends ConsumerState<SalesHistoryPage> {
  List<Map<String, dynamic>> _sales = [];
  List<Map<String, dynamic>> _receivables = [];
  bool _isLoading = true;
  String _search = '';
  String _activeFilter = 'Semua';
  final _currencyFmt = NumberFormat.currency(locale: 'id_ID', symbol: 'Rp ', decimalDigits: 0);
  final _dateFmt = DateFormat('dd/MM/yy HH:mm', 'id_ID');

  @override
  void initState() { super.initState(); _loadData(); }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final data = await ref.read(posServiceProvider).getSales();
      if (mounted) setState(() { _sales = data; _isLoading = false; });
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        if (e.isUnauthorized) { ref.read(authStateProvider.notifier).logout(); return; }
        showErrorSnackbar(context, e.message);
      }
    } catch (_) {
      if (mounted) { setState(() => _isLoading = false); showErrorSnackbar(context, 'Gagal memuat riwayat penjualan'); }
    }
  }

  Future<void> _loadReceivables() async {
    setState(() => _isLoading = true);
    try {
      final data = await ref.read(posServiceProvider).getReceivables();
      if (mounted) setState(() { _receivables = (data['receivables'] as List?)?.cast<Map<String, dynamic>>() ?? []; _isLoading = false; });
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        if (e.isUnauthorized) { ref.read(authStateProvider.notifier).logout(); return; }
        showErrorSnackbar(context, e.message);
      }
    } catch (_) {
      if (mounted) { setState(() => _isLoading = false); showErrorSnackbar(context, 'Gagal memuat data piutang'); }
    }
  }

  List<Map<String, dynamic>> get _filtered {
    var result = _sales;
    if (_activeFilter == 'Lunas') {
      result = result.where((s) => s['status_transaksi'] != 'VOIDED').toList();
    } else if (_activeFilter == 'Void') {
      result = result.where((s) => s['status_transaksi'] == 'VOIDED').toList();
    }
    if (_search.isNotEmpty) {
      final q = _search.toLowerCase();
      result = result.where((s) {
        final faktur = (s['nomor_faktur'] ?? '').toString().toLowerCase();
        final nama = (s['pelanggan_nama'] ?? '').toString().toLowerCase();
        return faktur.contains(q) || nama.contains(q);
      }).toList();
    }
    return result;
  }

  Future<void> _handleVoid(Map<String, dynamic> sale) async {
    if (!_canUseRiskyActions) return;
    final faktur = sale['nomor_faktur'] ?? sale['id'];
    final ok = await showConfirmDialog(context, title: 'Batalkan Penjualan', message: 'Yakin ingin membatalkan penjualan "$faktur"?\n\nTindakan ini akan mengembalikan stok dan menandai transaksi sebagai VOID.', isDangerous: true);
    if (!ok) return;
    try {
      await ref.read(posServiceProvider).voidSale(sale['id'], 'Dibatalkan dari mobile');
      if (mounted) { showSuccessSnackbar(context, 'Penjualan berhasil dibatalkan'); _loadData(); }
    } on ApiException catch (e) { if (mounted) showErrorSnackbar(context, e.message); }
    catch (_) { if (mounted) showErrorSnackbar(context, 'Gagal membatalkan penjualan'); }
  }

  bool get _canUseRiskyActions {
    final role = ref.read(authStateProvider).valueOrNull?.role;
    return role != null && RoleGroups.adminOnly.contains(role);
  }

  void _showDetail(Map<String, dynamic> sale) {
    showModalBottomSheet(context: context, isScrollControlled: true, useSafeArea: true, backgroundColor: Colors.transparent,
      builder: (_) => _DetailSheet(sale: sale, currencyFmt: _currencyFmt, dateFmt: _dateFmt, onVoid: () => _handleVoid(sale), canVoid: _canUseRiskyActions));
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filtered;
    return Column(children: [
      Padding(padding: const EdgeInsets.fromLTRB(16, 8, 16, 4), child: TextField(
        decoration: InputDecoration(hintText: 'Cari faktur atau pelanggan...', prefixIcon: const Icon(Icons.search, size: 20),
          suffixIcon: _search.isNotEmpty ? IconButton(icon: const Icon(Icons.clear, size: 18), onPressed: () => setState(() => _search = '')) : null,
          filled: true, fillColor: Theme.of(context).colorScheme.surfaceContainerHighest.withValues(alpha: 0.3),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(28), borderSide: BorderSide.none), contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10)),
        onChanged: (v) => setState(() => _search = v),
      )),
      Padding(padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4), child: SingleChildScrollView(scrollDirection: Axis.horizontal, child: Row(
        children: SalesHistoryPage.filters.map((label) {
          final isSelected = _activeFilter == label;
          return Padding(padding: const EdgeInsets.only(right: 6), child: FilterChip(
            label: Text(label, style: TextStyle(fontSize: 12, fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal)),
            selected: isSelected, onSelected: (_) {
              setState(() => _activeFilter = label);
              if (label == 'Piutang') _loadReceivables();
            },
            selectedColor: AppColors.primary.withValues(alpha: 0.15), checkmarkColor: AppColors.primary, visualDensity: VisualDensity.compact,
          ));
        }).toList(),
      ))),
      Expanded(child: _buildBody(filtered)),
    ]);
  }

  Widget _buildBody(List<Map<String, dynamic>> filtered) {
    if (_isLoading) return const Center(child: CircularProgressIndicator());
    if (_activeFilter == 'Piutang') {
      if (_receivables.isEmpty) return EmptyState(icon: Icons.account_balance_wallet_rounded, title: 'Belum ada piutang');
      return RefreshIndicator(onRefresh: _loadReceivables, child: ListView.builder(padding: const EdgeInsets.fromLTRB(16, 4, 16, 80), itemCount: _receivables.length, itemBuilder: (_, i) => _buildReceivableCard(_receivables[i])));
    }
    if (_sales.isEmpty) return EmptyState(icon: Icons.receipt_long_rounded, title: 'Belum ada riwayat penjualan');
    if (filtered.isEmpty) return EmptyState(icon: Icons.search_off_rounded, title: 'Tidak ditemukan', subtitle: 'Coba kata kunci lain atau ubah filter');
    return RefreshIndicator(onRefresh: _loadData, child: ListView.builder(padding: const EdgeInsets.fromLTRB(16, 4, 16, 80), itemCount: filtered.length, itemBuilder: (_, i) => _buildCard(filtered[i])));
  }

  Widget _buildCard(Map<String, dynamic> s) {
    final isVoid = s['status_transaksi'] == 'VOIDED';
    final faktur = s['nomor_faktur'] ?? s['id'] ?? '-';
    final nama = s['pelanggan_nama'] ?? 'Pelanggan Umum';
    final total = (s['total_jumlah'] as num?)?.toDouble() ?? 0;
    final metode = s['metode_pembayaran'] ?? '-';
    final tgl = s['dibuat_pada'] ?? s['created_at'];
    return Card(
      margin: const EdgeInsets.only(bottom: 6),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => _showDetail(s),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            faktur,
                            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: isVoid ? AppColors.error.withValues(alpha: 0.1) : AppColors.success.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            isVoid ? 'Void' : 'Lunas',
                            style: TextStyle(
                              color: isVoid ? AppColors.error : AppColors.success,
                              fontSize: 10,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '$nama · ${_currencyFmt.format(total)}',
                      style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                    ),
                    const SizedBox(height: 1),
                    Row(
                      children: [
                        if (tgl != null)
                          Text(
                            _dateFmt.format(DateTime.parse(tgl.toString())),
                            style: TextStyle(fontSize: 10, color: Colors.grey.shade500),
                          ),
                        const SizedBox(width: 8),
                        Text(metode, style: TextStyle(fontSize: 10, color: Colors.grey.shade500)),
                      ],
                    ),
                  ],
                ),
              ),
              if (!isVoid && _canUseRiskyActions)
                IconButton(
                  icon: const Icon(Icons.cancel_outlined, size: 20),
                  color: AppColors.error.withValues(alpha: 0.6),
                  onPressed: () => _handleVoid(s),
                  visualDensity: VisualDensity.compact,
                ),
              Icon(Icons.chevron_right, color: Colors.grey.shade400, size: 20),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _payReceivable(Map<String, dynamic> receivable) async {
    final controller = TextEditingController();
    final sisa = (receivable['sisa_piutang'] as num?)?.toDouble() ?? 0;
    final ok = await showDialog<bool>(context: context, builder: (ctx) => AlertDialog(
      title: const Text('Bayar Piutang'),
      content: Column(mainAxisSize: MainAxisSize.min, children: [
        Text('Pelanggan: ${receivable['pelanggan_nama'] ?? '-'}\nFaktur: ${receivable['nomor_faktur'] ?? receivable['id']}\nSisa: ${_currencyFmt.format(sisa)}'),
        const SizedBox(height: 12),
        TextField(controller: controller, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Jumlah Bayar', hintText: 'Masukkan jumlah', border: OutlineInputBorder())),
      ]),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Batal')),
        FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Bayar')),
      ],
    ));
    if (ok != true) return;
    final jumlahText = controller.text.trim();
    if (jumlahText.isEmpty) { if (mounted) showErrorSnackbar(context, 'Jumlah bayar harus diisi'); return; }
    final jumlahBayar = double.tryParse(jumlahText);
    if (jumlahBayar == null || jumlahBayar <= 0) { if (mounted) showErrorSnackbar(context, 'Jumlah bayar tidak valid'); return; }
    try {
      await ref.read(posServiceProvider).payReceivable({ 'piutang_id': receivable['id'], 'jumlah_bayar': jumlahBayar });
      if (mounted) { showSuccessSnackbar(context, 'Pembayaran berhasil dicatat'); _loadReceivables(); }
    } on ApiException catch (e) { if (mounted) showErrorSnackbar(context, e.message); }
    catch (_) { if (mounted) showErrorSnackbar(context, 'Gagal mencatat pembayaran'); }
  }

  Future<void> _revertPayment(Map<String, dynamic> receivable) async {
    final ok = await showConfirmDialog(context, title: 'Batal Bayar', message: 'Yakin ingin membatalkan pembayaran untuk faktur "${receivable['nomor_faktur'] ?? receivable['id']}"?', isDangerous: true);
    if (!ok) return;
    try {
      await ref.read(posServiceProvider).revertPayment({ 'sale_id': receivable['penjualan_id'] });
      if (mounted) { showSuccessSnackbar(context, 'Pembayaran berhasil dibatalkan'); _loadReceivables(); }
    } on ApiException catch (e) { if (mounted) showErrorSnackbar(context, e.message); }
    catch (_) { if (mounted) showErrorSnackbar(context, 'Gagal membatalkan pembayaran'); }
  }

  Widget _buildReceivableCard(Map<String, dynamic> r) {
    final faktur = r['nomor_faktur'] ?? r['id'] ?? '-';
    final nama = r['pelanggan_nama'] ?? 'Pelanggan Umum';
    final sisa = (r['sisa_piutang'] as num?)?.toDouble() ?? 0;
    final total = (r['total_piutang'] as num?)?.toDouble() ?? 0;
    final status = r['status_piutang'] ?? 'Belum Lunas';
    final sudahDibayar = total - sisa;
    final isPartial = sudahDibayar > 0 && sisa > 0;
    final isLunas = sisa <= 0;
    return Card(
      margin: const EdgeInsets.only(bottom: 6),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Expanded(child: Text(faktur, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14), overflow: TextOverflow.ellipsis)),
              const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: isLunas ? AppColors.success.withValues(alpha: 0.1) : AppColors.warning.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(status, style: TextStyle(color: isLunas ? AppColors.success : AppColors.warning, fontSize: 10, fontWeight: FontWeight.w600)),
              ),
            ]),
            const SizedBox(height: 4),
            Text('$nama · Sisa: ${_currencyFmt.format(sisa)}', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
            if (isPartial) ...[const SizedBox(height: 2), Text('Sudah dibayar: ${_currencyFmt.format(sudahDibayar)}', style: TextStyle(fontSize: 11, color: Colors.grey.shade500))],
            if (!isLunas) ...[const SizedBox(height: 8), Row(mainAxisAlignment: MainAxisAlignment.end, children: [
              if (isPartial)
                TextButton.icon(onPressed: () => _revertPayment(r), icon: const Icon(Icons.undo, size: 16), label: const Text('Batal Bayar'), style: TextButton.styleFrom(foregroundColor: AppColors.error)),
              const SizedBox(width: 8),
              FilledButton.icon(onPressed: () => _payReceivable(r), icon: const Icon(Icons.payment, size: 16), label: const Text('Bayar'), style: FilledButton.styleFrom(backgroundColor: AppColors.primary)),
            ])],
          ],
        ),
      ),
    );
  }
}

class _DetailSheet extends ConsumerWidget {
  final Map<String, dynamic> sale;
  final NumberFormat currencyFmt;
  final DateFormat dateFmt;
  final VoidCallback onVoid;
  final bool canVoid;
  const _DetailSheet({required this.sale, required this.currencyFmt, required this.dateFmt, required this.onVoid, required this.canVoid});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isVoid = sale['status_transaksi'] == 'VOIDED';
    final faktur = sale['nomor_faktur'] ?? sale['id'] ?? '-';
    final nama = sale['pelanggan_nama'] ?? 'Pelanggan Umum';
    final total = (sale['total_jumlah'] as num?)?.toDouble() ?? 0;
    final dibayar = (sale['jumlah_dibayar'] as num?)?.toDouble() ?? 0;
    final kembalian = (sale['jumlah_kembalian'] as num?)?.toDouble() ?? 0;
    final metode = sale['metode_pembayaran'] ?? '-';
    final tgl = sale['dibuat_pada'] ?? sale['created_at'];
    final items = (sale['items'] as List?) ?? [];

    return DraggableScrollableSheet(initialChildSize: 0.85, minChildSize: 0.5, maxChildSize: 0.95, expand: false, builder: (_, scrollCtrl) => Container(
      decoration: const BoxDecoration(color: Colors.white, borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      child: Column(children: [
        Container(padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14), decoration: BoxDecoration(border: Border(bottom: BorderSide(color: Colors.grey.shade200))), child: Row(children: [
          Expanded(child: Text(faktur, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600))),
          IconButton(onPressed: () => Navigator.of(context).pop(), icon: const Icon(Icons.close)),
        ])),
        Expanded(child: ListView(controller: scrollCtrl, padding: const EdgeInsets.all(20), children: [
          _infoRow('Pelanggan', nama),
          if (tgl != null) _infoRow('Tanggal', dateFmt.format(DateTime.parse(tgl.toString()))),
          _infoRow('Metode', metode),
          _infoRow('Status', isVoid ? 'VOID' : 'Lunas'),
          const SizedBox(height: 12),
          const Text('Item', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
          const SizedBox(height: 8),
          ...items.map((item) {
            final raw = item as Map<String, dynamic>;
            final cetak = ItemCetakPenjualan(
              jumlah: (raw['jumlah'] as num?)?.toDouble() ?? 0,
              namaSatuan: raw['nama_satuan'] as String?,
              panjang: (raw['panjang'] as num?)?.toDouble(),
              lebar: (raw['lebar'] as num?)?.toDouble(),
              billedPanjang: (raw['billed_panjang'] as num?)?.toDouble(),
              billedLebar: (raw['billed_lebar'] as num?)?.toDouble(),
              jumlahRoll: raw['jumlah_roll'] as num?,
              jumlahLembar: raw['jumlah_lembar'] as num?,
            );
            final qtyLabel = formatQtyLabel(cetak);
            final ukuran = formatUkuranCetakInput(
              panjang: cetak.panjang,
              lebar: cetak.lebar,
              billedPanjang: cetak.billedPanjang,
              billedLebar: cetak.billedLebar,
            );
            final harga = (raw['harga_satuan'] as num?)?.toDouble() ?? 0;
            final biayaList = ((raw['biaya_tambahan'] as List?) ?? [])
                .whereType<Map<String, dynamic>>()
                .where((b) => (b['nominal'] as num?)?.toDouble() != null && (b['nominal'] as num).toDouble() > 0)
                .map((b) => MapEntry((b['label'] ?? '').toString().trim(), (b['nominal'] as num).toDouble()))
                .where((e) => e.key.isNotEmpty)
                .toList();
            return Padding(padding: const EdgeInsets.only(bottom: 6), child: Row(children: [
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(raw['barang_nama'] ?? raw['nama_barang'] ?? '-', style: const TextStyle(fontSize: 13)),
                if (ukuran != null) Text('Ukuran: $ukuran', style: TextStyle(fontSize: 11, color: Colors.grey.shade500)),
                ...biayaList.map((e) => Text('+ ${e.key}: Rp ${currencyFmt.format(e.value)}', style: TextStyle(fontSize: 11, color: Colors.grey.shade500))),
              ])),
              Text('$qtyLabel × ${currencyFmt.format(harga)}', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
            ]));
          }),
          const Divider(),
          _totalRow('Total', currencyFmt.format(total)),
          _totalRow('Dibayar', currencyFmt.format(dibayar)),
          _totalRow('Kembalian', currencyFmt.format(kembalian)),
          const SizedBox(height: 16),
          Row(children: [
            Expanded(child: OutlinedButton.icon(onPressed: () async {
              final navigator = Navigator.of(context);
              final shop = await ref.read(settingsServiceProvider).getShopInfo();
              navigator.pop();
              navigator.push(MaterialPageRoute(
                builder: (_) => FakturPreviewPage(
                  title: 'FAKTUR',
                  invoiceNumber: faktur.toString(),
                  customerName: nama,
                  date: tgl != null
                      ? dateFmt.format(DateTime.parse(tgl.toString()))
                      : null,
                  total: total,
                  bayar: dibayar,
                  sisa: (total - dibayar) > 0 ? (total - dibayar) : 0,
                  paymentMethod: metode == '-' ? null : metode.toString(),
                  shop: shop,
                  lines: items.map((item) {
                    final raw = item as Map<String, dynamic>;
                    final cetak = ItemCetakPenjualan(
                      jumlah: (raw['jumlah'] as num?)?.toDouble() ?? 0,
                      namaSatuan: raw['nama_satuan'] as String?,
                      panjang: (raw['panjang'] as num?)?.toDouble(),
                      lebar: (raw['lebar'] as num?)?.toDouble(),
                      billedPanjang: (raw['billed_panjang'] as num?)?.toDouble(),
                      billedLebar: (raw['billed_lebar'] as num?)?.toDouble(),
                      jumlahRoll: raw['jumlah_roll'] as num?,
                      jumlahLembar: raw['jumlah_lembar'] as num?,
                    );
                    final qs = qtySatuanCetak(cetak);
                    final ukuran = formatUkuranCetakInput(
                      panjang: cetak.panjang,
                      lebar: cetak.lebar,
                      billedPanjang: cetak.billedPanjang,
                      billedLebar: cetak.billedLebar,
                    );
                    final hargaLine =
                        (raw['harga_satuan'] as num?)?.toDouble() ?? 0;
                    final subtotalLine =
                        (raw['subtotal'] as num?)?.toDouble() ??
                        (qs.qty * hargaLine);
                    return FakturLine(
                      name: item['barang_nama'] ?? item['nama_barang'] ?? '-',
                      ukuran: ukuran,
                      qty: qs.qty,
                      satuan: qs.satuan.isEmpty ? null : qs.satuan,
                      harga: qs.qty > 0
                          ? subtotalLine / qs.qty
                          : hargaLine,
                      jumlah: subtotalLine,
                      biayaTambahan: ((raw['biaya_tambahan'] as List?) ?? [])
                          .whereType<Map<String, dynamic>>()
                          .where((b) =>
                              (b['nominal'] as num?)?.toDouble() != null &&
                              (b['nominal'] as num).toDouble() > 0)
                          .map((b) => FakturLineCharge(
                                label: (b['label'] ?? '').toString().trim(),
                                nominal: (b['nominal'] as num).toDouble(),
                              ))
                          .where((c) => c.label.isNotEmpty)
                          .toList(),
                    );
                  }).toList(),
                ),
              ));
            }, icon: const Icon(Icons.visibility_outlined, size: 16), label: const Text('Lihat Faktur'))),
            if (!isVoid && canVoid) ...[const SizedBox(width: 12), Expanded(child: OutlinedButton.icon(onPressed: () { Navigator.of(context).pop(); onVoid(); }, icon: const Icon(Icons.cancel_outlined, size: 16), label: const Text('Batalkan'), style: OutlinedButton.styleFrom(foregroundColor: AppColors.error)))],
          ]),
        ])),
      ]),
    ));
  }

  Widget _infoRow(String label, String value) => Padding(padding: const EdgeInsets.only(bottom: 4), child: Row(children: [
    SizedBox(width: 80, child: Text(label, style: TextStyle(fontSize: 12, color: Colors.grey.shade600))),
    Expanded(child: Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500))),
  ]));
  Widget _totalRow(String label, String value) => Padding(padding: const EdgeInsets.only(bottom: 2), child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
    Text(label, style: const TextStyle(fontSize: 13)), Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
  ]));
}
