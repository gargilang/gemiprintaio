import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:gemiprint/core/router/app_router.dart';
import 'package:gemiprint/core/theme/app_theme.dart';
import 'package:gemiprint/providers/providers.dart';

class GemiprintApp extends ConsumerWidget {
  const GemiprintApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Tahan render router sampai status auth diketahui. Tanpa ini, router
    // sempat mem-build halaman awal (/dashboard) untuk sekejap sebelum
    // redirect ke /login — menyebabkan "kedip" beranda di perangkat yang
    // belum login. Sesi tetap diingat (token di secure storage), jadi
    // pengguna yang sudah login langsung masuk dashboard tanpa kedip login.
    final authState = ref.watch(authStateProvider);

    if (authState.isLoading) {
      return const _SplashApp();
    }

    final router = ref.watch(routerProvider);
    return MaterialApp.router(
      title: 'gemiprint',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      routerConfig: router,
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [
        Locale('id', 'ID'),
        Locale('en', 'US'),
      ],
    );
  }
}

/// Layar splash bermerek selama pengecekan sesi awal.
class _SplashApp extends StatelessWidget {
  const _SplashApp();

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'gemiprint',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      home: const Scaffold(
        backgroundColor: AppColors.primaryDark,
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _SplashLogo(),
              SizedBox(height: 24),
              SizedBox(
                width: 26,
                height: 26,
                child: CircularProgressIndicator(
                  strokeWidth: 2.5,
                  valueColor: AlwaysStoppedAnimation(AppColors.primary),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SplashLogo extends StatelessWidget {
  const _SplashLogo();

  @override
  Widget build(BuildContext context) {
    return SvgPicture.asset(
      'assets/logo-gemiprint-putih.svg',
      height: 88,
    );
  }
}
