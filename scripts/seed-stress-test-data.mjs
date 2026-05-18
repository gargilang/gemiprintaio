/**
 * Inserts fake stress-test master data into Supabase (barang, pelanggan, vendor).
 * All rows use IDs prefixed with "stress-seed-" so they can be removed safely
 * via: npm run supabase:stress:remove
 *
 * Uses Supabase REST API (SUPABASE_SERVICE_ROLE_KEY) or Postgres (DATABASE_URL).
 * Run: npm run supabase:stress:seed
 */
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const PREFIX = "stress-seed";
const NAME_TAG = "[TEST]";

// --- Barang templates (85 items across printing-shop categories) ---
const BARANG_TEMPLATES = [
  { k: "cat-media-cetak", s: "sub-mc-flexi", u: "meter", n: "Flexi 280gr Frontlit", sp: "280gr", stok: 120, min: 10, dim: 1, buy: 18000, sell: 25000, mem: 22000 },
  { k: "cat-media-cetak", s: "sub-mc-flexi", u: "meter", n: "Flexi 440gr Backlit", sp: "440gr", stok: 80, min: 8, dim: 1, buy: 32000, sell: 45000, mem: 40000 },
  { k: "cat-media-cetak", s: "sub-mc-flexi", u: "roll", n: "Flexi 280gr Roll 3.2m", sp: "3.2m", stok: 15, min: 2, dim: 1, buy: 550000, sell: 720000, mem: 680000 },
  { k: "cat-media-cetak", s: "sub-mc-flexi", u: "meter", n: "Flexi Korea 510gr", sp: "510gr", stok: 60, min: 5, dim: 1, buy: 42000, sell: 58000, mem: 52000 },
  { k: "cat-media-cetak", s: "sub-mc-flexi", u: "meter", n: "Banner Korea 13oz", sp: "13oz", stok: 90, min: 10, dim: 1, buy: 22000, sell: 32000, mem: 29000 },
  { k: "cat-media-cetak", s: "sub-mc-vinyl", u: "meter", n: "Vinyl Glossy Stiker", sp: "Glossy", stok: 200, min: 20, dim: 1, buy: 12000, sell: 18000, mem: 16000 },
  { k: "cat-media-cetak", s: "sub-mc-vinyl", u: "meter", n: "Vinyl Doff Stiker", sp: "Doff", stok: 150, min: 15, dim: 1, buy: 13000, sell: 19000, mem: 17000 },
  { k: "cat-media-cetak", s: "sub-mc-vinyl", u: "roll", n: "Vinyl Transparan Roll 1.27m", sp: "1.27m", stok: 8, min: 1, dim: 1, buy: 380000, sell: 520000, mem: 480000 },
  { k: "cat-media-cetak", s: "sub-mc-vinyl", u: "meter", n: "Vinyl Reflective Grade", sp: "Reflective", stok: 40, min: 5, dim: 1, buy: 45000, sell: 65000, mem: 58000 },
  { k: "cat-media-cetak", s: "sub-mc-vinyl", u: "meter", n: "Vinyl Floor Graphic", sp: "Floor", stok: 35, min: 5, dim: 1, buy: 38000, sell: 55000, mem: 50000 },
  { k: "cat-media-cetak", s: "sub-mc-sticker", u: "meter", n: "Stiker Chromo Glossy", sp: null, stok: 100, min: 10, dim: 0, buy: 8000, sell: 14000, mem: 12000 },
  { k: "cat-media-cetak", s: "sub-mc-sticker", u: "meter", n: "Stiker Vinyl Cutting", sp: null, stok: 75, min: 8, dim: 0, buy: 15000, sell: 22000, mem: 20000 },
  { k: "cat-media-cetak", s: "sub-mc-sticker", u: "lembar", n: "Stiker Hologram A4", sp: "A4", stok: 500, min: 50, dim: 0, buy: 2500, sell: 5000, mem: 4500 },
  { k: "cat-media-cetak", s: "sub-mc-backlit", u: "meter", n: "Backlit Film 200mic", sp: "200mic", stok: 45, min: 5, dim: 1, buy: 35000, sell: 48000, mem: 44000 },
  { k: "cat-media-cetak", s: "sub-mc-owv", u: "meter", n: "One Way Vision 1.37m", sp: "1.37m", stok: 70, min: 7, dim: 1, buy: 28000, sell: 40000, mem: 36000 },
  { k: "cat-media-cetak", s: "sub-mc-albatross", u: "meter", n: "Albatross 270gr", sp: "270gr", stok: 55, min: 5, dim: 1, buy: 24000, sell: 35000, mem: 32000 },
  { k: "cat-media-cetak", s: "sub-mc-canvas", u: "meter", n: "Canvas Matte 380gr", sp: "380gr", stok: 30, min: 3, dim: 1, buy: 55000, sell: 78000, mem: 72000 },
  { k: "cat-kertas", s: "sub-kr-hvs", u: "rim", n: "HVS A4 80gsm", sp: '{"size":"A4","weight":"80 gsm"}', stok: 40, min: 5, dim: 0, buy: 42000, sell: 55000, mem: 50000 },
  { k: "cat-kertas", s: "sub-kr-hvs", u: "rim", n: "HVS A3 80gsm", sp: '{"size":"A3","weight":"80 gsm"}', stok: 25, min: 3, dim: 0, buy: 85000, sell: 110000, mem: 100000 },
  { k: "cat-kertas", s: "sub-kr-hvs", u: "lembar", n: "HVS F4 70gsm", sp: '{"size":"F4","weight":"70 gsm"}', stok: 2000, min: 200, dim: 0, buy: 350, sell: 600, mem: 550 },
  { k: "cat-kertas", s: "sub-kr-art-paper", u: "rim", n: "Art Paper A4 150gsm", sp: '{"size":"A4","weight":"150 gsm"}', stok: 20, min: 2, dim: 0, buy: 95000, sell: 125000, mem: 115000 },
  { k: "cat-kertas", s: "sub-kr-art-carton", u: "rim", n: "Art Carton A3 260gsm", sp: '{"size":"A3","weight":"260 gsm"}', stok: 12, min: 2, dim: 0, buy: 180000, sell: 240000, mem: 220000 },
  { k: "cat-kertas", s: "sub-kr-ivory", u: "rim", n: "Ivory A4 230gsm", sp: '{"size":"A4","weight":"230 gsm"}', stok: 18, min: 2, dim: 0, buy: 120000, sell: 160000, mem: 148000 },
  { k: "cat-kertas", s: "sub-kr-duplex", u: "rim", n: "Duplex A3 250gsm", sp: '{"size":"A3","weight":"250 gsm"}', stok: 15, min: 2, dim: 0, buy: 110000, sell: 150000, mem: 138000 },
  { k: "cat-kertas", s: "sub-kr-bc-bw", u: "rim", n: "BC 260gsm A4", sp: '{"size":"A4","weight":"260 gsm"}', stok: 10, min: 1, dim: 0, buy: 140000, sell: 185000, mem: 170000 },
  { k: "cat-kertas", s: "sub-kr-kraft", u: "rim", n: "Kraft Paper A4 120gsm", sp: '{"size":"A4","weight":"120 gsm"}', stok: 8, min: 1, dim: 0, buy: 75000, sell: 98000, mem: 90000 },
  { k: "cat-kertas", s: "sub-kr-jasmine", u: "rim", n: "Jasmine A4 120gsm", sp: '{"size":"A4","weight":"120 gsm"}', stok: 6, min: 1, dim: 0, buy: 88000, sell: 115000, mem: 105000 },
  { k: "cat-kertas", s: "sub-kr-foto", u: "lembar", n: "Foto Paper R4 260gr", sp: '{"size":"R4 (10x15cm)","weight":"260 gsm"}', stok: 800, min: 100, dim: 0, buy: 800, sell: 1500, mem: 1300 },
  { k: "cat-kertas-foto", s: "sub-kf-glossy", u: "lembar", n: "Photo Paper Glossy A4", sp: '{"size":"A4"}', stok: 500, min: 50, dim: 0, buy: 1200, sell: 2500, mem: 2200 },
  { k: "cat-kertas-foto", s: "sub-kf-matte", u: "lembar", n: "Photo Paper Matte A4", sp: '{"size":"A4"}', stok: 400, min: 40, dim: 0, buy: 1300, sell: 2600, mem: 2300 },
  { k: "cat-kertas-foto", s: "sub-kf-luster", u: "lembar", n: "Photo Paper Luster A3+", sp: '{"size":"A3+"}', stok: 200, min: 20, dim: 0, buy: 3500, sell: 6000, mem: 5500 },
  { k: "cat-kertas-foto", s: "sub-kf-rc", u: "pack", n: "RC Paper Roll 24 inch", sp: "24 inch", stok: 5, min: 1, dim: 0, buy: 450000, sell: 620000, mem: 580000 },
  { k: "cat-merchandise", s: "sub-md-totebag", u: "pcs", n: "Tote Bag Canvas Putih", sp: null, stok: 150, min: 20, dim: 0, buy: 15000, sell: 28000, mem: 25000 },
  { k: "cat-merchandise", s: "sub-md-gelas", u: "pcs", n: "Mug Keramik Putih 11oz", sp: "11oz", stok: 80, min: 10, dim: 0, buy: 12000, sell: 22000, mem: 20000 },
  { k: "cat-merchandise", s: "sub-md-kaos", u: "pcs", n: "Kaos Combed 30s Hitam L", sp: "L", stok: 60, min: 10, dim: 0, buy: 45000, sell: 75000, mem: 68000 },
  { k: "cat-merchandise", s: "sub-md-payung", u: "pcs", n: "Payung Golf 2 Layer", sp: null, stok: 25, min: 5, dim: 0, buy: 55000, sell: 95000, mem: 85000 },
  { k: "cat-merchandise", s: "sub-md-pin", u: "pcs", n: "Pin Badge 58mm", sp: "58mm", stok: 300, min: 30, dim: 0, buy: 2500, sell: 8000, mem: 7000 },
  { k: "cat-merchandise", s: "sub-md-gantungan", u: "pcs", n: "Gantungan Kunci Akrilik", sp: null, stok: 200, min: 25, dim: 0, buy: 3500, sell: 12000, mem: 10000 },
  { k: "cat-merchandise", s: "sub-md-idcard", u: "pcs", n: "ID Card PVC 0.76mm", sp: "0.76mm", stok: 500, min: 50, dim: 0, buy: 1500, sell: 5000, mem: 4500 },
  { k: "cat-merchandise", s: "sub-md-lanyard", u: "pcs", n: "Lanyard Sublim 2cm", sp: "2cm", stok: 120, min: 15, dim: 0, buy: 8000, sell: 18000, mem: 16000 },
  { k: "cat-merchandise", s: "sub-md-tumbler", u: "pcs", n: "Tumbler Stainless 500ml", sp: "500ml", stok: 40, min: 5, dim: 0, buy: 35000, sell: 65000, mem: 58000 },
  { k: "cat-merchandise", s: "sub-md-notebook", u: "pcs", n: "Notebook A5 Hardcover", sp: "A5", stok: 70, min: 10, dim: 0, buy: 18000, sell: 35000, mem: 32000 },
  { k: "cat-substrat-uv", s: "sub-uv-akrilik", u: "lembar", n: "Akrilik Clear 3mm A3", sp: "3mm A3", stok: 20, min: 3, dim: 1, buy: 85000, sell: 135000, mem: 125000 },
  { k: "cat-substrat-uv", s: "sub-uv-kayu", u: "lembar", n: "Kayu Jati 5mm A4", sp: "5mm A4", stok: 15, min: 2, dim: 1, buy: 45000, sell: 78000, mem: 72000 },
  { k: "cat-substrat-uv", s: "sub-uv-mdf", u: "lembar", n: "MDF 3mm 60x40cm", sp: "60x40", stok: 30, min: 5, dim: 1, buy: 25000, sell: 45000, mem: 42000 },
  { k: "cat-substrat-uv", s: "sub-uv-aluminium", u: "lembar", n: "Aluminium Composite 3mm", sp: "3mm", stok: 25, min: 3, dim: 1, buy: 120000, sell: 185000, mem: 170000 },
  { k: "cat-substrat-uv", s: "sub-uv-kaca", u: "lembar", n: "Kaca Tempered 5mm A4", sp: "5mm A4", stok: 8, min: 1, dim: 1, buy: 35000, sell: 65000, mem: 60000 },
  { k: "cat-tinta-consumables", s: "sub-tc-eco", u: "liter", n: "Tinta Eco Solvent Cyan 1L", sp: "Cyan", stok: 12, min: 2, dim: 0, buy: 280000, sell: 380000, mem: 350000 },
  { k: "cat-tinta-consumables", s: "sub-tc-eco", u: "liter", n: "Tinta Eco Solvent Magenta 1L", sp: "Magenta", stok: 12, min: 2, dim: 0, buy: 280000, sell: 380000, mem: 350000 },
  { k: "cat-tinta-consumables", s: "sub-tc-uv", u: "liter", n: "Tinta UV White 500ml", sp: "White", stok: 8, min: 1, dim: 0, buy: 320000, sell: 450000, mem: 420000 },
  { k: "cat-tinta-consumables", s: "sub-tc-sublim", u: "liter", n: "Tinta Sublim Yellow 1L", sp: "Yellow", stok: 6, min: 1, dim: 0, buy: 250000, sell: 340000, mem: 310000 },
  { k: "cat-tinta-consumables", s: "sub-tc-cleaning", u: "botol", n: "Cleaning Solution 1L", sp: null, stok: 20, min: 3, dim: 0, buy: 45000, sell: 75000, mem: 68000 },
  { k: "cat-finishing", s: "sub-fn-lam-glossy", u: "meter", n: "Laminating Glossy 1.27m", sp: "1.27m", stok: 50, min: 5, dim: 1, buy: 8000, sell: 14000, mem: 12500 },
  { k: "cat-finishing", s: "sub-fn-lam-doff", u: "meter", n: "Laminating Doff 1.27m", sp: "1.27m", stok: 45, min: 5, dim: 1, buy: 8500, sell: 14500, mem: 13000 },
  { k: "cat-finishing", s: "sub-fn-foam", u: "lembar", n: "Foam Board 5mm 60x90", sp: "5mm", stok: 100, min: 10, dim: 1, buy: 18000, sell: 32000, mem: 29000 },
  { k: "cat-finishing", s: "sub-fn-kaca", u: "lembar", n: "Kaca Acrylic 3mm A3", sp: "3mm A3", stok: 35, min: 5, dim: 1, buy: 55000, sell: 88000, mem: 80000 },
  { k: "cat-finishing", s: "sub-fn-bingkai", u: "pcs", n: "Bingkai Kayu A4", sp: "A4", stok: 40, min: 5, dim: 0, buy: 25000, sell: 55000, mem: 50000 },
  { k: "cat-finishing", s: "sub-fn-double-tape", u: "roll", n: "Double Tape 48mm x 50m", sp: "48mm", stok: 60, min: 10, dim: 0, buy: 12000, sell: 22000, mem: 20000 },
  { k: "cat-lain-lain", s: "sub-ll-umum", u: "pcs", n: "Jasa Desain Grafis", sp: null, stok: 0, min: 0, dim: 0, buy: 0, sell: 150000, mem: 135000, lacak: 0 },
  { k: "cat-lain-lain", s: "sub-ll-umum", u: "pcs", n: "Jasa Cutting Plotter", sp: null, stok: 0, min: 0, dim: 0, buy: 0, sell: 25000, mem: 22000, lacak: 0 },
  { k: "cat-media-cetak", s: "sub-mc-flexi", u: "meter", n: "Flexi Black Back 440gr", sp: "440gr BB", stok: 35, min: 4, dim: 1, buy: 38000, sell: 52000, mem: 48000 },
  { k: "cat-media-cetak", s: "sub-mc-sticker", u: "meter", n: "Stiker White PP", sp: "PP", stok: 65, min: 7, dim: 0, buy: 11000, sell: 17000, mem: 15500 },
  { k: "cat-kertas", s: "sub-kr-hvs", u: "rim", n: "HVS A5 80gsm", sp: '{"size":"A5","weight":"80 gsm"}', stok: 30, min: 3, dim: 0, buy: 28000, sell: 38000, mem: 35000 },
  { k: "cat-kertas", s: "sub-kr-linen", u: "rim", n: "Linen Texture A4", sp: '{"size":"A4"}', stok: 5, min: 1, dim: 0, buy: 165000, sell: 220000, mem: 200000 },
  { k: "cat-kertas-foto", s: "sub-kf-inkjet", u: "lembar", n: "Inkjet Paper A3 180gsm", sp: '{"size":"A3","weight":"180 gsm"}', stok: 150, min: 15, dim: 0, buy: 2800, sell: 5000, mem: 4500 },
  { k: "cat-merchandise", s: "sub-md-pulpen", u: "pcs", n: "Pulpen Promosi Custom", sp: null, stok: 250, min: 30, dim: 0, buy: 3500, sell: 10000, mem: 9000 },
  { k: "cat-substrat-uv", s: "sub-uv-plastik", u: "lembar", n: "PVC Foam Board 10mm", sp: "10mm", stok: 18, min: 2, dim: 1, buy: 95000, sell: 155000, mem: 142000 },
  { k: "cat-tinta-consumables", s: "sub-tc-pigment", u: "cartridge", n: "Cartridge Pigment Black XL", sp: "Black XL", stok: 10, min: 2, dim: 0, buy: 185000, sell: 265000, mem: 245000 },
  { k: "cat-finishing", s: "sub-fn-lem", u: "botol", n: "Lem Contact 250ml", sp: "250ml", stok: 24, min: 4, dim: 0, buy: 18000, sell: 32000, mem: 29000 },
  { k: "cat-media-cetak", s: "sub-mc-vinyl", u: "meter", n: "Vinyl Sandblast", sp: "Sandblast", stok: 28, min: 3, dim: 1, buy: 22000, sell: 33000, mem: 30000 },
  { k: "cat-kertas", s: "sub-kr-concorde", u: "rim", n: "Concorde A4 150gsm", sp: '{"size":"A4","weight":"150 gsm"}', stok: 7, min: 1, dim: 0, buy: 105000, sell: 140000, mem: 128000 },
  { k: "cat-merchandise", s: "sub-md-kaos", u: "pcs", n: "Kaos Polyester Putih M", sp: "M", stok: 45, min: 8, dim: 0, buy: 38000, sell: 65000, mem: 60000 },
  { k: "cat-substrat-uv", s: "sub-uv-keramik", u: "pcs", n: "Mug Sublim Blank", sp: null, stok: 90, min: 12, dim: 0, buy: 8000, sell: 15000, mem: 13500 },
  { k: "cat-tinta-consumables", s: "sub-tc-dye", u: "liter", n: "Tinta Dye Black 1L", sp: "Black", stok: 9, min: 1, dim: 0, buy: 120000, sell: 175000, mem: 160000 },
  { k: "cat-finishing", s: "sub-fn-lam-sandblast", u: "meter", n: "Laminating Sandblast 1.37m", sp: "1.37m", stok: 22, min: 3, dim: 1, buy: 9500, sell: 16000, mem: 14500 },
  { k: "cat-media-cetak", s: "sub-mc-lainlain", u: "meter", n: "Mesh Banner 270gr", sp: "270gr", stok: 42, min: 5, dim: 1, buy: 19000, sell: 28000, mem: 25500 },
  { k: "cat-kertas", s: "sub-kr-lainlain", u: "rim", n: "Kertas Label A4 Stiker", sp: '{"size":"A4"}', stok: 14, min: 2, dim: 0, buy: 72000, sell: 98000, mem: 90000 },
  { k: "cat-merchandise", s: "sub-md-lainlain", u: "pcs", n: "Topi Trucker Custom", sp: null, stok: 35, min: 5, dim: 0, buy: 22000, sell: 48000, mem: 44000 },
  { k: "cat-substrat-uv", s: "sub-uv-metal", u: "lembar", n: "Plat Aluminium Brushed A4", sp: "A4", stok: 12, min: 2, dim: 1, buy: 65000, sell: 110000, mem: 100000 },
  { k: "cat-tinta-consumables", s: "sub-tc-lainlain", u: "pcs", n: "Print Head Cleaning Kit", sp: null, stok: 5, min: 1, dim: 0, buy: 450000, sell: 650000, mem: 600000 },
  { k: "cat-finishing", s: "sub-fn-lainlain", u: "pcs", n: "Ring Binder A4 2 D", sp: "2D", stok: 55, min: 8, dim: 0, buy: 12000, sell: 25000, mem: 22000 },
  { k: "cat-kertas", s: "sub-kr-hvs", u: "rim", n: "HVS B5 70gsm", sp: '{"size":"B5","weight":"70 gsm"}', stok: 22, min: 3, dim: 0, buy: 38000, sell: 52000, mem: 48000 },
  { k: "cat-media-cetak", s: "sub-mc-backlit", u: "meter", n: "Backlit Super Bright", sp: "Super", stok: 18, min: 2, dim: 1, buy: 48000, sell: 68000, mem: 62000 },
  { k: "cat-merchandise", s: "sub-md-totebag", u: "pcs", n: "Tote Bag Non Woven Hitam", sp: null, stok: 200, min: 25, dim: 0, buy: 4500, sell: 12000, mem: 10000 },
  { k: "cat-kertas-foto", s: "sub-kf-glossy", u: "lembar", n: "Photo Paper Glossy R16", sp: '{"size":"R16 (20x30cm)"}', stok: 120, min: 12, dim: 0, buy: 4500, sell: 9000, mem: 8200 },
];

