class RingkasanHutangPiutang {
  final HutangPiutangInfo hutang;
  final HutangPiutangInfo piutang;

  const RingkasanHutangPiutang({
    required this.hutang,
    required this.piutang,
  });

  factory RingkasanHutangPiutang.fromJson(Map<String, dynamic> json) {
    return RingkasanHutangPiutang(
      hutang: HutangPiutangInfo.fromJson(
          json['hutang'] as Map<String, dynamic>? ?? {}),
      piutang: HutangPiutangInfo.fromJson(
          json['piutang'] as Map<String, dynamic>? ?? {}),
    );
  }
}

class HutangPiutangInfo {
  final double total;
  final int jumlah;

  const HutangPiutangInfo({
    required this.total,
    required this.jumlah,
  });

  factory HutangPiutangInfo.fromJson(Map<String, dynamic> json) {
    return HutangPiutangInfo(
      total: (json['total'] as num?)?.toDouble() ?? 0,
      jumlah: (json['jumlah'] as num?)?.toInt() ?? 0,
    );
  }
}
