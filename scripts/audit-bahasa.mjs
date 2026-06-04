#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname } from "node:path";

const args = new Set(process.argv.slice(2));
const gagalJikaAdaTemuan = args.has("--fail-on-findings");
const batasTampil = Number(process.env.AUDIT_BAHASA_LIMIT || 40);

const cakupanAplikasi = [
  /^src\//,
  /^flutter\/lib\//,
  /^scripts\//,
  /^docs\//,
  /^database\//,
  /^supabase\//,
  /^src-tauri\/src\//,
  /^\.cursorrules$/,
  /^README\.md$/,
  /^package\.json$/,
];

const abaikan = [
  /^package-lock\.json$/,
  /^node_modules\//,
  /^\.next\//,
  /^src-tauri\/target\//,
  /^tauri-bundle\//,
  /^\.agents\/skills\//,
  /\.(png|jpg|jpeg|gif|ico|db|ttf|otf|woff|woff2|lock)$/i,
];

const ekstensiTeks = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".dart",
  ".rs",
  ".sql",
  ".md",
  ".json",
  ".toml",
  ".yml",
  ".yaml",
  ".css",
]);

const istilahInggris = [
  "dashboard",
  "customer",
  "customers",
  "material",
  "materials",
  "purchase",
  "purchases",
  "sale",
  "sales",
  "return",
  "returns",
  "receivable",
  "receivables",
  "debt",
  "debts",
  "finance",
  "inventory",
  "report",
  "reports",
  "settings",
  "user",
  "users",
  "stock",
  "movement",
  "ledger",
  "cashbook",
  "category",
  "categories",
  "unit",
  "units",
  "order",
  "orders",
  "production",
];

const istilahIndonesia = [
  "beranda",
  "pelanggan",
  "barang",
  "pembelian",
  "penjualan",
  "retur",
  "piutang",
  "hutang",
  "keuangan",
  "inventori",
  "laporan",
  "pengaturan",
  "pengguna",
  "stok",
  "mutasi",
  "buku",
  "kas",
  "kategori",
  "satuan",
  "pesanan",
  "produksi",
  "penawaran",
  "surat",
  "jalan",
  "nomor",
  "urut",
  "faktur",
  "pajak",
  "maklon",
];

const istilahUiInggris = [
  "Dashboard",
  "Customer",
  "Customers",
  "Material",
  "Materials",
  "Purchase",
  "Purchases",
  "Purchase Order",
  "Sales Return",
  "Purchase Return",
  "Receivable",
  "Receivables",
  "Debt",
  "Debts",
  "Loading",
  "Search",
  "Filter",
  "Settings",
  "Inventory",
  "Production",
  "Reports",
  "Finance",
  "No data",
  "Walk-in Customer",
  "Save",
  "Cancel",
  "Submit",
  "Delete",
  "Update",
];

function daftarFileGit() {
  return execFileSync("git", ["ls-files"], { encoding: "utf8" })
    .split(/\r?\n/)
    .filter(Boolean)
    .map((nama) => nama.replaceAll("\\", "/"));
}

function dalamCakupan(file) {
  return cakupanAplikasi.some((pola) => pola.test(file));
}

function bolehDiabaikan(file) {
  return abaikan.some((pola) => pola.test(file));
}

function fileTeks(file) {
  if (file === ".cursorrules" || file === "README.md" || file === "package.json") {
    return true;
  }
  return ekstensiTeks.has(extname(file).toLowerCase());
}

function fileKode(file) {
  return /^(src|flutter\/lib|scripts|src-tauri\/src)\//.test(file);
}

function fileSql(file) {
  return /^(database|supabase)\//.test(file) && file.endsWith(".sql");
}

function fileUi(file) {
  return /^(src|flutter\/lib)\//.test(file) && /\.(ts|tsx|dart)$/.test(file);
}

function punyaIstilah(teks, daftar) {
  const normal = teks.toLowerCase();
  return daftar.some((kata) => normal.includes(kata));
}

function potong(baris) {
  return baris.trim().replace(/\s+/g, " ").slice(0, 180);
}

function tambah(temuan, jenis, file, baris, isi) {
  temuan[jenis].push({ file, baris, isi: potong(isi) });
}

