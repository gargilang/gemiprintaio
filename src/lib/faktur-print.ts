/**
 * A4 sales invoice ("Faktur") generator.
 *
 * Mirrors the physical Gemiprint nota: cyan/navy header with logo + contact
 * info, an item table with NO/NAMA BARANG/UKURAN/QTY/HARGA/JUMLAH
 * columns and a faint logo watermark behind it, then a footer with
 * "Hormat Kami" signature, BCA transfer info, and TOTAL/BAYAR/SISA totals.
 *
 * Output is plain HTML; printing uses the same popup-window-with-iframe-fallback
 * pattern as `thermal-print.ts`. The browser handles rasterization, so users
 * can pick "Save as PDF" from the print dialog if they want a file.
 */

import { formatJakartaDate, formatRupiahPlain } from "@/lib/format-id";
import { openPrintDocument } from "@/lib/print-fonts";
import { preparePrintHtml } from "@/lib/print-embed-client";
import { catatanUntukPihakLuar } from "@/lib/dokumen-item-display";

export interface FakturItem {
  /** Item name (line 1 in NAMA BARANG cell). */
  nama: string;
  /** Optional second-line description, e.g. "Banner Flexi 280gsm". */
  keterangan?: string;
  /** Pre-formatted size string, e.g. `2 × 3 m` or empty for non-dimensional. */
  ukuran?: string;
  /** Display quantity (already rounded for display). */
  qty: number;
  /** Unit name shown after qty, e.g. "m²", "lembar". Optional. */
  satuan?: string;
  /** Unit price (Rp). */
  harga: number;
  /** Line total (Rp). */
  jumlah: number;
  /** Biaya tambahan per item — dicetak sebagai sub-baris di bawah item. */
  biaya_tambahan?: Array<{ label: string; nominal: number }>;
  /** Label kustom per baris — mis. "Banner Pecel Lele". Dicetak miring di bawah nama item. */
  catatan_item?: string;
}

export interface FakturData {
  nomor_faktur: string;
  /** ISO date string of the sale. */
  tanggal: string;
  /** Customer "Kepada Yth" name. Empty string if walk-in with no name. */
  pelanggan_nama: string;
  /** Optional customer detail lines shown below the name. */
  pelanggan_detail?: string[];
  /** City line for the "<Kota>, <tanggal>" header. Defaults to "Bekasi". */
  kota?: string;
  items: FakturItem[];
  total: number;
  bayar: number;
  sisa: number;
  /** Optional footer note (e.g. catatan). Currently unused by template but kept for future. */
  catatan?: string;
  /**
   * Header-level extra charges (ongkir, biaya pasang, dll).
   * Rendered as separate rows in the totals block before TOTAL.
   */
  biaya_tambahan?: Array<{ label: string; nominal: number }>;
  /** PPN section. Tampil hanya kalau kena_ppn dan ppn_total > 0. */
  ppn?: {
    /** Komposit NSFP, mis. "010.000-25.00000001". Wajib kalau kena_ppn. */
    nsfp: string;
    /** "010" / "020" / dst — kode transaksi 2 digit. */
    kode_transaksi: string;
    /** DPP (Dasar Pengenaan Pajak) total faktur ini. */
    dpp_total: number;
    /** Tarif PPN, mis. 11 untuk 11%. */
    persen: number;
    /** Nilai PPN. */
    ppn_total: number;
    /** Snapshot NPWP pembeli (sudah di-format ke "01.234.567.8-901.234"). */
    pelanggan_npwp?: string | null;
    /** Snapshot alamat NPWP pembeli untuk faktur pajak. */
    pelanggan_alamat_npwp?: string | null;
    /** Snapshot nama sesuai NPWP. */
    pelanggan_nama_npwp?: string | null;
  };
  /** Override SHOP_INFO untuk multi-tenant masa depan; saat ini fallback ke gemiprint. */
  shop?: {
    nama_toko?: string | null;
    slogan?: string | null;
    alamat?: string | null;
    telepon?: string | null;
    email?: string | null;
    website?: string | null;
    bank_nama?: string | null;
    bank_nomor?: string | null;
    bank_atas_nama?: string | null;
    catatan_faktur?: string | null;
    npwp?: string | null;
    alamat_npwp?: string | null;
  };
}

