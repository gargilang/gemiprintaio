import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gemiprint/core/constants/roles.dart';
import 'package:gemiprint/core/theme/app_theme.dart';
import 'package:gemiprint/features/finance/kategori_utils.dart';
import 'package:gemiprint/models/cashbook.dart';
import 'package:gemiprint/models/ringkasan_hutang_piutang.dart';
import 'package:gemiprint/models/ringkasan_kasbon.dart';
import 'package:gemiprint/providers/providers.dart';
import 'package:gemiprint/services/api_client.dart';
import 'package:gemiprint/widgets/confirm_dialog.dart';
import 'package:gemiprint/widgets/empty_state.dart';
import 'package:gemiprint/widgets/snackbar_helper.dart';
import 'package:intl/intl.dart';
import 'detail_kasbon_sheet.dart';
import 'form_transaksi_sheet.dart';

class FinancePage extends ConsumerStatefulWidget {
  const FinancePage({super.key});

  @override
  ConsumerState<FinancePage> createState() => _FinancePageState();
}

class _FinancePageState extends ConsumerState<FinancePage>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;

  List<CashBookEntry> _entries = [];
  List<Map<String, dynamic>> _kategoriOptions = [];
  Map<String, dynamic> _systemMetrics = {};
  bool _isLoading = true;
  String _search = '';
  String _filterKategori = 'SEMUA';

  RingkasanKasbon _ringkasanKasbon = RingkasanKasbon(
    karyawan: [],
    totalKasbon: 0,
    jumlahKaryawan: 0,
  );
  RingkasanHutangPiutang _ringkasanHutangPiutang = RingkasanHutangPiutang(
    hutang: HutangPiutangInfo(total: 0, jumlah: 0),
    piutang: HutangPiutangInfo(total: 0, jumlah: 0),
  );

  final _fmt = NumberFormat.currency(
    locale: 'id_ID',
    symbol: 'Rp ',
    decimalDigits: 0,
  );

  String _formatShort(double value) {
    if (value.abs() >= 1000000) {
      return '${(value / 1000000).toStringAsFixed(1)}jt';
    }
    return _fmt.format(value);
  }

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _loadData();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadData({bool forceRefresh = false}) async {
    if (_entries.isEmpty) {
      setState(() => _isLoading = true);
    }
    try {
      final service = ref.read(financeServiceProvider);
      final results = await Future.wait([
        service.getCashBook(forceRefresh: forceRefresh),
        service.getConfig().catchError((_) => <String, dynamic>{}),
        service.getRingkasanKasbon(forceRefresh: forceRefresh).catchError(
          (_) =>
              RingkasanKasbon(karyawan: [], totalKasbon: 0, jumlahKaryawan: 0),
        ),
        service.getRingkasanHutangPiutang(forceRefresh: forceRefresh).catchError(
          (_) => RingkasanHutangPiutang(
            hutang: HutangPiutangInfo(total: 0, jumlah: 0),
            piutang: HutangPiutangInfo(total: 0, jumlah: 0),
          ),
        ),
      ]);

      final data = results[0] as Map<String, dynamic>;
      final config = results[1] as Map<String, dynamic>;
      final kasbon = results[2] as RingkasanKasbon;
      final hp = results[3] as RingkasanHutangPiutang;

      final list = data['cashBooks'] as List? ?? [];
      final categories = config['categories'] as List? ?? [];

      if (mounted) {
        setState(() {
          _entries = list
              .map((j) => CashBookEntry.fromJson(j as Map<String, dynamic>))
              .toList();
          _systemMetrics = data['systemMetrics'] is Map<String, dynamic>
              ? data['systemMetrics'] as Map<String, dynamic>
              : {};
          final seenKategori = <String>{};
          _kategoriOptions = categories
              .whereType<Map>()
              .map<Map<String, dynamic>>(
                (c) => {
                  'category_code': (c['category_code'] ?? '').toString(),
                  'display_name':
                      (c['display_name'] ?? c['category_code'] ?? '')
                          .toString(),
                },
              )
              .where((c) {
                final code = c['category_code'] as String;
                return code.isNotEmpty && seenKategori.add(code);
              })
              .toList();
          _ringkasanKasbon = kasbon;
          _ringkasanHutangPiutang = hp;
          _isLoading = false;
        });
      }
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        if (e.isUnauthorized) {
          ref.read(authStateProvider.notifier).logout();
          return;
        }
        showErrorSnackbar(context, e.message);
      }
    } catch (_) {
      if (mounted) {
        setState(() => _isLoading = false);
        showErrorSnackbar(context, 'Gagal memuat data keuangan');
      }
    }
  }

  List<CashBookEntry> get _filtered {
    var list = _entries;
    if (_filterKategori != 'SEMUA') {
      list = list.where((e) => e.kategoriTransaksi == _filterKategori).toList();
    }
    if (_search.isNotEmpty) {
      final q = _search.toLowerCase();
      list = list
          .where(
            (e) =>
                e.kategoriTransaksi.toLowerCase().contains(q) ||
                (e.keperluan?.toLowerCase().contains(q) ?? false) ||
                (e.catatan?.toLowerCase().contains(q) ?? false),
          )
          .toList();
    }
    return list;
  }

  bool get _canMutate {
    final role = ref.read(authStateProvider).valueOrNull?.role;
    return role != null && RoleGroups.adminOnly.contains(role);
  }

  double _metric(String key) => (_systemMetrics[key] as num?)?.toDouble() ?? 0;

  // ============ KARTU RINGKASAN (gaya gradient existing) ============
  static const Color _indigoColor = Color(0xFF4F46E5);
  static const Color _amberColor = Color(0xFFF59E0B);

  Widget _buildSummaryCards() {
    final saldo = _metric('saldo');
    final omzet = _metric('omzet');
    final totalBiaya = _metric('biaya_operasional') + _metric('biaya_bahan');
    final kas = _metric('kas');
    final modalKas = _metric('modal_kas');
    final saldoKasbon = _metric('saldo_kasbon');
    final hutang = _ringkasanHutangPiutang.hutang;
    final piutang = _ringkasanHutangPiutang.piutang;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      child: Column(
        children: [
          Row(
            children: [
              _summaryCard(
                'Saldo',
                saldo,
                _indigoColor,
                Icons.account_balance_wallet_rounded,
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: _miniSummaryCard('Omzet', omzet, AppColors.success),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: _miniSummaryCard('Biaya', totalBiaya, AppColors.warning),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Expanded(
                child: _miniSummaryCard(
                  'Hutang',
                  hutang.total,
                  AppColors.error,
                  subtitle: '${hutang.jumlah} tagihan',
                ),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: _miniSummaryCard(
                  'Piutang',
                  piutang.total,
                  AppColors.success,
                  subtitle: '${piutang.jumlah} tagihan',
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              _summaryCard('Kas', kas, _amberColor, Icons.payments_rounded),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: _miniSummaryCard(
                  'Modal Kas',
                  modalKas,
                  AppColors.primary,
                ),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: _miniSummaryCard(
                  'Saldo Kasbon',
                  saldoKasbon,
                  AppColors.error,
                  subtitle: '${_ringkasanKasbon.jumlahKaryawan} karyawan',
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _summaryCard(String label, double value, Color color, IconData icon) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [color, color.withValues(alpha: 0.8)],
          ),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            Icon(icon, color: Colors.white.withValues(alpha: 0.9), size: 24),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.85),
                      fontSize: 12,
                    ),
                  ),
                  Text(
                    _fmt.format(value),
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _miniSummaryCard(
    String label,
    double value,
    Color color, {
    String? subtitle,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(fontSize: 10, color: color.withValues(alpha: 0.8)),
          ),
          const SizedBox(height: 2),
          Text(
            _fmt.format(value),
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.bold,
              color: color,
            ),
          ),
          if (subtitle != null) ...[
            const SizedBox(height: 1),
            Text(
              subtitle,
              style: TextStyle(
                fontSize: 9,
                color: color.withValues(alpha: 0.6),
              ),
            ),
          ],
        ],
      ),
    );
  }

  // ============ BUKU KAS ============

  Future<void> _showAddForm() async {
    final result = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (_) => FormTransaksiSheet(kategoriOptions: _kategoriOptions),
    );
    if (result == true) {
      _loadData();
    }
  }

  Widget _buildBukuKasList() {
    final filtered = _filtered;
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_entries.isEmpty) {
      return const EmptyState(
        icon: Icons.account_balance_wallet_rounded,
        title: 'Belum ada entri keuangan',
      );
    }
    if (filtered.isEmpty) {
      return const EmptyState(
        icon: Icons.search_off_rounded,
        title: 'Tidak ditemukan',
        subtitle: 'Coba kata kunci lain atau ubah filter',
      );
    }
    return RefreshIndicator(
      onRefresh: () => _loadData(forceRefresh: true),
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(12, 4, 12, 80),
        itemCount: filtered.length,
        itemBuilder: (_, i) => _buildBukuKasCard(filtered[i]),
      ),
    );
  }

  Widget _buildBukuKasCard(CashBookEntry e) {
    final refLabel = _referensiLabel(e);
    final isDeletable = e.dapatDihapus && _canMutate;
    final kat = e.kategoriTransaksi.toUpperCase();
    final w = kategoriWarna(kat);
    final isDebit = e.debit > 0; // debit = masuk = hijau +
    final keperluanText = stripReferenceId(e.keperluan).isEmpty
        ? 'Transaksi'
        : stripReferenceId(e.keperluan);

    return Card(
      margin: const EdgeInsets.only(bottom: 6),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: isDeletable ? () => _handleDelete(e) : null,
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
                        Expanded(
                          child: Text(
                            keperluanText,
                            style: const TextStyle(
                              fontWeight: FontWeight.w600,
                              fontSize: 13,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (refLabel.isNotEmpty) ...[
                          const SizedBox(width: 4),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 6,
                              vertical: 1,
                            ),
                            decoration: BoxDecoration(
                              color: Colors.grey.shade200,
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(
                              refLabel,
                              style: TextStyle(
                                fontSize: 9,
                                color: Colors.grey.shade600,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 2),
                    Row(
                      children: [
                        Text(
                          _formatTanggal(e.tanggal),
                          style: TextStyle(
                            fontSize: 11,
                            color: Colors.grey.shade500,
                          ),
                        ),
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 6,
                            vertical: 1,
                          ),
                          decoration: BoxDecoration(
                            color: w.bg,
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            _kategoriLabel(e.kategoriTransaksi),
                            style: TextStyle(
                              fontSize: 9,
                              fontWeight: FontWeight.w600,
                              color: w.text,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    isDebit
                        ? '+${_formatShort(e.debit)}'
                        : '-${_formatShort(e.kredit)}',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: isDebit
                          ? Colors.green.shade600
                          : Colors.red.shade600,
                    ),
                  ),
                  if (!e.dapatDihapus) ...[
                    const SizedBox(width: 4),
                    Icon(
                      Icons.lock_outline,
                      size: 14,
                      color: Colors.grey.shade300,
                    ),
                  ],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _kategoriLabel(String code) {
    for (final k in _kategoriOptions) {
      if ((k['category_code'] as String?) == code) {
        final name = (k['display_name'] as String?) ?? '';
        if (name.isNotEmpty) return name;
      }
    }
    return humanizeKategoriKode(code);
  }

  String _referensiLabel(CashBookEntry e) {
    final k = e.keperluan ?? '';
    if (k.contains('[REF:purchase-')) {
      return 'Pembelian';
    }
    if (k.contains('[REF:sale-')) {
      return 'POS';
    }
    if (k.contains('[REF:pinjaman-')) {
      return 'Kasbon';
    }
    return '';
  }

  String _formatTanggal(String tgl) {
    try {
      final d = DateTime.parse(tgl);
      return '${d.day} ${_bulanPendek(d.month)} ${d.year}';
    } catch (_) {
      return tgl;
    }
  }

  String _bulanPendek(int m) {
    const bulan = [
      '',
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'Mei',
      'Jun',
      'Jul',
      'Agu',
      'Sep',
      'Okt',
      'Nov',
      'Des',
    ];
    return bulan[m];
  }

  Future<void> _handleDelete(CashBookEntry entry) async {
    if (!entry.dapatDihapus) {
      return;
    }
    final ok = await showConfirmDialog(
      context,
      title: 'Hapus Transaksi',
      message: 'Yakin ingin menghapus "${entry.keperluan ?? 'transaksi'}"?',
      isDangerous: true,
    );
    if (!ok) {
      return;
    }
    try {
      await ref.read(financeServiceProvider).deleteEntry(entry.id);
      if (mounted) {
        showSuccessSnackbar(context, 'Transaksi berhasil dihapus');
        _loadData();
      }
    } on ApiException catch (e) {
      if (mounted) {
        showErrorSnackbar(context, e.message);
      }
    } catch (_) {
      if (mounted) {
        showErrorSnackbar(context, 'Gagal menghapus transaksi');
      }
    }
  }

  // ============ BUILD ============

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          Expanded(
            child: NestedScrollView(
              headerSliverBuilder: (_, _) => [
                SliverToBoxAdapter(
                  child: Column(
                    children: [const SizedBox(height: 8), _buildSummaryCards()],
                  ),
                ),
                SliverPersistentHeader(
                  pinned: true,
                  delegate: _TabBarDelegate(
                    TabBar(
                      controller: _tabController,
                      labelColor: _indigoColor,
                      unselectedLabelColor: Colors.grey.shade500,
                      indicatorColor: _indigoColor,
                      indicatorWeight: 2,
                      labelStyle: const TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 13,
                      ),
                      tabs: const [
                        Tab(text: 'Buku Kas'),
                        Tab(text: 'Kasbon'),
                      ],
                    ),
                  ),
                ),
              ],
              body: TabBarView(
                controller: _tabController,
                children: [
                  // Tab Buku Kas
                  Column(
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(12, 4, 12, 4),
                        child: TextField(
                          decoration: InputDecoration(
                            hintText: 'Cari transaksi...',
                            prefixIcon: const Icon(Icons.search, size: 20),
                            isDense: true,
                            filled: true,
                            fillColor: Theme.of(context)
                                .colorScheme
                                .surfaceContainerHighest
                                .withValues(alpha: 0.3),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(22),
                              borderSide: BorderSide.none,
                            ),
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 14,
                              vertical: 8,
                            ),
                          ),
                          onChanged: (v) => setState(() => _search = v),
                        ),
                      ),
                      if (_kategoriOptions.isNotEmpty)
                        SizedBox(
                          height: 36,
                          child: ListView(
                            scrollDirection: Axis.horizontal,
                            padding: const EdgeInsets.symmetric(horizontal: 12),
                            children: [
                              FilterChip(
                                label: const Text(
                                  'Semua',
                                  style: TextStyle(fontSize: 11),
                                ),
                                selected: _filterKategori == 'SEMUA',
                                onSelected: (_) =>
                                    setState(() => _filterKategori = 'SEMUA'),
                                visualDensity: VisualDensity.compact,
                              ),
                              const SizedBox(width: 4),
                              ..._kategoriOptions.map((kat) {
                                final code = kat['category_code'] as String;
                                final name = kat['display_name'] as String;
                                return Padding(
                                  padding: const EdgeInsets.only(right: 4),
                                  child: FilterChip(
                                    label: Text(
                                      name,
                                      style: const TextStyle(fontSize: 11),
                                    ),
                                    selected: _filterKategori == code,
                                    onSelected: (_) =>
                                        setState(() => _filterKategori = code),
                                    visualDensity: VisualDensity.compact,
                                  ),
                                );
                              }),
                            ],
                          ),
                        ),
                      Expanded(child: _buildBukuKasList()),
                    ],
                  ),
                  // Tab Kasbon
                  _buildKasbonTab(),
                ],
              ),
            ),
          ),
        ],
      ),
      floatingActionButton: _canMutate
          ? FloatingActionButton(
              backgroundColor: const Color(0xFF00AFEF),
              onPressed: () => _showAddForm(),
              child: const Icon(Icons.add_rounded),
            )
          : null,
    );
  }

  // ============ TAB KASBON ============

  Widget _buildKasbonTab() {
    final kasbon = _ringkasanKasbon;
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (kasbon.karyawan.isEmpty) {
      return const EmptyState(
        icon: Icons.people_outline_rounded,
        title: 'Belum ada data kasbon',
      );
    }

    const excludedRoles = ['PEMILIK', 'DIREKTUR', 'KOMISARIS'];
    final filteredKaryawan = kasbon.karyawan
        .where((k) => !excludedRoles.contains(k.role.toUpperCase()))
        .toList();

    final filtered = _search.isEmpty
        ? filteredKaryawan
        : filteredKaryawan
              .where(
                (k) => k.nama.toLowerCase().contains(_search.toLowerCase()),
              )
              .toList();

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 0, 12, 4),
          child: TextField(
            decoration: InputDecoration(
              hintText: 'Cari karyawan...',
              prefixIcon: const Icon(Icons.search, size: 20),
              isDense: true,
              filled: true,
              fillColor: Theme.of(
                context,
              ).colorScheme.surfaceContainerHighest.withValues(alpha: 0.3),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(22),
                borderSide: BorderSide.none,
              ),
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 14,
                vertical: 8,
              ),
            ),
            onChanged: (v) => setState(() => _search = v),
          ),
        ),
        Expanded(
          child: filtered.isEmpty
              ? const EmptyState(
                  icon: Icons.search_off_rounded,
                  title: 'Tidak ditemukan',
                  subtitle: 'Coba kata kunci lain',
                )
              : RefreshIndicator(
                  onRefresh: () => _loadData(forceRefresh: true),
                  child: ListView.builder(
                    padding: const EdgeInsets.fromLTRB(12, 4, 12, 80),
                    itemCount: filtered.length,
                    itemBuilder: (_, i) => _buildKasbonCard(filtered[i]),
                  ),
                ),
        ),
      ],
    );
  }

  Widget _buildKasbonCard(KaryawanKasbon k) {
    final initials = k.nama.isNotEmpty
        ? k.nama
              .split(' ')
              .take(2)
              .map((s) => s.isNotEmpty ? s[0].toUpperCase() : '')
              .join()
        : '?';
    final lunas = k.saldoPinjaman <= 0;
    return Card(
      margin: const EdgeInsets.only(bottom: 6),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () async {
          await showModalBottomSheet(
            context: context,
            isScrollControlled: true,
            useSafeArea: true,
            backgroundColor: Colors.transparent,
            builder: (_) => DetailKasbonSheet(
              karyawan: k,
              onSuccess: () => _loadData(forceRefresh: true),
            ),
          );
        },
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(14),
                  gradient: LinearGradient(
                    colors: lunas
                        ? [Colors.green.shade400, Colors.green.shade600]
                        : [const Color(0xFFF59E0B), const Color(0xFFD97706)],
                  ),
                ),
                alignment: Alignment.center,
                child: Text(
                  initials,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    fontSize: 15,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      k.nama,
                      style: const TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 13,
                      ),
                    ),
                    Text(
                      k.roleLabel,
                      style: TextStyle(
                        fontSize: 11,
                        color: Colors.grey.shade500,
                      ),
                    ),
                  ],
                ),
              ),
              if (k.saldoPinjaman > 0)
                Text(
                  '-${_formatShort(k.saldoPinjaman)}',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: Colors.red.shade600,
                  ),
                ),
              const SizedBox(width: 4),
              Icon(Icons.chevron_right, color: Colors.grey.shade400, size: 20),
            ],
          ),
        ),
      ),
    );
  }
}

class _TabBarDelegate extends SliverPersistentHeaderDelegate {
  final TabBar tabBar;
  const _TabBarDelegate(this.tabBar);

  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) => Container(
    color: Theme.of(context).scaffoldBackgroundColor,
    child: tabBar,
  );

  @override
  double get maxExtent => tabBar.preferredSize.height;

  @override
  double get minExtent => tabBar.preferredSize.height;

  @override
  bool shouldRebuild(_TabBarDelegate oldDelegate) => false;
}
