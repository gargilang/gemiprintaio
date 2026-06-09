-- Seed data: admin user, material categories, units, quick specs.
-- Table names must match database/sqlite-schema.sql (e.g. *_barang, not *_bahan).
-- SQLite: loaded after sqlite-schema.sql (see scripts/ and src/lib/db-unified.ts).

-- Default admin (username: gemi, password: admin) — password_hash is legacy SHA-256; login migrates to bcrypt automatically.
INSERT OR IGNORE INTO profil (id, nama_pengguna, email, nama_lengkap, password_hash, role, aktif_status)
VALUES (
  'admin-gemi-001',
  'gemi',
  'gemi@gemiprint.com',
  'Gemilang Romadhoni',
  '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918',
  'admin',
  1
);

-- Default Material Categories
INSERT OR IGNORE INTO kategori_barang (id, nama, butuh_spesifikasi_status, urutan_tampilan) VALUES
  ('cat-media-cetak', 'Media Cetak', 0, 1),
  ('cat-kertas', 'Kertas', 1, 2),
  ('cat-kertas-foto', 'Kertas Foto', 1, 3),
  ('cat-merchandise', 'Merchandise', 0, 4),
  ('cat-substrat-uv', 'Substrat UV', 0, 5),
  ('cat-tinta-consumables', 'Tinta & Consumables', 0, 6),
  ('cat-finishing', 'Finishing', 1, 7),
  ('cat-lain-lain', 'Lain-lain', 0, 8);

-- Default Subcategories for Media Cetak
INSERT OR IGNORE INTO subkategori_barang (id, kategori_id, nama, urutan_tampilan) VALUES
  ('sub-mc-flexi', 'cat-media-cetak', 'Flexi/Banner', 1),
  ('sub-mc-vinyl', 'cat-media-cetak', 'Vinyl', 2),
  ('sub-mc-sticker', 'cat-media-cetak', 'Sticker', 3),
  ('sub-mc-backlit', 'cat-media-cetak', 'Backlit', 4),
  ('sub-mc-owv', 'cat-media-cetak', 'One Way Vision', 5),
  ('sub-mc-albatross', 'cat-media-cetak', 'Albatross', 6),
  ('sub-mc-canvas', 'cat-media-cetak', 'Canvas', 7),
  ('sub-mc-lainlain', 'cat-media-cetak', 'Lain-lain', 99);

-- Default Subcategories for Kertas
INSERT OR IGNORE INTO subkategori_barang (id, kategori_id, nama, urutan_tampilan) VALUES
  ('sub-kr-hvs', 'cat-kertas', 'HVS', 1),
  ('sub-kr-art-paper', 'cat-kertas', 'Art Paper', 2),
  ('sub-kr-art-carton', 'cat-kertas', 'Art Carton', 3),
  ('sub-kr-ivory', 'cat-kertas', 'Ivory', 4),
  ('sub-kr-duplex', 'cat-kertas', 'Duplex', 5),
  ('sub-kr-bc-bw', 'cat-kertas', 'BC/BW', 6),
  ('sub-kr-kraft', 'cat-kertas', 'Kraft', 7),
  ('sub-kr-jasmine', 'cat-kertas', 'Jasmine', 8),
  ('sub-kr-concorde', 'cat-kertas', 'Concorde', 9),
  ('sub-kr-linen', 'cat-kertas', 'Linen', 10),
  ('sub-kr-foto', 'cat-kertas', 'Foto Paper', 11),
  ('sub-kr-lainlain', 'cat-kertas', 'Lain-lain', 99);

-- Default Subcategories for Kertas Foto
INSERT OR IGNORE INTO subkategori_barang (id, kategori_id, nama, urutan_tampilan) VALUES
  ('sub-kf-glossy', 'cat-kertas-foto', 'Photo Paper Glossy', 1),
  ('sub-kf-matte', 'cat-kertas-foto', 'Photo Paper Matte', 2),
  ('sub-kf-luster', 'cat-kertas-foto', 'Photo Paper Luster', 3),
  ('sub-kf-rc', 'cat-kertas-foto', 'RC Paper', 4),
  ('sub-kf-inkjet', 'cat-kertas-foto', 'Inkjet Paper', 5);