const SHOP_INFO = {
  nama_toko: "gemiprint",
  slogan: "Digital Printing & Advertising",
  alamat:
    "Cifest Walk, Ruko Pasadena Blok RA No. 18A,<br>Kel. Ciantra, Cikarang Selatan - Bekasi, 17531",
  telepon: "0812 3456 0525",
  email: "cs@gemiprint.com",
  bankNama: "BCA",
  bankNomor: "6881276507",
  bankAtasNama: "Grafika Estetika Media Internusa",
  catatanFaktur: "Barang yang sudah dibawa tidak bisa ditukar/dikembalikan.",
};

const LOGO_SVG_PATHS = `
  <path fill-rule="evenodd" clip-rule="evenodd" d="M11.1519 0.00085052H29.1766C38.4569 0.00085052 42.4009 44.1129 24.9542 44.1006H9.98877C27.0196 43.0487 25.6697 -0.221045 11.1484 0.00085052H11.1519Z" fill="#0a1b3d"/>
  <path fill-rule="evenodd" clip-rule="evenodd" d="M9.08292 1.29121C-0.976261 1.29121 -2.18167 22.7863 3.02062 29.2213C4.54324 31.1074 5.59357 31.054 7.54972 30.1171C9.44595 29.209 11.0496 27.4215 11.395 24.0725C11.885 18.6237 9.79841 16.7993 6.86595 13.5119H14.5707C15.0042 11.1574 15.7197 8.8932 16.6925 6.9701C14.9267 3.54304 12.3714 1.31176 9.07587 1.31176V1.29943L9.08292 1.29121Z" fill="#00AFEF"/>
  <path fill-rule="evenodd" clip-rule="evenodd" d="M7.17259 43.4268C2.76685 43.02 1.19136 40.7312 0.377177 36.396L16.9181 36.2028C14.8139 40.2052 11.3633 43.0118 7.17259 43.4268Z" fill="#00AFEF"/>
  <path fill-rule="evenodd" clip-rule="evenodd" d="M10.4293 14.868C14.5284 18.3608 14.3733 28.8885 9.61513 30.7582C9.31554 30.8773 8.32513 31.0088 8.66349 31.0088L10.4399 31.0129H19.0011C20.2488 27.7831 20.3757 18.8744 19.5756 14.868H10.4293Z" fill="#00AFEF"/>
`;

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderItemRow(item: FakturItem, index: number): string {
  const namaLines = [escapeHtml(item.nama)];
  if (item.keterangan) namaLines.push(escapeHtml(item.keterangan));
  if (item.catatan_item)
    namaLines.push(
      `<em style="font-size:0.85em;color:#6366f1;">${escapeHtml(item.catatan_item)}</em>`,
    );
  const namaCell = namaLines.join("<br>");
  const ukuran = item.ukuran ? escapeHtml(item.ukuran) : "&nbsp;";
  const qtyDisplay = Number.isInteger(item.qty)
    ? String(item.qty)
    : item.qty.toFixed(2).replace(/\.?0+$/, "");
  const qtyCell = item.satuan
    ? `${qtyDisplay} ${escapeHtml(item.satuan)}`
    : qtyDisplay;

  const biayaRows = (item.biaya_tambahan || [])
    .filter((b) => b.label?.trim() && b.nominal > 0)
    .map(
      (b) => `
    <tr class="item-sub">
      <td class="col-no"></td>
      <td class="col-nama">+ ${escapeHtml(b.label.trim())}</td>
      <td class="col-ukuran"></td>
      <td class="col-qty"></td>
      <td class="col-harga"></td>
      <td class="col-jumlah">${formatRupiahPlain(b.nominal)}</td>
    </tr>`,
    )
    .join("");

  return `
    <tr>
      <td class="col-no">${index + 1}</td>
      <td class="col-nama">${namaCell}</td>
      <td class="col-ukuran">${ukuran}</td>
      <td class="col-qty">${qtyCell}</td>
      <td class="col-harga">${formatRupiahPlain(item.harga)}</td>
      <td class="col-jumlah">${formatRupiahPlain(item.jumlah)}</td>
    </tr>${biayaRows}`;
}

