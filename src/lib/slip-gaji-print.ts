/**
 * Generator slip gaji karyawan dengan layout branding Gemiprint
 * (mengikuti faktur-print / surat-jalan-print: logo, font Bauhaus 93 + TW Cen MT,
 * warna navy/cyan, tabel bergaris, kotak total).
 *
 * Ukuran A5 portrait — cocok untuk slip individu. Output HTML; cetak memakai pola
 * popup-window + fallback iframe seperti faktur-print.
 */

import {
  formatJakartaDate,
  formatRupiahPlain,
} from "@/lib/format-id";

export interface SlipKomponenBaris {
  nama: string;
  tipe?: string;
  nilai: number;
}

export interface SlipGajiData {
  /** Nama toko (fallback jika shop tidak diisi). */
  nama_toko: string;
  periode: string;
  tanggal_bayar: string | null;
  nama_karyawan: string;
  jabatan?: string;
  komponen: SlipKomponenBaris[];
  bruto: number;
  potongan_kasbon: number;
  neto: number;
  metode_bayar?: string;
  /** Kota untuk baris tanggal, mis. "Bekasi". */
  kota?: string;
  /** Override info toko dari pengaturan. */
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

const TIPE_LABEL: Record<string, string> = {
  GAJI_POKOK: "Gaji Pokok",
  TUNJANGAN: "Tunjangan",
  KOMISI: "Komisi",
  BONUS: "Bonus",
};

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Origin app saat cetak dari browser — font di popup about:blank perlu URL absolut. */
function resolvePrintAssetOrigin(explicit?: string): string {
  if (explicit?.trim()) return explicit.replace(/\/$/, "");
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/$/, "");
  }
  return "";
}

/** @font-face branding Gemiprint — sama dengan faktur-print.ts */
function renderGemiprintFontFaces(assetOrigin: string): string {
  const fontBase = assetOrigin
    ? `${assetOrigin}/assets/fonts`
    : "/assets/fonts";
  return `
    @font-face {
      font-family: 'Bauhaus 93';
      src: url('${fontBase}/Bauhaus 93 Regular.ttf') format('truetype'),
           url('${fontBase}/BAUHS93.ttf') format('truetype');
      font-weight: normal;
      font-style: normal;
    }
    @font-face {
      font-family: 'TW Cen MT';
      src: url('${fontBase}/Tw Cen MT.ttf') format('truetype');
      font-weight: normal;
      font-style: normal;
    }
    @font-face {
      font-family: 'TW Cen MT';
      src: url('${fontBase}/TwCenMTStdBold.otf') format('opentype');
      font-weight: bold;
      font-style: normal;
    }`;
}

function renderKomponenRow(k: SlipKomponenBaris, index: number): string {
  const tipeLabel = k.tipe ? TIPE_LABEL[k.tipe] ?? k.tipe : "";
  const namaCell = tipeLabel
    ? `${escapeHtml(k.nama)}<br><span class="tipe">${escapeHtml(tipeLabel)}</span>`
    : escapeHtml(k.nama);

  return `
    <tr>
      <td class="col-no">${index + 1}</td>
      <td class="col-komponen">${namaCell}</td>
      <td class="col-jumlah">${formatRupiahPlain(k.nilai)}</td>
    </tr>`;
}