-- Default Subcategories for Merchandise
INSERT OR IGNORE INTO subkategori_barang (id, kategori_id, nama, urutan_tampilan) VALUES
  ('sub-md-totebag', 'cat-merchandise', 'Tote Bag', 1),
  ('sub-md-gelas', 'cat-merchandise', 'Gelas/Mug', 2),
  ('sub-md-kaos', 'cat-merchandise', 'Kaos', 3),
  ('sub-md-payung', 'cat-merchandise', 'Payung', 4),
  ('sub-md-pin', 'cat-merchandise', 'Pin/Badge', 5),
  ('sub-md-gantungan', 'cat-merchandise', 'Gantungan Kunci', 6),
  ('sub-md-idcard', 'cat-merchandise', 'ID Card', 7),
  ('sub-md-lanyard', 'cat-merchandise', 'Lanyard', 8),
  ('sub-md-tumbler', 'cat-merchandise', 'Tumbler', 9),
  ('sub-md-notebook', 'cat-merchandise', 'Notebook', 10),
  ('sub-md-pulpen', 'cat-merchandise', 'Pulpen', 11),
  ('sub-md-lainlain', 'cat-merchandise', 'Lain-lain', 99);

-- Default Subcategories for Substrat UV
INSERT OR IGNORE INTO subkategori_barang (id, kategori_id, nama, urutan_tampilan) VALUES
  ('sub-uv-akrilik', 'cat-substrat-uv', 'Akrilik', 1),
  ('sub-uv-kayu', 'cat-substrat-uv', 'Kayu', 2),
  ('sub-uv-mdf', 'cat-substrat-uv', 'MDF', 3),
  ('sub-uv-aluminium', 'cat-substrat-uv', 'Aluminium', 4),
  ('sub-uv-kaca', 'cat-substrat-uv', 'Kaca', 5),
  ('sub-uv-keramik', 'cat-substrat-uv', 'Keramik', 6),
  ('sub-uv-plastik', 'cat-substrat-uv', 'Plastik/PVC', 7),
  ('sub-uv-metal', 'cat-substrat-uv', 'Metal', 8),
  ('sub-uv-kulit', 'cat-substrat-uv', 'Kulit', 9),
  ('sub-uv-lainlain', 'cat-substrat-uv', 'Lain-lain', 99);

-- Default Subcategories for Tinta & Consumables
INSERT OR IGNORE INTO subkategori_barang (id, kategori_id, nama, urutan_tampilan) VALUES
  ('sub-tc-eco', 'cat-tinta-consumables', 'Tinta Eco Solvent', 1),
  ('sub-tc-uv', 'cat-tinta-consumables', 'Tinta UV', 2),
  ('sub-tc-sublim', 'cat-tinta-consumables', 'Tinta Sublim', 3),
  ('sub-tc-pigment', 'cat-tinta-consumables', 'Tinta Pigment', 4),
  ('sub-tc-dye', 'cat-tinta-consumables', 'Tinta Dye', 5),
  ('sub-tc-cleaning', 'cat-tinta-consumables', 'Cleaning Solution', 6),
  ('sub-tc-lainlain', 'cat-tinta-consumables', 'Lain-lain', 99);

-- Default Subcategories for Finishing
INSERT OR IGNORE INTO subkategori_barang (id, kategori_id, nama, urutan_tampilan) VALUES
  ('sub-fn-lam-glossy', 'cat-finishing', 'Laminating Glossy', 1),
  ('sub-fn-lam-doff', 'cat-finishing', 'Laminating Doff', 2),
  ('sub-fn-lam-sandblast', 'cat-finishing', 'Laminating Sandblast', 3),
  ('sub-fn-foam', 'cat-finishing', 'Foam Board', 4),
  ('sub-fn-kaca', 'cat-finishing', 'Kaca Acrylic', 5),
  ('sub-fn-bingkai', 'cat-finishing', 'Bingkai', 6),
  ('sub-fn-double-tape', 'cat-finishing', 'Double Tape', 7),
  ('sub-fn-lem', 'cat-finishing', 'Lem', 8),
  ('sub-fn-lainlain', 'cat-finishing', 'Lain-lain', 99);

-- Default Subcategories for Lain-lain
INSERT OR IGNORE INTO subkategori_barang (id, kategori_id, nama, urutan_tampilan) VALUES
  ('sub-ll-umum', 'cat-lain-lain', 'Umum', 1);

-- Default Materials
-- Placeholder material for maklon (subcontract printing). Used by item_penjualan

-- Default finance categories include MAKLON for subcontract outflows.
INSERT OR IGNORE INTO finance_category_definitions
  (id, category_code, display_name, color_bg, color_text, color_border, direction, is_active, display_order)
VALUES
  ('fin-cat-maklon', 'MAKLON', 'Maklon', 'bg-fuchsia-100', 'text-fuchsia-800', 'border-fuchsia-300', 'kredit', 1, 78);

