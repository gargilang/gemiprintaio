/**
 * Generator HTML Laporan Manajemen Bulanan A4 portrait.
 * Desain konsisten dengan faktur Gemiprint: logo SVG, Bauhaus 93 italic,
 * TW Cen MT, palette navy #0a1b3d + cyan #00AFEF.
 * Output: HTML standalone, bisa dibuka di popup/iframe → window.print().
 */

import {
  formatJakartaDate,
  formatRupiahPlain,
} from "@/lib/format-id";
import type { LaporanBulananData } from "@/lib/services/laporan-bulanan-service";

// Logo SVG paths — sama persis dengan faktur-print.ts
const LOGO_SVG_PATHS = `
  <path fill-rule="evenodd" clip-rule="evenodd" d="M11.1519 0.00085052H29.1766C38.4569 0.00085052 42.4009 44.1129 24.9542 44.1006H9.98877C27.0196 43.0487 25.6697 -0.221045 11.1484 0.00085052H11.1519Z" fill="#0a1b3d"/>
  <path fill-rule="evenodd" clip-rule="evenodd" d="M9.08292 1.29121C-0.976261 1.29121 -2.18167 22.7863 3.02062 29.2213C4.54324 31.1074 5.59357 31.054 7.54972 30.1171C9.44595 29.209 11.0496 27.4215 11.395 24.0725C11.885 18.6237 9.79841 16.7993 6.86595 13.5119H14.5707C15.0042 11.1574 15.7197 8.8932 16.6925 6.9701C14.9267 3.54304 12.3714 1.31176 9.07587 1.31176V1.29943L9.08292 1.29121Z" fill="#00AFEF"/>
  <path fill-rule="evenodd" clip-rule="evenodd" d="M7.17259 43.4268C2.76685 43.02 1.19136 40.7312 0.377177 36.396L16.9181 36.2028C14.8139 40.2052 11.3633 43.0118 7.17259 43.4268Z" fill="#00AFEF"/>
  <path fill-rule="evenodd" clip-rule="evenodd" d="M10.4293 14.868C14.5284 18.3608 14.3733 28.8885 9.61513 30.7582C9.31554 30.8773 8.32513 31.0088 8.66349 31.0088L10.4399 31.0129H19.0011C20.2488 27.7831 20.3757 18.8744 19.5756 14.868H10.4293Z" fill="#00AFEF"/>
`;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function rp(n: number): string {
  return formatRupiahPlain(n);
}

function pct(n: number): string {
  return `${n.toFixed(2)}%`;
}

