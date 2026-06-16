/// Opsi finishing aktif dari `GET /api/finishing-options`.
class FinishingOption {
  final String id;
  final String nama;
  final int urutanTampilan;

  const FinishingOption({
    required this.id,
    required this.nama,
    this.urutanTampilan = 0,
  });

  factory FinishingOption.fromJson(Map<String, dynamic> json) {
    return FinishingOption(
      id: (json['id'] ?? '') as String,
      nama: (json['nama'] ?? '') as String,
      urutanTampilan: (json['urutan_tampilan'] as num?)?.toInt() ?? 0,
    );
  }
}

/// Finishing yang dipilih untuk satu baris keranjang.
/// Dikirim ke API sebagai `{ jenis_finishing, keterangan }`.
class FinishingSelection {
  final String jenisFinishing;
  final String? keterangan;

  const FinishingSelection({required this.jenisFinishing, this.keterangan});

  Map<String, dynamic> toJson() => {
        'jenis_finishing': jenisFinishing,
        if (keterangan != null && keterangan!.isNotEmpty)
          'keterangan': keterangan,
      };
}
