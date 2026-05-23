/**
 * A5-landscape sales invoice ("Faktur") generator.
 *
 * Mirrors the physical Gemiprint nota: cyan/navy header with logo + contact
 * info, a fixed-height table with NO/NAMA BARANG/UKURAN/QTY/HARGA/JUMLAH
 * columns and a faint logo watermark behind it, then a footer with
 * "Hormat Kami" signature, BCA transfer info, and TOTAL/BAYAR/SISA totals.
 *
 * Output is plain HTML; printing uses the same popup-window-with-iframe-fallback
 * pattern as `thermal-print.ts`. The browser handles rasterization, so users
 * can pick "Save as PDF" from the print dialog if they want a file.
 */

import {
  formatJakartaDate,
  formatRupiahPlain,
} from "@/lib/format-id";

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
}

export interface FakturData {
  nomor_invoice: string;
  /** ISO date string of the sale. */
  tanggal: string;
  /** Customer "Kepada Yth" name. Empty string if walk-in with no name. */
  pelanggan_nama: string;
  /** City line for the "<Kota>, <tanggal>" header. Defaults to "Bekasi". */
  kota?: string;
  items: FakturItem[];
  total: number;
  bayar: number;
  sisa: number;
  /** Optional footer note (e.g. catatan). Currently unused by template but kept for future. */
  catatan?: string;
}

/** Number of body rows always rendered, padded with empty rows if needed. */
const FIXED_ROW_COUNT = 11;

const SHOP_INFO = {
  alamat:
    "Cifest Walk, Ruko Pasadena Blok RA No. 18A,<br>Kel. Ciantra, Cikarang Selatan - Bekasi, 17531",
  telepon: "0812 3456 0525",
  email: "cs@gemiprint.com",
  bankNomor: "BCA 6881276507",
  bankAtasNama: "Grafika Estetika Media Internusa",
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
  const namaCell = namaLines.join("<br>");
  const ukuran = item.ukuran ? escapeHtml(item.ukuran) : "&nbsp;";
  const qtyDisplay = Number.isInteger(item.qty)
    ? String(item.qty)
    : item.qty.toFixed(2).replace(/\.?0+$/, "");
  const qtyCell = item.satuan
    ? `${qtyDisplay} ${escapeHtml(item.satuan)}`
    : qtyDisplay;

  return `
    <tr>
      <td class="col-no">${index + 1}</td>
      <td class="col-nama">${namaCell}</td>
      <td class="col-ukuran">${ukuran}</td>
      <td class="col-qty">${qtyCell}</td>
      <td class="col-harga">${formatRupiahPlain(item.harga)}</td>
      <td class="col-jumlah">${formatRupiahPlain(item.jumlah)}</td>
    </tr>`;
}

function renderEmptyRow(displayIndex: number | null): string {
  return `
    <tr class="empty-row">
      <td class="col-no">${displayIndex ?? "&nbsp;"}</td>
      <td class="col-nama">&nbsp;</td>
      <td class="col-ukuran">&nbsp;</td>
      <td class="col-qty">&nbsp;</td>
      <td class="col-harga">&nbsp;</td>
      <td class="col-jumlah">&nbsp;</td>
    </tr>`;
}

