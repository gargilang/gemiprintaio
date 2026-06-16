class Vendor {
  final String id;
  final String namaPerusahaan;
  final String tipeVendor;
  final String? email;
  final String? telepon;
  final String? alamat;
  final String? kontakPerson;
  final String? ketentuanBayar;
  final bool aktifStatus;
  final String? catatan;
  final String? createdAt;
  final String? updatedAt;

  const Vendor({
    required this.id,
    required this.namaPerusahaan,
    this.tipeVendor = 'SUPPLIER',
    this.email,
    this.telepon,
    this.alamat,
    this.kontakPerson,
    this.ketentuanBayar,
    this.aktifStatus = true,
    this.catatan,
    this.createdAt,
    this.updatedAt,
  });

  factory Vendor.fromJson(Map<String, dynamic> json) {
    return Vendor(
      id: json['id'] as String,
      namaPerusahaan: (json['nama_perusahaan'] ?? '') as String,
      tipeVendor: (json['tipe_vendor'] ?? 'SUPPLIER') as String,
      email: json['email'] as String?,
      telepon: json['telepon'] as String?,
      alamat: json['alamat'] as String?,
      kontakPerson: json['kontak_person'] as String?,
      ketentuanBayar: json['ketentuan_bayar'] as String?,
      aktifStatus: (json['aktif_status'] == 1 || json['aktif_status'] == true),
      catatan: json['catatan'] as String?,
      createdAt: json['created_at'] as String?,
      updatedAt: json['updated_at'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
    'nama_perusahaan': namaPerusahaan,
    'tipe_vendor': tipeVendor,
    'email': email ?? '',
    'telepon': telepon ?? '',
    'alamat': alamat ?? '',
    'kontak_person': kontakPerson,
    'ketentuan_bayar': ketentuanBayar,
    'aktif_status': aktifStatus,
    'catatan': catatan,
  };
}
