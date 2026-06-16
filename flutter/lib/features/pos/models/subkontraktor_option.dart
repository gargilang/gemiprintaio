/// Vendor subkontraktor untuk pemilih baris maklon.
class SubkontraktorOption {
  final String id;
  final String namaPerusahaan;
  final String? kontakPerson;

  const SubkontraktorOption({
    required this.id,
    required this.namaPerusahaan,
    this.kontakPerson,
  });

  factory SubkontraktorOption.fromJson(Map<String, dynamic> json) {
    return SubkontraktorOption(
      id: (json['id'] ?? '') as String,
      namaPerusahaan:
          (json['nama_perusahaan'] ?? json['nama'] ?? '') as String,
      kontakPerson: json['kontak_person'] as String?,
    );
  }
}
