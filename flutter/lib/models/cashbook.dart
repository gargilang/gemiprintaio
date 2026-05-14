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
  final double kasbonAnwar;
  final double kasbonSuri;
  final double kasbonCahaya;
  final double kasbonDinil;
  final double bagiHasilAnwar;
  final double bagiHasilSuri;
  final double bagiHasilGemi;
  final String? catatan;
  final String? dibuatOleh;
  final int? urutanTampilan;
  final String? createdAt;
  final String? updatedAt;

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
    this.kasbonAnwar = 0,
    this.kasbonSuri = 0,
    this.kasbonCahaya = 0,
    this.kasbonDinil = 0,
    this.bagiHasilAnwar = 0,
    this.bagiHasilSuri = 0,
    this.bagiHasilGemi = 0,
    this.catatan,
    this.dibuatOleh,
    this.urutanTampilan,
    this.createdAt,
    this.updatedAt,
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
      kasbonAnwar: (json['kasbon_anwar'] as num?)?.toDouble() ?? 0,
      kasbonSuri: (json['kasbon_suri'] as num?)?.toDouble() ?? 0,
      kasbonCahaya: (json['kasbon_cahaya'] as num?)?.toDouble() ?? 0,
      kasbonDinil: (json['kasbon_dinil'] as num?)?.toDouble() ?? 0,
      bagiHasilAnwar: (json['bagi_hasil_anwar'] as num?)?.toDouble() ?? 0,
      bagiHasilSuri: (json['bagi_hasil_suri'] as num?)?.toDouble() ?? 0,
      bagiHasilGemi: (json['bagi_hasil_gemi'] as num?)?.toDouble() ?? 0,
      catatan: json['catatan'] as String?,
      dibuatOleh: json['dibuat_oleh'] as String?,
      urutanTampilan: json['urutan_tampilan'] as int?,
      createdAt: json['created_at'] as String?,
      updatedAt: json['updated_at'] as String?,
    );
  }
}
