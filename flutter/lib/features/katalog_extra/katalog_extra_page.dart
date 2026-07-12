import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gemiprint/core/constants/roles.dart';
import 'package:gemiprint/core/theme/app_theme.dart';
import 'package:gemiprint/features/katalog_extra/katalog_maklon_form_sheet.dart';
import 'package:gemiprint/features/katalog_extra/reconcile_pending_sheet.dart';
import 'package:gemiprint/models/katalog_maklon.dart';
import 'package:gemiprint/models/vendor.dart';
import 'package:gemiprint/providers/providers.dart';
import 'package:gemiprint/services/api_client.dart';
import 'package:gemiprint/widgets/confirm_dialog.dart';
import 'package:gemiprint/widgets/empty_state.dart';
import 'package:gemiprint/widgets/search_field.dart';
import 'package:gemiprint/widgets/snackbar_helper.dart';
import 'package:intl/intl.dart';

/// Halaman Katalog Extra (maklon) — lite companion.
///
/// Menampilkan list katalog dengan search, filter (Semua/Aktif/Non-Aktif/
/// Pending), dan section pending Vendor/HPP reconcile. CRUD via bottom sheet.
class KatalogExtraPage extends ConsumerStatefulWidget {
  const KatalogExtraPage({super.key});

  @override
  ConsumerState<KatalogExtraPage> createState() => _KatalogExtraPageState();
}

class _KatalogExtraPageState extends ConsumerState<KatalogExtraPage> {
  List<KatalogMaklon> _items = [];
  List<PendingMaklon> _pending = [];
  List<Vendor> _vendors = [];
  bool _isLoading = true;
  String _search = '';
  String _filter = 'semua'; // 'semua' | 'aktif' | 'nonaktif' | 'pending'

  final _currencyFormat = NumberFormat.currency(
    locale: 'id_ID',
    symbol: 'Rp ',
    decimalDigits: 0,
  );

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData({bool forceRefresh = false}) async {
    if (_items.isEmpty && _pending.isEmpty) {
      setState(() => _isLoading = true);
    }
    try {
      final results = await Future.wait([
        ref
            .read(katalogMaklonServiceProvider)
            .getAll(forceRefresh: forceRefresh),
        ref
            .read(katalogMaklonServiceProvider)
            .getPending(forceRefresh: forceRefresh),
        ref.read(vendorsServiceProvider).getAll(forceRefresh: forceRefresh),
      ]);
      if (!mounted) return;
      setState(() {
        _items = results[0] as List<KatalogMaklon>;
        _pending = results[1] as List<PendingMaklon>;
        _vendors = results[2] as List<Vendor>;
        _isLoading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _isLoading = false);
      if (e.isUnauthorized) {
        ref.read(authStateProvider.notifier).logout();
        return;
      }
      showErrorSnackbar(context, e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _isLoading = false);
      showErrorSnackbar(context, 'Gagal memuat katalog extra');
    }
  }

  List<KatalogMaklon> get _filtered {
    final q = _search.toLowerCase();
    return _items.where((m) {
      final matchesSearch = q.isEmpty || m.namaProduk.toLowerCase().contains(q);
      final matchesFilter = switch (_filter) {
        'aktif' => m.isAktif,
        'nonaktif' => !m.isAktif,
        // Filter "Pending" difokuskan ke section pending; list katalog
        // disembunyikan saat chip ini aktif (lihat _buildBody).
        'pending' => false,
        _ => true,
      };
      return matchesSearch && matchesFilter;
    }).toList();
  }

  bool get _canMutate {
    final role = ref.read(authStateProvider).valueOrNull?.role;
    return role != null && RoleGroups.adminOnly.contains(role);
  }

  Vendor? _vendorFor(KatalogMaklon item) {
    if (item.vendorSubkontrakIdDefault == null) return null;
    return _vendors.firstWhere(
      (v) => v.id == item.vendorSubkontrakIdDefault,
      orElse: () => const Vendor(id: '', namaPerusahaan: ''),
    );
  }

  Future<void> _showForm({KatalogMaklon? existing}) async {
    final result = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (_) => KatalogMaklonFormSheet(existing: existing),
    );
    if (result == true) _loadData(forceRefresh: true);
  }

