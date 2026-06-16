class RingkasanKasbon {
  final List<KaryawanKasbon> karyawan;
  final double totalKasbon;
  final int jumlahKaryawan;

  const RingkasanKasbon({
    required this.karyawan,
    required this.totalKasbon,
    required this.jumlahKaryawan,
  });

  factory RingkasanKasbon.fromJson(Map<String, dynamic> json) {
    return RingkasanKasbon(
      karyawan: (json['karyawan'] as List<dynamic>?)
              ?.map((j) => KaryawanKasbon.fromJson(j as Map<String, dynamic>))
              .toList() ??
          [],
      totalKasbon: (json['total_kasbon'] as num?)?.toDouble() ?? 0,
      jumlahKaryawan: (json['jumlah_karyawan'] as num?)?.toInt() ?? 0,
    );
  }
}

class KaryawanKasbon {
  final String actorId;
  final String nama;
  final String role;
  final String roleLabel;
  final double saldoPinjaman;

  const KaryawanKasbon({
    required this.actorId,
    required this.nama,
    required this.role,
    required this.roleLabel,
    required this.saldoPinjaman,
  });

  factory KaryawanKasbon.fromJson(Map<String, dynamic> json) {
    return KaryawanKasbon(
      actorId: json['actor_id'] as String? ?? '',
      nama: json['nama'] as String? ?? '',
      role: json['role'] as String? ?? '',
      roleLabel: json['role_label'] as String? ?? '',
      saldoPinjaman: (json['saldo_pinjaman'] as num?)?.toDouble() ?? 0,
    );
  }
}
