class CashBookEntry {
  final String id;
  final String tanggal;
  final String kategoriTransaksi;
  final double debit;
  final double kredit;
  final String? keperluan;
  final double omzet;
  final double biayaOperasional;
  final double biayaBahan;
  final double saldo;
  final double labaBersih;
  final String? catatan;
  final String? dibuatOleh;
  final int? urutanTampilan;
  final String? createdAt;
  final String? updatedAt;
  final bool dapatDihapus;

  const CashBookEntry({
    required this.id,
    required this.tanggal,
    required this.kategoriTransaksi,
    this.debit = 0,
    this.kredit = 0,
    this.keperluan,
    this.omzet = 0,
    this.biayaOperasional = 0,
    this.biayaBahan = 0,
    this.saldo = 0,
    this.labaBersih = 0,
    this.catatan,
    this.dibuatOleh,
    this.urutanTampilan,
    this.createdAt,
    this.updatedAt,
    this.dapatDihapus = true,
  });

  factory CashBookEntry.fromJson(Map<String, dynamic> json) {
    return CashBookEntry(
      id: json['id'] as String,
      tanggal: (json['tanggal'] ?? '') as String,
      kategoriTransaksi: (json['kategori_transaksi'] ?? '') as String,
      debit: (json['debit'] as num?)?.toDouble() ?? 0,
      kredit: (json['kredit'] as num?)?.toDouble() ?? 0,
      keperluan: json['keperluan'] as String?,
      omzet: (json['omzet'] as num?)?.toDouble() ?? 0,
      biayaOperasional: (json['biaya_operasional'] as num?)?.toDouble() ?? 0,
      biayaBahan: (json['biaya_bahan'] as num?)?.toDouble() ?? 0,
      saldo: (json['saldo'] as num?)?.toDouble() ?? 0,
      labaBersih: (json['laba_bersih'] as num?)?.toDouble() ?? 0,
      catatan: json['catatan'] as String?,
      dibuatOleh: json['dibuat_oleh'] as String?,
      urutanTampilan: json['urutan_tampilan'] as int?,
      createdAt: (json['created_at'] ?? json['dibuat_pada']) as String?,
      updatedAt: (json['updated_at'] ?? json['diperbarui_pada']) as String?,
      dapatDihapus: json['dapat_dihapus'] as bool? ?? true,
    );
  }
}
