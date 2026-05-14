class MaterialItem {
  final String id;
  final String nama;
  final String? deskripsi;
  final String? kategoriId;
  final String? subkategoriId;
  final String? satuanId;
  final String? kategoriNama;
  final String? subkategoriNama;
  final String? satuanNama;
  final bool trackStock;
  final bool dimensiRequired;
  final double stok;
  final String? createdAt;
  final String? updatedAt;
  final List<MaterialPrice> harga;

  const MaterialItem({
    required this.id,
    required this.nama,
    this.deskripsi,
    this.kategoriId,
    this.subkategoriId,
    this.satuanId,
    this.kategoriNama,
    this.subkategoriNama,
    this.satuanNama,
    this.trackStock = false,
    this.dimensiRequired = false,
    this.stok = 0,
    this.createdAt,
    this.updatedAt,
    this.harga = const [],
  });

  factory MaterialItem.fromJson(Map<String, dynamic> json) {
    final hargaList = json['harga_barang_satuan'];
    return MaterialItem(
      id: json['id'] as String,
      nama: (json['nama'] ?? '') as String,
      deskripsi: json['deskripsi'] as String?,
      kategoriId: json['kategori_id'] as String?,
      subkategoriId: json['subkategori_id'] as String?,
      satuanId: json['satuan_id'] as String?,
      kategoriNama: json['kategori_nama'] as String?,
      subkategoriNama: json['subkategori_nama'] as String?,
      satuanNama: json['satuan_nama'] as String?,
      trackStock: (json['track_stock'] ?? false) as bool,
      dimensiRequired: (json['dimensi_required'] ?? false) as bool,
      stok: (json['stok'] as num?)?.toDouble() ?? 0,
      createdAt: json['created_at'] as String?,
      updatedAt: json['updated_at'] as String?,
      harga: hargaList is List
          ? hargaList.map((h) => MaterialPrice.fromJson(h as Map<String, dynamic>)).toList()
          : [],
    );
  }

  Map<String, dynamic> toJson() => {
    'nama': nama,
    'deskripsi': deskripsi,
    'kategori_id': kategoriId,
    'subkategori_id': subkategoriId,
    'satuan_id': satuanId,
    'track_stock': trackStock,
    'dimensi_required': dimensiRequired,
  };
}

class MaterialPrice {
  final String id;
  final String barangId;
  final String label;
  final double hargaBeli;
  final double hargaJual;
  final double hargaMember;
  final double faktorKonversi;

  const MaterialPrice({
    required this.id,
    required this.barangId,
    required this.label,
    this.hargaBeli = 0,
    this.hargaJual = 0,
    this.hargaMember = 0,
    this.faktorKonversi = 1,
  });

  factory MaterialPrice.fromJson(Map<String, dynamic> json) {
    return MaterialPrice(
      id: json['id'] as String,
      barangId: (json['barang_id'] ?? '') as String,
      label: (json['label'] ?? '') as String,
      hargaBeli: (json['harga_beli'] as num?)?.toDouble() ?? 0,
      hargaJual: (json['harga_jual'] as num?)?.toDouble() ?? 0,
      hargaMember: (json['harga_member'] as num?)?.toDouble() ?? 0,
      faktorKonversi: (json['faktor_konversi'] as num?)?.toDouble() ?? 1,
    );
  }

  Map<String, dynamic> toJson() => {
    'barang_id': barangId,
    'label': label,
    'harga_beli': hargaBeli,
    'harga_jual': hargaJual,
    'harga_member': hargaMember,
    'faktor_konversi': faktorKonversi,
  };
}