const PELANGGAN = [
  { id: "plg-01", tipe: "perusahaan", nama: "PT Maju Print Indonesia", perusahaan: "PT Maju Print Indonesia", npwp: "01.234.567.8-901.000", member: 0, email: "billing@majuprint-test.local", tel: "021-5550101" },
  { id: "plg-02", tipe: "perusahaan", nama: "CV Kreasi Visual Nusantara", perusahaan: "CV Kreasi Visual Nusantara", npwp: "02.345.678.9-012.000", member: 0, email: "finance@kreasi-visual-test.local", tel: "021-5550102" },
  { id: "plg-03", tipe: "perusahaan", nama: "PT Global Signage Solutions", perusahaan: "PT Global Signage Solutions", npwp: "03.456.789.0-123.000", member: 1, email: "po@globalsign-test.local", tel: "021-5550103" },
  { id: "plg-04", tipe: "perusahaan", nama: "UD Berkah Percetakan", perusahaan: "UD Berkah Percetakan", npwp: null, member: 0, email: "udberkah@test.local", tel: "0812-5550104" },
  { id: "plg-05", tipe: "perusahaan", nama: "PT Metro Advertising Group", perusahaan: "PT Metro Advertising Group", npwp: "05.678.901.2-345.000", member: 1, email: "procurement@metro-ads-test.local", tel: "021-5550105" },
  { id: "plg-06", tipe: "perorangan", nama: "Budi Santoso", perusahaan: null, npwp: null, member: 1, email: "budi.santoso@test.local", tel: "0813-5550106" },
  { id: "plg-07", tipe: "perorangan", nama: "Siti Rahmawati", perusahaan: null, npwp: null, member: 1, email: "siti.r@test.local", tel: "0814-5550107" },
  { id: "plg-08", tipe: "perorangan", nama: "Andi Wijaya", perusahaan: null, npwp: null, member: 1, email: "andi.wijaya@test.local", tel: "0815-5550108" },
  { id: "plg-09", tipe: "perorangan", nama: "Dewi Lestari", perusahaan: null, npwp: null, member: 0, email: "dewi.lestari@test.local", tel: "0816-5550109" },
  { id: "plg-10", tipe: "perorangan", nama: "Rizki Pratama", perusahaan: null, npwp: null, member: 0, email: "rizki.p@test.local", tel: "0817-5550110" },
  { id: "plg-11", tipe: "perorangan", nama: "Ahmad Fauzi", perusahaan: null, npwp: null, member: 1, email: "ahmad.fauzi@test.local", tel: "0818-5550111" },
  { id: "plg-12", tipe: "perorangan", nama: "Maya Sari", perusahaan: null, npwp: null, member: 0, email: "maya.sari@test.local", tel: "0819-5550112" },
  { id: "plg-13", tipe: "RETAIL", nama: "Walk-in Pelanggan Umum", perusahaan: null, npwp: null, member: 0, email: "", tel: "" },
  { id: "plg-14", tipe: "RETAIL", nama: "Pelanggan Loyal - Ibu Ratna", perusahaan: null, npwp: null, member: 0, email: "ratna.loyal@test.local", tel: "0821-5550114" },
  { id: "plg-15", tipe: "RETAIL", nama: "Pelanggan Loyal - Pak Hendra", perusahaan: null, npwp: null, member: 0, email: "hendra.loyal@test.local", tel: "0822-5550115" },
  { id: "plg-16", tipe: "perusahaan", nama: "Kantor Pemasaran Event Pro", perusahaan: "Event Pro Organizer", npwp: null, member: 1, email: "eventpro@test.local", tel: "021-5550116" },
  { id: "plg-17", tipe: "perorangan", nama: "Broker Member - Joko Susilo", perusahaan: "JS Media Broker", npwp: null, member: 1, email: "joko.broker@test.local", tel: "0823-5550117" },
  { id: "plg-18", tipe: "perorangan", nama: "Broker Member - Linda Kartika", perusahaan: "LK Print Broker", npwp: null, member: 1, email: "linda.broker@test.local", tel: "0824-5550118" },
  { id: "plg-19", tipe: "perusahaan", nama: "PT Retail Chain Display", perusahaan: "PT Retail Chain Display", npwp: "19.876.543.2-109.000", member: 1, email: "display@retailchain-test.local", tel: "021-5550119" },
  { id: "plg-20", tipe: "perorangan", nama: "Pelanggan Reguler - Eko Prasetyo", perusahaan: null, npwp: null, member: 0, email: "eko.reguler@test.local", tel: "0825-5550120" },
];

