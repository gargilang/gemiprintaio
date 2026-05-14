class Customer {
  final String id;
  final String tipePelanggan;
  final String nama;
  final String? namaPerusahaan;
  final String? npwp;
  final String? email;
  final String? telepon;
  final String? alamat;
  final bool isMember;
  final String? createdAt;
  final String? updatedAt;

  const Customer({
    required this.id,
    required this.tipePelanggan,
    required this.nama,
    this.namaPerusahaan,
    this.npwp,
    this.email,
    this.telepon,
    this.alamat,
    this.isMember = false,
    this.createdAt,
    this.updatedAt,
  });

  factory Customer.fromJson(Map<String, dynamic> json) {
    return Customer(
      id: json['id'] as String,
      tipePelanggan: (json['tipe_pelanggan'] ?? 'perorangan') as String,
      nama: (json['nama'] ?? '') as String,
      namaPerusahaan: json['nama_perusahaan'] as String?,
      npwp: json['npwp'] as String?,
      email: json['email'] as String?,
      telepon: json['telepon'] as String?,
      alamat: json['alamat'] as String?,
      isMember: json['is_member'] == true || json['member_status'] == 1 || json['member_status'] == true,
      createdAt: json['created_at'] as String?,
      updatedAt: json['updated_at'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
    'tipe_pelanggan': tipePelanggan,
    'nama': nama,
    'nama_perusahaan': namaPerusahaan,
    'npwp': npwp,
    'email': email,
    'telepon': telepon,
    'alamat': alamat,
    'is_member': isMember,
  };
}