export function generateFakturHTML(data: FakturData): string {
  const {
    nomor_faktur,
    tanggal,
    pelanggan_nama,
    pelanggan_detail,
    kota,
    items,
    total,
    bayar,
    sisa,
    ppn,
    shop,
    biaya_tambahan,
    catatan,
  } = data;

  const shopInfo = {
    nama_toko: shop?.nama_toko?.trim() || SHOP_INFO.nama_toko,
    slogan: shop?.slogan?.trim() || SHOP_INFO.slogan,
    alamat: shop?.alamat?.trim()
      ? escapeHtml(shop.alamat).replace(/\n/g, "<br>")
      : SHOP_INFO.alamat,
    telepon: shop?.telepon?.trim() || SHOP_INFO.telepon,
    email: shop?.email?.trim() || SHOP_INFO.email,
    website: shop?.website?.trim() || "",
    bankNama: shop?.bank_nama?.trim() || SHOP_INFO.bankNama,
    bankNomor: shop?.bank_nomor?.trim() || SHOP_INFO.bankNomor,
    bankAtasNama: shop?.bank_atas_nama?.trim() || SHOP_INFO.bankAtasNama,
    catatanFaktur: shop?.catatan_faktur?.trim() || SHOP_INFO.catatanFaktur,
  };

  const kotaDisplay =
    (kota?.trim() || "Bekasi") + ", " + formatJakartaDate(tanggal);
  const itemsHTML = items.map(renderItemRow).join("");
  const pelangganDetailHTML = (pelanggan_detail || [])
    .map((line) => line.trim())
    .filter(Boolean)
    .map(
      (line) => `<div class="info-line"><span>${escapeHtml(line)}</span></div>`,
    )
    .join("");

  // PPN-aware totals: kalau kena_ppn, tampil DPP + PPN row sebelum TOTAL.
  const hasPpn = ppn && ppn.ppn_total > 0;
  // Dinamis: bayar > total → KEMBALIAN (cash lebih). Selain itu → SISA.
  const isOverpay = bayar > total;
  const kembalian = isOverpay ? bayar - total : 0;
  const settlementLabel = isOverpay ? "KEMBALIAN" : "SISA";
  const settlementValue = isOverpay ? kembalian : sisa;
  const biayaTambahanRows = (biaya_tambahan || [])
    .filter((b) => b.label?.trim() && b.nominal > 0)
    .map(
      (b) => `
      <div class="totals-row">
        <div class="totals-label">${escapeHtml(b.label)} Rp.</div>
        <div class="totals-value">${formatRupiahPlain(b.nominal)}</div>
      </div>`,
    )
    .join("");
  const totalsHTML = hasPpn
    ? `
      <div class="totals-row">
        <div class="totals-label">DPP Rp.</div>
        <div class="totals-value">${formatRupiahPlain(ppn!.dpp_total)}</div>
      </div>
      <div class="totals-row">
        <div class="totals-label">PPN ${ppn!.persen}% Rp.</div>
        <div class="totals-value">${formatRupiahPlain(ppn!.ppn_total)}</div>
      </div>${biayaTambahanRows}
      <div class="totals-row totals-grand">
        <div class="totals-label">TOTAL Rp.</div>
        <div class="totals-value">${formatRupiahPlain(total)}</div>
      </div>
      <div class="totals-row">
        <div class="totals-label">BAYAR Rp.</div>
        <div class="totals-value">${formatRupiahPlain(bayar)}</div>
      </div>
      <div class="totals-row">
        <div class="totals-label">${settlementLabel} Rp.</div>
        <div class="totals-value">${formatRupiahPlain(settlementValue)}</div>
      </div>`
    : `${biayaTambahanRows}
      <div class="totals-row">
        <div class="totals-label">TOTAL Rp.</div>
        <div class="totals-value">${formatRupiahPlain(total)}</div>
      </div>
      <div class="totals-row">
        <div class="totals-label">BAYAR Rp.</div>
        <div class="totals-value">${formatRupiahPlain(bayar)}</div>
      </div>
      <div class="totals-row">
        <div class="totals-label">${settlementLabel} Rp.</div>
        <div class="totals-value">${formatRupiahPlain(settlementValue)}</div>
      </div>`;

  // Optional faktur pajak header strip — hanya kalau kena PPN dan punya NSFP.
  const fakturPajakHTML = hasPpn
    ? `
    <div class="ppn-header">
      <div class="ppn-row">
        <span class="ppn-label">FAKTUR PAJAK</span>
        <span class="ppn-nsfp">${escapeHtml(ppn!.nsfp)}</span>
      </div>
      <div class="ppn-grid">
        <div class="ppn-block">
          <div class="ppn-block-title">Pengusaha Kena Pajak</div>
          <div class="ppn-block-line"><b>${escapeHtml(shopInfo.nama_toko)}</b></div>
          ${shop?.alamat_npwp ? `<div class="ppn-block-line">${escapeHtml(shop.alamat_npwp)}</div>` : ""}
          ${shop?.npwp ? `<div class="ppn-block-line">NPWP: <b>${escapeHtml(shop.npwp)}</b></div>` : ""}
        </div>
        <div class="ppn-block">
          <div class="ppn-block-title">Pembeli Barang Kena Pajak</div>
          <div class="ppn-block-line"><b>${escapeHtml(
            ppn!.pelanggan_nama_npwp || pelanggan_nama || "—",
          )}</b></div>
          ${
            ppn!.pelanggan_alamat_npwp
              ? `<div class="ppn-block-line">${escapeHtml(ppn!.pelanggan_alamat_npwp)}</div>`
              : ""
          }
          ${
            ppn!.pelanggan_npwp
              ? `<div class="ppn-block-line">NPWP: <b>${escapeHtml(ppn!.pelanggan_npwp)}</b></div>`
              : ""
          }
        </div>
      </div>
    </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Faktur - ${escapeHtml(nomor_faktur)}</title>
  <style>
    @font-face {
      font-family: 'Bauhaus 93';
      src: url('/assets/fonts/BAUHS93.ttf') format('truetype');
      font-weight: normal;
      font-style: normal;
    }
    @font-face {
      font-family: 'TW Cen MT';
      src: url('/assets/fonts/Tw Cen MT.ttf') format('truetype');
      font-weight: normal;
      font-style: normal;
    }
    @font-face {
      font-family: 'TW Cen MT';
      src: url('/assets/fonts/TwCenMTStdBold.otf') format('opentype');
      font-weight: bold;
      font-style: normal;
    }

    @page {
      size: A4 landscape;
      margin: 8mm;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    html, body {
      font-family: 'TW Cen MT', 'Arial', sans-serif;
      color: #0a1b3d;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      background: #fff;
    }
    body {
      width: 278mm;
      margin: 0 auto;
      font-size: 10pt;
      line-height: 1.25;
    }
    body::before {
      content: "";
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 135mm;
      height: 135mm;
      opacity: 0.055;
      pointer-events: none;
      z-index: 0;
      background: url("data:image/svg+xml,%3Csvg viewBox='0 0 38 45' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M11.1519 0.00085052H29.1766C38.4569 0.00085052 42.4009 44.1129 24.9542 44.1006H9.98877C27.0196 43.0487 25.6697 -0.221045 11.1484 0.00085052H11.1519Z' fill='%230a1b3d'/%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M9.08292 1.29121C-0.976261 1.29121 -2.18167 22.7863 3.02062 29.2213C4.54324 31.1074 5.59357 31.054 7.54972 30.1171C9.44595 29.209 11.0496 27.4215 11.395 24.0725C11.885 18.6237 9.79841 16.7993 6.86595 13.5119H14.5707C15.0042 11.1574 15.7197 8.8932 16.6925 6.9701C14.9267 3.54304 12.3714 1.31176 9.07587 1.31176V1.29943L9.08292 1.29121Z' fill='%2300AFEF'/%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M7.17259 43.4268C2.76685 43.02 1.19136 40.7312 0.377177 36.396L16.9181 36.2028C14.8139 40.2052 11.3633 43.0118 7.17259 43.4268Z' fill='%2300AFEF'/%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M10.4293 14.868C14.5284 18.3608 14.3733 28.8885 9.61513 30.7582C9.31554 30.8773 8.32513 31.0088 8.66349 31.0088L10.4399 31.0129H19.0011C20.2488 27.7831 20.3757 18.8744 19.5756 14.868H10.4293Z' fill='%2300AFEF'/%3E%3C/svg%3E") center / contain no-repeat;
    }

    /* ============ HEADER ============ */
    .header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 255px;
      gap: 18px;
      align-items: start;
      margin-bottom: 6px;
      border-bottom: 2px solid #0a1b3d;
      padding-bottom: 6px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 14px;
      min-width: 0;
    }
    .brand-identity {
      display: flex;
      flex: 0 0 auto;
      flex-direction: column;
      align-items: center;
    }
    .brand-logo {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
    }
    .brand-logo svg {
      width: 44px;
      height: 52px;
      flex-shrink: 0;
    }
    .brand-wordmark {
      font-family: 'Bauhaus 93', serif;
      font-size: 29pt;
      font-style: italic;
      line-height: 1;
      letter-spacing: -1px;
    }
    .brand-wordmark .gemi { color: #00AFEF; }
    .brand-wordmark .print { color: #0a1b3d; }
    .brand-sub { font-size: 9.2pt; color: #555; margin-top: 4px; }
    .brand-address {
      border-left: 1px solid #c8dce8;
      padding-left: 12px;
      color: #0a1b3d;
      font-size: 9.6pt;
      line-height: 1.42;
      max-width: 118mm;
      min-width: 0;
      align-self: center;
    }
    .brand-address span {
      display: block;
      color: #555;
    }

    .doc-title { text-align: right; }
    .doc-title h1 {
      font-size: 16pt;
      font-weight: bold;
      color: #0a1b3d;
      letter-spacing: 0.5px;
      white-space: nowrap;
    }
    .doc-meta {
      font-size: 9pt;
      margin-top: 4px;
      line-height: 1.55;
    }
    .doc-meta .meta-row {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      white-space: nowrap;
    }
    .doc-meta .meta-label { color: #555; flex: 0 0 auto; }
    .doc-meta .meta-value { font-weight: bold; min-width: 140px; text-align: right; }

    /* ============ INFO GRID ============ */
    .info-grid {
      display: grid;
      grid-template-columns: 1fr;
      margin-bottom: 8px;
      font-size: 9.5pt;
    }
    .info-box {
      border: 1px solid #c8dce8;
      border-radius: 4px;
      padding: 6px 10px;
      background: #f0f8ff;
      width: 50%;
    }
    .info-box .info-title {
      font-weight: bold;
      font-size: 8.5pt;
      color: #00AFEF;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      margin-bottom: 3px;
      border-bottom: 1px solid #c8dce8;
      padding-bottom: 2px;
    }
    .info-box .info-line { line-height: 1.5; }
    .info-box .info-line span { color: #555; font-size: 9pt; }
    .info-box .bank-number {
      color: #0a1b3d;
      font-weight: bold;
      font-size: 11pt;
      letter-spacing: 0.5px;
    }

    /* ============ ITEMS TABLE ============ */
    .table-wrapper {
      position: relative;
      margin-top: 6px;
      z-index: 1;
    }
    .watermark {
      display: none;
    }
    .watermark svg {
      width: 100%;
      height: 100%;
    }

    table.items {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      position: relative;
      z-index: 1;
      background: transparent;
      font-size: 9.5pt;
    }
    table.items thead th {
      background: #cfeafa;
      color: #0a1b3d;
      border: 1px solid #0a1b3d;
      padding: 5px 4px;
      font-weight: bold;
      font-size: 9.5pt;
      letter-spacing: 0.3px;
    }
    table.items tbody td {
      border: 1px solid #0a1b3d;
      padding: 3px 5px;
      vertical-align: middle;
      height: 22px;
    }
    .col-no      { width: 6%;  text-align: center; }
    .col-nama    { width: 32%; text-align: left; }
    .col-ukuran  { width: 12%; text-align: center; }
    .col-qty     { width: 8%;  text-align: center; }
    .col-harga   { width: 16%; text-align: right; }
    .col-jumlah  { width: 26%; text-align: right; }
    /* Sub-baris biaya tambahan per item */
    table.items tbody tr.item-sub td {
      border-top: none;
      font-size: 8.5pt;
      color: #555;
      font-style: italic;
      background: #f8fbff;
    }

    /* ============ FOOTER ============ */
    .footer {
      display: grid;
      grid-template-columns: 220px 1fr 260px;
      gap: 12px;
      margin-top: 10px;
      align-items: end;
      break-inside: avoid;
      page-break-inside: avoid;
      position: relative;
      z-index: 1;
    }
    .payment-section {
      justify-self: center;
      font-size: 9pt;
    }
    .payment-box {
      border: 1px solid #c8dce8;
      border-radius: 4px;
      padding: 6px 10px;
      background: #f0f8ff;
      min-width: 78mm;
      line-height: 1.45;
    }
    .payment-box .bank-number {
      color: #0a1b3d;
      font-weight: bold;
      font-size: 11pt;
      letter-spacing: 0.5px;
    }
    .payment-box span {
      color: #555;
    }
    .payment-section .legal-note {
      font-size: 8.5pt;
      color: #0a1b3d;
      font-style: italic;
      margin-top: 6px;
    }
    .payment-section .legal-note .bullet { color: #00AFEF; font-style: normal; margin-right: 4px; }
    .signature {
      font-size: 9.5pt;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      align-items: flex-start;
      gap: 26px;
      margin-top: 10px;
    }
    .signature-name {
      display: flex;
      justify-content: space-between;
      border-top: 1px solid #0a1b3d;
      padding-top: 4px;
      width: 220px;
    }

    .totals-box {
      border: 1.5px solid #0a1b3d;
      font-size: 10pt;
    }
    .totals-row {
      display: grid;
      grid-template-columns: 110px 1fr;
      align-items: center;
      border-bottom: 1px solid #0a1b3d;
    }
    .totals-row:last-child { border-bottom: none; }
    .totals-row.totals-grand .totals-label,
    .totals-row.totals-grand .totals-value {
      background: #cfeafa;
    }
    .totals-label {
      background: transparent;
      padding: 4px 8px;
      font-weight: bold;
      border-right: 1px solid #0a1b3d;
    }
    .totals-value {
      padding: 4px 10px;
      text-align: right;
      font-weight: bold;
      min-height: 1.6em;
    }

    /* ============ FAKTUR PAJAK STRIP ============ */
    .ppn-header {
      border: 1.2px solid #0a1b3d;
      margin-top: 6px;
      padding: 6px 8px;
      font-size: 9pt;
      background: #fff;
    }
    .ppn-header .ppn-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #0a1b3d;
      padding-bottom: 4px;
      margin-bottom: 4px;
    }
    .ppn-header .ppn-label {
      font-weight: bold;
      letter-spacing: 0.5px;
    }
    .ppn-header .ppn-nsfp {
      font-family: 'Courier New', monospace;
      font-weight: bold;
    }
    .ppn-header .ppn-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .ppn-header .ppn-block-title {
      font-style: italic;
      color: #0a1b3d;
      margin-bottom: 2px;
    }
    .ppn-header .ppn-block-line {
      line-height: 1.35;
    }

    .legal-note {
      margin-top: 6px;
      text-align: center;
      font-size: 8.5pt;
      font-style: italic;
      color: #0a1b3d;
    }
    .legal-note .bullet {
      color: #00AFEF;
      font-style: normal;
      margin-right: 4px;
    }

    /* ============ TOOLBAR (screen only) ============ */
    .toolbar {
      position: fixed;
      top: 12px;
      right: 12px;
      display: flex;
      gap: 8px;
      z-index: 100;
    }
    .toolbar button {
      font-family: inherit;
      font-size: 10pt;
      padding: 8px 14px;
      border-radius: 6px;
      border: none;
      cursor: pointer;
      box-shadow: 0 2px 6px rgba(0,0,0,0.15);
    }
    .toolbar .btn-print {
      background: #00AFEF;
      color: #fff;
      font-weight: bold;
    }
    .toolbar .btn-close {
      background: #e5e7eb;
      color: #0a1b3d;
    }

    @media print {
      .toolbar { display: none !important; }
      body { width: 278mm; }
    }
  </style>
</head>
<body>
  <div class="toolbar no-print">
    <button class="btn-print" onclick="window.print()">Cetak / Save PDF</button>
    <button class="btn-close" onclick="window.close()">Tutup</button>
  </div>

  <!-- HEADER -->
  <div class="header">
    <div class="brand">
      <div class="brand-identity">
        <div class="brand-logo">
          <svg viewBox="0 0 38 45" xmlns="http://www.w3.org/2000/svg">${LOGO_SVG_PATHS}</svg>
          <div class="brand-wordmark">
            <span class="gemi">gemi</span><span class="print">print</span>
          </div>
        </div>
        <div class="brand-sub">${escapeHtml(shopInfo.slogan)}</div>
      </div>
      <div class="brand-address">
        <span>${shopInfo.alamat}</span>
        <span>Telp: ${escapeHtml(shopInfo.telepon)}${shopInfo.email ? ` &middot; ${escapeHtml(shopInfo.email)}` : ""}${shopInfo.website ? ` &middot; ${escapeHtml(shopInfo.website)}` : ""}</span>
      </div>
    </div>
    <div class="doc-title">
      <h1>FAKTUR PENJUALAN</h1>
      <div class="doc-meta">
        <div class="meta-row">
          <span class="meta-label">No. Faktur :</span>
          <span class="meta-value">${escapeHtml(nomor_faktur)}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Tanggal :</span>
          <span class="meta-value">${escapeHtml(kotaDisplay)}</span>
        </div>
      </div>
    </div>
  </div>

  <!-- INFO GRID -->
  <div class="info-grid">
    <div class="info-box">
      <div class="info-title">Kepada Yth.</div>
      <div class="info-line"><strong>${escapeHtml(pelanggan_nama || "—")}</strong></div>
      ${pelangganDetailHTML}
    </div>
  </div>

  <!-- ITEMS TABLE WITH WATERMARK -->
  <div class="table-wrapper">
    <div class="watermark" aria-hidden="true">
      <svg viewBox="0 0 38 45" xmlns="http://www.w3.org/2000/svg">${LOGO_SVG_PATHS}</svg>
    </div>
    <table class="items">
      <thead>
        <tr>
          <th class="col-no">NO.</th>
          <th class="col-nama">NAMA BARANG</th>
          <th class="col-ukuran">UKURAN</th>
          <th class="col-qty">QTY</th>
          <th class="col-harga">HARGA</th>
          <th class="col-jumlah">JUMLAH</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHTML}
      </tbody>
    </table>
  </div>

  ${
    catatan
      ? `<div style="margin:6px 0 4px;padding:6px 8px;background:#f8fafc;border-left:3px solid #00afef;font-size:0.82em;color:#334155;">
    <strong>Catatan:</strong> ${escapeHtml(catatan)}
  </div>`
      : ""
  }

  <!-- FOOTER -->
  <div class="footer">
    <div class="signature">
      <div>Hormat Kami,</div>
      <div class="signature-name"><span>(</span><span>)</span></div>
    </div>
    <div class="payment-section">
      <div class="payment-box">
        <div><strong><span style="color:#00AFEF">gemi</span><span style="color:#0a1b3d">print</span></strong></div>
        <div class="bank-number">${escapeHtml(shopInfo.bankNama)} ${escapeHtml(shopInfo.bankNomor)}</div>
        <div><span>a.n. ${escapeHtml(shopInfo.bankAtasNama)}</span></div>
      </div>
      <div class="legal-note">
        <span class="bullet">&#9679;</span>
        ${escapeHtml(shopInfo.catatanFaktur)}
      </div>
    </div>
    <div class="totals-box">
      ${totalsHTML}
    </div>
  </div>

  ${fakturPajakHTML}
</body>
</html>
  `;
}