  Future<void> _showReconcile(PendingMaklon item) async {
    final result = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (_) => ReconcilePendingSheet(item: item, vendors: _vendors),
    );
    if (result == true) _loadData(forceRefresh: true);
  }

  Future<void> _handleDelete(KatalogMaklon item) async {
    if (!_canMutate) return;
    final ok = await showConfirmDialog(
      context,
      title: 'Hapus Katalog Extra',
      message: 'Yakin ingin menghapus "${item.namaProduk}"?',
      isDangerous: true,
    );
    if (!ok) return;
    try {
      await ref.read(katalogMaklonServiceProvider).delete(item.id);
      if (mounted) {
        showSuccessSnackbar(context, 'Katalog extra berhasil dihapus');
        _loadData(forceRefresh: true);
      }
    } on ApiException catch (e) {
      if (mounted) showErrorSnackbar(context, e.message);
    } catch (_) {
      if (mounted) showErrorSnackbar(context, 'Gagal menghapus katalog extra');
    }
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filtered;
    return Stack(
      children: [
        RefreshIndicator(
          onRefresh: () => _loadData(forceRefresh: true),
          child: CustomScrollView(
            slivers: [
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                  child: SearchField(
                    hintText: 'Cari katalog extra...',
                    onChanged: (v) => setState(() => _search = v),
                  ),
                ),
              ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                  child: SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: [
                        _filterChip('semua', 'Semua'),
                        _filterChip('aktif', 'Aktif'),
                        _filterChip('nonaktif', 'Non-Aktif'),
                        _filterChip('pending', 'Pending'),
                      ],
                    ),
                  ),
                ),
              ),
              if (_filter == 'pending' || _pending.isNotEmpty)
                SliverToBoxAdapter(child: _buildPendingSection()),
              if (_isLoading && _items.isEmpty && _pending.isEmpty)
                const SliverFillRemaining(
                  hasScrollBody: false,
                  child: Center(child: CircularProgressIndicator()),
                )
              else if (_filter == 'pending')
                // Saat filter Pending aktif, list katalog disembunyikan;
                // hanya section pending yang ditampilkan.
                const SliverToBoxAdapter(child: SizedBox.shrink())
              else if (filtered.isEmpty)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: EmptyState(
                    icon: Icons.auto_awesome_motion_rounded,
                    title: _search.isEmpty
                        ? 'Belum ada katalog extra'
                        : 'Tidak ditemukan',
                  ),
                )
              else
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 80),
                  sliver: SliverList.builder(
                    itemCount: filtered.length,
                    itemBuilder: (_, i) => _buildCard(filtered[i]),
                  ),
                ),
            ],
          ),
        ),
        Positioned(
          right: 16,
          bottom: 16,
          child: FloatingActionButton(
            backgroundColor: const Color(0xFF00AFEF),
            onPressed: _canMutate ? () => _showForm() : null,
            child: const Icon(Icons.add_rounded),
          ),
        ),
      ],
    );
  }

  Widget _buildCard(KatalogMaklon item) {
    final vendor = _vendorFor(item);
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => _showForm(existing: item),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  CircleAvatar(
                    backgroundColor: AppColors.accent.withValues(alpha: 0.15),
                    child: const Icon(
                      Icons.auto_awesome_motion_rounded,
                      color: AppColors.accent,
                      size: 20,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          item.namaProduk,
                          style: const TextStyle(
                            fontWeight: FontWeight.w600,
                            fontSize: 15,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          item.kategoriNama ??
                              item.kategori ??
                              'Tanpa kategori',
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.grey.shade600,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (_canMutate)
                    IconButton(
                      icon: Icon(
                        Icons.delete_outline_rounded,
                        color: Colors.grey.shade400,
                        size: 20,
                      ),
                      onPressed: () => _handleDelete(item),
                    ),
                ],
              ),
              const Divider(height: 20),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _priceChip(
                    'Jual',
                    _currencyFormat.format(item.hargaJualDefault),
                    AppColors.primary,
                  ),
                  _priceChip(
                    'HPP',
                    _currencyFormat.format(item.biayaSubkontrakDefault),
                    AppColors.warning,
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                'Vendor: ${vendor?.namaPerusahaan.isNotEmpty == true ? vendor!.namaPerusahaan : 'Pilih saat transaksi'}',
                style: TextStyle(fontSize: 13, color: Colors.grey.shade700),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _statusChip(
                    item.isAktif ? 'Aktif' : 'Non-Aktif',
                    item.isAktif ? AppColors.success : AppColors.warning,
                  ),
                  if (item.butuhDimensiStatus) _plainChip('Dimensi'),
                  if (item.populerStatus) _plainChip('Populer'),
                  _plainChip(item.metodeBayarVendorDefault),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildPendingSection() {
    if (_pending.isEmpty) {
      return Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
        child: EmptyState(
          icon: Icons.pending_actions_rounded,
          title: 'Tidak ada baris pending',
        ),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
          child: Text(
            'Pending Vendor/HPP (${_pending.length})',
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: AppColors.warning,
            ),
          ),
        ),
        ..._pending.map((p) => _buildPendingCard(p)),
        const SizedBox(height: 8),
      ],
    );
  }

  Widget _buildPendingCard(PendingMaklon p) {
    return Card(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 8),
      color: AppColors.warning.withValues(alpha: 0.08),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    p.nomorFaktur ?? 'Tanpa faktur',
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                ),
                Text(
                  p.tanggal ?? '',
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              p.pelangganNama ?? '-',
              style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
            ),
            const SizedBox(height: 4),
            Text(
              p.deskripsiPekerjaan ?? '-',
              style: const TextStyle(fontSize: 13),
            ),
            const SizedBox(height: 6),
            Text(
              '${p.jumlah.toStringAsFixed(0)} × Rp ${p.hargaSatuan.toStringAsFixed(0)} = Rp ${p.subtotal.toStringAsFixed(0)}',
              style: TextStyle(fontSize: 12, color: Colors.grey.shade700),
            ),
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: () => _showReconcile(p),
                icon: const Icon(Icons.edit_note_rounded, size: 18),
                label: const Text('Isi Vendor & HPP'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _priceChip(String label, String value, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        '$label: $value',
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w500,
          color: color,
        ),
      ),
    );
  }

  Widget _statusChip(String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: color,
        ),
      ),
    );
  }

  Widget _plainChip(String label) {
    return Chip(
      label: Text(label),
      visualDensity: VisualDensity.compact,
      labelStyle: const TextStyle(fontSize: 12),
    );
  }

  Widget _filterChip(String value, String label) {
    final selected = _filter == value;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: FilterChip(
        label: Text(label),
        selected: selected,
        onSelected: (_) => setState(() => _filter = value),
        selectedColor: AppColors.accent.withValues(alpha: 0.16),
        checkmarkColor: AppColors.accent,
        visualDensity: VisualDensity.compact,
      ),
    );
  }
}