const VENDOR = [
  { id: "vnd-01", nama: "PT Sumber Bahan Cetak Nusantara", kontak: "Bambang Wijaya", tel: "021-7770001", bayar: "NET 30", catatan: "Supplier flexi & vinyl utama" },
  { id: "vnd-02", nama: "CV Mitra Kertas Indonesia", kontak: "Sri Mulyani", tel: "021-7770002", bayar: "NET 14", catatan: "Kertas HVS, art paper, ivory" },
  { id: "vnd-03", nama: "UD Tinta Digital Jaya", kontak: "Hendra Gunawan", tel: "021-7770003", bayar: "COD", catatan: "Tinta eco, UV, sublim" },
  { id: "vnd-04", nama: "PT Merchandise Kreasi", kontak: "Dian Permata", tel: "021-7770004", bayar: "NET 21", catatan: "Souvenir & merchandise" },
  { id: "vnd-05", nama: "CV Substrat UV Material", kontak: "Rudi Hartono", tel: "021-7770005", bayar: "NET 30", catatan: "Akrilik, MDF, aluminium composite" },
  { id: "vnd-06", nama: "PT Finishing Supply Center", kontak: "Yuni Astuti", tel: "021-7770006", bayar: "NET 14", catatan: "Laminating, foam board, lem" },
  { id: "vnd-07", nama: "UD Import Media Korea", kontak: "Agus Salim", tel: "021-7770007", bayar: "DP 50%", catatan: "Flexi Korea, backlit import" },
  { id: "vnd-08", nama: "PT Digital Ink Global", kontak: "Claire Tan", tel: "021-7770008", bayar: "NET 45", catatan: "Tinta original & compatible" },
  { id: "vnd-09", nama: "CV Packaging & Label Pro", kontak: "Fajar Nugroho", tel: "021-7770009", bayar: "NET 7", catatan: "Label, stiker roll, packaging" },
  { id: "vnd-10", nama: "PT General Printing Supplies", kontak: "Wahyu Prasetya", tel: "021-7770010", bayar: "NET 30", catatan: "Consumables umum & spare part" },
];