-- Default Material Units
INSERT OR IGNORE INTO satuan_barang (id, nama, urutan_tampilan) VALUES
  ('unit-meter', 'meter', 1),
  ('unit-roll', 'roll', 2),
  ('unit-sheet', 'sheet', 3),
  ('unit-lembar', 'lembar', 4),
  ('unit-rim', 'rim', 5),
  ('unit-pack', 'pack', 6),
  ('unit-pcs', 'pcs', 7),
  ('unit-lusin', 'lusin', 8),
  ('unit-box', 'box', 9),
  ('unit-liter', 'liter', 10),
  ('unit-ml', 'ml', 11),
  ('unit-botol', 'botol', 12),
  ('unit-cartridge', 'cartridge', 13),
  ('unit-unit', 'unit', 14);

-- Default Quick Specs for Kertas (sizes)
INSERT OR IGNORE INTO spesifikasi_cepat_barang (id, kategori_id, tipe_spesifikasi, nilai_spesifikasi, urutan_tampilan) VALUES
  ('spec-kr-size-a0', 'cat-kertas', 'size', 'A0', 1),
  ('spec-kr-size-a1', 'cat-kertas', 'size', 'A1', 2),
  ('spec-kr-size-a2', 'cat-kertas', 'size', 'A2', 3),
  ('spec-kr-size-a3', 'cat-kertas', 'size', 'A3', 4),
  ('spec-kr-size-a3plus', 'cat-kertas', 'size', 'A3+', 5),
  ('spec-kr-size-a4', 'cat-kertas', 'size', 'A4', 6),
  ('spec-kr-size-a5', 'cat-kertas', 'size', 'A5', 7),
  ('spec-kr-size-a6', 'cat-kertas', 'size', 'A6', 8),
  ('spec-kr-size-b4', 'cat-kertas', 'size', 'B4', 9),
  ('spec-kr-size-b5', 'cat-kertas', 'size', 'B5', 10),
  ('spec-kr-size-letter', 'cat-kertas', 'size', 'Letter', 11),
  ('spec-kr-size-legal', 'cat-kertas', 'size', 'Legal', 12),
  ('spec-kr-size-ledger', 'cat-kertas', 'size', 'Ledger', 13),
  ('spec-kr-size-tabloid', 'cat-kertas', 'size', 'Tabloid', 14),
  ('spec-kr-size-f4', 'cat-kertas', 'size', 'F4', 15),
  ('spec-kr-size-folio', 'cat-kertas', 'size', 'Folio', 16),
  ('spec-kr-size-r4', 'cat-kertas', 'size', 'R4 (10x15cm)', 17),
  ('spec-kr-size-r8', 'cat-kertas', 'size', 'R8 (13x18cm)', 18),
  ('spec-kr-size-r16', 'cat-kertas', 'size', 'R16 (20x30cm)', 19),
  ('spec-kr-size-custom', 'cat-kertas', 'size', 'Custom', 99);

-- Default Quick Specs for Kertas (weights/gramasi)
INSERT OR IGNORE INTO spesifikasi_cepat_barang (id, kategori_id, tipe_spesifikasi, nilai_spesifikasi, urutan_tampilan) VALUES
  ('spec-kr-weight-60', 'cat-kertas', 'weight', '60 gsm', 1),
  ('spec-kr-weight-70', 'cat-kertas', 'weight', '70 gsm', 2),
  ('spec-kr-weight-80', 'cat-kertas', 'weight', '80 gsm', 3),
  ('spec-kr-weight-100', 'cat-kertas', 'weight', '100 gsm', 4),
  ('spec-kr-weight-120', 'cat-kertas', 'weight', '120 gsm', 5),
  ('spec-kr-weight-150', 'cat-kertas', 'weight', '150 gsm', 6),
  ('spec-kr-weight-190', 'cat-kertas', 'weight', '190 gsm', 7),
  ('spec-kr-weight-210', 'cat-kertas', 'weight', '210 gsm', 8),
  ('spec-kr-weight-230', 'cat-kertas', 'weight', '230 gsm', 9),
  ('spec-kr-weight-260', 'cat-kertas', 'weight', '260 gsm', 10),
  ('spec-kr-weight-310', 'cat-kertas', 'weight', '310 gsm', 11),
  ('spec-kr-weight-400', 'cat-kertas', 'weight', '400 gsm', 12);

-- Default Quick Specs for Kertas Foto (copy from Kertas rows, same spec columns)
INSERT OR IGNORE INTO spesifikasi_cepat_barang (id, kategori_id, tipe_spesifikasi, nilai_spesifikasi, urutan_tampilan)
SELECT
  REPLACE(id, 'cat-kertas', 'cat-kertas-foto'),
  'cat-kertas-foto',
  tipe_spesifikasi,
  nilai_spesifikasi,
  urutan_tampilan
