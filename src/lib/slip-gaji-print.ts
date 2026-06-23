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
export function generateSlipGajiHTML(data: SlipGajiData): string {
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
    ? `<div class="info-line"><span class="muted">Jabatan:</span> ${escapeHtml(data.jabatan)}</div>`
    : "";
  const metodeLine = data.metode_bayar
    ? `<div class="info-line"><span class="muted">Metode Bayar:</span> ${escapeHtml(data.metode_bayar)}</div>`
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
  <title>Slip Gaji - ${escapeHtml(data.nama_karyawan)} - ${escapeHtml(data.periode)}</title>
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
      size: A5 portrait;
      margin: 10mm;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    html, body {
      font-family: 'TW Cen MT', Arial, sans-serif;
      color: #0a1b3d;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      background: #fff;
    }
    body {
      width: 128mm;
      margin: 0 auto;
      font-size: 10pt;
      line-height: 1.3;
    }
    body::before {
      content: "";
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 90mm;
      height: 90mm;
      opacity: 0.05;
      pointer-events: none;
      z-index: 0;
      background: url("data:image/svg+xml,%3Csvg viewBox='0 0 38 45' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M11.1519 0.00085052H29.1766C38.4569 0.00085052 42.4009 44.1129 24.9542 44.1006H9.98877C27.0196 43.0487 25.6697 -0.221045 11.1484 0.00085052H11.1519Z' fill='%230a1b3d'/%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M9.08292 1.29121C-0.976261 1.29121 -2.18167 22.7863 3.02062 29.2213C4.54324 31.1074 5.59357 31.054 7.54972 30.1171C9.44595 29.209 11.0496 27.4215 11.395 24.0725C11.885 18.6237 9.79841 16.7993 6.86595 13.5119H14.5707C15.0042 11.1574 15.7197 8.8932 16.6925 6.9701C14.9267 3.54304 12.3714 1.31176 9.07587 1.31176V1.29943L9.08292 1.29121Z' fill='%2300AFEF'/%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M7.17259 43.4268C2.76685 43.02 1.19136 40.7312 0.377177 36.396L16.9181 36.2028C14.8139 40.2052 11.3633 43.0118 7.17259 43.4268Z' fill='%2300AFEF'/%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M10.4293 14.868C14.5284 18.3608 14.3733 28.8885 9.61513 30.7582C9.31554 30.8773 8.32513 31.0088 8.66349 31.0088L10.4399 31.0129H19.0011C20.2488 27.7831 20.3757 18.8744 19.5756 14.868H10.4293Z' fill='%2300AFEF'/%3E%3C/svg%3E") center / contain no-repeat;
    }

    /* ============ HEADER ============ */
    .header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      align-items: start;
      margin-bottom: 8px;
      border-bottom: 2px solid #0a1b3d;
      padding-bottom: 6px;
      position: relative;
      z-index: 1;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    .brand-logo svg {
      width: 36px;
      height: 42px;
      flex-shrink: 0;
    }
    .brand-id {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .brand-wordmark {
      font-family: 'Bauhaus 93', serif;
      font-size: 22pt;
      font-style: italic;
      line-height: 1;
      letter-spacing: -1px;
    }
    .brand-wordmark .gemi { color: #00AFEF; }
    .brand-wordmark .print { color: #0a1b3d; }
    .brand-sub {
      font-size: 8pt;
      color: #555;
      margin-top: 2px;
    }
    .brand-address {
      font-size: 7.5pt;
      line-height: 1.35;
      color: #555;
      margin-top: 3px;
    }

    .doc-title { text-align: right; }
    .doc-title h1 {
      font-size: 14pt;
      font-weight: bold;
      color: #0a1b3d;
      letter-spacing: 0.5px;
      white-space: nowrap;
    }
    .doc-meta {
      font-size: 8.5pt;
      margin-top: 4px;
      line-height: 1.5;
    }
    .doc-meta .meta-row {
      display: flex;
      justify-content: flex-end;
      gap: 6px;
      white-space: nowrap;
    }
    .doc-meta .meta-label { color: #555; }
    .doc-meta .meta-value {
      font-weight: bold;
      min-width: 100px;
      text-align: right;
    }

    /* ============ INFO BOX ============ */
    .info-grid {
      margin-bottom: 8px;
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
    .info-title {
      font-weight: bold;
      font-size: 8pt;
      color: #00AFEF;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      margin-bottom: 3px;
      border-bottom: 1px solid #c8dce8;
      padding-bottom: 2px;
    }
    .info-line {
      line-height: 1.45;
      font-size: 9pt;
    }
    .info-line .muted { color: #555; font-size: 8.5pt; }

    /* ============ ITEMS TABLE ============ */
    .table-wrapper {
      position: relative;
      z-index: 1;
    }
    table.items {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 9pt;
    }
    table.items thead th {
      background: #cfeafa;
      color: #0a1b3d;
      border: 1px solid #0a1b3d;
      padding: 5px 4px;
      font-weight: bold;
      font-size: 8.5pt;
      letter-spacing: 0.3px;
    }
    table.items tbody td {
      border: 1px solid #0a1b3d;
      padding: 4px 5px;
      vertical-align: middle;
    }
    .col-no       { width: 8%;  text-align: center; }
    .col-komponen { width: 57%; text-align: left; }
    .col-jumlah   { width: 35%; text-align: right; }
    .tipe { color: #64748b; font-size: 8pt; }
    .kosong { color: #94a3b8; font-style: italic; text-align: center; }

    /* ============ FOOTER ============ */
    .footer {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 12px;
      align-items: end;
      break-inside: avoid;
      page-break-inside: avoid;
      position: relative;
      z-index: 1;
    }
    .signatures {
      display: flex;
      flex-direction: column;
      gap: 18px;
      font-size: 9pt;
    }
    .signature-block {
      display: flex;
      flex-direction: column;
      gap: 28px;
    }
    .signature-line {
      display: flex;
      justify-content: space-between;
      border-top: 1px solid #0a1b3d;
      padding-top: 4px;
      width: 100%;
      max-width: 52mm;
      font-size: 8.5pt;
      color: #555;
    }

    .totals-box {
      border: 1.5px solid #0a1b3d;
      font-size: 9pt;
      justify-self: end;
      min-width: 58mm;
    }
    .totals-row {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      border-bottom: 1px solid #0a1b3d;
    }
    .totals-row:last-child { border-bottom: none; }
    .totals-row.totals-grand .totals-label,
    .totals-row.totals-grand .totals-value {
      background: #cfeafa;
    }
    .totals-row.potongan .totals-value {
      color: #dc2626;
    }
    .totals-label {
      padding: 4px 8px;
      font-weight: bold;
      border-right: 1px solid #0a1b3d;
      font-size: 8pt;
    }
    .totals-value {
      padding: 4px 8px;
      text-align: right;
      font-weight: bold;
      min-width: 28mm;
      font-variant-numeric: tabular-nums;
    }

    .legal-note {
      margin-top: 10px;
      text-align: center;
      font-size: 7.5pt;
      font-style: italic;
      color: #0a1b3d;
      position: relative;
      z-index: 1;
    }
    .legal-note .bullet {
      color: #00AFEF;
      font-style: normal;
      margin-right: 3px;
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
      <div class="signature-block">
        <div>Hormat Kami,</div>
        <div class="signature-line"><span>(</span><span>)</span></div>
      </div>
      <div class="signature-block">
        <div>Penerima,</div>
        <div class="signature-line"><span>(</span><span>${escapeHtml(data.nama_karyawan)}</span><span>)</span></div>
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
  const html = generateSlipGajiHTML(data);

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