const ADDRESSES = [
  "Jl. Industri Raya No. 12, Jakarta Barat",
  "Kawasan Pergudangan Lippo Cikarang Blok B2",
  "Jl. Gatot Subroto Kav. 45, Jakarta Selatan",
  "Ruko Green Lake City Blok GA No. 8, Tangerang",
  "Jl. Ahmad Yani No. 88, Surabaya",
];

function stressId(kind, suffix) {
  return `${PREFIX}-${kind}-${suffix}`;
}

function buildPayload() {
  const barangRows = [];
  const hargaRows = [];

  for (let i = 0; i < BARANG_TEMPLATES.length; i++) {
    const t = BARANG_TEMPLATES[i];
    const num = String(i + 1).padStart(3, "0");
    const barangId = stressId("brg", num);
    const hargaId = stressId("hbs", num);
    const lacak = t.lacak !== undefined ? t.lacak : 1;

    barangRows.push({
      id: barangId,
      nama: `${NAME_TAG} ${t.n}`,
      deskripsi: `Data stress test — aman dihapus (prefix ${PREFIX})`,
      kategori_id: t.k,
      subkategori_id: t.s,
      satuan_dasar: t.u,
      spesifikasi: t.sp,
      jumlah_stok: t.stok,
      level_stok_minimum: t.min,
      lacak_inventori_status: lacak,
      butuh_dimensi_status: t.dim,
      sync_status: "synced",
      sync_version: 1,
    });

    hargaRows.push({
      id: hargaId,
      barang_id: barangId,
      nama_satuan: t.u,
      faktor_konversi: 1,
      harga_beli: t.buy,
      harga_jual: t.sell,
      harga_member: t.mem,
      default_status: 1,
      urutan_tampilan: 1,
      sync_status: "synced",
      sync_version: 1,
    });
  }

  const pelangganRows = PELANGGAN.map((p, i) => ({
    id: stressId("plg", p.id),
    tipe_pelanggan: p.tipe,
    nama: `${NAME_TAG} ${p.nama}`,
    nama_perusahaan: p.perusahaan ? `${NAME_TAG} ${p.perusahaan}` : null,
    npwp: p.npwp,
    email: p.email,
    telepon: p.tel,
    alamat: ADDRESSES[i % ADDRESSES.length],
    member_status: p.member,
    sync_status: "synced",
    sync_version: 1,
  }));

  const vendorRows = VENDOR.map((v, i) => ({
    id: stressId("vnd", v.id),
    nama_perusahaan: `${NAME_TAG} ${v.nama}`,
    email: `${v.id}@vendor-stress-test.local`,
    telepon: v.tel,
    alamat: ADDRESSES[i % ADDRESSES.length],
    kontak_person: v.kontak,
    ketentuan_bayar: v.bayar,
    aktif_status: 1,
    catatan: `Stress test — ${v.catatan}. Prefix: ${PREFIX}`,
    sync_status: "synced",
    sync_version: 1,
  }));

  return { barangRows, hargaRows, pelangganRows, vendorRows };
}