/** Returns true if a print preview window or iframe was opened. */
export async function printFaktur(data: FakturData): Promise<boolean> {
  const html = await preparePrintHtml(generateFakturHTML(data));
  return openPrintDocument(html, "Cetak faktur");
}

/**
 * Generate a "Penawaran Harga" (quotation) HTML document from cart items.
 *
 * Reuses the same A4 landscape layout as the sales faktur but:
 * - Title changed to "PENAWARAN HARGA"
 * - No invoice number (replaced with "—")
 * - No BAYAR / SISA rows — only TOTAL
 * - "Kepada Yth." section shows pelanggan_nama if provided, else "—"
 * - Footer note replaced with quotation validity note
 * - No PPN strip
 */
export function generateQuotationHTML(data: {
  pelanggan_nama?: string;
  kota?: string;
  tanggal: string;
  items: FakturItem[];
  total: number;
  catatan?: string;
  shop?: FakturData["shop"];
}): string {
  return generateFakturHTML({
    nomor_faktur: "—",
    tanggal: data.tanggal,
    pelanggan_nama: data.pelanggan_nama || "—",
    kota: data.kota,
    items: data.items,
    total: data.total,
    bayar: 0,
    sisa: 0,
    catatan: data.catatan,
    shop: {
      ...data.shop,
      // Override catatan_faktur with quotation note
      catatan_faktur:
        "Penawaran ini berlaku 7 hari sejak tanggal tertera. Harga dapat berubah sewaktu-waktu.",
    },
    // Pass a flag via a custom field — we patch the HTML after generation
    _isQuotation: true,
  } as any);
}