FROM spesifikasi_cepat_barang
WHERE kategori_id = 'cat-kertas';

-- Default flexible finance participants (kosong — diisi oleh pengguna via UI "Kelola Orang")

-- Default flexible finance metric mappings (kosong — diisi oleh pengguna via UI)

-- Default flexible finance category definitions
INSERT OR IGNORE INTO finance_category_definitions (id, category_code, display_name, color_bg, color_text, color_border, direction, is_active, display_order) VALUES
  ('fin-cat-kas', 'KAS', 'Kas', 'bg-blue-100', 'text-blue-800', 'border-blue-300', 'both', 1, 10),
  ('fin-cat-biaya', 'BIAYA', 'Biaya', 'bg-red-100', 'text-red-800', 'border-red-300', 'kredit', 1, 20),
  ('fin-cat-omzet', 'OMZET', 'Omzet', 'bg-green-100', 'text-green-800', 'border-green-300', 'debit', 1, 30),
  ('fin-cat-investor', 'INVESTOR', 'Investor', 'bg-purple-100', 'text-purple-800', 'border-purple-300', 'both', 1, 40),
  ('fin-cat-subsidi', 'SUBSIDI', 'Subsidi', 'bg-yellow-100', 'text-yellow-800', 'border-yellow-300', 'debit', 1, 50),
  ('fin-cat-lunas', 'LUNAS', 'Lunas', 'bg-teal-100', 'text-teal-800', 'border-teal-300', 'debit', 1, 60),
  ('fin-cat-supply', 'SUPPLY', 'Supply', 'bg-orange-100', 'text-orange-800', 'border-orange-300', 'kredit', 1, 70),
  ('fin-cat-retur-pembelian', 'RETUR_PEMBELIAN', 'Retur Pembelian', 'bg-emerald-100', 'text-emerald-800', 'border-emerald-300', 'debit', 1, 72),
  ('fin-cat-hpp', 'HPP', 'Harga Pokok Penjualan', 'bg-slate-100', 'text-slate-800', 'border-slate-300', 'kredit', 1, 75),
  ('fin-cat-retur-hpp', 'RETUR_HPP', 'Retur HPP', 'bg-slate-100', 'text-slate-800', 'border-slate-300', 'debit', 1, 76),
  ('fin-cat-laba', 'LABA', 'Laba', 'bg-emerald-100', 'text-emerald-800', 'border-emerald-300', 'both', 1, 80),
  ('fin-cat-komisi', 'KOMISI', 'Komisi', 'bg-cyan-100', 'text-cyan-800', 'border-cyan-300', 'kredit', 1, 90),
  ('fin-cat-tabungan', 'TABUNGAN', 'Tabungan', 'bg-indigo-100', 'text-indigo-800', 'border-indigo-300', 'kredit', 1, 100),
  ('fin-cat-hutang', 'HUTANG', 'Hutang', 'bg-rose-100', 'text-rose-800', 'border-rose-300', 'kredit', 1, 110),
  ('fin-cat-piutang', 'PIUTANG', 'Piutang', 'bg-lime-100', 'text-lime-800', 'border-lime-300', 'debit', 1, 120),
  ('fin-cat-retur-penjualan', 'RETUR_PENJUALAN', 'Retur Penjualan', 'bg-rose-100', 'text-rose-800', 'border-rose-300', 'kredit', 1, 32),
  ('fin-cat-retur-penjualan-noncash', 'RETUR_PENJUALAN_NONCASH', 'Retur Penjualan (non-kas)', 'bg-rose-50', 'text-rose-700', 'border-rose-200', 'kredit', 1, 33),
  ('fin-cat-piutang', 'PIUTANG', 'Piutang', 'bg-lime-100', 'text-lime-800', 'border-lime-300', 'debit', 1, 120);

-- Penggajian: GAJI mengurangi laba (biaya_operasional); PINJAMAN_KARYAWAN
-- netral terhadap laba (kasbon = piutang, bukan biaya).
INSERT OR IGNORE INTO finance_category_definitions
  (id, category_code, display_name, color_bg, color_text, color_border, direction, is_active, display_order, metric_contributions) VALUES
  ('fin-cat-gaji', 'GAJI', 'Gaji', 'bg-teal-100', 'text-teal-800', 'border-teal-300', 'kredit', 1, 130, '[{"column":"biaya_operasional","amount_field":"kredit","sign":1}]'),
  ('fin-cat-pinjaman-karyawan', 'PINJAMAN_KARYAWAN', 'Pinjaman Karyawan', 'bg-cyan-100', 'text-cyan-800', 'border-cyan-300', 'both', 1, 140, '[]');