async function upsertBatches(supabase, table, rows, batchSize = 50) {
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict: "id" });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

async function seedViaRest() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
    );
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { barangRows, hargaRows, pelangganRows, vendorRows } = buildPayload();

  await upsertBatches(supabase, "barang", barangRows);
  await upsertBatches(supabase, "harga_barang_satuan", hargaRows);
  await upsertBatches(supabase, "pelanggan", pelangganRows);
  await upsertBatches(supabase, "vendor", vendorRows);

  return {
    barang: barangRows.length,
    pelanggan: pelangganRows.length,
    vendor: vendorRows.length,
    mode: "rest",
  };
}

async function seedViaPg() {
  const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!connectionString) {
    throw new Error("Missing DATABASE_URL or DIRECT_URL");
  }

  const { barangRows, hargaRows, pelangganRows, vendorRows } = buildPayload();
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    await client.query("BEGIN");
    for (const row of barangRows) {
      await client.query(
        `INSERT INTO barang (id, nama, deskripsi, kategori_id, subkategori_id, satuan_dasar, spesifikasi,
          jumlah_stok, level_stok_minimum, lacak_inventori_status, butuh_dimensi_status, sync_status, sync_version)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (id) DO UPDATE SET nama=EXCLUDED.nama, diperbarui_pada=NOW()`,
        [
          row.id, row.nama, row.deskripsi, row.kategori_id, row.subkategori_id, row.satuan_dasar,
          row.spesifikasi, row.jumlah_stok, row.level_stok_minimum, row.lacak_inventori_status,
          row.butuh_dimensi_status, row.sync_status, row.sync_version,
        ]
      );
    }
    for (const row of hargaRows) {
      await client.query(
        `INSERT INTO harga_barang_satuan (id, barang_id, nama_satuan, faktor_konversi, harga_beli, harga_jual,
          harga_member, default_status, urutan_tampilan, sync_status, sync_version)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (id) DO UPDATE SET harga_jual=EXCLUDED.harga_jual, diperbarui_pada=NOW()`,
        [
          row.id, row.barang_id, row.nama_satuan, row.faktor_konversi, row.harga_beli, row.harga_jual,
          row.harga_member, row.default_status, row.urutan_tampilan, row.sync_status, row.sync_version,
        ]
      );
    }
    for (const row of pelangganRows) {
      await client.query(
        `INSERT INTO pelanggan (id, tipe_pelanggan, nama, nama_perusahaan, npwp, email, telepon, alamat,
          member_status, sync_status, sync_version)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (id) DO UPDATE SET nama=EXCLUDED.nama, diperbarui_pada=NOW()`,
        [
          row.id, row.tipe_pelanggan, row.nama, row.nama_perusahaan, row.npwp, row.email, row.telepon,
          row.alamat, row.member_status, row.sync_status, row.sync_version,
        ]
      );
    }
    for (const row of vendorRows) {
      await client.query(
        `INSERT INTO vendor (id, nama_perusahaan, email, telepon, alamat, kontak_person, ketentuan_bayar,
          aktif_status, catatan, sync_status, sync_version)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (id) DO UPDATE SET nama_perusahaan=EXCLUDED.nama_perusahaan, diperbarui_pada=NOW()`,
        [
          row.id, row.nama_perusahaan, row.email, row.telepon, row.alamat, row.kontak_person,
          row.ketentuan_bayar, row.aktif_status, row.catatan, row.sync_status, row.sync_version,
        ]
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    await client.end();
  }

  return {
    barang: barangRows.length,
    pelanggan: pelangganRows.length,
    vendor: vendorRows.length,
    mode: "postgres",
  };
}

try {
  let result;
  const hasRest =
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (hasRest) {
    result = await seedViaRest();
  } else {
    result = await seedViaPg();
  }

  console.log(`Stress-test seed selesai (${result.mode}):`);
  console.log(`  - ${result.barang} barang (+ harga satuan)`);
  console.log(`  - ${result.pelanggan} pelanggan`);
  console.log(`  - ${result.vendor} vendor`);
  console.log(`\nSemua ID diawali "${PREFIX}-" dan nama diawali "${NAME_TAG}".`);
  console.log(`Hapus dengan: npm run supabase:stress:remove`);
} catch (e) {
  console.error("Gagal seed stress-test:", e.message);
  process.exit(1);
}
