/**
 * Internal purchase receipt ("Bukti Penerimaan Barang") generator.
 *
 * Printed for internal reference when the physical vendor invoice is lost or
 * hard to find. Shows: vendor info, who received the goods, line items with
 * dimensions, and payment summary.
 *
 * Same HTML + window.print() pattern as faktur-print.ts and thermal-print.ts.
 * A5 landscape, popup-window with iframe fallback.
 */

import { formatJakartaDate, formatRupiahPlain } from "@/lib/format-id";

export interface FakturPembelianItem {
  nama: string;
  ukuran?: string; // "2 × 3 m" or "" for non-dimensional
  qty: number;
  satuan?: string;
  harga: number;
  jumlah: number;
}

export interface FakturPembelianData {
  nomor_pembelian: string;
  nomor_faktur_vendor?: string; // vendor's own invoice number
  tanggal: string; // ISO date
  // Vendor info
  vendor_nama?: string;
  vendor_alamat?: string;
  vendor_telepon?: string;
  vendor_kontak?: string;
  // Internal info
  dibuat_oleh?: string; // who entered the record
  diterima_oleh?: string; // who physically received the goods
  catatan?: string;
  items: FakturPembelianItem[];
  total: number;
  jumlah_dibayar: number;
  status_pembayaran: string; // LUNAS | HUTANG | SEBAGIAN
}

const FIXED_ROW_COUNT = 10;

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

