import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:gemiprint/providers/providers.dart';
import 'package:gemiprint/features/auth/login_page.dart';
import 'package:gemiprint/features/dashboard/dashboard_page.dart';
import 'package:gemiprint/features/pos/pos_page.dart';
import 'package:gemiprint/features/production/production_page.dart';
import 'package:gemiprint/features/materials/materials_page.dart';
import 'package:gemiprint/features/purchases/purchases_page.dart';
import 'package:gemiprint/features/customers/customers_page.dart';
import 'package:gemiprint/features/vendors/vendors_page.dart';
import 'package:gemiprint/features/finance/finance_page.dart';
import 'package:gemiprint/features/reports/reports_page.dart';
import 'package:gemiprint/features/users/users_page.dart';
import 'package:gemiprint/features/settings/settings_page.dart';
import 'package:gemiprint/widgets/app_shell.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authStateProvider);

  return GoRouter(
    initialLocation: '/dashboard',
    debugLogDiagnostics: false,
    redirect: (context, state) {
      final isLoading = authState.isLoading;
      if (isLoading) return null;

      final isLoggedIn = authState.valueOrNull != null;
      final isLoginPage = state.matchedLocation == '/login';

      if (!isLoggedIn && !isLoginPage) return '/login';
      if (isLoggedIn && isLoginPage) return '/dashboard';
      return null;
    },
    routes: [
      GoRoute(
        path: '/login',
        builder: (context, state) => const LoginPage(),
      ),
      ShellRoute(
        builder: (context, state, child) => AppShell(child: child),
        routes: [
          GoRoute(path: '/dashboard', builder: (context, state) => const DashboardPage()),
          GoRoute(path: '/pos', builder: (context, state) => const PosPage()),
          GoRoute(path: '/production', builder: (context, state) => const ProductionPage()),
          GoRoute(path: '/materials', builder: (context, state) => const MaterialsPage()),
          GoRoute(path: '/purchases', builder: (context, state) => const PurchasesPage()),
          GoRoute(path: '/customers', builder: (context, state) => const CustomersPage()),
          GoRoute(path: '/vendors', builder: (context, state) => const VendorsPage()),
          GoRoute(path: '/finance', builder: (context, state) => const FinancePage()),
          GoRoute(path: '/reports', builder: (context, state) => const ReportsPage()),
          GoRoute(path: '/users', builder: (context, state) => const UsersPage()),
          GoRoute(path: '/settings', builder: (context, state) => const SettingsPage()),
        ],
      ),
    ],
  );
});
