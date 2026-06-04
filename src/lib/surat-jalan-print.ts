/**
 * Surat Jalan (Delivery Note) print generator.
 *
 * A4 portrait, simpler than the sales faktur:
 * - Header with shop logo + "SURAT JALAN" title + nomor SJ
 * - Sender (gemiprint) and Recipient (pelanggan) blocks
 * - Item table: NO / NAMA BARANG / UKURAN / QTY (no prices — SJ is non-financial)
 * - Logistik info: tanggal, nomor kendaraan, pengirim
 * - Footer with three signature blocks: Pengirim, Petugas, Penerima
 *
 * Output is HTML; print uses the same popup/iframe-fallback pattern as
 * faktur-print.ts.
 */

import { formatJakartaDate } from "@/lib/format-id";

export interface SuratJalanItem {
  nama_barang: string;
  keterangan?: string | null;
  ukuran?: string | null;
  qty: number;
  satuan?: string | null;
}

export interface SuratJalanData {
  nomor_sj: string;
  tanggal: string; // ISO or YYYY-MM-DD
  nomor_faktur?: string | null; // optional back-link to source sale
  pelanggan_nama?: string | null;
  pelanggan_alamat?: string | null;
  pelanggan_telepon?: string | null;
  nomor_kendaraan?: string | null;
  pengirim_nama?: string | null;
  catatan?: string | null;
  diterima_oleh?: string | null; // pre-filled if SJ already DITERIMA
  items: SuratJalanItem[];
  /** Override SHOP_INFO untuk multi-tenant. */
  shop?: {
    nama_toko?: string | null;
    slogan?: string | null;
    alamat?: string | null;
    telepon?: string | null;
    email?: string | null;
    website?: string | null;
  };
}