function renderItemRow(item: FakturPembelianItem, index: number): string {
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
      <td class="col-nama">${escapeHtml(item.nama)}</td>
      <td class="col-ukuran">${ukuran}</td>
      <td class="col-qty">${qtyCell}</td>
      <td class="col-harga">${formatRupiahPlain(item.harga)}</td>
      <td class="col-jumlah">${formatRupiahPlain(item.jumlah)}</td>
    </tr>`;
}

function renderEmptyRow(): string {
  return `
    <tr class="empty-row">
      <td class="col-no">&nbsp;</td>
      <td class="col-nama">&nbsp;</td>
      <td class="col-ukuran">&nbsp;</td>
      <td class="col-qty">&nbsp;</td>
      <td class="col-harga">&nbsp;</td>
      <td class="col-jumlah">&nbsp;</td>
    </tr>`;
}

export function generateFakturPembelianHTML(
  data: FakturPembelianData
): string {
  const {
    nomor_pembelian,
    nomor_faktur_vendor,
    tanggal,
    vendor_nama,
    vendor_alamat,
    vendor_telepon,
    vendor_kontak,
    dibuat_oleh,
    diterima_oleh,
    catatan,
    items,
    total,
    jumlah_dibayar,
    status_pembayaran,
  } = data;

  const sisa = Math.max(0, total - jumlah_dibayar);
  const tanggalDisplay = formatJakartaDate(tanggal);
  const itemsHTML = items.map(renderItemRow).join("");
  const padCount = Math.max(0, FIXED_ROW_COUNT - items.length);
  const emptyRowsHTML = Array.from({ length: padCount }, renderEmptyRow).join(
    ""
  );

  const statusColor =
    status_pembayaran === "LUNAS"
      ? "#16a34a"
      : status_pembayaran === "SEBAGIAN"
        ? "#d97706"
        : "#dc2626";

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Bukti Penerimaan - ${escapeHtml(nomor_pembelian)}</title>
  <style>
    @font-face {
      font-family: 'Bauhaus 93';
      src: url('/assets/fonts/BAUHS93.ttf') format('truetype');
    }
    @font-face {
      font-family: 'TW Cen MT';
      src: url('/assets/fonts/Tw Cen MT.ttf') format('truetype');
      font-weight: normal;
    }
    @font-face {
      font-family: 'TW Cen MT';
      src: url('/assets/fonts/TwCenMTStdBold.otf') format('opentype');
      font-weight: bold;
    }

    @page { size: A5 landscape; margin: 8mm; }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    html, body {
      font-family: 'TW Cen MT', Arial, sans-serif;
      color: #0a1b3d;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      background: #fff;
    }
    body { width: 194mm; margin: 0 auto; font-size: 10pt; line-height: 1.25; }

    /* ── HEADER ── */
    .header {
      display: grid;
      grid-template-columns: 130px 1fr;
      gap: 12px;
      align-items: start;
      margin-bottom: 6px;
      border-bottom: 2px solid #0a1b3d;
      padding-bottom: 6px;
    }
    .brand { display: flex; flex-direction: column; align-items: flex-start; }
    .brand-logo { display: flex; align-items: center; gap: 6px; }
    .brand-logo svg { width: 32px; height: 38px; flex-shrink: 0; }
    .brand-wordmark {
      font-family: 'Bauhaus 93', serif;
      font-size: 22pt;
      font-style: italic;
      line-height: 1;
    }
    .brand-wordmark .gemi { color: #00AFEF; }
    .brand-wordmark .print { color: #0a1b3d; }
    .brand-sub { font-size: 7.5pt; color: #555; margin-top: 2px; }

    .doc-title {
      text-align: right;
    }
    .doc-title h1 {
      font-size: 14pt;
      font-weight: bold;
      color: #0a1b3d;
      letter-spacing: 0.5px;
    }
    .doc-meta {
      font-size: 9pt;
      margin-top: 4px;
      line-height: 1.5;
    }
    .doc-meta .meta-row {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    .doc-meta .meta-label { color: #555; }
    .doc-meta .meta-value { font-weight: bold; min-width: 120px; text-align: right; }
    .status-badge {
      display: inline-block;
      padding: 1px 8px;
      border-radius: 4px;
      font-size: 8pt;
      font-weight: bold;
      color: white;
      background: ${statusColor};
    }

    /* ── INFO GRID ── */
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-bottom: 6px;
      font-size: 9pt;
    }
    .info-box {
      border: 1px solid #c8dce8;
      border-radius: 4px;
      padding: 5px 8px;
      background: #f0f8ff;
    }
    .info-box .info-title {
      font-weight: bold;
      font-size: 8pt;
      color: #00AFEF;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      margin-bottom: 3px;
      border-bottom: 1px solid #c8dce8;
      padding-bottom: 2px;
    }
    .info-box .info-line { line-height: 1.45; }
    .info-box .info-line span { color: #555; font-size: 8.5pt; }

    /* ── TABLE ── */
    .table-wrapper { position: relative; margin-bottom: 8px; }
    .watermark {
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      width: 100mm; height: 100mm;
      opacity: 0.05;
      pointer-events: none;
      z-index: 0;
    }
    .watermark svg { width: 100%; height: 100%; }

    table.items {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      position: relative;
      z-index: 1;
      font-size: 9pt;
    }
    table.items thead th {
      background: #cfeafa;
      color: #0a1b3d;
      border: 1px solid #0a1b3d;
      padding: 4px;
      font-weight: bold;
      font-size: 9pt;
    }
    table.items tbody td {
      border: 1px solid #0a1b3d;
      padding: 3px 5px;
      vertical-align: middle;
      height: 20px;
    }
    .col-no     { width: 6%;  text-align: center; }
    .col-nama   { width: 34%; text-align: left; }
    .col-ukuran { width: 12%; text-align: center; }
    .col-qty    { width: 8%;  text-align: center; }
    .col-harga  { width: 16%; text-align: right; }
    .col-jumlah { width: 24%; text-align: right; }

    /* ── FOOTER ── */
    .footer {
      display: grid;
      grid-template-columns: 1fr 200px;
      gap: 10px;
      align-items: end;
    }
    .footer-left { font-size: 9pt; }
    .footer-left .catatan {
      font-style: italic;
      color: #555;
      font-size: 8.5pt;
      margin-top: 4px;
    }
    .legal-note {
      font-size: 8pt;
      color: #555;
      font-style: italic;
      margin-top: 6px;
    }
    .legal-note .bullet { color: #00AFEF; font-style: normal; margin-right: 3px; }

    .totals-box {
      border: 1.5px solid #0a1b3d;
    }
    .totals-row {
      display: grid;
      grid-template-columns: 100px 1fr;
      align-items: center;
      border-bottom: 1px solid #0a1b3d;
    }
    .totals-row:last-child { border-bottom: none; }
    .totals-label {
      padding: 4px 8px;
      font-weight: bold;
      border-right: 1px solid #0a1b3d;
      font-size: 9.5pt;
    }
    .totals-value {
      padding: 4px 10px;
      text-align: right;
      font-weight: bold;
      font-size: 9.5pt;
    }

    /* ── TOOLBAR (screen only) ── */
    .toolbar {
      position: fixed; top: 12px; right: 12px;
      display: flex; gap: 8px; z-index: 100;
    }
    .toolbar button {
      font-family: inherit; font-size: 10pt;
      padding: 8px 14px; border-radius: 6px;
      border: none; cursor: pointer;
      box-shadow: 0 2px 6px rgba(0,0,0,0.15);
    }
    .btn-print { background: #00AFEF; color: #fff; font-weight: bold; }
    .btn-close { background: #e5e7eb; color: #0a1b3d; }

    @media print {
      .toolbar { display: none !important; }
      body { width: 194mm; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button class="btn-print" onclick="window.print()">Cetak / Save PDF</button>
    <button class="btn-close" onclick="window.close()">Tutup</button>
  </div>

  <!-- HEADER -->
  <div class="header">
    <div class="brand">
      <div class="brand-logo">
        <svg viewBox="0 0 38 45" xmlns="http://www.w3.org/2000/svg">${LOGO_SVG_PATHS}</svg>
        <div class="brand-wordmark">
          <span class="gemi">gemi</span><span class="print">print</span>
        </div>
      </div>
      <div class="brand-sub">Digital Printing &amp; Advertising</div>
    </div>
    <div class="doc-title">
      <h1>BUKTI PENERIMAAN BARANG</h1>
      <div class="doc-meta">
        <div class="meta-row">
          <span class="meta-label">No. PO :</span>
          <span class="meta-value">${escapeHtml(nomor_pembelian)}</span>
        </div>
        ${
          nomor_faktur_vendor
            ? `<div class="meta-row">
          <span class="meta-label">No. Faktur Vendor :</span>
          <span class="meta-value">${escapeHtml(nomor_faktur_vendor)}</span>
        </div>`
            : ""
        }
        <div class="meta-row">
          <span class="meta-label">Tanggal :</span>
          <span class="meta-value">${tanggalDisplay}</span>
        </div>
        <div class="meta-row" style="margin-top:3px">
          <span class="status-badge">${escapeHtml(status_pembayaran)}</span>
        </div>
      </div>
    </div>
  </div>

  <!-- INFO GRID -->
  <div class="info-grid">
    <div class="info-box">
      <div class="info-title">Diterima dari (Vendor)</div>
      <div class="info-line">
        <strong>${escapeHtml(vendor_nama || "—")}</strong>
      </div>
      ${vendor_alamat ? `<div class="info-line"><span>${escapeHtml(vendor_alamat)}</span></div>` : ""}
      ${vendor_telepon ? `<div class="info-line"><span>Telp: ${escapeHtml(vendor_telepon)}</span></div>` : ""}
      ${vendor_kontak ? `<div class="info-line"><span>Kontak: ${escapeHtml(vendor_kontak)}</span></div>` : ""}
    </div>
    <div class="info-box">
      <div class="info-title">Penerimaan Internal</div>
      <div class="info-line">
        <span>Diterima oleh: </span>
        <strong>${escapeHtml(diterima_oleh || "—")}</strong>
      </div>
      ${dibuat_oleh ? `<div class="info-line"><span>Diinput oleh: ${escapeHtml(dibuat_oleh)}</span></div>` : ""}
      ${catatan ? `<div class="info-line" style="margin-top:3px"><span>Catatan: ${escapeHtml(catatan)}</span></div>` : ""}
    </div>
  </div>

  <!-- ITEMS TABLE -->
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
          <th class="col-harga">HARGA BELI</th>
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
    <div class="footer-left">
      <div class="legal-note">
        <span class="bullet">&#9679;</span>
        Dokumen ini merupakan bukti penerimaan barang untuk keperluan internal.
      </div>
    </div>
    <div class="totals-box">
      <div class="totals-row">
        <div class="totals-label">TOTAL Rp.</div>
        <div class="totals-value">${formatRupiahPlain(total)}</div>
      </div>
      <div class="totals-row">
        <div class="totals-label">DIBAYAR Rp.</div>
        <div class="totals-value">${formatRupiahPlain(jumlah_dibayar)}</div>
      </div>
      <div class="totals-row">
        <div class="totals-label">SISA Rp.</div>
        <div class="totals-value">${formatRupiahPlain(sisa)}</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function writeFakturToWindow(target: Window, html: string): void {
  target.document.open();
  target.document.write(html);
  target.document.close();
  target.focus();
}

/** Returns true if a print preview window or iframe was opened. */
export function printFakturPembelian(data: FakturPembelianData): boolean {
  const html = generateFakturPembelianHTML(data);

  const printWindow = window.open("", "_blank", "noopener,noreferrer");
  if (printWindow) {
    writeFakturToWindow(printWindow, html);
    return true;
  }

  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "Cetak bukti penerimaan");
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
    if (iframe.parentNode) document.body.removeChild(iframe);
  }, 120_000);

  return true;
}

/**
 * Helper: derive a display size string from panjang × lebar values.
 * Returns empty string when either value is missing or non-positive.
 */
export function formatUkuranPembelian(
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
