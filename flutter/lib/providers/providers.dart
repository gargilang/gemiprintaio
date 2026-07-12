import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gemiprint/core/cache/app_cache.dart';
import 'package:gemiprint/models/user.dart';
import 'package:gemiprint/services/api_client.dart';
import 'package:gemiprint/services/auth_service.dart';
import 'package:gemiprint/services/customers_service.dart';
import 'package:gemiprint/services/finance_service.dart';
import 'package:gemiprint/services/katalog_maklon_service.dart';
import 'package:gemiprint/services/materials_service.dart';
import 'package:gemiprint/services/pengambilan_service.dart';
import 'package:gemiprint/services/pos_service.dart';
import 'package:gemiprint/services/production_service.dart';
import 'package:gemiprint/services/purchases_service.dart';
import 'package:gemiprint/services/settings_service.dart';
import 'package:gemiprint/services/token_storage.dart';
import 'package:gemiprint/services/users_service.dart';
import 'package:gemiprint/services/vendors_service.dart';

final tokenStorageProvider = Provider<TokenStorage>((ref) {
  return TokenStorage();
});

final apiClientProvider = Provider<ApiClient>((ref) {
  final tokenStorage = ref.watch(tokenStorageProvider);
  return ApiClient(tokenStorage: tokenStorage);
});

final authServiceProvider = Provider<AuthService>((ref) {
  final api = ref.watch(apiClientProvider);
  final tokenStorage = ref.watch(tokenStorageProvider);
  return AuthService(api: api, tokenStorage: tokenStorage);
});

final customersServiceProvider = Provider<CustomersService>((ref) {
  return CustomersService(ref.watch(apiClientProvider));
});

final vendorsServiceProvider = Provider<VendorsService>((ref) {
  return VendorsService(ref.watch(apiClientProvider));
});

final materialsServiceProvider = Provider<MaterialsService>((ref) {
  return MaterialsService(ref.watch(apiClientProvider));
});

final katalogMaklonServiceProvider = Provider<KatalogMaklonService>((ref) {
  return KatalogMaklonService(ref.watch(apiClientProvider));
});

final posServiceProvider = Provider<PosService>((ref) {
  return PosService(ref.watch(apiClientProvider));
});

final productionServiceProvider = Provider<ProductionService>((ref) {
  return ProductionService(ref.watch(apiClientProvider));
});

final pengambilanServiceProvider = Provider<PengambilanService>((ref) {
  return PengambilanService(ref.watch(apiClientProvider));
});

final purchasesServiceProvider = Provider<PurchasesService>((ref) {
  return PurchasesService(ref.watch(apiClientProvider));
});

final financeServiceProvider = Provider<FinanceService>((ref) {
  return FinanceService(ref.watch(apiClientProvider));
});

final settingsServiceProvider = Provider<SettingsService>((ref) {
  return SettingsService(ref.watch(apiClientProvider));
});

final usersServiceProvider = Provider<UsersService>((ref) {
  return UsersService(ref.watch(apiClientProvider));
});

final authStateProvider = StateNotifierProvider<AuthNotifier, AsyncValue<User?>>((ref) {
  final authService = ref.watch(authServiceProvider);
  final tokenStorage = ref.watch(tokenStorageProvider);
  return AuthNotifier(authService: authService, tokenStorage: tokenStorage);
});

class AuthNotifier extends StateNotifier<AsyncValue<User?>> {
  final AuthService _authService;
  final TokenStorage _tokenStorage;

  AuthNotifier({required AuthService authService, required TokenStorage tokenStorage})
      : _authService = authService,
        _tokenStorage = tokenStorage,
        super(const AsyncValue.loading()) {
    _init();
  }

  Future<void> _init() async {
    final hasToken = await _tokenStorage.hasToken();
    if (!hasToken) {
      state = const AsyncValue.data(null);
      return;
    }

    try {
      final user = await _authService.getCurrentUser();
      state = AsyncValue.data(user);
    } catch (e) {
      await _tokenStorage.clearToken();
      state = const AsyncValue.data(null);
    }
  }

  Future<AuthResult> login(String username, String password) async {
    final result = await _authService.login(username, password);
    if (result.success && result.user != null) {
      state = AsyncValue.data(result.user);
    }
    return result;
  }

  Future<void> logout() async {
    await _authService.logout();
    await AppCache().clear();
    state = const AsyncValue.data(null);
  }

  bool get isLoggedIn => state.valueOrNull != null;
  User? get currentUser => state.valueOrNull;
}