export function generateFakturHTML(data: FakturData): string {
  const {
    nomor_invoice,
    tanggal,
    pelanggan_nama,
    kota,
    items,
    total,
    bayar,
    sisa,
  } = data;

  const kotaDisplay = (kota?.trim() || "Bekasi") + ", " + formatJakartaDate(tanggal);
  const itemsHTML = items.map(renderItemRow).join("");
  const padCount = Math.max(0, FIXED_ROW_COUNT - items.length);
  const emptyRowsHTML = Array.from({ length: padCount }, (_, i) =>
    renderEmptyRow(items.length + i + 1)
  ).join("");

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Faktur - ${escapeHtml(nomor_invoice)}</title>
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
      size: A5 landscape;
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
      width: 194mm;
      margin: 0 auto;
      font-size: 10pt;
      line-height: 1.25;
    }

    /* ============ HEADER ============ */
    .header {
      display: grid;
      grid-template-columns: 130px 1fr 230px;
      gap: 12px;
      align-items: start;
      margin-bottom: 6px;
    }
    .brand {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
    }
    .brand-logo {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .brand-logo svg {
      width: 38px;
      height: 45px;
      flex-shrink: 0;
    }
    .brand-wordmark {
      font-family: 'Bauhaus 93', serif;
      font-size: 28pt;
      font-style: italic;
      line-height: 1;
      letter-spacing: -1px;
    }
    .brand-wordmark .gemi { color: #00AFEF; }
    .brand-wordmark .print { color: #0a1b3d; }

    .contacts {
      font-size: 9pt;
      line-height: 1.45;
      color: #0a1b3d;
      padding-top: 4px;
    }
    .contact-row {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      margin-bottom: 2px;
    }
    .contact-icon {
      color: #00AFEF;
      flex-shrink: 0;
      width: 14px;
      text-align: center;
      font-weight: bold;
    }

    .header-right {
      font-size: 10pt;
      line-height: 1.6;
      padding-top: 4px;
    }
    .header-right .field-line {
      display: flex;
      align-items: baseline;
      gap: 6px;
      margin-bottom: 4px;
    }
    .header-right .field-label {
      font-weight: bold;
      flex-shrink: 0;
    }
    .header-right .field-value {
      flex: 1;
      border-bottom: 1px solid #0a1b3d;
      min-height: 1.1em;
      padding-bottom: 1px;
    }

    .invoice-no-row {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
    }
    .invoice-no-label {
      color: #00AFEF;
      font-weight: bold;
      font-size: 11pt;
      letter-spacing: 0.3px;
    }
    .invoice-no-box {
      border: 1px solid #0a1b3d;
      padding: 3px 10px;
      min-width: 110px;
      text-align: center;
      font-weight: bold;
    }

    /* ============ ITEMS TABLE ============ */
    .table-wrapper {
      position: relative;
      margin-top: 6px;
    }
    .watermark {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 130mm;
      height: 130mm;
      opacity: 0.06;
      pointer-events: none;
      z-index: 0;
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
    table.items tr.empty-row td {
      color: #0a1b3d;
    }
    .col-no      { width: 6%;  text-align: center; }
    .col-nama    { width: 32%; text-align: left; }
    .col-ukuran  { width: 12%; text-align: center; }
    .col-qty     { width: 8%;  text-align: center; }
    .col-harga   { width: 16%; text-align: right; }
    .col-jumlah  { width: 26%; text-align: right; }

    /* ============ FOOTER ============ */
    .footer {
      display: grid;
      grid-template-columns: 1fr 1.2fr 1fr;
      gap: 10px;
      margin-top: 10px;
      align-items: stretch;
    }
    .signature {
      font-size: 9.5pt;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-height: 60px;
    }
    .signature-name {
      margin-top: 28px;
    }

    .bank-box {
      background: #cfeafa;
      border: 1.5px solid #0a1b3d;
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 9pt;
      text-align: center;
      align-self: center;
      line-height: 1.35;
    }
    .bank-box .bank-title {
      font-weight: normal;
      margin-bottom: 2px;
    }
    .bank-box .bank-number {
      color: #0a1b3d;
      font-weight: bold;
      font-size: 11pt;
      letter-spacing: 0.5px;
    }
    .bank-box .bank-owner {
      font-style: italic;
      font-size: 8.5pt;
      margin-top: 1px;
    }

    .totals-box {
      border: 1.5px solid #0a1b3d;
      display: grid;
      grid-template-rows: repeat(3, 1fr);
      font-size: 10pt;
    }
    .totals-row {
      display: grid;
      grid-template-columns: 95px 1fr;
      align-items: center;
      border-bottom: 1px solid #0a1b3d;
    }
    .totals-row:last-child { border-bottom: none; }
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
      body { width: 194mm; }
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
      <div class="brand-logo">
        <svg viewBox="0 0 38 45" xmlns="http://www.w3.org/2000/svg">${LOGO_SVG_PATHS}</svg>
      </div>
      <div class="brand-wordmark">
        <span class="gemi">gemi</span><span class="print">print</span>
      </div>
    </div>

    <div class="contacts">
      <div class="contact-row">
        <span class="contact-icon">&#9679;</span>
        <span>${SHOP_INFO.alamat}</span>
      </div>
      <div class="contact-row">
        <span class="contact-icon">&#9742;</span>
        <span>${SHOP_INFO.telepon}</span>
      </div>
      <div class="contact-row">
        <span class="contact-icon">&#9993;</span>
        <span>${SHOP_INFO.email}</span>
      </div>
    </div>

    <div class="header-right">
      <div class="field-line">
        <span class="field-value">${escapeHtml(kotaDisplay)}</span>
      </div>
      <div class="field-line">
        <span class="field-label">Kepada Yth,</span>
        <span class="field-value">${escapeHtml(pelanggan_nama || "")}</span>
      </div>
      <div class="invoice-no-row">
        <span class="invoice-no-label">INVOICE NO :</span>
        <span class="invoice-no-box">${escapeHtml(nomor_invoice)}</span>
      </div>
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
        ${emptyRowsHTML}
      </tbody>
    </table>
  </div>

  <!-- FOOTER -->
  <div class="footer">
    <div class="signature">
      <div>Hormat Kami</div>
      <div class="signature-name">(&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)</div>
    </div>

    <div class="bank-box">
      <div class="bank-title">Pembayaran via transfer ke Rekening :</div>
      <div class="bank-number">${SHOP_INFO.bankNomor}</div>
      <div class="bank-owner">an ${SHOP_INFO.bankAtasNama}</div>
    </div>

    <div class="totals-box">
      <div class="totals-row">
        <div class="totals-label">TOTAL Rp.</div>
        <div class="totals-value">${formatRupiahPlain(total)}</div>
      </div>
      <div class="totals-row">
        <div class="totals-label">BAYAR Rp.</div>
        <div class="totals-value">${formatRupiahPlain(bayar)}</div>
      </div>
      <div class="totals-row">
        <div class="totals-label">SISA Rp.</div>
        <div class="totals-value">${formatRupiahPlain(sisa)}</div>
      </div>
    </div>
  </div>

  <div class="legal-note">
    <span class="bullet">&#9679;</span>
    Barang yang sudah dibawa tidak bisa ditukar/dikembalikan
  </div>
</body>
</html>
  `;
}

function writeFakturToWindow(target: Window, html: string): void {
  target.document.open();
  target.document.write(html);
  target.document.close();
  target.focus();
}

/** Returns true if a print preview window or iframe was opened. */
export function printFaktur(data: FakturData): boolean {
  const html = generateFakturHTML(data);

  const printWindow = window.open("", "_blank", "noopener,noreferrer");
  if (printWindow) {
    writeFakturToWindow(printWindow, html);
    return true;
  }

  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "Cetak faktur");
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none";
  document.body.appendChild(iframe);

  const frameWindow = iframe.contentWindow;
  if (!frameWindow) {
    document.body.removeChild(iframe);
    return false;
  }

  writeFakturToWindow(frameWindow, html);
  try {
    frameWindow.print();
  } catch {
    // print() may be blocked; preview is still in the iframe
  }

  window.setTimeout(() => {
    if (iframe.parentNode) {
      document.body.removeChild(iframe);
    }
  }, 120_000);

  return true;
}

/**
 * Helper: derive a `FakturItem.ukuran` string from raw panjang × lebar values.
 * Returns empty string when either value is missing or non-positive.
 */
export function formatUkuran(
  panjang: number | null | undefined,
  lebar: number | null | undefined
): string {
  const p = typeof panjang === "number" && panjang > 0 ? panjang : 0;
  const l = typeof lebar === "number" && lebar > 0 ? lebar : 0;
  if (!p || !l) return "";
  const fmt = (n: number) =>
    Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
  return `${fmt(p)} × ${fmt(l)} m`;
}
