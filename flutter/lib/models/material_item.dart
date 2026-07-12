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
  final bool munculDiPos;
  final double stok;
  final double levelStokMinimum;
  final double averageCostPerBaseUnit;
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
    this.munculDiPos = true,
    this.stok = 0,
    this.levelStokMinimum = 0,
    this.averageCostPerBaseUnit = 0,
    this.createdAt,
    this.updatedAt,
    this.harga = const [],
  });

  factory MaterialItem.fromJson(Map<String, dynamic> json) {
    final hargaList = json['unit_prices'] ?? json['harga_barang_satuan'];
    return MaterialItem(
      id: json['id'] as String,
      nama: (json['nama'] ?? '') as String,
      deskripsi: json['deskripsi'] as String?,
      kategoriId: json['kategori_id'] as String?,
      subkategoriId: json['subkategori_id'] as String?,
      satuanId: json['satuan_id'] as String?,
      kategoriNama: (json['kategori_nama'] ?? json['category_name']) as String?,
      subkategoriNama:
          (json['subkategori_nama'] ?? json['subcategory_name']) as String?,
      satuanNama: (json['satuan_nama'] ?? json['satuan_dasar']) as String?,
      trackStock: _boolFromJson(
        json['track_stock'] ?? json['lacak_inventori_status'],
      ),
      dimensiRequired: _boolFromJson(
        json['dimensi_required'] ?? json['butuh_dimensi_status'],
      ),
      munculDiPos: _boolFromJson(
        json['muncul_di_pos_status'],
        defaultValue: true,
      ),
      stok:
          (json['stok'] as num?)?.toDouble() ??
          (json['jumlah_stok'] as num?)?.toDouble() ??
          0,
      levelStokMinimum:
          (json['level_stok_minimum'] as num?)?.toDouble() ?? 0,
      averageCostPerBaseUnit:
          (json['average_cost_per_base_unit'] as num?)?.toDouble() ?? 0,
      createdAt: (json['created_at'] ?? json['dibuat_pada']) as String?,
      updatedAt: (json['updated_at'] ?? json['diperbarui_pada']) as String?,
      harga: hargaList is List
          ? hargaList
                .map((h) => MaterialPrice.fromJson(h as Map<String, dynamic>))
                .toList()
          : [],
    );
  }

  Map<String, dynamic> toJson() => {
    'nama': nama,
    'deskripsi': deskripsi,
    'kategori_id': kategoriId,
    'subkategori_id': subkategoriId,
    'satuan_dasar': satuanNama,
    'lacak_inventori_status': trackStock,
    'butuh_dimensi_status': dimensiRequired,
  };
}

class MaterialPrice {
  final String id;
  final String barangId;
  final String label;
  final String? namaProdukJual;
  final double hargaBeli;
  final double hargaJual;
  final double hargaMember;
  final double faktorKonversi;
  final bool isDefault;

  const MaterialPrice({
    required this.id,
    required this.barangId,
    required this.label,
    this.namaProdukJual,
    this.hargaBeli = 0,
    this.hargaJual = 0,
    this.hargaMember = 0,
    this.faktorKonversi = 1,
    this.isDefault = false,
  });

  /// Label tampilan di POS: nama produk jual jika ada, fallback ke satuan.
  String get displayLabel =>
      (namaProdukJual?.trim().isNotEmpty ?? false)
          ? namaProdukJual!.trim()
          : label;

  double hargaUntuk({bool isMember = false}) {
    if (isMember && hargaMember > 0) return hargaMember;
    return hargaJual;
  }

  factory MaterialPrice.fromJson(Map<String, dynamic> json) {
    final rawDefault = json['default_status'];
    return MaterialPrice(
      id: json['id'] as String,
      barangId: (json['barang_id'] ?? '') as String,
      label: (json['nama_satuan'] ?? json['label'] ?? '') as String,
      namaProdukJual: json['nama_produk_jual'] as String?,
      hargaBeli: (json['harga_beli'] as num?)?.toDouble() ?? 0,
      hargaJual: (json['harga_jual'] as num?)?.toDouble() ?? 0,
      hargaMember: (json['harga_member'] as num?)?.toDouble() ?? 0,
      faktorKonversi: (json['faktor_konversi'] as num?)?.toDouble() ?? 1,
      isDefault: rawDefault == true || rawDefault == 1,
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

bool _boolFromJson(Object? value, {bool defaultValue = false}) {
  if (value == null) return defaultValue;
  return value == true || value == 1 || value == '1';
}
