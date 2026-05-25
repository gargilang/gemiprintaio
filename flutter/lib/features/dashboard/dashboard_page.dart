import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';
import 'package:gemiprint/core/theme/app_theme.dart';
import 'package:gemiprint/providers/providers.dart';
import 'package:intl/intl.dart';

class DashboardPage extends ConsumerStatefulWidget {
  const DashboardPage({super.key});

  @override
  ConsumerState<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends ConsumerState<DashboardPage> {
  Map<String, dynamic>? _stats;
  bool _isLoading = false;
  String? _error;

  final _fmt = NumberFormat.currency(
    locale: 'id_ID',
    symbol: 'Rp ',
    decimalDigits: 0,
  );

  @override
  void initState() {
    super.initState();
    _loadStats();
  }

  Future<void> _loadStats({bool forceRefresh = false}) async {
    if (_stats == null) {
      setState(() {
        _isLoading = true;
        _error = null;
      });
    }
    try {
      final api = ref.read(apiClientProvider);

      final results = await Future.wait([
        api.get('/api/pos/init-data', forceRefresh: forceRefresh),
        api.get('/api/production', forceRefresh: forceRefresh),
        api.get('/api/finance/cash-book', forceRefresh: forceRefresh),
      ]);

      if (mounted) {
        final posData = results[0] as Map<String, dynamic>;
        final prodData = results[1] as Map<String, dynamic>;
        final financeData = results[2] as Map<String, dynamic>;

        final sales = posData['sales'] as List? ?? [];
        final orders = prodData['orders'] as List? ?? [];
        final entries =
            financeData['cashBooks'] as List? ??
            financeData['entries'] as List? ??
            financeData['keuangan'] as List? ??
            [];

        // Hitung statistik hari ini
        final today = DateTime.now();
        final todayStr =
            '${today.year}-${today.month.toString().padLeft(2, '0')}-${today.day.toString().padLeft(2, '0')}';

        final todaySales = sales.where((s) {
          final dateStr =
              s['dibuat_pada'] as String? ?? s['created_at'] as String? ?? '';
          return dateStr.startsWith(todayStr);
        }).toList();

        double todayRevenue = 0;
        for (final s in todaySales) {
          todayRevenue += (s['total_jumlah'] as num?)?.toDouble() ?? 0;
        }

        // Produksi aktif (MENUNGGU + PROSES)
        final activeOrders = orders.where((o) {
          final status = o['status'] as String? ?? '';
          return status == 'MENUNGGU' || status == 'PROSES';
        }).length;

        final kilat = orders.where((o) {
          final status = o['status'] as String? ?? '';
          final prioritas = o['prioritas'] as String? ?? '';
          return (status == 'MENUNGGU' || status == 'PROSES') &&
              prioritas == 'KILAT';
        }).length;

        // Saldo kas
        double saldo = 0;
        if (entries.isNotEmpty) {
          saldo = (entries.last['saldo'] as num?)?.toDouble() ?? 0;
        }

        // Piutang aktif
        int activePiutang = 0;
        double totalPiutang = 0;
        for (final s in sales) {
          final status = s['status_pembayaran'] as String? ?? 'LUNAS';
          if (status == 'AKTIF' || status == 'SEBAGIAN') {
            activePiutang++;
            totalPiutang += (s['sisa_piutang'] as num?)?.toDouble() ?? 0;
          }
        }

        setState(() {
          _stats = {
            'todaySalesCount': todaySales.length,
            'todayRevenue': todayRevenue,
            'totalSalesCount': sales.length,
            'activeOrders': activeOrders,
            'kilat': kilat,
            'saldo': saldo,
            'activePiutang': activePiutang,
            'totalPiutang': totalPiutang,
          };
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = 'Gagal memuat statistik';
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authStateProvider).valueOrNull;

    return RefreshIndicator(
      onRefresh: () => _loadStats(forceRefresh: true),
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Welcome card
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [AppColors.primary, AppColors.accent],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          'Selamat Datang, ${user?.displayName ?? ''}!',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 20,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                      Opacity(
                        opacity: 0.35,
                        child: SvgPicture.asset(
                          'assets/logo-gemiprint-white.svg',
                          width: 48,
                          height: 48,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text.rich(
                    TextSpan(
                      children: [
                        TextSpan(
                          text: 'gemi',
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.9),
                            fontSize: 14,
                            fontFamily: AppFonts.brand,
                            fontStyle: FontStyle.italic,
                          ),
                        ),
                        TextSpan(
                          text: 'print',
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.9),
                            fontSize: 14,
                            fontFamily: AppFonts.brand,
                            fontStyle: FontStyle.italic,
                          ),
                        ),
                        TextSpan(
                          text: ' — Sistem Manajemen Percetakan',
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.85),
                            fontSize: 13,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (user != null) ...[
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        user.role.name.toUpperCase(),
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 20),

            if (_isLoading)
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(32),
                  child: CircularProgressIndicator(),
                ),
              )
            else if (_error != null) ...[
              Center(
                child: Column(
                  children: [
                    const Icon(
                      Icons.error_outline,
                      color: Colors.grey,
                      size: 40,
                    ),
                    const SizedBox(height: 8),
                    Text(_error!, style: const TextStyle(color: Colors.grey)),
                    const SizedBox(height: 12),
                    ElevatedButton.icon(
                      onPressed: _loadStats,
                      icon: const Icon(Icons.refresh, size: 16),
                      label: const Text('Coba Lagi'),
                    ),
                  ],
                ),
              ),
            ] else if (_stats != null) ...[
              // Stats hari ini
              const Text(
                'Hari Ini',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: _statCard(
                      'Transaksi',
                      '${_stats!['todaySalesCount']}',
                      Icons.receipt_long_rounded,
                      AppColors.primary,
                      subtitle: 'penjualan',
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _statCard(
                      'Omzet',
                      _fmt.format(_stats!['todayRevenue']),
                      Icons.trending_up_rounded,
                      AppColors.success,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),

              // Produksi
              const Text(
                'Produksi',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: _statCard(
                      'Antrian Aktif',
                      '${_stats!['activeOrders']}',
                      Icons.print_rounded,
                      AppColors.warning,
                      subtitle: 'order',
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _statCard(
                      'Kilat',
                      '${_stats!['kilat']}',
                      Icons.bolt_rounded,
                      AppColors.error,
                      subtitle: 'order mendesak',
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),

              // Keuangan
              const Text(
                'Keuangan',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: _statCard(
                      'Saldo Kas',
                      _fmt.format(_stats!['saldo']),
                      Icons.account_balance_wallet_rounded,
                      AppColors.primary,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _statCard(
                      'Piutang Aktif',
                      _fmt.format(_stats!['totalPiutang']),
                      Icons.receipt_outlined,
                      AppColors.error,
                      subtitle: '${_stats!['activePiutang']} transaksi',
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),

              // Quick access
              const Text(
                'Akses Cepat',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 10),
              GridView.count(
                crossAxisCount: 3,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisSpacing: 10,
                mainAxisSpacing: 10,
                childAspectRatio: 1.1,
                children: [
                  _quickAccessTile(
                    context,
                    'POS',
                    Icons.point_of_sale_rounded,
                    AppColors.primary,
                    '/pos',
                  ),
                  _quickAccessTile(
                    context,
                    'Produksi',
                    Icons.print_rounded,
                    AppColors.warning,
                    '/production',
                  ),
                  _quickAccessTile(
                    context,
                    'Pembelian',
                    Icons.shopping_bag_rounded,
                    AppColors.warning,
                    '/purchases',
                  ),
                  _quickAccessTile(
                    context,
                    'Barang',
                    Icons.category_rounded,
                    AppColors.accent,
                    '/materials',
                  ),
                  _quickAccessTile(
                    context,
                    'Pelanggan',
                    Icons.groups_rounded,
                    AppColors.primary,
                    '/customers',
                  ),
                  _quickAccessTile(
                    context,
                    'Vendor',
                    Icons.business_rounded,
                    AppColors.accent,
                    '/vendors',
                  ),
                  _quickAccessTile(
                    context,
                    'Keuangan',
                    Icons.account_balance_wallet_rounded,
                    AppColors.success,
                    '/finance',
                  ),
                ],
              ),
            ],
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _statCard(
    String title,
    String value,
    IconData icon,
    Color color, {
    String? subtitle,
  }) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey.shade100),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, color: color, size: 20),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
                ),
                Text(
                  value,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: color,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
                if (subtitle != null)
                  Text(
                    subtitle,
                    style: TextStyle(fontSize: 10, color: Colors.grey.shade400),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _quickAccessTile(
    BuildContext context,
    String label,
    IconData icon,
    Color color,
    String route,
  ) {
    return GestureDetector(
      onTap: () => context.go(route),
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.grey.shade100),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.03),
              blurRadius: 6,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, color: color, size: 22),
            ),
            const SizedBox(height: 6),
            Text(
              label,
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