export function generateLaporanBulananHTML(data: LaporanBulananData): string {
  const { info_toko, kpi, hutang_piutang, buku_kas, saldo_akhir, ttd } = data;

  const tokoNama = esc(info_toko.nama_toko);
  const tokoAlamat = info_toko.alamat
    ? esc(info_toko.alamat).replace(/\n/g, "<br>")
    : "";
  const tokoTelepon = info_toko.telepon ? esc(info_toko.telepon) : "";
  const tokoEmail = info_toko.email ? esc(info_toko.email) : "";
  const slogan = info_toko.slogan
    ? esc(info_toko.slogan)
    : "Digital Printing &amp; Advertising";

  const tanggalCetak = formatJakartaDate(data.end_date);
  const kotaTanggal = `Bekasi, ${tanggalCetak}`;

  const namaDirektur = ttd.nama_direktur ? esc(ttd.nama_direktur) : "";
  const namaManajer = ttd.nama_manajer ? esc(ttd.nama_manajer) : "";

  // Baris buku kas
  const kasRows = buku_kas
    .map(
      (row, i) => `
    <tr class="${i % 2 === 0 ? "row-even" : "row-odd"}">
      <td>${esc(formatJakartaDate(row.tanggal))}</td>
      <td>${esc(row.kategori_label)}</td>
      <td class="col-keperluan">${esc(row.keperluan)}</td>
      <td class="num">${row.debit > 0 ? rp(row.debit) : "—"}</td>
      <td class="num">${row.kredit > 0 ? rp(row.kredit) : "—"}</td>
      <td class="num">${rp(row.saldo)}</td>
    </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Laporan Manajemen Bulanan — ${esc(data.periode_label)}</title>
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
      font-size: 9.5pt;
      line-height: 1.3;
    }

    /* Watermark */
    body::before {
      content: "";
      position: fixed;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      width: 110mm; height: 110mm;
      opacity: 0.045;
      pointer-events: none;
      z-index: 0;
      background: url("data:image/svg+xml,%3Csvg viewBox='0 0 38 45' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M11.1519 0.00085052H29.1766C38.4569 0.00085052 42.4009 44.1129 24.9542 44.1006H9.98877C27.0196 43.0487 25.6697 -0.221045 11.1484 0.00085052H11.1519Z' fill='%230a1b3d'/%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M9.08292 1.29121C-0.976261 1.29121 -2.18167 22.7863 3.02062 29.2213C4.54324 31.1074 5.59357 31.054 7.54972 30.1171C9.44595 29.209 11.0496 27.4215 11.395 24.0725C11.885 18.6237 9.79841 16.7993 6.86595 13.5119H14.5707C15.0042 11.1574 15.7197 8.8932 16.6925 6.9701C14.9267 3.54304 12.3714 1.31176 9.07587 1.31176V1.29943L9.08292 1.29121Z' fill='%2300AFEF'/%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M7.17259 43.4268C2.76685 43.02 1.19136 40.7312 0.377177 36.396L16.9181 36.2028C14.8139 40.2052 11.3633 43.0118 7.17259 43.4268Z' fill='%2300AFEF'/%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M10.4293 14.868C14.5284 18.3608 14.3733 28.8885 9.61513 30.7582C9.31554 30.8773 8.32513 31.0088 8.66349 31.0088L10.4399 31.0129H19.0011C20.2488 27.7831 20.3757 18.8744 19.5756 14.868H10.4293Z' fill='%2300AFEF'/%3E%3C/svg%3E") center/contain no-repeat;
    }

    /* ── KOP SURAT ── */
    .kop {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      padding-bottom: 6px;
      border-bottom: 2px solid #0a1b3d;
      margin-bottom: 10px;
      position: relative;
      z-index: 1;
    }
    .brand { display: flex; align-items: center; gap: 10px; }
    .brand-logo { display: flex; flex-direction: column; align-items: center; gap: 2px; }
    .brand-logo svg { width: 36px; height: 43px; }
    .brand-wordmark {
      font-family: 'Bauhaus 93', serif;
      font-size: 24pt;
      font-style: italic;
      line-height: 1;
      letter-spacing: -1px;
    }
    .brand-wordmark .gemi { color: #00AFEF; }
    .brand-wordmark .print { color: #0a1b3d; }
    .brand-sub { font-size: 7.5pt; color: #555; margin-top: 2px; }
    .brand-address {
      border-left: 1px solid #c8dce8;
      padding-left: 10px;
      font-size: 8pt;
      color: #0a1b3d;
      line-height: 1.45;
    }
    .brand-address span { color: #555; display: block; }

    /* ── IDENTITAS DOKUMEN ── */
    .doc-header {
      text-align: center;
      margin-bottom: 8px;
      position: relative;
      z-index: 1;
    }
    .doc-title {
      font-size: 13pt;
      font-weight: bold;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: #0a1b3d;
    }
    .doc-periode {
      font-size: 10pt;
      font-weight: bold;
      color: #00AFEF;
      margin-top: 2px;
    }
    .doc-nomor {
      font-size: 8pt;
      color: #555;
      margin-top: 1px;
    }

    /* ── PARAGRAF ── */
    .paragraf {
      font-size: 9pt;
      line-height: 1.6;
      text-align: justify;
      margin-bottom: 10px;
      position: relative;
      z-index: 1;
    }
    .paragraf p { margin-bottom: 4px; }

    /* ── TABEL RINGKASAN KPI ── */
    .section-title {
      font-size: 9pt;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: #00AFEF;
      border-bottom: 1px solid #c8dce8;
      padding-bottom: 2px;
      margin-bottom: 5px;
      margin-top: 10px;
      position: relative;
      z-index: 1;
    }
    table.ringkasan {
      width: 100%;
      border-collapse: collapse;
      font-size: 9pt;
      margin-bottom: 8px;
      position: relative;
      z-index: 1;
    }
    table.ringkasan td {
      padding: 3.5px 6px;
      border: 1px solid #d0e4f0;
    }
    table.ringkasan .no { width: 6%; text-align: center; color: #555; }
    table.ringkasan .uraian { width: 56%; }
    table.ringkasan .nilai { width: 38%; text-align: right; font-weight: bold; }
    table.ringkasan tr:nth-child(even) td { background: #f0f8ff; }
    table.ringkasan .row-laba td { background: #e8f5e9 !important; font-weight: bold; }
    table.ringkasan .row-separator td {
      border-top: 2px solid #0a1b3d;
      background: #cfeafa;
      font-weight: bold;
    }
    table.ringkasan thead th {
      background: #0a1b3d;
      color: #fff;
      padding: 4px 6px;
      font-size: 8.5pt;
      text-align: left;
      font-weight: bold;
    }
    table.ringkasan thead th.nilai { text-align: right; }

    /* ── TABEL HUTANG PIUTANG ── */
    table.hutang-piutang {
      width: 100%;
      border-collapse: collapse;
      font-size: 9pt;
      margin-bottom: 8px;
      position: relative;
      z-index: 1;
    }
    table.hutang-piutang thead th {
      background: #0a1b3d;
      color: #fff;
      padding: 4px 6px;
      font-size: 8.5pt;
      text-align: left;
    }
    table.hutang-piutang thead th.num { text-align: right; }
    table.hutang-piutang td {
      padding: 3.5px 6px;
      border: 1px solid #d0e4f0;
    }
    table.hutang-piutang td.num { text-align: right; font-weight: bold; }

    /* ── TTD ── */
    .ttd-block {
      margin-top: 16px;
      display: flex;
      justify-content: space-between;
      position: relative;
      z-index: 1;
    }
    .ttd-col {
      width: 45%;
      font-size: 8.5pt;
      line-height: 1.4;
    }
    .ttd-col .ttd-kota { color: #555; margin-bottom: 6px; }
    .ttd-col .ttd-jabatan { font-weight: bold; margin-bottom: 36px; }
    .ttd-col .ttd-garis {
      border-top: 1px solid #0a1b3d;
      padding-top: 3px;
      font-weight: bold;
    }

    /* ── HALAMAN 2+: BUKU KAS ── */
    .page-break { page-break-before: always; }
    .kas-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      border-bottom: 2px solid #0a1b3d;
      padding-bottom: 4px;
      margin-bottom: 8px;
      position: relative;
      z-index: 1;
    }
    .kas-header .kas-toko { font-weight: bold; font-size: 10pt; }
    .kas-header .kas-meta { font-size: 8pt; color: #555; text-align: right; }

    table.kas {
      width: 100%;
      border-collapse: collapse;
      font-size: 8pt;
      position: relative;
      z-index: 1;
    }
    table.kas thead th {
      background: #0a1b3d;
      color: #fff;
      padding: 4px 5px;
      text-align: left;
      font-size: 8pt;
    }
    table.kas thead th.num { text-align: right; }
    table.kas td {
      padding: 3px 5px;
      border-bottom: 1px solid #e8eef4;
      vertical-align: top;
    }
    table.kas td.num { text-align: right; white-space: nowrap; }
    table.kas td.col-keperluan { max-width: 55mm; word-break: break-word; }
    table.kas .row-even td { background: #fff; }
    table.kas .row-odd td { background: #f5f9fc; }
    table.kas .row-saldo-akhir td {
      background: #cfeafa;
      font-weight: bold;
      border-top: 2px solid #0a1b3d;
    }

    /* Toolbar (hanya layar, disembunyikan saat cetak) */
    .toolbar {
      position: fixed;
      top: 12px; right: 12px;
      z-index: 999;
    }
    .btn-print {
      background: #0a1b3d;
      color: #fff;
      border: none;
      padding: 8px 18px;
      font-family: 'TW Cen MT', Arial, sans-serif;
      font-size: 10pt;
      font-weight: bold;
      border-radius: 6px;
      cursor: pointer;
      letter-spacing: 0.3px;
    }
    .btn-print:hover { background: #00AFEF; }

    @media print {
      .toolbar { display: none !important; }
      body { width: auto; margin: 0; }
    }
  </style>
</head>
<body>

<div class="toolbar">
  <button class="btn-print" onclick="window.print()">Cetak / Unduh PDF</button>
</div>

<!-- ══════════════ HALAMAN 1: RINGKASAN EKSEKUTIF ══════════════ -->

<!-- Kop Surat -->
<div class="kop">
  <div class="brand">
    <div class="brand-logo">
      <svg viewBox="0 0 38 45" xmlns="http://www.w3.org/2000/svg">${LOGO_SVG_PATHS}</svg>
      <div class="brand-wordmark">
        <span class="gemi">gemi</span><span class="print">print</span>
      </div>
      <div class="brand-sub">${slogan}</div>
    </div>
  </div>
  <div class="brand-address">
    ${tokoAlamat ? `<span>${tokoAlamat}</span>` : ""}
    ${tokoTelepon ? `<span>Telp: ${tokoTelepon}</span>` : ""}
    ${tokoEmail ? `<span>${tokoEmail}</span>` : ""}
  </div>
</div>

<!-- Identitas Dokumen -->
<div class="doc-header">
  <div class="doc-title">Laporan Manajemen Bulanan</div>
  <div class="doc-periode">${esc(data.periode_label)}</div>
  <div class="doc-nomor">No. ${esc(data.nomor_laporan)}</div>
</div>

<!-- Kata Pembuka -->
<div class="paragraf">
${data.kata_pembuka
  .split("\n")
  .map((line) => (line.trim() ? `<p>${esc(line)}</p>` : "<p>&nbsp;</p>"))
  .join("")}
</div>

<!-- Ringkasan KPI -->
<div class="section-title">Ringkasan Kinerja</div>
<table class="ringkasan">
  <thead>
    <tr>
      <th class="no">No.</th>
      <th>Uraian</th>
      <th class="nilai">Nilai</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td class="no">1</td>
      <td>Omzet Penjualan</td>
      <td class="nilai">${rp(kpi.omzet)} <span style="font-weight:normal;font-size:8pt;color:#555">(${kpi.jumlah_faktur_penjualan} faktur)</span></td>
    </tr>
    <tr>
      <td class="no">2</td>
      <td>Harga Pokok Penjualan (HPP)</td>
      <td class="nilai">${rp(kpi.hpp)}</td>
    </tr>
    <tr>
      <td class="no">3</td>
      <td>Laba Kotor</td>
      <td class="nilai">${rp(kpi.laba_kotor)} <span style="font-weight:normal;font-size:8pt;color:#555">(${pct(kpi.margin_kotor_persen)})</span></td>
    </tr>
    <tr>
      <td class="no">4</td>
      <td>Biaya Operasional</td>
      <td class="nilai">${rp(kpi.biaya_operasional)}</td>
    </tr>
    <tr>
      <td class="no">5</td>
      <td>Total Gaji Dibayar</td>
      <td class="nilai">${rp(kpi.total_gaji)}</td>
    </tr>
    <tr class="row-laba">
      <td class="no">6</td>
      <td>Laba Bersih</td>
      <td class="nilai">${rp(kpi.laba_bersih)} <span style="font-weight:normal;font-size:8pt">(${pct(kpi.margin_bersih_persen)})</span></td>
    </tr>
    <tr>
      <td class="no">7</td>
      <td>Total Pembelian</td>
      <td class="nilai">${rp(kpi.total_pembelian)} <span style="font-weight:normal;font-size:8pt;color:#555">(${kpi.jumlah_po} pesanan)</span></td>
    </tr>
    <tr>
      <td class="no">8</td>
      <td>Nilai Inventori Akhir Periode</td>
      <td class="nilai">${rp(kpi.nilai_inventori)}</td>
    </tr>
  </tbody>
</table>

<!-- Hutang & Piutang -->
<div class="section-title">Posisi Hutang &amp; Piutang</div>
<table class="hutang-piutang">
  <thead>
    <tr>
      <th>Uraian</th>
      <th class="num">Jumlah Dokumen</th>
      <th class="num">Total Outstanding</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Piutang Pelanggan (belum lunas)</td>
      <td class="num">${hutang_piutang.jumlah_piutang} faktur</td>
      <td class="num">${rp(hutang_piutang.total_piutang)}</td>
    </tr>
    <tr>
      <td>Hutang Vendor (belum lunas)</td>
      <td class="num">${hutang_piutang.jumlah_hutang} tagihan</td>
      <td class="num">${rp(hutang_piutang.total_hutang)}</td>
    </tr>
  </tbody>
</table>

<!-- Kata Penutup -->
<div class="paragraf" style="margin-top:10px">
${data.kata_penutup
  .split("\n")
  .map((line) => (line.trim() ? `<p>${esc(line)}</p>` : "<p>&nbsp;</p>"))
  .join("")}
</div>

<!-- TTD -->
<div class="ttd-block">
  <div class="ttd-col">
    <div class="ttd-kota">${esc(kotaTanggal)}</div>
    <div class="ttd-jabatan">Direktur,</div>
    <div class="ttd-garis">${namaDirektur || "________________________"}</div>
  </div>
  <div class="ttd-col" style="text-align:right">
    <div class="ttd-kota">&nbsp;</div>
    <div class="ttd-jabatan">Manajer,</div>
    <div class="ttd-garis">${namaManajer || "________________________"}</div>
  </div>
</div>

<!-- ══════════════ HALAMAN 2+: RIWAYAT BUKU KAS ══════════════ -->
<div class="page-break">
  <div class="kas-header">
    <div class="kas-toko">${tokoNama} — Riwayat Buku Kas</div>
    <div class="kas-meta">
      Periode: ${esc(data.periode_label)}<br>
      No. Laporan: ${esc(data.nomor_laporan)}
    </div>
  </div>
  <table class="kas">
    <thead>
      <tr>
        <th>Tanggal</th>
        <th>Kategori</th>
        <th>Keterangan</th>
        <th class="num">Debit</th>
        <th class="num">Kredit</th>
        <th class="num">Saldo</th>
      </tr>
    </thead>
    <tbody>
      ${kasRows || '<tr><td colspan="6" style="text-align:center;color:#888;padding:12px">Tidak ada transaksi dalam periode ini.</td></tr>'}
      <tr class="row-saldo-akhir">
        <td colspan="5">SALDO AKHIR PERIODE</td>
        <td class="num">${rp(saldo_akhir)}</td>
      </tr>
    </tbody>
  </table>
</div>

</body>
</html>`;
}

/**
 * Buka popup window dan trigger print dialog.
 * Mengikuti pola yang sama dengan printFaktur di faktur-print.ts.
 */
export function printLaporanBulanan(html: string): boolean {
  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.addEventListener("load", () => {
      printWindow.print();
    });
    return true;
  }

  // Fallback: iframe tersembunyi
  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "Cetak laporan bulanan");
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none";
  document.body.appendChild(iframe);

  const frameWindow = iframe.contentWindow;
  if (!frameWindow) {
    document.body.removeChild(iframe);
    return false;
  }

  frameWindow.document.write(html);
  frameWindow.document.close();
  frameWindow.addEventListener("load", () => {
    frameWindow.print();
  });

  setTimeout(() => {
    if (iframe.parentNode) document.body.removeChild(iframe);
  }, 120_000);

  return true;
}
