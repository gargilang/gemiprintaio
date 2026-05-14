class AppConfig {
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://app.gemiprint.com',
  );

  static const String appName = 'gemiprint';
  static const String appVersion = '1.0.0';

  static String apiUrl(String path) {
    final base = apiBaseUrl.endsWith('/') ? apiBaseUrl.substring(0, apiBaseUrl.length - 1) : apiBaseUrl;
    final p = path.startsWith('/') ? path : '/$path';
    return '$base$p';
  }
}