/**
 * Post-process faktur HTML untuk pratinjau penawaran atau faktur:
 * - Ganti judul dokumen (bawaan: "Penawaran Harga" → header PENAWARAN HARGA)
 * - Hapus baris BAYAR dan SISA
 * - Ganti tag title
 */
export function patchQuotationHTML(
  html: string,
  options?: { judul?: string },
): string {
  const judul = options?.judul ?? "Penawaran Harga";
  const headerJudul =
    judul === "Penawaran Harga" ? "PENAWARAN HARGA" : judul.toUpperCase();
  return (
    html
      .replace(/FAKTUR PENJUALAN/g, headerJudul)
      .replace(/<title>Faktur[^<]*<\/title>/, `<title>${judul}</title>`)
      // Remove BAYAR row
      .replace(
        /<div class="totals-row">\s*<div class="totals-label">BAYAR Rp\.<\/div>[\s\S]*?<\/div>\s*<\/div>/,
        "",
      )
      // Remove SISA row
      .replace(
        /<div class="totals-row">\s*<div class="totals-label">SISA Rp\.<\/div>[\s\S]*?<\/div>\s*<\/div>/,
        "",
      )
  );
}

/** Hilangkan baris BAYAR/SISA dari layout faktur (PO, penawaran, dll.). */
export function stripBayarSisaRows(html: string): string {
  return html
    .replace(
      /<div class="totals-row">\s*<div class="totals-label">BAYAR Rp\.<\/div>[\s\S]*?<\/div>\s*<\/div>/,
      "",
    )
    .replace(
      /<div class="totals-row">\s*<div class="totals-label">SISA Rp\.<\/div>[\s\S]*?<\/div>\s*<\/div>/,
      "",
    );
}

