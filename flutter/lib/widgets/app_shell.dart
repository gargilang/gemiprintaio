import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';
import 'package:gemiprint/core/constants/roles.dart';
import 'package:gemiprint/core/theme/app_theme.dart';
import 'package:gemiprint/providers/providers.dart';

class _MenuItemData {
  final String path;
  final IconData icon;
  final String label;
  final List<UserRole>? allowedRoles;

  const _MenuItemData({
    required this.path,
    required this.icon,
    required this.label,
    this.allowedRoles,
  });
}

class _MenuGroupData {
  final String label;
  final IconData icon;
  final List<_MenuItemData> children;

  const _MenuGroupData({
    required this.label,
    required this.icon,
    required this.children,
  });
}

final List<dynamic> _menuEntries = [
  const _MenuItemData(
    path: '/dashboard',
    icon: Icons.dashboard_rounded,
    label: 'Beranda',
  ),
  const _MenuGroupData(
    label: 'Penjualan',
    icon: Icons.point_of_sale_rounded,
    children: [
      _MenuItemData(
        path: '/pos',
        icon: Icons.point_of_sale_rounded,
        label: 'POS / Kasir',
        allowedRoles: RoleGroups.operational,
      ),
    ],
  ),
  const _MenuGroupData(
    label: 'Produksi',
    icon: Icons.print_rounded,
    children: [
      _MenuItemData(
        path: '/production',
        icon: Icons.print_rounded,
        label: 'SPK',
        allowedRoles: RoleGroups.operational,
      ),
    ],
  ),
  const _MenuGroupData(
    label: 'Pembelian',
    icon: Icons.shopping_bag_rounded,
    children: [
      _MenuItemData(
        path: '/purchases',
        icon: Icons.shopping_bag_rounded,
        label: 'Pembelian',
        allowedRoles: RoleGroups.fullStaff,
      ),
    ],
  ),
  const _MenuGroupData(
    label: 'Inventori',
    icon: Icons.inventory_2_rounded,
    children: [
      _MenuItemData(
        path: '/materials',
        icon: Icons.category_rounded,
        label: 'Data Barang',
        allowedRoles: RoleGroups.fullStaff,
      ),
    ],
  ),
  const _MenuGroupData(
    label: 'Relasi',
    icon: Icons.people_alt_rounded,
    children: [
      _MenuItemData(
        path: '/customers',
        icon: Icons.groups_rounded,
        label: 'Pelanggan',
        allowedRoles: RoleGroups.frontOfHouse,
      ),
      _MenuItemData(
        path: '/vendors',
        icon: Icons.business_rounded,
        label: 'Vendor',
        allowedRoles: RoleGroups.fullStaff,
      ),
    ],
  ),
  const _MenuGroupData(
    label: 'Administrasi',
    icon: Icons.bar_chart_rounded,
    children: [
      _MenuItemData(
        path: '/finance',
        icon: Icons.account_balance_wallet_rounded,
        label: 'Keuangan',
        allowedRoles: RoleGroups.fullStaff,
      ),
    ],
  ),
];

