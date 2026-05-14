import 'package:gemiprint/core/constants/roles.dart';

class User {
  final String id;
  final String namaPengguna;
  final String? email;
  final String? namaLengkap;
  final UserRole role;
  final bool isActive;
  final String? createdAt;
  final String? updatedAt;

  const User({
    required this.id,
    required this.namaPengguna,
    this.email,
    this.namaLengkap,
    required this.role,
    this.isActive = true,
    this.createdAt,
    this.updatedAt,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'] as String,
      namaPengguna: (json['nama_pengguna'] ?? json['username'] ?? '') as String,
      email: json['email'] as String?,
      namaLengkap: (json['nama_lengkap'] ?? json['full_name']) as String?,
      role: UserRole.fromString((json['role'] ?? 'user') as String),
      isActive: (json['aktif'] ?? json['is_active'] ?? true) as bool,
      createdAt: json['created_at'] as String?,
      updatedAt: json['updated_at'] as String?,
    );
  }

  String get displayName => namaLengkap ?? namaPengguna;
}
