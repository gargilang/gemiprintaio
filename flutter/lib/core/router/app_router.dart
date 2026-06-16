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
import 'package:gemiprint/features/sales_history/sales_history_page.dart';
import 'package:gemiprint/features/purchase_history/purchase_history_page.dart';
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
      // Path-based URLs on web (not #/...). "/" alone must redirect or new tabs show a blank screen.
      GoRoute(path: '/', redirect: (context, state) => '/dashboard'),
      GoRoute(path: '/login', builder: (context, state) => const LoginPage()),
      ShellRoute(
        builder: (context, state, child) => AppShell(child: child),
        routes: [
          GoRoute(
            path: '/dashboard',
            builder: (context, state) => const DashboardPage(),
          ),
          GoRoute(path: '/pos', builder: (context, state) => const PosPage()),
          GoRoute(
            path: '/production',
            builder: (context, state) => const ProductionPage(),
          ),
          GoRoute(
            path: '/materials',
            builder: (context, state) => const MaterialsPage(),
          ),
          GoRoute(
            path: '/purchases',
            builder: (context, state) => const PurchasesPage(),
          ),
          GoRoute(
            path: '/customers',
            builder: (context, state) => const CustomersPage(),
          ),
          GoRoute(
            path: '/vendors',
            builder: (context, state) => const VendorsPage(),
          ),
          GoRoute(
            path: '/sales-history',
            builder: (context, state) => const SalesHistoryPage(),
          ),
          GoRoute(
            path: '/purchase-history',
            builder: (context, state) => const PurchaseHistoryPage(),
          ),
          GoRoute(
            path: '/finance',
            builder: (context, state) => const FinancePage(),
          ),
        ],
      ),
    ],
  );
});