/** Ubah layout faktur penjualan menjadi Pesanan Pembelian untuk vendor. */
export function patchPurchaseOrderHTML(html: string): string {
  return (
    stripBayarSisaRows(html)
      .replace(/FAKTUR PENJUALAN/g, "PESANAN PEMBELIAN")
      .replace(
        /<title>Faktur[^<]*<\/title>/,
        "<title>Pesanan Pembelian</title>",
      )
      .replace(/Kepada Yth\./g, "Vendor")
      .replace(/No\. Faktur\s*:/g, "No. PO :")
      // Vendor tidak perlu rekening toko atau catatan legal faktur penjualan
      .replace(
        /<div class="payment-section">[\s\S]*?<\/div>\s*(?=<div class="totals-box">)/,
        "",
      )
      .replace(
        /<div class="footer">/,
        '<div class="footer" style="grid-template-columns:220px 1fr;justify-items:end;">',
      )
  );
}

export type PurchaseOrderPrintData = {
  nomor_po: string;
  tanggal: string;
  vendor_nama: string;
  expected_date?: string | null;
  items: FakturItem[];
  total: number;
  catatan?: string | null;
  shop?: FakturData["shop"];
};

/** HTML cetak Pesanan Pembelian — layout sama dengan faktur penjualan Gemiprint. */
export function generatePurchaseOrderHTML(
  data: PurchaseOrderPrintData,
): string {
  const vendorDetail: string[] = [];
  if (data.expected_date) {
    vendorDetail.push(
      `Estimasi tiba: ${formatJakartaDate(data.expected_date)}`,
    );
  }
  const catatanVendor = catatanUntukPihakLuar(data.catatan);

  const html = generateFakturHTML({
    nomor_faktur: data.nomor_po,
    tanggal: data.tanggal,
    pelanggan_nama: data.vendor_nama || "—",
    pelanggan_detail: vendorDetail.length ? vendorDetail : undefined,
    items: data.items,
    total: data.total,
    bayar: 0,
    sisa: 0,
    catatan: catatanVendor || undefined,
    shop: data.shop,
  });

  return patchPurchaseOrderHTML(html);
}

/** Buka dialog cetak Pesanan Pembelian (popup + font embedded). */
export async function printPurchaseOrder(
  data: PurchaseOrderPrintData,
): Promise<boolean> {
  const html = await preparePrintHtml(generatePurchaseOrderHTML(data));
  return openPrintDocument(html, "Cetak Pesanan Pembelian");
}

/**
 * Helper: derive a `FakturItem.ukuran` string from raw panjang × lebar values.
 * Returns empty string when either value is missing or non-positive.
 */
export function formatUkuran(
  panjang: number | null | undefined,
  lebar: number | null | undefined,
): string {
  const p = typeof panjang === "number" && panjang > 0 ? panjang : 0;
  const l = typeof lebar === "number" && lebar > 0 ? lebar : 0;
  if (!p || !l) return "";
  const fmt = (n: number) =>
    Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
  return `${fmt(p)} × ${fmt(l)} m`;
}