const SHOP_INFO = {
  nama_toko: "gemiprint",
  slogan: "Digital Printing & Advertising",
  alamat:
    "Cifest Walk, Ruko Pasadena Blok RA No. 18A,<br>Kel. Ciantra, Cikarang Selatan - Bekasi, 17531",
  telepon: "0812 3456 0525",
  email: "cs@gemiprint.com",
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

function renderItemRow(item: SuratJalanItem, index: number): string {
  const namaLines = [escapeHtml(item.nama_barang)];
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
    </tr>`;
}

export function generateSuratJalanHTML(data: SuratJalanData): string {
  const {
    nomor_sj,
    tanggal,
    nomor_faktur,
    pelanggan_nama,
    pelanggan_alamat,
    pelanggan_telepon,
    nomor_kendaraan,
    pengirim_nama,
    catatan,
    diterima_oleh,
    items,
    shop,
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
  };

  const tanggalDisplay = formatJakartaDate(tanggal);
  const itemsHTML = items.map(renderItemRow).join("");

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Surat Jalan ${escapeHtml(nomor_sj)}</title>
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

    @page { size: A4 portrait; margin: 12mm; }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    html, body {
      font-family: 'TW Cen MT', Arial, sans-serif;
      color: #0a1b3d;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      background: #fff;
    }
    body {
      width: 186mm;
      margin: 0 auto;
      font-size: 10.5pt;
      line-height: 1.3;
    }

    /* ============ HEADER ============ */
    .header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 18px;
      align-items: center;
      margin-bottom: 8px;
      border-bottom: 2px solid #0a1b3d;
      padding-bottom: 8px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 14px;
      min-width: 0;
    }
    .brand-logo svg {
      width: 48px;
      height: 56px;
      flex-shrink: 0;
    }
    .brand-id {
      display: flex;
      flex-direction: column;
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
    .brand-sub { font-size: 9pt; color: #555; margin-top: 2px; }
    .brand-address {
      font-size: 9pt;
      line-height: 1.4;
      color: #555;
      margin-top: 4px;
    }
    .doc-title { text-align: right; }
    .doc-title h1 {
      font-size: 22pt;
      font-weight: bold;
      color: #0a1b3d;
      letter-spacing: 1px;
    }
    .doc-meta {
      font-size: 10pt;
      margin-top: 6px;
      line-height: 1.55;
    }
    .doc-meta .meta-row {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    .doc-meta .meta-label { color: #555; }
    .doc-meta .meta-value { font-weight: bold; min-width: 130px; text-align: right; }

    /* ============ INFO BLOCKS (sender + recipient) ============ */
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 10px;
    }
    .info-box {
      border: 1px solid #c8dce8;
      border-radius: 4px;
      padding: 8px 10px;
      background: #f0f8ff;
    }
    .info-title {
      font-weight: bold;
      font-size: 9pt;
      color: #00AFEF;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      margin-bottom: 4px;
      border-bottom: 1px solid #c8dce8;
      padding-bottom: 2px;
    }
    .info-line {
      line-height: 1.45;
      font-size: 9.5pt;
    }
    .info-line .muted { color: #555; }

    /* ============ LOGISTIK ============ */
    .logistik {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 8px;
      font-size: 9.5pt;
    }
    .logistik .row {
      display: flex;
      gap: 8px;
    }
    .logistik .label {
      color: #555;
      min-width: 110px;
    }
    .logistik .value {
      font-weight: bold;
    }

    /* ============ ITEMS TABLE ============ */
    table.items {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      margin-top: 4px;
      font-size: 10pt;
    }
    table.items thead th {
      background: #cfeafa;
      color: #0a1b3d;
      border: 1px solid #0a1b3d;
      padding: 6px 5px;
      font-weight: bold;
      font-size: 10pt;
      letter-spacing: 0.3px;
    }
    table.items tbody td {
      border: 1px solid #0a1b3d;
      padding: 5px 6px;
      vertical-align: middle;
      min-height: 26px;
    }
    .col-no      { width: 8%;  text-align: center; }
    .col-nama    { width: 50%; text-align: left; }
    .col-ukuran  { width: 22%; text-align: center; }
    .col-qty     { width: 20%; text-align: center; }

    /* ============ NOTE ============ */
    .note-block {
      margin-top: 10px;
      font-size: 9.5pt;
    }
    .note-label {
      font-weight: bold;
      color: #0a1b3d;
      margin-bottom: 2px;
    }
    .note-content {
      border: 1px solid #c8dce8;
      border-radius: 4px;
      padding: 8px 10px;
      background: #fafdff;
      min-height: 36px;
    }

    /* ============ SIGNATURES ============ */
    .signatures {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 14px;
      margin-top: 20px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .sig-box {
      text-align: center;
      font-size: 9.5pt;
    }
    .sig-title {
      font-weight: bold;
      color: #0a1b3d;
      margin-bottom: 50px;
    }
    .sig-line {
      border-top: 1px solid #0a1b3d;
      padding-top: 4px;
      font-size: 9pt;
      color: #555;
    }
    .sig-name {
      font-weight: bold;
      color: #0a1b3d;
      min-height: 1.2em;
    }

    .legal-note {
      margin-top: 16px;
      text-align: center;
      font-size: 8.5pt;
      font-style: italic;
      color: #555;
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
      <div class="brand-id">
        <div class="brand-wordmark">
          <span class="gemi">gemi</span><span class="print">print</span>
        </div>
        <div class="brand-sub">${escapeHtml(shopInfo.slogan)}</div>
        <div class="brand-address">
          ${shopInfo.alamat}<br>
          Telp: ${escapeHtml(shopInfo.telepon)}${shopInfo.email ? ` &middot; ${escapeHtml(shopInfo.email)}` : ""}
        </div>
      </div>
    </div>
    <div class="doc-title">
      <h1>SURAT JALAN</h1>
      <div class="doc-meta">
        <div class="meta-row">
          <span class="meta-label">No. SJ:</span>
          <span class="meta-value">${escapeHtml(nomor_sj)}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Tanggal:</span>
          <span class="meta-value">${escapeHtml(tanggalDisplay)}</span>
        </div>
        ${
          nomor_faktur
            ? `<div class="meta-row">
                 <span class="meta-label">Ref. Faktur:</span>
                 <span class="meta-value">${escapeHtml(nomor_faktur)}</span>
               </div>`
            : ""
        }
      </div>
    </div>
  </div>

  <!-- SENDER + RECIPIENT -->
  <div class="info-grid">
    <div class="info-box">
      <div class="info-title">Pengirim</div>
      <div class="info-line"><strong>${escapeHtml(shopInfo.nama_toko)}</strong></div>
      <div class="info-line muted">${shopInfo.alamat}</div>
      <div class="info-line muted">Telp: ${escapeHtml(shopInfo.telepon)}</div>
    </div>
    <div class="info-box">
      <div class="info-title">Diterima Oleh</div>
      <div class="info-line"><strong>${escapeHtml(pelanggan_nama || "—")}</strong></div>
      ${pelanggan_alamat ? `<div class="info-line muted">${escapeHtml(pelanggan_alamat)}</div>` : ""}
      ${pelanggan_telepon ? `<div class="info-line muted">Telp: ${escapeHtml(pelanggan_telepon)}</div>` : ""}
    </div>
  </div>

  <!-- LOGISTIK -->
  <div class="logistik">
    <div class="row">
      <span class="label">No. Kendaraan</span>
      <span class="value">: ${escapeHtml(nomor_kendaraan || "—")}</span>
    </div>
    <div class="row">
      <span class="label">Pengirim</span>
      <span class="value">: ${escapeHtml(pengirim_nama || "—")}</span>
    </div>
  </div>

  <!-- ITEMS TABLE -->
  <table class="items">
    <thead>
      <tr>
        <th class="col-no">NO.</th>
        <th class="col-nama">NAMA BARANG</th>
        <th class="col-ukuran">UKURAN</th>
        <th class="col-qty">QTY</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHTML}
    </tbody>
  </table>

  ${
    catatan
      ? `<div class="note-block">
           <div class="note-label">Catatan:</div>
           <div class="note-content">${escapeHtml(catatan).replace(/\n/g, "<br>")}</div>
         </div>`
      : ""
  }

  <!-- SIGNATURES -->
  <div class="signatures">
    <div class="sig-box">
      <div class="sig-title">Pengirim</div>
      <div class="sig-line">
        <div class="sig-name">${escapeHtml(pengirim_nama || "")}</div>
      </div>
    </div>
    <div class="sig-box">
      <div class="sig-title">Petugas Gudang</div>
      <div class="sig-line">
        <div class="sig-name">&nbsp;</div>
      </div>
    </div>
    <div class="sig-box">
      <div class="sig-title">Penerima</div>
      <div class="sig-line">
        <div class="sig-name">${escapeHtml(diterima_oleh || "")}</div>
      </div>
    </div>
  </div>

  <div class="legal-note">
    Dokumen ini dicetak oleh sistem ${escapeHtml(shopInfo.nama_toko)}.
    Mohon konfirmasi dengan menandatangani salah satu kolom di atas.
  </div>
</body>
</html>`;
}

function writeToWindow(target: Window, html: string): void {
  target.document.open();
  target.document.write(html);
  target.document.close();
  target.focus();
}

function printAfterAssetsReady(target: Window): void {
  const print = () => {
    try {
      target.focus();
      target.print();
    } catch {
      // print() may be blocked; preview is still available
    }
  };
  const fontsReady = target.document.fonts?.ready ?? Promise.resolve();
  fontsReady.then(print).catch(print);
}

/** Returns true if a print preview window or iframe was opened. */
export function printSuratJalan(data: SuratJalanData): boolean {
  const html = generateSuratJalanHTML(data);

  const printWindow = window.open("", "_blank");
  if (printWindow) {
    writeToWindow(printWindow, html);
    return true;
  }

  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "Cetak surat jalan");
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none";
  document.body.appendChild(iframe);

  const frameWindow = iframe.contentWindow;
  if (!frameWindow) {
    document.body.removeChild(iframe);
    return false;
  }

  writeToWindow(frameWindow, html);
  printAfterAssetsReady(frameWindow);

  window.setTimeout(() => {
    if (iframe.parentNode) {
      document.body.removeChild(iframe);
    }
  }, 120_000);

  return true;
}