class AppShell extends ConsumerWidget {
  final Widget child;
  const AppShell({super.key, required this.child});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authStateProvider);
    final user = authState.valueOrNull;
    final currentPath = GoRouterState.of(context).matchedLocation;

    return Scaffold(
      appBar: AppBar(
        title: Text(_titleForPath(currentPath)),
        actions: [
          if (user != null)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: Chip(
                avatar: CircleAvatar(
                  backgroundColor: Colors.white24,
                  child: Text(
                    user.displayName[0].toUpperCase(),
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                label: Text(
                  user.displayName,
                  style: const TextStyle(color: Colors.white, fontSize: 13),
                ),
                backgroundColor: Colors.white10,
                side: BorderSide.none,
              ),
            ),
        ],
      ),
      drawer: _buildDrawer(context, ref, user?.role, currentPath),
      body: child,
    );
  }

  Widget _buildDrawer(
    BuildContext context,
    WidgetRef ref,
    UserRole? role,
    String currentPath,
  ) {
    return Drawer(
      child: Container(
        color: AppColors.primaryDark,
        child: SafeArea(
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(
                  vertical: 24,
                  horizontal: 16,
                ),
                child: Row(
                  children: [
                    SvgPicture.asset(
                      'assets/logo-gemiprint-white.svg',
                      width: 36,
                      height: 36,
                    ),
                    const SizedBox(width: 12),
                    Text.rich(
                      TextSpan(
                        children: [
                          TextSpan(
                            text: 'gemi',
                            style: TextStyle(
                              color: AppColors.primary,
                              fontSize: 22,
                              fontFamily: AppFonts.brand,
                              fontStyle: FontStyle.italic,
                            ),
                          ),
                          const TextSpan(
                            text: 'print',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 22,
                              fontFamily: AppFonts.brand,
                              fontStyle: FontStyle.italic,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const Divider(color: Colors.white12, height: 1),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  children: _buildMenuItems(context, ref, role, currentPath),
                ),
              ),
              const Divider(color: Colors.white12, height: 1),
              ListTile(
                leading: const Icon(
                  Icons.logout_rounded,
                  color: Colors.white70,
                ),
                title: const Text(
                  'Keluar',
                  style: TextStyle(color: Colors.white70),
                ),
                onTap: () {
                  Navigator.of(context).pop();
                  ref.read(authStateProvider.notifier).logout();
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _buildMenuItems(
    BuildContext context,
    WidgetRef ref,
    UserRole? role,
    String currentPath,
  ) {
    final widgets = <Widget>[];

    for (final entry in _menuEntries) {
      if (entry is _MenuItemData) {
        if (!_canAccess(role, entry.allowedRoles)) continue;
        widgets.add(_buildMenuItem(context, entry, currentPath));
      } else if (entry is _MenuGroupData) {
        final visibleChildren = entry.children
            .where((c) => _canAccess(role, c.allowedRoles))
            .toList();
        if (visibleChildren.isEmpty) continue;

        widgets.add(
          Padding(
            padding: const EdgeInsets.only(left: 16, top: 16, bottom: 4),
            child: Text(
              entry.label.toUpperCase(),
              style: const TextStyle(
                color: Colors.white38,
                fontSize: 11,
                fontWeight: FontWeight.w600,
                letterSpacing: 1,
              ),
            ),
          ),
        );
        for (final child in visibleChildren) {
          widgets.add(_buildMenuItem(context, child, currentPath));
        }
      }
    }

    return widgets;
  }

  Widget _buildMenuItem(
    BuildContext context,
    _MenuItemData item,
    String currentPath,
  ) {
    final isSelected = currentPath == item.path;
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 1),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(8),
        color: isSelected ? AppColors.primary.withValues(alpha: 0.2) : null,
      ),
      child: ListTile(
        dense: true,
        leading: Icon(
          item.icon,
          color: isSelected ? AppColors.primary : Colors.white70,
          size: 20,
        ),
        title: Text(
          item.label,
          style: TextStyle(
            color: isSelected ? AppColors.primary : Colors.white70,
            fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
            fontSize: 14,
          ),
        ),
        onTap: () {
          Navigator.of(context).pop();
          context.go(item.path);
        },
      ),
    );
  }

  bool _canAccess(UserRole? role, List<UserRole>? allowedRoles) {
    if (role == null) return false;
    if (allowedRoles == null) return true;
    return allowedRoles.contains(role);
  }

  String _titleForPath(String path) {
    const titles = {
      '/dashboard': 'Beranda',
      '/pos': 'POS / Kasir',
      '/production': 'Produksi',
      '/materials': 'Data Barang',
      '/purchases': 'Pembelian',
      '/customers': 'Pelanggan',
      '/vendors': 'Vendor',
      '/finance': 'Keuangan',
    };
    return titles[path] ?? 'gemiprint';
  }
}