function mungkinStringUi(file, baris) {
  const stringLiteral = /["'`][^"'`]*(Dashboard|Customer|Material|Purchase|Receivable|Debt|Loading|Search|Filter|Settings|Inventory|Production|Reports|Finance|No data|Walk-in Customer|Save|Cancel|Submit|Delete|Update)[^"'`]*["'`]/.test(baris);
  if (stringLiteral) return true;

  return file.endsWith(".tsx")
    && />[^<]*(Dashboard|Customer|Material|Purchase|Receivable|Debt|Loading|Search|Filter|Settings|Inventory|Production|Reports|Finance|No data|Walk-in Customer|Save|Cancel|Submit|Delete|Update)[^<]*</.test(baris)
    || /title=["'][^"']*(Edit|Delete|Save|Cancel|Update)[^"']*["']/.test(baris)
    || /placeholder=["'][^"']*(Search|Filter)[^"']*["']/.test(baris);
}

function mungkinKomentarInggris(file, baris) {
  if (!fileKode(file) && !fileSql(file)) return false;
  if (!/^\s*(\/\/|\/\*|\*|#|<!--)/.test(baris)) return false;
  return /\b(the|this|that|with|without|returns|should|must|never|always|when|before|after|existing|create|update|delete|sync|table|user|customer|material|purchase|sale|inventory|finance)\b/i.test(baris);
}

function audit() {
  const temuan = {
    jalurCampur: [],
    namaCampur: [],
    uiInggris: [],
    komentarInggris: [],
  };

  const files = daftarFileGit().filter(
    (file) => dalamCakupan(file) && !bolehDiabaikan(file) && fileTeks(file)
  );

  for (const file of files) {
    if (punyaIstilah(file, istilahInggris) && punyaIstilah(file, istilahIndonesia)) {
      tambah(temuan, "jalurCampur", file, 0, file);
    }

    let isi;
    try {
      isi = readFileSync(file, "utf8");
    } catch {
      continue;
    }

    const baris = isi.split(/\r?\n/);
    baris.forEach((teks, indeks) => {
      const nomor = indeks + 1;

      if ((fileKode(file) || fileSql(file))
        && (/(Purchase|Sales|Customer|Material|Finance|Inventory|Report|Settings|Dashboard|User|Stock|Movement|Debt|Receivable|Return)[A-Za-z0-9_]*(Kategori|Pelanggan|Barang|Pembelian|Penjualan|Hutang|Piutang|Keuangan|Laporan|Pengaturan|Pengguna|Stok|Retur|Surat|Jalan)/.test(teks)
        || /(Kategori|Pelanggan|Barang|Pembelian|Penjualan|Hutang|Piutang|Keuangan|Laporan|Pengaturan|Pengguna|Stok|Retur|Surat|Jalan)[A-Za-z0-9_]*(Purchase|Sales|Customer|Material|Finance|Inventory|Report|Settings|Dashboard|User|Stock|Movement|Debt|Receivable|Return)/.test(teks))) {
        tambah(temuan, "namaCampur", file, nomor, teks);
      }

      if (fileUi(file) && mungkinStringUi(file, teks) && istilahUiInggris.some((kata) => teks.includes(kata))) {
        tambah(temuan, "uiInggris", file, nomor, teks);
      }

      if (mungkinKomentarInggris(file, teks)) {
        tambah(temuan, "komentarInggris", file, nomor, teks);
      }
    });
  }

  return temuan;
}

function cetakBagian(judul, daftar) {
  console.log(`\n${judul}: ${daftar.length}`);
  for (const item of daftar.slice(0, batasTampil)) {
    const lokasi = item.baris ? `${item.file}:${item.baris}` : item.file;
    console.log(`- ${lokasi} ${item.isi ? `=> ${item.isi}` : ""}`);
  }
  if (daftar.length > batasTampil) {
    console.log(`  ... ${daftar.length - batasTampil} temuan lain disembunyikan. Set AUDIT_BAHASA_LIMIT untuk mengubah batas.`);
  }
}

const temuan = audit();
const total = Object.values(temuan).reduce((jumlah, daftar) => jumlah + daftar.length, 0);

console.log("Audit bahasa Gemiprint");
console.log("=======================");
console.log("Mode: read-only. Command ini tidak mengubah file.");

cetakBagian("Jalur file campur Indonesia/English", temuan.jalurCampur);
cetakBagian("Nama identifier campur", temuan.namaCampur);
cetakBagian("Kandidat UI English", temuan.uiInggris);
cetakBagian("Kandidat komentar English", temuan.komentarInggris);

console.log(`\nTotal kandidat temuan: ${total}`);
console.log("Gunakan hasil ini sebagai daftar kandidat manual; script ini sengaja konservatif dan bisa false-positive.");

if (gagalJikaAdaTemuan && total > 0) {
  process.exitCode = 1;
}