/** Bangun HTML slip gaji lengkap (dokumen mandiri siap cetak). */
export function generateSlipGajiHTML(
  data: SlipGajiData,
  options?: { assetOrigin?: string }
): string {
  const assetOrigin = resolvePrintAssetOrigin(options?.assetOrigin);
  const baseHref = assetOrigin ? `${assetOrigin}/` : "/";
  const shopInfo = {
    nama_toko:
      data.shop?.nama_toko?.trim() ||
      data.nama_toko?.trim() ||
      SHOP_INFO.nama_toko,
    slogan: data.shop?.slogan?.trim() || SHOP_INFO.slogan,
    alamat: data.shop?.alamat?.trim()
      ? escapeHtml(data.shop.alamat).replace(/\n/g, "<br>")
      : SHOP_INFO.alamat,
    telepon: data.shop?.telepon?.trim() || SHOP_INFO.telepon,
    email: data.shop?.email?.trim() || SHOP_INFO.email,
    website: data.shop?.website?.trim() || "",
  };

  const kota = data.kota?.trim() || "Bekasi";
  const tanggalBayarDisplay = data.tanggal_bayar
    ? formatJakartaDate(data.tanggal_bayar) || escapeHtml(data.tanggal_bayar)
    : "—";

  const komponenRows = data.komponen.length
    ? data.komponen.map(renderKomponenRow).join("")
    : `
    <tr>
      <td class="col-no">&nbsp;</td>
      <td class="col-komponen kosong" colspan="2">Tidak ada rincian komponen</td>
    </tr>`;

  const jabatanLine = data.jabatan
    ? `<div class="info-line"><span>Jabatan: ${escapeHtml(data.jabatan)}</span></div>`
    : "";
  const metodeLine = data.metode_bayar
    ? `<div class="info-line"><span>Metode Bayar: ${escapeHtml(data.metode_bayar)}</span></div>`
    : "";

  const potonganRow =
    data.potongan_kasbon > 0
      ? `
      <div class="totals-row potongan">
        <div class="totals-label">POTONGAN KASBON Rp.</div>
        <div class="totals-value">- ${formatRupiahPlain(data.potongan_kasbon)}</div>
      </div>`
      : "";

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <base href="${baseHref}">
  <title>Slip Gaji - ${escapeHtml(data.nama_karyawan)} - ${escapeHtml(data.periode)}</title>
  <style>
    ${renderGemiprintFontFaces(assetOrigin)}

    @page {
      size: A5 portrait;
      margin: 10mm;
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
      width: 128mm;
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
      width: 100mm;
      height: 100mm;
      opacity: 0.055;
      pointer-events: none;
      z-index: 0;
      background: url("data:image/svg+xml,%3Csvg viewBox='0 0 38 45' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M11.1519 0.00085052H29.1766C38.4569 0.00085052 42.4009 44.1129 24.9542 44.1006H9.98877C27.0196 43.0487 25.6697 -0.221045 11.1484 0.00085052H11.1519Z' fill='%230a1b3d'/%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M9.08292 1.29121C-0.976261 1.29121 -2.18167 22.7863 3.02062 29.2213C4.54324 31.1074 5.59357 31.054 7.54972 30.1171C9.44595 29.209 11.0496 27.4215 11.395 24.0725C11.885 18.6237 9.79841 16.7993 6.86595 13.5119H14.5707C15.0042 11.1574 15.7197 8.8932 16.6925 6.9701C14.9267 3.54304 12.3714 1.31176 9.07587 1.31176V1.29943L9.08292 1.29121Z' fill='%2300AFEF'/%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M7.17259 43.4268C2.76685 43.02 1.19136 40.7312 0.377177 36.396L16.9181 36.2028C14.8139 40.2052 11.3633 43.0118 7.17259 43.4268Z' fill='%2300AFEF'/%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M10.4293 14.868C14.5284 18.3608 14.3733 28.8885 9.61513 30.7582C9.31554 30.8773 8.32513 31.0088 8.66349 31.0088L10.4399 31.0129H19.0011C20.2488 27.7831 20.3757 18.8744 19.5756 14.868H10.4293Z' fill='%2300AFEF'/%3E%3C/svg%3E") center / contain no-repeat;
    }

    /* ============ HEADER (sama faktur-print) ============ */
    .header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 14px;
      align-items: start;
      margin-bottom: 6px;
      border-bottom: 2px solid #0a1b3d;
      padding-bottom: 6px;
      position: relative;
      z-index: 1;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
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
      width: 40px;
      height: 48px;
      flex-shrink: 0;
    }
    .brand-wordmark {
      font-family: 'Bauhaus 93', serif;
      font-size: 24pt;
      font-style: italic;
      line-height: 1;
      letter-spacing: -1px;
    }
    .brand-wordmark .gemi { color: #00AFEF; }
    .brand-wordmark .print { color: #0a1b3d; }
    .brand-sub { font-size: 9pt; color: #555; margin-top: 4px; }
    .brand-address {
      border-left: 1px solid #c8dce8;
      padding-left: 10px;
      color: #0a1b3d;
      font-size: 9pt;
      line-height: 1.42;
      min-width: 0;
      align-self: center;
    }
    .brand-address span {
      display: block;
      color: #555;
    }

    .doc-title { text-align: right; }
    .doc-title h1 {
      font-family: 'TW Cen MT', 'Arial', sans-serif;
      font-size: 15pt;
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
    .doc-meta .meta-value {
      font-weight: bold;
      min-width: 110px;
      text-align: right;
    }

    /* ============ INFO GRID (sama faktur-print) ============ */
    .info-grid {
      display: grid;
      grid-template-columns: 1fr;
      margin-bottom: 8px;
      font-size: 9.5pt;
      position: relative;
      z-index: 1;
    }
    .info-box {
      border: 1px solid #c8dce8;
      border-radius: 4px;
      padding: 6px 10px;
      background: #f0f8ff;
      width: 100%;
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

    /* ============ ITEMS TABLE (sama faktur-print) ============ */
    .table-wrapper {
      position: relative;
      margin-top: 6px;
      z-index: 1;
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
    .col-no       { width: 8%;  text-align: center; }
    .col-komponen { width: 57%; text-align: left; }
    .col-jumlah   { width: 35%; text-align: right; }
    .tipe { color: #555; font-size: 8.5pt; }
    .kosong { color: #555; font-style: italic; text-align: center; }

    /* ============ FOOTER (sama faktur-print) ============ */
    .footer {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 12px;
      margin-top: 10px;
      align-items: end;
      break-inside: avoid;
      page-break-inside: avoid;
      position: relative;
      z-index: 1;
    }
    .signatures {
      font-size: 9.5pt;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .signature {
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      align-items: flex-start;
      gap: 26px;
    }
    .signature-name {
      display: flex;
      justify-content: space-between;
      border-top: 1px solid #0a1b3d;
      padding-top: 4px;
      width: 180px;
    }

    .totals-box {
      border: 1.5px solid #0a1b3d;
      font-size: 10pt;
      min-width: 58mm;
    }
    .totals-row {
      display: grid;
      grid-template-columns: 95px 1fr;
      align-items: center;
      border-bottom: 1px solid #0a1b3d;
    }
    .totals-row:last-child { border-bottom: none; }
    .totals-row.totals-grand .totals-label,
    .totals-row.totals-grand .totals-value {
      background: #cfeafa;
    }
    .totals-row.potongan .totals-value {
      color: #0a1b3d;
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
      font-variant-numeric: tabular-nums;
    }

    .legal-note {
      margin-top: 8px;
      text-align: center;
      font-size: 8.5pt;
      font-style: italic;
      color: #0a1b3d;
      position: relative;
      z-index: 1;
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
      font-family: 'TW Cen MT', 'Arial', sans-serif;
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
      body { width: 128mm; }
    }
  </style>
</head>
<body>
  <div class="toolbar no-print">
    <button class="btn-print" onclick="window.print()">Cetak / Save PDF</button>
    <button class="btn-close" onclick="window.close()">Tutup</button>
  </div>

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
      <h1>SLIP GAJI</h1>
      <div class="doc-meta">
        <div class="meta-row">
          <span class="meta-label">Periode :</span>
          <span class="meta-value">${escapeHtml(data.periode)}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Tanggal :</span>
          <span class="meta-value">${escapeHtml(kota)}, ${tanggalBayarDisplay}</span>
        </div>
      </div>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-box">
      <div class="info-title">Karyawan</div>
      <div class="info-line"><strong>${escapeHtml(data.nama_karyawan)}</strong></div>
      ${jabatanLine}
      ${metodeLine}
    </div>
  </div>

  <div class="table-wrapper">
    <table class="items">
      <thead>
        <tr>
          <th class="col-no">NO.</th>
          <th class="col-komponen">KOMPONEN</th>
          <th class="col-jumlah">JUMLAH</th>
        </tr>
      </thead>
      <tbody>
        ${komponenRows}
      </tbody>
    </table>
  </div>

  <div class="footer">
    <div class="signatures">
      <div class="signature">
        <div>Hormat Kami,</div>
        <div class="signature-name"><span>(</span><span>)</span></div>
      </div>
      <div class="signature">
        <div>Penerima,</div>
        <div class="signature-name"><span>(</span><span>${escapeHtml(data.nama_karyawan)}</span><span>)</span></div>
      </div>
    </div>
    <div class="totals-box">
      <div class="totals-row">
        <div class="totals-label">GAJI BRUTO Rp.</div>
        <div class="totals-value">${formatRupiahPlain(data.bruto)}</div>
      </div>
      ${potonganRow}
      <div class="totals-row totals-grand">
        <div class="totals-label">DITERIMA Rp.</div>
        <div class="totals-value">${formatRupiahPlain(data.neto)}</div>
      </div>
    </div>
  </div>

  <div class="legal-note">
    <span class="bullet">&#9679;</span>
    Slip ini merupakan bukti pembayaran gaji dan dicetak oleh sistem ${escapeHtml(shopInfo.nama_toko)}.
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
      // print() bisa diblokir; pratinjau tetap tersedia di dokumen target.
    }
  };
  const fontsReady = target.document.fonts?.ready ?? Promise.resolve();
  fontsReady.then(print).catch(print);
}

/** Buka pratinjau cetak slip gaji. Mengembalikan true bila window/iframe terbuka. */
export function printSlipGaji(data: SlipGajiData): boolean {
  const assetOrigin = resolvePrintAssetOrigin();
  const html = generateSlipGajiHTML(data, { assetOrigin });

  const printWindow = window.open("", "_blank");
  if (printWindow) {
    writeToWindow(printWindow, html);
    printAfterAssetsReady(printWindow);
    return true;
  }

  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "Cetak slip gaji");
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
