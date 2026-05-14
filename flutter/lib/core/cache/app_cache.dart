import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class _CacheEntry {
  final dynamic data;
  final DateTime fetchedAt;
  _CacheEntry(this.data, this.fetchedAt);
}

/// In-memory + persistent cache similar to SWR on the web app.
///
/// - Shows cached data instantly (no spinner on revisits)
/// - Revalidates in the background when stale
/// - Persists across app restarts via secure storage
class AppCache {
  static final AppCache _instance = AppCache._();
  factory AppCache() => _instance;
  AppCache._();

  final Map<String, _CacheEntry> _memory = {};
  final _storage = const FlutterSecureStorage();
  static const _storageKey = 'gp_app_cache_v1';
  static const _maxPersistEntries = 50;

  bool _hydrated = false;

  /// Restore persisted cache from disk on startup.
  Future<void> hydrate() async {
    if (_hydrated) return;
    try {
      final raw = await _storage.read(key: _storageKey);
      if (raw != null) {
        final Map<String, dynamic> decoded = jsonDecode(raw);
        for (final entry in decoded.entries) {
          _memory[entry.key] = _CacheEntry(
            entry.value['d'],
            DateTime.fromMillisecondsSinceEpoch(entry.value['t'] as int),
          );
        }
      }
    } catch (e) {
      debugPrint('[Cache] hydrate error: $e');
    }
    _hydrated = true;
  }

  /// Get cached value. Returns null if nothing is cached for this key.
  dynamic get(String key) => _memory[key]?.data;

  /// Whether the cached entry is older than [maxAge].
  bool isStale(String key, {Duration maxAge = const Duration(minutes: 2)}) {
    final entry = _memory[key];
    if (entry == null) return true;
    return DateTime.now().difference(entry.fetchedAt) > maxAge;
  }

  /// Store a value in both memory and persistent cache.
  void set(String key, dynamic data) {
    _memory[key] = _CacheEntry(data, DateTime.now());
    _schedulePersist();
  }

  /// Invalidate a specific key.
  void invalidate(String key) {
    _memory.remove(key);
    _schedulePersist();
  }

  /// Invalidate all keys that start with the given prefix.
  void invalidatePrefix(String prefix) {
    _memory.removeWhere((k, _) => k.startsWith(prefix));
    _schedulePersist();
  }

  /// Clear everything (use on logout).
  Future<void> clear() async {
    _memory.clear();
    try {
      await _storage.delete(key: _storageKey);
    } catch (_) {}
  }

  bool _persistScheduled = false;

  void _schedulePersist() {
    if (_persistScheduled) return;
    _persistScheduled = true;
    Future.delayed(const Duration(milliseconds: 800), _persist);
  }

  Future<void> _persist() async {
    _persistScheduled = false;
    try {
      final entries = <String, dynamic>{};
      final keys = _memory.keys.toList();
      final start = keys.length > _maxPersistEntries
          ? keys.length - _maxPersistEntries
          : 0;
      for (int i = start; i < keys.length; i++) {
        final k = keys[i];
        final e = _memory[k]!;
        entries[k] = {
          'd': e.data,
          't': e.fetchedAt.millisecondsSinceEpoch,
        };
      }
      final serialized = jsonEncode(entries);
      if (serialized.length > 4 * 1024 * 1024) return;
      await _storage.write(key: _storageKey, value: serialized);
    } catch (e) {
      debugPrint('[Cache] persist error: $e');
    }
  }
}
